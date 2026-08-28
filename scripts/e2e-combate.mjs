/**
 * Who is on the board, and who is in the fight.
 *
 * Two statements the app used to make on the DM's behalf: «Colocar fichas»
 * placed everyone at once with no way to take one off, and «Iniciar combate»
 * swept the whole table in and rolled d20 for the PNJ. This drives the two
 * that replaced them — an add modal with a remove beside every row, and a
 * setup sheet where the initiative boxes start empty and stay empty until
 * somebody types in them.
 */
import { open } from './_browser.mjs'

const { dm, shot, finish } = await open()
await dm.waitForSelector('.mesa-bar')
await dm.locator('.mesa-bar').getByRole('button', { name: 'Tablero', exact: true }).click()

const tokens = () => dm.locator('.board .token').count()
const rows = () => dm.locator('.rail-body .irow').count()
const fail = (msg) => {
  console.log(`  FAIL — ${msg}`)
  process.exitCode = 1
}

console.log('añadir al tablero:')
await dm.locator('.rail-foot').getByRole('button', { name: /Añadir/ }).click()
await dm.waitForSelector('.add-list')
await dm.locator('.add-row', { hasText: 'Pip Nosewick' }).getByRole('button', { name: 'Añadir' }).click()
const rat = dm.locator('.add-row', { hasText: 'Sewer Cheese-Rat' })
await rat.locator('.hp-input').fill('2')
await rat.getByRole('button', { name: 'Añadir' }).click()
await dm.waitForTimeout(400)
await shot('combate-1-anadir')
await dm.getByRole('button', { name: 'Listo' }).click()
await dm.waitForTimeout(400)

// A PNJ summoned from the campaign lands in the session *and* on the board.
console.log(`  on the rail: ${await rows()} · on the board: ${await tokens()}`)
if ((await tokens()) !== 3) fail('the party member and both rats should be on the board')

console.log('quitar del tablero:')
await dm.locator('.irow', { hasText: 'Sewer Cheese-Rat' }).last().getByTitle('Quitar del tablero').click()
await dm.waitForTimeout(400)
if ((await tokens()) !== 2) fail('the token did not come off')
if ((await rows()) !== 3) fail('taking a token off must not remove the combatant')

console.log('iniciar combate:')
await dm.locator('.rail-head').getByRole('button', { name: 'Iniciar combate' }).click()
await dm.waitForSelector('.setup-list')

// The board seeds the checkboxes; the one taken off is listed, unticked.
const checked = await dm.locator('.setup-row input[type=checkbox]:checked').count()
const total = await dm.locator('.setup-row').count()
console.log(`  checked by default: ${checked} of ${total}`)
if (checked !== 2 || total !== 3) fail('the board should seed the fight, and nobody else')

// And nothing has been rolled.
const prefilled = await dm.locator('.setup-row .hp-input').evaluateAll((n) =>
  n.map((e) => e.value).filter(Boolean),
)
console.log(`  initiatives prefilled: ${prefilled.length}`)
if (prefilled.length > 0) fail(`something rolled on the DM's behalf: ${prefilled.join(', ')}`)
await shot('combate-2-preparar')

// Type them, Enter walking down the ticked rows, then bring the hidden rat in.
await dm.locator('.setup-row.in .hp-input').first().click()
await dm.keyboard.type('18')
await dm.keyboard.press('Enter')
await dm.keyboard.type('7')
const off = dm.locator('.setup-row').last()
await off.locator('input[type=checkbox]').check()
await off.locator('.hp-input').fill('12')
await dm.waitForTimeout(200)
await dm.getByRole('button', { name: 'Empezar' }).click()
await dm.waitForTimeout(500)

const order = await dm.locator('.rail-body .irow').evaluateAll((list) =>
  list.map((r) => Number(r.querySelector('.irow-init')?.value)),
)
console.log(`  turn order: ${order.join(' → ')}`)
if (order.join() !== '18,12,7') fail('the order is not what was typed')
await shot('combate-3-en-marcha')

await finish()
