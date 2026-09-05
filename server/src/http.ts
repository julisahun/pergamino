/**
 * The REST surface, on `node:http`. Fifteen-odd routes do not need a
 * framework, and a 2 GB Pi is grateful for the absence of one.
 *
 * Auth is by prefix: `/api/dm/*` wants the DM's bearer token, `/api/pj/:link/*`
 * is what a player's link opens, `/api/ping` is public. Every JSON answer is
 * `no-store`; a portrait carries an ETag and is the one thing a browser may
 * keep. A legitimate "not yet" — a campaign not registered — is a 200 with
 * `exists: false`, never a 4xx: the e2e harness fails on any error status.
 */
import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ActionRequest, PrepBody, RegisterBody } from '../../shared/protocol.ts'
import { revealFor } from '../../shared/session/project.ts'
import { bearer, tokenMatches } from './auth.ts'
import { linkUrl, type CampaignSession } from './campaign.ts'
import type { Env } from './env.ts'
import { HttpError, badRequest, notFound, unauthorized } from './errors.ts'
import type { Registry } from './registry.ts'
import { CACHE_NEVER, sendBytes, sendJson, serveStatic } from './static.ts'
import type { Store } from './store.ts'

export interface ServerContext {
  env: Env
  registry: Registry
  store: Store
  version: string
}

const LIMIT_JSON = 8 * 1024 * 1024
const LIMIT_XML = 1024 * 1024
const LIMIT_IMAGE = 2 * 1024 * 1024

