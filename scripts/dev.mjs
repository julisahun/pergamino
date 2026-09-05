/**
 * `npm run dev`: the server and Vite, together, one Ctrl-C.
 *
 * The server keeps its database in `data/dev.sqlite` (gitignored) so a file
 * save that restarts it does not lose the table; `DM_DB=:memory:` for a clean
 * slate. No credential to set up: a campaign's DM secret is minted when the
 * console registers it and lives in the folder's `.pergamino/campaign.json`;
 * `?fixture=example`, which the drivers open, registers under a fixed one.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {
  ...process.env,
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
