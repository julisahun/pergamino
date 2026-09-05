/**
 * `npm run dev`: the server and Vite, together, one Ctrl-C.
 *
 * The server keeps its database in `data/dev.sqlite` (gitignored) so a file
 * save that restarts it does not lose the table; `DM_DB=:memory:` for a clean
 * slate. The token is `dev` unless `DM_TOKEN` says otherwise — paste it once
 * into the console, or open `?fixture=example`, which the drivers do.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {
  ...process.env,
  DM_TOKEN: process.env.DM_TOKEN ?? 'dev',
  DM_DB: process.env.DM_DB ?? path.join(root, 'data/dev.sqlite'),
  DM_PORT: process.env.DM_PORT ?? '8085',
}

const children = [
  spawn(process.execPath, ['--watch', 'server/src/index.ts'], { cwd: root, env, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: root, env, stdio: 'inherit' }),
]

const stop = () => {
  for (const c of children) c.kill('SIGTERM')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const c of children) c.on('exit', stop)
