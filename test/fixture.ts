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
import { pcInfoOf } from '../shared/session/projection.ts'
import { seatParty } from '../shared/session/seat.ts'
import type { Character, SessionState } from '../shared/types.ts'
import { CampaignVault, RUNS_DIR } from '../shared/vault/binding.ts'
import { emptySession } from '../shared/vault/session.ts'
import { openNodeVault } from '../shared/vault/node.ts'
import { parseSheet, type SheetStats } from '../shared/vault/sheet.ts'
import { dirAt, fileAt, type WritableVaultDir } from '../shared/vault/source.ts'
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
 * Nothing here reads live state: it lives on the server, and the folder
 * holds none. Tests that need someone at the table *build* the state, from
 * the party and the prep that are real files. What the vault supplies is the
 * campaign; the scenario is the test's own.
 */
export const MESA = 'last'

/** The party as the suite sees it: who, and the sheet each one uploaded. */
export interface PartyData {
  characters: Character[]
  sheets: Map<string, SheetStats>
}

/**
 * The four PJs of the mesa, read straight from the `-fc5.xml` files the DM
 * keeps in `runs/<mesa>/players/<pj>/`.
 *
 * The app no longer reads that folder — a character is a row on the server,
 * made from the xml its player uploaded — but the files are still the real
 * sheets of a real party, which is what these tests want to be run against.
 * The id is the folder name; the name is the sheet's own.
 */
export async function loadParty(vault: CampaignVault, mesa = MESA): Promise<PartyData> {
  const players = await dirAt(vault.campaignDir, `${RUNS_DIR}/${mesa}/players`)
  if (!players) throw new Error(`No players folder in ${RUNS_DIR}/${mesa}/`)
  const characters: Character[] = []
  const sheets = new Map<string, SheetStats>()
  for (const id of (await players.list()).dirs.filter((d) => !d.startsWith('.')).sort()) {
    const file = await fileAt(players, `${id}/${id}-fc5.xml`)
    if (!file) continue
    const sheet = parseSheet(await file.text())
    characters.push({ id, name: sheet.name ?? id, player: '', portrait: null })
    sheets.set(id, sheet)
  }
  return { characters, sheets }
}

/**
 * What the projection and the reducer know about each PC: the name and the
 * numbers off the `-fc5.xml`, derived from the party rather than restated as
 * a literal in every suite that needs it.
 *
 * Restating it is how the old fixtures rotted — they kept naming a party the
 * campaign had already replaced.
 */
export function pcsOf(party: PartyData): Map<string, PcInfo> {
  return new Map(party.characters.map((c) => [c.id, pcInfoOf(c, party.sheets.get(c.id))]))
}

/** The party, by id, in a stable order. */
export const playingPcs = (party: PartyData): string[] =>
  party.characters.map((c) => c.id).sort()

/**
 * A fresh session with the whole party seated at full HP — what the server
 * does when a character is added, done here for the tests that drive the
 * reducer and the projection directly.
 *
 * Seating is what makes a PC addressable: `state.play` is the live layer, and
 * a `hp/damage` at someone who is not in it does nothing. The scenario is the
 * test's own; nothing starts from a file.
 */
export function seated(party: PartyData): SessionState {
  return seatParty(
    emptySession(),
    party.characters.map((c) => ({ id: c.id, hpMax: party.sheets.get(c.id)?.hpMax ?? null })),
  )
}
