/**
 * Resolving an action against the live state.
 *
 * Pure: the state is built here rather than read from a campaign, because what
 * is being asserted is the reducer and not anybody's prep. What matters most
 * is the property the whole design rests on — `attack/resolve` reaches the
 * same two helpers `hp/damage` and `hp/heal` do, so temporary hit points still
 * absorb, a PC who drops still goes Inconsciente, and a heal still caps.
 */
import { describe, expect, it } from 'vitest'
import type { AttackTarget } from '../actions.ts'
import type { Action } from '../actions.ts'
import type { Npc, Ref, SessionState } from '../types.ts'
import { emptyLiveState, emptySession } from '../vault/session.ts'
import { reduce, type ReduceOpts } from './reducer.ts'

const npc = (id: string, name: string, hpMax = 11, ac = 12): Npc => ({
  id,
  name,
  alias: null,
  tag: 'Bandido',
  ac,
  hpMax,
  initMod: 1,
  speed: null,
  portrait: null,
  abilities: [],
  file: `pnj/${id}.md`,
  ...emptyLiveState(hpMax),
})

const ABRAXAS: Ref = 'pc:abraxas'
const BANDIT: Ref = 'npc:a'
const OTHER: Ref = 'npc:b'

const opts = (): ReduceOpts => ({
  pcName: (id) => (id === 'abraxas' ? 'Abraxas' : undefined),
  pcMaxHp: () => 9,
  pcAc: () => 12,
})

function seeded(): SessionState {
  const s = emptySession()
  s.play = { abraxas: emptyLiveState(9) }
  s.npcs = [npc('a', 'Bandido'), npc('b', 'Bandido 1')]
  return s
}

const run = (state: SessionState, ...actions: Action[]): SessionState =>
  actions.reduce((s, a) => reduce(s, a, 1, opts()).state, state)

const at = (over: Partial<AttackTarget> & { ref: Ref }): AttackTarget => ({
  roll: null,
  hit: true,
  crit: false,
  save: null,
  amount: 0,
  ...over,
})

const lines = (s: SessionState) => s.log.map((e) => e.text)
const hpOf = (s: SessionState, ref: Ref) =>
  ref === ABRAXAS ? s.play.abraxas!.hp : s.npcs.find((n) => `npc:${n.id}` === ref)!.hp

const swing = (over: Partial<Extract<Action, { type: 'attack/resolve' }>> = {}) =>
  ({
    type: 'attack/resolve',
    ref: BANDIT,
    name: 'Cimitarra',
    kind: 'attack',
    mod: 3,
    dc: null,
    targets: [],
    ...over,
  }) as Action

describe('an attack', () => {
  it('takes the hit points off and says what it rolled', () => {
    const s = run(
      seeded(),
      swing({ targets: [at({ ref: ABRAXAS, roll: 15, amount: 5 })] }),
    )
    expect(hpOf(s, ABRAXAS)).toBe(4)
    expect(lines(s)).toEqual(['Bandido golpea a Abraxas con Cimitarra: 15 +3 = 18 vs CA 12 · 5 (4 PG)'])
  })

  it('writes a miss down and changes nothing', () => {
    const before = seeded()
    const s = run(before, swing({ targets: [at({ ref: ABRAXAS, roll: 4, hit: false, amount: 5 })] }))
    expect(hpOf(s, ABRAXAS)).toBe(9)
    expect(lines(s)).toEqual(['Bandido falla contra Abraxas con Cimitarra: 4 +3 = 7 vs CA 12'])
  })

  it('says CRÍTICO out loud', () => {
    const s = run(seeded(), swing({ targets: [at({ ref: ABRAXAS, roll: 20, crit: true, amount: 9 })] }))
    expect(lines(s)[0]).toContain('¡CRÍTICO!')
  })

  it('lets temporary hit points absorb, exactly as hp/damage does', () => {
    const s = run(
      seeded(),
      { type: 'hp/temp', ref: ABRAXAS, temp: 4 },
      swing({ targets: [at({ ref: ABRAXAS, roll: 15, amount: 5 })] }),
    )
    expect(s.play.abraxas!.temp).toBe(0)
    expect(hpOf(s, ABRAXAS)).toBe(8)
  })

  it('drops a PC to Inconsciente and logs the fall', () => {
    const s = run(seeded(), swing({ targets: [at({ ref: ABRAXAS, roll: 15, amount: 30 })] }))
    expect(hpOf(s, ABRAXAS)).toBe(0)
    expect(s.play.abraxas!.conditions).toContain('Inconsciente')
    expect(lines(s)).toContain('Abraxas cae a 0 PG')
  })

  it('names each target from the state before the swing, not after it', () => {
    // Two soldiers in the same cone: the second one's name must not be looked
    // up in a state the first one has already changed.
    const s = run(
      seeded(),
      swing({
        ref: ABRAXAS,
        name: 'Daga',
        mod: 4,
        targets: [
          at({ ref: BANDIT, roll: 18, amount: 3 }),
          at({ ref: OTHER, roll: 12, amount: 3 }),
        ],
      }),
    )
    expect(lines(s)).toEqual([
      'Abraxas golpea a Bandido con Daga: 18 +4 = 22 vs CA 12 · 3 (8 PG)',
      'Abraxas golpea a Bandido 1 con Daga: 12 +4 = 16 vs CA 12 · 3 (8 PG)',
    ])
  })

  it('does nothing for a combatant who is not there', () => {
    const before = seeded()
    const after = reduce(before, swing({ ref: 'npc:ghost' }) , 1, opts()).state
    expect(after).toBe(before)
  })
})

