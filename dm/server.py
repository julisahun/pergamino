#!/usr/bin/env python3
"""
dm2/server.py — a static file host. Stdlib only, no pip installs.

That is the entire job. The previous server was also a relay: it carried the
board from the admin window to the televisions over SSE and held an ephemeral
asset cache they fetched pictures and audio from. The television is now a
second window on the same machine, so the two talk over a BroadcastChannel —
same origin, no network hop — and every byte of a campaign stays inside the
browser that holds the folder grant.

What that buys is a claim worth stating plainly, and worth keeping true:

    THERE IS NO ENDPOINT HERE THAT CAN READ OR WRITE A CAMPAIGN FILE.
    There is no endpoint here that receives one either.

The only routes are the two pages, the modules they import, and a ping used
by the deploy smoke test and by the duplicate-start check below.

  GET /            index.html   (admin)
  GET /tv          tv.html      (television)
  GET /src/… /vendor/…          the app's own modules and styles
  GET /api/ping    {app, pid}

Started with --dev it also serves /probes/…, the headless verification pages.
They import the real modules and drive them; they are not part of the app and
the deployed tree does not contain them.

https matters for exactly one reason: the File System Access API needs a
secure context, which is why the Pi deployment fronts this with cloudflared.
A local run (http://127.0.0.1) is a secure context too, which is what makes
dev and headless verification possible.

PORT comes from $DM_PORT (default 8421 — the old app keeps 8420 until the
rebuild takes its place).
"""

import json
import mimetypes
import os
import sys
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get('DM_PORT') or 8421)
HERE = Path(__file__).resolve().parent

# Probe pages are servable only when asked for: production has no reason to
# hand out a page whose whole job is to drive the app's internals.
DEV = '--dev' in sys.argv
SERVABLE = ('src', 'vendor', 'probes') if DEV else ('src', 'vendor')

# A wrong MIME kills ES modules outright, and the platform's table cannot be
# trusted to know .mjs — so the ones that matter are spelled out.
MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
}


class Handler(BaseHTTPRequestHandler):
    server_version = 'dm2'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        # One line per request is noise while running a table; errors still
        # reach stderr through log_error, which does not go through here.
        pass

    # ---------------------------------------------------------------- send

    def send_bytes(self, data, ctype, status=200):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass                      # a window closed mid-response

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_bytes(body, 'application/json; charset=utf-8', status)

    def fail(self, status, msg):
        self.send_json({'error': msg}, status)

    # -------------------------------------------------------------- lookup

    def static_lookup(self, urlpath):
        """URL path -> a file under dm2/, or None. Only the app itself is
        servable — src/ and vendor/, plus probes/ under --dev — and dotfiles
        are invisible, so nothing outside those folders can be reached even by
        a path that resolves back inside them."""
        if urlpath == '/':
            return HERE / 'index.html'
        if urlpath == '/tv':
            return HERE / 'tv.html'
        rel = urllib.parse.unquote(urlpath).lstrip('/')
        parts = rel.split('/')
        if any(p in ('', '.', '..') or p.startswith('.') for p in parts):
            return None
        if parts[0] not in SERVABLE:
            return None
        path = HERE.joinpath(*parts)
        try:
            path = path.resolve()
            path.relative_to(HERE)
        except (OSError, ValueError):
            return None
        return path if path.is_file() else None

    # ------------------------------------------------------------- routing

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == '/api/ping':
            return self.send_json({'app': 'dnd-dm', 'pid': os.getpid()})
        if path.startswith('/api/'):
            return self.fail(404, 'no such endpoint')
        f = self.static_lookup(path)
        if f is None:
            return self.fail(404, 'not found')
        try:
            data = f.read_bytes()
        except OSError:
            return self.fail(404, 'not found')
        ctype = (MIME.get(f.suffix.lower())
                 or mimetypes.guess_type(f.name)[0]
                 or 'application/octet-stream')
        self.send_bytes(data, ctype)

    def do_HEAD(self):
        self.do_GET()

    # There is deliberately no do_POST and no do_PUT. Nothing is sent here.


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
    if DEV:
        print('dev: /probes/ is being served')
    print('TV:  http://127.0.0.1:%d/tv   (a second window on THIS machine)' % PORT)
    if '--no-browser' not in sys.argv:
        import webbrowser
        threading.Timer(0.3, webbrowser.open, ['http://127.0.0.1:%d/' % PORT]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')
    return 0


if __name__ == '__main__':
    sys.exit(main())
