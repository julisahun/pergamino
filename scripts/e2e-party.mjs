/**
 * Drives the Party screen: giving items and the detail sheet.
 *
 * The example campaign has one PC and one object, and the object has no
 * charges, so the consumable path (five uses, then the glass cracks) is not
 * exercised here — `reducer.test.ts` covers it against the real vault instead.
 */
import { open } from './_browser.mjs'

const { dm, shot, finish } = await open({ height: 1100 })
await dm.getByRole('button', { name: 'Party', exact: true }).click()
await dm.waitForSelector('.pc-card')

console.log('party:')
await shot('party-1-inicial')

const card = dm.locator('.pc-card').first()
await card.getByRole('button', { name: /Dar objeto/ }).click()
await dm.getByRole('button', { name: 'Farol Enmohecido' }).click()
await dm.waitForTimeout(300)
await shot('party-2-entregado')

// Its full text opens on demand rather than sitting expanded.
await card.locator('.carry-row', { hasText: 'Farol' }).getByRole('button', { name: 'ⓘ' }).click()
await dm.waitForSelector('.sheet')
await shot('party-3-detalle')
await dm.getByRole('button', { name: 'Cerrar' }).click()

/*
 * The card carries the live session and one strip of ability modifiers; every
 * derived number is in the ficha behind the ⓘ. It used to carry all of them,
 * which is what made it unreadable.
 */
// The demo PC has no `-fc5.xml`, so there are no scores to strip — which is
// itself the right answer, and why this asks for six only when there is a
// sheet behind them.
const mods = await card.locator('.mod-strip .mod').count()
console.log(`  ability modifiers on the card: ${mods}${mods ? '' : ' (no sheet in the fixture)'}`)
if (mods !== 0 && mods !== 6) {
  console.log('  FAIL — the strip is the six modifiers or nothing')
  process.exitCode = 1
}
if (await card.locator('.rolls').count()) {
  console.log('  FAIL — tiradas belong in the ficha, not on the card')
  process.exitCode = 1
}

await card.locator('.pc-head').getByRole('button', { name: 'ⓘ' }).click()
await dm.waitForSelector('.sheet .skill-grid')
const skills = await dm.locator('.sheet .skill').count()
console.log(`  skills in the ficha: ${skills}`)
if (skills !== 18) {
  console.log('  FAIL — the ficha lists all eighteen skills')
  process.exitCode = 1
}
await shot('party-5-ficha')
await dm.getByRole('button', { name: 'Cerrar' }).click()

// The rests, which are what the party screen is for between fights.
await dm.getByRole('button', { name: 'Descanso corto' }).click()
await dm.waitForTimeout(200)
await dm.getByRole('button', { name: 'Descanso largo' }).click()
await dm.getByRole('button', { name: /Confirmar|Descanso largo/ }).last().click()
await dm.waitForTimeout(300)
await shot('party-4-descanso')

await finish()
