/**
 * SQLite, through `node:sqlite`.
 *
 * Synchronous on purpose: one process, one writer, and a dispatch is
 * reduce → write → broadcast with no `await` between them, which is what
 * makes the order of actions total without a lock. The whole database is a
 * few rows per campaign; a WAL write is milliseconds even on an SD card.
 */
import fs from 'node:fs'
import nodePath from 'node:path'
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite'

// Loaded by name at runtime rather than imported: Vite, which runs the tests,
// does not know `node:sqlite` is a builtin and goes looking for a package
// called `sqlite`. `getBuiltinModule` (Node ≥ 22.3) sidesteps every bundler.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')

export const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaign (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  link_secret TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS character (
  id            TEXT PRIMARY KEY,
  campaign      TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  player        TEXT NOT NULL,
  sheet_xml     TEXT NOT NULL,
  portrait_mime TEXT,
  portrait      BLOB,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS character_campaign ON character(campaign);
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
CREATE TABLE IF NOT EXISTS session (
  campaign   TEXT PRIMARY KEY REFERENCES campaign(id) ON DELETE CASCADE,
  rev        INTEGER NOT NULL,
  state      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS action_log (
  campaign TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  rev      INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  actor    TEXT NOT NULL,
  action   TEXT NOT NULL,
  PRIMARY KEY (campaign, rev)
);
CREATE TABLE IF NOT EXISTS session_archive (
  campaign    TEXT NOT NULL,
  archived_at INTEGER NOT NULL,
  rev         INTEGER NOT NULL,
  state       TEXT NOT NULL,
  PRIMARY KEY (campaign, archived_at)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
    this.run(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO NOTHING`,
      String(SCHEMA_VERSION),
    )
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
