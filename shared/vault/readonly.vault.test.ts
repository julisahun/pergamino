/**
 * The suite uses the DM's real vault as its fixture. These tests are the
 * backstop that keeps it a fixture: nothing here may leave a mark on it.
 *
 * `VAULT_READONLY=1` used to do this from outside, as a flag every write
 * checked. The fixture is now opened read-only at the handle, so a write
 * throws where it is attempted rather than where it is checked.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import nodePath from 'node:path'
import { campaign, MESA, openWorld, playingPcs, worldRootAbs } from '../../test/fixture.ts'
import { SessionStore } from '../session/store.ts'
import { VaultWriteError } from './source.ts'

const vault = await openWorld()
const run = await vault.loadRun(MESA)

const sessionFile = nodePath.join(
  worldRootAbs(), 'campaigns', campaign, 'runs', MESA, 'session.json',
)
const backupFile = `${sessionFile}.bak`

const read = (path: string): string | null =>
  fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : null

describe('the suite cannot write to the vault', () => {
  it('is opened read-only', () => {
    expect(vault.readOnly).toBe(true)
  })

  it('refuses even a legitimate write target', async () => {
    const dir = await vault.run(MESA)
    await expect(dir.write('session.json', '{}')).rejects.toThrow(VaultWriteError)
  })

  it('leaves session.json untouched however much the store is driven', async () => {
    const before = read(sessionFile)
    // The backup is part of what must not move: a migrate-and-write would
    // take this file out as it went.
    const backupBefore = read(backupFile)

    const store = new SessionStore()
    store.bind(vault)
    await store.open(MESA)
    store.dispatch({ type: 'scene/show', sceneId: 'faro' })
    store.dispatch({ type: 'hp/damage', ref: `pc:${playingPcs(run)[0]}`, amount: 5 })
    store.dispatch({ type: 'field/paused', paused: true })
    await store.flush()

    expect(read(sessionFile)).toBe(before)
    expect(read(backupFile)).toBe(backupBefore)
  })

  it('makes no backup the vault did not already have', () => {
    // `runs/last/` ships a `session.json.bak` of its own, from a real
    // migration the DM's app did at the table. What must not happen is the
    // suite adding one, or rewriting that one — asserted above.
    const stray = fs
      .readdirSync(nodePath.dirname(sessionFile))
      .filter((n) => n.endsWith('.bak') && n !== 'session.json.bak')
    expect(stray).toEqual([])
  })
})
