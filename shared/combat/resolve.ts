/**
 * Turning what the DM has in front of them into what happened.
 *
 * This is the arithmetic the action bar does between the fields and the
 * `attack/resolve` it dispatches, kept out of the component so it can be
 * driven without a browser. The component keeps what is genuinely its own:
 * the Spanish on screen, and which field is focused.
 *
 * Everything here is a *proposal*. Nothing has touched the session yet, and
 * the DM can edit any of it before Aplicar — which is why an undecided
 * verdict resolves generously rather than refusing to say.
 */
import type { AttackTarget } from '../actions.ts'
import type { Ref } from '../types.ts'
import { afterSave, hits, isCrit, isFumble, type Attack } from './attacks.ts'

/** What the DM has typed or rolled for one target, before it is an outcome. */
export interface Aim {
  /** The d20 face. Null until rolled or typed. */
  roll: number | null
  /** What the target rolled against the DC, for a save. */
  save: number | null
  /** The DM overruling the verdict with the `⇄`. */
  forced: boolean | null
}

export const emptyAim = (): Aim => ({ roll: null, save: null, forced: null })

/**
 * One target's outcome, or `null` while the action still needs a roll for it.
 *
 * `amount` is the damage or healing *already worked out* for this target — a
 * made save's half is applied here, not in the reducer, because halving is a
 * property of this spell against this creature and the reducer takes outcomes.
 */
export function resolveTarget(
  attack: Attack,
  ref: Ref,
  aim: Aim,
  /** The shared roll: one fireball is one roll for everyone caught in it. */
  amount: number | null,
  /** The target's armour class, when anything states one. */
  ac: number | null,
): AttackTarget | null {
  const rolled = amount ?? 0

  if (attack.kind === 'heal') {
    return { ref, roll: null, hit: true, crit: false, save: null, amount: rolled }
  }

  if (attack.kind === 'save') {
    // Undecided reads as failed: the DM has not said it was saved, and showing
    // the full damage is the honest preview of "nobody has rolled yet".
    const made = aim.save !== null && attack.save !== null && aim.save >= attack.save.dc
    return {
      ref,
      roll: null,
      // For a save, landing and failing the save are the same statement.
      hit: !made,
      crit: false,
      save: aim.save,
      amount: afterSave(rolled, made, attack.save?.half ?? false),
    }
  }

  if (aim.roll === null) return null

  // With no bonus stated there is nothing to add to the face, so no total to
  // compare — and none is invented. `hits` says the same about a missing AC.
  const verdict = attack.mod === null ? null : hits(aim.roll, attack.mod, ac)
  // Undecided lands, because the `⇄` is right beside it and a swing the DM
  // bothered to type a number for usually connected. A natural 1 never does.
  const hit = aim.forced ?? verdict ?? !isFumble(aim.roll)
  return {
    ref,
    roll: aim.roll,
    hit,
    crit: isCrit(aim.roll) && hit,
    save: null,
    amount: hit ? rolled : 0,
  }
}

/**
 * Whether the damage roll should double its dice.
 *
 * One swing is one roll, so the first critical among the targets decides it.
 * A save has no critical at all — a cone is not a to-hit — and neither does a
 * heal.
 */
export const critical = (attack: Attack, outcomes: (AttackTarget | null)[]): boolean =>
  attack.kind === 'attack' && outcomes.some((o) => o?.crit === true)

/** What the target is left on. Capped both ways, so a preview cannot lie. */
export function hpAfter(
  attack: Attack,
  outcome: AttackTarget,
  hp: number | null,
  hpMax: number | null,
): number | null {
  if (hp === null) return null
  return attack.kind === 'heal'
    ? Math.min(hpMax ?? Infinity, hp + outcome.amount)
    : Math.max(0, hp - outcome.amount)
}
