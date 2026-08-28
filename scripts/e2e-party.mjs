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

// The rests, which are what the party screen is for between fights.
await dm.getByRole('button', { name: 'Descanso corto' }).click()
await dm.waitForTimeout(200)
await dm.getByRole('button', { name: 'Descanso largo' }).click()
await dm.getByRole('button', { name: /Confirmar|Descanso largo/ }).last().click()
await dm.waitForTimeout(300)
await shot('party-4-descanso')

await finish()
