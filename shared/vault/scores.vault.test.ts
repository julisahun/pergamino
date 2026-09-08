/**
 * `scores` against the campaign it was written for.
 *
 * `pnj-scores.test.ts` pins the parsing; this pins the *coverage*, the way
 * `attacks.vault.test.ts` does for attacks: that every pnj the app will seat
 * states its six, so the ficha has a saving throw to show when a player casts
 * something with a CD. A note written without them is not an error — it shows
 * a line telling the DM what to add — but it is a gap, and this is what says
 * so here rather than at the table.
 */
import { describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { isCombatant } from './pnj.ts'
import { saveRows } from '../skills.ts'

describe('every pnj the app can seat', () => {
  it('states all six of its scores', async () => {
    const { pnjs } = await (await openWorld()).loadCampaign()
    const missing = pnjs.filter(isCombatant).filter((p) => p.scores === null)
    expect(missing.map((p) => p.id)).toEqual([])
  })

  it('has a modifier for every saving throw, and no invented zero', async () => {
    const { pnjs } = await (await openWorld()).loadCampaign()
    for (const pnj of pnjs.filter(isCombatant)) {
      const rows = saveRows(pnj.scores, pnj.saves)
      expect(rows, pnj.id).toHaveLength(6)
      // Stated is the note's own number; the rest are arithmetic on `scores`.
      // Neither may be null for a seated creature — that is the whole point.
      for (const row of rows) expect(row.mod, `${pnj.id}/${row.label}`).not.toBeNull()
    }
  })

  it('quotes a save only where something in the fiction pays for it', async () => {
    const { pnjs } = await (await openWorld()).loadCampaign()
    const quoted = Object.fromEntries(
      pnjs.filter((p) => Object.keys(p.saves).length > 0).map((p) => [p.id, p.saves]),
    )
    // The bandit leader wears the Anillo de la Corriente Ahogada, whose note
    // says «+1 a todas las tiradas de salvación». That is the only stated save
    // in the campaign, and it comes off the day the party takes the ring.
    expect(quoted).toEqual({
      'bandido-lider': { str: 1, dex: 2, con: 2, int: 1, wis: 1, cha: 1 },
    })
  })
})
