/**
 * The action list, and the hit points beside it.
 *
 * The console used to resolve one of these against a target and apply the
 * result. It no longer does — judging a saving throw needed a save bonus no
 * pnj note had a field for, so the app compared a bare d20 against the DC and
 * every creature saved at +0 — and what is left is what it can honestly do:
 * read the numbers out of the note and put them under the row whose turn it
 * is. The hit points move from the ∓ on that row, by the DM.
 *
 * So this driver checks three things: the list is there with its numbers, it
 * is *only* a list (no dice fields, no Aplicar, no armed board), and the
 * manual path still works.
 *
 * The demo campaign is in English (`+4 to hit, 1d4+2 piercing damage`) and the
 * DM's own is in Spanish; the parser reads both, and this drives the English
 * one because that is what the fixture ships.
 */
import { open } from './_browser.mjs'

const { dm, shot, finish } = await open()
const fail = (msg) => {
  console.log(`  FAIL — ${msg}`)
  process.exitCode = 1
}

await dm.waitForSelector('.mesa-bar')
await dm.locator('.mesa-bar').getByRole('button', { name: 'Tablero', exact: true }).click()

// Two rats and a party member on the table.
await dm.locator('.rail-foot').getByRole('button', { name: /Añadir/ }).click()
await dm.waitForSelector('.add-list')
await dm.locator('.add-row', { hasText: 'Pip Nosewick' }).getByRole('button', { name: 'Añadir' }).click()
const rat = dm.locator('.add-row', { hasText: 'Sewer Cheese-Rat' })
await rat.locator('.hp-input').fill('2')
await rat.getByRole('button', { name: 'Añadir' }).click()
await dm.getByRole('button', { name: 'Listo' }).click()
await dm.waitForTimeout(400)

// Into a fight, with the rat going first so its turn is the one open.
await dm.locator('.rail-head').getByRole('button', { name: 'Iniciar combate' }).click()
await dm.waitForSelector('.setup-list')
for (const [i, value] of ['18', '12', '4'].entries()) {
  const row = dm.locator('.setup-row').nth(i)
  if ((await row.count()) === 0) break
  await row.locator('.hp-input').fill(value)
}
await dm.getByRole('button', { name: 'Empezar' }).click()
await dm.waitForTimeout(300)

// Walk the turn round to a rat. Pip is a fixture character with no `-fc5.xml`
// beside the note, so the app knows no numbers for them at all — the bar says
// so rather than showing an empty box, and that is worth seeing on the way.
const activeName = () => dm.locator('.irow.active .irow-name').innerText()
for (let i = 0; i < 4; i++) {
  await dm.locator('.rail-head').getByRole('button', { name: /Siguiente/ }).click()
  await dm.waitForTimeout(350)
  const who = await activeName()
  const empty = await dm.locator('.act-bar.empty').count()
  console.log(`  turno de ${who}${empty ? ' — sin acciones con números' : ''}`)
  if (/Rat/.test(who)) break
}

console.log('la lista sale en la fila de quien va:')
const bars = await dm.locator('.act-bar').count()
console.log(`  listas en la barra: ${bars}`)
if (bars !== 1) fail('exactly one row — whoever is up — should carry the action list')

const items = await dm.locator('.act-item').allInnerTexts()
for (const line of items) console.log(`  ${line.replace(/\n/g, ' — ')}`)
if (items.length === 0) fail('the rat states an attack in its note and should list it')
// `+4 to hit, 1d4+2 piercing damage` — the bonus and the dice, both read.
if (!items.some((t) => /\+4/.test(t) && /1d4\+2/.test(t))) {
  fail(`the line should quote the bonus and the dice: ${items}`)
}
await shot('acciones-1-lista')

console.log('y es sólo una lista:')
for (const [what, sel] of [
  ['campos de dado', '.act-bar input'],
  ['botones', '.act-bar button'],
  ['tablero armado', '.board.tool-target'],
]) {
  const n = await dm.locator(sel).count()
  console.log(`  ${what}: ${n}`)
  if (n !== 0) fail(`the list should carry no ${what}`)
}
if ((await dm.getByRole('button', { name: 'Aplicar' }).count()) !== 0) {
  fail('there is no Aplicar any more')
}
// Clicking a token drags it, as the toolbar says — it does not aim anything.
if ((await dm.locator('.board .token.targeted').count()) !== 0) {
  fail('nothing is targetable on the board')
}

console.log('los PG se mueven con el ∓ de la fila, que es el camino que queda:')
const victim = dm.locator('.irow', { hasText: 'Sewer Cheese-Rat' }).last()
// The row reads `3/5`, so it is the first number that is the hit points.
const hpOf = async () => Number((await victim.locator('.irow-hp').innerText()).split('/')[0])
const before = await hpOf()
await victim.locator('.irow-amount').fill('2')
await victim.locator('.irow-bottom button', { hasText: '−' }).first().click()
await dm.waitForTimeout(500)
const after = await hpOf()
console.log(`  PG: ${before} → ${after}`)
if (after !== before - 2) fail(`the ∓ should take two off: ${before} → ${after}`)
await shot('acciones-2-pg-a-mano')

console.log('la ficha trae sus seis y sus salvaciones:')
await victim.click()
await dm.waitForTimeout(300)
const stats = await dm.locator('.detail .stat').allInnerTexts()
console.log(`  ${stats.map((s) => s.replace(/\n/g, ' ')).join(' · ') || '(ninguna)'}`)
if (stats.length !== 6) fail(`the rat states its six scores and they should all show: ${stats.length}`)
const saves = await dm.locator('.detail .rolls .roll').allInnerTexts()
console.log(`  salvaciones: ${saves.map((s) => s.replace(/\n/g, ' ')).join(' · ')}`)
// `dex: 15` with no save quoted — the ability modifier, +2, and nothing else.
if (!saves.some((s) => /DES/.test(s) && /\+2/.test(s))) {
  fail(`DES 15 with no stated save should read +2: ${saves}`)
}
// The rat's note quotes no save, so none of the six is marked as its own —
// Gerald, who does quote one, is the other half of that and is unit-tested.
const stated = await dm.locator('.detail .roll.stated').count()
if (stated !== 0) fail(`a note that quotes no save should mark none stated: ${stated}`)
await shot('acciones-3-ficha')

console.log('la bitácora cuenta el golpe a mano:')
await dm.locator('.topbar').getByRole('button', { name: '⋯' }).click()
await dm.getByRole('button', { name: 'Cerrar sesión' }).click()
await dm.waitForTimeout(1500)
const entries = await dm.locator('.log-entry').allInnerTexts()
const hits = entries.filter((e) => /2 PG|daño/i.test(e)).slice(0, 2)
for (const line of hits) console.log(`  ${line.replace(/\n/g, ' ')}`)
if (hits.length === 0) fail('the damage should be in the bitácora')
await shot('acciones-4-bitacora')

await finish()
