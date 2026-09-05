/**
 * Drives the Notas screen: the index, search, backlinks, dead links.
 *
 * The example campaign's four wikilinks all name a *title* (`[[The Vanishing]]`)
 * rather than a file (`00-the-vanishing.md`), so every one of them is dangling
 * — by Obsidian's rules as much as by ours. That makes it a decent fixture for
 * the dead-link rendering and a poor one for navigation, so the walk here goes
 * through the index instead.
 */
import { open } from './_browser.mjs'

const { dm, shot, finish } = await open()
await dm.getByRole('button', { name: 'Notas', exact: true }).click()
await dm.waitForSelector('.reader-body h1')

console.log('driving notas:')
await shot('notas-1-indice')

const dead = await dm.locator('.reader-body span.wl.dead').count()
console.log(`  dangling links shown as dead: ${dead}`)
if (dead !== 3) {
  console.log('  FAIL — story/README.md has three dangling links')
  process.exitCode = 1
}

// Walk the index instead.
for (const [title, name] of [
  ['The Vanishing', 'vanishing'],
  ['The Reveal', 'reveal'],
  ['Sesión 1 — la desaparición', 'bitacora'],
]) {
  await dm.locator('.note-list button', { hasText: title }).first().click()
  await dm.waitForTimeout(300)
  await shot(`notas-2-${name}`)
}

// Search finds a phrase in a body and quotes the line it came from.
await dm.locator('.note-search').fill('Curdmoor')
await dm.waitForTimeout(600)
const hits = await dm.locator('.note-list button').count()
console.log(`  "Curdmoor" hits: ${hits}`)
if (hits === 0) {
  console.log('  FAIL — search found nothing')
  process.exitCode = 1
}
await shot('notas-3-buscar')

// Tag filtering.
await dm.locator('.note-search').fill('')
await dm.waitForTimeout(300)
const tag = dm.locator('.tag-cloud button').first()
if (await tag.count()) {
  await tag.click()
  await shot('notas-4-tag')
}

/*
 * The note being read is in the URL, and «Ver nota» from another tab lands on
 * it. Both used to be broken in the same place: the panel's «open the index
 * first» effect ran in the same commit as the one that honours the note
 * another tab asked for, read a stale `current`, and opened story/README.md
 * straight over it — so «Ver nota» looked like it only switched tabs.
 */
const notaParam = () => new URL(dm.url()).searchParams.get('nota')

// An object's sheet carries the button. A PC's no longer does: a character is
// a row on the server, and what the vault holds about it is ordinary notes.
await dm.getByRole('button', { name: 'Objetos', exact: true }).first().click()
await dm.waitForSelector('.obj-grid')
await dm.locator('.obj-tile').first().click()
await dm.waitForTimeout(300)
const file = (await dm.locator('.sheet .reader-path').innerText()).trim()
await dm.locator('.sheet').getByRole('button', { name: /Ver nota/ }).click()
await dm.waitForTimeout(500)

const opened = await dm.locator('.reader-path').innerText()
console.log(`  «Ver nota» opened: ${opened}`)
if (opened !== file) {
  console.log(`  FAIL — «Ver nota» did not open the object's own note (${file})`)
  process.exitCode = 1
}
if (notaParam() !== opened) {
  console.log(`  FAIL — ?nota= says ${notaParam()}, reader says ${opened}`)
  process.exitCode = 1
}
await shot('notas-5-ver-nota')

// A reload comes back to the same note, on this tab rather than on Mesa.
await dm.reload({ waitUntil: 'networkidle' })
await dm.waitForSelector('.reader-path')
const afterReload = await dm.locator('.reader-path').innerText()
console.log(`  after reload: ${afterReload}`)
if (afterReload !== opened) {
  console.log('  FAIL — the URL did not bring the note back')
  process.exitCode = 1
}

// A path nothing answers to must not leave the panel blank.
await dm.goto(`${new URL(dm.url()).origin}/index.html?fixture=example&nota=no/such/note.md`)
await dm.waitForSelector('.reader-path')
const fallback = await dm.locator('.reader-path').innerText()
console.log(`  bogus ?nota falls back to: ${fallback}`)
if (!fallback.endsWith('README.md')) {
  console.log('  FAIL — a dead ?nota should fall back to the index')
  process.exitCode = 1
}

await finish()
