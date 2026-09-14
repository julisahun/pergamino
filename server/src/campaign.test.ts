/**
 * The session the server owns, driven without a socket or a request.
 */
import { describe, expect, it } from 'vitest'
import { HttpError } from './errors.ts'
import { CampaignSession } from './campaign.ts'
import { memoryWorld, partida, NEL, TOLMO } from './fixtures.ts'

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
      scores: null,
      saves: {},
      file: 'pnj/bandido.md',
    },
  ],
  objects: [{ id: 'anillo', name: 'Anillo', usos: 3, mods: {}, effects: [], file: 'objects/anillo.md' }],
  scenes: [],
}

describe('a campaign on the server', () => {
  it('registers with a fresh id, or under the id the console holds', () => {
    const { registry } = memoryWorld()
    const fresh = registry.registerCampaign('Marea Baja')
    expect(fresh.id).toMatch(/^[0-9a-f-]{36}$/)
    const held = registry.registerCampaign('Marea Baja', 'c-held')
    expect(held.id).toBe('c-held')
    // Registering twice under one id is the same campaign, retitled at most.
    expect(registry.registerCampaign('Marea Baja (2)', 'c-held').title).toBe('Marea Baja (2)')
  })

  it('gives the link to the mesa, so it survives changing campaign', () => {
    const { registry } = memoryWorld()
    const marea = partida(registry, 'Marea Baja', { campaign: 'c-1', mesa: 'last' })
    const { id } = marea.addCharacter(TOLMO, 'Ana')
    marea.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 4 }, { kind: 'dm' })
    marea.dispatch({ type: 'gold/set', ref: `pc:${id}`, gold: 115 }, { kind: 'dm' })

    // The same group sits down to something else entirely.
    const bandera = partida(registry, 'Sin Bandera', { campaign: 'c-2', mesa: 'last' })
    expect(bandera.link).toBe(marea.link)
    expect(bandera.characters.map((c) => c.name)).toEqual(['Tolmo'])
    // And they bring what they were carrying: this is the whole point.
    expect(bandera.state.play[id]).toMatchObject({ hp: 9, gold: 115 })
    // What was on the table does not come with them.
    expect(bandera.state.npcs).toEqual([])
    expect(bandera.rev).not.toBe(marea.rev)
  })

  it('sends a phone with the link wherever the mesa is sitting now', () => {
    const { registry } = memoryWorld()
    const marea = partida(registry, 'Marea Baja', { campaign: 'c-1', mesa: 'last' })
    expect(registry.byLink(marea.link)?.id).toBe('c-1')
    partida(registry, 'Sin Bandera', { campaign: 'c-2', mesa: 'last' })
    expect(registry.byLink(marea.link)?.id).toBe('c-2')
  })

  it('seats a new character at full HP and bumps the revision', () => {
    const { registry } = memoryWorld()
    const c = partida(registry)
    expect(c.rev).toBe(0)
    const { id, rev } = c.addCharacter(TOLMO, 'Ana')
    expect(rev).toBe(1)
    expect(c.characters).toEqual([{ id, name: 'Tolmo', player: 'Ana', portrait: null }])
    expect(c.state.play[id]).toMatchObject({ hp: 13 })
    expect(c.sheets.get(id)?.ac).toBe(19)
  })

  it('refuses what is not a Fight Club sheet', () => {
    const c = partida(memoryWorld().registry)
    expect(() => c.addCharacter('<html>no</html>', 'Ana')).toThrow(HttpError)
    expect(c.rev).toBe(0)
  })

  it('bumps the revision only when the reducer changed something', () => {
    const c = partida(memoryWorld().registry)
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
    const c = partida(memoryWorld().registry)
    const { id: tal } = c.addCharacter(TOLMO, 'Ana')
    const { id: nel } = c.addCharacter(NEL, 'Bea')
    expect(() =>
      c.dispatch({ type: 'hp/damage', ref: `pc:${nel}`, amount: 3 }, { kind: 'pc', pcId: tal }),
    ).toThrow(/not-your-pc/)
    expect(c.state.play[nel]!.hp).toBe(9)
    expect(c.dispatch({ type: 'hp/damage', ref: `pc:${tal}`, amount: 3 }, { kind: 'pc', pcId: tal }).changed).toBe(true)
  })

  it('refuses a stale absolute setter', () => {
    const c = partida(memoryWorld().registry)
    const { id, rev } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 1 }, { kind: 'dm' })
    expect(() => c.dispatch({ type: 'hp/set', ref: `pc:${id}`, hp: 5 }, { kind: 'dm' }, rev)).toThrow(/cambiado/)
  })

  it('round-trips through the database', () => {
    const { store, registry } = memoryWorld()
    const c = partida(registry, 'Marea', { campaign: 'c-1', mesa: 'm-1' })
    registry.setPrep(c.id, PREP, c.mesaId)
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'npc/add', pnjId: 'bandido', count: 2 }, { kind: 'dm' })
    c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 4 }, { kind: 'dm' })
    c.dispatch({ type: 'object/give', ref: `pc:${id}`, objectId: 'anillo' }, { kind: 'dm' })

    const again = CampaignSession.load(store, 'c-1', 'm-1')!
    expect(again.rev).toBe(c.rev)
    expect(again.state).toEqual(c.state)
    expect(again.characters).toEqual(c.characters)
    expect(again.state.npcs).toHaveLength(2)
    expect(again.playerView(id)?.objects[0]).toMatchObject({ name: 'Anillo', uses: { left: 3, total: 3 } })
  })

  it('keeps the live layer when a sheet is replaced, capping hp to the new max', () => {
    const c = partida(memoryWorld().registry)
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'gold/set', ref: `pc:${id}`, gold: 42 }, { kind: 'dm' })
    c.replaceSheet(id, NEL)
    expect(c.characters[0]!.name).toBe('Nel')
    expect(c.state.play[id]).toMatchObject({ hp: 9, gold: 42 })
  })

  /**
   * The level-up. This is what the whole record refactor is for, and the case
   * it fixes is the third one: hit points used to be capped down and never
   * granted upward, so a character who levelled came back hurt.
   */
  describe('editSheet', () => {
    const levelled = () => {
      const { store, registry } = memoryWorld()
      const c = partida(registry)
      const { id } = c.addCharacter(TOLMO, 'Ana')
      return { c, id, store }
    }

    it('merges only the fields it is given', () => {
      const { c, id } = levelled()
      c.editSheet(id, { level: 2, hpMax: 20 })
      const sheet = c.sheets.get(id)!
      expect(sheet).toMatchObject({ level: 2, hpMax: 20 })
      // Untouched, and still there: a patch is not a replacement.
      expect(sheet.name).toBe('Tolmo')
      expect(sheet.ac).toBe(19)
      expect(sheet.abilities).toMatchObject({ str: 17 })
      expect(sheet.weapons.map((w) => w.name)).toEqual(['Hacha'])
    })

    it('gives the new hit points to a character who had lost none', () => {
      const { c, id } = levelled()
      expect(c.state.play[id]).toMatchObject({ hp: 13 })
      c.editSheet(id, { level: 2, hpMax: 20 })
      expect(c.state.play[id]).toMatchObject({ hp: 20 })
    })

    it('gives them to a wounded character too, without healing the wound', () => {
      const { c, id } = levelled()
      c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 5 }, { kind: 'dm' })
      expect(c.state.play[id]).toMatchObject({ hp: 8 })
      c.editSheet(id, { hpMax: 20 })
      // 8 + 7, not 20: levelling up grants the die, it does not rest.
      expect(c.state.play[id]).toMatchObject({ hp: 15 })
    })

    it('still caps when the maximum comes down', () => {
      const { c, id } = levelled()
      c.editSheet(id, { hpMax: 9 })
      expect(c.state.play[id]).toMatchObject({ hp: 9 })
    })

    it('leaves the rest of the live layer exactly where it was', () => {
      const { c, id } = levelled()
      c.dispatch({ type: 'gold/set', ref: `pc:${id}`, gold: 115 }, { kind: 'dm' })
      c.dispatch({ type: 'slots/set', ref: `pc:${id}`, level: '1', spent: 1 }, { kind: 'dm' })
      c.editSheet(id, { level: 2, spellcasting: { ability: 'wis', slots: { '1': 3 } } })
      // `spent` counts what is gone, so a new slot arrives unspent by itself.
      expect(c.state.play[id]).toMatchObject({ gold: 115, spent: { '1': 1 } })
    })

    it('renames the row when the record is renamed', () => {
      const { c, id } = levelled()
      c.editSheet(id, { name: 'Tolmo el Viejo' })
      expect(c.characters[0]!.name).toBe('Tolmo el Viejo')
    })

    it('writes the previous record to the log, so an edit can be undone', () => {
      const { c, id, store } = levelled()
      const before = c.editSheet(id, { level: 2, hpMax: 20 }) - 1
      const [entry] = store.log(c.id, c.mesaId, before)
      const action = entry!.action as { type: string; id: string; before: { level: number; hpMax: number } }
      expect(entry!.actor).toBe('system:levelup')
      expect(action.id).toBe(id)
      // The whole previous record, which is what makes this reversible with
      // no column of its own: read it back and patch it in again.
      expect(action.before).toMatchObject({ level: 1, hpMax: 13 })
      c.editSheet(id, action.before)
      expect(c.sheets.get(id)).toMatchObject({ level: 1, hpMax: 13 })
      expect(c.state.play[id]).toMatchObject({ hp: 13 })
    })

    it('refuses a character that is not in the campaign', () => {
      const { c } = levelled()
      expect(() => c.editSheet('nope', { level: 2 })).toThrow(HttpError)
    })
  })

  it('takes a removed character out of the fight, the board and the party', () => {
    const c = partida(memoryWorld().registry)
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'token/place', ref: `pc:${id}`, x: 1, y: 1 }, { kind: 'dm' })
    c.dispatch({ type: 'encounter/start', members: [`pc:${id}`] }, { kind: 'dm' })
    c.removeCharacter(id)
    expect(c.characters).toEqual([])
    expect(c.state.play[id]).toBeUndefined()
    expect(c.state.field.tokens[`pc:${id}`]).toBeUndefined()
    expect(c.state.encounter.members).toEqual([])
  })

  it('archives on reset, clears the table and leaves the party alone', () => {
    const { store, registry } = memoryWorld()
    const c = partida(registry, 'x', { campaign: 'c-1', mesa: 'm-1' })
    registry.setPrep(c.id, PREP, c.mesaId)
    const { id } = c.addCharacter(TOLMO, 'Ana')
    c.dispatch({ type: 'hp/damage', ref: `pc:${id}`, amount: 5 }, { kind: 'dm' })
    c.dispatch({ type: 'npc/add', pnjId: 'bandido', count: 2 }, { kind: 'dm' })
    c.reset()
    // The table is cleared…
    expect(c.state.npcs).toEqual([])
    // …and what the people carry is not the table's to clear. A new session is
    // not a thing that takes away their oro, their inventario or their wounds.
    expect(c.state.play[id]!.hp).toBe(8)
    expect(store.log('c-1', 'm-1', 0).at(-1)).toMatchObject({ actor: 'system:reset' })
  })

  it('tells each subscriber what its role may see', () => {
    const c = partida(memoryWorld().registry)
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
