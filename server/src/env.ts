/**
 * Configuration, from the environment and nothing else.
 *
 * `DM_TOKEN` is the one secret and the server refuses to start without it —
 * a console that could publish and dispatch with no token would be a public
 * write endpoint, which is exactly what the old static host promised never to
 * have.
 */
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Env {
  /** The DM's bearer token. */
  token: string
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
  const token = env.DM_TOKEN?.trim()
  if (!token) throw new Error('DM_TOKEN is not set — the server will not start without it.')
  const port = Number(env.DM_PORT) || 8085
  const db = env.DM_DB || nodePath.resolve(process.cwd(), 'data/dm.sqlite')
  return {
    token,
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
