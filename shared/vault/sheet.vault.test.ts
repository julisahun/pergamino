import { describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { PERSONAJES_DIR } from './binding.ts'
import { dirAt, fileAt, type VaultDir } from './source.ts'
import { parseSheet } from './sheet.ts'
import {
  abilityMod,
  emptySheet,
  passivePerceptionOf,
  skillRow,
  spellAttackOf,
  spellDcOf,
  slotsOf,
  summaryOf,
  type Sheet,
} from '../character.ts'

const vault = await openWorld()

/** The PJ folder of a mesa, as the loader receives it. */
const playersOf = async (mesa: string) => {
  const dir = await dirAt(vault.notesRoot, `${PERSONAJES_DIR}/${mesa}`)
  if (!dir) throw new Error(`No PJ folder for ${mesa}`)
  return dir
}
const last = await playersOf('last')

/**
 * The DM keeps each PJ's xml at `personajes/<mesa>/<pj>/<pj>-fc5.xml`. The app
 * no longer reads that folder — a character is a record on the server — but
 * these are the real sheets of a real party, so they are what the **importer**
 * is pinned to.
 */
const pj = (name: string) => `${name}/${name}-fc5.xml`
const readSheet = async (dir: VaultDir, path: string): Promise<Sheet> => {
  const file = await fileAt(dir, path)
  return file ? parseSheet(await file.text()) : emptySheet()
}

describe('parseSheet, on the real party', () => {
  it('matches the numbers the character notes quote', async () => {
    // abraxas.md: "CA 12 (15 con Armadura de Mago) · PG 9 · Iniciativa +2 ·
    // Percepción pasiva 12 · Competencia +2 · Conjuros: Inteligencia, CD 13,
    // ataque +5, dos espacios de nivel 1" — the 15 is a spell, not the sheet.
    expect(await readSheet(last, pj('abraxas'))).toEqual({
      name: 'Abraxas',
      species: 'Elfo (alto)',
      className: 'Mago',
      subclass: null,
      background: 'Erudito',
      speed: 30,
      hpMax: 9,
      initiative: 2,
      level: 1,
      abilities: { str: 8, dex: 14, con: 16, int: 17, wis: 10, cha: 8 },
      ac: 12,
      proficiency: 2,
      // Nothing is pinned: every number this sheet quotes is the formula.
      spellcasting: { ability: 'int', slots: { '1': 2 } },
      // 3 and 4 are INT and SAB; the five skill ids decode in the sheet's order.
      saves: { int: { proficient: true }, wis: { proficient: true } },
      skills: {
        arcanos: { prof: 'proficient' },
        historia: { prof: 'proficient' },
        investigacion: { prof: 'proficient' },
        naturaleza: { prof: 'proficient' },
        percepcion: { prof: 'proficient' },
      },
      // Present, so a field cannot appear here unnoticed; what is *in* them is
      // pinned by the tests below rather than by thirteen spells inline.
      weapons: expect.any(Array),
      spells: expect.any(Array),
      traits: expect.any(Array),
      items: expect.any(Array),
    })
    // croma.md: "PG 11 · Iniciativa −1" — 11 because dureza enana adds a
    // point a plain d8 + CON 14 calculation would miss.
    const croma = await readSheet(last, pj('croma'))
    expect(croma.hpMax).toBe(11)
    expect(croma.initiative).toBe(-1)
    expect(croma.ac).toBe(14)
  })

  /**
   * The claim the whole design rests on, checked against four real sheets.
   *
   * Every number `fightclub.py` quotes that the record can work out for itself
   * — eighteen skills, six saves, passive perception, the save DC and the
   * spell attack — comes out of the formula, so not one of the four imports
   * with an override. Which means levelling them up is editing `proficiency`
   * and `hpMax`, and everything else follows.
   */
  it('imports the whole party with no overrides at all', async () => {
    for (const name of ['toribio', 'aluci', 'croma', 'abraxas']) {
      const sheet = await readSheet(last, pj(name))
      expect(sheet.passivePerception, name).toBeUndefined()
      expect(sheet.spellcasting?.dc, name).toBeUndefined()
      expect(sheet.spellcasting?.attack, name).toBeUndefined()
      for (const [key, entry] of Object.entries(sheet.skills)) {
        expect(entry?.mod, `${name} ${key}`).toBeUndefined()
      }
      for (const [key, entry] of Object.entries(sheet.saves)) {
        expect(entry?.mod, `${name} ${key}`).toBeUndefined()
      }
    }
  })

  it('works out the passive perception each note quotes', async () => {
    // toribio.md «Percepción pasiva 15» — WIS 12 is +1 and Percepción is an
    // expertise, so +1 + 2×2 = +5 and 10 + 5 = 15. croma.md says 13 off a
    // plain WIS 16. Neither number is stored anywhere.
    for (const [name, passive] of [
      ['toribio', 15],
      ['aluci', 12],
      ['croma', 13],
      ['abraxas', 12],
    ] as const) {
      expect(passivePerceptionOf(await readSheet(last, pj(name))), name).toBe(passive)
    }
  })

  it('works out the skill modifiers toribio.md quotes', async () => {
    // «Sigilo +7, Percepción +5 (experticia)» plus «Acrobacias +5, Juego de
    // Manos +5, Investigación +3, Engaño +2».
    const toribio = await readSheet(last, pj('toribio'))
    for (const [key, mod] of [
      ['sigilo', 7],
      ['percepcion', 5],
      ['acrobacias', 5],
      ['juego-de-manos', 5],
      ['investigacion', 3],
      ['engano', 2],
    ] as const) {
      expect(skillRow(toribio, key).mod, key).toBe(mod)
    }
  })

  it('counts an item as a weapon only when it has a damage die', async () => {
    // Abraxas carries a daga, a bastón, a «Bastón (foco arcano)», a túnica, a
    // libro de conjuros and eight sheets of parchment. Two of those are things
    // to swing, and the difference is `<damage1H>`, not the prose.
    const { weapons } = await readSheet(last, pj('abraxas'))
    expect(weapons.map((w) => w.name)).toEqual(['Daga', 'Bastón'])
    // «Ataque +4, daño 1d4 +2 perforante», read once and kept as numbers.
    expect(weapons[0]).toMatchObject({ id: 'daga', mod: 4, dice: '1d4+2', damageType: 'perforante' })
  })

  it('reads the spells with the roll each one states', async () => {
    const { spells } = await readSheet(last, pj('abraxas'))
    const saeta = spells.find((s) => s.name === 'Saeta de Fuego')
    // A cantrip writes no `<level>`; zero is what that absence means.
    expect(saeta).toMatchObject({ level: 0, roll: '1d10' })
    expect(spells.find((s) => s.name === 'Manos Ardientes')).toMatchObject({
      level: 1,
      roll: '3d6',
    })
    // Listed even with nothing to roll — deciding that is not this file's job.
    expect(spells.find((s) => s.name === 'Detectar Magia')).toMatchObject({ roll: null })
  })

  it('gives a sheet with no spells an empty list, not a missing one', async () => {
    const toribio = await readSheet(last, pj('toribio'))
    expect(toribio.spells).toEqual([])
    expect(toribio.weapons.map((w) => w.name)).toEqual(['Daga', 'Espada corta', 'Arco corto'])
  })

  it('takes the stated initiative over DEX wherever the two disagree', async () => {
    // Toribio has *Alerta*, which the DEX score alone cannot show: DEX 17 is
    // +3, and the sheet states +5. This is why initiative is stored.
    const sheet = await readSheet(last, pj('toribio'))
    expect(sheet.abilities!.dex).toBe(17)
    expect(abilityMod(17)).toBe(3)
    expect(sheet.initiative).toBe(5)
  })

  it("quotes the final AC, never the armour item's base value", async () => {
    // Toribio wears armadura de cuero, `<ac>11</ac>`; the sheet says 14.
    expect((await readSheet(last, pj('toribio'))).ac).toBe(14)
    // Croma stacks camisote de mallas `<ac>13</ac>` and escudo `<ac>2</ac>`
    // over DEX −1; neither number is the 14 the sheet states.
    expect((await readSheet(last, pj('croma'))).ac).toBe(14)
  })

  it('builds the summary out of the parts, not out of the sheet line', async () => {
    const toribio = await readSheet(last, pj('toribio'))
    expect(toribio.level).toBe(1)
    expect(summaryOf(toribio)).toBe('Mediano Pícaro de nivel 1 (Criminal)')
    const aluci = await readSheet(last, pj('aluci'))
    expect(summaryOf(aluci)).toBe('Humano Bardo de nivel 1 (Marinero)')
  })

  it('gives non-casters no slots at all, and casters theirs', async () => {
    // Toribio is a rogue; Aluci is a bard, Croma a cleric, Abraxas a wizard.
    expect(slotsOf(await readSheet(last, pj('toribio')))).toEqual({})
    expect(slotsOf(await readSheet(last, pj('aluci')))).toEqual({ '1': 2 })
    expect(slotsOf(await readSheet(last, pj('croma')))).toEqual({ '1': 2 })
    expect(slotsOf(await readSheet(last, pj('abraxas')))).toEqual({ '1': 2 })
  })

  it('works out the casting numbers of everyone who casts', async () => {
    // Three of the four cast, off three different abilities — and all three
    // sets of numbers fall out of the score and the proficiency bonus.
    for (const [name, ability, dc, attack] of [
      ['abraxas', 'int', 13, 5],
      ['aluci', 'cha', 12, 4],
      ['croma', 'wis', 13, 5],
    ] as const) {
      const sheet = await readSheet(last, pj(name))
      expect(sheet.spellcasting?.ability, name).toBe(ability)
      expect(spellDcOf(sheet), name).toBe(dc)
      expect(spellAttackOf(sheet), name).toBe(attack)
    }
  })

  it('gives the rogue no casting block', async () => {
    const toribio = await readSheet(last, pj('toribio'))
    expect(toribio.spellcasting).toBeNull()
    expect(spellDcOf(toribio)).toBeNull()
    expect(spellAttackOf(toribio)).toBeNull()
  })

  it('decodes the proficiency ids, and the expertise Toribio states twice', async () => {
    const toribio = await readSheet(last, pj('toribio'))
    expect(toribio.saves).toEqual({ dex: { proficient: true }, int: { proficient: true } })
    expect(toribio.skills).toEqual({
      acrobacias: { prof: 'proficient' },
      engano: { prof: 'proficient' },
      investigacion: { prof: 'proficient' },
      'juego-de-manos': { prof: 'proficient' },
      // toribio.md: «Sigilo +7, Percepción +5 (experticia)». The xml carries
      // the Experticia feat twice; each skill is listed once.
      percepcion: { prof: 'expertise' },
      sigilo: { prof: 'expertise' },
    })
  })

  it('reads who each of the four is', async () => {
    for (const [name, who] of [
      ['toribio', { name: 'Toribio Biencalzado', species: 'Mediano', className: 'Pícaro', background: 'Criminal' }],
      ['aluci', { name: 'Aluci', species: 'Humano', className: 'Bardo', background: 'Marinero' }],
      ['croma', { name: 'Croma', species: 'Enano', className: 'Clérigo', background: 'Acólito' }],
    ] as const) {
      expect(await readSheet(last, pj(name)), name).toMatchObject(who)
    }
  })

  it('drops the money the sheets carry: gold belongs to the live layer', async () => {
    // The xml says `<money>24.0</money>` for Toribio; `LiveState.gold` is the
    // number the table actually moves, and two of them was one too many.
    for (const name of ['toribio', 'aluci', 'croma', 'abraxas']) {
      expect(Object.keys(await readSheet(last, pj(name))), name).not.toContain('money')
    }
  })

  it("attributes traits to their section, and the character's own to none", async () => {
    const abraxas = await readSheet(last, pj('abraxas'))
    expect(abraxas.traits).toContainEqual(
      expect.objectContaining({ name: 'Recuperación arcana', source: 'class' }),
    )
    expect(abraxas.traits).toContainEqual(
      expect.objectContaining({ name: 'Iniciado en la magia', source: 'feat' }),
    )
    // Aluci's two background feats sit at the top level of the xml, so that is
    // where they are attributed — the format, not this reader, decides.
    const aluci = await readSheet(last, pj('aluci'))
    expect(aluci.traits.filter((t) => t.source === 'feat').map((t) => t.name)).toEqual([
      'Camorrista de taberna',
      'Músico',
    ])
    expect(aluci.traits.every((t) => t.text.length > 0)).toBe(true)
  })

  it('gives every trait, spell, item and weapon an id unique within its list', async () => {
    // The record is edited now, so a row has to be addressable by something
    // stabler than its position or its name.
    for (const name of ['toribio', 'aluci', 'croma', 'abraxas']) {
      const sheet = await readSheet(last, pj(name))
      for (const list of ['traits', 'spells', 'items', 'weapons'] as const) {
        const ids = sheet[list].map((row) => row.id)
        expect(new Set(ids).size, `${name} ${list}`).toBe(ids.length)
        expect(ids.every((id) => id.length > 0), `${name} ${list}`).toBe(true)
      }
    }
  })

  it('lists every item with what the sheet says about it', async () => {
    const toribio = await readSheet(last, pj('toribio'))
    expect(toribio.items.find((i) => i.name === 'Armadura de cuero')).toMatchObject({
      kind: 'light',
      equipped: 'armor',
      ac: 11,
    })
    expect(toribio.items.length).toBeGreaterThan(toribio.weapons.length)
  })

  it("reads the spells' school, components and ritual tag", async () => {
    const { spells } = await readSheet(last, pj('abraxas'))
    expect(spells.find((s) => s.name === 'Saeta de Fuego')).toMatchObject({
      school: 'Evocación',
      components: 'V, S',
      ritual: false,
      classes: ['Hechicero', 'Mago'],
    })
    expect(spells.find((s) => s.name === 'Detectar Magia')).toMatchObject({ ritual: true })
    expect(spells.find((s) => s.name === 'Encontrar Familiar')).toMatchObject({
      ritual: true,
      components: expect.stringMatching(/^V, S, M \(/),
    })
  })

  it('returns an empty record when no XML sits beside the note', async () => {
    // Compared against `emptySheet()` rather than a restated literal, which
    // is one more thing that cannot fall behind the type.
    expect(await readSheet(last, pj('no-existe'))).toEqual(emptySheet())
  })
})
