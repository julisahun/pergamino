/**
 * Drives the level-up, from the console and then from a phone.
 *
 * The case that matters is the hit points: raising the maximum raises the
 * current total by the same amount. The old path — uploading a new xml —
 * capped downward and never granted upward, so a character who levelled came
 * back hurt without having been hit.
 */
import { BASE, open } from './_browser.mjs'

const { browser, dm, shot, finish, problems } = await open({ height: 1100 })

/**
 * A phone, in a context of its own.
 *
 * One per character on purpose: the page remembers who you are in
 * `localStorage`, keyed by the link, so two phones sharing a context would
 * have the second one open straight into the first one's character instead of
 * the picker.
 */
async function openPhone(link, who) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => problems.push(`[${who}] ${e.message}`))
  page.on('response', (r) => r.status() >= 400 && problems.push(`[${who}] ${r.status()} ${r.url()}`))
  await page.goto(`${BASE}/pj${new URL(link).hash}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: new RegExp(who) }).click()
  return page
}

await dm.getByRole('button', { name: 'Party', exact: true }).click()
await dm.waitForSelector('.pc-card')
// The rogue: a class the table knows, whose level 2 has no decisions in it.
const card = dm.locator('.pc-card', { hasText: 'Pip Nosewick' })

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

/*
 * The rules table knows this class at this level, so the form proposes rather
 * than asks: the next level, the hit die's average, and the feature that comes
 * with no decision attached. All of it still editable.
 */
const rows = dm.locator('.lvl-panel .lvl-row')
const proposedLevel = await rows.first().locator('input').inputValue()
const proposedHp = Number(await rows.nth(1).locator('input').inputValue())
console.log(`  propone: nivel ${proposedLevel}, PG ${proposedHp} (antes ${before.max})`)
if (proposedLevel !== '2') {
  console.log('  FAIL — el nivel propuesto es el siguiente')
  process.exitCode = 1
}
// A d8 averages 5, which is what a level-up takes instead of rolling.
if (proposedHp !== before.max + 5) {
  console.log(`  FAIL — esperaba ${before.max + 5} PG, la media de un d8`)
  process.exitCode = 1
}

const granted = await dm.locator('.lvl-granted').allInnerTexts()
console.log(`  te llevas: ${granted.map((g) => g.split('\n')[0]).join(', ') || '(nada)'}`)
if (!granted.some((g) => g.includes('Astucia'))) {
  console.log('  FAIL — un pícaro gana Astucia a nivel 2 y la tabla lo sabe')
  process.exitCode = 1
}

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
if (after.max !== before.max + 5) {
  console.log('  FAIL — el máximo no subió')
  process.exitCode = 1
}
if (after.hp !== before.hp + 5) {
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

// The feature the table granted is on the record now, not just on the form —
// and the ficha shows it, which it did not do until this flow existed.
await card.locator('.pc-head').getByRole('button', { name: 'ⓘ' }).click()
await dm.waitForSelector('.sheet .pc-traits')
const ficha = await dm.locator('.sheet').innerText()
console.log(`  Astucia en la ficha del DM: ${ficha.includes('Astucia') ? 'sí' : 'no'}`)
if (!ficha.includes('Astucia')) {
  console.log('  FAIL — un rasgo concedido tiene que verse')
  process.exitCode = 1
}
await dm.getByRole('button', { name: 'Cerrar' }).click()

/*
 * And the other half of the design: a level nobody has written. The form does
 * not disappear, it just stops proposing — which is what keeps the tool from
 * depending on any particular class or level existing in the table.
 */
await card.getByRole('button', { name: 'Subir de nivel' }).click()
await dm.waitForSelector('.lvl-panel')
await dm.locator('.lvl-panel .lvl-row').first().locator('input').fill('14')
await dm.waitForTimeout(200)
const sinTabla = await dm.locator('.lvl-manual').count()
const propone = await dm.locator('.lvl-granted').count()
console.log(`nivel sin escribir:\n  avisa de que no hay tabla: ${sinTabla ? 'sí' : 'no'} · propone rasgos: ${propone}`)
if (!sinTabla || propone !== 0) {
  console.log('  FAIL — sin tabla, el formulario avisa y no propone nada')
  process.exitCode = 1
}
// It is still a usable form: the fields are there and take a number.
await dm.locator('.lvl-panel .lvl-row').nth(1).locator('input').fill('99')
const stillWorks = await dm.getByRole('button', { name: /Subir a nivel/ }).isEnabled()
console.log(`  y se puede rellenar a mano: ${stillWorks ? 'sí' : 'no'}`)
if (!stillWorks) {
  console.log('  FAIL — sin tabla hay que poder subir a mano igual')
  process.exitCode = 1
}
await shot('nivel-6-sin-tabla')
await dm.getByRole('button', { name: 'Cancelar' }).click()

/*
 * --- a caster, which is where the decisions are -----------------------------
 *
 * A bard's level 2 is the busy one: two expertises and a spell, on top of a
 * feature that comes with no decision. It is also the only way to see the
 * spell picker, which no rogue can open.
 */
const bard = dm.locator('.pc-card', { hasText: 'Marla Curdwick' })
console.log('la barda:')
await bard.getByRole('button', { name: 'Subir de nivel' }).click()
await dm.waitForSelector('.lvl-panel')

const offered = await dm.locator('.lvl-choice .lvl-toggle').allInnerTexts()
console.log(`  te ofrece: ${offered.map((o) => o.replace(/[▸▾]\s*/, '').trim()).join(' · ')}`)
if (offered.length !== 2) {
  console.log('  FAIL — un bardo elige dos cosas a nivel 2')
  process.exitCode = 1
}

// Two expertises, out of what she is already proficient in.
await dm.getByRole('button', { name: /Experticia/ }).click()
const expertise = dm.locator('.lvl-choice', { hasText: 'Experticia' })
await expertise.locator('.lvl-skill', { hasText: 'Interpretación' }).click()
await expertise.locator('.lvl-skill', { hasText: 'Persuasión' }).click()
const interp = await expertise.locator('.lvl-skill', { hasText: 'Interpretación' }).locator('b').innerText()
console.log(`  Interpretación con experticia: ${interp}`)
if (interp !== '+7') {
  console.log('  FAIL — CAR 17 es +3 y la competencia +2 doblada son +7')
  process.exitCode = 1
}

// And a spell, from the list her class can actually take.
await dm.getByRole('button', { name: /Un conjuro más/ }).click()
const spells = dm.locator('.lvl-choice', { hasText: 'Un conjuro más' }).locator('.lvl-spell')
const count = await spells.count()
const already = await dm.locator('.lvl-spell', { hasText: 'Palabra Curativa' }).count()
console.log(`  conjuros que puede coger: ${count} · los que ya tiene aparecen: ${already ? 'sí' : 'no'}`)
if (count === 0) {
  console.log('  FAIL — el selector tiene que ofrecer algo')
  process.exitCode = 1
}
if (already !== 0) {
  console.log('  FAIL — no se ofrece lo que ya lleva')
  process.exitCode = 1
}
const picked = (await spells.first().innerText()).split('\n')[0]
await spells.first().click()
console.log(`  coge: ${picked}`)

// Opening the spell list folded the expertise one, which is where a choice
// says what was taken — in words a person reads, not the keys the record holds.
const resumen = await dm.locator('.lvl-choice', { hasText: 'Experticia' }).locator('.lvl-chosen').innerText()
console.log(`  resume las experticias como: ${resumen}`)
if (!resumen.includes('Interpretación') || !resumen.includes('Persuasión')) {
  console.log('  FAIL — se resumen con su nombre, no con la clave')
  process.exitCode = 1
}
await shot('nivel-7-barda')

await dm.getByRole('button', { name: /Subir a nivel/ }).click()
await dm.waitForTimeout(600)

// All three landed: the expertise, the spell and the feature nobody chose.
await bard.locator('.pc-head').getByRole('button', { name: 'ⓘ' }).click()
await dm.waitForSelector('.sheet .pc-traits')
const fichaBarda = await dm.locator('.sheet').innerText()
const interpFicha = await dm.locator('.sheet .skill', { hasText: 'Interpretación' }).locator('.skill-mod').innerText()
console.log(`  la ficha: Interpretación ${interpFicha} · Aprendiz de todo ${fichaBarda.includes('Aprendiz de todo') ? 'sí' : 'no'}`)
if (interpFicha !== '+7' || !fichaBarda.includes('Aprendiz de todo')) {
  console.log('  FAIL — la experticia y el rasgo tienen que estar en la ficha')
  process.exitCode = 1
}
await dm.getByRole('button', { name: 'Cerrar' }).click()

// The spell is on the record, which the phone is the screen for.
const link = await dm.locator('#party-link').inputValue()
const bardPhone = await openPhone(link, 'Marla Curdwick')
await bardPhone.getByRole('button', { name: /Conjuros/ }).click()
await bardPhone.waitForTimeout(300)
const conjuros = await bardPhone.locator('.pj-body').innerText()
console.log(`  el conjuro nuevo en el móvil: ${conjuros.includes(picked) ? 'sí' : 'no'}`)
if (!conjuros.includes(picked)) {
  console.log('  FAIL — el conjuro elegido tiene que salir en su pestaña')
  process.exitCode = 1
}
await bardPhone.screenshot({ path: '/tmp/dmshots/nivel-8-barda-movil.png' })

// --- and the same character, from a phone ---------------------------------
const phone = await openPhone(link, 'Pip Nosewick')
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
