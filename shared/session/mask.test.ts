/**
 * The mask: a PNJ whose note gives an `alias` is one name in the console and
 * another on the television.
 *
 * Pure — the state is built here rather than read from a campaign, because
 * what is being asserted is the boundary and not anybody's prep. The same
 * thing against the real vault is in `project.vault.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import type { Npc, Ref, SessionState } from '../types.ts'
import { makeRef } from '../types.ts'
import { emptyLiveState, emptySession } from '../vault/session.ts'
import { reduce } from './reducer.ts'
import { projectTable, tableNames, type ProjectContext } from './project.ts'

const npc = (id: string, name: string, alias: string | null = null): Npc => ({
  id,
  name,
  alias,
  tag: 'Ahogado',
  ac: 12,
  hpMax: 16,
  initMod: 0,
  speed: null,
  portrait: null,
  abilities: [],
  file: `pnj/${id}.md`,
  ...emptyLiveState(16),
})

const ctx = (): ProjectContext => ({
  title: 'Marea Baja',
  pcs: new Map(),
  scenes: new Map(),
  pnjs: new Map(),
})

/** El faro: Tulio and the two men who went up the river with him. */
function state(): SessionState {
  const s = emptySession()
  s.npcs = [
    npc('a', 'Tulio', 'Soldado ahogado'),
    npc('b', 'Soldado ahogado'),
    npc('c', 'Soldado ahogado 1'),
  ]
  for (const n of s.npcs) s.field.reveal[makeRef('npc', n.id)] = { on: true, hp: 'none', name: 'alias' }
  return s
}

const shown = (s: SessionState): string[] =>
  projectTable(s, ctx()).combatants.map((c) => c.name)

describe('un PNJ con alias', () => {
  it('llega a la mesa con el alias y no con su nombre', () => {
    const view = JSON.stringify(projectTable(state(), ctx()))
    expect(view).not.toContain('Tulio')
    expect(shown(state())).toContain('Soldado ahogado 2')
  })

  it('deja los nombres de verdad como están y se numera detrás', () => {
    // Whoever is not masked keeps what the console calls them, so "el soldado
    // ahogado 1" is the same creature on both screens.
    expect(shown(state())).toEqual(['Soldado ahogado 2', 'Soldado ahogado', 'Soldado ahogado 1'])
  })

  it('no cambia de etiqueta cuando revelan a los demás', () => {
    const s = state()
    for (const id of ['b', 'c']) s.field.reveal[`npc:${id}`] = { on: false, hp: 'none', name: 'alias' }
    expect(shown(s)).toEqual(['Soldado ahogado 2'])
  })

  it('destapa el nombre cuando el DM lo decide, y lo vuelve a tapar', () => {
    const ref: Ref = 'npc:a'
    const destapado = reduce(state(), { type: 'reveal/set', ref, name: 'real' }, 0).state
    expect(shown(destapado)[0]).toBe('Tulio')
    const tapado = reduce(destapado, { type: 'reveal/set', ref, name: 'alias' }, 0).state
    expect(shown(tapado)[0]).toBe('Soldado ahogado 2')
  })

  it('sigue tapado después de un «revelar todos»', () => {
    const s = reduce(state(), { type: 'reveal/all', on: true }, 0).state
    expect(JSON.stringify(projectTable(s, ctx()))).not.toContain('Tulio')
  })

  it('sin alias, las dos pantallas dicen lo mismo', () => {
    const s = emptySession()
    s.npcs = [npc('a', 'Ossian')]
    s.field.reveal['npc:a'] = { on: true, hp: 'none', name: 'alias' }
    expect(tableNames(s).get('a')).toBe('Ossian')
  })
})
