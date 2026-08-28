import { beforeEach, describe, expect, it } from 'vitest'
import type { Pnj, Ref, SessionState } from '../types.ts'
import { openWorld } from '../../test/fixture.ts'
import { nextName, orderMembers, reduce, liveOf, type ReduceOpts } from './reducer.ts'

const vault = await openWorld()
const { pnjs, objects } = await vault.loadCampaign()
const byId = new Map(pnjs.map((m) => [m.id, m]))
const objById = new Map(objects.map((o) => [o.id, o]))
const guilsRun = await vault.loadRun('guils')

let counter = 0
const opts = (extra: Partial<ReduceOpts> = {}): ReduceOpts => ({
  pnj: (id) => byId.get(id),
  object: (id) => objById.get(id),
  pcMaxHp: (pcId) => ({ 'pj-amparo': 10, 'pj-muro': 12, 'pj-sombra': 9 })[pcId] ?? null,
  pcName: (pcId) =>
    ({ 'pj-amparo': 'El amparo', 'pj-muro': 'El muro', 'pj-sombra': 'La sombra' })[pcId],
  pcInitMod: (pcId) => ({ 'pj-amparo': 1, 'pj-muro': 0, 'pj-sombra': 3 })[pcId] ?? null,
  newId: () => `test-${++counter}`,
  ...extra,
})

const guils = (): SessionState => structuredClone(guilsRun.state)
const run = (s: SessionState, ...actions: Parameters<typeof reduce>[1][]): SessionState =>
  actions.reduce((acc, a) => reduce(acc, a, 1_000, opts()).state, s)

beforeEach(() => {
  counter = 0
})

describe('nextName', () => {
  it('reproduces the vault convention: base, then base 1, base 2', () => {
    const taken = new Set<string>()
    const names = ['Bandido', 'Bandido', 'Bandido'].map((b) => {
      const n = nextName(taken, b)
      taken.add(n)
      return n
    })
    expect(names).toEqual(['Bandido', 'Bandido 1', 'Bandido 2'])
  })

  it('fills a gap left by a removed copy', () => {
    expect(nextName(new Set(['Bandido', 'Bandido 2']), 'Bandido')).toBe('Bandido 1')
  })
})

describe('npc/add', () => {
  it('instantiates a pnj with full HP and its stat block', () => {
    const state = run(guils(), { type: 'npc/add', pnjId: 'ossian', count: 1 })
    const ossian = state.npcs.at(-1)!
    expect(ossian.name).toBe('Ossian')
    expect(ossian.ac).toBe(13)
    expect(ossian.hpMax).toBe(30)
    expect(ossian.hp).toBe(30)
    expect(ossian.abilities.map((a) => a.name)).toContain('La marea responde')
    expect(ossian.file).toBe('campaigns/marea-baja/pnj/ossian.md')
  })

  it('numbers copies around the ones already in the session', () => {
    const state = run(guils(), { type: 'npc/add', pnjId: 'bandido', count: 2 })
    expect(state.npcs.map((n) => n.name)).toEqual([
      'Bandido', 'Bandido 1', 'Bandido 2', 'Bandido 3', 'Bandido 4',
    ])
  })

  it('keeps the prep note out of the live note', () => {
    const state = run(guils(), { type: 'npc/add', pnjId: 'ossian', count: 1 })
    // The PNJ's note opens with prose; the NPC's live note starts empty.
    expect(byId.get('ossian')!.lead).not.toBe('')
    expect(state.npcs.at(-1)!.note).toBe('')
  })

  it('ignores an unknown pnj', () => {
    const before = guils()
    expect(run(before, { type: 'npc/add', pnjId: 'no-existe', count: 1 })).toBe(before)
  })
})

