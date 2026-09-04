/**
 * Vault fixtures for the suite. Node-only — nothing the browser bundle
 * imports reaches this file.
 *
 * The DM's real vault is the only filesystem fixture, and it is opened
 * **read-only**: `openNodeVault` without `writable` returns handles whose
 * `write` throws before touching a byte. That is the backstop
 * `VAULT_READONLY=1` used to give, moved from a process-wide flag into the
 * handle itself.
 *
 * It is private and absent from CI, so every test that reads it lives in a
 * `*.vault.test.ts` file that `vitest.config.ts` leaves out where it is
 * missing. What runs everywhere is the half built on `MemoryVault`
 * (`test/memory.ts`) — no filesystem, no fixture folder to ship.
 */
import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PcInfo } from '../shared/session/project.ts'
import type { RunData } from '../shared/session/store.ts'
import { CampaignVault } from '../shared/vault/binding.ts'
import { openNodeVault } from '../shared/vault/node.ts'
import type { WritableVaultDir } from '../shared/vault/source.ts'
import { CAMPAIGN, WORLD, worldRootPath } from './roots.ts'

const here = nodePath.dirname(fileURLToPath(import.meta.url))
export const projectRoot = nodePath.resolve(here, '..')

export const world = WORLD
export const campaign = CAMPAIGN

const required = (path: string | null, what: string): string => {
  if (!path) throw new Error(`No ${what} to open — see test/roots.ts`)
  return path
}

export const worldRootAbs = (): string =>
  required(worldRootPath(projectRoot), `world folder (${WORLD})`)

/** The world folder, read-only. */
export const worldRoot = (): WritableVaultDir => openNodeVault(worldRootAbs())

/** `talasia/` with `marea-baja` open — the vault the app is written against. */
export const openWorld = (): Promise<CampaignVault> =>
  CampaignVault.open(worldRoot(), { campaign, readOnly: true })

/**
 * The mesa the campaign runs. `runs/README.md` lists exactly one, and the
 * suite has no business inventing another — a mesa is a group of people.
 *
 * Its `session.json` is a **live gameplay file**: the console rewrites it
 * every few seconds while it is open, and the DM moves tokens and reveals
 * people between one run of the suite and the next. So a test may read it for
 * *shape* — a real party, real NPCs instantiated from real prep — but must
 * set up any condition it actually asserts. Nothing here may depend on which
 * scene was last on screen or who happened to be hidden.
 */
export const MESA = 'last'

/**
 * What the projection and the reducer know about each PC: the name off the
 * note and the numbers off the `-fc5.xml`, derived from the run rather than
 * restated as a literal in every suite that needs it.
 *
 * Restating it is how the old fixtures rotted — they kept naming a party the
 * campaign had already replaced.
 */
export function pcsOf(run: RunData): Map<string, PcInfo> {
  return new Map(
    run.characters.map((c) => [
      c.id,
      {
        name: c.name,
        hpMax: run.sheets.get(c.id)?.hpMax ?? null,
        initMod: run.sheets.get(c.id)?.initMod ?? null,
        hasPortrait: c.portrait !== null,
      },
    ]),
  )
}

/** The PCs a run has live state for, which is who can be on the board. */
export const playingPcs = (run: RunData): string[] => Object.keys(run.state.play).sort()
