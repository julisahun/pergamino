/**
 * The rules layer: what a level offers, and what an answer turns into.
 *
 * The point these pin, more than any individual number, is that **gaps are
 * ordinary**. A class nobody has written and a level nobody has reached are
 * not errors: they mean nothing is proposed and the patch is whatever a person
 * typed. Nothing here — and nothing in the form — knows which classes exist.
 */
import { describe, expect, it } from 'vitest'
import { emptySheet, SKILLS, type Sheet } from '../character.ts'
import { averageOf, classSlug, grantFor, PROGRESSION } from './progression.ts'
import { buildLevelUp, offerableSpells, toSpell } from './levelup.ts'
import { SPELLS, spellsFor } from './spells.ts'

const pc = (over: Partial<Sheet> = {}): Sheet => ({
  ...emptySheet(),
  name: 'Quien sea',
  level: 1,
  proficiency: 2,
  hpMax: 10,
  abilities: { str: 8, dex: 17, con: 14, int: 16, wis: 12, cha: 15 },
  ...over,
})

describe('the table, and its gaps', () => {
  it('finds a row whatever accents and case the sheet writes the class in', () => {
    expect(classSlug('Pícaro')).toBe('picaro')
    expect(classSlug('CLÉRIGO')).toBe('clerigo')
    expect(grantFor('Pícaro', 2)).not.toBeNull()
    expect(grantFor('pícaro', 2)).not.toBeNull()
  })

  it('returns nothing for a class nobody has written, and does not throw', () => {
    expect(grantFor('Artífice', 2)).toBeNull()
    expect(grantFor('Caballero de la Nada', 2)).toBeNull()
    expect(grantFor(null, 2)).toBeNull()
    expect(grantFor(undefined, 2)).toBeNull()
  })

  it('returns nothing for a level nobody has reached', () => {
    expect(grantFor('Pícaro', 14)).toBeNull()
    expect(grantFor('Pícaro', 0)).toBeNull()
  })

  it('takes the average of a die rather than rolling it', () => {
    expect(averageOf(6)).toBe(4)
    expect(averageOf(8)).toBe(5)
    expect(averageOf(10)).toBe(6)
    expect(averageOf(12)).toBe(7)
  })

  /*
   * The content is hand-written and meant to be edited, so what is checked is
   * that every row can actually be rendered: a skill key the form cannot find,
   * a choice of nothing, or a spell level the table has none of would each be
   * a picker that comes up empty in front of a player.
   */
  it('keeps every written row offerable', () => {
    const keys = new Set(SKILLS.map((s) => s.key))
    for (const [className, levels] of Object.entries(PROGRESSION)) {
      for (const [level, grant] of Object.entries(levels)) {
        const where = `${className} ${level}`
        for (const choice of grant.choices ?? []) {
          expect(choice.pick, where).toBeGreaterThan(0)
          expect(choice.label.length, where).toBeGreaterThan(0)
          if (choice.kind === 'skills') {
            for (const key of choice.from ?? []) expect(keys.has(key), `${where} ${key}`).toBe(true)
            expect((choice.from ?? [...keys]).length, where).toBeGreaterThanOrEqual(choice.pick)
          }
          if (choice.kind === 'spells') {
            const pool = spellsFor(className, choice.maxLevel)
            expect(pool.length, `${where} no tiene conjuros que ofrecer`).toBeGreaterThanOrEqual(choice.pick)
          }
          if (choice.kind === 'features') {
            expect(choice.from.length, where).toBeGreaterThanOrEqual(choice.pick)
          }
        }
        for (const feature of grant.features ?? []) {
          expect(feature.name.length, where).toBeGreaterThan(0)
          expect(feature.text.length, where).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('the spells the creator wrote', () => {
  it('is cantrips and level 1, which is what a level-1 builder knows', () => {
    expect(SPELLS.length).toBeGreaterThan(50)
    expect(new Set(SPELLS.map((s) => s.lvl))).toEqual(new Set([0, 1]))
  })

  it('filters by class and by level', () => {
    const bardo = spellsFor('bardo', 1)
    expect(bardo.length).toBeGreaterThan(0)
    expect(bardo.every((s) => s.classes.includes('bardo'))).toBe(true)
    expect(spellsFor('bardo', 0).every((s) => s.lvl === 0)).toBe(true)
    // A class the table never heard of gets an empty list, not an exception.
    expect(spellsFor('artificiero', 1)).toEqual([])
  })

  it('does not offer what the character already has', () => {
    const first = spellsFor('bardo', 1)[0]!
    const sheet = pc({ className: 'Bardo', spells: [toSpell(first)] })
    expect(offerableSpells(sheet, 1).map((s) => s.es)).not.toContain(first.es)
  })

  it('reads the dice out of the summary, and states none when there are none', () => {
    const damaging = SPELLS.find((s) => /\d+d\d+\s*(de\s+)?\w*\s*da[ñn]o|da[ñn]o\s+\d+d\d+/i.test(s.sum))!
    expect(toSpell(damaging).roll).toMatch(/^\d+d\d+/)
    // «no dice, no action» is what keeps a spell that rolls nothing out of the
    // action bar, so a null here is the point rather than a shortfall.
    const quiet = SPELLS.find((s) => !/\d+\s*d\s*\d+/.test(s.sum))!
    expect(toSpell(quiet).roll).toBeNull()
  })
})

describe('buildLevelUp', () => {
  it('sends only what changed', () => {
    const sheet = pc({ className: 'Pícaro' })
    const patch = buildLevelUp(sheet, grantFor('Pícaro', 2), {
      level: 2,
      hpMax: 15,
      traits: [],
      skills: sheet.skills,
    })
    expect(Object.keys(patch).sort()).toEqual(['hpMax', 'level', 'traits'])
    expect(patch).toMatchObject({ level: 2, hpMax: 15 })
  })

  it('appends what a level grants to what was already there', () => {
    const sheet = pc({
      className: 'Pícaro',
      traits: [{ id: 'suerte', name: 'Suerte', text: 'Repite los 1.', source: 'species' }],
    })
    const patch = buildLevelUp(sheet, grantFor('Pícaro', 2), { level: 2, hpMax: 15 })
    expect(patch.traits!.map((t) => t.name)).toEqual(['Suerte', 'Astucia'])
    expect(patch.traits![1]).toMatchObject({ id: 'astucia', source: 'class' })
  })

  it('takes the picks a choice offers — a bard at 2', () => {
    const sheet = pc({
      className: 'Bardo',
      skills: { interpretacion: { prof: 'proficient' }, persuasion: { prof: 'proficient' } },
      spellcasting: { ability: 'cha', slots: { '1': 2 } },
    })
    const grant = grantFor('Bardo', 2)!
    const spell = offerableSpells(sheet, 1)[0]!
    const patch = buildLevelUp(sheet, grant, {
      level: 2,
      hpMax: 17,
      slots: { '1': 3 },
      picks: {
        experticia: ['interpretacion', 'persuasion'],
        preparado: [spell.es],
      },
    })
    expect(patch.skills).toMatchObject({
      interpretacion: { prof: 'expertise' },
      persuasion: { prof: 'expertise' },
    })
    expect(patch.spellcasting).toMatchObject({ ability: 'cha', slots: { '1': 3 } })
    expect(patch.spells!.map((s) => s.name)).toEqual([spell.es])
    // Aprendiz de todo comes with no decision attached.
    expect(patch.traits!.map((t) => t.name)).toContain('Aprendiz de todo')
  })

  it('keeps a wizard\'s two book spells beside the ones already copied', () => {
    const had = spellsFor('mago', 1)[0]!
    const sheet = pc({
      className: 'Mago',
      spells: [toSpell(had)],
      skills: { arcanos: { prof: 'proficient' } },
      spellcasting: { ability: 'int', slots: { '1': 2 } },
    })
    const pool = offerableSpells(sheet, 1).slice(0, 2)
    const patch = buildLevelUp(sheet, grantFor('Mago', 2), {
      level: 2,
      hpMax: 16,
      picks: { erudito: ['arcanos'], libro: pool.map((s) => s.es) },
    })
    expect(patch.spells!.map((s) => s.name)).toEqual([had.es, ...pool.map((s) => s.es)])
    expect(patch.skills).toMatchObject({ arcanos: { prof: 'expertise' } })
    // Every id is distinct, because the record is edited by id from here on.
    const ids = patch.spells!.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('works with no grant at all — the whole point of the gaps', () => {
    const sheet = pc({ className: 'Caballero de la Nada' })
    const patch = buildLevelUp(sheet, grantFor('Caballero de la Nada', 7), {
      level: 7,
      hpMax: 48,
      traits: [{ name: 'Juramento roto', text: 'Lo que sea que haga.' }],
      skills: { atletismo: { prof: 'proficient' } },
    })
    expect(patch).toMatchObject({ level: 7, hpMax: 48 })
    expect(patch.traits!.map((t) => t.name)).toEqual(['Juramento roto'])
    expect(patch.skills).toMatchObject({ atletismo: { prof: 'proficient' } })
  })

  it('ignores a pick that is not on offer', () => {
    const sheet = pc({ className: 'Pícaro' })
    const patch = buildLevelUp(sheet, grantFor('Pícaro', 2), {
      level: 2,
      hpMax: 15,
      picks: { noExiste: ['loQueSea'], experticia: ['sigilo'] },
    })
    // A rogue's level 2 offers no choices, so neither pick reaches the record.
    expect(patch.skills).toBeUndefined()
    expect(patch.spells).toBeUndefined()
  })

  it('changes nothing when nothing was answered', () => {
    const sheet = pc({ className: 'Pícaro', level: 2 })
    expect(buildLevelUp(sheet, null, { level: 2, hpMax: sheet.hpMax })).toEqual({})
  })
})
