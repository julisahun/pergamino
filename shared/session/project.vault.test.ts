/**
 * `projectTable` against the real campaign: the boundary the television sits
 * behind. An unrevealed NPC must be *absent* from the payload, not hidden
 * inside it.
 *
 * The party, the NPCs and the prep come from the vault. What does **not** come
 * from the vault is who happens to be revealed: `runs/last/session.json` is a
 * live gameplay file, so every test here states the reveal it is testing.
 */
import { describe, expect, it } from 'vitest'
import type { HpReveal, Ref, Scene, SessionState } from '../types.ts'
import { MESA, openWorld, pcsOf, playingPcs, seated } from '../../test/fixture.ts'
import { pnjIndex } from './portraits.ts'
import { projectDm, projectTable, type ProjectContext } from './project.ts'
import { reduce } from './reducer.ts'

const vault = await openWorld()
const { pnjs, scenes: sceneList } = await vault.loadCampaign()
const run = await vault.loadRun(MESA)

function ctx(): ProjectContext {
  const scenes = new Map<string, Scene>(sceneList.map((s) => [s.id, s]))
  return { title: 'Marea Baja', scenes, pcs: pcsOf(run), pnjs: pnjIndex(pnjs) }
}

/**
 * The party seated and three bandits on the board, built from the notes. A
 * mesa this campaign has not played has no `session.json`, so there is no live
 * state to borrow — and borrowing it was never safe anyway.
 */
const BASE: SessionState = reduce(
  seated(run),
  { type: 'npc/add', pnjId: 'bandido', count: 3 },
  1_000,
  {
    pnj: (id) => pnjs.find((p) => p.id === id),
    object: () => undefined,
    pcMaxHp: (id) => pcsOf(run).get(id)?.hpMax ?? null,
    pcName: (id) => pcsOf(run).get(id)?.name,
    pcInitMod: (id) => pcsOf(run).get(id)?.initMod ?? null,
    newId: (() => {
      let n = 0
      return () => `seed-${++n}`
    })(),
  },
).state

const last = (): SessionState => structuredClone(BASE)
const npcRef = (state: SessionState, i = 0): Ref => `npc:${state.npcs[i]!.id}`

/** Reveal exactly `on`, at `hp` mode, and hide every other NPC. */
function setReveal(state: SessionState, on: Ref[], hp: HpReveal = 'none'): void {
  // Cleared rather than merged: PCs are revealed by default, so this leaves
  // the party visible and puts every NPC behind an explicit decision.
  state.field.reveal = {}
  for (const npc of state.npcs) {
    state.field.reveal[`npc:${npc.id}`] = { on: false, hp: 'none', name: 'alias' }
  }
  for (const ref of on) state.field.reveal[ref] = { on: true, hp, name: 'alias' }
}

/** A state with one NPC hidden and placed on the board. */
function withHidden(): { state: SessionState; hidden: Ref } {
  const state = last()
  const hidden = npcRef(state)
  setReveal(state, [])
  state.field.tokens[hidden] = { x: 3, y: 3 }
  return { state, hidden }
}

