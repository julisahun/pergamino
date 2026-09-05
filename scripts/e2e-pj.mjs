/**
 * A phone and the console on the same campaign.
 *
 * The console mounts the fixture and registers it on the dev server; the
 * Party strip carries the players' link. A second page opens that link at a
 * phone's size, picks the demo character, and takes damage — which the
 * console's card shows — and the console heals it back, which the phone shows.
 * The phone's every request has to go through its own link and nowhere else.
 */
import { BASE, open } from './_browser.mjs'

const { ctx, dm, shot, finish, problems } = await open()

await dm.getByRole('button', { name: 'Party', exact: true }).click()
const url = await dm.locator('#party-link').inputValue()
const hash = new URL(url).hash
if (!hash) {
  console.log('  FAIL — the Party strip carries no link')
  process.exitCode = 1
}
console.log(`  link: …${hash.slice(0, 8)}`)

// The link points at the server's public URL; in development the page itself
// is served by Vite, so only the fragment is what matters.
const phone = await ctx.newPage()
await phone.setViewportSize({ width: 390, height: 844 })
const requests = []
phone.on('request', (r) => {
  const u = new URL(r.url())
  if (u.pathname.startsWith('/api/') || u.pathname === '/ws') requests.push(u.pathname)
})
phone.on('pageerror', (e) => problems.push(`[pj] ${e.message}`))
phone.on('response', (r) => r.status() >= 400 && problems.push(`[pj] ${r.status()} ${r.url()}`))
await phone.goto(`${BASE}/pj${hash}`, { waitUntil: 'networkidle' })

console.log('quién eres:')
await phone.getByRole('heading', { name: '¿Quién eres?' }).waitFor()
await shot('pj-1-quien-eres')
await phone.getByRole('button', { name: /Pip Nosewick/ }).click()
await phone.locator('.pj-hp-now').waitFor()
const hpBefore = await phone.locator('.pj-hp-now').innerText()
console.log(`  hp: ${hpBefore}`)
await phone.screenshot({ path: '/tmp/dmshots/pj-2-ficha.png' })

console.log('daño desde el móvil:')
await phone.locator('.pj-amount').fill('3')
await phone.locator('.pj-big.danger').click()
await phone.waitForFunction(
  (before) => document.querySelector('.pj-hp-now')?.textContent !== before,
  hpBefore,
)
const hpAfter = await phone.locator('.pj-hp-now').innerText()
console.log(`  phone shows ${hpAfter}`)
if (Number(hpAfter) !== Number(hpBefore) - 3) {
  console.log('  FAIL — the phone did not see its own damage')
  process.exitCode = 1
}
// The console's card renders from the same state.
await dm.waitForFunction(
  (hp) => [...document.querySelectorAll('.pc-card .sub')].some((el) => el.textContent?.includes(`PG ${hp}/`)),
  hpAfter,
)
console.log('  console card agrees')
await shot('pj-3-dano')

console.log('curación desde la consola:')
await dm.locator('.pc-card').first().getByRole('button', { name: 'Al máximo' }).click()
await phone.waitForFunction((before) => document.querySelector('.pj-hp-now')?.textContent === before, hpBefore)
console.log(`  phone back to ${await phone.locator('.pj-hp-now').innerText()}`)

console.log('pestañas:')
for (const tab of ['Características', 'Rasgos', 'Equipo', 'Mesa']) {
  await phone.locator('.pj-tabs').getByRole('button', { name: tab }).click()
  await phone.waitForTimeout(150)
  await phone.screenshot({ path: `/tmp/dmshots/pj-4-${tab.toLowerCase()}.png` })
}
const skills = await phone.locator('.pj-list .pj-row').count()
console.log(`  rows on Mesa: ${skills}`)

const stray = requests.filter((p) => !p.startsWith('/api/pj/') && p !== '/ws')
if (stray.length) {
  console.log(`  FAIL — the phone reached beyond its link: ${[...new Set(stray)].join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`  every one of the phone's ${requests.length} API requests went through its link`)
}

await finish()
