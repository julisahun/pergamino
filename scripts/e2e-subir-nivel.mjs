/**
 * Drives the level-up, from the console and then from a phone.
 *
 * The case that matters is the hit points: raising the maximum raises the
 * current total by the same amount. The old path — uploading a new xml —
 * capped downward and never granted upward, so a character who levelled came
 * back hurt without having been hit.
 */
import { BASE, open } from './_browser.mjs'

const { ctx, dm, shot, finish, problems } = await open({ height: 1100 })

await dm.getByRole('button', { name: 'Party', exact: true }).click()
await dm.waitForSelector('.pc-card')
const card = dm.locator('.pc-card').first()

const hpOf = async () => {
  const text = await card.locator('.pc-head .sub').last().innerText()
  const m = /PG\s+(\d+)\/(\d+)/.exec(text)
  if (!m) throw new Error(`no PG in «${text}»`)
  return { hp: Number(m[1]), max: Number(m[2]) }
}

const before = await hpOf()
console.log(`desde la consola:\n  antes: ${before.hp}/${before.max}`)

await card.getByRole('button', { name: 'Subir de nivel' }).click()
await dm.waitForSelector('.lvl-panel')
await shot('nivel-1-dialogo')

// The level comes prefilled with the next one; the hit points are typed,
// because this app does not know what die a rogue rolls at level 2.
const rows = dm.locator('.lvl-panel .lvl-row')
console.log(`  nivel propuesto: ${await rows.first().locator('input').inputValue()}`)
await rows.nth(1).locator('input').fill(String(before.max + 7))

// A trait, written the way it will be read at the table.
await dm.getByRole('button', { name: /Añadir rasgo/ }).click()
await dm.locator('.lvl-trait input').fill('Astucia')
await dm.locator('.lvl-trait textarea').fill('Correr, Destrabarse o Esconderse como acción adicional.')

/*
 * A competence, which the form works out as it is clicked rather than asking
 * for a number: the three states cycle, and each one is the arithmetic over
 * the score and the proficiency bonus that `skillRow` does everywhere else.
 * Whatever the character starts at, three clicks come back to it.
 */
await dm.getByRole('button', { name: /Competencias/ }).click()
const sigilo = dm.locator('.lvl-skill', { hasText: 'Sigilo' })
const cycle = []
const readSigilo = async () => ({
  state: (await sigilo.getAttribute('class')).replace('lvl-skill ', ''),
  mod: Number((await sigilo.locator('b').innerText()).replace('+', '')),
})
const sigiloStart = await readSigilo()
for (let i = 0; i < 3; i++) {
  await sigilo.click()
  cycle.push(await readSigilo())
}
console.log(`  Sigilo cicla: ${sigiloStart.state} ${sigiloStart.mod} → ${cycle.map((c) => `${c.state} ${c.mod}`).join(' → ')}`)
const byState = Object.fromEntries([sigiloStart, ...cycle].map((c) => [c.state, c.mod]))
if (!(byState.none < byState.proficient && byState.proficient < byState.expertise)) {
  console.log('  FAIL — nada < competente < experticia')
  process.exitCode = 1
}
if (cycle[2].state !== sigiloStart.state || cycle[2].mod !== sigiloStart.mod) {
  console.log('  FAIL — tres clics tienen que volver al punto de partida')
  process.exitCode = 1
}
// Leave it one step on from where it was, so the patch carries a real change.
await sigilo.click()
const sigiloAfter = await sigilo.locator('b').innerText()
console.log(`  y se queda en ${sigiloAfter}`)
await shot('nivel-2-relleno')

await dm.getByRole('button', { name: /Subir a nivel/ }).click()
await dm.waitForTimeout(600)

const after = await hpOf()
console.log(`  después: ${after.hp}/${after.max}`)
if (after.max !== before.max + 7) {
  console.log('  FAIL — el máximo no subió')
  process.exitCode = 1
}
if (after.hp !== before.hp + 7) {
  console.log('  FAIL — los PG actuales tienen que subir con el máximo, no quedarse')
  process.exitCode = 1
}
await shot('nivel-3-aplicado')

// The expertise landed on the record, not just on the form that proposed it.
await card.locator('.pc-head').getByRole('button', { name: 'ⓘ' }).click()
await dm.waitForSelector('.sheet .skill-grid')
const sigiloFicha = await dm.locator('.sheet .skill', { hasText: 'Sigilo' }).locator('.skill-mod').innerText()
console.log(`  la ficha dice Sigilo ${sigiloFicha}`)
if (sigiloFicha !== sigiloAfter) {
  console.log('  FAIL — la ficha no coincide con lo que el formulario prometía')
  process.exitCode = 1
}
await dm.getByRole('button', { name: 'Cerrar' }).click()

// --- and the same character, from a phone ---------------------------------
const url = await dm.locator('#party-link').inputValue()
const hash = new URL(url).hash
const phone = await ctx.newPage()
await phone.setViewportSize({ width: 390, height: 844 })
phone.on('pageerror', (e) => problems.push(`[pj] ${e.message}`))
phone.on('response', (r) => r.status() >= 400 && problems.push(`[pj] ${r.status()} ${r.url()}`))
await phone.goto(`${BASE}/pj${hash}`, { waitUntil: 'networkidle' })
await phone.getByRole('button', { name: /Pip Nosewick/ }).first().click()
await phone.locator('.pj-hp-now').waitFor()

console.log('desde el móvil:')
const phoneBefore = Number(await phone.locator('.pj-hp-now').innerText())
console.log(`  antes: ${phoneBefore}`)

await phone.locator('.pj-icon').last().click()
await phone.getByRole('button', { name: 'Subir de nivel' }).click()
await phone.waitForSelector('.lvl-panel')
await phone.screenshot({ path: '/tmp/dmshots/nivel-4-movil.png' })

const phoneHp = phone.locator('.lvl-panel .lvl-row').nth(1).locator('input')
const was = Number(await phoneHp.inputValue())
await phoneHp.fill(String(was + 5))
await phone.getByRole('button', { name: /Subir a nivel/ }).click()
await phone.waitForTimeout(700)

const phoneAfter = Number(await phone.locator('.pj-hp-now').innerText())
console.log(`  después: ${phoneAfter}`)
if (phoneAfter !== phoneBefore + 5) {
  console.log('  FAIL — el móvil no aplicó la subida')
  process.exitCode = 1
}
// And the console, which never reloaded, agrees — the socket carried it.
const consoleSees = await hpOf()
console.log(`  la consola, sin recargar, dice ${consoleSees.hp}/${consoleSees.max}`)
if (consoleSees.max !== after.max + 5) {
  console.log('  FAIL — la subida del móvil no llegó a la consola')
  process.exitCode = 1
}
await phone.screenshot({ path: '/tmp/dmshots/nivel-5-movil-aplicado.png' })

await finish()
