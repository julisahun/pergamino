import { describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { RUNS_DIR } from './binding.ts'
import { dirAt } from './source.ts'
import { abilityMod, emptySheet, readSheet } from './sheet.ts'

const vault = await openWorld()

/** The `players/` folder of a run, as the loader receives it. */
const playersOf = async (mesa: string) => {
  const dir = await dirAt(vault.campaignDir, `${RUNS_DIR}/${mesa}/players`)
  if (!dir) throw new Error(`No players folder for ${mesa}`)
  return dir
}
const last = await playersOf('last')

/**
 * A PJ is a folder, so the note the loader enumerates is `<pj>/<pj>.md` and
 * the sheet it finds is `<pj>/<pj>-fc5.xml` — inside the folder, not beside it.
 */
const pj = (name: string) => `${name}/${name}.md`

describe('readSheet', () => {
  it('matches the numbers the character notes quote', async () => {
    // abraxas.md: "CA 12 (15 con Armadura de Mago) · PG 9 · Iniciativa +2 ·
    // Percepción pasiva 12 · Competencia +2 · Conjuros: Inteligencia, CD 13,
    // ataque +5, dos espacios de nivel 1" — the 15 is a spell, not the sheet.
    expect(await readSheet(last, pj('abraxas'))).toEqual({
      hpMax: 9,
      initMod: 2,
      level: 1,
      slots: { '1': 2 },
      abilities: { str: 8, dex: 14, con: 16, int: 17, wis: 10, cha: 8 },
      ac: 12,
      passivePerception: 12,
      proficiency: 2,
      spellAbility: 'Inteligencia',
      spellDc: 13,
      spellAttack: 5,
      // No sheet states these yet — see the casting-line test below.
      skills: [],
      saves: [],
      summary: expect.stringContaining('nivel 1'),
    })
    // croma.md: "PG 11 · Iniciativa −1" — 11 because dureza enana adds a
    // point a plain d8 + CON 14 calculation would miss.
    const croma = await readSheet(last, pj('croma'))
    expect(croma.hpMax).toBe(11)
    expect(croma.initMod).toBe(-1)
    expect(croma.ac).toBe(14)
  })

  it('takes the stated initiative over DEX wherever the two disagree', async () => {
    // Toribio has *Alerta*, which the DEX score alone cannot show: DEX 17 is
    // +3, and the sheet states +5.
    const sheet = await readSheet(last, pj('toribio'))
    expect(sheet.abilities!.dex).toBe(17)
    expect(abilityMod(17)).toBe(3)
    expect(sheet.initMod).toBe(5)
  })

  it("quotes the final AC, never the armour item's base value", async () => {
    // Toribio wears armadura de cuero, `<ac>11</ac>`; the sheet says 14.
    expect((await readSheet(last, pj('toribio'))).ac).toBe(14)
    // Croma stacks camisote de mallas `<ac>13</ac>` and escudo `<ac>2</ac>`
    // over DEX −1; neither number is the 14 the sheet states.
    expect((await readSheet(last, pj('croma'))).ac).toBe(14)
  })

  it('reads the summary the sheet declares authoritative', async () => {
    const toribio = await readSheet(last, pj('toribio'))
    expect(toribio.level).toBe(1)
    expect(toribio.summary).toBe('Mediano pícaro de nivel 1 (Criminal). Tamaño Pequeño.')
    const aluci = await readSheet(last, pj('aluci'))
    expect(aluci.summary).toBe('Humano bardo de nivel 1 (Marinero). Tamaño Mediano.')
  })

  it('gives non-casters no slots at all, and casters theirs', async () => {
    // Toribio is a rogue; Aluci is a bard, Croma a cleric, Abraxas a wizard.
    expect((await readSheet(last, pj('toribio'))).slots).toEqual({})
    expect((await readSheet(last, pj('aluci'))).slots).toEqual({ '1': 2 })
    expect((await readSheet(last, pj('croma'))).slots).toEqual({ '1': 2 })
    expect((await readSheet(last, pj('abraxas'))).slots).toEqual({ '1': 2 })
  })

  it('reads the casting line of everyone who casts', async () => {
    // Three of the four cast, off three different abilities.
    for (const [name, ability, dc, attack] of [
      ['abraxas', 'Inteligencia', 13, 5],
      ['aluci', 'Carisma', 12, 4],
      ['croma', 'Sabiduría', 13, 5],
    ] as const) {
      const sheet = await readSheet(last, pj(name))
      expect(sheet.spellAbility, name).toBe(ability)
      expect(sheet.spellDc, name).toBe(dc)
      expect(sheet.spellAttack, name).toBe(attack)
    }
  })

  it('gives the rogue no casting line', async () => {
    const toribio = await readSheet(last, pj('toribio'))
    expect(toribio.spellAbility).toBeNull()
    expect(toribio.spellDc).toBeNull()
    expect(toribio.spellAttack).toBeNull()
    expect(toribio.slots).toEqual({})
  })

  it('quotes no skill or save until a sheet states one', async () => {
    // `pregenerados/fichas.py` does not emit `Habilidades:`/`Salvaciones:`
    // yet. When it does, these light up with no app change — and until then
    // the app shows nothing rather than deriving a number, because Fight Club
    // states skill proficiency as opaque ids only.
    for (const name of ['abraxas', 'aluci', 'croma', 'toribio']) {
      const sheet = await readSheet(last, pj(name))
      expect(sheet.skills, name).toEqual([])
      expect(sheet.saves, name).toEqual([])
    }
  })

  it('returns nulls when no XML sits beside the note', async () => {
    // Compared against `emptySheet()` rather than a restated literal, which
    // is one more thing that cannot fall behind the type.
    expect(await readSheet(last, pj('no-existe'))).toEqual(emptySheet())
  })
})
