import { beforeEach, describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { SessionStore } from './store.ts'

const vault = await openWorld()

/**
 * Pausing sync freezes the table screen on its current frame while the DM
 * works ahead. The DM's own view keeps moving.
 */
describe('sync pause', () => {
  let store: SessionStore

  beforeEach(async () => {
    store = new SessionStore()
    store.bind(vault)
    await store.open('guils')
  })

  const sceneOf = () => store.tableView().scene?.id ?? null

  it('holds the frame the table had when it was paused', () => {
    expect(sceneOf()).toBe('camino-del-rio')

    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'scene/show', sceneId: 'faro' })

    // The DM has moved on...
    expect(store.state.field.sceneId).toBe('faro')
    // ...but the players are still looking at the old scene.
    expect(sceneOf()).toBe('camino-del-rio')
  })

  it('catches up when sync resumes', () => {
    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'scene/show', sceneId: 'faro' })
    store.dispatch({ type: 'field/paused', paused: false })
    expect(sceneOf()).toBe('faro')
  })

  it('hides token moves made while paused', () => {
    const bandit = `npc:${store.state.npcs[0]!.id}` as const
    const before = store.tableView().tokens[bandit]

    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'token/move', ref: bandit, x: 1, y: 1 })

    expect(store.state.field.tokens[bandit]).toEqual({ x: 1, y: 1 })
    expect(store.tableView().tokens[bandit]).toEqual(before)
  })

  it('hides an NPC revealed while paused, until sync resumes', () => {
    const hidden = Object.entries(store.state.field.reveal).find(([, r]) => !r.on)![0]
    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'reveal/set', ref: hidden as `npc:${string}`, on: true })

    expect(store.tableView().combatants.some((c) => c.ref === hidden)).toBe(false)
    store.dispatch({ type: 'field/paused', paused: false })
    expect(store.tableView().combatants.some((c) => c.ref === hidden)).toBe(true)
  })

  it('serves the same held frame on every read, so a reload is consistent', () => {
    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'scene/show', sceneId: 'faro' })
    expect(store.tableView()).toEqual(store.tableView())
    expect(sceneOf()).toBe('camino-del-rio')
  })

  it('describes the held frame for the DM banner', () => {
    expect(store.frozenSummary()).toBeNull()
    store.dispatch({ type: 'field/paused', paused: true })
    expect(store.frozenSummary()).toEqual({ scene: 'El camino junto al río', handout: false })
    store.dispatch({ type: 'field/paused', paused: false })
    expect(store.frozenSummary()).toBeNull()
  })

  it('resumes when the run is switched — a held frame belongs to one mesa', async () => {
    store.dispatch({ type: 'field/paused', paused: true })
    await store.open('last')
    expect(store.state.field.paused).toBe(false)
    expect(store.frozenSummary()).toBeNull()
  })
})
