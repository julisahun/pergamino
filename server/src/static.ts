/**
 * The static host — `server.py`, ported.
 *
 * Three pages and Vite's hashed `assets/`, and the same three kinds of caching
 * that file learned the hard way: assets are immutable (their names are
 * hashes), the pages are revalidated every time, and an error is never
 * storable — Cloudflare's browser-TTL override turned one 404 fetched mid-deploy
 * into four hours of blank page, because the browser was told to keep the miss.
 */
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import nodePath from 'node:path'

export const CACHE_FOREVER = 'public, max-age=31536000, immutable'
export const CACHE_REVALIDATE = 'no-cache'
export const CACHE_NEVER = 'no-store'

const PAGES: Record<string, string> = {
  '/': 'index.html',
  '/tv': 'tv.html',
  '/tv/': 'tv.html',
  '/pj': 'pj.html',
  '/pj/': 'pj.html',
}

/** A wrong MIME kills ES modules outright; the ones that matter are spelled out. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * URL path → a file under `dist/`, or null. Only the build is servable — the
 * pages and `assets/` — and dotfiles are invisible, so nothing outside can be
 * reached even by a path that resolves back inside.
 */
export function staticLookup(dist: string, urlPath: string): string | null {
  const page = PAGES[urlPath]
  if (page) return nodePath.join(dist, page)
  const parts = decodeURIComponent(urlPath).replace(/^\/+/, '').split('/')
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.'))) return null
  if (parts[0] !== 'assets') return null
  const resolved = nodePath.resolve(dist, ...parts)
  if (!resolved.startsWith(nodePath.resolve(dist) + nodePath.sep)) return null
  return resolved
}

export function sendBytes(
  res: ServerResponse,
  status: number,
  body: Buffer | string,
  type: string,
  cache: string,
  extra: Record<string, string> = {},
): void {
  const data = typeof body === 'string' ? Buffer.from(body) : body
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': data.length,
    'Cache-Control': cache,
    ...extra,
  })
  res.end(data)
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  sendBytes(res, status, JSON.stringify(body), 'application/json; charset=utf-8', CACHE_NEVER)
}

/** Serve a page or an asset; false when the path names neither. */
export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  dist: string,
  urlPath: string,
): boolean {
  const file = staticLookup(dist, urlPath)
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false
  const type = MIME[nodePath.extname(file).toLowerCase()] ?? 'application/octet-stream'
  const cache = urlPath.startsWith('/assets/') ? CACHE_FOREVER : CACHE_REVALIDATE
  const data = fs.readFileSync(file)
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': cache })
    res.end()
  } else {
    sendBytes(res, 200, data, type, cache)
  }
  return true
}
