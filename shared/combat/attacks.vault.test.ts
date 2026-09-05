/**
 * The parser against the campaign it was written for.
 *
 * `attacks.test.ts` pins the sentences; this pins the *coverage* — that every
 * pnj the app will seat has something to swing, and that the four spells which
 * must stay off the list are still off it. It is the check that matters when
 * the DM writes a new statblock: if a note words its attack some other way,
 * this is what says so, rather than an empty menu at the table.
 */
import { describe, expect, it } from 'vitest'
import { loadParty, openWorld } from '../../test/fixture.ts'
import { isCombatant } from '../vault/pnj.ts'
import { attacksOfPnj, attacksOfSheet } from './attacks.ts'
import { formatDice } from './dice.ts'

describe('every pnj the app can seat', () => {
  it('yields exactly the attacks its note states', async () => {
    const { pnjs: all } = await (await openWorld()).loadCampaign()
    const pnjs = all.filter(isCombatant)
    const found = Object.fromEntries(
      pnjs.map((p) => [
        p.id,
        attacksOfPnj(p).map((a) => `${a.name} ${a.mod} ${formatDice(a.dice)}`),
      ]),
    )
    expect(found).toEqual({
      'bandido-lider': ['Cimitarra 3 1d6+1'],
      bandido: ['Cimitarra 3 1d6+1'],
      cristelle: ['Daga 2 1d4'],
      galo: ['Garrote 2 1d4'],
      'lancero-hundido': ['Lanza corroída 3 1d6+1'],
      ossian: ['Mandoble de acero de Brona 3 1d6+2'],
      raimo: ['Bichero 2 1d4'],
      'soldado-ahogado': ['Espada oxidada 3 1d6+1'],
      tulio: ['Espada de la guerra 3 1d6+1'],
      // Three the party only ever talks to. They have hit points, so they can
      // be seated; they have nothing written down to do with them.
      dairwen: [],
      maraia: [],
      vann: [],
    })
  })
})

describe('the party', () => {
  it('gets a weapon and, where the sheet casts, its spells', async () => {
    const { characters, sheets } = await loadParty(await openWorld())
    expect(characters.length).toBeGreaterThan(0)

    for (const character of characters) {
      const attacks = attacksOfSheet(sheets.get(character.id))
      // Every one of them carries something. A character with no weapon and no
      // spell would be a sheet this could not read.
      expect(attacks.length, character.id).toBeGreaterThan(0)
      for (const attack of attacks) {
        expect(attack.dice.count, `${character.id}/${attack.name}`).toBeGreaterThan(0)
        if (attack.kind === 'save') expect(attack.save!.dc).toBeGreaterThan(0)
      }
    }
  })

  it('offers no spell it only half understands', async () => {
    const { sheets } = await loadParty(await openWorld())
    const offered = new Set(
      [...sheets.values()].flatMap((s) => attacksOfSheet(s).map((a) => a.name)),
    )
    // Misil Mágico is three darts at 1d4+1 that never miss, and its `<roll>`
    // says none of that; the other three are dice that are not damage.
    for (const name of ['Misil Mágico', 'Grasa', 'Bendición', 'Guía', 'Fuego Feérico']) {
      expect(offered.has(name), name).toBe(false)
    }
  })
})
