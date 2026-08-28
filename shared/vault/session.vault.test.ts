import { describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { RUNS_DIR } from './binding.ts'
import { loadSession, migrate, normaliseReveal, SESSION_FILE } from './session.ts'
import { dirAt, readJson } from './source.ts'
import { SESSION_VERSION } from '../types.ts'

const vault = await openWorld()

const runDir = async (mesa: string) => {
  const dir = await dirAt(vault.campaignDir, `${RUNS_DIR}/${mesa}`)
  if (!dir) throw new Error(`No run folder for ${mesa}`)
  return dir
}
const guilsDir = await runDir('guils')
const lastDir = await runDir('last')

// Read up front: a `describe` callback is not the place for I/O.
const guilsRaw = (await readJson(guilsDir, SESSION_FILE)) as Record<string, unknown>
const templateRaw = (await readJson(vault.campaignDir, SESSION_FILE)) as Record<string, unknown>

describe('normaliseReveal', () => {
  it('prefixes bare npc ids with npc:', () => {
    const out = normaliseReveal({ abc: { on: true, hp: 'none' } }, new Set(['abc']))
    expect(out).toEqual({ 'npc:abc': { on: true, hp: 'none' } })
  })

  it('leaves already-prefixed refs alone', () => {
    const out = normaliseReveal({ 'npc:abc': { on: true, hp: 'bar' } }, new Set(['abc']))
    expect(out).toEqual({ 'npc:abc': { on: true, hp: 'bar' } })
  })

  it('keeps a setting whose npc is gone rather than dropping it', () => {
    const out = normaliseReveal({ ghost: { on: true, hp: 'exact' } }, new Set())
    expect(out['npc:ghost']).toEqual({ on: true, hp: 'exact' })
  })

  it('defaults an unrecognised hp mode to none', () => {
    const out = normaliseReveal({ 'npc:a': { on: true, hp: 'wat' } }, new Set(['a']))
    expect(out['npc:a']!.hp).toBe('none')
  })
})

describe('migrating the real v3 file (runs/guils)', () => {
  const raw = guilsRaw
  const state = migrate(raw)

  it('came from v3 and lands on v4', () => {
    expect(raw.version).toBe(3)
    expect(state.version).toBe(SESSION_VERSION)
  })

  it('keeps all three PCs and their live state', () => {
    expect(Object.keys(state.play).sort()).toEqual(['pj-amparo', 'pj-muro', 'pj-sombra'])
  })

  it('carries playerFiles through untouched', () => {
    // Deliberately not asserting the *value*: this is a live gameplay file,
    // and whichever app last wrote it decides whether the paths are
    // campaign-relative (`players/x.json`) or run-relative
    // (`runs/guils/players/x.json`). What `migrate` promises is that it does
    // not invent, rewrite or drop them — the store fills in anything missing
    // when it opens the run.
    expect(state.playerFiles).toEqual(raw.playerFiles)
  })

  it('keeps the three bandits with prep data and live HP intact', () => {
    expect(state.npcs).toHaveLength(3)
    const [first] = state.npcs
    expect(first!.name).toBe('Bandido')
    expect(first!.ac).toBe(12)
    expect(first!.hpMax).toBe(11)
    expect(first!.hp).toBe(11)
    expect(first!.abilities[0]!.name).toBe('Cimitarra')
    expect(first!.objects).toEqual(['obj-anillo-corriente-ahogada'])
  })

  it('keeps the in-flight encounter', () => {
    expect(state.encounter.on).toBe(true)
    expect(state.encounter.round).toBe(1)
    expect(state.encounter.members).toHaveLength(6)
    expect(state.encounter.members).toContain('pc:pj-amparo')
  })

  it('normalises reveal keys to match token keys', () => {
    const revealKeys = Object.keys(state.field.reveal).sort()
    const npcTokenKeys = Object.keys(state.field.tokens)
      .filter((k) => k.startsWith('npc:'))
      .sort()
    expect(revealKeys).toEqual(npcTokenKeys)
    // The DM had hidden the third bandit; that must survive the migration.
    expect(Object.values(state.field.reveal).filter((r) => !r.on)).toHaveLength(1)
  })

  it('keeps the board and adds the v4 fields', () => {
    expect(state.field.mode).toBe('tablero')
    expect(state.field.sceneId).toBe('camino-del-rio')
    expect(state.field.map).toEqual({ src: 'assets/path_arena.jpeg' })
    expect(state.field.cols).toBe(16)
    expect(state.field.rows).toBe(9)
    expect(Object.keys(state.field.tokens)).toHaveLength(6)
    expect(state.field.handout).toBeNull()
    expect(state.log).toEqual([])
  })
})

describe('migrating the v2 template (campaign root)', () => {
  const raw = templateRaw
  const state = migrate(raw)

  it('came from v2 and lands on v4 with safe defaults', () => {
    expect(raw.version).toBe(2)
    expect(state.version).toBe(SESSION_VERSION)
    expect(state.npcs).toEqual([])
    expect(state.encounter.on).toBe(false)
    expect(state.field.mode).toBe('escena')
    expect(state.field.hud).toBe(true)
    expect(state.field.cols).toBe(24)
    expect(state.field.rows).toBe(14)
  })
})

describe('loadSession', () => {
  it('reports the on-disk version alongside the migrated state', async () => {
    const { state, fromVersion } = await loadSession(guilsDir)
    expect(fromVersion).toBe(3)
    expect(state.version).toBe(SESSION_VERSION)
  })

  it('returns an empty session for a run with no session.json', async () => {
    const { state, fromVersion } = await loadSession(lastDir)
    expect(fromVersion).toBeNull()
    expect(state.npcs).toEqual([])
  })
})

describe('migration is idempotent', () => {
  it('re-migrating a v4 state changes nothing', () => {
    const once = migrate(guilsRaw)
    const twice = migrate(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })
})
