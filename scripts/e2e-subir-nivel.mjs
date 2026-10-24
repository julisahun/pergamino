/**
 * Drives the level-up, from the console and then from a phone.
 *
 * The form reads level, hit points and slots off the rules table and only
 * asks for the table's choices, so what is checked here is that: nothing on
 * it can be typed, a choice cannot be skipped, the spell picker leads with
 * what the table recommends, and a level nobody has written cannot be taken.
 *
 * The hit points still matter most: raising the maximum raises the current
 * total by the same amount. The old path — uploading a new xml — capped
 * downward and never granted upward, so a character who levelled came back
 * hurt without having been hit.
 */
import { BASE, open } from './_browser.mjs'

const { browser, dm, shot, finish, problems } = await open({ height: 1100 })

const fail = (why) => {
  console.log(`  FAIL — ${why}`)
  process.exitCode = 1
}

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

const hpOf = async (card) => {
  const text = await card.locator('.pc-head .sub').last().innerText()
  const m = /PG\s+(\d+)\/(\d+)/.exec(text)
  if (!m) throw new Error(`no PG in «${text}»`)
  return { hp: Number(m[1]), max: Number(m[2]) }
}

/*
 * --- a bard, from the console: where the decisions are ----------------------
 *
 * Her level 2 is the busy one: two expertises and a spell, on top of a
 * feature that comes with no decision.
 */
const bard = dm.locator('.pc-card', { hasText: 'Marla Curdwick' })
const bardBefore = await hpOf(bard)
console.log(`la barda, desde la consola:\n  antes: ${bardBefore.hp}/${bardBefore.max}`)
await bard.getByRole('button', { name: 'Subir de nivel' }).click()
await dm.waitForSelector('.lvl-panel')
await shot('nivel-1-barda')

const panel = dm.locator('.lvl-panel')
const inputs = await panel.locator('input, textarea').count()
console.log(`  campos que se pueden escribir: ${inputs}`)
if (inputs !== 0) fail('nivel, PG y espacios se leen de la tabla, no se escriben')

const summary = await panel.locator('.lvl-summary').innerText()
console.log(`  resumen: ${summary.replace(/\s*\n\s*/g, ' ')}`)
// A d8 averages 5, which is what a level-up takes instead of rolling.
if (!summary.includes(`${bardBefore.max} → ${bardBefore.max + 5}`)) fail('PG máximos suben la media de un d8')
if (!/1\s*→\s*2/.test(summary)) fail('de nivel 1 a 2')

const offered = await panel.locator('.lvl-choice-head').allInnerTexts()
console.log(`  te ofrece: ${offered.join(' · ')}`)
if (offered.length !== 2) fail('un bardo elige dos cosas a nivel 2')

const apply = dm.getByRole('button', { name: /Subir a nivel/ })
if (await apply.isEnabled()) fail('sin elegir no se puede subir')

// Two expertises — and only what she is already proficient in is on offer.
const expertise = panel.locator('.lvl-choice', { hasText: 'Experticia' })
const skills = await expertise.locator('.lvl-skill-name').allInnerTexts()
console.log(`  experticia, entre: ${skills.join(', ')}`)
if (skills.includes('Sigilo')) fail('experticia sólo donde ya es competente')
await expertise.locator('.lvl-skill', { hasText: 'Interpretación' }).click()
await expertise.locator('.lvl-skill', { hasText: 'Persuasión' }).click()
const interp = await expertise.locator('.lvl-skill', { hasText: 'Interpretación' }).locator('b').innerText()
console.log(`  Interpretación con experticia: ${interp}`)
if (interp !== '+7') fail('CAR 17 es +3 y la competencia +2 doblada son +7')
if (await apply.isEnabled()) fail('con un conjuro por elegir todavía no se puede subir')

// The spell: the table's recommendations first, the rest behind a tap.
const spellChoice = panel.locator('.lvl-choice', { hasText: 'Un conjuro más' })
const visible = await spellChoice.locator('.lvl-spell b').allInnerTexts()
console.log(`  recomendados: ${visible.join(', ')}`)
if (visible.length === 0) fail('el selector tiene que recomendar algo')
if (visible.includes('Palabra Curativa')) fail('no se recomienda lo que ya lleva')
await spellChoice.getByRole('button', { name: /Ver todos/ }).click()
const all = await spellChoice.locator('.lvl-spell').count()
console.log(`  con «ver todos»: ${all}`)
if (all <= visible.length) fail('«ver todos» enseña más que los recomendados')
// Bard cantrips she does not know yet — a level-1 pick must not offer them.
const cantrips = await spellChoice.locator('.lvl-spell', { hasText: /Mano de Mago|Prestidigitación/ }).count()
if (cantrips !== 0) fail('a nivel 2 no se ofrecen trucos')
await spellChoice.getByRole('button', { name: /Ocultar/ }).click()
const picked = visible[0]
await spellChoice.locator('.lvl-spell', { hasText: picked }).click()
console.log(`  coge: ${picked}`)
await shot('nivel-2-barda-elegido')

