import { describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { RUNS_DIR } from './binding.ts'
import { dirAt } from './source.ts'
import { abilityMod, readSheet } from './sheet.ts'

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
    // last/players/el-cantor-fc5.xml:
    // "CA 14 · PG 10 · Iniciativa +3 · Percepción pasiva 13 · Competencia +2"
    expect(await readSheet(last, 'el-cantor.md')).toEqual({
      hpMax: 10,
      initMod: 3,
      level: 1,
      slots: { '1': 2 }, // a level 1 bard has two first-level slots
      abilities: { str: 8, dex: 16, con: 14, int: 8, wis: 13, cha: 15 },
      ac: 14,
      passivePerception: 13,
      proficiency: 2,
      summary: expect.stringContaining('nivel 1'),
    })
    // el-yunque.md: "PG 11 · Iniciativa +1" — 11 because dwarven toughness
    // adds a point a plain d8 + CON 14 calculation would miss.
    const yunque = await readSheet(last, 'el-yunque.md')
    expect(yunque.hpMax).toBe(11)
    expect(yunque.initMod).toBe(1)
    expect(yunque.ac).toBe(16)
  })

  it('takes the stated initiative over DEX wherever the two disagree', async () => {
    // Three of the six sheets have *Alerta*, which the DEX score cannot show.
    for (const [mesa, file, dex, stated] of [
      [guils, 'tolmo.md', 10, 2],
      [guils, 'sirga.md', 17, 5],
      [last, 'la-ganzua.md', 17, 5],
    ] as const) {
      const sheet = await readSheet(mesa, file)
      expect(sheet.abilities!.dex).toBe(dex)
      expect(abilityMod(dex)).not.toBe(stated)
      expect(sheet.initMod).toBe(stated)
    }
  })

  it('quotes the final AC, never the armour item\'s base value', async () => {
    // tolmo wears cota de malla, `<ac>16</ac>`; the sheet says 19.
    expect((await readSheet(guils, 'tolmo.md')).ac).toBe(19)
  })

  it('reads the pregenerated sheets too', async () => {
    const tolmo = await readSheet(guils, 'tolmo.md')
    expect(tolmo.hpMax).toBeGreaterThan(0)
    expect(tolmo.level).toBe(1)
    expect(tolmo.summary).toBe('Enano guerrero de nivel 1 (Guardia). Tamaño Mediano.')
  })

  it('gives non-casters no slots at all, and casters theirs', async () => {
    // Tolmo is a fighter and Sirga a rogue; Vidal is a level 1 cleric.
    expect((await readSheet(guils, 'tolmo.md')).slots).toEqual({})
    expect((await readSheet(guils, 'sirga.md')).slots).toEqual({})
    expect((await readSheet(guils, 'vidal.md')).slots).toEqual({ '1': 2 })
  })

  it('returns nulls when no XML sits beside the json', async () => {
    expect(await readSheet(last, 'no-existe.md')).toEqual({
      hpMax: null,
      initMod: null,
      level: null,
      slots: {},
      abilities: null,
      ac: null,
      passivePerception: null,
      proficiency: null,
      summary: null,
    })
  })
})
