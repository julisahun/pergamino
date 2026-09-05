/**
 * What a player may do to the session: their own character's live layer, and
 * nothing else.
 *
 * The check is pure so the server can refuse before `reduce` and the phone can
 * grey a control out for the same reason, from the same function. The DM is
 * allowed everything; the list below is the whole of what a player is.
 */
import type { Action, ActionType } from '../actions.ts'
import type { Actor } from '../protocol.ts'
import type { SessionState } from '../types.ts'
import { makeRef } from '../types.ts'

/**
 * Deliberately absent: `hp/full`, the rests, giving and taking objects and
 * `loot/transfer` (the DM's calls), and `live/note` (the DM's note *about*
 * the character, not the player's).
 */
export const PLAYER_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  'hp/damage',
  'hp/heal',
  'hp/set',
  'hp/temp',
  'condition/toggle',
  'condition/clear',
  'exh/set',
  'death/mark',
  'death/reset',
  'gold/set',
  'inventory/set',
  'slots/set',
  'object/charges',
])

export type Refusal =
  | 'not-a-player-action'
  | 'not-your-pc'
  | 'not-holding'
  | 'bad-number'
  | 'too-long'
  | 'bad-level'

const MAX_TEXT = 4000
const MAX_CONDITION = 40

/** `true`, or why not — a code the UI turns into Spanish. */
export function allowed(actor: Actor, action: Action, state: SessionState): true | Refusal {
  if (actor.kind === 'dm') return true
  if (!PLAYER_ACTIONS.has(action.type)) return 'not-a-player-action'

  const mine = makeRef('pc', actor.pcId)
  if ('ref' in action && action.ref !== mine) return 'not-your-pc'

  // Charges belong to the object, not the holder, so the action carries no
  // ref — what ties it to this player is that they are the one carrying it.
  if (action.type === 'object/charges') {
    if (!state.play[actor.pcId]?.objects.includes(action.objectId)) return 'not-holding'
  }

  for (const value of Object.values(action)) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return 'bad-number'
    if (typeof value === 'string' && value.length > MAX_TEXT) return 'too-long'
  }
  if (action.type === 'condition/toggle' && action.condition.length > MAX_CONDITION) return 'too-long'
  if (action.type === 'slots/set' && !/^[1-9]$/.test(action.level)) return 'bad-level'
  return true
}
