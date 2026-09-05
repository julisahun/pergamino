/**
 * The REST surface, on a real socket, against a fake `dist/`.
 */
import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import nodePath from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readEnv } from './env.ts'
import { createHandler } from './http.ts'
import { memoryWorld, NEL, TOLMO } from './fixtures.ts'

const TOKEN = 'secret-token'
let server: Server
let base: string

beforeAll(async () => {
  const dist = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'dm-dist-'))
  fs.mkdirSync(nodePath.join(dist, 'assets'))
  for (const page of ['index.html', 'tv.html', 'pj.html']) {
    fs.writeFileSync(nodePath.join(dist, page), `<script src="/assets/${page}.js"></script>`)
  }
  fs.writeFileSync(nodePath.join(dist, 'assets/index.html.js'), 'console.log(1)')
  fs.writeFileSync(nodePath.join(dist, '.secret'), 'no')
  const env = readEnv({ DM_TOKEN: TOKEN, DM_DB: ':memory:', DM_DIST: dist, PUBLIC_URL: 'https://dm.example' })
  const world = memoryWorld()
  server = createServer(createHandler({ env, ...world, version: 'test' }))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  base = `http://127.0.0.1:${port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const dm = (path: string, init: RequestInit = {}) =>
  fetch(base + path, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } })
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('the static host', () => {
  it('serves the three pages revalidated and the assets forever', async () => {
    for (const path of ['/', '/tv', '/pj']) {
      const res = await fetch(base + path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-cache')
      expect(res.headers.get('content-type')).toContain('text/html')
    }
    const asset = await fetch(`${base}/assets/index.html.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect(asset.headers.get('content-type')).toContain('javascript')
  })

  it('never lets an error be cached, and reaches nothing outside the build', async () => {
    const miss = await fetch(`${base}/assets/nope.css`)
    expect(miss.status).toBe(404)
    expect(miss.headers.get('cache-control')).toBe('no-store')
    expect((await fetch(`${base}/.secret`)).status).toBe(404)
    expect((await fetch(`${base}/vault/x`)).status).toBe(404)
    expect((await fetch(`${base}/assets/../.secret`)).status).toBe(404)
    expect((await fetch(base, { method: 'POST' })).status).toBe(404)
  })

  it('pings', async () => {
    expect(await (await fetch(`${base}/api/ping`)).json()).toMatchObject({ app: 'dnd-dm', version: 'test' })
  })
})

describe('the DM', () => {
  it('needs the token', async () => {
    expect((await fetch(`${base}/api/dm/whoami`)).status).toBe(401)
    expect((await fetch(`${base}/api/dm/whoami`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401)
    expect((await fetch(`${base}/api/dm/campaigns`, json({ title: 'x' }))).status).toBe(401)
    expect((await dm('/api/dm/whoami')).status).toBe(200)
  })

  it('registers a campaign and reads it back, and says so when there is none', async () => {
    const none = await (await dm('/api/dm/campaigns/no-such')).json()
    expect(none).toEqual({ exists: false })
    const reg = await (await dm('/api/dm/campaigns', json({ title: 'Marea Baja' }))).json()
    expect(reg.url).toBe(`https://dm.example/pj#${reg.link}`)
    const summary = await (await dm(`/api/dm/campaigns/${reg.id}`)).json()
    expect(summary).toMatchObject({ exists: true, title: 'Marea Baja', rev: 0, party: [] })
    // The console re-registers under the id it holds after a wiped database.
    const again = await (await dm(`/api/dm/campaigns/${reg.id}`, { ...json({ title: 'Marea Baja' }), method: 'PUT' })).json()
    expect(again.id).toBe(reg.id)
  })
})

describe("a player's link", () => {
  it('creates a character from an xml, sees it, acts on it, and only on it', async () => {
    const { id, link } = await (await dm('/api/dm/campaigns', json({ title: 'x' }))).json()
    const pub = await fetch(`${base}/api/pj/${link}`)
    expect(pub.status).toBe(200)
    expect(pub.headers.get('cache-control')).toBe('no-store')
    expect(await pub.json()).toEqual({ title: 'x', party: [] })

    const created = await fetch(`${base}/api/pj/${link}/characters?player=Ana`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: TOLMO,
    })
    expect(created.status).toBe(201)
    const { id: tal } = await created.json()
    const nel = (await (await fetch(`${base}/api/pj/${link}/characters?player=Bea`, { method: 'POST', body: NEL })).json()).id

    const snap = await (await fetch(`${base}/api/pj/${link}/characters/${tal}`)).json()
    expect(snap.view.pc).toMatchObject({ name: 'Tolmo', player: 'Ana' })
    expect(snap.view.live.hp).toBe(13)

    const ok = await fetch(`${base}/api/pj/${link}/characters/${tal}/actions`, json({ action: { type: 'hp/damage', ref: `pc:${tal}`, amount: 3 } }))
    expect(await ok.json()).toMatchObject({ changed: true })
    const no = await fetch(`${base}/api/pj/${link}/characters/${tal}/actions`, json({ action: { type: 'hp/damage', ref: `pc:${nel}`, amount: 3 } }))
    expect(no.status).toBe(403)
    expect(await no.json()).toMatchObject({ code: 'forbidden' })

    const bad = await fetch(`${base}/api/pj/${link}/characters?player=X`, { method: 'POST', body: '<nope/>' })
    expect(bad.status).toBe(422)

    // The DM sees both, with sheets; the state holds the damage.
    const party = await (await dm(`/api/dm/campaigns/${id}/party`)).json()
    expect(Object.keys(party.sheets).sort()).toEqual([tal, nel].sort())
    const state = await (await dm(`/api/dm/campaigns/${id}/state`)).json()
    expect(state.state.play[tal].hp).toBe(10)
  })

  it('is refused when unknown, and dies when rotated', async () => {
    const miss = await fetch(`${base}/api/pj/nope`)
    expect(miss.status).toBe(404)
    expect(miss.headers.get('cache-control')).toBe('no-store')
    const { id, link } = await (await dm('/api/dm/campaigns', json({ title: 'x' }))).json()
    const rotated = await (await dm(`/api/dm/campaigns/${id}/link/rotate`, { method: 'POST' })).json()
    expect(rotated.link).not.toBe(link)
    expect((await fetch(`${base}/api/pj/${link}`)).status).toBe(404)
    expect((await fetch(`${base}/api/pj/${rotated.link}`)).status).toBe(200)
  })

  it('serves a portrait with an ETag', async () => {
    const { id, link } = await (await dm('/api/dm/campaigns', json({ title: 'x' }))).json()
    const { id: pc } = await (await dm(`/api/dm/campaigns/${id}/characters?player=Ana`, { method: 'POST', body: TOLMO })).json()
    expect((await fetch(`${base}/api/pj/${link}/portrait/pc/${pc}`)).status).toBe(404)
    const put = await dm(`/api/dm/campaigns/${id}/characters/${pc}/portrait`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array([137, 80, 78, 71]),
    })
    expect(put.status).toBe(200)
    const got = await fetch(`${base}/api/pj/${link}/portrait/pc/${pc}`)
    expect(got.status).toBe(200)
    expect(got.headers.get('content-type')).toBe('image/png')
    const etag = got.headers.get('etag')!
    const again = await fetch(`${base}/api/pj/${link}/portrait/pc/${pc}`, { headers: { 'If-None-Match': etag } })
    expect(again.status).toBe(304)
  })
})
