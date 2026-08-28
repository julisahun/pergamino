/** One screenshot per screen, for a quick look at the whole console. */
import path from 'node:path'
import { open, OUT } from './_browser.mjs'

const { dm, finish } = await open()
await dm.waitForSelector('.mesa-bar')
// Start from a known mode rather than whatever the last run left behind.
await dm.getByRole('button', { name: 'Escena', exact: true }).first().click()

const shot = async (name) => {
  await dm.waitForTimeout(800)
  await dm.screenshot({ path: path.join(OUT, `tour-${name}.png`) })
  console.log(`  ✓ ${name}`)
}

await shot('mesa-escena')
await dm.getByRole('button', { name: 'Tablero', exact: true }).first().click()
await shot('mesa-tablero')

for (const [tab, name] of [
  ['Party', 'party'],
  ['PNJ', 'pnj'],
  ['Objetos', 'objetos'],
  ['Notas', 'notas'],
]) {
  await dm.getByRole('button', { name: tab, exact: true }).first().click()
  await shot(name)
}

await dm.getByRole('button', { name: '⋯' }).click()
await dm.waitForTimeout(250)
await dm.screenshot({ path: path.join(OUT, 'tour-menu.png') })
console.log('  ✓ menu')
await dm.getByRole('button', { name: 'Cerrar sesión' }).click()
await shot('sesion')

await finish()
