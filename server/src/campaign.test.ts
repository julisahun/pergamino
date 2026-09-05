/**
 * The session the server owns, driven without a socket or a request.
 */
import { describe, expect, it } from 'vitest'
import { HttpError } from './errors.ts'
import { CampaignSession } from './campaign.ts'
import { memoryWorld, NEL, TOLMO } from './fixtures.ts'

const PREP = {
  pnjs: [
    {
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
    },
  ],
  objects: [{ id: 'anillo', name: 'Anillo', usos: 3, mods: {}, effects: [], file: 'objects/anillo.md' }],
  scenes: [],
}

describe('a campaign on the server', () => {
  it('registers with a fresh id and a link, or under the id the console holds', () => {
    const { registry } = memoryWorld()
    const fresh = registry.register('Marea Baja')
    expect(fresh.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(fresh.link.length).toBeGreaterThanOrEqual(16)
    const held = registry.register('Marea Baja', 'c-held')
    expect(held.id).toBe('c-held')
    // Registering twice under one id is the same campaign, retitled at most.
    expect(registry.register('Marea Baja (2)', 'c-held')).toBe(held)
    expect(held.title).toBe('Marea Baja (2)')
  })

  it('seats a new character at full HP and bumps the revision', () => {
    const { registry } = memoryWorld()
    const c = registry.register('x')
    expect(c.rev).toBe(0)
    const { id, rev } = c.addCharacter(TOLMO, 'Ana')
    expect(rev).toBe(1)
    expect(c.characters).toEqual([{ id, name: 'Tolmo', player: 'Ana', portrait: null }])
    expect(c.state.play[id]).toMatchObject({ hp: 13 })
    expect(c.sheets.get(id)?.ac).toBe(19)
  })

  it('refuses what is not a Fight Club sheet', () => {
    const c = memoryWorld().registry.register('x')
    expect(() => c.addCharacter('<html>no</html>', 'Ana')).toThrow(HttpError)
    expect(c.rev).toBe(0)
  })

  it('bumps the revision only when the reducer changed something', () => {
    const c = memoryWorld().registry.register('x')
    const { id } = c.addCharacter(TOLMO, 'Ana')
    const first = c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 3 }, { kind: 'dm' })
    expect(first).toEqual({ rev: 2, changed: true })
    expect(c.state.play[id]!.hp).toBe(10)
    // A move to the square already held is a no-op in the reducer.
    c.dispatch({ type: 'token/place', ref: `pc:${id}`, x: 2, y: 2 }, { kind: 'dm' })
    const same = c.dispatch({ type: 'token/move', ref: `pc:${id}`, x: 2, y: 2 }, { kind: 'dm' })
    expect(same).toEqual({ rev: 3, changed: false })
  })

  it('refuses a player acting on someone else, before anything is reduced', () => {
    const c = memoryWorld().registry.register('x')
    const { id: tal } = c.addCharacter(TOLMO, 'Ana')
    const { id: nel } = c.addCharacter(NEL, 'Bea')
    expect(() =>
      c.dispatch({ type: 'hp/damage', ref: `pc:${nel}`, amount: 3 }, { kind: 'pc', pcId: tal }),
    ).toThrow(/not-your-pc/)
    expect(c.state.play[nel]!.hp).toBe(9)
    expect(c.dispatch({ type: 'hp/damage', ref: `pc:${tal}`, amount: 3 }, { kind: 'pc', pcId: tal }).changed).toBe(true)
  })

  it('refuses a stale absolute setter', () => {
    const c = memoryWorld().registry.register('x')
    const { id, rev } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 1 }, { kind: 'dm' })
    expect(() => c.dispatch({ type: 'hp/set', ref: `pc:${id}`, hp: 5 }, { kind: 'dm' }, rev)).toThrow(/cambiado/)
  })

  it('round-trips through the database', () => {
    const { store, registry } = memoryWorld()
    const c = registry.register('Marea', 'c-1')
    c.setPrep(PREP)
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'npc/add', pnjId: 'bandido', count: 2 }, { kind: 'dm' })
    c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 4 }, { kind: 'dm' })
    c.dispatch({ type: 'object/give', ref: `pc:${id}`, objectId: 'anillo' }, { kind: 'dm' })

    const again = CampaignSession.load(store, 'c-1')!
    expect(again.rev).toBe(c.rev)
    expect(again.state).toEqual(c.state)
    expect(again.characters).toEqual(c.characters)
    expect(again.state.npcs).toHaveLength(2)
    expect(again.playerView(id)?.objects[0]).toMatchObject({ name: 'Anillo', uses: { left: 3, total: 3 } })
  })

  it('keeps the live layer when a sheet is replaced, capping hp to the new max', () => {
    const c = memoryWorld().registry.register('x')
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'gold/set', ref: `pc:${id}`, gold: 42 }, { kind: 'dm' })
    c.replaceSheet(id, NEL)
    expect(c.characters[0]!.name).toBe('Nel')
    expect(c.state.play[id]).toMatchObject({ hp: 9, gold: 42 })
  })

  it('takes a removed character out of the fight, the board and the party', () => {
    const c = memoryWorld().registry.register('x')
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'token/place', ref: `pc:${id}`, x: 1, y: 1 }, { kind: 'dm' })
    c.dispatch({ type: 'encounter/start', members: [`pc:${id}`] }, { kind: 'dm' })
    c.removeCharacter(id)
    expect(c.characters).toEqual([])
    expect(c.state.play[id]).toBeUndefined()
    expect(c.state.field.tokens[`pc:${id}`]).toBeUndefined()
    expect(c.state.encounter.members).toEqual([])
  })

  it('archives on reset and reseats the party fresh', () => {
    const { store, registry } = memoryWorld()
    const c = registry.register('x', 'c-1')
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 5 }, { kind: 'dm' })
    c.reset()
    expect(c.state.play[id]!.hp).toBe(13)
    expect(store.log('c-1', 0).at(-1)).toMatchObject({ actor: 'system:reset' })
  })

  it('tells each subscriber what its role may see', () => {
    const c = memoryWorld().registry.register('x')
    const { id } = c.addCharacter(TOLMO, 'Ana')
    const seen: Record<string, string[]> = { dm: [], pc: [] }
    c.subscribe({ role: 'dm', send: (m) => seen.dm!.push(m.type) })
    c.subscribe({ role: 'pc', pcId: id, send: (m) => seen.pc!.push(m.type) })
    c.dispatch({ type: 'live/note', ref: `pc:${id}`, note: 'SECRETO' }, { kind: 'dm' })
    expect(seen.dm).toEqual(['dm'])
    expect(seen.pc).toEqual(['pc'])
    const pcMsg = c.snapshot({ role: 'pc', pcId: id })
    expect(JSON.stringify(pcMsg)).not.toContain('SECRETO')
    const party = c.partyMessage('pc')
    expect('characters' in party && party.characters).toBeFalsy()
  })
})
