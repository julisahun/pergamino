/**
 * SQLite, through `node:sqlite`.
 *
 * Synchronous on purpose: one process, one writer, and a dispatch is
 * reduce → write → broadcast with no `await` between them, which is what
 * makes the order of actions total without a lock. The whole database is a
 * few rows per campaign; a WAL write is milliseconds even on an SD card.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import nodePath from 'node:path'
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite'

// Loaded by name at runtime rather than imported: Vite, which runs the tests,
// does not know `node:sqlite` is a builtin and goes looking for a package
// called `sqlite`. `getBuiltinModule` (Node ≥ 22.3) sidesteps every bundler.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')

export const SCHEMA_VERSION = 3

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaign (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  dm_secret   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
-- A mesa is the group, and it outlives any one campaign: it owns the party,
-- the players' link and the live layer of each PJ. "playing" is the campaign
-- it has on the table right now, which is how a phone finds its partida.
CREATE TABLE IF NOT EXISTS mesa (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  link_secret TEXT NOT NULL UNIQUE,
  playing     TEXT REFERENCES campaign(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);
-- PG, oro, inventario, espacios: the people's own state, which travels with
-- them from one campaign to the next. The partida row holds everything else.
CREATE TABLE IF NOT EXISTS mesa_play (
  mesa       TEXT PRIMARY KEY REFERENCES mesa(id) ON DELETE CASCADE,
  play       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS character (
  id            TEXT PRIMARY KEY,
  mesa          TEXT NOT NULL REFERENCES mesa(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  player        TEXT NOT NULL,
  sheet_xml     TEXT NOT NULL,
  portrait_mime TEXT,
  portrait      BLOB,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prep (
  campaign     TEXT PRIMARY KEY REFERENCES campaign(id) ON DELETE CASCADE,
  pnjs         TEXT NOT NULL,
  objects      TEXT NOT NULL,
  scenes       TEXT NOT NULL,
  published_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pnj_portrait (
  campaign TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  pnj      TEXT NOT NULL,
  mime     TEXT NOT NULL,
  bytes    BLOB NOT NULL,
  etag     TEXT NOT NULL,
  PRIMARY KEY (campaign, pnj)
);
-- One row per (campaign, mesa): what that group did to that adventure. Two
-- mesas can play the same campaign at once, which one session row could not.
CREATE TABLE IF NOT EXISTS partida (
  campaign   TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  mesa       TEXT NOT NULL REFERENCES mesa(id) ON DELETE CASCADE,
  rev        INTEGER NOT NULL,
  state      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (campaign, mesa)
);
CREATE TABLE IF NOT EXISTS action_log (
  campaign TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  mesa     TEXT NOT NULL REFERENCES mesa(id) ON DELETE CASCADE,
  rev      INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  actor    TEXT NOT NULL,
  action   TEXT NOT NULL,
  PRIMARY KEY (campaign, mesa, rev)
);
CREATE TABLE IF NOT EXISTS session_archive (
  campaign    TEXT NOT NULL,
  mesa        TEXT NOT NULL,
  archived_at INTEGER NOT NULL,
  rev         INTEGER NOT NULL,
  state       TEXT NOT NULL,
  PRIMARY KEY (campaign, mesa, archived_at)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

// Indexes go up after the migration has run: on a v2 database the character
// table has no `mesa` column yet when SCHEMA is executed.
const INDEXES = `
CREATE INDEX IF NOT EXISTS character_mesa ON character(mesa);
`

export class Db {
  readonly #db: DatabaseSyncType
  readonly path: string

  constructor(path: string) {
    this.path = path
    if (path !== ':memory:') fs.mkdirSync(nodePath.dirname(path), { recursive: true })
    this.#db = new DatabaseSync(path)
    this.#db.exec('PRAGMA journal_mode = WAL')
    this.#db.exec('PRAGMA synchronous = NORMAL')
    this.#db.exec('PRAGMA foreign_keys = ON')
    this.#db.exec(SCHEMA)
    this.#migrate()
    this.#db.exec(INDEXES)
    this.run(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      String(SCHEMA_VERSION),
    )
  }

  #columns(table: string): string[] {
    return this.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name)
  }

  #migrate(): void {
    this.#toPerCampaignSecrets()
    if (this.#columns('character').includes('campaign')) this.#toMesas()
  }

  /**
   * v1 → v2: the DM's credential moves from one server-wide token in `.env` to
   * a secret per campaign. A row from before gets one minted here; the console
   * that holds that campaign's folder learns it by re-registering under the id
   * it has — see `PUT /api/dm/campaigns/:id`.
   */
  #toPerCampaignSecrets(): void {
    if (!this.#columns('campaign').includes('dm_secret')) {
      this.#db.exec(`ALTER TABLE campaign ADD COLUMN dm_secret TEXT NOT NULL DEFAULT ''`)
    }
    for (const { id } of this.all<{ id: string }>(`SELECT id FROM campaign WHERE dm_secret = ''`)) {
      this.run('UPDATE campaign SET dm_secret = ? WHERE id = ?', randomBytes(15).toString('base64url'), id)
    }
  }

  /**
   * v2 → v3: the party stops belonging to the campaign and starts belonging to
   * the **mesa**, because a group outlives the adventure it is playing.
   *
   * Every v2 campaign had exactly one party, so it becomes exactly one mesa —
   * and that mesa inherits the campaign's `link_secret`, so **every phone that
   * already has a link goes on working**, and the same link now follows the
   * group into the next campaign.
   *
   * The live session splits along the same seam. `play` — PG, oro, inventario,
   * objetos, espacios: the people's own state — goes to the mesa and travels
   * with them. Everything else (the NPCs on the table, the encounter, the
   * scene, the log) is what that group did to that campaign, and becomes the
   * `partida` row. Nothing is dropped on the floor: both halves are written
   * before `session` is.
   */
  #toMesas(): void {
    // A rebuild has to move rows between tables that reference each other.
    // `PRAGMA foreign_keys` is a no-op inside a transaction, so it goes here.
    this.#db.exec('PRAGMA foreign_keys = OFF')
    try {
      this.transaction(() => {
        const mesaOf = new Map<string, string>()
        const campaigns = this.all<{
          id: string
          title: string
          link_secret: string
          created_at: number
        }>('SELECT id, title, link_secret, created_at FROM campaign')
        for (const c of campaigns) {
          const mesa = randomUUID()
          mesaOf.set(c.id, mesa)
          this.run(
            'INSERT INTO mesa (id, title, link_secret, playing, created_at) VALUES (?, ?, ?, ?, ?)',
            mesa,
            c.title,
            c.link_secret,
            c.id,
            c.created_at,
          )
        }

        // The party, rekeyed. Sheets and portraits ride along untouched.
        this.#db.exec(`CREATE TABLE character_v3 (
          id            TEXT PRIMARY KEY,
          mesa          TEXT NOT NULL REFERENCES mesa(id) ON DELETE CASCADE,
          name          TEXT NOT NULL,
          player        TEXT NOT NULL,
          sheet_xml     TEXT NOT NULL,
          portrait_mime TEXT,
          portrait      BLOB,
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL
        )`)
        for (const [campaign, mesa] of mesaOf) {
          this.run(
            `INSERT INTO character_v3 (id, mesa, name, player, sheet_xml, portrait_mime, portrait, created_at, updated_at)
             SELECT id, ?, name, player, sheet_xml, portrait_mime, portrait, created_at, updated_at
             FROM character WHERE campaign = ?`,
            mesa,
            campaign,
          )
        }
        this.#db.exec('DROP TABLE character')
        this.#db.exec('ALTER TABLE character_v3 RENAME TO character')
        this.#db.exec('CREATE INDEX IF NOT EXISTS character_mesa ON character(mesa)')

        // The session, split in two.
        for (const row of this.all<{
          campaign: string
          rev: number
          state: string
          updated_at: number
        }>('SELECT campaign, rev, state, updated_at FROM session')) {
          const mesa = mesaOf.get(row.campaign)
          if (!mesa) continue
          const state = JSON.parse(row.state) as Record<string, unknown>
          const play = state.play ?? {}
          delete state.play
          this.run(
            'INSERT INTO partida (campaign, mesa, rev, state, updated_at) VALUES (?, ?, ?, ?, ?)',
            row.campaign,
            mesa,
            row.rev,
            JSON.stringify(state),
            row.updated_at,
          )
          this.run(
            `INSERT INTO mesa_play (mesa, play, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(mesa) DO UPDATE SET play = excluded.play, updated_at = excluded.updated_at`,
            mesa,
            JSON.stringify(play),
            row.updated_at,
          )
        }
        this.#db.exec('DROP TABLE session')

        this.#rekeyByMesa('action_log', mesaOf, {
          create: `CREATE TABLE action_log_v3 (
            campaign TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
            mesa     TEXT NOT NULL REFERENCES mesa(id) ON DELETE CASCADE,
            rev      INTEGER NOT NULL,
            at       INTEGER NOT NULL,
            actor    TEXT NOT NULL,
            action   TEXT NOT NULL,
            PRIMARY KEY (campaign, mesa, rev)
          )`,
          copy: 'campaign, ?, rev, at, actor, action',
          columns: 'campaign, mesa, rev, at, actor, action',
        })
        this.#rekeyByMesa('session_archive', mesaOf, {
          create: `CREATE TABLE session_archive_v3 (
            campaign    TEXT NOT NULL,
            mesa        TEXT NOT NULL,
            archived_at INTEGER NOT NULL,
            rev         INTEGER NOT NULL,
            state       TEXT NOT NULL,
            PRIMARY KEY (campaign, mesa, archived_at)
          )`,
          copy: 'campaign, ?, archived_at, rev, state',
          columns: 'campaign, mesa, archived_at, rev, state',
        })

        // And the campaign loses the link, which is the mesa's now.
        this.#db.exec(`CREATE TABLE campaign_v3 (
          id         TEXT PRIMARY KEY,
          title      TEXT NOT NULL,
          dm_secret  TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`)
        this.#db.exec('INSERT INTO campaign_v3 SELECT id, title, dm_secret, created_at FROM campaign')
        this.#db.exec('DROP TABLE campaign')
        this.#db.exec('ALTER TABLE campaign_v3 RENAME TO campaign')
      })
    } finally {
      this.#db.exec('PRAGMA foreign_keys = ON')
    }
  }

  /** Rebuild a campaign-keyed table with the mesa that campaign's party became. */
  #rekeyByMesa(
    table: string,
    mesaOf: Map<string, string>,
    sql: { create: string; copy: string; columns: string },
  ): void {
    this.#db.exec(sql.create)
    for (const [campaign, mesa] of mesaOf) {
      this.run(
        `INSERT INTO ${table}_v3 (${sql.columns}) SELECT ${sql.copy} FROM ${table} WHERE campaign = ?`,
        mesa,
        campaign,
      )
    }
    this.#db.exec(`DROP TABLE ${table}`)
    this.#db.exec(`ALTER TABLE ${table}_v3 RENAME TO ${table}`)
  }

  exec(sql: string): void {
    this.#db.exec(sql)
  }

  run(sql: string, ...params: SQLInputValue[]): void {
    this.#db.prepare(sql).run(...params)
  }

  get<T extends object>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.#db.prepare(sql).get(...params) as T | undefined
  }

  all<T extends object>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.#db.prepare(sql).all(...params) as T[]
  }

  /** Everything in `fn` lands or nothing does. Synchronous, so no interleaving. */
  transaction<T>(fn: () => T): T {
    this.#db.exec('BEGIN')
    try {
      const out = fn()
      this.#db.exec('COMMIT')
      return out
    } catch (err) {
      this.#db.exec('ROLLBACK')
      throw err
    }
  }

  /** A consistent copy while WAL is live — `VACUUM INTO` needs no CLI. */
  backupTo(file: string): void {
    fs.mkdirSync(nodePath.dirname(file), { recursive: true })
    if (fs.existsSync(file)) fs.unlinkSync(file)
    this.#db.prepare('VACUUM INTO ?').run(file)
  }

  close(): void {
    this.#db.close()
  }
}
