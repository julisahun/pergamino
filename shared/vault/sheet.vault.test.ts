import { describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { RUNS_DIR } from './binding.ts'
import { dirAt } from './source.ts'
import { readSheet } from './sheet.ts'

const vault = await openWorld()

/** The `players/` folder of a run, as the loader receives it. */
const playersOf = async (mesa: string) => {
  const dir = await dirAt(vault.campaignDir, `${RUNS_DIR}/${mesa}/players`)
  if (!dir) throw new Error(`No players folder for ${mesa}`)
  return dir
}
const last = await playersOf('last')
const guils = await playersOf('guils')

describe('readSheet', () => {
  it('matches the numbers the character notes quote', async () => {
    // last/players/el-cantor.md: "CA 14 · PG 10 · Iniciativa +3"
    expect(await readSheet(last, 'el-cantor.json')).toEqual({
      hpMax: 10,
      initMod: 3,
      level: 1,
      slots: { '1': 2 }, // a level 1 bard has two first-level slots
    })
    // el-yunque.md: "PG 11 · Iniciativa +1" — 11 because dwarven toughness
    // adds a point a plain d8 + CON 14 calculation would miss.
    expect(await readSheet(last, 'el-yunque.json')).toEqual({
      hpMax: 11,
      initMod: 1,
      level: 1,
      slots: { '1': 2 },
    })
  })

  it('reads the pregenerated sheets too', async () => {
    const muro = await readSheet(guils, 'el-muro.json')
    expect(muro.hpMax).toBeGreaterThan(0)
    expect(muro.level).toBe(1)
  })

  it('gives non-casters no slots at all', async () => {
    // El muro is a fighter, La sombra a rogue.
    expect((await readSheet(guils, 'el-muro.json')).slots).toEqual({})
    expect((await readSheet(guils, 'la-sombra.json')).slots).toEqual({})
  })

  it('returns nulls when no XML sits beside the json', async () => {
    expect(await readSheet(last, 'no-existe.json')).toEqual({
      hpMax: null,
      initMod: null,
      level: null,
      slots: {},
    })
  })
})
