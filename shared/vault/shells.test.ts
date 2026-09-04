/**
 * The thirteen functions that grew an async shell, tested against an
 * in-memory vault.
 *
 * These are the assertions the `fs` versions made — v3→v4 migration, bitácora
 * drafting and numbering, estado appending — asked of a tree that exists only
 * in this file, so a write can be checked by reading it back rather than by
 * being refused.
 */
import { describe, expect, it } from 'vitest'
import { ESTADO, PLANTILLA, openMemoryVault, V3_SESSION } from '../../test/memory.ts'
import { SESSION_VERSION } from '../types.ts'
import { SessionStore } from '../session/store.ts'
import { applyDeviations, draftBitacora, proposeDeviations } from './writeback.ts'
import { emptySheet } from './sheet.ts'

const RUN = 'campaigns/marea-chica/runs/guils'

describe('loadRun', () => {
  it('migrates the v3 file and keeps what was live', async () => {
    const { vault } = await openMemoryVault()
    const run = await vault.loadRun('guils')

    expect(run.fromVersion).toBe(3)
    expect(run.state.version).toBe(SESSION_VERSION)
    expect(run.state.npcs).toHaveLength(2)
    expect(run.state.npcs[0]!.abilities[0]!.name).toBe('Cimitarra')
    expect(run.state.encounter.round).toBe(2)
    expect(run.state.field.sceneId).toBe('faro')
    // v3 keyed reveal by bare id; v4 keys it the way tokens are keyed.
    expect(Object.keys(run.state.field.reveal).sort()).toEqual(['npc:n1', 'npc:n2'])
    // The DM had the second bandit hidden; that must survive the migration.
    expect(run.state.field.reveal['npc:n2']).toEqual({ on: false, hp: 'none' })
    // And the v4 fields arrive with safe defaults.
    expect(run.state.field.handout).toBeNull()
    expect(run.state.log).toEqual([])
  })

  it('reads the characters and the sheet beside each one', async () => {
    const { vault } = await openMemoryVault()
    const run = await vault.loadRun('guils')
    // No `<note>` in this fixture's xml, so every stated field is absent and
    // initiative falls back to DEX 16 → +3. `sheet.test.ts` covers both paths.
    // Spread over `emptySheet()` so a new stated field cannot break this.
    expect(run.sheets.get('pj-tal')).toEqual({
      ...emptySheet(),
      hpMax: 9,
      initMod: 3,
      level: 1,
      slots: { '1': 2 },
      abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 },
    })
  })

  it("lets a run's own player file shadow the campaign's", async () => {
    const { vault } = await openMemoryVault()
    const run = await vault.loadRun('guils')
    // Nel is only in the campaign; Tal is in both, and the run wins.
    expect(run.characters.map((c) => c.id).sort()).toEqual(['pj-nel', 'pj-tal'])
    expect(run.characters.find((c) => c.id === 'pj-tal')!.name).toBe('Tal')
    expect(run.playerFiles['pj-tal']).toBe('runs/guils/players/tal/tal.md')
    expect(run.playerFiles['pj-nel']).toBe('players/nel/nel.md')
  })
})

describe('saveSession', () => {
  it('writes the state back where it came from', async () => {
    const { vault, memory } = await openMemoryVault()
    const run = await vault.loadRun('guils')
    await vault.saveSession('guils', run.state, {})

    const written = JSON.parse(memory.read(`${RUN}/session.json`)!)
    expect(written.version).toBe(SESSION_VERSION)
    expect(written.field.reveal['npc:n1']).toEqual({ on: true, hp: 'bar' })
  })

  it('keeps the pre-v4 original as session.json.bak, once', async () => {
    const { vault, memory } = await openMemoryVault()
    const run = await vault.loadRun('guils')
    await vault.saveSession('guils', run.state, { backup: true })

    expect(JSON.parse(memory.read(`${RUN}/session.json.bak`)!)).toEqual(V3_SESSION)

    // A second backup would overwrite the original with the migrated file.
    await vault.saveSession('guils', run.state, { backup: true })
    expect(JSON.parse(memory.read(`${RUN}/session.json.bak`)!).version).toBe(3)
  })
})

describe('the store, driven end to end over a memory vault', () => {
  it('persists what the DM did, inside the run and nowhere else', async () => {
    const { vault, memory } = await openMemoryVault()
    const store = new SessionStore()
    store.bind(vault)
    await store.open('guils')

    store.dispatch({ type: 'scene/show', sceneId: 'taberna' })
    store.dispatch({ type: 'hp/damage', ref: 'npc:n1', amount: 4 })
    await store.flush()

    const written = JSON.parse(memory.read(`${RUN}/session.json`)!)
    expect(written.field.sceneId).toBe('taberna')
    expect(written.npcs[0].hp).toBe(7)
    expect(memory.writes.every((p) => p.startsWith(`${RUN}/`))).toBe(true)
  })

  it('backs the v3 file up on the first write and not after', async () => {
    const { vault, memory } = await openMemoryVault()
    const store = new SessionStore()
    store.bind(vault)
    await store.open('guils')

    store.dispatch({ type: 'hp/damage', ref: 'npc:n1', amount: 1 })
    await store.flush()
    expect(memory.writes.filter((p) => p.endsWith('.bak'))).toHaveLength(1)

    store.dispatch({ type: 'hp/damage', ref: 'npc:n1', amount: 1 })
    await store.flush()
    expect(memory.writes.filter((p) => p.endsWith('.bak'))).toHaveLength(1)
  })
})

