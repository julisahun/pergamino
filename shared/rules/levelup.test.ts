/**
 * The rules layer: what a level offers, and what an answer turns into.
 *
 * The point these pin, more than any individual number, is that **the row
 * decides and the person only picks**: level, hit points and slots come from
 * the table, every choice has to be answered, and a class or level nobody has
 * written is not an error — it is simply not something this form can take.
 * Nothing here — and nothing in the form — knows which classes exist.
 */
import { describe, expect, it } from 'vitest'
import { emptySheet, SKILLS, type Sheet } from '../character.ts'
import { averageOf, classSlug, grantFor, PROGRESSION } from './progression.ts'
import {
  buildLevelUp,
  missingPicks,
  nextLevel,
  offerableSpells,
  skillOptions,
  spellOffer,
  toSpell,
} from './levelup.ts'
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
            const pool = spellsFor(className, choice.maxLevel).filter((s) => s.lvl >= 1)
            expect(pool.length, `${where} no tiene conjuros que ofrecer`).toBeGreaterThanOrEqual(choice.pick)
            // A recommendation the pool does not hold would silently vanish.
            const names = new Set(pool.map((s) => s.es))
            for (const name of choice.recommended ?? []) {
              expect(names.has(name), `${where} recomienda ${name}, que no está en su lista`).toBe(true)
            }
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

  it('does not offer cantrips: no level-up choice grants one', () => {
    expect(offerableSpells(pc({ className: 'Mago' }), 1).every((s) => s.lvl === 1)).toBe(true)
  })

  it('does not offer what the character already has', () => {
    const first = spellsFor('bardo', 1).find((s) => s.lvl === 1)!
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

describe('the offer', () => {
  it('goes to the next level, with that level\'s row', () => {
    expect(nextLevel(pc({ className: 'Pícaro' }))).toMatchObject({ level: 2 })
    expect(nextLevel(pc({ className: 'Pícaro' })).grant).not.toBeNull()
    // No row is not an error: the form says so and offers nothing to type.
    expect(nextLevel(pc({ className: 'Pícaro', level: 2 })).grant).toBeNull()
    expect(nextLevel(pc({ className: 'Caballero de la Nada' })).grant).toBeNull()
  })

  it('puts the recommended spells first, in the order written, and keeps the rest', () => {
    const sheet = pc({ className: 'Mago' })
    const choice = grantFor('Mago', 2)!.choices!.find((c) => c.kind === 'spells')!
    if (choice.kind !== 'spells') throw new Error('unreachable')
    const { recommended, rest } = spellOffer(sheet, choice)
    expect(recommended.map((s) => s.es)).toEqual(choice.recommended)
    expect(rest.length).toBeGreaterThan(0)
    expect(rest.some((s) => choice.recommended!.includes(s.es))).toBe(false)
  })

  it('drops a recommendation the character already knows', () => {
    const escudo = spellsFor('mago', 1).find((s) => s.es === 'Escudo')!
    const sheet = pc({ className: 'Mago', spells: [toSpell(escudo)] })
    const choice = grantFor('Mago', 2)!.choices!.find((c) => c.kind === 'spells')!
    if (choice.kind !== 'spells') throw new Error('unreachable')
    expect(spellOffer(sheet, choice).recommended.map((s) => s.es)).not.toContain('Escudo')
  })

  it('offers expertise only where the character is already proficient', () => {
    const sheet = pc({
      className: 'Mago',
      skills: { arcanos: { prof: 'proficient' }, historia: { prof: 'proficient' }, sigilo: { prof: 'proficient' } },
    })
    const choice = grantFor('Mago', 2)!.choices!.find((c) => c.kind === 'skills')!
    if (choice.kind !== 'skills') throw new Error('unreachable')
    // Sigilo is proficient but not on Erudito's list; the rest are not proficient.
    expect(skillOptions(sheet, choice).sort()).toEqual(['arcanos', 'historia'])
  })

  it('holds the level-up until every choice is answered', () => {
    const sheet = pc({
      className: 'Bardo',
      skills: { interpretacion: { prof: 'proficient' }, persuasion: { prof: 'proficient' } },
    })
    const grant = grantFor('Bardo', 2)!
    expect(missingPicks(sheet, grant, {}).map((c) => c.id).sort()).toEqual(['experticia', 'preparado'])
    const spell = offerableSpells(sheet, 1)[0]!.es
    expect(missingPicks(sheet, grant, { experticia: ['interpretacion'], preparado: [spell] }).map((c) => c.id)).toEqual(['experticia'])
    expect(missingPicks(sheet, grant, { experticia: ['interpretacion', 'persuasion'], preparado: [spell] })).toEqual([])
  })

  it('asks for no more than there is to take', () => {
    // One proficiency, two expertises on offer: one is all there is.
    const sheet = pc({ className: 'Bardo', skills: { interpretacion: { prof: 'proficient' } } })
    const spell = offerableSpells(sheet, 1)[0]!.es
    expect(missingPicks(sheet, grantFor('Bardo', 2)!, { experticia: ['interpretacion'], preparado: [spell] })).toEqual([])
  })
})

describe('buildLevelUp', () => {
  it('takes level, hit points and slots from the row, not from a person', () => {
    const sheet = pc({ className: 'Mago', hpMax: 9, spellcasting: { ability: 'int', slots: { '1': 2 } } })
    const patch = buildLevelUp(sheet, grantFor('Mago', 2)!)
    expect(patch.level).toBe(2)
    // A d6 averages 4.
    expect(patch.hpMax).toBe(13)
    expect(patch.spellcasting).toMatchObject({ ability: 'int', slots: { '1': 3 } })
  })

  it('appends what a level grants to what was already there', () => {
    const sheet = pc({
      className: 'Pícaro',
      traits: [{ id: 'suerte', name: 'Suerte', text: 'Repite los 1.', source: 'species' }],
    })
    const patch = buildLevelUp(sheet, grantFor('Pícaro', 2)!)
    expect(patch.traits!.map((t) => t.name)).toEqual(['Suerte', 'Astucia'])
    expect(patch.traits![1]).toMatchObject({ id: 'astucia', source: 'class' })
    expect(Object.keys(patch).sort()).toEqual(['hpMax', 'level', 'traits'])
  })

  it('takes the picks a choice offers — a bard at 2', () => {
    const sheet = pc({
      className: 'Bardo',
      skills: { interpretacion: { prof: 'proficient' }, persuasion: { prof: 'proficient' } },
      spellcasting: { ability: 'cha', slots: { '1': 2 } },
    })
    const spell = offerableSpells(sheet, 1)[0]!
    const patch = buildLevelUp(sheet, grantFor('Bardo', 2)!, {
      experticia: ['interpretacion', 'persuasion'],
      preparado: [spell.es],
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
    const had = spellsFor('mago', 1).find((s) => s.lvl === 1)!
    const sheet = pc({
      className: 'Mago',
      spells: [toSpell(had)],
      skills: { arcanos: { prof: 'proficient' } },
      spellcasting: { ability: 'int', slots: { '1': 2 } },
    })
    const pool = offerableSpells(sheet, 1).slice(0, 2)
    const patch = buildLevelUp(sheet, grantFor('Mago', 2)!, {
      erudito: ['arcanos'],
      libro: pool.map((s) => s.es),
    })
    expect(patch.spells!.map((s) => s.name)).toEqual([had.es, ...pool.map((s) => s.es)])
    expect(patch.skills).toMatchObject({ arcanos: { prof: 'expertise' } })
    // Every id is distinct, because the record is edited by id from here on.
    const ids = patch.spells!.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ignores a pick that is not on offer', () => {
    const sheet = pc({ className: 'Bardo', skills: { interpretacion: { prof: 'proficient' } } })
    const patch = buildLevelUp(sheet, grantFor('Bardo', 2)!, {
      noExiste: ['loQueSea'],
      // Not proficient in Sigilo, so expertise cannot land there.
      experticia: ['sigilo'],
      preparado: ['Luz'],
    })
    expect(patch.skills).toBeUndefined()
    expect(patch.spells).toBeUndefined()
  })
})
