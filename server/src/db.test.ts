/**
 * The schema moves forward under a database that already has rows.
 */
import fs from 'node:fs'
import os from 'node:os'
import nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { Db, SCHEMA_VERSION } from './db.ts'
import { Store } from './store.ts'
import type { Sheet } from '../../shared/character.ts'

describe('the schema', () => {
  it('gives a v1 campaign a DM secret of its own and stamps the version', () => {
    const file = nodePath.join(fs.mkdtempSync(nodePath.join(os.tmpdir(), 'dm-db-')), 'v1.sqlite')
    // A database the first server wrote: no dm_secret column, one campaign.
    const v1 = new Db(file)
    v1.exec('DROP TABLE campaign')
    v1.exec(`CREATE TABLE campaign (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, link_secret TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)`)
    v1.run('INSERT INTO campaign (id, title, link_secret, created_at) VALUES (?, ?, ?, ?)', 'c1', 'Marea', 'l1', 1)
    v1.run(`UPDATE meta SET value = '1' WHERE key = 'schema_version'`)
    v1.close()

    const db = new Db(file)
    const row = new Store(db).campaign('c1')!
    expect(row.dm_secret).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect(db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema_version'`)?.value).toBe(
      String(SCHEMA_VERSION),
    )
    // Opening again mints nothing new.
    const secret = row.dm_secret
    db.close()
    const again = new Db(file)
    expect(new Store(again).campaign('c1')!.dm_secret).toBe(secret)
    again.close()
  })
})

