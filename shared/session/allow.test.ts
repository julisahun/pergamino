/**
 * The player allowlist, as a table: who asked, what for, and the verdict.
 */
import { describe, expect, it } from 'vitest'
import type { Action } from '../actions.ts'
import type { Actor } from '../protocol.ts'
import { emptySession } from '../vault/session.ts'
import { allowed } from './allow.ts'
import { seatParty } from './seat.ts'

const dm: Actor = { kind: 'dm' }
const tal: Actor = { kind: 'pc', pcId: 'tal' }

const state = (() => {
  const s = seatParty(emptySession(), [{ id: 'tal', hpMax: 9 }, { id: 'nel', hpMax: 12 }])
  s.play['tal']!.objects.push('anillo')
  return s
})()

const cases: [string, Actor, Action, true | string][] = [
  ['the DM may do anything', dm, { type: 'rest/long', refs: ['pc:tal'] }, true],
  ['a player may hurt themselves', tal, { type: 'hp/damage', ref: 'pc:tal', amount: 3 }, true],
  ['and heal, and set temp', tal, { type: 'hp/temp', ref: 'pc:tal', temp: 5 }, true],
  ['and mark a death save', tal, { type: 'death/mark', ref: 'pc:tal', outcome: 'fail' }, true],
  ['and spend a slot', tal, { type: 'slots/set', ref: 'pc:tal', level: '1', spent: 1 }, true],
  ['and spend a charge of something they hold', tal, { type: 'object/charges', objectId: 'anillo', uses: 2 }, true],
  ['but not of something they do not', tal, { type: 'object/charges', objectId: 'lagrima', uses: 2 }, 'not-holding'],
  ['not someone else', tal, { type: 'hp/damage', ref: 'pc:nel', amount: 3 }, 'not-your-pc'],
  ['not an NPC', tal, { type: 'hp/damage', ref: 'npc:n1', amount: 3 }, 'not-your-pc'],
  ["not the DM's calls", tal, { type: 'hp/full', ref: 'pc:tal' }, 'not-a-player-action'],
  ['not a rest', tal, { type: 'rest/short', refs: ['pc:tal'] }, 'not-a-player-action'],
  ['not giving themselves things', tal, { type: 'object/give', ref: 'pc:tal', objectId: 'anillo' }, 'not-a-player-action'],
  ["not the DM's note about them", tal, { type: 'live/note', ref: 'pc:tal', note: 'x' }, 'not-a-player-action'],
  ['not the table', tal, { type: 'scene/show', sceneId: 'faro' }, 'not-a-player-action'],
  ['not a negative amount', tal, { type: 'hp/damage', ref: 'pc:tal', amount: -3 }, 'bad-number'],
  ['not a fraction', tal, { type: 'gold/set', ref: 'pc:tal', gold: 1.5 }, 'bad-number'],
  ['not infinity', tal, { type: 'hp/set', ref: 'pc:tal', hp: Number.POSITIVE_INFINITY }, 'bad-number'],
  ['not a novel', tal, { type: 'inventory/set', ref: 'pc:tal', text: 'x'.repeat(4001) }, 'too-long'],
  ['not a condition that is a paragraph', tal, { type: 'condition/toggle', ref: 'pc:tal', condition: 'x'.repeat(41) }, 'too-long'],
  ['not a slot level that is not one', tal, { type: 'slots/set', ref: 'pc:tal', level: '10', spent: 1 }, 'bad-level'],
]

describe('allowed', () => {
  for (const [name, actor, action, verdict] of cases) {
    it(name, () => {
      expect(allowed(actor, action, state)).toBe(verdict)
    })
  }
})
