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

await finish()
