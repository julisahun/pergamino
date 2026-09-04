/**
 * The reducer against the real campaign: real PNJ statblocks, real objects,
 * the real party.
 *
 * Nothing here restates a name or a number the vault already holds. The old
 * version of this file hardcoded a party (`pj-muro`, `El muro`, hpMax 12) and
 * rotted the moment the campaign changed its mesa, so every PC, every name and
 * every maximum is derived — and any live state a test depends on is set up by
 * that test, because `runs/last/session.json` is a file the DM is still using.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ref, SessionState } from '../types.ts'
import { MESA, openWorld, pcsOf, playingPcs } from '../../test/fixture.ts'
import { nextName, orderMembers, reduce, liveOf, type ReduceOpts } from './reducer.ts'

const vault = await openWorld()
const { pnjs, objects } = await vault.loadCampaign()
const byId = new Map(pnjs.map((m) => [m.id, m]))
const objById = new Map(objects.map((o) => [o.id, o]))
const runData = await vault.loadRun(MESA)
const pcs = pcsOf(runData)

/** The PCs the mesa has live state for — whoever they are this campaign. */
const playing = playingPcs(runData)
const [PC1, PC2, PC3] = playing as [string, string, string]
const A: Ref = `pc:${PC1}`
const B: Ref = `pc:${PC2}`
const C: Ref = `pc:${PC3}`
const nameOf = (id: string): string => pcs.get(id)!.name
const hpMaxOf = (id: string): number => pcs.get(id)!.hpMax!

let counter = 0
const opts = (extra: Partial<ReduceOpts> = {}): ReduceOpts => ({
  pnj: (id) => byId.get(id),
  object: (id) => objById.get(id),
  pcMaxHp: (pcId) => pcs.get(pcId)?.hpMax ?? null,
  pcName: (pcId) => pcs.get(pcId)?.name,
  pcInitMod: (pcId) => pcs.get(pcId)?.initMod ?? null,
  newId: () => `test-${++counter}`,
  ...extra,
})

const last = (): SessionState => structuredClone(runData.state)
const run = (s: SessionState, ...actions: Parameters<typeof reduce>[1][]): SessionState =>
  actions.reduce((acc, a) => reduce(acc, a, 1_000, opts()).state, s)

/** A fixed board, so a clamp has a known edge to clamp to. */
const board = (s: SessionState): SessionState =>
  run(s, { type: 'field/grid', cols: 16, rows: 9 })

/**
 * An empty board.
 *
 * The mesa's live board can legitimately hold two tokens on one square —
 * `token/move` puts a token where the DM dropped it and nowhere else. So "no
 * two on a square" is a promise of *automatic* placement, and a test of it has
 * to start from nothing rather than from whatever the table looks like.
 */
function clearBoard(): SessionState {
  const state = last()
  state.field.tokens = {}
  return state
}

/**
 * The mesa is mid-adventure and already holds charges and loot. Charge tests
 * need the object entering play for the first time, which is when `object/give`
 * fills it from prep.
 */
function emptyHanded(): SessionState {
  const state = last()
  state.objects = {}
  for (const live of Object.values(state.play)) live.objects = []
  for (const npc of state.npcs) npc.objects = []
  return state
}

/** The names `count` fresh copies of `pnjId` would take, given `taken`. */
function nextNames(taken: string[], ...pnjIds: string[]): string[] {
  const seen = new Set(taken)
  return pnjIds.map((id) => {
    const name = nextName(seen, byId.get(id)!.name)
    seen.add(name)
    return name
  })
}

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
    const prep = byId.get('ossian')!
    const state = run(last(), { type: 'npc/add', pnjId: 'ossian', count: 1 })
    const ossian = state.npcs.at(-1)!
    expect(ossian.name).toBe(prep.name)
    expect(ossian.ac).toBe(prep.ac)
    expect(ossian.hpMax).toBe(prep.hpMax)
    expect(ossian.hp).toBe(prep.hpMax) // and arrives at full
    expect(ossian.abilities.map((a) => a.name)).toEqual(prep.abilities.map((a) => a.name))
    expect(ossian.file).toBe('campaigns/marea-baja/pnj/ossian.md')
  })

  it('numbers copies around the ones already in the session', () => {
    const before = last()
    const taken = before.npcs.map((n) => n.name)
    const state = run(before, { type: 'npc/add', pnjId: 'bandido', count: 2 })
    expect(state.npcs.map((n) => n.name)).toEqual([
      ...taken,
      ...nextNames(taken, 'bandido', 'bandido'),
    ])
  })

  it('keeps the prep note out of the live note', () => {
    const state = run(last(), { type: 'npc/add', pnjId: 'ossian', count: 1 })
    // The PNJ's note opens with prose; the NPC's live note starts empty.
    expect(byId.get('ossian')!.lead).not.toBe('')
    expect(state.npcs.at(-1)!.note).toBe('')
  })

  it('ignores an unknown pnj', () => {
    const before = last()
    expect(run(before, { type: 'npc/add', pnjId: 'no-existe', count: 1 })).toBe(before)
  })
})