describe('npc/remove', () => {
  it('clears the npc from tokens, reveal, members and init', () => {
    const id = guils().npcs[0]!.id
    const ref: Ref = `npc:${id}`
    // Seeded, not assumed: the fixture is the DM's live run and its board is
    // whatever they last left on it.
    const before = run(guils(), { type: 'token/remove', ref }, { type: 'token/place', ref, x: 1, y: 1 })
    expect(before.field.tokens[ref]).toBeDefined()

    const state = run(before, { type: 'npc/remove', id })
    expect(state.npcs.find((n) => n.id === id)).toBeUndefined()
    expect(state.field.tokens[ref]).toBeUndefined()
    expect(state.field.reveal[ref]).toBeUndefined()
    expect(state.encounter.members).not.toContain(ref)
    expect(state.encounter.init[ref]).toBeUndefined()
  })
})

describe('damage and healing', () => {
  const ref: Ref = 'pc:pj-muro'

  it('spends temporary HP before real HP', () => {
    const state = run(
      guils(),
      { type: 'hp/set', ref, hp: 12 },
      { type: 'hp/temp', ref, temp: 5 },
      { type: 'hp/damage', ref, amount: 3 },
    )
    expect(liveOf(state, ref)!.temp).toBe(2)
    expect(liveOf(state, ref)!.hp).toBe(12)
  })

  it('carries the overflow past temporary HP into real HP', () => {
    const state = run(
      guils(),
      { type: 'hp/set', ref, hp: 12 },
      { type: 'hp/temp', ref, temp: 5 },
      { type: 'hp/damage', ref, amount: 8 },
    )
    expect(liveOf(state, ref)!.temp).toBe(0)
    expect(liveOf(state, ref)!.hp).toBe(9)
  })

  it('floors at 0 and knocks a PC unconscious', () => {
    const state = run(
      guils(),
      { type: 'hp/set', ref, hp: 4 },
      { type: 'hp/damage', ref, amount: 99 },
    )
    expect(liveOf(state, ref)!.hp).toBe(0)
    expect(liveOf(state, ref)!.conditions).toContain('Inconsciente')
    expect(state.log.map((l) => l.text)).toContain('El muro cae a 0 PG')
  })

  it('caps healing at max HP', () => {
    const state = run(
      guils(),
      { type: 'hp/set', ref, hp: 4 },
      { type: 'hp/heal', ref, amount: 99 },
    )
    expect(liveOf(state, ref)!.hp).toBe(12)
  })

  it('healing from 0 ends the dying state', () => {
    const state = run(
      guils(),
      { type: 'hp/set', ref, hp: 0 },
      { type: 'death/mark', ref, outcome: 'fail' },
      { type: 'death/mark', ref, outcome: 'fail' },
      { type: 'hp/heal', ref, amount: 1 },
    )
    const live = liveOf(state, ref)!
    expect(live.hp).toBe(1)
    expect(live.death).toEqual({ ok: 0, fail: 0 })
    expect(live.conditions).not.toContain('Inconsciente')
  })

  it('caps an NPC at its own hpMax, not a PC table', () => {
    const before = guils()
    const ref: Ref = `npc:${before.npcs[0]!.id}`
    const state = run(before, { type: 'hp/heal', ref, amount: 50 })
    expect(liveOf(state, ref)!.hp).toBe(11)
  })
})

describe('death saves', () => {
  const ref: Ref = 'pc:pj-sombra'

  it('logs death on the third failure', () => {
    const state = run(
      guils(),
      { type: 'death/mark', ref, outcome: 'fail' },
      { type: 'death/mark', ref, outcome: 'fail' },
      { type: 'death/mark', ref, outcome: 'fail' },
    )
    expect(liveOf(state, ref)!.death).toEqual({ ok: 0, fail: 3 })
    expect(state.log.at(-1)!.text).toBe('La sombra muere')
  })

  it('logs stabilisation on the third success', () => {
    const state = run(
      guils(),
      { type: 'death/mark', ref, outcome: 'ok' },
      { type: 'death/mark', ref, outcome: 'ok' },
      { type: 'death/mark', ref, outcome: 'ok' },
    )
    expect(state.log.at(-1)!.text).toBe('La sombra se estabiliza')
  })
})

