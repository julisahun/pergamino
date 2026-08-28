/**
 * The write guard, now that it is structural.
 *
 * `paths.test.ts` used to assert that `resolveWritable` refused a path outside
 * `runs/<mesa>/`. There is no path to refuse any more: the loaders are handed
 * `VaultDir`, which has no `write`, and a handle cannot address its parent —
 * so the equivalent question is *which handles ever become writable at all*.
 * The memory vault records that, and this is the file that reads the record.
 *
 * `runs/README.md` is still the rule being kept:
 *
 *   "La preparación no se toca durante el juego; una partida sólo acumula.
 *    Nada de `runs/` edita `story/`, `monsters/`, `objects/` ni `scenarios/`."
 */
import { describe, expect, it } from 'vitest'
import { openMemoryVault } from '../../test/memory.ts'
import { PLANTILLA } from '../../test/memory.ts'
import { emptySession } from './session.ts'
import { VaultWriteError } from './source.ts'

const CAMPAIGN = 'campaigns/marea-chica'
const RUN = `${CAMPAIGN}/runs/guils`

/** Every prep folder that a live session must never be able to write. */
const PREP = ['story', 'monsters', 'objects', 'assets', 'pregenerados']

describe('what a session can write', () => {
  it('lands every write inside runs/<mesa>/', async () => {
    const { vault, memory } = await openMemoryVault()
    await vault.saveSession('guils', emptySession(), {})
    await vault.writeBitacora('guils', '01-2026-08-27.md', '# Sesión 1\n')
    await vault.writeEstado('guils', '# Estado\n')

    expect(memory.writes).toEqual([
      `${RUN}/session.json`,
      `${RUN}/bitacora/01-2026-08-27.md`,
      `${RUN}/estado.md`,
    ])
    for (const path of memory.writes) expect(path.startsWith(`${RUN}/`)).toBe(true)
  })

  it('never resolves a writable handle on a prep folder', async () => {
    const { vault, memory } = await openMemoryVault()
    // Everything a session does, in one go.
    await vault.loadCampaign()
    await vault.loadRun('guils')
    await vault.listRuns()
    await vault.listAssets()
    await vault.buildNotesIndex()
    await vault.readEstado('guils')
    await vault.readTemplate('guils')
    await vault.nextSessionNumber('guils')
    await vault.asset('assets/faro.jpg')
    await vault.saveSession('guils', emptySession(), {})

    for (const opened of memory.openedWritable) {
      for (const prep of PREP) {
        expect(opened).not.toBe(`${CAMPAIGN}/${prep}`)
        expect(opened.startsWith(`${CAMPAIGN}/${prep}/`)).toBe(false)
      }
    }
  })

  it('opens scenarios/ only through the Preparación door', async () => {
    const { vault, memory } = await openMemoryVault()
    await vault.loadCampaign()
    expect(memory.openedWritable).not.toContain(`${CAMPAIGN}/scenarios`)

    const scenarios = await vault.scenarios()
    expect(memory.openedWritable).toContain(`${CAMPAIGN}/scenarios`)

    await scenarios.write('faro.json', '{}')
    expect(memory.writes).toEqual([`${CAMPAIGN}/scenarios/faro.json`])
  })

  it('hands the loaders a directory that has no write to reach for', async () => {
    const { vault } = await openMemoryVault()
    const monsters = await vault.campaignDir.dir('monsters')
    expect(monsters).not.toBeNull()
    // `VaultDir` has no `write`, so a loader cannot call one — this is the
    // compile-time guarantee. Casting past it buys nothing: the handle the
    // vault handed out is read-only all the way down.
    const cast = monsters as unknown as {
      write(n: string, d: string): Promise<void>
      createDir(n: string): Promise<unknown>
    }
    await expect(cast.write('bandido.json', '{}')).rejects.toThrow(VaultWriteError)
    await expect(cast.createDir('nuevo')).rejects.toThrow(VaultWriteError)
  })

  it('refuses a run name that tries to leave runs/', async () => {
    const { vault } = await openMemoryVault()
    for (const bad of ['..', '.', '', 'guils/../../story']) {
      await expect(vault.run(bad)).rejects.toThrow()
    }
  })

  it('will not overwrite a bitácora that is already there', async () => {
    const { vault } = await openMemoryVault()
    await vault.writeBitacora('guils', '01-2026-08-27.md', 'uno')
    await expect(vault.writeBitacora('guils', '01-2026-08-27.md', 'dos')).rejects.toThrow(
      /Already exists/,
    )
  })

  it('refuses to overwrite the template, whatever it is asked', async () => {
    const { vault, memory } = await openMemoryVault()
    await expect(vault.writeBitacora('guils', '00-plantilla.md', 'x')).rejects.toThrow()
    await expect(vault.writeBitacora('guils', '../estado.md', 'x')).rejects.toThrow()
    expect(memory.read(`${RUN}/bitacora/00-plantilla.md`)).toBe(PLANTILLA)
  })
})

describe('a read-only vault', () => {
  it('throws from the handle rather than being politely refused', async () => {
    const { memory } = await openMemoryVault()
    const monsters = await memory.root().dir('campaigns')
    await expect(
      (monsters as unknown as { write: (n: string, d: string) => Promise<void> }).write(
        'x.json',
        '{}',
      ),
    ).rejects.toThrow(VaultWriteError)
  })
})
