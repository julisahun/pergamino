import { describe, expect, it } from 'vitest'
import type { Scene, SessionState } from '../types.ts'
import { openWorld } from '../../test/fixture.ts'
import { pnjIndex } from './portraits.ts'
import { projectDm, projectTable, type PcInfo, type ProjectContext } from './project.ts'

const vault = await openWorld()
const { pnjs, scenes: sceneList } = await vault.loadCampaign()
const guilsRun = await vault.loadRun('guils')

function ctx(): ProjectContext {
  const scenes = new Map<string, Scene>(sceneList.map((s) => [s.id, s]))
  const pcs = new Map<string, PcInfo>([
    ['pj-amparo', { name: 'El amparo', hpMax: 10, initMod: 1, hasPortrait: false }],
    ['pj-muro', { name: 'El muro', hpMax: 12, initMod: 0, hasPortrait: false }],
    ['pj-sombra', { name: 'La sombra', hpMax: 9, initMod: 3, hasPortrait: false }],
  ])
  return { title: 'Marea Baja', scenes, pcs, pnjs: pnjIndex(pnjs) }
}

const guils = (): SessionState => structuredClone(guilsRun.state)

describe('projectTable — what reaches the TV', () => {
  it('drops an unrevealed NPC entirely rather than hiding it', () => {
    const state = guils()
    const hidden = Object.entries(state.field.reveal).find(([, r]) => !r.on)![0]
    const view = projectTable(state, ctx())

    expect(view.combatants.some((c) => c.ref === hidden)).toBe(false)
    // ...and the whole serialised payload must not mention it at all.
    expect(JSON.stringify(view)).not.toContain(hidden.slice('npc:'.length))
  })

  it('drops the token of an unrevealed NPC, so its position cannot be inferred', () => {
    const state = guils()
    const hidden = Object.entries(state.field.reveal).find(([, r]) => !r.on)![0]
    expect(state.field.tokens[hidden]).toBeDefined() // the DM has it placed
    expect(projectTable(state, ctx()).tokens[hidden]).toBeUndefined()
  })

  it('shows the two revealed bandits', () => {
    const view = projectTable(guils(), ctx())
    const npcs = view.combatants.filter((c) => c.ref.startsWith('npc:'))
    expect(npcs).toHaveLength(2)
    expect(npcs.map((c) => c.name)).toEqual(['Bandido', 'Bandido 1'])
  })

  it('emits no HP at all when the reveal mode is none', () => {
    const view = projectTable(guils(), ctx())
    for (const c of view.combatants.filter((c) => c.ref.startsWith('npc:'))) {
      expect(c.hp).toBeUndefined()
      expect(c.hpMax).toBeUndefined()
      expect(c.hpFraction).toBeUndefined()
    }
  })

  it('emits a fraction, never the numbers, in bar mode', () => {
    const state = guils()
    const ref = state.npcs[0]!.id
    state.field.reveal[`npc:${ref}`] = { on: true, hp: 'bar' }
    state.npcs[0]!.hp = 4 // of 11
    const c = projectTable(state, ctx()).combatants.find((c) => c.ref === `npc:${ref}`)!
    expect(c.hpFraction).toBeCloseTo(4 / 11)
    expect(c.hp).toBeUndefined()
    expect(c.hpMax).toBeUndefined()
  })

  it('never carries stat blocks, DM notes or portraits into the payload', () => {
    const state = guils()
    // Reveal everything — even then, prep detail must not cross the boundary.
    for (const npc of state.npcs) state.field.reveal[`npc:${npc.id}`] = { on: true, hp: 'exact' }
    state.npcs[0]!.note = 'SECRETO: mataron a Jonás por el anillo'
    const payload = JSON.stringify(projectTable(state, ctx()))

    expect(payload).not.toContain('SECRETO')
    expect(payload).not.toContain('Cimitarra')
    expect(payload).not.toContain('"ac"')
    expect(payload).not.toContain('data:image')
  })

  it('withholds the active turn when it belongs to a hidden combatant', () => {
    const state = guils()
    const hidden = Object.entries(state.field.reveal).find(([, r]) => !r.on)![0]
    state.encounter.activeRef = hidden as `npc:${string}`
    expect(projectTable(state, ctx()).activeRef).toBeNull()
  })

  it('gives the television the field\'s own grid, never the scene\'s prep number', () => {
    // The two boards address the same cells: a token at x=5, and `fog.revealed`
    // as row-major indices over `cols`, only mean one thing if both windows
    // count the same columns. This used to prefer `scene.grid`, so a scene
    // prepped at 16 wide drew 16 on the TV and 24 under the DM's hand.
    const state = guils()
    state.field.mode = 'tablero'
    state.field.cols = 24
    state.field.rows = 14
    const prepped = sceneList.find((sc) => sc.grid)
    expect(prepped, 'the fixture needs a scene with a prepped grid').toBeDefined()
    expect(prepped!.grid!.cols).not.toBe(24)
    state.field.sceneId = prepped!.id

    expect(projectTable(state, ctx()).grid).toEqual({ cols: 24, rows: 14 })
  })

  it('has no grid at all outside tablero', () => {
    const state = guils()
    state.field.mode = 'escena'
    expect(projectTable(state, ctx()).grid).toBeNull()
  })

  it('says nothing about whether sync is paused — that is a DM concern', () => {
    const state = guils()
    state.field.paused = true
    expect('paused' in projectTable(state, ctx())).toBe(false)
  })

  it('resolves scene art to a vault URL', () => {
    const state = guils()
    state.field.sceneId = 'faro'
    const view = projectTable(state, ctx())
    expect(view.scene).toEqual({
      id: 'faro',
      name: 'El faro',
      artUrl: '/vault/assets/lighthouse_arena.jpeg',
    })
  })

  it('never leaks the scene note — that is read-aloud prep for the DM', () => {
    const state = guils()
    state.field.sceneId = 'taberna'
    expect(JSON.stringify(projectTable(state, ctx()))).not.toContain('velas de sebo')
  })

  it('takes the grid from the scene when it defines one', () => {
    const state = guils()
    state.field.mode = 'tablero'
    state.field.sceneId = 'cueva-del-cristal' // grid: { cols: 16 }
    expect(projectTable(state, ctx()).grid).toEqual({ cols: 16, rows: 9 })
  })

  it('has no grid outside tablero mode', () => {
    const state = guils()
    state.field.mode = 'escena'
    expect(projectTable(state, ctx()).grid).toBeNull()
  })

  it('shows PCs by default, with exact HP', () => {
    const state = guils()
    state.play['pj-muro']!.hp = 7
    const c = projectTable(state, ctx()).combatants.find((c) => c.ref === 'pc:pj-muro')!
    expect(c.name).toBe('El muro')
    expect(c.hp).toBe(7)
    expect(c.hpMax).toBe(12)
  })
})

describe('projectDm', () => {
  it('keeps stat blocks and notes but strips the base64 portraits', () => {
    const state = guils()
    const view = projectDm(state)
    expect(view.npcs[0]!.abilities[0]!.name).toBe('Cimitarra')
    expect(view.npcs.every((n) => n.portrait === null)).toBe(true)
  })
})

describe('portrait fallback', () => {
  it('gives a session NPC the art of the pnj it came from', () => {
    const state = guils()
    // The vault stores `portrait: null` on instantiated NPCs...
    expect(state.npcs[0]!.portrait).toBeNull()
    expect(state.npcs[0]!.file).toBe('campaigns/marea-baja/pnj/bandido.md')
    for (const npc of state.npcs) state.field.reveal[`npc:${npc.id}`] = { on: true, hp: 'none' }
    const c = projectTable(state, ctx()).combatants.find((c) => c.ref.startsWith('npc:'))!
    // ...but the token still gets a face, via a URL rather than 100 KB of base64.
    expect(c.portrait).toBe(`/api/portrait/npc/${state.npcs[0]!.id}`)
  })
})
