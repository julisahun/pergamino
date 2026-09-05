/**
 * The frame the television holds while sync is paused, driven through the pure
 * pieces — `reduce`, `LocalProjection` — with no vault and no store.
 *
 * Pausing freezes the table screen on its current frame while the DM works
 * ahead; the DM's own view keeps moving.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Action } from '../actions.ts'
import type { Pnj, Ref, Scene, SessionState } from '../types.ts'
import { emptySession } from '../vault/session.ts'
import { LocalProjection, contextOf, nextFrozen } from './projection.ts'
import { reduce } from './reducer.ts'

const BANDIDO: Pnj = {
  id: 'bandido',
  name: 'Bandido',
  alias: null,
  tag: null,
  ac: 12,
  hpMax: 11,
  initMod: 1,
  speed: null,
  portrait: null,
  abilities: [],
  file: 'pnj/bandido.md',
  lead: '',
}
const scene = (id: string, name: string): Scene => ({
  id,
  name,
  art: { src: `assets/${id}.jpg`, stamp: null },
  audio: null,
  roster: [],
  grid: null,
  note: '',
})
const START = 'camino-del-rio'
const NEXT = 'faro'
const ctx = contextOf('Marea Chica', [scene(START, 'El camino'), scene(NEXT, 'El faro')], [BANDIDO], new Map())

/** The store's job, minus the store: apply, then let the projection see it. */
class Table {
  state: SessionState = emptySession()
  projection = new LocalProjection(ctx)
  #ids = 0
  dispatch(action: Action): void {
    const { state } = reduce(this.state, action, 0, {
      pnj: (id) => (id === BANDIDO.id ? BANDIDO : undefined),
      newId: () => `n${++this.#ids}`,
    })
    this.projection.advance(this.state, state)
    this.state = state
  }
  view() {
    return this.projection.tableView(this.state)
  }
}

describe('sync pause', () => {
  let table: Table

  beforeEach(() => {
    table = new Table()
    table.dispatch({ type: 'npc/add', pnjId: 'bandido', count: 3 })
    table.dispatch({ type: 'scene/show', sceneId: START })
  })

  const sceneOf = () => table.view().scene?.id ?? null
  const anNpc = (): Ref => `npc:${table.state.npcs.at(-1)!.id}`

  it('holds the frame the table had when it was paused', () => {
    expect(sceneOf()).toBe(START)
    table.dispatch({ type: 'field/paused', paused: true })
    table.dispatch({ type: 'scene/show', sceneId: NEXT })
    // The DM has moved on...
    expect(table.state.field.sceneId).toBe(NEXT)
    // ...but the players are still looking at the old scene.
    expect(sceneOf()).toBe(START)
  })

  it('catches up when sync resumes', () => {
    table.dispatch({ type: 'field/paused', paused: true })
    table.dispatch({ type: 'scene/show', sceneId: NEXT })
    table.dispatch({ type: 'field/paused', paused: false })
    expect(sceneOf()).toBe(NEXT)
  })

  it('hides token moves made while paused', () => {
    const ref = anNpc()
    table.dispatch({ type: 'reveal/set', ref, on: true })
    table.dispatch({ type: 'token/remove', ref })
    table.dispatch({ type: 'token/place', ref, x: 4, y: 4 })
    const before = table.view().tokens[ref]
    expect(before).toEqual({ x: 4, y: 4 })

    table.dispatch({ type: 'field/paused', paused: true })
    table.dispatch({ type: 'token/move', ref, x: 1, y: 1 })

    expect(table.state.field.tokens[ref]).toEqual({ x: 1, y: 1 })
    expect(table.view().tokens[ref]).toEqual(before)
  })

  it('hides an NPC revealed while paused, until sync resumes', () => {
    const ref = anNpc()
    table.dispatch({ type: 'reveal/set', ref, on: false })
    expect(table.view().combatants.some((c) => c.ref === ref)).toBe(false)

    table.dispatch({ type: 'field/paused', paused: true })
    table.dispatch({ type: 'reveal/set', ref, on: true })

    expect(table.view().combatants.some((c) => c.ref === ref)).toBe(false)
    table.dispatch({ type: 'field/paused', paused: false })
    expect(table.view().combatants.some((c) => c.ref === ref)).toBe(true)
  })

  it('serves the same held frame on every read, so a reload is consistent', () => {
    table.dispatch({ type: 'field/paused', paused: true })
    table.dispatch({ type: 'scene/show', sceneId: NEXT })
    expect(table.view()).toEqual(table.view())
    expect(sceneOf()).toBe(START)
  })

  it('describes the held frame for the DM banner', () => {
    expect(table.projection.frozenSummary()).toBeNull()
    table.dispatch({ type: 'field/paused', paused: true })
    expect(table.projection.frozenSummary()).toEqual({ scene: 'El camino', handout: false })
    table.dispatch({ type: 'field/paused', paused: false })
    expect(table.projection.frozenSummary()).toBeNull()
  })

  it('lets go of the frame when released — a held frame belongs to one run', () => {
    table.dispatch({ type: 'field/paused', paused: true })
    table.projection.release()
    expect(table.projection.frozenSummary()).toBeNull()
    expect(sceneOf()).toBe(START)
  })
})

describe('nextFrozen', () => {
  const paused = (state: SessionState, on: boolean): SessionState => ({
    ...state,
    field: { ...state.field, paused: on },
  })
  const off = emptySession()
  const on = paused(off, true)

  it('captures the frame before the change on pause', () => {
    const held = nextFrozen(null, off, on, ctx)
    expect(held).not.toBeNull()
    expect(held!.title).toBe('Marea Chica')
  })

  it('releases on resume and otherwise keeps what was held', () => {
    const held = nextFrozen(null, off, on, ctx)
    expect(nextFrozen(held, on, on, ctx)).toBe(held)
    expect(nextFrozen(held, on, off, ctx)).toBeNull()
    expect(nextFrozen(null, off, off, ctx)).toBeNull()
  })
})