describe('closing a session', () => {
  it('numbers the note past the template and no further', async () => {
    const { vault } = await openMemoryVault()
    expect(await vault.nextSessionNumber('guils')).toBe(1)
    await vault.writeBitacora('guils', '01-2026-08-27.md', '# uno\n')
    expect(await vault.nextSessionNumber('guils')).toBe(2)
  })

  it('drafts from the run\'s own template and writes it back', async () => {
    const { vault, memory } = await openMemoryVault()
    const run = await vault.loadRun('guils')
    const state = run.state
    state.log = [
      { t: 1, kind: 'scene', text: 'faro' },
      { t: 2, kind: 'encounter', text: 'Combate iniciado (2)' },
      { t: 3, kind: 'death', text: 'Bandido cae a 0 PG' },
    ]
    const campaign = await vault.loadCampaign()
    const draft = draftBitacora(state, {
      date: '2026-08-27',
      scenes: new Map(campaign.scenes.map((s) => [s.id, s])),
      players: ['Tal'],
      sessionNumber: await vault.nextSessionNumber('guils'),
      template: await vault.readTemplate('guils'),
    })

    expect(draft.filename).toBe('01-2026-08-27.md')
    expect(draft.content).toMatch(/^---\nsesion: 1\nfecha: 2026-08-27\n/)
    expect(draft.content).toContain('jugadores: ["Tal"]')
    expect(draft.content).toContain('Escenas: El faro')
    expect(draft.content).not.toContain('Plantilla. Se copia')
    // Deaths belong under Cambios de mundo, not Qué pasó.
    const world = draft.content.slice(draft.content.indexOf('## Cambios de mundo'))
    expect(world).toContain('Bandido cae a 0 PG')

    await vault.writeBitacora('guils', draft.filename, draft.content)
    expect(memory.read(`${RUN}/bitacora/${draft.filename}`)).toBe(draft.content)
    // The template it was drafted from is untouched.
    expect(memory.read(`${RUN}/bitacora/00-plantilla.md`)).toBe(PLANTILLA)
  })

  it('appends the chosen deviations to estado.md and nothing else', async () => {
    const { vault, memory } = await openMemoryVault()
    const run = await vault.loadRun('guils')
    const campaign = await vault.loadCampaign()
    run.state.npcs[0]!.name = 'Ossian'
    run.state.npcs[0]!.hp = 0
    run.state.log = [{ t: 1, kind: 'scene', text: 'faro' }]

    const deviations = proposeDeviations(run.state, {
      sessionNumber: 1,
      scenes: new Map(campaign.scenes.map((s) => [s.id, s])),
      objects: campaign.objects,
      pnjs: campaign.pnjs,
      pcNames: new Map([['pj-tal', 'Tal']]),
    })
    expect(deviations).toContainEqual({
      section: 'Gente',
      text: '[[Ossian]] — **muerto**, sesión 1.',
    })
    expect(deviations).toContainEqual({
      section: 'Lugares',
      text: '[[faro]] — visitado, sesión 1.',
    })

    const before = await vault.readEstado('guils')
    expect(before).toBe(ESTADO)
    const next = applyDeviations(before, deviations)
    await vault.writeEstado('guils', next)

    const after = memory.read(`${RUN}/estado.md`)!
    // Every original line survives, in order.
    let i = 0
    for (const line of before.split('\n')) {
      const at = after.split('\n').indexOf(line, i)
      expect(at).toBeGreaterThanOrEqual(0)
      i = at + 1
    }
    expect(after).toContain('[[Ossian]] — **muerto**, sesión 1.')
    expect(after).toContain('<!-- - [[vann]] — vivo, sesión 1. -->')
  })
})

describe('assets and the notes graph', () => {
  it('splits assets/ by what each file can be used for', async () => {
    const { vault } = await openMemoryVault()
    expect(await vault.listAssets()).toEqual({
      images: ['assets/faro.jpg'],
      pdfs: ['assets/plano.pdf'],
      audio: ['assets/olas.mp3'],
    })
  })

  it('reads a campaign-relative asset, and refuses one that climbs', async () => {
    const { vault } = await openMemoryVault()
    expect(await vault.asset('assets/faro.jpg')).not.toBeNull()
    expect(await vault.asset('../../mundo/talasia.md')).toBeNull()
    expect(await vault.asset('assets/no-existe.jpg')).toBeNull()
  })

  it('indexes the whole world, so mundo/ lore stays reachable', async () => {
    const { vault } = await openMemoryVault()
    const index = await vault.buildNotesIndex()
    expect(index.notes.has('mundo/talasia.md')).toBe(true)
    expect(index.notes.has('campaigns/marea-chica/story/faro.md')).toBe(true)
    // A world note linking into a campaign resolves by basename.
    const link = index.notes.get('mundo/talasia.md')!.links[0]!
    expect(link.resolved).toBe('campaigns/marea-chica/story/faro.md')
    expect(index.backlinks.get('campaigns/marea-chica/story/faro.md')).toContain(
      'mundo/talasia.md',
    )
  })
})
