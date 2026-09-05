/**
 * The functions that grew an async shell, tested against an in-memory vault.
 *
 * These are the assertions the `fs` versions made — bitácora drafting and
 * numbering, estado appending, the notes graph — asked of a tree that exists
 * only in this file, so a write can be checked by reading it back rather than
 * by being refused.
 */
import { describe, expect, it } from 'vitest'
import { ESTADO, PLANTILLA, openMemoryVault } from '../../test/memory.ts'
import { reduce } from '../session/reducer.ts'
import { emptySession } from './session.ts'
import { applyDeviations, draftBitacora, proposeDeviations } from './writeback.ts'

const RUN = 'campaigns/marea-chica/runs/guils'

describe('closing a session', () => {
  it('numbers the note past the template and no further', async () => {
    const { vault } = await openMemoryVault()
    expect(await vault.nextSessionNumber('guils')).toBe(1)
    await vault.writeBitacora('guils', '01-2026-08-27.md', '# uno\n')
    expect(await vault.nextSessionNumber('guils')).toBe(2)
  })

  it('drafts from the run\'s own template and writes it back', async () => {
    const { vault, memory } = await openMemoryVault()
    const state = emptySession()
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
    const campaign = await vault.loadCampaign()
    // Ossian seated from the campaign's own pnj note, then brought to zero.
    const opts = { pnj: (id: string) => campaign.pnjs.find((p) => p.id === id), newId: () => 'n1' }
    let state = reduce(emptySession(), { type: 'npc/add', pnjId: 'ossian', count: 1 }, 0, opts).state
    state = reduce(state, { type: 'hp/damage', ref: 'npc:n1', amount: 99 }, 0, opts).state
    state.log = [{ t: 1, kind: 'scene', text: 'faro' }]

    const deviations = proposeDeviations(state, {
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
