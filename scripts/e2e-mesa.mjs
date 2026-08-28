/**
 * Drives the Mesa screen and the table window beside it.
 *
 * This is the script that exercises the transport: everything the players see
 * arrives over the `BroadcastChannel`, and the art arrives as blobs the table
 * window asked for by key. It also checks the thing that makes the deployment
 * shareable — the table window makes **no network request for campaign
 * content**, because it has no folder and no route to one.
 */
import { open } from './_browser.mjs'

const { dm, table, shot, finish } = await open({ table: true })
await dm.waitForSelector('.mesa-bar')

const bar = (name) => dm.locator('.mesa-bar').getByRole('button', { name, exact: true })
/** The scene picker lives in the bar now — the stage is the television. */
const escenas = () => dm.locator('.mesa-bar').getByRole('button', { name: /^Escenas/ })

// Everything the table window fetches over the wire, for the check at the end.
const requests = []
table.on('request', (r) => requests.push(r.url()))

console.log('escena:')
await bar('Escena').click()
await escenas().click()
await dm.getByRole('button', { name: 'The Curdy Sewers' }).click()
await dm.waitForTimeout(600)
await shot('mesa-1-sewers')

// The art crossed the channel as a blob and is on screen in the other window.
const artSrc = await table.evaluate(
  () => document.querySelector('.scene-layer img[style*="opacity: 1"]')?.getAttribute('src') ?? null,
)
console.log(`  table shows: ${artSrc?.slice(0, 40)}`)
if (!artSrc?.startsWith('blob:')) {
  console.log('  FAIL — the table window did not receive the scene art as a blob')
  process.exitCode = 1
}

await escenas().click()
await dm.getByRole('button', { name: "Gerald's Burrow" }).click()
await dm.waitForTimeout(600)
await shot('mesa-2-burrow')

console.log('documentos:')
await dm.getByRole('button', { name: /Documentos/ }).click()
await dm.getByRole('button', { name: 'cheese-square.jpg' }).click()
await dm.waitForTimeout(500)
await shot('mesa-3-documento')
await dm.getByRole('button', { name: /Documentos/ }).click()
await dm.getByRole('button', { name: 'Quitar documento' }).click()

// Freezing has its own script; just prove the toggle is here.
await bar('● Mesa en directo').click()
await shot('mesa-4-congelada')
await bar('⏸ Mesa congelada').click()

console.log('tablero:')
// A rat on the board, so there is something to move. Adding is a modal now;
// `e2e-combate.mjs` is what actually exercises it.
await dm.locator('.rail-foot').getByRole('button', { name: /Añadir/ }).click()
await dm.waitForSelector('.add-list')
await dm.locator('.add-row', { hasText: 'Sewer Cheese-Rat' }).getByRole('button', { name: 'Añadir' }).click()
await dm.getByRole('button', { name: 'Listo' }).click()
await bar('Tablero').click()
await dm.locator('.mesa-bar').getByRole('button', { name: 'Tablero' }).last().click()
await dm.getByRole('button', { name: 'Colocar fichas' }).click()
await dm.keyboard.press('Escape')
await dm.waitForSelector('.board .token')
await dm.waitForTimeout(400)
await shot('mesa-5-tablero')

// Drag a token.
const token = dm.locator('.board .token').first()
const from = await token.boundingBox()
const board = await dm.locator('.board').boundingBox()
await dm.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
await dm.mouse.down()
await dm.mouse.move(board.x + board.width * 0.55, board.y + board.height * 0.45, { steps: 12 })
await dm.mouse.up()
await dm.waitForTimeout(400)
await shot('mesa-6-movido')

// The property that makes public hosting safe, asserted from the outside.
const campaignish = requests.filter(
  (u) => !u.startsWith('blob:') && !u.startsWith('data:') && /\/(vault|api)\//.test(u),
)
console.log(`  table window requests for campaign content: ${campaignish.length}`)
if (campaignish.length > 0) {
  console.log('  FAIL — the table window went to the network for campaign content:')
  for (const u of campaignish) console.log(`    ${u}`)
  process.exitCode = 1
}

await finish()
