/**
 * The bundled demo campaign has to stay loadable by the loader that reads it.
 *
 * `app/src/fixtures/example.json` is *content*, not build output — it is the
 * only copy of the demo campaign left, and the Playwright drivers are the only
 * thing that mounts it, on a machine with a cached Chromium. So a format change
 * in `shared/vault/` can quietly empty it and nothing fails until someone runs
 * the drivers: making a PJ a folder did exactly that, leaving the demo with a
 * `players/pip-nosewick.md` the loader no longer counts as a character.
 *
 * This runs everywhere — no vault, no browser — and imports the same
 * `openFixture` the app does, so it exercises the real path rather than a
 * reimplementation of it.
 */
import { expect, it } from 'vitest'
import { openFixture } from '../../app/src/fixtures/index.ts'
import { PLAYERS_DIR } from './campaign.ts'

it('the bundled demo campaign still has a party the loader can read', async () => {
  const { vault } = await openFixture()
  const [mesa] = await vault.listRuns()
  expect(mesa, 'the demo campaign needs a mesa').toBeDefined()

  const run = await vault.loadRun(mesa!)
  expect(run.characters.length).toBeGreaterThan(0)

  for (const character of run.characters) {
    // One folder per PJ: `players/<pj>/<pj>.md`, and the note is the identity.
    expect(run.playerFiles[character.id]).toMatch(
      new RegExp(`(^|/)${PLAYERS_DIR}/([^/]+)/\\2\\.md$`),
    )
    expect(character.name).not.toBe('')
  }
})
