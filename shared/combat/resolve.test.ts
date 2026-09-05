/**
 * The arithmetic between the fields and the action.
 *
 * It used to live inside `ActionBar` and could only be checked by driving a
 * browser, which is why the save-halving and the undecided verdict — the two
 * rules most likely to be got wrong — had no test of their own.
 */
import { describe, expect, it } from 'vitest'
import type { Ref } from '../types.ts'
import type { Attack } from './attacks.ts'
import { critical, emptyAim, hpAfter, resolveTarget, type Aim } from './resolve.ts'

const REF: Ref = 'npc:a'

const attack = (over: Partial<Attack> = {}): Attack => ({
  id: 'cimitarra',
  name: 'Cimitarra',
  kind: 'attack',
  mod: 3,
  dice: { count: 1, sides: 6, mod: 1 },
  save: null,
  level: null,
  origin: 'pnj',
  ...over,
})

const cone = (half: boolean): Attack =>
  attack({
    id: 'manos',
    name: 'Manos Ardientes',
    kind: 'save',
    mod: null,
    dice: { count: 3, sides: 6, mod: 0 },
    save: { dc: 13, ability: 'Destreza', half },
    level: 1,
    origin: 'spell',
  })

const heal = (): Attack =>
  attack({
    id: 'palabra',
    name: 'Palabra Curativa',
    kind: 'heal',
    mod: null,
    dice: { count: 2, sides: 4, mod: 3 },
    level: 1,
    origin: 'spell',
  })

const aim = (over: Partial<Aim> = {}): Aim => ({ ...emptyAim(), ...over })

describe('an attack roll', () => {
  it('waits until something has been rolled', () => {
    expect(resolveTarget(attack(), REF, emptyAim(), 5, 12)).toBeNull()
  })

  it('compares the total against the armour class', () => {
    expect(resolveTarget(attack(), REF, aim({ roll: 15 }), 5, 12)).toMatchObject({
      hit: true,
      amount: 5,
    })
    expect(resolveTarget(attack(), REF, aim({ roll: 4 }), 5, 12)).toMatchObject({
      hit: false,
      // A miss takes nothing off, whatever is in the damage field.
      amount: 0,
    })
  })

  it('marks a natural 20 and never a missed one', () => {
    expect(resolveTarget(attack(), REF, aim({ roll: 20 }), 5, 30)).toMatchObject({
      hit: true,
      crit: true,
    })
    expect(resolveTarget(attack(), REF, aim({ roll: 1 }), 5, 2)).toMatchObject({
      hit: false,
      crit: false,
    })
  })

  it('lands when nothing states an armour class, rather than refusing', () => {
    // The ⇄ is right beside it; defaulting to a miss would mean two clicks for
    // the ordinary case.
    expect(resolveTarget(attack(), REF, aim({ roll: 11 }), 5, null)).toMatchObject({ hit: true })
    // Except a natural 1, which is never undecided.
    expect(resolveTarget(attack(), REF, aim({ roll: 1 }), 5, null)).toMatchObject({ hit: false })
  })

  it('invents no total when the note gave no bonus', () => {
    // Gerald's Devastating Cuddle: 2d8+4 and nothing to add to the face.
    const cuddle = attack({ mod: null })
    expect(resolveTarget(cuddle, REF, aim({ roll: 3 }), 9, 20)).toMatchObject({ hit: true })
  })

  it('lets the DM overrule either way', () => {
    expect(
      resolveTarget(attack(), REF, aim({ roll: 15, forced: false }), 5, 12),
    ).toMatchObject({ hit: false, amount: 0 })
    expect(
      resolveTarget(attack(), REF, aim({ roll: 4, forced: true }), 5, 12),
    ).toMatchObject({ hit: true, amount: 5 })
  })
})

describe('a save', () => {
  it('halves a made one and says the save landed', () => {
    expect(resolveTarget(cone(true), REF, aim({ save: 16 }), 11, 12)).toMatchObject({
      hit: false,
      save: 16,
      amount: 5,
    })
  })

  it('stops it dead when a success is not for half', () => {
    expect(resolveTarget(cone(false), REF, aim({ save: 16 }), 11, 12)).toMatchObject({
      hit: false,
      amount: 0,
    })
  })

  it('takes all of it from whoever failed', () => {
    expect(resolveTarget(cone(true), REF, aim({ save: 9 }), 11, 12)).toMatchObject({
      hit: true,
      amount: 11,
    })
  })

  it('reads an unrolled save as failed, so the preview shows the whole thing', () => {
    expect(resolveTarget(cone(true), REF, emptyAim(), 11, 12)).toMatchObject({
      hit: true,
      save: null,
      amount: 11,
    })
  })

  it('needs no armour class and never crits', () => {
    expect(resolveTarget(cone(true), REF, aim({ save: 9 }), 11, null)).toMatchObject({
      crit: false,
      roll: null,
    })
  })
})

describe('a heal', () => {
  it('always lands, with no roll to make it', () => {
    expect(resolveTarget(heal(), REF, emptyAim(), 7, null)).toEqual({
      ref: REF,
      roll: null,
      hit: true,
      crit: false,
      save: null,
      amount: 7,
    })
  })
})

describe('the damage roll', () => {
  it('doubles for the first critical among the targets', () => {
    const outcomes = [
      resolveTarget(attack(), 'npc:a', aim({ roll: 8 }), 0, 12),
      resolveTarget(attack(), 'npc:b', aim({ roll: 20 }), 0, 12),
    ]
    expect(critical(attack(), outcomes)).toBe(true)
  })

  it('never doubles a cone or a heal', () => {
    const outcomes = [resolveTarget(cone(true), REF, aim({ save: 2 }), 0, 12)]
    expect(critical(cone(true), outcomes)).toBe(false)
    expect(critical(heal(), [resolveTarget(heal(), REF, emptyAim(), 0, null)])).toBe(false)
  })

  it('does not double a critical the DM overruled into a miss', () => {
    const outcomes = [resolveTarget(attack(), REF, aim({ roll: 20, forced: false }), 0, 12)]
    expect(critical(attack(), outcomes)).toBe(false)
  })
})

describe('hpAfter', () => {
  const hit = (amount: number) => resolveTarget(attack(), REF, aim({ roll: 20 }), amount, 12)!

  it('never previews below zero or above the maximum', () => {
    expect(hpAfter(attack(), hit(30), 9, 9)).toBe(0)
    expect(hpAfter(heal(), { ...hit(30), amount: 30 }, 8, 9)).toBe(9)
  })

  it('says nothing about somebody with no hit points known', () => {
    expect(hpAfter(attack(), hit(5), null, null)).toBeNull()
  })
})
