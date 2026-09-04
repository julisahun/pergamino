/**
 * `migrate` and `loadSession` against whatever the DM's vault actually holds.
 *
 * `session.json` is not a fixture: the app writes it on the first change of a
 * session and the DM deletes it between them, so a mesa marked
 * `estado: sin empezar` has none — which is exactly the `fromVersion: null`
 * case asserted below. When there *is* one, the promise worth checking against
 * real gameplay state is the one that runs on every load: migrating a file the
 * app wrote invents nothing, rewrites nothing and drops nothing. Those
 * assertions are made against the raw file rather than against literals, and
 * they skip themselves when there is no file to make them about.
 *
 * The step-by-step v3 → v5 conversion — bare reveal ids, the v4 fields
 * arriving with defaults — is asserted on `MemoryVault` in `shells.test.ts`,
 * which runs everywhere and cannot rot.
 */
import { describe, expect, it } from 'vitest'
import { MESA, openWorld } from '../../test/fixture.ts'
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
const lastDir = await runDir(MESA)

// Read up front: a `describe` callback is not the place for I/O.
type Raw = Record<string, unknown>
const liveRaw = (await readJson(lastDir, SESSION_FILE)) as Raw
// The `.bak` is a byproduct of a migration the app did at the table, so it is
// real older-version data — but it is not guaranteed to be there.
const backupRaw = (await readJson(lastDir, `${SESSION_FILE}.bak`)) as Raw | null

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

describe.skipIf(!liveRaw)(`migrating the live file (${RUNS_DIR}/${MESA})`, () => {
  const state = migrate(liveRaw ?? {})

  it('lands on the current version', () => {
    expect(state.version).toBe(SESSION_VERSION)
  })

  it('keeps every PC that had live state, with their numbers', () => {
    const play = liveRaw!.play as Record<string, { hp: number; temp: number }>
    expect(Object.keys(state.play).sort()).toEqual(Object.keys(play).sort())
    for (const [id, live] of Object.entries(play)) {
      expect(state.play[id]!.hp).toBe(live.hp)
      expect(state.play[id]!.temp).toBe(live.temp)
    }
  })

  it('carries playerFiles through untouched', () => {
    // Deliberately not asserting the *value*: whichever app last wrote this
    // decides whether the paths are campaign- or run-relative. What `migrate`
    // promises is that it does not invent, rewrite or drop them — the store
    // fills in anything missing when it opens the run.
    expect(state.playerFiles).toEqual(liveRaw!.playerFiles)
  })

  it('keeps every NPC, its prep data and its live HP', () => {
    type RawNpc = { id: string; name: string; hp: number; hpMax: number; abilities: unknown[] }
    const npcs = liveRaw!.npcs as RawNpc[]
    expect(npcs.length).toBeGreaterThan(0)
    expect(state.npcs.map((n) => n.id)).toEqual(npcs.map((n) => n.id))
    for (const [i, npc] of state.npcs.entries()) {
      expect(npc.name).toBe(npcs[i]!.name)
      expect(npc.hp).toBe(npcs[i]!.hp)
      expect(npc.hpMax).toBe(npcs[i]!.hpMax)
      expect(npc.abilities).toEqual(npcs[i]!.abilities)
    }
  })

  it('keeps the encounter as the DM left it', () => {
    const enc = liveRaw!.encounter as { on: boolean; round: number; members: string[] }
    expect(state.encounter.on).toBe(enc.on)
    expect(state.encounter.round).toBe(enc.round)
    expect(state.encounter.members).toEqual(enc.members)
  })

  it('keys reveal the way tokens are keyed', () => {
    // The v3 → v4 normalisation is what made this true; on a current file it
    // is the invariant that has to hold, or the TV hides the wrong person.
    for (const key of Object.keys(state.field.reveal)) {
      expect(key).toMatch(/^(?:pc|npc):/)
    }
  })

  it('keeps the board', () => {
    const field = liveRaw!.field as Raw
    expect(state.field.mode).toBe(field.mode)
    expect(state.field.sceneId).toBe(field.sceneId)
    expect(state.field.map).toEqual(field.map)
    expect(state.field.cols).toBe(field.cols)
    expect(state.field.rows).toBe(field.rows)
    expect(Object.keys(state.field.tokens)).toEqual(Object.keys(field.tokens as object))
  })
})

describe.skipIf(!backupRaw)(`migrating the backup (${RUNS_DIR}/${MESA})`, () => {
  it('came from an older version and lands on the current one', () => {
    expect(backupRaw!.version).toBeLessThan(SESSION_VERSION)
    expect(migrate(backupRaw!).version).toBe(SESSION_VERSION)
  })

  it('keeps what the backup was holding and defaults the rest', () => {
    const state = migrate(backupRaw!)
    const field = backupRaw!.field as Raw
    expect(state.field.sceneId).toBe(field.sceneId)
    expect(state.field.map).toEqual(field.map)
    expect(state.log).toEqual(backupRaw!.log ?? [])
    expect(state.field.handout).toBeNull()
  })
})

describe('loadSession', () => {
  it('reports the on-disk version alongside the migrated state', async () => {
    const { state, fromVersion } = await loadSession(lastDir)
    // Null when the mesa has not been played — the file is the app's to write.
    expect(fromVersion).toBe(liveRaw ? liveRaw.version : null)
    expect(state.version).toBe(SESSION_VERSION)
  })

  it('gives a mesa that has not been played an empty session', async () => {
    const { state } = await loadSession(lastDir)
    if (liveRaw) return // played since; the describe above covers it
    expect(state.npcs).toEqual([])
    expect(state.play).toEqual({})
    expect(state.encounter.on).toBe(false)
    expect(state.field.sceneId).toBeNull()
  })

  it('returns an empty session where there is no session.json', async () => {
    // The campaign root holds prep, not a session — a run is the only place
    // live state lives.
    const { state, fromVersion } = await loadSession(vault.campaignDir)
    expect(fromVersion).toBeNull()
    expect(state.npcs).toEqual([])
    expect(state.play).toEqual({})
  })
})

describe('migration is idempotent', () => {
  it('re-migrating a migrated state changes nothing', () => {
    const once = migrate(liveRaw ?? {})
    const twice = migrate(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })
})