describe('initiative order', () => {
  it('sorts highest first', () => {
    const before = guils()
    const state = run(
      before,
      { type: 'encounter/init', ref: 'pc:pj-muro', value: 18 },
      { type: 'encounter/init', ref: 'pc:pj-sombra', value: 7 },
      { type: 'encounter/init', ref: 'pc:pj-amparo', value: 12 },
    )
    const order = orderMembers(state, ['pc:pj-sombra', 'pc:pj-muro', 'pc:pj-amparo'], opts())
    expect(order).toEqual(['pc:pj-muro', 'pc:pj-amparo', 'pc:pj-sombra'])
  })

  it('breaks a tie on the initiative modifier', () => {
    const before = guils()
    const bandit: Ref = `npc:${before.npcs[0]!.id}` // initMod +1
    const state = run(
      before,
      { type: 'encounter/init', ref: bandit, value: 10 },
      { type: 'encounter/init', ref: 'pc:pj-muro', value: 10 },
    )
    expect(orderMembers(state, ['pc:pj-muro', bandit], opts())[0]).toBe(bandit)
  })

  it('takes the initiatives stated when the fight starts', () => {
    // Nothing is rolled into the session any more: the DM reads the numbers
    // off the table and `encounter/start` carries them.
    const before = guils()
    const bandit: Ref = `npc:${before.npcs[0]!.id}`
    const state = run(before, {
      type: 'encounter/start',
      members: ['pc:pj-muro', bandit],
      init: { 'pc:pj-muro': 14, [bandit]: 7 },
    })
    expect(state.encounter.init['pc:pj-muro']).toBe(14)
    expect(state.encounter.init[bandit]).toBe(7)
    expect(orderMembers(state, state.encounter.members, opts())[0]).toBe('pc:pj-muro')
  })
})

describe('turn advance', () => {
  const seed = (): SessionState =>
    run(
      guils(),
      { type: 'encounter/members', members: ['pc:pj-muro', 'pc:pj-amparo'] },
      { type: 'encounter/init', ref: 'pc:pj-muro', value: 18 },
      { type: 'encounter/init', ref: 'pc:pj-amparo', value: 5 },
    )

  it('starts on the highest initiative', () => {
    const state = run(seed(), { type: 'encounter/advance', delta: 1 })
    expect(state.encounter.activeRef).toBe('pc:pj-muro')
    expect(state.encounter.round).toBe(1)
  })

  it('increments the round when the order wraps', () => {
    const state = run(
      seed(),
      { type: 'encounter/advance', delta: 1 },
      { type: 'encounter/advance', delta: 1 },
      { type: 'encounter/advance', delta: 1 },
    )
    expect(state.encounter.activeRef).toBe('pc:pj-muro')
    expect(state.encounter.round).toBe(2)
  })

  it('steps back a round when going backwards past the top', () => {
    const state = run(
      seed(),
      { type: 'encounter/advance', delta: 1 },
      { type: 'encounter/advance', delta: 1 },
      { type: 'encounter/advance', delta: 1 },
      { type: 'encounter/advance', delta: -1 },
    )
    expect(state.encounter.round).toBe(1)
    expect(state.encounter.activeRef).toBe('pc:pj-amparo')
  })

  it('never drops below round 1', () => {
    const state = run(seed(), { type: 'encounter/advance', delta: -1 }, { type: 'encounter/advance', delta: -1 })
    expect(state.encounter.round).toBeGreaterThanOrEqual(1)
  })
})

describe('conditions', () => {
  it('toggles on and off', () => {
    const ref: Ref = 'pc:pj-muro'
    const on = run(guils(), { type: 'condition/toggle', ref, condition: 'Envenenado' })
    expect(liveOf(on, ref)!.conditions).toEqual(['Envenenado'])
    const off = run(on, { type: 'condition/toggle', ref, condition: 'Envenenado' })
    expect(liveOf(off, ref)!.conditions).toEqual([])
  })
})

