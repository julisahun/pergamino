/**
 * The player projection keeps the television's discipline: what the phone
 * must not know is absent from the view. Asserted the blunt way, on the
 * serialised object.
 */
import { describe, expect, it } from 'vitest'
import type { Action } from '../actions.ts'
import type { PublishedObject, PublishedPnj } from '../protocol.ts'
import type { SessionState } from '../types.ts'
import { emptySession } from '../vault/session.ts'
import { parseSheet } from '../vault/sheet.ts'
import { projectPlayer, type PlayerContext } from './player.ts'
import { contextOf, pcInfoOf } from './projection.ts'
import { reduce } from './reducer.ts'
import { seatParty } from './seat.ts'

const pnj = (id: string, name: string, alias: string | null): PublishedPnj => ({
  id,
  name,
  alias,
  tag: null,
  ac: 12,
  hpMax: 11,
  initMod: 1,
  speed: null,
  portrait: null,
  abilities: [{ id: 'a', name: 'Lanza', desc: '+4 al ataque, 1d6+2 de daño' }],
  file: `pnj/${id}.md`,
})
const BANDIDO = pnj('bandido', 'Bandido', null)
const TULIO = pnj('tulio', 'Tulio', 'Soldado ahogado')

const ANILLO: PublishedObject = {
  id: 'anillo',
  name: 'Anillo',
  usos: 3,
  mods: { ac: 1 },
  effects: ['Brilla en la oscuridad.'],
  file: 'objects/anillo.md',
}

const talSheet = parseSheet(
  `<pc><character><name>Tal</name><hpMax>9</hpMax><abilities>10,16,12,10,10,10,</abilities></character></pc>`,
)
const nelSheet = parseSheet(`<pc><character><name>Nel</name><hpMax>12</hpMax></character></pc>`)

const ctx: PlayerContext = {
  ...contextOf(
    'Marea Chica',
    [],
    [BANDIDO, TULIO],
    new Map([
      ['tal', pcInfoOf({ id: 'tal', name: 'Tal', player: 'Ana', portrait: null }, talSheet)],
      ['nel', pcInfoOf({ id: 'nel', name: 'Nel', player: 'Bea', portrait: null }, nelSheet)],
    ]),
  ),
  campaignId: 'c-1',
  sheets: new Map([
    ['tal', talSheet],
    ['nel', nelSheet],
  ]),
  objects: new Map([[ANILLO.id, ANILLO]]),
}

/** A table mid-fight, with every kind of secret in it. */
function scenario(): SessionState {
  let state = seatParty(emptySession(), [
    { id: 'tal', hpMax: 9 },
    { id: 'nel', hpMax: 12 },
  ])
  let n = 0
  const run = (action: Action) => {
    state = reduce(state, action, 0, {
      pnj: (id) => [BANDIDO, TULIO].find((p) => p.id === id) as never,
      object: (id) => (id === ANILLO.id ? ({ ...ANILLO, description: 'SOLO PARA EL DM' } as never) : undefined),
      newId: () => `n${++n}`,
    }).state
  }
  run({ type: 'npc/add', pnjId: 'bandido', count: 1 }) // n1, hidden by default
  run({ type: 'npc/add', pnjId: 'tulio', count: 1 }) // n2
  run({ type: 'reveal/set', ref: 'npc:n2', on: true })
  run({ type: 'token/placeAll' })
  run({ type: 'live/note', ref: 'pc:tal', note: 'SECRETO-SOBRE-TAL' })
  run({ type: 'live/note', ref: 'pc:nel', note: 'SECRETO-SOBRE-NEL' })
  run({ type: 'inventory/set', ref: 'pc:nel', text: 'CUERDA-DE-NEL' })
  run({ type: 'gold/set', ref: 'pc:nel', gold: 77 })
  run({ type: 'object/give', ref: 'pc:tal', objectId: 'anillo' })
  run({ type: 'object/charges', objectId: 'anillo', uses: 2 })
  run({ type: 'log/note', text: 'EMBOSCADA-EN-EL-FARO' })
  run({ type: 'encounter/start', members: ['pc:tal', 'pc:nel', 'npc:n1', 'npc:n2'], init: { 'pc:tal': 20, 'pc:nel': 10, 'npc:n1': 5, 'npc:n2': 1 } })
  // Starting names nobody; the first «Siguiente turno» lands on the top initiative.
  run({ type: 'encounter/advance', delta: 1 })
  return state
}

describe('projectPlayer', () => {
  const state = scenario()
  const view = projectPlayer(state, ctx, 'tal')!
  const json = JSON.stringify(view)

  it('is the character in full', () => {
    expect(view.pc).toEqual({ id: 'tal', name: 'Tal', player: 'Ana', portrait: null })
    expect(view.campaign).toEqual({ id: 'c-1', title: 'Marea Chica' })
    expect(view.sheet.hpMax).toBe(9)
    expect(view.live.hp).toBe(9)
    expect(view.objects).toEqual([
      {
        id: 'anillo',
        name: 'Anillo',
        effects: ['Brilla en la oscuridad.'],
        mods: { ac: 1 },
        uses: { left: 2, total: 3, spent: false },
      },
    ])
  })

  it('shows the party and the revealed foes exactly as the television does', () => {
    expect(view.party.map((c) => c.ref).sort()).toEqual(['pc:nel', 'pc:tal'])
    // Nel's hit points follow the PC default reveal — exact — like on screen.
    expect(view.party.find((c) => c.ref === 'pc:nel')).toMatchObject({ hp: 12, hpMax: 12 })
    expect(view.foes.map((c) => c.ref)).toEqual(['npc:n2'])
    expect(view.foes[0]!.name).toBe('Soldado ahogado')
  })

  it('knows whose turn it is', () => {
    expect(view.encounter).toEqual({ on: true, round: 1, myTurn: true, active: 'pc:tal' })
  })

  it("carries none of the DM's secrets, nor anyone else's private layer", () => {
    for (const leak of [
      'SECRETO-SOBRE-TAL', // the DM's note about this very character
      'SECRETO-SOBRE-NEL',
      'CUERDA-DE-NEL',
      '77', // Nel's gold
      'EMBOSCADA', // the log
      'n1', // the hidden bandit's id
      'Tulio', // the masked name
      'Lanza', // any statblock
      'SOLO PARA EL DM',
    ]) {
      expect(json, leak).not.toContain(leak)
    }
    expect('note' in view.live).toBe(false)
    expect(json).not.toContain('"tokens"')
  })

  it('is null for someone who is not seated', () => {
    expect(projectPlayer(state, ctx, 'nadie')).toBeNull()
  })
})
