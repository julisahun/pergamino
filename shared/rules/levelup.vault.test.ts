/**
 * The recommendations against the party they are for.
 *
 * A spell the character already knows is dropped from the recommended list,
 * and a level-1 build already holds the obvious picks — so a list that looks
 * generous in `progression.ts` can leave a real mage with one suggestion for
 * a choice of two. This is what says so before the table does.
 */
import { describe, expect, it } from 'vitest'
import { loadParty, openWorld } from '../../test/fixture.ts'
import { nextLevel, spellOffer } from './levelup.ts'

/** Recommendations left over the pick, so there is still a choice to make. */
const SPARE = 2

describe('the real party at its next level', () => {
  it('still gets a real choice of recommended spells', async () => {
    const { characters, sheets } = await loadParty(await openWorld())
    const short: string[] = []
    for (const c of characters) {
      const sheet = sheets.get(c.id)!
      const { grant } = nextLevel(sheet)
      for (const choice of grant?.choices ?? []) {
        if (choice.kind !== 'spells') continue
        const left = spellOffer(sheet, choice).recommended.length
        if (left < choice.pick + SPARE) short.push(`${c.name}: ${left} recomendados para elegir ${choice.pick}`)
      }
    }
    expect(short).toEqual([])
  })
})