describe('npc/remove', () => {
  it('clears the npc from tokens, reveal, members and init', () => {
    const id = last().npcs[0]!.id
    const ref: Ref = `npc:${id}`
    // Seeded, not assumed: the fixture is the DM's live run and its board is
    // whatever they last left on it.
    const before = run(
      last(),
      { type: 'token/remove', ref },
      { type: 'token/place', ref, x: 1, y: 1 },
      { type: 'encounter/init', ref, value: 12 },
    )
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
  const ref = A
  const hpMax = hpMaxOf(PC1)

  it('spends temporary HP before real HP', () => {
    const state = run(
      last(),
      { type: 'hp/set', ref, hp: hpMax },
      { type: 'hp/temp', ref, temp: 5 },
      { type: 'hp/damage', ref, amount: 3 },
    )
    expect(liveOf(state, ref)!.temp).toBe(2)
    expect(liveOf(state, ref)!.hp).toBe(hpMax)
  })

  it('carries the overflow past temporary HP into real HP', () => {
    const state = run(
      last(),
      { type: 'hp/set', ref, hp: hpMax },
      { type: 'hp/temp', ref, temp: 5 },
      { type: 'hp/damage', ref, amount: 8 },
    )
    expect(liveOf(state, ref)!.temp).toBe(0)
    expect(liveOf(state, ref)!.hp).toBe(hpMax - 3)
  })

  it('floors at 0 and knocks a PC unconscious', () => {
    const state = run(
      last(),
      { type: 'hp/set', ref, hp: 4 },
      { type: 'hp/damage', ref, amount: 99 },
    )
    expect(liveOf(state, ref)!.hp).toBe(0)
    expect(liveOf(state, ref)!.conditions).toContain('Inconsciente')
    expect(state.log.map((l) => l.text)).toContain(`${nameOf(PC1)} cae a 0 PG`)
  })

  it('caps healing at max HP', () => {
    const state = run(
      last(),
      { type: 'hp/set', ref, hp: 4 },
      { type: 'hp/heal', ref, amount: 99 },
    )
    expect(liveOf(state, ref)!.hp).toBe(hpMax)
  })

  it('healing from 0 ends the dying state', () => {
    const state = run(
      last(),
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
    const before = last()
    const npc = before.npcs[0]!
    const ref: Ref = `npc:${npc.id}`
    const state = run(before, { type: 'hp/heal', ref, amount: 50 })
    expect(liveOf(state, ref)!.hp).toBe(npc.hpMax)
  })
})

describe('death saves', () => {
  const ref = B

  it('logs death on the third failure', () => {
    const state = run(
      last(),
      { type: 'death/mark', ref, outcome: 'fail' },
      { type: 'death/mark', ref, outcome: 'fail' },
      { type: 'death/mark', ref, outcome: 'fail' },
    )
    expect(liveOf(state, ref)!.death).toEqual({ ok: 0, fail: 3 })
    expect(state.log.at(-1)!.text).toBe(`${nameOf(PC2)} muere`)
  })

  it('logs stabilisation on the third success', () => {
    const state = run(
      last(),
      { type: 'death/mark', ref, outcome: 'ok' },
      { type: 'death/mark', ref, outcome: 'ok' },
      { type: 'death/mark', ref, outcome: 'ok' },
    )
    expect(state.log.at(-1)!.text).toBe(`${nameOf(PC2)} se estabiliza`)
  })
})

describe('initiative order', () => {
  it('sorts highest first', () => {
    const state = run(
      last(),
      { type: 'encounter/init', ref: A, value: 18 },
      { type: 'encounter/init', ref: B, value: 7 },
      { type: 'encounter/init', ref: C, value: 12 },
    )
    expect(orderMembers(state, [B, A, C], opts())).toEqual([A, C, B])
  })

  it('breaks a tie on the initiative modifier', () => {
    const before = last()
    const bandit: Ref = `npc:${before.npcs[0]!.id}`
    const banditMod = before.npcs[0]!.initMod ?? 0
    // Whoever in this party the bandit actually out-modifies.
    const slower = playing.find((id) => (pcs.get(id)!.initMod ?? 0) < banditMod)
    expect(slower, 'the party needs someone slower than a bandit').toBeDefined()
    const pc: Ref = `pc:${slower!}`
    const state = run(
      before,
      { type: 'encounter/init', ref: bandit, value: 10 },
      { type: 'encounter/init', ref: pc, value: 10 },
    )
    expect(orderMembers(state, [pc, bandit], opts())[0]).toBe(bandit)
  })

  it('takes the initiatives stated when the fight starts', () => {
    // Nothing is rolled into the session any more: the DM reads the numbers
    // off the table and `encounter/start` carries them.
    const before = last()
    const bandit: Ref = `npc:${before.npcs[0]!.id}`
    const state = run(before, {
      type: 'encounter/start',
      members: [A, bandit],
      init: { [A]: 14, [bandit]: 7 },
    })
    expect(state.encounter.init[A]).toBe(14)
    expect(state.encounter.init[bandit]).toBe(7)
    expect(orderMembers(state, state.encounter.members, opts())[0]).toBe(A)
  })
})

describe('turn advance', () => {
  const seed = (): SessionState =>
    run(
      last(),
      { type: 'encounter/members', members: [A, B] },
      { type: 'encounter/init', ref: A, value: 18 },
      { type: 'encounter/init', ref: B, value: 5 },
    )

  it('starts on the highest initiative', () => {
    const state = run(seed(), { type: 'encounter/advance', delta: 1 })
    expect(state.encounter.activeRef).toBe(A)
    expect(state.encounter.round).toBe(1)
  })

  it('increments the round when the order wraps', () => {
    const state = run(
      seed(),
      { type: 'encounter/advance', delta: 1 },
      { type: 'encounter/advance', delta: 1 },
      { type: 'encounter/advance', delta: 1 },
    )
    expect(state.encounter.activeRef).toBe(A)
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
    expect(state.encounter.activeRef).toBe(B)
  })

  it('never drops below round 1', () => {
    const state = run(
      seed(),
      { type: 'encounter/advance', delta: -1 },
      { type: 'encounter/advance', delta: -1 },
    )
    expect(state.encounter.round).toBeGreaterThanOrEqual(1)
  })
})

describe('conditions', () => {
  it('toggles on and off', () => {
    const before = run(last(), { type: 'condition/clear', ref: A })
    const on = run(before, { type: 'condition/toggle', ref: A, condition: 'Envenenado' })
    expect(liveOf(on, A)!.conditions).toContain('Envenenado')
    const off = run(on, { type: 'condition/toggle', ref: A, condition: 'Envenenado' })
    expect(liveOf(off, A)!.conditions).not.toContain('Envenenado')
  })
})

describe('purity', () => {
  it('does not mutate the state it was given', () => {
    const before = last()
    const snapshot = JSON.stringify(before)
    run(before, { type: 'hp/damage', ref: A, amount: 5 })
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('returns the same object when nothing changed', () => {
    const before = last()
    expect(reduce(before, { type: 'hp/damage', ref: A, amount: 0 }, 1, opts()).state).toBe(before)
  })
})

describe('tablero', () => {
  it('clamps a token to the board', () => {
    const state = run(board(last()), { type: 'token/move', ref: A, x: 99, y: -4 })
    expect(state.field.tokens[A]).toEqual({ x: 15, y: 0 }) // 16x9 board
  })

  it('snaps a fractional drop to the nearest square', () => {
    const state = run(board(last()), { type: 'token/move', ref: A, x: 3.6, y: 2.2 })
    expect(state.field.tokens[A]).toEqual({ x: 4, y: 2 })
  })

  it('places everyone without a token, never stacking two on a square', () => {
    const before = run(clearBoard(), { type: 'npc/add', pnjId: 'ossian', count: 3 })
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
    const ref: Ref = `npc:${last().npcs[0]!.id}`
    const before = run(
      last(),
      { type: 'token/remove', ref },
      { type: 'token/place', ref, x: 2, y: 3 },
    )
    const state = run(before, { type: 'token/placeAll' })
    expect(state.field.tokens[ref]).toEqual({ x: 2, y: 3 })
  })

  it('puts one combatant on the board and takes them off again', () => {
    const before = run(clearBoard(), { type: 'field/grid', cols: 10, rows: 8 })
    const cleared = run(before, { type: 'token/remove', ref: A })
    expect(cleared.field.tokens[A]).toBeUndefined()

    const placed = run(cleared, { type: 'token/place', ref: A })
    expect(placed.field.tokens[A]).toBeDefined()
    // Nobody lands on top of anybody.
    const squares = Object.values(placed.field.tokens).map((t) => `${t.x},${t.y}`)
    expect(new Set(squares).size).toBe(squares.length)

    // Placing someone already there changes nothing.
    expect(run(placed, { type: 'token/place', ref: A })).toBe(placed)
    // Nor does removing someone who is not.
    const gone = run(placed, { type: 'token/remove', ref: A })
    expect(run(gone, { type: 'token/remove', ref: A })).toBe(gone)
  })

  it('honours an explicit square, and leaves a placed token where it is', () => {
    const before = run(
      last(),
      { type: 'token/remove', ref: A },
      { type: 'token/place', ref: A, x: 3, y: 4 },
    )
    expect(before.field.tokens[A]).toEqual({ x: 3, y: 4 })
    // Already on the board: placing is a no-op, because moving is `token/move`.
    expect(run(before, { type: 'token/place', ref: A, x: 9, y: 9 })).toBe(before)
  })

  it('gives a ficha to every PNJ it mints, so none is in no list at all', () => {
    const before = last()
    const pnjId = before.npcs[0]!.file.split('/').pop()!.replace(/\.md$/, '')
    const state = run(before, { type: 'npc/add', pnjId, count: 2 })
    const added = state.npcs.filter((n) => !before.npcs.some((o) => o.id === n.id))
    expect(added).toHaveLength(2)
    for (const npc of added) expect(state.field.tokens[`npc:${npc.id}`]).toBeDefined()
  })

  it('keeps tokens on the board when the grid shrinks', () => {
    const state = run(last(), { type: 'field/grid', cols: 8, rows: 5 })
    for (const t of Object.values(state.field.tokens)) {
      expect(t.x).toBeLessThan(8)
      expect(t.y).toBeLessThan(5)
    }
  })

  it('drops an npc token when the npc is removed', () => {
    const before = last()
    const id = before.npcs[0]!.id
    const state = run(before, { type: 'npc/remove', id })
    expect(state.field.tokens[`npc:${id}`]).toBeUndefined()
  })
})

describe('objetos', () => {
  const LAGRIMA = 'obj-lagrima-de-milia' // usos: 5
  const ANILLO = 'obj-anillo-corriente-ahogada' // no charges
  const USOS = objById.get(LAGRIMA)!.usos!

  /** One charge off the bottle — what a click on the rightmost lit pip says. */
  const spendOne = (state: SessionState): SessionState =>
    run(state, {
      type: 'object/charges',
      objectId: LAGRIMA,
      uses: (state.objects[LAGRIMA]?.uses ?? 0) - 1,
    })

  it('gives an item and starts its charges at the prep value', () => {
    const state = run(emptyHanded(), { type: 'object/give', ref: A, objectId: LAGRIMA })
    expect(liveOf(state, A)!.objects).toContain(LAGRIMA)
    expect(state.objects[LAGRIMA]).toEqual({ uses: USOS, spent: false })
  })

  it('an object is only ever in one pair of hands', () => {
    const state = run(
      emptyHanded(),
      { type: 'object/give', ref: A, objectId: ANILLO },
      { type: 'object/give', ref: B, objectId: ANILLO },
    )
    expect(liveOf(state, A)!.objects).not.toContain(ANILLO)
    expect(liveOf(state, B)!.objects).toContain(ANILLO)
  })

  it('takes the loot an NPC is carrying', () => {
    const base = emptyHanded()
    const bandit: Ref = `npc:${base.npcs[0]!.id}`
    const before = run(base, { type: 'object/give', ref: bandit, objectId: ANILLO })
    expect(liveOf(before, bandit)!.objects).toEqual([ANILLO])

    const state = run(before, { type: 'loot/transfer', from: bandit, to: B })
    expect(liveOf(state, bandit)!.objects).toEqual([])
    expect(liveOf(state, B)!.objects).toContain(ANILLO)
    expect(state.log.at(-1)!.text).toBe(
      `${nameOf(PC2)} saquea a ${base.npcs[0]!.name}: ${objById.get(ANILLO)!.name}`,
    )
  })

  it('spends charges across holders, not per holder', () => {
    // "Cinco usos en total, acumulados a lo largo de toda la aventura."
    let state = run(emptyHanded(), { type: 'object/give', ref: A, objectId: LAGRIMA })
    state = spendOne(spendOne(state))
    expect(state.objects[LAGRIMA]!.uses).toBe(USOS - 2)
    // Handing it on does not refill it.
    state = run(state, { type: 'object/give', ref: B, objectId: LAGRIMA })
    expect(state.objects[LAGRIMA]!.uses).toBe(USOS - 2)
  })

  it('destroys the bottle on the last use and takes it out of their hands', () => {
    // "Al gastar el quinto uso el vidrio se raja y el agua se derrama."
    let state = run(emptyHanded(), { type: 'object/give', ref: A, objectId: LAGRIMA })
    for (let i = 0; i < USOS; i++) state = spendOne(state)
    expect(state.objects[LAGRIMA]).toEqual({ uses: 0, spent: true })
    expect(liveOf(state, A)!.objects).not.toContain(LAGRIMA)
    expect(state.log.at(-1)!.text).toBe(`${objById.get(LAGRIMA)!.name} se destruye`)
  })

  it('will not spend one charge past the last', () => {
    let state = run(emptyHanded(), { type: 'object/give', ref: A, objectId: LAGRIMA })
    for (let i = 0; i < USOS + 1; i++) state = spendOne(state)
    expect(state.objects[LAGRIMA]!.uses).toBe(0)
    // And the extra click did not log a second destruction.
    expect(state.log.filter((e) => e.text.endsWith('se destruye'))).toHaveLength(1)
  })

  it('puts a charge back, the way a spent spell slot goes back', () => {
    let state = run(emptyHanded(), { type: 'object/give', ref: A, objectId: LAGRIMA })
    state = spendOne(spendOne(state))
    state = run(state, { type: 'object/charges', objectId: LAGRIMA, uses: USOS - 1 })
    expect(state.objects[LAGRIMA]).toEqual({ uses: USOS - 1, spent: false })
    // Clicking past the last pip cannot conjure another charge.
    state = run(state, { type: 'object/charges', objectId: LAGRIMA, uses: USOS + 4 })
    expect(state.objects[LAGRIMA]!.uses).toBe(USOS)
  })

  it('ignores charges on an item that has none', () => {
    const before = run(emptyHanded(), { type: 'object/give', ref: A, objectId: ANILLO })
    expect(before.objects[ANILLO]).toBeUndefined()
    expect(run(before, { type: 'object/charges', objectId: ANILLO, uses: 0 })).toBe(before)
  })
})

describe('descansos', () => {
  const refs: Ref[] = [A, B]

  it('a long rest restores HP, slots and one level of exhaustion', () => {
    const before = run(
      last(),
      { type: 'hp/set', ref: A, hp: 2 },
      { type: 'exh/set', ref: A, value: 3 },
      { type: 'slots/set', ref: A, level: '1', spent: 2 },
      { type: 'condition/toggle', ref: A, condition: 'Inconsciente' },
    )
    const state = run(before, { type: 'rest/long', refs })
    const live = liveOf(state, A)!
    expect(live.hp).toBe(hpMaxOf(PC1))
    expect(live.exh).toBe(2)
    expect(live.spent).toEqual({})
    expect(live.conditions).not.toContain('Inconsciente')
  })

  it('a short rest only clears the dying state', () => {
    const before = run(
      last(),
      { type: 'hp/set', ref: A, hp: 3 },
      { type: 'death/mark', ref: A, outcome: 'fail' },
    )
    const state = run(before, { type: 'rest/short', refs })
    expect(liveOf(state, A)!.hp).toBe(3)
    expect(liveOf(state, A)!.death).toEqual({ ok: 0, fail: 0 })
  })
})

describe('roster/load', () => {
  const withRoster = (roster: { pnjId: string; count: number }[]) => ({
    ...opts(),
    scene: (id: string) => (id === 'camino-del-rio' ? { roster } : undefined),
  })

  it('loads a scene roster, numbering around whoever is already there', () => {
    const before = last()
    const taken = before.npcs.map((n) => n.name)
    const { state } = reduce(
      before,
      { type: 'roster/load', sceneId: 'camino-del-rio' },
      1_000,
      withRoster([
        { pnjId: 'bandido', count: 2 },
        { pnjId: 'ossian', count: 1 },
      ]),
    )
    const added = nextNames(taken, 'bandido', 'bandido', 'ossian')
    expect(state.npcs.map((n) => n.name)).toEqual([...taken, ...added])
    expect(state.log.at(-1)!.text).toBe(`Reparto cargado: ${added.join(', ')}`)
  })

  it('does nothing for a scene with an empty roster', () => {
    const before = last()
    expect(
      reduce(before, { type: 'roster/load', sceneId: 'camino-del-rio' }, 1_000, withRoster([]))
        .state,
    ).toBe(before)
  })

  it('does nothing for a scene it does not know', () => {
    const before = last()
    expect(
      reduce(before, { type: 'roster/load', sceneId: 'no-existe' }, 1_000, withRoster([])).state,
    ).toBe(before)
  })
})
