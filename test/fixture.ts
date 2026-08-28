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
