/**
 * `alias:` in a pnj note, and what happens to it on the way to disk and back.
 *
 * Pure: the notes are strings in a `MemoryVault`, so this runs where the DM's
 * private vault is not.
 */
import { describe, expect, it } from 'vitest'
import { MemoryVault } from './memory.ts'
import { loadPnj } from './pnj.ts'
import { migrate } from './session.ts'

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

describe('session.json — alias', () => {
  it('sobrevive a la ida y vuelta, con la máscara puesta', () => {
    const state = migrate({
      version: 5,
      npcs: [{ id: 'x', name: 'Tulio', alias: 'Soldado ahogado', hpMax: 16 }],
      field: { reveal: { 'npc:x': { on: true, hp: 'none' } } },
    })
    expect(state.npcs[0]!.alias).toBe('Soldado ahogado')
    // A file written before any of this existed says nothing about names, and
    // saying nothing has to mean "tapado".
    expect(state.field.reveal['npc:x']!.name).toBe('alias')
  })

  it('guarda que el DM lo destapó', () => {
    const state = migrate({
      version: 5,
      npcs: [{ id: 'x', name: 'Tulio', alias: 'Soldado ahogado', hpMax: 16 }],
      field: { reveal: { 'npc:x': { on: true, hp: 'none', name: 'real' } } },
    })
    expect(state.field.reveal['npc:x']!.name).toBe('real')
  })
})