describe('purity', () => {
  it('does not mutate the state it was given', () => {
    const before = guils()
    const snapshot = JSON.stringify(before)
    run(before, { type: 'hp/damage', ref: 'pc:pj-muro', amount: 5 })
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('returns the same object when nothing changed', () => {
    const before = guils()
    expect(reduce(before, { type: 'hp/damage', ref: 'pc:pj-muro', amount: 0 }, 1, opts()).state)
      .toBe(before)
  })
})

describe('tablero', () => {
  it('clamps a token to the board', () => {
    const state = run(guils(), { type: 'token/move', ref: 'pc:pj-muro', x: 99, y: -4 })
    expect(state.field.tokens['pc:pj-muro']).toEqual({ x: 15, y: 0 }) // 16x9 board
  })

  it('snaps a fractional drop to the nearest square', () => {
    const state = run(guils(), { type: 'token/move', ref: 'pc:pj-muro', x: 3.6, y: 2.2 })
    expect(state.field.tokens['pc:pj-muro']).toEqual({ x: 4, y: 2 })
  })

  it('places everyone without a token, never stacking two on a square', () => {
    const before = run(guils(), { type: 'npc/add', pnjId: 'ossian', count: 3 })
    const state = run(before, { type: 'token/placeAll' })
    const refs = [
      ...Object.keys(state.play).map((id) => `pc:${id}`),
      ...state.npcs.map((n) => `npc:${n.id}`),
    ]
    for (const ref of refs) expect(state.field.tokens[ref]).toBeDefined()
    const squares = Object.values(state.field.tokens).map((t) => `${t.x},${t.y}`)
    expect(new Set(squares).size).toBe(squares.length)
  })

  it('leaves already-placed tokens where they are', () => {
    const ref: Ref = `npc:${guils().npcs[0]!.id}`
    const before = run(guils(), { type: 'token/remove', ref }, { type: 'token/place', ref, x: 2, y: 3 })
    const state = run(before, { type: 'token/placeAll' })
    expect(state.field.tokens[ref]).toEqual({ x: 2, y: 3 })
  })

  it('puts one combatant on the board and takes them off again', () => {
    const before = run(guils(), { type: 'field/grid', cols: 10, rows: 8 })
    const ref: Ref = 'pc:pj-muro'
    const cleared = run(before, { type: 'token/remove', ref })
    expect(cleared.field.tokens[ref]).toBeUndefined()

    const placed = run(cleared, { type: 'token/place', ref })
    expect(placed.field.tokens[ref]).toBeDefined()
    // Nobody lands on top of anybody.
    const squares = Object.values(placed.field.tokens).map((t) => `${t.x},${t.y}`)
    expect(new Set(squares).size).toBe(squares.length)

    // Placing someone already there changes nothing.
    expect(run(placed, { type: 'token/place', ref })).toBe(placed)
    // Nor does removing someone who is not.
    const gone = run(placed, { type: 'token/remove', ref })
    expect(run(gone, { type: 'token/remove', ref })).toBe(gone)
  })

  it('honours an explicit square, and leaves a placed token where it is', () => {
    const ref: Ref = 'pc:pj-muro'
    const before = run(guils(), { type: 'token/remove', ref }, { type: 'token/place', ref, x: 3, y: 4 })
    expect(before.field.tokens[ref]).toEqual({ x: 3, y: 4 })
    // Already on the board: placing is a no-op, because moving is `token/move`.
    expect(run(before, { type: 'token/place', ref, x: 9, y: 9 })).toBe(before)
  })

  it('gives a ficha to every PNJ it mints, so none is in no list at all', () => {
    const before = guils()
    const pnjId = before.npcs[0]!.file.split('/').pop()!.replace(/\.md$/, '')
    const state = run(before, { type: 'npc/add', pnjId, count: 2 })
    const added = state.npcs.filter((n) => !before.npcs.some((o) => o.id === n.id))
    expect(added).toHaveLength(2)
    for (const npc of added) expect(state.field.tokens[`npc:${npc.id}`]).toBeDefined()
  })

  it('keeps tokens on the board when the grid shrinks', () => {
    const state = run(guils(), { type: 'field/grid', cols: 8, rows: 5 })
    for (const t of Object.values(state.field.tokens)) {
      expect(t.x).toBeLessThan(8)
      expect(t.y).toBeLessThan(5)
    }
  })

  it('drops an npc token when the npc is removed', () => {
    const before = guils()
    const id = before.npcs[0]!.id
    const state = run(before, { type: 'npc/remove', id })
    expect(state.field.tokens[`npc:${id}`]).toBeUndefined()
  })
})

describe('objetos', () => {
  const LAGRIMA = 'obj-lagrima-de-milia' // usos: 5
  const ANILLO = 'obj-anillo-corriente-ahogada' // no charges
  const muro: Ref = 'pc:pj-muro'
  const sombra: Ref = 'pc:pj-sombra'

  /** One charge off the bottle — what a click on the rightmost lit pip says. */
  const spendOne = (state: SessionState): SessionState =>
    run(state, {
      type: 'object/charges',
      objectId: LAGRIMA,
      uses: (state.objects[LAGRIMA]?.uses ?? 0) - 1,
    })

  it('gives an item and starts its charges at the prep value', () => {
    const state = run(guils(), { type: 'object/give', ref: muro, objectId: LAGRIMA })
    expect(liveOf(state, muro)!.objects).toContain(LAGRIMA)
    expect(state.objects[LAGRIMA]).toEqual({ uses: 5, spent: false })
  })

  it('an object is only ever in one pair of hands', () => {
    const state = run(
      guils(),
      { type: 'object/give', ref: muro, objectId: ANILLO },
      { type: 'object/give', ref: sombra, objectId: ANILLO },
    )
    expect(liveOf(state, muro)!.objects).not.toContain(ANILLO)
    expect(liveOf(state, sombra)!.objects).toContain(ANILLO)
  })

  it('takes the bandit loot the guils fixture already has', () => {
    const before = guils()
    const bandit: Ref = `npc:${before.npcs[0]!.id}`
    expect(liveOf(before, bandit)!.objects).toEqual([ANILLO])
    const state = run(before, { type: 'loot/transfer', from: bandit, to: sombra })
    expect(liveOf(state, bandit)!.objects).toEqual([])
    expect(liveOf(state, sombra)!.objects).toContain(ANILLO)
    expect(state.log.at(-1)!.text).toBe(
      'La sombra saquea a Bandido: Anillo de la Corriente Ahogada',
    )
  })

  it('spends charges across holders, not per holder', () => {
    // "Cinco usos en total, acumulados a lo largo de toda la aventura."
    let state = run(guils(), { type: 'object/give', ref: muro, objectId: LAGRIMA })
    state = spendOne(spendOne(state))
    expect(state.objects[LAGRIMA]!.uses).toBe(3)
    // Handing it on does not refill it.
    state = run(state, { type: 'object/give', ref: sombra, objectId: LAGRIMA })
    expect(state.objects[LAGRIMA]!.uses).toBe(3)
  })

  it('destroys the bottle on the fifth use and takes it out of their hands', () => {
    // "Al gastar el quinto uso el vidrio se raja y el agua se derrama."
    let state = run(guils(), { type: 'object/give', ref: muro, objectId: LAGRIMA })
    for (let i = 0; i < 5; i++) state = spendOne(state)
    expect(state.objects[LAGRIMA]).toEqual({ uses: 0, spent: true })
    expect(liveOf(state, muro)!.objects).not.toContain(LAGRIMA)
    expect(state.log.at(-1)!.text).toBe('Lágrima de Milia se destruye')
  })

  it('will not spend a sixth charge', () => {
    let state = run(guils(), { type: 'object/give', ref: muro, objectId: LAGRIMA })
    for (let i = 0; i < 6; i++) state = spendOne(state)
    expect(state.objects[LAGRIMA]!.uses).toBe(0)
    // And the sixth click did not log a second destruction.
    expect(state.log.filter((e) => e.text.endsWith('se destruye'))).toHaveLength(1)
  })

  it('puts a charge back, the way a spent spell slot goes back', () => {
    let state = run(guils(), { type: 'object/give', ref: muro, objectId: LAGRIMA })
    state = spendOne(spendOne(state))
    state = run(state, { type: 'object/charges', objectId: LAGRIMA, uses: 4 })
    expect(state.objects[LAGRIMA]).toEqual({ uses: 4, spent: false })
    // Clicking past the last pip cannot conjure a sixth charge.
    state = run(state, { type: 'object/charges', objectId: LAGRIMA, uses: 9 })
    expect(state.objects[LAGRIMA]!.uses).toBe(5)
  })

  it('ignores charges on an item that has none', () => {
    const before = run(guils(), { type: 'object/give', ref: muro, objectId: ANILLO })
    expect(before.objects[ANILLO]).toBeUndefined()
    expect(run(before, { type: 'object/charges', objectId: ANILLO, uses: 0 })).toBe(before)
  })
})

describe('descansos', () => {
  const refs: Ref[] = ['pc:pj-muro', 'pc:pj-sombra']

  it('a long rest restores HP, slots and one level of exhaustion', () => {
    const before = run(
      guils(),
      { type: 'hp/set', ref: 'pc:pj-muro', hp: 2 },
      { type: 'exh/set', ref: 'pc:pj-muro', value: 3 },
      { type: 'slots/set', ref: 'pc:pj-muro', level: '1', spent: 2 },
      { type: 'condition/toggle', ref: 'pc:pj-muro', condition: 'Inconsciente' },
    )
    const state = run(before, { type: 'rest/long', refs })
    const live = liveOf(state, 'pc:pj-muro')!
    expect(live.hp).toBe(12)
    expect(live.exh).toBe(2)
    expect(live.spent).toEqual({})
    expect(live.conditions).not.toContain('Inconsciente')
  })

  it('a short rest only clears the dying state', () => {
    const before = run(
      guils(),
      { type: 'hp/set', ref: 'pc:pj-muro', hp: 3 },
      { type: 'death/mark', ref: 'pc:pj-muro', outcome: 'fail' },
    )
    const state = run(before, { type: 'rest/short', refs })
    expect(liveOf(state, 'pc:pj-muro')!.hp).toBe(3)
    expect(liveOf(state, 'pc:pj-muro')!.death).toEqual({ ok: 0, fail: 0 })
  })
})

describe('roster/load', () => {
  const withRoster = (roster: { pnjId: string; count: number }[]) => ({
    ...opts(),
    scene: (id: string) => (id === 'camino-del-rio' ? { roster } : undefined),
  })

  it('loads a scene roster, numbering around whoever is already there', () => {
    const before = guils() // already holds Bandido, Bandido 1, Bandido 2
    const { state } = reduce(
      before,
      { type: 'roster/load', sceneId: 'camino-del-rio' },
      1_000,
      withRoster([{ pnjId: 'bandido', count: 2 }, { pnjId: 'ossian', count: 1 }]),
    )
    expect(state.npcs.map((n) => n.name)).toEqual([
      'Bandido', 'Bandido 1', 'Bandido 2', 'Bandido 3', 'Bandido 4', 'Ossian',
    ])
    expect(state.log.at(-1)!.text).toBe('Reparto cargado: Bandido 3, Bandido 4, Ossian')
  })

  it('does nothing for a scene with an empty roster', () => {
    const before = guils()
    expect(
      reduce(before, { type: 'roster/load', sceneId: 'camino-del-rio' }, 1_000, withRoster([]))
        .state,
    ).toBe(before)
  })

  it('does nothing for a scene it does not know', () => {
    const before = guils()
    expect(
      reduce(before, { type: 'roster/load', sceneId: 'no-existe' }, 1_000, withRoster([]))
        .state,
    ).toBe(before)
  })
})
