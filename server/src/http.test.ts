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
  const env = readEnv({ DM_DB: ':memory:', DM_DIST: dist, PUBLIC_URL: 'https://dm.example' })
  const world = memoryWorld()
  server = createServer(createHandler({ env, ...world, version: 'test' }))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  base = `http://127.0.0.1:${port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
/** A request with a campaign's DM secret as the bearer. */
const as = (secret: string) => (path: string, init: RequestInit = {}) =>
  fetch(base + path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.headers ?? {}) } })
/** A fresh campaign and a requester that is its DM. */
async function campaign(title = 'x') {
  const reg = (await (await fetch(`${base}/api/dm/campaigns`, json({ title }))).json()) as {
    id: string
    link: string
    url: string
    dmSecret: string
  }
  return { ...reg, dm: as(reg.dmSecret) }
}

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
  it('registers openly, and what comes back is the only way in', async () => {
    const none = await (await fetch(`${base}/api/dm/campaigns/no-such`)).json()
    expect(none).toEqual({ exists: false })
    const reg = await campaign('Marea Baja')
    expect(reg.url).toBe(`https://dm.example/pj#${reg.link}`)
    expect(reg.dmSecret).toMatch(/^[A-Za-z0-9_-]{20}$/)
    const summary = await (await reg.dm(`/api/dm/campaigns/${reg.id}`)).json()
    expect(summary).toMatchObject({ exists: true, title: 'Marea Baja', rev: 0, party: [] })

    for (const bad of [fetch(`${base}/api/dm/campaigns/${reg.id}`), as('nope')(`/api/dm/campaigns/${reg.id}`)]) {
      const res = await bad
      expect(res.status).toBe(401)
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect((await fetch(`${base}/api/dm/campaigns/${reg.id}/state`)).status).toBe(401)
    expect((await fetch(`${base}/api/dm/campaigns/${reg.id}/prep`, { method: 'PUT', body: '{}' })).status).toBe(401)
  })

  it('keeps one campaign from another: a secret opens its own and nothing else', async () => {
    const a = await campaign('a')
    const b = await campaign('b')
    expect((await a.dm(`/api/dm/campaigns/${a.id}/state`)).status).toBe(200)
    expect((await a.dm(`/api/dm/campaigns/${b.id}/state`)).status).toBe(401)
    expect((await a.dm(`/api/dm/campaigns/${b.id}/reset`, { method: 'POST' })).status).toBe(401)
    expect((await a.dm(`/api/dm/campaigns/${b.id}`, { method: 'DELETE' })).status).toBe(401)
    expect((await b.dm(`/api/dm/campaigns/${b.id}`)).status).toBe(200)
  })

  it('re-registers under the id and secret the folder holds, so a wiped database changes nothing', async () => {
    // A folder from before: id and secret, no row on the server.
    const held = as('the-folders-secret')
    const reg = await (await held('/api/dm/campaigns/c-held', { ...json({ title: 'Held' }), method: 'PUT' })).json()
    expect(reg).toMatchObject({ id: 'c-held', dmSecret: 'the-folders-secret' })
    expect((await held('/api/dm/campaigns/c-held/state')).status).toBe(200)
    // Once the row is there, re-registering is a title update and wants the secret.
    expect((await fetch(`${base}/api/dm/campaigns/c-held`, { ...json({ title: 'x' }), method: 'PUT' })).status).toBe(401)
    const again = await (await held('/api/dm/campaigns/c-held', { ...json({ title: 'Held again' }), method: 'PUT' })).json()
    expect(again.dmSecret).toBe('the-folders-secret')
    expect((await (await held('/api/dm/campaigns/c-held')).json()).title).toBe('Held again')
    // A file from before secrets brings none: the server mints one and says so.
    const minted = await (await fetch(`${base}/api/dm/campaigns/c-old`, { ...json({ title: 'Old' }), method: 'PUT' })).json()
    expect(minted.dmSecret).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect((await as(minted.dmSecret)('/api/dm/campaigns/c-old/state')).status).toBe(200)
  })

  it('rotates the secret, and the old one stops opening the campaign', async () => {
    const reg = await campaign()
    const { dmSecret } = await (await reg.dm(`/api/dm/campaigns/${reg.id}/secret/rotate`, { method: 'POST' })).json()
    expect(dmSecret).not.toBe(reg.dmSecret)
    expect((await reg.dm(`/api/dm/campaigns/${reg.id}/state`)).status).toBe(401)
    expect((await as(dmSecret)(`/api/dm/campaigns/${reg.id}/state`)).status).toBe(200)
    // Deleting takes the secret too, and is idempotent once it is gone.
    expect((await as(dmSecret)(`/api/dm/campaigns/${reg.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await fetch(`${base}/api/dm/campaigns/${reg.id}`, { method: 'DELETE' })).status).toBe(204)
    expect(await (await fetch(`${base}/api/dm/campaigns/${reg.id}`)).json()).toEqual({ exists: false })
  })
})

describe("a player's link", () => {
  it('creates a character from an xml, sees it, acts on it, and only on it', async () => {
    const { id, link, dm } = await campaign()
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
    const { id, link, dm } = await campaign()
    const rotated = await (await dm(`/api/dm/campaigns/${id}/link/rotate`, { method: 'POST' })).json()
    expect(rotated.link).not.toBe(link)
    expect((await fetch(`${base}/api/pj/${link}`)).status).toBe(404)
    expect((await fetch(`${base}/api/pj/${rotated.link}`)).status).toBe(200)
  })

  it('serves a portrait with an ETag', async () => {
    const { id, link, dm } = await campaign()
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
