/**
 * Drives the two catalogue screens: PNJ and Objetos.
 *
 * These are the read views of the prep folders — every `pnj/*.md` with its
 * statblock, and every `objects/*.md` including the ones nobody is carrying.
 * The only thing either of them writes is the *session*: adding a PNJ to the
 * mesa, and handing an object to someone.
 */
import { open } from './_browser.mjs'

const { dm, shot, finish, problems } = await open({ height: 1100 })

console.log('pnj:')
await dm.getByRole('button', { name: 'PNJ', exact: true }).first().click()
await dm.waitForSelector('.catalogo')

// Every PNJ in the campaign is listed, grouped by its `tag`, without anyone
// having to be seated on the board first.
const listed = await dm.locator('.catalogo .note-list button').count()
console.log(`  ${listed} PNJ listed`)
if (listed !== 5) console.log('  FAIL — the example campaign has five PNJ')

await dm.getByRole('button', { name: /Gerald the Mole/ }).click()
await dm.waitForTimeout(200)
const sub = await dm.locator('.catalogo .detail .sub').innerText()
console.log(`  statblock: ${sub}`)
if (!sub.includes('CA 14') || !sub.includes('PG 52')) {
  console.log('  FAIL — the stat line is not the one in the front matter')
}
await shot('catalogo-1-pnj')

// Search narrows the list; the traits are searched too.
await dm.locator('.catalogo input.note-search').fill('rata')
await dm.waitForTimeout(200)
await dm.locator('.catalogo input.note-search').fill('cultist')
await dm.waitForTimeout(200)
console.log(`  search "cultist": ${await dm.locator('.catalogo .note-list button').count()}`)
await dm.locator('.catalogo input.note-search').fill('')

// Adding to the session is the one action here, and it lands on the rail.
await dm.getByRole('button', { name: /Sewer Cheese-Rat/ }).click()
await dm.locator('.catalogo .detail .hp-input').fill('3')
await dm.getByRole('button', { name: 'Añadir', exact: true }).click()
await dm.waitForTimeout(300)
await shot('catalogo-2-anadido')

await dm.getByRole('button', { name: 'Mesa', exact: true }).first().click()
await dm.waitForTimeout(400)
const rats = await dm.locator('.irow-name', { hasText: 'Sewer Cheese-Rat' }).count()
console.log(`  seated on the rail: ${rats}`)
if (rats !== 3) console.log('  FAIL — three copies were asked for')

console.log('objetos:')
await dm.getByRole('button', { name: 'Objetos', exact: true }).first().click()
await dm.waitForSelector('.obj-grid')
const tiles = await dm.locator('.obj-tile').count()
console.log(`  ${tiles} object(s) listed`)

// The tile carries the holder; everything else is behind the click.
const tile = dm.locator('.obj-tile').first()
console.log(`  holder: ${await tile.locator('.holder').innerText()}`)
await shot('catalogo-3-objetos')

// The sheet is where it changes hands, and it redraws in place.
await tile.click()
await dm.waitForSelector('.sheet')
await dm.locator('.sheet-actions select').selectOption({ index: 1 })
await dm.waitForTimeout(300)
const inSheet = await dm.locator('.sheet .sub').innerText()
console.log(`  after giving: ${inSheet}`)
if (!inSheet.startsWith('Lleva:')) console.log('  FAIL — the sheet did not pick up the new holder')
await shot('catalogo-4-entregado')
await dm.locator('.sheet').getByRole('button', { name: 'Cerrar' }).click()

const onTile = await tile.locator('.holder').innerText()
if (!onTile.startsWith('Lleva:')) console.log('  FAIL — the tile did not pick up the new holder')

// An object someone holds drops out of the "sólo sin repartir" filter — which
// is the affordance the Party header used to carry.
await dm.getByRole('button', { name: 'Sólo sin repartir' }).click()
await dm.waitForTimeout(200)
console.log(`  unassigned: ${await dm.locator('.obj-tile').count()}`)

// Put it back, so a re-run starts where this one did.
await dm.getByRole('button', { name: 'Sólo sin repartir' }).click()
await dm.waitForTimeout(150)
await tile.click()
await dm.waitForSelector('.sheet')
await dm.locator('.sheet-actions').getByRole('button', { name: 'Quitar' }).click()
await dm.waitForTimeout(300)
await dm.locator('.sheet').getByRole('button', { name: 'Cerrar' }).click()
await dm.waitForTimeout(150)

await finish()
if (problems.length > 0) process.exitCode = 1
