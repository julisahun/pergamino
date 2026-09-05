/**
 * Every driving script, in order, against a dev server.
 *
 * They all open the app on `?fixture=example`, so there is no vault to
 * protect and nothing to configure — start `npm run dev` and run this. The
 * fixture needs the campaign server too: if nothing answers on its port, one
 * is started here on an in-memory database and stopped at the end.
 *
 * The write-discipline acceptance test that used to live beside these is
 * gone: with no server to script, the equivalent check is `scope.test.ts`
 * (which asserts that nothing outside `runs/<mesa>/` and `scenarios/` is ever
 * resolved writable) plus the by-hand `git status` in the README.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE } from './_browser.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = [
  'tour.mjs',
  'e2e-mesa.mjs',
  'e2e-combate.mjs',
  'e2e-acciones.mjs',
  'e2e-congelar.mjs',
  'e2e-notas.mjs',
  'e2e-party.mjs',
  'e2e-catalogo.mjs',
  'e2e-mascara.mjs',
  'e2e-preparacion.mjs',
  'e2e-pj.mjs',
]

try {
  const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) })
  if (!res.ok) throw new Error(String(res.status))
} catch {
  console.error(`No dev server at ${BASE}. Run \`npm run dev\` first.`)
  process.exit(1)
}

const API_PORT = process.env.DM_PORT ?? '8085'
const ping = async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/ping`, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}
let server = null
if (!(await ping())) {
  server = spawn(process.execPath, ['server/src/index.ts'], {
    cwd: path.resolve(here, '..'),
    stdio: 'inherit',
    env: { ...process.env, DM_DB: ':memory:', DM_PORT: API_PORT },
  })
  for (let i = 0; i < 50 && !(await ping()); i++) await new Promise((r) => setTimeout(r, 200))
  if (!(await ping())) {
    console.error('The campaign server never came up.')
    server.kill()
    process.exit(1)
  }
  console.log(`campaign server started on :${API_PORT} (in-memory)`)
}

let failed = 0
for (const name of SCRIPTS) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
  const code = await new Promise((resolve) => {
    spawn(process.execPath, [path.join(here, name)], { stdio: 'inherit' }).on('close', resolve)
  })
  if (code !== 0) failed++
}

server?.kill('SIGTERM')
console.log(
  failed === 0
    ? `\nall ${SCRIPTS.length} scripts passed`
    : `\n${failed} of ${SCRIPTS.length} scripts failed`,
)
process.exitCode = failed === 0 ? 0 : 1