describe('a save', () => {
  const cone = (targets: AttackTarget[]) =>
    swing({
      ref: ABRAXAS,
      name: 'Manos Ardientes',
      kind: 'save',
      mod: null,
      dc: 13,
      targets,
      spend: { level: '1' },
    })

  it('still takes half off someone who made it', () => {
    // The half is worked out in the console; what arrives is the amount. The
    // reducer must apply it anyway — `hit: false` here means the save landed.
    const s = run(
      seeded(),
      cone([
        at({ ref: BANDIT, save: 9, hit: true, amount: 11 }),
        at({ ref: OTHER, save: 16, hit: false, amount: 5 }),
      ]),
    )
    expect(hpOf(s, BANDIT)).toBe(0)
    expect(hpOf(s, OTHER)).toBe(6)
    expect(lines(s)).toEqual([
      'Abraxas usa Manos Ardientes (espacio de nivel 1)',
      'Bandido no salva contra Manos Ardientes: 9 vs CD 13 · 11 (0 PG)',
      'Bandido cae a 0 PG',
      'Bandido 1 salva contra Manos Ardientes: 16 vs CD 13 · 5 (6 PG)',
    ])
  })

  it('says «sin daño» when a made save stops it dead', () => {
    const s = run(seeded(), cone([at({ ref: BANDIT, save: 18, hit: false, amount: 0 })]))
    expect(hpOf(s, BANDIT)).toBe(11)
    expect(lines(s)[1]).toBe('Bandido salva contra Manos Ardientes: 18 vs CD 13 · sin daño')
  })

  it('spends the spell slot it declared', () => {
    const s = run(seeded(), cone([at({ ref: BANDIT, save: 9, hit: true, amount: 11 })]))
    expect(s.play.abraxas!.spent).toEqual({ '1': 1 })
  })

  it('spends a second slot on a second casting', () => {
    let s = run(seeded(), cone([at({ ref: BANDIT, save: 9, hit: true, amount: 4 })]))
    s = run(s, cone([at({ ref: OTHER, save: 9, hit: true, amount: 4 })]))
    expect(s.play.abraxas!.spent).toEqual({ '1': 2 })
  })
})

describe('a heal', () => {
  const word = (targets: AttackTarget[]) =>
    swing({ ref: ABRAXAS, name: 'Palabra Curativa', kind: 'heal', mod: null, targets })

  it('puts hit points back and ends the dying', () => {
    const s = run(
      seeded(),
      { type: 'hp/set', ref: ABRAXAS, hp: 0 },
      { type: 'death/mark', ref: ABRAXAS, outcome: 'fail' },
      word([at({ ref: ABRAXAS, amount: 6 })]),
    )
    expect(hpOf(s, ABRAXAS)).toBe(6)
    expect(s.play.abraxas!.death).toEqual({ ok: 0, fail: 0 })
    expect(s.play.abraxas!.conditions).not.toContain('Inconsciente')
  })

  it('logs what actually went on, not what was rolled', () => {
    // 2d8 into someone one hit point down heals one.
    const s = run(
      seeded(),
      { type: 'hp/set', ref: ABRAXAS, hp: 8 },
      word([at({ ref: ABRAXAS, amount: 11 })]),
    )
    expect(hpOf(s, ABRAXAS)).toBe(9)
    expect(lines(s).at(-1)).toBe('Abraxas cura a Abraxas con Palabra Curativa: 1 (9 PG)')
  })
})
