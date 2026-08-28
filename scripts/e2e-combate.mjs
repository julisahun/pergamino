/**
 * Who is at the table, and who is in the fight.
 *
 * Being in the rail, having a ficha and being in the session are one fact:
 * `+ Añadir` brings somebody in, the `⊗` beside their face takes them out of
 * all three, and hiding one from the players is the reveal toggle instead.
 * On top of that, «Iniciar combate» used to sweep the table in and roll d20
 * for the PNJ; it asks now, and the boxes stay empty until somebody types.
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

console.log('añadir a la mesa:')
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

// A PNJ summoned from the campaign lands in the session *and* on the table.
console.log(`  on the rail: ${await rows()} · fichas: ${await tokens()}`)
if ((await rows()) !== 3 || (await tokens()) !== 3) {
  fail('the party member and both rats should be in the rail and on the board')
}

console.log('quitar de la mesa:')
await dm.locator('.irow', { hasText: 'Sewer Cheese-Rat' }).last().getByTitle('Quitar de la mesa').click()
await dm.waitForTimeout(400)
console.log(`  on the rail: ${await rows()} · fichas: ${await tokens()}`)
if ((await rows()) !== 2 || (await tokens()) !== 2) {
  fail('removing must take them out of the rail and off the board at once')
}

console.log('iniciar combate:')
await dm.locator('.rail-head').getByRole('button', { name: 'Iniciar combate' }).click()
await dm.waitForSelector('.setup-list')

// Everyone at the table, all ticked — you untick whoever is only watching.
const checked = await dm.locator('.setup-row input[type=checkbox]:checked').count()
const total = await dm.locator('.setup-row').count()
console.log(`  checked by default: ${checked} of ${total}`)
if (checked !== 2 || total !== 2) fail('the table should seed the fight, all of it')

// And nothing has been rolled.
const prefilled = await dm.locator('.setup-row .hp-input').evaluateAll((n) =>
  n.map((e) => e.value).filter(Boolean),
)
console.log(`  initiatives prefilled: ${prefilled.length}`)
if (prefilled.length > 0) fail(`something rolled on the DM's behalf: ${prefilled.join(', ')}`)
await shot('combate-2-preparar')

// Type them, Enter walking down the ticked rows.
await dm.locator('.setup-row.in .hp-input').first().click()
await dm.keyboard.type('7')
await dm.keyboard.press('Enter')
await dm.keyboard.type('18')
await dm.waitForTimeout(200)
await dm.getByRole('button', { name: 'Empezar' }).click()
await dm.waitForTimeout(500)

const order = await dm.locator('.rail-body .irow').evaluateAll((list) =>
  list.map((r) => Number(r.querySelector('.irow-init')?.value)),
)
console.log(`  turn order: ${order.join(' → ')}`)
if (order.join() !== '18,7') fail('the order is not what was typed')
await shot('combate-3-en-marcha')

await finish()
