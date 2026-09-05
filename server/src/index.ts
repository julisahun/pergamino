/**
 * pantalla-dm's server: the static host that `server.py` was, plus the one
 * thing it swore never to have — an endpoint that receives something.
 *
 * What it receives is bounded and stated: the campaign's id and title, the
 * prep the reducer needs (statblocks, object rules, scene rosters — no prose),
 * the `-fc5.xml` a player uploads, and actions. What it holds is characters
 * and live state. It never sees a directory, a note, or `story/`.
 */
import fs from 'node:fs'
import { createServer } from 'node:http'
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import { scheduleBackups } from './backup.ts'
import { Db } from './db.ts'
import { readEnv } from './env.ts'
import { createHandler } from './http.ts'
import { Registry } from './registry.ts'
import { Store } from './store.ts'
import { attachWs } from './ws.ts'

function version(): string {
  try {
    const here = nodePath.dirname(fileURLToPath(import.meta.url))
    for (const candidate of ['../../package.json', '../package.json']) {
      const p = nodePath.join(here, candidate)
      if (fs.existsSync(p)) return (JSON.parse(fs.readFileSync(p, 'utf8')) as { version: string }).version
    }
  } catch {
    /* fall through */
  }
  return 'dev'
}

export function main(): void {
  const env = readEnv()
  const db = new Db(env.db)
  const store = new Store(db)
  store.pruneLog()
  const registry = new Registry(store)
  const ctx = { env, registry, store, version: version() }

  const server = createServer(createHandler(ctx))
  const wss = attachWs(server, ctx)
  const stopBackups = scheduleBackups(db, env.backupDir)

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`DM:  http://127.0.0.1:${env.port}/`)
    console.log(`TV:  http://127.0.0.1:${env.port}/tv`)
    console.log(`PJ:  ${env.publicUrl}/pj#<enlace>`)
    console.log(`db:  ${env.db}`)
  })

  const shutdown = () => {
    stopBackups()
    wss.close()
    server.close(() => {
      db.close()
      process.exit(0)
    })
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main()
