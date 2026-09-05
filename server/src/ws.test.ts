/**
 * Two sockets on one campaign: what each hears when the other acts.
 */
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts'
import { readEnv } from './env.ts'
import { createHandler } from './http.ts'
import { memoryWorld, TOLMO } from './fixtures.ts'
import { attachWs } from './ws.ts'

const TOKEN = 't'
let server: Server
let wsUrl: string
let campaign: string
let link: string
let pc: string

beforeAll(async () => {
  const env = readEnv({ DM_TOKEN: TOKEN, DM_DB: ':memory:', DM_DIST: '/nonexistent' })
  const world = memoryWorld()
  const ctx = { env, ...world, version: 'test' }
  server = createServer(createHandler(ctx))
  attachWs(server, ctx)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  wsUrl = `ws://127.0.0.1:${port}/ws`
  const c = world.registry.register('x')
  campaign = c.id
  link = c.link
  pc = c.addCharacter(TOLMO, 'Ana').id
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

/** A client that collects what it hears. */
async function client(hello: ClientMsg) {
  const ws = new WebSocket(wsUrl)
  const heard: ServerMsg[] = []
  await new Promise<void>((r) => ws.on('open', r))
  ws.on('message', (raw) => heard.push(JSON.parse(raw.toString()) as ServerMsg))
  ws.send(JSON.stringify(hello))
  const until = async (pred: (m: ServerMsg) => boolean, ms = 2000) => {
    const start = Date.now()
    while (!heard.some(pred)) {
      if (Date.now() - start > ms) throw new Error(`nothing matched; heard ${heard.map((m) => m.type)}`)
      await new Promise((r) => setTimeout(r, 10))
    }
    return heard.find(pred)!
  }
  return { ws, heard, until, send: (m: ClientMsg) => ws.send(JSON.stringify(m)) }
}

describe('the live channel', () => {
  it('greets the DM with the party and the whole state', async () => {
    const dm = await client({ type: 'hello', role: 'dm', token: TOKEN, campaign })
    await dm.until((m) => m.type === 'dm')
    expect(dm.heard.map((m) => m.type)).toEqual(['welcome', 'party', 'dm'])
    const party = dm.heard[1] as Extract<ServerMsg, { type: 'party' }>
    expect(party.characters?.[0]?.name).toBe('Tolmo')
    dm.ws.close()
  })

  it('refuses a wrong token and an unknown link', async () => {
    const bad = await client({ type: 'hello', role: 'dm', token: 'nope', campaign })
    await bad.until((m) => m.type === 'error')
    const badLink = await client({ type: 'hello', role: 'pc', link: 'nope', pc })
    await badLink.until((m) => m.type === 'error')
  })

  it('fans an action out: an ack to the sender, a snapshot to everyone, in role shape', async () => {
    const dm = await client({ type: 'hello', role: 'dm', token: TOKEN, campaign })
    const phone = await client({ type: 'hello', role: 'pc', link, pc })
    await dm.until((m) => m.type === 'dm')
    await phone.until((m) => m.type === 'pc')
    const before = phone.heard.length

    phone.send({ type: 'action', id: 'a1', action: { type: 'hp/damage', ref: `pc:${pc}`, amount: 2 } })
    const ack = (await phone.until((m) => m.type === 'ack')) as Extract<ServerMsg, { type: 'ack' }>
    expect(ack).toMatchObject({ id: 'a1', changed: true })
    const view = (await phone.until((m, i = phone.heard.indexOf(m)) => m.type === 'pc' && i >= before)) as Extract<ServerMsg, { type: 'pc' }>
    expect(view.view.live.hp).toBe(11)
    const state = (await dm.until((m) => m.type === 'dm' && m.rev === ack.rev)) as Extract<ServerMsg, { type: 'dm' }>
    expect(state.state.play[pc]!.hp).toBe(11)

    // The phone may not touch the table; the DM may.
    phone.send({ type: 'action', id: 'a2', action: { type: 'scene/show', sceneId: null } })
    const reject = (await phone.until((m) => m.type === 'reject')) as Extract<ServerMsg, { type: 'reject' }>
    expect(reject.code).toBe('forbidden')
    dm.ws.close()
    phone.ws.close()
  })

  it('sends only the welcome to a reconnect that missed nothing', async () => {
    const first = await client({ type: 'hello', role: 'dm', token: TOKEN, campaign })
    const w = (await first.until((m) => m.type === 'welcome')) as Extract<ServerMsg, { type: 'welcome' }>
    first.ws.close()
    const again = await client({ type: 'hello', role: 'dm', token: TOKEN, campaign, since: w.rev })
    await again.until((m) => m.type === 'welcome')
    await new Promise((r) => setTimeout(r, 100))
    expect(again.heard.map((m) => m.type)).toEqual(['welcome'])
    again.ws.close()
  })
})
