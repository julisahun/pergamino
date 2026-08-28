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
import { campaign, openWorld, worldRootAbs } from '../../test/fixture.ts'
import { SessionStore } from '../session/store.ts'
import { VaultWriteError } from './source.ts'

const vault = await openWorld()

const sessionFile = nodePath.join(
  worldRootAbs(), 'campaigns', campaign, 'runs', 'guils', 'session.json',
)

describe('the suite cannot write to the vault', () => {
  it('is opened read-only', () => {
    expect(vault.readOnly).toBe(true)
  })

  it('refuses even a legitimate write target', async () => {
    const run = await vault.run('guils')
    await expect(run.write('session.json', '{}')).rejects.toThrow(VaultWriteError)
  })

  it('leaves session.json untouched however much the store is driven', async () => {
    const before = fs.readFileSync(sessionFile, 'utf8')

    const store = new SessionStore()
    store.bind(vault)
    await store.open('guils')
    store.dispatch({ type: 'scene/show', sceneId: 'faro' })
    store.dispatch({ type: 'hp/damage', ref: 'pc:pj-muro', amount: 5 })
    store.dispatch({ type: 'field/paused', paused: true })
    await store.flush()

    expect(fs.readFileSync(sessionFile, 'utf8')).toBe(before)
    // ...and the file is still the v3 the vault ships.
    expect(JSON.parse(before).version).toBe(3)
  })

  it('makes no stray backup file', () => {
    expect(fs.existsSync(`${sessionFile}.bak`)).toBe(false)
  })
})
