/**
 * The live channel. One socket per window or phone; the first message says
 * who it is, and from then on it receives whatever its role may see and may
 * send actions its role may take.
 *
 * Text frames only. Portraits go over HTTP with an ETag, which the browser
 * caches for free and which nothing here has to frame.
 */
import type { IncomingMessage, Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Actor, ClientMsg, ServerMsg } from '../../shared/protocol.ts'
import { tokenMatches } from './auth.ts'
import type { CampaignSession, Subscriber } from './campaign.ts'
import { HttpError } from './errors.ts'
import type { ServerContext } from './http.ts'

const HELLO_TIMEOUT_MS = 5_000
/** Cloudflare closes an idle WebSocket at 100 s; both sides ping well inside that. */
const PING_MS = 30_000

interface Live extends WebSocket {
  alive?: boolean
}

export function attachWs(server: Server, ctx: ServerContext): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: Live, _req: IncomingMessage) => {
    ws.alive = true
    ws.on('pong', () => {
      ws.alive = true
    })
    let unsubscribe: (() => void) | null = null
    let session: CampaignSession | null = null
    let actor: Actor | null = null

    const send = (msg: ServerMsg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
    }
    const fail = (message: string, code = 4400) => {
      send({ type: 'error', message })
      ws.close(code, message.slice(0, 120))
    }

    const helloTimer = setTimeout(() => fail('Sin saludo', 4408), HELLO_TIMEOUT_MS)

    ws.on('message', (raw) => {
      let msg: ClientMsg
      try {
        msg = JSON.parse(raw.toString()) as ClientMsg
      } catch {
        fail('Mensaje ilegible')
        return
      }

      if (msg.type === 'hello') {
        clearTimeout(helloTimer)
        if (session) {
          fail('Ya saludaste')
          return
        }
        const sub = resolveHello(ctx, msg)
        if (!sub) {
          fail('Sin autorizar', 4401)
          return
        }
        session = sub.session
        actor = sub.actor
        const subscriber: Subscriber = { role: sub.role, pcId: sub.pcId, send }
        unsubscribe = session.subscribe(subscriber)
        send({ type: 'welcome', role: sub.role, campaign: session.id, rev: session.rev })
        // A reconnect that missed nothing gets the welcome and no more.
        if (msg.since !== session.rev) {
          send(session.partyMessage(sub.role))
          const snap = session.snapshot(subscriber)
          if (snap) send(snap)
        }
        return
      }

      if (!session || !actor) {
        fail('Saluda primero')
        return
      }

      if (msg.type === 'ping') {
        send({ type: 'pong' })
        return
      }

      if (msg.type === 'action') {
        try {
          const result = session.dispatch(msg.action, actor, msg.expectRev)
          send({ type: 'ack', id: msg.id, rev: result.rev, changed: result.changed })
        } catch (err) {
          if (err instanceof HttpError) {
            send({ type: 'reject', id: msg.id, code: err.code, reason: err.message })
          } else {
            console.error('[ws] dispatch failed:', err)
            send({ type: 'reject', id: msg.id, code: 'bad-request', reason: 'Error del servidor' })
          }
        }
      }
    })

    ws.on('close', () => {
      clearTimeout(helloTimer)
      unsubscribe?.()
    })
    ws.on('error', () => ws.terminate())
  })

  const heartbeat = setInterval(() => {
    for (const client of wss.clients as Set<Live>) {
      if (client.alive === false) {
        client.terminate()
        continue
      }
      client.alive = false
      client.ping()
    }
  }, PING_MS)
  wss.on('close', () => clearInterval(heartbeat))

  return wss
}

interface Resolved {
  session: CampaignSession
  role: 'dm' | 'pc' | 'tv'
  pcId?: string
  actor: Actor
}

/** Who a hello is from, or null when its credentials do not hold up. */
function resolveHello(ctx: ServerContext, hello: ClientMsg & { type: 'hello' }): Resolved | null {
  if (hello.role === 'dm') {
    if (!tokenMatches(hello.token, ctx.env.token)) return null
    const session = ctx.registry.get(hello.campaign)
    return session ? { session, role: 'dm', actor: { kind: 'dm' } } : null
  }
  const session = ctx.registry.byLink(hello.link)
  if (!session) return null
  if (hello.role === 'tv') {
    // The television may look and never act; a `tv` actor that cannot dispatch
    // is spelled as a player with no character.
    return { session, role: 'tv', actor: { kind: 'pc', pcId: '' } }
  }
  if (!session.hasCharacter(hello.pc)) return null
  return { session, role: 'pc', pcId: hello.pc, actor: { kind: 'pc', pcId: hello.pc } }
}