if (!(await apply.isEnabled())) fail('con todo elegido se puede subir')
await apply.click()
await dm.waitForTimeout(600)

const bardAfter = await hpOf(bard)
console.log(`  después: ${bardAfter.hp}/${bardAfter.max}`)
if (bardAfter.max !== bardBefore.max + 5) fail('el máximo no subió')
if (bardAfter.hp !== bardBefore.hp + 5) fail('los PG actuales suben con el máximo')

// All three landed: the expertise, the spell and the feature nobody chose.
await bard.locator('.pc-head').getByRole('button', { name: 'ⓘ' }).click()
await dm.waitForSelector('.sheet .pc-traits')
const fichaBarda = await dm.locator('.sheet').innerText()
const interpFicha = await dm.locator('.sheet .skill', { hasText: 'Interpretación' }).locator('.skill-mod').innerText()
console.log(`  la ficha: Interpretación ${interpFicha} · Aprendiz de todo ${fichaBarda.includes('Aprendiz de todo') ? 'sí' : 'no'}`)
if (interpFicha !== '+7' || !fichaBarda.includes('Aprendiz de todo')) fail('la experticia y el rasgo tienen que estar en la ficha')
await dm.getByRole('button', { name: 'Cerrar' }).click()

// The spell is on the record, which the phone is the screen for.
const link = await dm.locator('#party-link').inputValue()
const bardPhone = await openPhone(link, 'Marla Curdwick')
await bardPhone.getByRole('button', { name: /Conjuros/ }).click()
await bardPhone.waitForTimeout(300)
const conjuros = await bardPhone.locator('.pj-body').innerText()
console.log(`  el conjuro nuevo en el móvil: ${conjuros.includes(picked) ? 'sí' : 'no'}`)
if (!conjuros.includes(picked)) fail('el conjuro elegido tiene que salir en su pestaña')
await bardPhone.screenshot({ path: '/tmp/dmshots/nivel-3-barda-movil.png' })

/*
 * --- a rogue, from his phone: no decisions at all ----------------------------
 */
const rogue = dm.locator('.pc-card', { hasText: 'Pip Nosewick' })
const rogueBefore = await hpOf(rogue)
const phone = await openPhone(link, 'Pip Nosewick')
await phone.locator('.pj-hp-now').waitFor()
console.log(`el pícaro, desde el móvil:\n  antes: ${rogueBefore.hp}/${rogueBefore.max}`)

await phone.locator('.pj-icon').last().click()
await phone.getByRole('button', { name: 'Subir de nivel' }).click()
await phone.waitForSelector('.lvl-panel')
await phone.screenshot({ path: '/tmp/dmshots/nivel-4-movil.png' })
const granted = await phone.locator('.lvl-granted').allInnerTexts()
console.log(`  te llevas: ${granted.map((g) => g.split('\n')[0]).join(', ') || '(nada)'}`)
if (!granted.some((g) => g.includes('Astucia'))) fail('un pícaro gana Astucia a nivel 2')
await phone.getByRole('button', { name: /Subir a nivel/ }).click()
await phone.waitForTimeout(700)

const phoneAfter = Number(await phone.locator('.pj-hp-now').innerText())
console.log(`  después, en el móvil: ${phoneAfter}`)
if (phoneAfter !== rogueBefore.hp + 5) fail('el móvil no aplicó la subida')
// And the console, which never reloaded, agrees — the socket carried it.
const consoleSees = await hpOf(rogue)
console.log(`  la consola, sin recargar, dice ${consoleSees.hp}/${consoleSees.max}`)
if (consoleSees.max !== rogueBefore.max + 5) fail('la subida del móvil no llegó a la consola')
await phone.screenshot({ path: '/tmp/dmshots/nivel-5-movil-aplicado.png' })

/*
 * --- and a level nobody has written ------------------------------------------
 *
 * Pip is level 2 now and the table stops there: the form says so and offers
 * nothing to type or apply.
 */
await rogue.getByRole('button', { name: 'Subir de nivel' }).click()
await dm.waitForSelector('.lvl-panel')
const sinTabla = await dm.locator('.lvl-manual').count()
const canApply = await dm.getByRole('button', { name: /Subir a nivel/ }).count()
console.log(`nivel sin escribir:\n  avisa: ${sinTabla ? 'sí' : 'no'} · botón de subir: ${canApply ? 'sí' : 'no'}`)
if (!sinTabla) fail('sin fila, el formulario avisa')
if (canApply) fail('sin fila no se sube')
await shot('nivel-6-sin-tabla')
await dm.getByRole('button', { name: 'Cancelar' }).click()

await finish()
