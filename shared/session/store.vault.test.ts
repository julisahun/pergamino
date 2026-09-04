import { beforeEach, describe, expect, it } from 'vitest'
import { MESA, openWorld } from '../../test/fixture.ts'
import { SessionStore } from './store.ts'

const vault = await openWorld()
const { scenes } = await vault.loadCampaign()

/** Two real prepped scenes, so the DM has somewhere to move on to. */
const START = 'camino-del-rio'
const NEXT = 'faro'
const sceneName = (id: string) => scenes.find((s) => s.id === id)!.name

/**
 * Pausing sync freezes the table screen on its current frame while the DM
 * works ahead. The DM's own view keeps moving.
 *
 * The mesa's `session.json` is live — whatever was last on screen at the table
 * is whatever the DM left there — so every frame these tests hold is put on
 * screen here first. The vault supplies the party, the NPCs and the prep; it
 * does not supply the scenario.
 */
describe('sync pause', () => {
  let store: SessionStore

  beforeEach(async () => {
    store = new SessionStore()
    store.bind(vault)
    await store.open(MESA)
    store.dispatch({ type: 'scene/show', sceneId: START })
  })

  const sceneOf = () => store.tableView().scene?.id ?? null
  const anNpc = () => `npc:${store.state.npcs[0]!.id}` as `npc:${string}`

  it('holds the frame the table had when it was paused', () => {
    expect(sceneOf()).toBe(START)

    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'scene/show', sceneId: NEXT })

    // The DM has moved on...
    expect(store.state.field.sceneId).toBe(NEXT)
    // ...but the players are still looking at the old scene.
    expect(sceneOf()).toBe(START)
  })

  it('catches up when sync resumes', () => {
    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'scene/show', sceneId: NEXT })
    store.dispatch({ type: 'field/paused', paused: false })
    expect(sceneOf()).toBe(NEXT)
  })

  it('hides token moves made while paused', () => {
    const ref = anNpc()
    // Put someone on the board in the open, so there is a position to freeze.
    store.dispatch({ type: 'reveal/set', ref, on: true })
    store.dispatch({ type: 'token/place', ref, x: 4, y: 4 })
    const before = store.tableView().tokens[ref]
    expect(before).toEqual({ x: 4, y: 4 })

    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'token/move', ref, x: 1, y: 1 })

    expect(store.state.field.tokens[ref]).toEqual({ x: 1, y: 1 })
    expect(store.tableView().tokens[ref]).toEqual(before)
  })

  it('hides an NPC revealed while paused, until sync resumes', () => {
    const ref = anNpc()
    // Hidden first: an NPC the table has never seen is the case that matters.
    store.dispatch({ type: 'reveal/set', ref, on: false })
    expect(store.tableView().combatants.some((c) => c.ref === ref)).toBe(false)

    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'reveal/set', ref, on: true })

    expect(store.tableView().combatants.some((c) => c.ref === ref)).toBe(false)
    store.dispatch({ type: 'field/paused', paused: false })
    expect(store.tableView().combatants.some((c) => c.ref === ref)).toBe(true)
  })

  it('serves the same held frame on every read, so a reload is consistent', () => {
    store.dispatch({ type: 'field/paused', paused: true })
    store.dispatch({ type: 'scene/show', sceneId: NEXT })
    expect(store.tableView()).toEqual(store.tableView())
    expect(sceneOf()).toBe(START)
  })

  it('describes the held frame for the DM banner', () => {
    expect(store.frozenSummary()).toBeNull()
    store.dispatch({ type: 'field/paused', paused: true })
    expect(store.frozenSummary()).toEqual({ scene: sceneName(START), handout: false })
    store.dispatch({ type: 'field/paused', paused: false })
    expect(store.frozenSummary()).toBeNull()
  })

  it('resumes when the run is opened — a held frame belongs to one mesa', async () => {
    store.dispatch({ type: 'field/paused', paused: true })
    // The campaign runs one mesa, so this re-opens the same one. What is
    // being asserted is that `open` starts a run unpaused whatever the store
    // was holding, not that two mesas differ.
    await store.open(MESA)
    expect(store.state.field.paused).toBe(false)
    expect(store.frozenSummary()).toBeNull()
  })
})