describe('v2 → v3: the party stops belonging to the campaign', () => {
  /** A database the per-campaign-secret server wrote, with a party and a played session. */
  const v2 = (): string => {
    const file = nodePath.join(fs.mkdtempSync(nodePath.join(os.tmpdir(), 'dm-db-')), 'v2.sqlite')
    const db = new Db(file)
    for (const t of ['character', 'action_log', 'session_archive', 'campaign']) db.exec(`DROP TABLE ${t}`)
    db.exec(`CREATE TABLE campaign (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, link_secret TEXT NOT NULL UNIQUE,
      dm_secret TEXT NOT NULL, created_at INTEGER NOT NULL)`)
    db.exec(`CREATE TABLE character (
      id TEXT PRIMARY KEY, campaign TEXT NOT NULL, name TEXT NOT NULL, player TEXT NOT NULL,
      sheet_xml TEXT NOT NULL, portrait_mime TEXT, portrait BLOB,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
    db.exec(`CREATE TABLE session (
      campaign TEXT PRIMARY KEY, rev INTEGER NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL)`)
    db.exec(`CREATE TABLE action_log (
      campaign TEXT NOT NULL, rev INTEGER NOT NULL, at INTEGER NOT NULL,
      actor TEXT NOT NULL, action TEXT NOT NULL, PRIMARY KEY (campaign, rev))`)
    db.exec(`CREATE TABLE session_archive (
      campaign TEXT NOT NULL, archived_at INTEGER NOT NULL, rev INTEGER NOT NULL,
      state TEXT NOT NULL, PRIMARY KEY (campaign, archived_at))`)

    db.run('INSERT INTO campaign VALUES (?, ?, ?, ?, ?)', 'marea', 'Marea Baja', 'el-enlace', 'el-secreto', 1)
    db.run(
      'INSERT INTO character (id, campaign, name, player, sheet_xml, portrait_mime, portrait, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      'pc-toribio', 'marea', 'Toribio', 'Victor', '<xml/>', 'image/png', new Uint8Array([1, 2, 3]), 2, 3,
    )
    db.run(
      'INSERT INTO character (id, campaign, name, player, sheet_xml, portrait_mime, portrait, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      'pc-aluci', 'marea', 'Aluci', 'Belu', '<xml2/>', null, null, 4, 5,
    )
    const state = {
      version: 5,
      play: {
        'pc-toribio': { hp: 7, gold: 115, inventory: 'una daga del abuelo', objects: ['obj-daga'] },
        'pc-aluci': { hp: 10, gold: 0, inventory: 'el mandoble de Ossian', objects: [] },
      },
      objects: { 'obj-oleo': { uses: 1, spent: false } },
      npcs: [{ id: 'n1', name: 'Bandido' }],
      encounter: { round: 0 },
      field: { mode: 'scene' },
      log: [{ t: 1, kind: 'scene', text: 'manantial' }],
    }
    db.run('INSERT INTO session VALUES (?, ?, ?, ?)', 'marea', 42, JSON.stringify(state), 6)
    db.run('INSERT INTO action_log VALUES (?, ?, ?, ?, ?)', 'marea', 42, 6, 'dm', '{"type":"noop"}')
    db.run('INSERT INTO session_archive VALUES (?, ?, ?, ?)', 'marea', 7, 41, '{"version":5}')
    db.run(`UPDATE meta SET value = '2' WHERE key = 'schema_version'`)
    db.close()
    return file
  }

  it('keeps every player exactly as they were, on a mesa of their own', () => {
    const db = new Db(v2())

    const mesa = db.get<{ id: string; title: string; link_secret: string; playing: string }>(
      'SELECT * FROM mesa',
    )!
    // The phones that already have a link go on working, and the link now
    // follows the group into whatever they play next.
    expect(mesa.link_secret).toBe('el-enlace')
    expect(mesa.playing).toBe('marea')

    const pcs = db.all<{ id: string; mesa: string; name: string; sheet_xml: string; portrait: Uint8Array | null }>(
      'SELECT * FROM character ORDER BY created_at',
    )
    expect(pcs.map((p) => p.id)).toEqual(['pc-toribio', 'pc-aluci'])
    expect(pcs.every((p) => p.mesa === mesa.id)).toBe(true)
    expect(pcs[0]!.sheet_xml).toBe('<xml/>')
    expect([...(pcs[0]!.portrait ?? [])]).toEqual([1, 2, 3])

    // What the players had on them is intact, and it is the mesa's now.
    const play = JSON.parse(db.get<{ play: string }>('SELECT play FROM mesa_play')!.play)
    expect(play['pc-toribio']).toEqual({
      hp: 7, gold: 115, inventory: 'una daga del abuelo', objects: ['obj-daga'],
    })
    expect(play['pc-aluci'].inventory).toBe('el mandoble de Ossian')

    // And what was on the table is the partida's, minus the people.
    const partida = db.get<{ campaign: string; mesa: string; rev: number; state: string }>('SELECT * FROM partida')!
    expect([partida.campaign, partida.mesa, partida.rev]).toEqual(['marea', mesa.id, 42])
    const rest = JSON.parse(partida.state)
    expect(rest.play).toBeUndefined()
    expect(rest.npcs).toEqual([{ id: 'n1', name: 'Bandido' }])
    expect(rest.objects).toEqual({ 'obj-oleo': { uses: 1, spent: false } })
    expect(rest.log).toHaveLength(1)

    expect(db.get<{ mesa: string }>('SELECT mesa FROM action_log')!.mesa).toBe(mesa.id)
    expect(db.get<{ mesa: string }>('SELECT mesa FROM session_archive')!.mesa).toBe(mesa.id)
    expect(db.all<{ name: string }>('PRAGMA table_info(campaign)').map((c) => c.name)).not.toContain('link_secret')
    expect(db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`)).toEqual([])
    expect(db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema_version'`)?.value).toBe(
      String(SCHEMA_VERSION),
    )
    db.close()
  })

  /**
   * The migration that makes levelling up possible: a character stops being a
   * projection of its xml and becomes a row that can be edited.
   */
  it('v3 → v4: the xml is read once into a record, and kept as provenance', () => {
    const file = nodePath.join(fs.mkdtempSync(nodePath.join(os.tmpdir(), 'dm-db-')), 'v3.sqlite')
    const v3 = new Db(file)
    v3.exec('DROP TABLE character')
    v3.exec(`CREATE TABLE character (
      id TEXT PRIMARY KEY, mesa TEXT NOT NULL, name TEXT NOT NULL, player TEXT NOT NULL,
      sheet_xml TEXT NOT NULL, portrait_mime TEXT, portrait BLOB,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
    v3.run('INSERT INTO mesa (id, title, link_secret, created_at) VALUES (?, ?, ?, ?)', 'm1', 'Last', 'l1', 1)
    v3.run(
      `INSERT INTO character (id, mesa, name, player, sheet_xml, portrait, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'pc-1', 'm1', 'Tolmo', 'Juli',
      `<pc version="5"><character><name>Tolmo</name>
        <race><name>Enano</name><speed>30</speed></race>
        <class><name>Guerrero</name><level>1</level></class>
        <note><text>Enano guerrero de nivel 1 (Guardia).

CA 19 · PG 13 · Iniciativa +2 · Percepción pasiva 12 · Competencia +2</text></note>
        <abilities>17,10,14,8,14,12,</abilities><hpMax>13</hpMax></character></pc>`,
      new Uint8Array([1, 2, 3]), 1, 1,
    )
    v3.run(`UPDATE meta SET value = '3' WHERE key = 'schema_version'`)
    v3.close()

    const db = new Db(file)
    const row = db.get<{ sheet: string; sheet_xml: string | null; name: string; player: string; portrait: Uint8Array }>(
      'SELECT * FROM character WHERE id = ?',
      'pc-1',
    )!
    const sheet = JSON.parse(row.sheet) as Sheet
    expect(sheet).toMatchObject({
      name: 'Tolmo',
      species: 'Enano',
      className: 'Guerrero',
      level: 1,
      hpMax: 13,
      ac: 19,
      initiative: 2,
      proficiency: 2,
      abilities: { str: 17, dex: 10, con: 14, int: 8, wis: 14, cha: 12 },
    })
    // Everything around the character survives the table being rebuilt.
    expect([row.name, row.player]).toEqual(['Tolmo', 'Juli'])
    expect([...row.portrait]).toEqual([1, 2, 3])
    // The xml is still there, and is now allowed not to be: a character need
    // not have come from a file any more.
    expect(row.sheet_xml).toContain('<name>Tolmo</name>')
    const columns = db.all<{ name: string; notnull: number }>('PRAGMA table_info(character)')
    expect(columns.find((c) => c.name === 'sheet')!.notnull).toBe(1)
    expect(columns.find((c) => c.name === 'sheet_xml')!.notnull).toBe(0)
    expect(db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema_version'`)?.value).toBe(
      String(SCHEMA_VERSION),
    )

    // Opening it again re-reads nothing: the record is the source now.
    db.close()
    const again = new Db(file)
    expect(again.get<{ sheet: string }>('SELECT sheet FROM character WHERE id = ?', 'pc-1')!.sheet).toBe(row.sheet)
    again.close()
  })

  it('is idempotent: opening the migrated database again changes nothing', () => {
    const file = v2()
    const first = new Db(file)
    const before = first.get<{ id: string; link_secret: string }>('SELECT * FROM mesa')!
    const play = first.get<{ play: string }>('SELECT play FROM mesa_play')!.play
    first.close()

    const again = new Db(file)
    expect(again.get<{ id: string }>('SELECT * FROM mesa')!.id).toBe(before.id)
    expect(again.all('SELECT * FROM mesa')).toHaveLength(1)
    expect(again.get<{ play: string }>('SELECT play FROM mesa_play')!.play).toBe(play)
    again.close()
  })
})
