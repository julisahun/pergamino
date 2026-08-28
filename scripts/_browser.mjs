/** Shared harness for the driving scripts: chromium, pages, problem capture. */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function findChromium() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  for (const dir of fs.readdirSync(cache).filter((d) => d.startsWith('chromium-'))) {
    const mac = path.join(cache, dir, 'chrome-mac-arm64')
    if (!fs.existsSync(mac)) continue
    for (const app of fs.readdirSync(mac).filter((a) => a.endsWith('.app'))) {
      const bin = path.join(mac, app, 'Contents/MacOS', app.replace(/\.app$/, ''))
      if (fs.existsSync(bin)) return bin
    }
  }
  throw new Error('No cached chromium found')
}

export const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
export const OUT = process.env.OUT ?? '/tmp/dmshots'

/**
 * Every script opens the app on `?fixture=example`.
 *
 * The old harness had to *check* that the server it was driving pointed at a
 * scratch vault, because a stray click could rewrite the DM's own notes. There
 * is nothing left to check: the app reads a folder only when a human picks one
 * in the native dialog, which a script cannot do, and the fixture it mounts
 * instead lives in the tab's memory and dies with it.
 *
 * The flag is dev-only — the production bundle does not contain the fixture —
 * so these run against `npm run dev`.
 */
const FIXTURE = 'fixture=example'

const url = (page) => `${BASE}${page}${page.includes('?') ? '&' : '?'}${FIXTURE}`

export async function open({ table = false, width = 1600, height = 1000 } = {}) {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ executablePath: findChromium() })
  const ctx = await browser.newContext({ viewport: { width, height } })
  const problems = []
  const watch = (page, name) => {
    page.on('pageerror', (e) => problems.push(`[${name}] ${e.message}`))
    page.on('response', (r) => r.status() >= 400 && problems.push(`[${name}] ${r.status()} ${r.url()}`))
  }

  const dm = await ctx.newPage()
  watch(dm, 'dm')
  await dm.goto(url('/'), { waitUntil: 'networkidle' })
  // The fixture mounts asynchronously; the console appears when it is up.
  await dm.waitForSelector('.console', { timeout: 15_000 })

  let tablePage = null
  if (table) {
    tablePage = await ctx.newPage()
    watch(tablePage, 'table')
    await tablePage.goto(url('/tv'), { waitUntil: 'networkidle' })
    // The table window says hello over the BroadcastChannel and the DM window
    // answers with the current frame; give that one round trip.
    await tablePage.waitForTimeout(400)
  }

  const shot = async (name) => {
    await dm.screenshot({ path: path.join(OUT, `${name}.png`) })
    if (tablePage) {
      await tablePage.screenshot({ path: path.join(OUT, `${name}-tv.png`) })
    }
  }

  const finish = async () => {
    await browser.close()
    if (problems.length) {
      console.error(`\n${problems.length} problem(s):`)
      for (const p of problems) console.error(`  ${p}`)
      process.exitCode = 1
    } else {
      console.log('\nno console errors, no failed requests')
    }
    console.log(`shots in ${OUT}`)
  }

  return { browser, ctx, dm, table: tablePage, shot, finish, problems }
}
