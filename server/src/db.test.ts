/**
 * The schema moves forward under a database that already has rows.
 */
import fs from 'node:fs'
import os from 'node:os'
import nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { Db, SCHEMA_VERSION } from './db.ts'
import { Store } from './store.ts'

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
