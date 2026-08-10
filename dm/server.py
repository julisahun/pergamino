#!/usr/bin/env python3
"""
dm/server.py — the relay for the DM toolkit. Stdlib only, no pip installs.

Campaign files never pass through here: the admin page holds a File System
Access grant on the campaign folder and reads/writes it directly in the
browser. What is left for a server is only what one browser on one device
cannot do alone — hand the pages to any device on the network, and carry the
live board from the admin window to the televisions:

  static   /               dm/index.html (admin)
           /tv             dm/tv.html (television — any device on the LAN)
           /src /vendor    dm's modules
  api      GET  /api/ping                        {app, pid, lanUrl}
           POST /api/board {origin,room,board}   store + broadcast to the room;
                                                 replies with referenced asset
                                                 hashes not held
           POST /api/move  {origin,room,ref,x,y} broadcast to the room (TV → admin)
           GET  /api/events?role=&client=&room=  SSE stream, one room
           PUT  /api/asset/<sha256>              ephemeral upload (hash-verified)
           GET  /api/asset/<sha256>              serve it (Range for TV audio)

Simultaneous tables are partitioned into ROOMS: a room is a 6-char code the
admin mints per campaign (stored as .dm-room in the campaign folder) and the
television joins via ?room= or its code screen. Rooms exist implicitly on
first use, live in RAM, and are LRU-pruned once nobody is connected. The
asset cache is deliberately NOT per-room — content addressing means rooms
cannot collide, and shared bytes dedup.

The asset cache is RAM only, content-addressed and LRU-capped: the admin
uploads exactly what the current board references (a map, two audio layers,
some portraits) so the television can fetch them — nothing is ever written
to disk, and a restart simply empties it (the admin re-uploads on the next
board push, told what is missing by the POST /api/board reply).

Starting it twice is safe: a second start pings the first, opens a browser
tab against it, and exits. PORT comes from $DM_PORT (default 8420).
"""

import hashlib
import json
import mimetypes
import os
import re
import socket
import sys
import threading
import time
import queue
import urllib.parse
import urllib.request
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get('DM_PORT') or 8420)
HERE = Path(__file__).resolve().parent          # dm/

JSON_LIMIT = 10 * 1024 * 1024
ASSET_LIMIT = 50 * 1024 * 1024                  # per file
ASSET_CACHE_MAX = 128 * 1024 * 1024             # whole cache, LRU-evicted

ASSET_HASH = re.compile(r'^[0-9a-f]{64}$')
# The unambiguous alphabet the admin mints codes from: no 0/O/1/I/L.
ROOM_CODE = re.compile(r'^[A-HJ-NP-Z2-9]{6}$')
MAX_IDLE_ROOMS = 64

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',   # a wrong MIME kills ES modules
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
}


# ---------------------------------------------------------------- SSE relay

class Relay:
    """Room registry + per-room broadcast: one room per table, many tables.
    Rooms exist implicitly (the first join or board post creates one) and
    hold only a client list and the latest board — small enough that pruning
    is an abuse cap, not a memory need: once a room has no connected clients
    it is LRU-evictable, and only the newest MAX_IDLE_ROOMS such rooms keep
    their boards."""

    def __init__(self):
        self.lock = threading.Lock()
        self.rooms = {}   # code -> {'clients': {cid: {queue, role}}, 'board': ..., 'active': ts}

    def _room(self, code):
        """Get-or-create; lock held by the caller."""
        room = self.rooms.get(code)
        if room is None:
            room = self.rooms[code] = {'clients': {}, 'board': None, 'active': 0}
            idle = sorted((c for c, r in self.rooms.items() if not r['clients']),
                          key=lambda c: self.rooms[c]['active'])
            for stale in idle[:max(0, len(idle) - MAX_IDLE_ROOMS)]:
                del self.rooms[stale]
        room['active'] = time.time()
        return room

    def add(self, code, cid, role):
        q = queue.Queue()
        with self.lock:
            self._room(code)['clients'][cid] = {'queue': q, 'role': role}
        self.broadcast(code, 'clients', {'admins': self.admins(code)}, origin=None)
        return q

    def remove(self, code, cid):
        with self.lock:
            room = self.rooms.get(code)
            if room:
                room['clients'].pop(cid, None)
        self.broadcast(code, 'clients', {'admins': self.admins(code)}, origin=None)

    def admins(self, code):
        with self.lock:
            room = self.rooms.get(code)
            return sum(1 for c in room['clients'].values() if c['role'] == 'admin') if room else 0

    def board(self, code):
        with self.lock:
            room = self.rooms.get(code)
            return room['board'] if room else None

    def set_board(self, code, board):
        with self.lock:
            self._room(code)['board'] = board

    def broadcast(self, code, event, data, origin):
        payload = dict(data)
        payload['origin'] = origin
        msg = (event, json.dumps(payload, ensure_ascii=False))
        with self.lock:
            room = self.rooms.get(code)
            targets = list(room['clients'].values()) if room else []
        for c in targets:
            c['queue'].put(msg)


