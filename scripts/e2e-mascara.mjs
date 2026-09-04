/**
 * La máscara: un PNJ con `alias` en su nota se llama de una manera en la
 * consola y de otra en la pantalla de mesa.
 *
 * Gerald es el caso de la campaña de demostración — «his name, once anyone
 * thinks to ask, is Gerald» — así que hasta que alguien pregunte, la mesa ve
 * un topo gigante y nada más. El botón `A` de su fila en el raíl es lo que
 * destapa el nombre, y vuelve a taparlo.
 */
import { open } from './_browser.mjs'

const { dm, table, shot, finish } = await open({ table: true })
await dm.waitForSelector('.mesa-bar')

const fail = (msg) => {
  console.log(`  FAIL — ${msg}`)
  process.exitCode = 1
}
const tvNames = () => table.locator('.hud-name').allTextContents()
const row = () => dm.locator('.irow', { hasText: 'Gerald the Mole' })

console.log('añadir a Gerald:')
await dm.locator('.rail-foot').getByRole('button', { name: /Añadir/ }).click()
await dm.waitForSelector('.add-list')
await dm.locator('.add-row', { hasText: 'Gerald the Mole' }).getByRole('button', { name: 'Añadir' }).click()
await dm.getByRole('button', { name: 'Listo' }).click()
await dm.waitForTimeout(400)

// La consola lo llama por su nombre; para eso está.
if ((await row().count()) !== 1) fail('the rail should call him Gerald the Mole')

console.log('revelarlo a la mesa:')
await row().getByTitle('Oculto').click()
await dm.waitForTimeout(500)
console.log(`  la mesa ve: ${(await tvNames()).join(' · ')}`)
if (!(await tvNames()).includes('Giant Mole')) fail('the TV should say Giant Mole')
if ((await tvNames()).some((n) => n.includes('Gerald'))) fail('the TV must not say Gerald')
if (!(await table.content()).includes('Giant Mole')) fail('the mask should be in the payload')
if ((await table.content()).includes('Gerald')) fail('Gerald must not reach the table window at all')
await shot('mascara-1-tapado')

console.log('la ficha avisa de lo que ve la mesa:')
await row().click()
await dm.waitForSelector('.detail')
const sub = await dm.locator('.detail .mask-line').textContent()
console.log(`  ${sub}`)
if (!sub?.includes('La mesa ve: Giant Mole')) fail('the ficha should say what the players read')
await shot('mascara-2-ficha')
await dm.locator('.rail-head').getByRole('button', { name: /Volver/ }).click()
await dm.waitForTimeout(200)

console.log('destapar el nombre:')
await row().getByTitle(/Revelar el nombre/).click()
await dm.waitForTimeout(500)
console.log(`  la mesa ve: ${(await tvNames()).join(' · ')}`)
if (!(await tvNames()).includes('Gerald the Mole')) fail('lifting the mask should name him')
await shot('mascara-3-destapado')

console.log('volver a taparlo:')
await row().getByTitle(/Volver a taparle/).click()
await dm.waitForTimeout(500)
if ((await tvNames()).some((n) => n.includes('Gerald'))) fail('the mask should go back on')

await finish()
