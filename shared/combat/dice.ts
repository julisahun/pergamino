/**
 * Dice, as a campaign note writes them: `1d6+1`, `3d6`, `1d4 +2`.
 *
 * Rolling lives here rather than in the reducer on purpose. `reduce` is
 * deterministic — `ReduceOpts` injects ids so the whole suite can drive it
 * without stubbing a generator — and a fight is the one place the DM wants a
 * die pressed for them. The console rolls, the result travels in the action,
 * and both properties survive.
 */

export interface Dice {
  count: number
  sides: number
  /** The flat part: `+1` in `1d6+1`, `0` when the source states none. */
  mod: number
}

/**
 * `1d6+1`, `3d6`, `1d4 +2`, `1d6 -1` — anywhere inside a longer sentence.
 *
 * The space before the sign is what the Fight Club sheets write (`daño 1d4 +2
 * perforante`) and the pnj notes do not (`1d6+1 de daño cortante`), so it is
 * optional on both sides.
 */
const DICE = /(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?/

export function parseDice(text: string): Dice | null {
  const m = DICE.exec(text)
  if (!m) return null
  const sides = Number.parseInt(m[2]!, 10)
  if (sides <= 0) return null
  const mod = m[4] ? Number.parseInt(m[4], 10) * (m[3] === '-' ? -1 : 1) : 0
  return { count: Number.parseInt(m[1]!, 10), sides, mod }
}

/** `{count: 1, sides: 6, mod: 1}` → `1d6+1`. */
export const formatDice = (d: Dice): string =>
  `${d.count}d${d.sides}${d.mod === 0 ? '' : d.mod < 0 ? d.mod : `+${d.mod}`}`

/** The same dice with a different flat part — a heal's casting modifier. */
export const withMod = (d: Dice, mod: number): Dice => ({ ...d, mod })

export type Rng = () => number

const d = (sides: number, rng: Rng): number => 1 + Math.floor(rng() * sides)

/**
 * Roll, never below zero — a `1d6-1` that comes up 1 deals nothing rather
 * than healing its target.
 *
 * A critical doubles the dice and leaves the flat part alone, which is the
 * one piece of 5e arithmetic in here; everything else this app reads off a
 * sheet rather than deriving. It is doubled *dice*, not a doubled total, so
 * it has to happen where the dice are.
 */
export function rollDice(spec: Dice, opts: { crit?: boolean; rng?: Rng } = {}): number {
  const rng = opts.rng ?? Math.random
  const count = opts.crit ? spec.count * 2 : spec.count
  let total = spec.mod
  for (let i = 0; i < count; i++) total += d(spec.sides, rng)
  return Math.max(0, total)
}

/** One d20 face. The modifier is added where the verdict is worked out. */
export const rollD20 = (rng: Rng = Math.random): number => d(20, rng)