RELAY = Relay()


# ------------------------------------------------------------- asset cache

class AssetCache:
    """Content-addressed bytes in RAM. The address IS the sha-256, verified
    on upload, so a client can only ever store what the hash already names —
    no poisoning someone else's URL. LRU keeps the total under the cap."""

    def __init__(self, cap):
        self.cap = cap
        self.lock = threading.Lock()
        self.entries = OrderedDict()   # hash -> (bytes, ctype)
        self.total = 0

    def put(self, digest, body, ctype):
        with self.lock:
            if digest in self.entries:
                self.entries.move_to_end(digest)
                return
            self.entries[digest] = (body, ctype)
            self.total += len(body)
            while self.total > self.cap and len(self.entries) > 1:
                _, (old, _ctype) = self.entries.popitem(last=False)
                self.total -= len(old)

    def get(self, digest):
        with self.lock:
            entry = self.entries.get(digest)
            if entry:
                self.entries.move_to_end(digest)
            return entry

    def missing(self, digests):
        with self.lock:
            return sorted(d for d in digests if d not in self.entries)


ASSETS = AssetCache(ASSET_CACHE_MAX)


# ---------------------------------------------------------------- helpers

def lan_ip():
    """Best-guess LAN address via the UDP-connect trick; no packet is sent."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'dnd-dm'

    # quiet the per-request stderr line; errors still surface
    def log_message(self, fmt, *args):
        pass

    # ------------------------------------------------------------ plumbing

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def fail(self, status, message):
        self.send_json({'error': message}, status)

    def read_body(self, limit):
        length = int(self.headers.get('Content-Length') or 0)
        if length > limit:
            return None
        return self.rfile.read(length)

    def json_body(self, limit=1024 * 1024):
        raw = self.read_body(limit)
        if raw is None:
            return None
        try:
            return json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return None

    # ------------------------------------------------------------- bytes

    def serve_bytes(self, data, ctype):
        """One buffer, with single-range support: smart-TV browsers stream
        <audio> with Range requests and some refuse to loop/seek without."""
        m = re.match(r'bytes=(\d*)-(\d*)$', self.headers.get('Range') or '')
        if m and (m.group(1) or m.group(2)):
            start = int(m.group(1) or 0)
            end = int(m.group(2)) if m.group(2) else len(data) - 1
            end = min(end, len(data) - 1)
            if start > end:
                return self.fail(416, 'bad range')
            chunk = data[start:end + 1]
            self.send_response(206)
            self.send_header('Content-Type', ctype)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Range',
                             'bytes %d-%d/%d' % (start, end, len(data)))
            self.send_header('Content-Length', str(len(chunk)))
            self.end_headers()
            self.wfile.write(chunk)
            return
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    def serve_file(self, path):
        try:
            data = path.read_bytes()
        except OSError:
            return self.fail(404, 'not found')
        ctype = MIME.get(path.suffix.lower()) \
            or mimetypes.guess_type(path.name)[0] \
            or 'application/octet-stream'
        self.serve_bytes(data, ctype)

    def static_lookup(self, urlpath):
        """URL path -> file under dm/, or None. Only the app itself is
        servable — src/ and vendor/ — and dotfiles are invisible."""
        if urlpath == '/':
            return HERE / 'index.html'
        if urlpath == '/tv':
            return HERE / 'tv.html'
        rel = urllib.parse.unquote(urlpath).lstrip('/')
        parts = rel.split('/')
        if any(p in ('', '.', '..') or p.startswith('.') for p in parts):
            return None
        if parts[0] not in ('src', 'vendor'):
            return None
        path = HERE.joinpath(*parts)
        try:
            path = path.resolve()
            path.relative_to(HERE)
        except (OSError, ValueError):
            return None
        return path if path.is_file() else None

    # ------------------------------------------------------------ SSE

    def serve_events(self, query):
        params = urllib.parse.parse_qs(query)
        role = (params.get('role') or ['tv'])[0]
        cid = (params.get('client') or ['anon-%d' % time.monotonic_ns()])[0]
        room = (params.get('room') or [''])[0].upper()
        if not ROOM_CODE.match(room):
            return self.fail(400, 'bad or missing room')
        q = RELAY.add(room, cid, role)
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            hello = json.dumps({'board': RELAY.board(room),
                                'admins': RELAY.admins(room)}, ensure_ascii=False)
            self.wfile.write(('event: hello\ndata: %s\n\n' % hello).encode('utf-8'))
            self.wfile.flush()
            while True:
                try:
                    event, data = q.get(timeout=15)
                    self.wfile.write(('event: %s\ndata: %s\n\n'
                                      % (event, data)).encode('utf-8'))
                except queue.Empty:
                    self.wfile.write(b': ping\n\n')
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            RELAY.remove(room, cid)

    # ------------------------------------------------------------ routing

    def asset_route(self):
        m = re.match(r'^/api/asset/([0-9a-f]{64})$',
                     urllib.parse.urlsplit(self.path).path)
        return m.group(1) if m else None

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path, query = parsed.path, parsed.query
        if path == '/api/ping':
            return self.send_json({'app': 'dnd-dm', 'pid': os.getpid(),
                                   'lanUrl': 'http://%s:%d' % (lan_ip(), PORT)})
        if path == '/api/events':
            return self.serve_events(query)
        digest = self.asset_route()
        if digest:
            entry = ASSETS.get(digest)
            if not entry:
                return self.fail(404, 'no such asset')
            return self.serve_bytes(entry[0], entry[1])
        if path.startswith('/api/'):
            return self.fail(404, 'no such endpoint')
        f = self.static_lookup(path)
        if f is None:
            return self.fail(404, 'not found')
        self.serve_file(f)

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == '/api/board':
            body = self.json_body(limit=JSON_LIMIT)
            if not body or 'board' not in body:
                return self.fail(400, 'bad payload')
            room = str(body.get('room') or '').upper()
            if not ROOM_CODE.match(room):
                return self.fail(400, 'bad or missing room')
            board_json = json.dumps(body['board'], ensure_ascii=False)
            RELAY.set_board(room, body['board'])
            RELAY.broadcast(room, 'board', {'board': body['board']},
                            origin=body.get('origin'))
            # Which referenced assets this relay does not hold (restarted, or
            # evicted) — the admin re-uploads and re-posts on its own.
            refs = set(re.findall(r'/api/asset/([0-9a-f]{64})', board_json))
            return self.send_json({'ok': True, 'missing': ASSETS.missing(refs)})
        if path == '/api/move':
            body = self.json_body()
            if not body or 'ref' not in body:
                return self.fail(400, 'bad payload')
            room = str(body.get('room') or '').upper()
            if not ROOM_CODE.match(room):
                return self.fail(400, 'bad or missing room')
            RELAY.broadcast(room, 'move', {'ref': body['ref'],
                                           'x': body.get('x'), 'y': body.get('y'),
                                           'done': bool(body.get('done'))},
                            origin=body.get('origin'))
            return self.send_json({'ok': True})
        self.fail(404, 'no such endpoint')

    def do_PUT(self):
        digest = self.asset_route()
        if not digest:
            # The body was never read: reusing this keep-alive connection
            # would parse it as the next request. Close instead.
            self.close_connection = True
            return self.fail(404, 'no such endpoint')
        body = self.read_body(ASSET_LIMIT)
        if body is None:
            self.close_connection = True
            return self.fail(413, 'asset too large')
        if hashlib.sha256(body).hexdigest() != digest:
            return self.fail(400, 'hash mismatch')
        ctype = self.headers.get('Content-Type') or 'application/octet-stream'
        ASSETS.put(digest, body, ctype)
        self.send_json({'ok': True})


# ---------------------------------------------------------------- startup

def already_running():
    try:
        with urllib.request.urlopen(
                'http://127.0.0.1:%d/api/ping' % PORT, timeout=1) as r:
            return json.load(r).get('app') == 'dnd-dm'
    except OSError:
        return False


def main():
    if already_running():
        print('dnd-dm already serving on port %d — opening a tab.' % PORT)
        if '--no-browser' not in sys.argv:
            import webbrowser
            webbrowser.open('http://127.0.0.1:%d/' % PORT)
        return 0
    try:
        server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    except OSError as e:
        print('Port %d is taken by another program (%s).\n'
              'Close it or change $DM_PORT.' % (PORT, e))
        return 1
    server.daemon_threads = True
    print('DM:  http://127.0.0.1:%d/' % PORT)
    print('TV:  http://%s:%d/tv   (any device on this wifi)' % (lan_ip(), PORT))
    if '--no-browser' not in sys.argv:
        import webbrowser
        threading.Timer(0.3, webbrowser.open,
                        ['http://127.0.0.1:%d/' % PORT]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')
    return 0


if __name__ == '__main__':
    sys.exit(main())