describe('projectTable — what reaches the TV', () => {
  it('masks a name the note says to mask, and numbers the copies', () => {
    const state = last()
    // The campaign's own aliases are prep, and prep changes; what has to hold
    // is that an alias on a seated PNJ never reaches the payload as a name.
    for (const npc of state.npcs) npc.alias = 'Encapuchado'
    setReveal(state, state.npcs.map((n) => `npc:${n.id}` as Ref))
    const view = projectTable(state, ctx())
    expect(JSON.stringify(view)).not.toContain('Bandido')
    expect(view.combatants.filter((c) => c.ref.startsWith('npc:')).map((c) => c.name)).toEqual([
      'Encapuchado',
      'Encapuchado 1',
      'Encapuchado 2',
    ])
    // And the console still knows who they are.
    expect(projectDm(state).npcs[0]!.name).toBe('Bandido')
  })

  it('drops an unrevealed NPC entirely rather than hiding it', () => {
    const { state, hidden } = withHidden()
    const view = projectTable(state, ctx())

    expect(view.combatants.some((c) => c.ref === hidden)).toBe(false)
    // ...and the whole serialised payload must not mention it at all.
    expect(JSON.stringify(view)).not.toContain(hidden.slice('npc:'.length))
  })

  it('drops the token of an unrevealed NPC, so its position cannot be inferred', () => {
    const { state, hidden } = withHidden()
    expect(state.field.tokens[hidden]).toBeDefined() // the DM has it placed
    expect(projectTable(state, ctx()).tokens[hidden]).toBeUndefined()
  })

  it('shows exactly the NPCs that were revealed', () => {
    const state = last()
    const shown = [npcRef(state, 0), npcRef(state, 1)]
    setReveal(state, shown)
    const npcs = projectTable(state, ctx()).combatants.filter((c) => c.ref.startsWith('npc:'))
    expect(npcs.map((c) => c.ref)).toEqual(shown)
    expect(npcs.map((c) => c.name)).toEqual([state.npcs[0]!.name, state.npcs[1]!.name])
  })

  it('emits no HP at all when the reveal mode is none', () => {
    const state = last()
    setReveal(state, state.npcs.map((n) => `npc:${n.id}` as Ref), 'none')
    const view = projectTable(state, ctx())
    const npcs = view.combatants.filter((c) => c.ref.startsWith('npc:'))
    expect(npcs.length).toBeGreaterThan(0)
    for (const c of npcs) {
      expect(c.hp).toBeUndefined()
      expect(c.hpMax).toBeUndefined()
      expect(c.hpFraction).toBeUndefined()
    }
  })

  it('emits a fraction, never the numbers, in bar mode', () => {
    const state = last()
    const ref = npcRef(state)
    setReveal(state, [ref], 'bar')
    state.npcs[0]!.hpMax = 11
    state.npcs[0]!.hp = 4
    const c = projectTable(state, ctx()).combatants.find((c) => c.ref === ref)!
    expect(c.hpFraction).toBeCloseTo(4 / 11)
    expect(c.hp).toBeUndefined()
    expect(c.hpMax).toBeUndefined()
  })

  it('never carries stat blocks, DM notes or portraits into the payload', () => {
    const state = last()
    // Reveal everything — even then, prep detail must not cross the boundary.
    setReveal(state, state.npcs.map((n) => `npc:${n.id}` as Ref), 'exact')
    state.npcs[0]!.note = 'SECRETO: mataron a Jonás por el anillo'
    const payload = JSON.stringify(projectTable(state, ctx()))

    expect(payload).not.toContain('SECRETO')
    expect(payload).not.toContain('Cimitarra')
    expect(payload).not.toContain('"ac"')
    expect(payload).not.toContain('data:image')
  })

  it('withholds the active turn when it belongs to a hidden combatant', () => {
    const { state, hidden } = withHidden()
    state.encounter.activeRef = hidden
    expect(projectTable(state, ctx()).activeRef).toBeNull()
  })

  it("gives the television the field's own grid, never the scene's prep number", () => {
    // The two boards address the same cells: a token at x=5, and `fog.revealed`
    // as row-major indices over `cols`, only mean one thing if both windows
    // count the same columns. This used to prefer `scene.grid`, so a scene
    // prepped at 16 wide drew 16 on the TV and 24 under the DM's hand.
    const state = last()
    state.field.mode = 'tablero'
    state.field.cols = 24
    state.field.rows = 14
    const prepped = sceneList.find((sc) => sc.grid)
    expect(prepped, 'the fixture needs a scene with a prepped grid').toBeDefined()
    expect(prepped!.grid!.cols).not.toBe(24)
    state.field.sceneId = prepped!.id

    expect(projectTable(state, ctx()).grid).toEqual({ cols: 24, rows: 14 })
  })

  it('says nothing about whether sync is paused — that is a DM concern', () => {
    const state = last()
    state.field.paused = true
    expect('paused' in projectTable(state, ctx())).toBe(false)
  })

  it('resolves scene art to a vault URL', () => {
    const state = last()
    state.field.sceneId = 'faro'
    const view = projectTable(state, ctx())
    expect(view.scene).toEqual({
      id: 'faro',
      name: 'El faro',
      artUrl: '/vault/assets/lighthouse_arena.jpeg',
    })
  })

  it('never leaks the scene note — that is read-aloud prep for the DM', () => {
    const state = last()
    state.field.sceneId = 'taberna'
    expect(JSON.stringify(projectTable(state, ctx()))).not.toContain('velas de sebo')
  })

  it("ignores the scene's prepped grid even where the field disagrees", () => {
    // There used to be a test here asserting the opposite — that a scene's
    // `grid` reached the television. It passed only because the old mesa's
    // field happened to hold the same numbers the scene was prepped at. The
    // field is the single source: a scene's grid is adopted *into* it when
    // the scene is shown, and `cueva-del-cristal` names cols and no rows, so
    // reading the scene would leave rows with nowhere to come from.
    const state = last()
    state.field.mode = 'tablero'
    state.field.cols = 20
    state.field.rows = 11
    state.field.sceneId = 'cueva-del-cristal' // grid: { cols: 16 }
    expect(projectTable(state, ctx()).grid).toEqual({ cols: 20, rows: 11 })
  })

  it('has no grid outside tablero mode', () => {
    const state = last()
    state.field.mode = 'escena'
    expect(projectTable(state, ctx()).grid).toBeNull()
  })

  it('shows PCs by default, with exact HP', () => {
    const state = last()
    const pcId = playingPcs(run)[0]!
    const info = pcsOf(run).get(pcId)!
    state.play[pcId]!.hp = 7
    const c = projectTable(state, ctx()).combatants.find((c) => c.ref === `pc:${pcId}`)!
    expect(c.name).toBe(info.name)
    expect(c.hp).toBe(7)
    expect(c.hpMax).toBe(info.hpMax)
  })
})

describe('projectDm', () => {
  it('keeps stat blocks and notes but strips the portraits', () => {
    const state = last()
    const view = projectDm(state)
    expect(view.npcs[0]!.abilities[0]!.name).toBe('Cimitarra')
    expect(view.npcs.every((n) => n.portrait === null)).toBe(true)
  })
})

describe('portrait fallback', () => {
  it('gives a session NPC the art of the pnj it came from', () => {
    const state = last()
    const npc = state.npcs[0]!
    // Whatever the instantiated NPC carries of its own, the fallback is the
    // path that has to work: the pnj note it came from is where the face is.
    npc.portrait = null
    expect(pnjIndex(pnjs).has(npc.file!)).toBe(true)
    setReveal(state, [`npc:${npc.id}`])
    const c = projectTable(state, ctx()).combatants.find((c) => c.ref === `npc:${npc.id}`)!
    // ...and the token gets a face via a URL, not 100 KB of base64.
    expect(c.portrait).toBe(`/api/portrait/npc/${npc.id}`)
  })
})
