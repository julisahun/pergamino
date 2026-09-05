/**
 * Seating: giving a PC a row in `state.play` so it can be addressed.
 *
 * `state.play` is the live layer, and a `hp/damage` at someone who is not in
 * it does nothing. The party is whoever is seated. Someone already seated
 * keeps their row — with `hp` filled from the max if it was never set — and
 * someone new starts at full HP. Nobody is unseated here: a run only
 * accumulates, and taking a character out is a decision, not a side effect of
 * reading the party again.
 */
import type { SessionState } from '../types.ts'
import { emptyLiveState } from '../vault/session.ts'

export interface Seat {
  id: string
  /** From the sheet. Null when there is none — the row exists, hp does not. */
  hpMax: number | null
}

export function seatParty(state: SessionState, party: Seat[]): SessionState {
  const play = { ...state.play }
  for (const { id, hpMax } of party) {
    const existing = play[id]
    play[id] = existing ? { ...existing, hp: existing.hp ?? hpMax } : emptyLiveState(hpMax)
  }
  return { ...state, play }
}
