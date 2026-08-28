/**
 * Snapshot a campaign folder into a JSON tree the browser can hold.
 *
 * The native directory picker cannot be driven from Playwright, so the
 * scripts open the app with `?fixture=example` and it mounts a `MemoryVault`
 * instead. That fixture has to be *in* the bundle, which means a build step —
 * this one. It is dev-only: `dmStore.start()` guards the import behind
 * `import.meta.env.DEV`, so the production build drops it.
 *
 * The committed `app/src/fixtures/example.json` is a snapshot of the demo
 * campaign that used to live at `campaigns/example`. That folder is gone from
 * the repo; the snapshot is what the drivers run against now, so regenerating
 * it needs a folder you point at yourself.
 *
 *   node scripts/build-fixture.mjs path/to/a/campaign
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(here, '..')

// The demo campaign no longer lives in this repo, so there is nothing to
// default to: name the folder you want snapshotted.
const given = process.argv[2] ?? process.env.EXAMPLE_ROOT
if (!given) {
  console.error('Usage: node scripts/build-fixture.mjs <path/to/a/campaign>')
  console.error('Snapshots that folder into app/src/fixtures/example.json.')
  process.exit(1)
}
const root = path.resolve(given)
const out = path.join(projectRoot, 'app/src/fixtures/example.json')

const TEXT = new Set(['.md', '.json', '.txt', '.xml', '.csv'])
const SKIP = new Set(['.DS_Store', '.git', '.obsidian', 'node_modules', '__pycache__'])

function walk(dir) {
  const tree = {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      tree[entry.name] = walk(abs)
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    // Text stays text so the snapshot is readable in a diff; the art has to
    // be base64, and it is what makes a screenshot worth taking.
    tree[entry.name] = TEXT.has(ext)
      ? fs.readFileSync(abs, 'utf8')
      : { b64: fs.readFileSync(abs).toString('base64') }
  }
  return tree
}

if (!fs.existsSync(root)) {
  console.error(`No example campaign at ${root}`)
  console.error('Pass the path, or set EXAMPLE_ROOT.')
  process.exit(1)
}

fs.mkdirSync(path.dirname(out), { recursive: true })
const tree = walk(root)
fs.writeFileSync(out, `${JSON.stringify({ name: path.basename(root), tree })}\n`)
console.log(`${path.relative(process.cwd(), out)} ← ${root}`)
console.log(`${(fs.statSync(out).size / 1024).toFixed(0)} kB`)
