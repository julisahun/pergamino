/**
 * Preparación — the one place the app writes into the prep folders.
 *
 * Two things to prove: that a saved roster reaches `scenarios/*.json` and
 * comes back on reload, and that the screen refuses to work while a run is
 * live. The second is the interesting one: `runs/README.md` says a session
 * only ever accumulates, so a *session* editing preparation is the case that
 * must not be reachable.
 *
 * Safe to run: `?fixture=example` writes into a tree that lives in the tab.
 */
import { open } from './_browser.mjs'

const { dm, shot, finish } = await open()
await dm.waitForSelector('.mesa-bar')

const openPrep = async () => {
  await dm.getByRole('button', { name: '⋯' }).click()
  await dm.getByRole('button', { name: 'Preparación' }).click()
  await dm.waitForSelector('.roster-card')
}

console.log('preparación:')
await openPrep()
await shot('prep-1-vacio')

// Add a rat to the first scene and save it.
const card = dm.locator('.roster-card').first()
await card.getByRole('button', { name: 'Añadir PNJ' }).click()
await card.locator('select').selectOption('sewer-cheese-rat')
await card.locator('.hp-input').fill('3')
await card.getByRole('button', { name: 'Guardar' }).click()
await dm.waitForSelector('.roster-card .badge', { timeout: 10_000 })
await shot('prep-2-guardado')

// It came back from the vault, not from the draft that was just cleared.
await dm.getByRole('button', { name: 'Mesa', exact: true }).click()
await openPrep()
const saved = await dm.locator('.roster-card').first().locator('.hp-input').inputValue()
console.log(`  roster read back: ${saved}`)
if (saved !== '3') {
  console.log('  FAIL — the roster did not survive a reload of the campaign')
  process.exitCode = 1
}

// Now put a scene on the table and come back: the screen must lock.
await dm.getByRole('button', { name: 'Mesa', exact: true }).click()
await dm.locator('.mesa-bar').getByRole('button', { name: 'Escena' }).click()
await dm.getByRole('button', { name: 'The Curdy Sewers' }).click()
await dm.waitForTimeout(400)
await openPrep()
await shot('prep-3-bloqueado')

const banner = await dm.locator('.banner').count()
const disabled = await dm.locator('.roster-card select[disabled]').count()
console.log(`  locked while a run is live: banner=${banner > 0} disabled selects=${disabled}`)
if (banner === 0 || disabled === 0) {
  console.log('  FAIL — Preparación stayed editable with a scene on the table')
  process.exitCode = 1
}

await finish()
