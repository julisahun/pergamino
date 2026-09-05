/**
 * Every driving script, in order, against a dev server.
 *
 * They all open the app on `?fixture=example`, so there is no vault to
 * protect and nothing to configure — start `npm run dev` and run this.
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
]

try {
  const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) })
  if (!res.ok) throw new Error(String(res.status))
} catch {
  console.error(`No dev server at ${BASE}. Run \`npm run dev\` first.`)
  process.exit(1)
}

let failed = 0
for (const name of SCRIPTS) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
  const code = await new Promise((resolve) => {
    spawn(process.execPath, [path.join(here, name)], { stdio: 'inherit' }).on('close', resolve)
  })
  if (code !== 0) failed++
}

console.log(
  failed === 0
    ? `\nall ${SCRIPTS.length} scripts passed`
    : `\n${failed} of ${SCRIPTS.length} scripts failed`,
)
process.exitCode = failed === 0 ? 0 : 1
