/**
 * Resolving an action: pick, aim on the board, roll, look, apply.
 *
 * The point of the screen is that *nothing happens until Aplicar*. Every
 * number stays editable until then, the verdict the console offers is only a
 * suggestion, and a miss goes in the bitácora even though it moves no hit
 * points — read back after the session, a fight is mostly people not
 * connecting.
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
// so rather than offering an empty menu, and that is worth seeing on the way.
const activeName = () => dm.locator('.irow.active .irow-name').innerText()
for (let i = 0; i < 4; i++) {
  await dm.locator('.rail-head').getByRole('button', { name: /Siguiente/ }).click()
  await dm.waitForTimeout(350)
  const who = await activeName()
  const empty = await dm.locator('.act-bar.empty').count()
  console.log(`  turno de ${who}${empty ? ' — sin acciones con números' : ''}`)
  if (/Rat/.test(who)) break
}

const bar = dm.locator('.act-bar')
console.log('la barra sale en la fila de quien va:')
const bars = await bar.count()
console.log(`  barras en la lista: ${bars}`)
if (bars !== 1) fail('exactly one row — whoever is up — should carry the action bar')

const picks = await dm.locator('.act-pick').allTextContents()
console.log(`  acciones: ${picks.join(' · ') || '(ninguna)'}`)
if (picks.length === 0) fail('the rat states an attack in its note and should offer it')
await shot('acciones-1-elegir')

console.log('elegir la acción arma el tablero:')
await dm.locator('.act-pick').first().click()
await dm.waitForTimeout(200)
const armed = await dm.locator('.board.tool-target').count()
console.log(`  tablero en modo objetivo: ${armed === 1}`)
if (armed !== 1) fail('opening an action should put the board into targeting mode')

console.log('clic en una ficha la mete en la acción:')
const pip = dm.locator('.board .token.pc').first()
// The rat that is *not* swinging — whoever is up is drawn `.active`.
const otherRat = dm.locator('.board .token.npc:not(.active)').first()

await pip.click()
await dm.waitForTimeout(150)
console.log(`  una: ${await dm.locator('.act-target').count()}`)
// A second click takes it back out: the same gesture both ways, so nothing
// has to be undone from the rail.
await pip.click()
await dm.waitForTimeout(150)
console.log(`  y un segundo clic la quita: ${(await dm.locator('.act-target').count()) === 0}`)
if ((await dm.locator('.act-target').count()) !== 0) fail('clicking again should untarget')

// Two of them, which is the whole reason the picking happens on the board:
// one damage roll, several people caught in it. Order is click order.
await otherRat.click()
await pip.click()
await dm.waitForTimeout(200)
const ringed = await dm.locator('.board .token.targeted').count()
const targets = await dm.locator('.act-target').count()
console.log(`  con anillo: ${ringed} · filas de objetivo: ${targets}`)
if (ringed !== 2 || targets !== 2) fail('clicking two tokens should ring and list both')

const victim = dm.locator('.irow', { hasText: 'Sewer Cheese-Rat' }).last()
console.log('nada se ha aplicado todavía:')
const hpBefore = await victim.locator('.irow-hp').innerText()
console.log(`  PG de la otra rata: ${hpBefore}`)

// The d20s are typed and the damage is rolled — which is the whole point of
// the die sitting beside the field rather than replacing it.
const rolls = dm.locator('.act-target .act-roll input')
await rolls.nth(0).fill('2') // the rat, CA 11 — a 2 and a +4 is a 6
await rolls.nth(1).fill('17') // Pip, whose fixture states no CA at all
await dm.locator('.act-row .act-roll button').click()
await dm.waitForTimeout(200)
const damage = await dm.locator('.act-row .act-roll input').inputValue()
const verdicts = await dm.locator('.act-verdict').allInnerTexts()
console.log(`  daño tirado: ${damage}`)
for (const v of verdicts) console.log(`    ${v}`)
if (!damage) fail('the die button should fill the damage field')
// The rat states an AC, so that one gets a real verdict; Pip's sheet is a
// fixture with no `-fc5.xml`, so the console says it is not its call.
if (!verdicts.some((v) => /Falla/.test(v))) fail(`a 2 against CA 11 should miss: ${verdicts}`)
await shot('acciones-2-resolver')

const stillUntouched = await victim.locator('.irow-hp').innerText()
if (stillUntouched !== hpBefore) fail('hit points moved before Aplicar was clicked')
console.log(`  sin tocar antes de Aplicar: ${stillUntouched === hpBefore}`)

console.log('aplicar:')
await dm.getByRole('button', { name: 'Aplicar' }).click()
await dm.waitForTimeout(500)
const hpAfter = await victim.locator('.irow-hp').innerText()
console.log(`  PG de la otra rata: ${hpBefore} → ${hpAfter}`)
if (hpAfter !== hpBefore) fail('the one that was missed should be untouched')

// And the bar closes itself, giving the board back.
const stillArmed = await dm.locator('.board.tool-target').count()
if (stillArmed !== 0) fail('applying should disarm the board')
console.log(`  tablero devuelto: ${stillArmed === 0}`)
await shot('acciones-3-aplicado')

console.log('la bitácora lo cuenta, fallos incluidos:')
await dm.locator('.topbar').getByRole('button', { name: '⋯' }).click()
await dm.getByRole('button', { name: 'Cerrar sesión' }).click()
await dm.waitForTimeout(1500)
const entries = await dm.locator('.log-entry').allInnerTexts()
const swings = entries.filter((e) => /ataque/i.test(e)).slice(0, 2)
for (const line of swings) console.log(`  ${line.replace(/\n/g, ' ')}`)
if (swings.length !== 2) {
  fail(`both the hit and the miss should be in the bitácora, got ${swings.length}`)
}
if (!swings.some((s) => /[Ff]alla/.test(s))) fail('the miss left no trace')
await shot('acciones-4-bitacora')

await finish()
