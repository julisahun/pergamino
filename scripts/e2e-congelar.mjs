/** The DM works ahead while the table screen holds its last frame. */
import { open } from './_browser.mjs'

const { dm, table, shot, finish } = await open({ table: true })
await dm.waitForSelector('.mesa-bar')

const bar = (name) => dm.locator('.mesa-bar').getByRole('button', { name })
/** The scene picker lives in the bar now — the stage is the television. */
const escenas = () => dm.locator('.mesa-bar').getByRole('button', { name: /^Escenas/ })
const tableArt = () =>
  table.evaluate(
    () =>
      document.querySelector('.scene-layer img[style*="opacity: 1"]')?.getAttribute('src') ?? null,
  )

await dm.locator('.mesa-bar').getByRole('button', { name: 'Escena', exact: true }).click()
await escenas().click()
await dm.getByRole('button', { name: 'The Curdy Sewers' }).click()
await dm.waitForTimeout(600)
await shot('congelar-1-sewers')
const before = await tableArt()

// Freeze, then change everything.
await bar(/Mesa en directo/).click()
await escenas().click()
await dm.getByRole('button', { name: 'Cheese Square' }).click()
await dm.waitForTimeout(600)
await shot('congelar-2-trabajando')

const during = await tableArt()
console.log(`  players still on the same frame: ${during === before}`)
if (during !== before || during === null) {
  console.log('  FAIL — the table screen followed the DM while frozen')
  process.exitCode = 1
}

// Resume: the table catches up.
await dm.getByRole('button', { name: 'Volver a directo' }).click()
await dm.waitForTimeout(700)
await shot('congelar-3-directo')
const after = await tableArt()
console.log(`  table caught up: ${after !== before}`)
if (after === before || after === null) {
  console.log('  FAIL — the table screen did not catch up')
  process.exitCode = 1
}

await finish()
