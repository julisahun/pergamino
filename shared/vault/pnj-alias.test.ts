/**
 * `alias:` in a pnj note, and what happens to it on the way to disk and back.
 *
 * Pure: the notes are strings in a `MemoryVault`, so this runs where the DM's
 * private vault is not.
 */
import { reduce } from '../session/reducer.ts'
import type { Pnj, SessionState } from '../types.ts'
import { describe, expect, it } from 'vitest'
import { MemoryVault } from './memory.ts'
import { loadPnj } from './pnj.ts'
import { emptySession } from './session.ts'
import { revealFor } from '../session/project.ts'

const note = (front: string, title: string) =>
  `---\nac: 12\nhpMax: 16\n${front}---\n\n# ${title}\n\nUn párrafo.\n`

const load = async (tree: Record<string, string>) =>
  loadPnj(await new MemoryVault({ pnj: tree }).root().dir('pnj'))

describe('loadPnj — alias', () => {
  it('lee el nombre que se le da a la mesa', async () => {
    const [pnj] = await load({ 'tulio.md': note('alias: Soldado ahogado\n', 'Tulio') })
    expect(pnj).toMatchObject({ id: 'tulio', name: 'Tulio', alias: 'Soldado ahogado' })
  })

  it('sin alias — el caso normal — no inventa ninguno', async () => {
    const [pnj] = await load({ 'ossian.md': note('', 'Ossian') })
    expect(pnj!.alias).toBeNull()
  })

  it('un alias en blanco es no tener alias', async () => {
    const [pnj] = await load({ 'tulio.md': note('alias: "   "\n', 'Tulio') })
    expect(pnj!.alias).toBeNull()
  })
})

describe('la sesión — alias', () => {
  const TULIO: Pnj = {
    id: 'tulio', name: 'Tulio', alias: 'Soldado ahogado', tag: null, ac: 15, hpMax: 16,
    initMod: 1, speed: null, portrait: null, abilities: [], file: 'pnj/tulio.md', lead: '',
  }
  const opts = { pnj: (id: string) => (id === 'tulio' ? TULIO : undefined), newId: () => 'x' }
  const seat = () => reduce(emptySession(), { type: 'npc/add', pnjId: 'tulio', count: 1 }, 0, opts).state

  it('sobrevive a la ida y vuelta, con la máscara puesta', () => {
    // The server keeps the state as JSON; what comes back has to say the same.
    const state = JSON.parse(JSON.stringify(seat())) as SessionState
    expect(state.npcs[0]!.alias).toBe('Soldado ahogado')
    // Nothing said about the name means "tapado".
    expect(revealFor(state, 'npc:x').name).toBe('alias')
  })

  it('guarda que el DM lo destapó', () => {
    const state = reduce(seat(), { type: 'reveal/set', ref: 'npc:x', name: 'real' }, 0, opts).state
    expect(revealFor(JSON.parse(JSON.stringify(state)) as SessionState, 'npc:x').name).toBe('real')
  })
})
