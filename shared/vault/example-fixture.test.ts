/**
 * The bundled demo campaign has to stay loadable by the loader that reads it.
 *
 * `app/src/fixtures/example.json` is *content*, not build output — it is the
 * only copy of the demo campaign left, and the Playwright drivers are the only
 * thing that mounts it. So a format change in `shared/vault/` can quietly
 * empty it and nothing fails until someone runs the drivers.
 *
 * This runs everywhere — no vault, no browser — and imports the same
 * `openFixture` the app does, so it exercises the real path rather than a
 * reimplementation of it.
 */
import { expect, it } from 'vitest'
import { fixtureSheets, openFixture } from '../../app/src/fixtures/index.ts'
import { isFc5Sheet, parseSheet } from './sheet.ts'

it('the bundled demo campaign still loads, and has a run to write into', async () => {
  const { vault } = await openFixture()
  const [mesa] = await vault.listRuns()
  expect(mesa, 'the demo campaign needs a mesa').toBeDefined()
  const campaign = await vault.loadCampaign()
  expect(campaign.pnjs.length).toBeGreaterThan(0)
  expect(campaign.scenes.length).toBeGreaterThan(0)
  expect(await vault.readIdentity()).toBeNull()
})

it('carries at least one sheet for the dev server to seat', async () => {
  const { vault } = await openFixture()
  const sheets = await fixtureSheets(vault)
  expect(sheets.length).toBeGreaterThan(0)
  for (const { xml } of sheets) {
    expect(isFc5Sheet(xml)).toBe(true)
    const sheet = parseSheet(xml)
    expect(sheet.name).not.toBeNull()
    expect(sheet.hpMax).not.toBeNull()
  }
})
