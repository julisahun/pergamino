/**
 * Configuration, from the environment and nothing else.
 *
 * No secret lives here. The credentials are per campaign — a DM secret and a
 * link secret, both rows in the database — so the server holds nothing that
 * would make it one DM's, and a public write endpoint is still not a thing
 * it has: every write under `/api/dm/campaigns/:id/` wants that campaign's
 * secret.
 */
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Env {
  /** SQLite file, or `:memory:`. */
  db: string
  port: number
  /** Where Vite's build is: the three pages and `assets/`. */
  dist: string
  backupDir: string
  /** The address players are handed — `https://dm.sigint-pm.uk`, no trailing slash. */
  publicUrl: string
}

const here = nodePath.dirname(fileURLToPath(import.meta.url))

export function readEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const port = Number(env.DM_PORT) || 8085
  const db = env.DM_DB || nodePath.resolve(process.cwd(), 'data/dm.sqlite')
  return {
    db,
    port,
    // `server/src/env.ts` and `server/dist/index.mjs` both sit two levels under
    // the root that holds `dist/`.
    dist: nodePath.resolve(env.DM_DIST || nodePath.join(here, '../../dist')),
    backupDir:
      env.DM_BACKUP_DIR || (db === ':memory:' ? '' : nodePath.join(nodePath.dirname(db), 'backups')),
    publicUrl: (env.PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, ''),
  }
}