type Params = Record<string, string>
type Handler = (req: IncomingMessage, res: ServerResponse, params: Params, url: URL) => Promise<void> | void

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const source = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1))
        return '([^/]+)'
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^${source}/?$`), keys }
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(badRequest('Demasiado grande'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req, LIMIT_JSON)
  try {
    return JSON.parse(raw.toString('utf8')) as T
  } catch {
    throw badRequest('JSON ilegible')
  }
}

const etagOf = (bytes: Uint8Array): string => `"${createHash('sha1').update(bytes).digest('hex')}"`

function sendPortrait(
  req: IncomingMessage,
  res: ServerResponse,
  portrait: { mime: string; bytes: Uint8Array; etag: string } | null,
): void {
  if (!portrait) throw notFound('Sin retrato')
  if (req.headers['if-none-match'] === portrait.etag) {
    res.writeHead(304, { ETag: portrait.etag, 'Cache-Control': 'private, max-age=86400' })
    res.end()
    return
  }
  sendBytes(res, 200, Buffer.from(portrait.bytes), portrait.mime, 'private, max-age=86400', {
    ETag: portrait.etag,
  })
}

const imageType = (req: IncomingMessage): string => {
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim()
  if (!/^image\/[a-z0-9.+-]+$/i.test(type)) throw badRequest('Eso no es una imagen')
  return type
}

export function createHandler(ctx: ServerContext): (req: IncomingMessage, res: ServerResponse) => void {
  const routes: Route[] = []
  const route = (method: string, path: string, handler: Handler) => {
    routes.push({ method, ...compile(path), handler })
  }

  const requireDm = (req: IncomingMessage): void => {
    if (!tokenMatches(bearer(req), ctx.env.token)) throw unauthorized()
  }
  const campaignOf = (params: Params): CampaignSession => {
    const session = ctx.registry.get(params.id!)
    if (!session) throw notFound('Esa campaña no está en el servidor')
    return session
  }
  const linkOf = (params: Params): CampaignSession => {
    const session = ctx.registry.byLink(params.link!)
    if (!session) throw notFound('Ese enlace no vale')
    return session
  }
  const characterOf = (session: CampaignSession, pc: string): string => {
    if (!session.hasCharacter(pc)) throw notFound('Ese personaje no está en la campaña')
    return pc
  }

  // --- public -----------------------------------------------------------------
  route('GET', '/api/ping', (_req, res) => {
    sendJson(res, 200, { app: 'dnd-dm', pid: process.pid, version: ctx.version })
  })

  // --- the DM -----------------------------------------------------------------
  route('GET', '/api/dm/whoami', (req, res) => {
    requireDm(req)
    sendJson(res, 200, { ok: true })
  })
  route('GET', '/api/dm/campaigns', (req, res) => {
    requireDm(req)
    sendJson(res, 200, ctx.registry.list().map((s) => s.summary(ctx.env.publicUrl)))
  })
  route('POST', '/api/dm/campaigns', async (req, res) => {
    requireDm(req)
    const body = await readJson<RegisterBody>(req)
    const session = ctx.registry.register(String(body.title ?? '').trim())
    sendJson(res, 201, { id: session.id, link: session.link, url: linkUrl(ctx.env.publicUrl, session.link) })
  })
  route('PUT', '/api/dm/campaigns/:id', async (req, res, params) => {
    requireDm(req)
    const body = await readJson<RegisterBody>(req)
    const session = ctx.registry.register(String(body.title ?? '').trim(), params.id!)
    sendJson(res, 200, { id: session.id, link: session.link, url: linkUrl(ctx.env.publicUrl, session.link) })
  })
  route('GET', '/api/dm/campaigns/:id', (req, res, params) => {
    requireDm(req)
    const session = ctx.registry.get(params.id!)
    sendJson(res, 200, session ? session.summary(ctx.env.publicUrl) : { exists: false })
  })
  route('DELETE', '/api/dm/campaigns/:id', (req, res, params) => {
    requireDm(req)
    // Idempotent: deleting what is not there is the state that was asked for.
    ctx.registry.delete(params.id!)
    res.writeHead(204, { 'Cache-Control': CACHE_NEVER })
    res.end()
  })
  route('PUT', '/api/dm/campaigns/:id/prep', async (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    const body = await readJson<PrepBody>(req)
    if (!Array.isArray(body.pnjs) || !Array.isArray(body.objects) || !Array.isArray(body.scenes)) {
      throw badRequest('La preparación viene incompleta')
    }
    sendJson(res, 200, { rev: session.setPrep(body) })
  })
  route('PUT', '/api/dm/campaigns/:id/portrait/pnj/:pnj', async (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    const mime = imageType(req)
    const bytes = await readBody(req, LIMIT_IMAGE)
    ctx.store.setPnjPortrait(session.id, params.pnj!, { mime, bytes, etag: etagOf(bytes) })
    res.writeHead(204, { 'Cache-Control': CACHE_NEVER })
    res.end()
  })
  route('GET', '/api/dm/campaigns/:id/party', (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    sendJson(res, 200, { characters: session.characters, sheets: Object.fromEntries(session.sheets) })
  })
  route('POST', '/api/dm/campaigns/:id/characters', async (req, res, params, url) => {
    requireDm(req)
    const session = campaignOf(params)
    const xml = (await readBody(req, LIMIT_XML)).toString('utf8')
    sendJson(res, 201, session.addCharacter(xml, url.searchParams.get('player') ?? ''))
  })
  route('PUT', '/api/dm/campaigns/:id/characters/:pc/sheet', async (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    const xml = (await readBody(req, LIMIT_XML)).toString('utf8')
    sendJson(res, 200, { rev: session.replaceSheet(characterOf(session, params.pc!), xml) })
  })
  route('PUT', '/api/dm/campaigns/:id/characters/:pc/portrait', async (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    const mime = imageType(req)
    const bytes = await readBody(req, LIMIT_IMAGE)
    sendJson(res, 200, { rev: session.setPortrait(characterOf(session, params.pc!), mime, bytes) })
  })
  route('DELETE', '/api/dm/campaigns/:id/characters/:pc', (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    session.removeCharacter(characterOf(session, params.pc!))
    res.writeHead(204, { 'Cache-Control': CACHE_NEVER })
    res.end()
  })
  route('POST', '/api/dm/campaigns/:id/link/rotate', (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    const link = session.rotateLink()
    sendJson(res, 200, { link, url: linkUrl(ctx.env.publicUrl, link) })
  })
  route('GET', '/api/dm/campaigns/:id/state', (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    sendJson(res, 200, { rev: session.rev, state: session.state })
  })
  route('POST', '/api/dm/campaigns/:id/actions', async (req, res, params) => {
    requireDm(req)
    const session = campaignOf(params)
    const body = await readJson<ActionRequest>(req)
    if (!body.action || typeof body.action !== 'object') throw badRequest('Sin acción')
    sendJson(res, 200, session.dispatch(body.action, { kind: 'dm' }, body.expectRev))
  })
  route('POST', '/api/dm/campaigns/:id/reset', (req, res, params) => {
    requireDm(req)
    sendJson(res, 200, { rev: campaignOf(params).reset() })
  })
  route('GET', '/api/dm/campaigns/:id/log', (req, res, params, url) => {
    requireDm(req)
    const session = campaignOf(params)
    const since = Number(url.searchParams.get('since') ?? 0) || 0
    sendJson(res, 200, { entries: ctx.store.log(session.id, since) })
  })

  // --- a player's link --------------------------------------------------------
  route('GET', '/api/pj/:link', (_req, res, params) => {
    sendJson(res, 200, linkOf(params).public())
  })
  route('POST', '/api/pj/:link/characters', async (req, res, params, url) => {
    const session = linkOf(params)
    const xml = (await readBody(req, LIMIT_XML)).toString('utf8')
    sendJson(res, 201, session.addCharacter(xml, url.searchParams.get('player') ?? ''))
  })
  route('PUT', '/api/pj/:link/characters/:pc/sheet', async (req, res, params) => {
    const session = linkOf(params)
    const xml = (await readBody(req, LIMIT_XML)).toString('utf8')
    sendJson(res, 200, { rev: session.replaceSheet(characterOf(session, params.pc!), xml) })
  })
  route('PUT', '/api/pj/:link/characters/:pc/portrait', async (req, res, params) => {
    const session = linkOf(params)
    const mime = imageType(req)
    const bytes = await readBody(req, LIMIT_IMAGE)
    sendJson(res, 200, { rev: session.setPortrait(characterOf(session, params.pc!), mime, bytes) })
  })
  route('GET', '/api/pj/:link/characters/:pc', (_req, res, params) => {
    const session = linkOf(params)
    const view = session.playerView(characterOf(session, params.pc!))
    if (!view) throw notFound('Ese personaje no está sentado')
    sendJson(res, 200, { rev: session.rev, view })
  })
  route('POST', '/api/pj/:link/characters/:pc/actions', async (req, res, params) => {
    const session = linkOf(params)
    const pcId = characterOf(session, params.pc!)
    const body = await readJson<ActionRequest>(req)
    if (!body.action || typeof body.action !== 'object') throw badRequest('Sin acción')
    sendJson(res, 200, session.dispatch(body.action, { kind: 'pc', pcId }, body.expectRev))
  })
  route('GET', '/api/pj/:link/portrait/pc/:pc', (req, res, params) => {
    const session = linkOf(params)
    const row = ctx.store.character(characterOf(session, params.pc!))
    const portrait =
      row?.portrait && row.portrait_mime
        ? { mime: row.portrait_mime, bytes: row.portrait, etag: etagOf(row.portrait) }
        : null
    sendPortrait(req, res, portrait)
  })
  // An NPC's portrait, only while the table can see that NPC — the same line
  // `projectTable` draws, asked of the bytes.
  route('GET', '/api/pj/:link/portrait/npc/:npc', (req, res, params) => {
    const session = linkOf(params)
    const npc = session.state.npcs.find((n) => n.id === params.npc)
    if (!npc || !revealFor(session.state, `npc:${npc.id}`).on) throw notFound('Sin retrato')
    const pnj = session.prep.pnjs.find((p) => p.file === npc.file || p.id === npc.id)
    const portrait = pnj ? (ctx.store.pnjPortrait(session.id, pnj.id) ?? null) : null
    sendPortrait(req, res, portrait)
  })

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const method = req.method ?? 'GET'
    const run = async () => {
      if (url.pathname.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== method) continue
          const m = r.pattern.exec(url.pathname)
          if (!m) continue
          const params: Params = {}
          r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)))
          await r.handler(req, res, params, url)
          return
        }
        throw notFound('no such endpoint')
      }
      if ((method === 'GET' || method === 'HEAD') && serveStatic(req, res, ctx.env.dist, url.pathname)) {
        return
      }
      throw notFound('not found')
    }
    run().catch((err: unknown) => {
      if (res.headersSent) {
        res.end()
        return
      }
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message, code: err.code })
      } else {
        console.error(`[http] ${method} ${url.pathname}:`, err)
        sendJson(res, 500, { error: 'Error del servidor', code: 'bad-request' })
      }
    })
  }
}
