#!/usr/bin/env python3
"""
server.py — a static file host for the built app. Stdlib only, no pip installs.

That is the entire job, and it is an adaptation of the one pergamino's `dm/`
already ran: same routing, same lookup, same refusals, pointed at Vite's
`dist/` instead of at hand-written ES modules.

The Node server this replaces owned every byte of the campaign. It read
`story/`, `monsters/`, `objects/` and `scenarios/`, and it wrote
`session.json`, `bitacora/` and `estado.md`. That was fine while the server
*was* the DM's own Mac. It is not fine hosted in public, which is where this
one lives — so the browser holds the folder now, and what is left here is a
claim worth stating plainly and worth keeping true:

    THERE IS NO ENDPOINT HERE THAT CAN READ OR WRITE A CAMPAIGN FILE.
    There is no endpoint here that receives one either.

The only routes are the two pages, the assets they import, and a ping used by
the deploy smoke test and by the duplicate-start check below.

  GET /            dist/index.html   (console)
  GET /tv          dist/tv.html      (table screen)
  GET /assets/…    the built JS and CSS
  GET /api/ping    {app, pid}

https matters for exactly one reason: the File System Access API needs a
secure context, which is why the Pi deployment fronts this with cloudflared.
A local run (http://127.0.0.1) is a secure context too, which is what makes
`npm run dev` and headless verification possible.

PORT comes from $DM_PORT (default 8085, matching `dm-app.service`).
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

PORT = int(os.environ.get('DM_PORT') or 8085)
HERE = Path(__file__).resolve().parent

# Where the built pages are. The deploy ships `dist/` next to this file; a
# local run picks up whatever `npm run build` last produced.
DIST = Path(os.environ.get('DM_DIST') or (HERE / 'dist')).resolve()

# Vite emits everything hashed under `assets/`. That is the whole servable
# surface: one folder of build output, and the two pages named explicitly.
SERVABLE = ('assets',)

# Caching, of which there are exactly three kinds here.
#
# Everything used to be `no-cache`, which was safe and wrong in one place: it
# applied to 404s too. Cloudflare fronts this with a 4-hour Browser Cache TTL
# that overrides the origin on static-extension URLs, so a 404 fetched while a
# deploy was swapping the tree came back to the browser as `max-age=14400` —
# and the page stayed blank for four hours after the deploy had finished,
# because the browser never asked again. `no-store` is the header that cannot
# be turned into that.
CACHE_FOREVER = 'public, max-age=31536000, immutable'
CACHE_REVALIDATE = 'no-cache'
CACHE_NEVER = 'no-store'

# A wrong MIME kills ES modules outright, and the platform's table cannot be
# trusted to know .mjs — so the ones that matter are spelled out.
MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
}


class Handler(BaseHTTPRequestHandler):
    server_version = 'pantalla-dm'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        # One line per request is noise while running a table; errors still
        # reach stderr through log_error, which does not go through here.
        pass

    # ---------------------------------------------------------------- send

    def send_bytes(self, data, ctype, status=200, cache=CACHE_REVALIDATE):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', cache)
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass                      # a window closed mid-response

    def send_json(self, obj, status=200, cache=CACHE_REVALIDATE):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_bytes(body, 'application/json; charset=utf-8', status, cache)

    def fail(self, status, msg):
        # Never cacheable. A 404 on a hashed asset is always a deploy caught
        # mid-swap, and storing one buries the page until it expires.
        self.send_json({'error': msg}, status, CACHE_NEVER)

    # -------------------------------------------------------------- lookup

    def static_lookup(self, urlpath):
        """URL path -> a file under dist/, or None. Only the build itself is
        servable — assets/ plus the two pages — and dotfiles are invisible, so
        nothing outside those folders can be reached even by a path that
        resolves back inside them."""
        if urlpath == '/':
            return DIST / 'index.html'
        if urlpath in ('/tv', '/tv/'):
            return DIST / 'tv.html'
        rel = urllib.parse.unquote(urlpath).lstrip('/')
        parts = rel.split('/')
        if any(p in ('', '.', '..') or p.startswith('.') for p in parts):
            return None
        if parts[0] not in SERVABLE:
            return None
        path = DIST.joinpath(*parts)
        try:
            path = path.resolve()
            path.relative_to(DIST)
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
        # `/assets/…` is content-hashed by Vite, so a name never changes
        # meaning; the two pages must be re-read to learn the new names.
        cache = CACHE_FOREVER if path.startswith('/assets/') else CACHE_REVALIDATE
        self.send_bytes(data, ctype, cache=cache)

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
    if not (DIST / 'index.html').is_file():
        print('No hay build en %s — ejecuta `npm run build` primero.' % DIST)
        return 1
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
