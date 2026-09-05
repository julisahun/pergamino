import { describe, expect, it } from 'vitest'
import { formatDice, parseDice, rollDice, withMod, type Rng } from './dice.ts'

/**
 * A generator that makes every die of `sides` show `face`.
 *
 * `rollDice` turns a fraction into a face with `1 + floor(rng() * sides)`, so
 * the fraction that lands on a given face is `(face - 1) / sides`.
 */
const always = (face: number, sides: number): Rng => () => (face - 1) / sides

describe('parseDice', () => {
  it('reads both ways the campaign writes a die', () => {
    expect(parseDice('1d6+1')).toEqual({ count: 1, sides: 6, mod: 1 })
    expect(parseDice('1d4 +2')).toEqual({ count: 1, sides: 4, mod: 2 })
    expect(parseDice('1d6 -1')).toEqual({ count: 1, sides: 6, mod: -1 })
    expect(parseDice('3d6')).toEqual({ count: 3, sides: 6, mod: 0 })
  })

  it('finds the die inside a sentence', () => {
    expect(parseDice('+3 al ataque, 1d6+1 de daño cortante.')).toEqual({
      count: 1,
      sides: 6,
      mod: 1,
    })
  })

  it('is null when there is no die', () => {
    expect(parseDice('Propiedades: sutil, ligera.')).toBeNull()
    expect(parseDice('')).toBeNull()
  })

  it('round-trips through formatDice', () => {
    for (const text of ['1d6+1', '3d6', '1d6-1', '2d8+3']) {
      expect(formatDice(parseDice(text)!)).toBe(text)
    }
  })
})

describe('rollDice', () => {
  it('adds the flat part once, not once per die', () => {
    // 3d6+2 with every die showing 4 is 12 + 2, never 12 + 6.
    expect(rollDice({ count: 3, sides: 6, mod: 2 }, { rng: always(4, 6) })).toBe(14)
  })

  it('doubles the dice on a critical and leaves the modifier alone', () => {
    const spec = { count: 1, sides: 6, mod: 1 }
    const rng = always(6, 6)
    expect(rollDice(spec, { rng })).toBe(7)
    expect(rollDice(spec, { crit: true, rng })).toBe(13)
  })

  it('never goes below zero', () => {
    expect(rollDice({ count: 1, sides: 4, mod: -10 }, { rng: always(1, 4) })).toBe(0)
  })

  it('stays inside the range of the dice', () => {
    const spec = { count: 2, sides: 8, mod: 3 }
    for (let i = 0; i < 200; i++) {
      const n = rollDice(spec)
      expect(n).toBeGreaterThanOrEqual(5)
      expect(n).toBeLessThanOrEqual(19)
    }
  })
})

describe('withMod', () => {
  it('replaces the flat part — a heal takes the casting modifier', () => {
    expect(formatDice(withMod(parseDice('2d4')!, 3))).toBe('2d4+3')
  })
})
