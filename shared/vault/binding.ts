/**
 * `CampaignVault` — the one place that turns a picked folder into handles.
 *
 * It is the successor to `paths.ts`, and it does the same job by a different
 * means. There are no path strings to compare and no `assertWritable`: the
 * campaign, the world and every prep folder are handed out as `VaultDir`,
 * which has no `write`, and exactly two descents resolve a `WritableVaultDir`
 * — `runs/<mesa>/` while playing, and `scenarios/` from Preparación. Writing
 * anywhere else is not refused at runtime; there is nothing to write it with.
 *
 * The picked folder is shape-detected, so both layouts the format allows are
 * readable:
 *
 *   contains `campaigns/`            a world (`talasia/`) — several campaigns,
 *                                    and the notes index spans it so `mundo/`
 *                                    lore is reachable from a campaign note
 *   contains `scenarios/`/`story/`   a flat campaign (`campaigns/<name>/`)
 */
import type { Character, SessionState } from '../types.ts'
import type { RunData, StoreVault } from '../session/store.ts'
import { titleCase } from '../session/store.ts'
import { loadCampaign, loadCharacters, type CampaignData } from './campaign.ts'
import { buildIndex, type NotesIndex } from './notes.ts'
import { loadSession, saveSession } from './session.ts'
import { readSheet, type SheetStats } from './sheet.ts'
import {
  exists,
  fileAt,
  VaultError,
  type VaultDir,
  type VaultFile,
  type WritableVaultDir,
} from './source.ts'
import {
  nextSessionNumber,
  readEstado,
  readTemplate,
  writeBitacora,
  writeEstado,
} from './writeback.ts'

export type VaultShape = 'world' | 'campaign'

export const CAMPAIGNS_DIR = 'campaigns'
export const RUNS_DIR = 'runs'
export const SCENARIOS_DIR = 'scenarios'
export const ASSETS_DIR = 'assets'
export const PLAYERS_DIR = 'players'

const AUDIO_EXT = new Set(['.mp3', '.ogg', '.m4a', '.wav'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'])

export interface AssetIndex {
  images: string[]
  pdfs: string[]
  audio: string[]
}

/** What a picked folder turned out to be, before a campaign is chosen. */
export interface VaultShapeInfo {
  shape: VaultShape
  /** Campaign folder names — one synthetic entry for a flat campaign. */
  campaigns: string[]
}

/** Read the folder's layout without committing to a campaign. */
export async function detectShape(root: VaultDir): Promise<VaultShapeInfo> {
  const campaignsDir = await root.dir(CAMPAIGNS_DIR)
  if (campaignsDir) {
    const { dirs } = await campaignsDir.list()
    return { shape: 'world', campaigns: dirs.filter((d) => !d.startsWith('.')) }
  }
  if ((await exists(root, SCENARIOS_DIR)) || (await exists(root, 'story'))) {
    return { shape: 'campaign', campaigns: [root.name] }
  }
  throw new VaultError(
    'Esa carpeta no parece un mundo ni una campaña: no tiene campaigns/, scenarios/ ni story/.',
  )
}

export class CampaignVault implements StoreVault {
  private constructor(
    /** The picked folder, writable. Only the two scoped descents use it. */
    private readonly rootWritable: WritableVaultDir,
    private readonly campaignWritable: WritableVaultDir,
    readonly shape: VaultShape,
    readonly campaignId: string,
    /** Vault-relative prefix of the campaign inside `notesRoot`. */
    readonly prefix: string,
    /** The suite opens the DM's real vault with this set. */
    readonly readOnly: boolean,
  ) {}

  /**
   * Open a campaign inside a picked folder. `campaign` is ignored for a flat
   * campaign and defaults to the first one in a world.
   */
  static async open(
    root: WritableVaultDir,
    opts: { campaign?: string; readOnly?: boolean } = {},
  ): Promise<CampaignVault> {
    const ro = opts.readOnly === true
    const info = await detectShape(root.readOnly())
    if (info.shape === 'campaign') {
      return new CampaignVault(root, root, 'campaign', root.name, '', ro)
    }
    const id = opts.campaign && info.campaigns.includes(opts.campaign)
      ? opts.campaign
      : info.campaigns[0]
    if (!id) throw new VaultError('El mundo no tiene ninguna campaña en campaigns/.')
    // Reaching a campaign inside a world is the one writable descent that is
    // not itself a write target: `runs/<mesa>/` lives under it. Nothing is
    // created here, and the handle is only ever exposed read-only.
    const campaignsDir = await root.dir(CAMPAIGNS_DIR)
    const campaign = campaignsDir ? await campaignsDir.dir(id) : null
    if (!campaign) throw new VaultError(`No existe la campaña ${id}.`)
    return new CampaignVault(root, campaign, 'world', id, `${CAMPAIGNS_DIR}/${id}`, ro)
  }

  /** Campaign display name, shown when there is nothing else on screen. */
  get title(): string {
    return titleCase(this.campaignId)
  }

  /** The world folder for a world, the campaign folder for a flat campaign. */
  get notesRoot(): VaultDir {
    return this.rootWritable.readOnly()
  }

  /** The campaign folder. Read-only — prep is never edited during play. */
  get campaignDir(): VaultDir {
    return this.campaignWritable.readOnly()
  }

  async listCampaigns(): Promise<string[]> {
    return (await detectShape(this.notesRoot)).campaigns
  }

  /** The run folders (`guils`, `last`, …) present for the campaign. */
  async listRuns(): Promise<string[]> {
    const runs = await this.campaignDir.dir(RUNS_DIR)
    if (!runs) return []
    return (await runs.list()).dirs.filter((d) => !d.startsWith('.')).sort()
  }

  loadCampaign(): Promise<CampaignData> {
    return loadCampaign(this.campaignDir)
  }

  /**
   * Everything one run contributes: session, characters and their sheets.
   *
   * The party can live in two places. `importing.md` §6b says a run holds
   * "that table's own party … which **shadow the campaign's by id**", so the
   * campaign's `players/` is the shared party and `runs/<mesa>/players/`
   * overrides it per character. The DM's own vault only uses the run layer;
   * the demo campaign only used the campaign layer, which is how the
   * discrepancy surfaced.
   */
  async loadRun(mesa: string): Promise<RunData> {
    const run = await this.runRead(mesa)
    if (!run) {
      throw new VaultError(`No existe la mesa ${mesa} en ${RUNS_DIR}/`)
    }
    const [{ state, fromVersion }, shared, own] = await Promise.all([
      loadSession(run),
      loadCharacters(this.campaignDir),
      loadCharacters(run),
    ])
    const sharedPlayers = await this.campaignDir.dir(PLAYERS_DIR)
    const ownPlayers = await run.dir(PLAYERS_DIR)

    const characters: Character[] = []
    const sheets = new Map<string, SheetStats>()
    const playerFiles: Record<string, string> = {}
    const layers: [typeof shared, VaultDir | null, string][] = [
      [shared, sharedPlayers, `${PLAYERS_DIR}/`],
      [own, ownPlayers, `${RUNS_DIR}/${mesa}/${PLAYERS_DIR}/`],
    ]
    for (const [loaded, dir, prefix] of layers) {
      for (const { character, file } of loaded) {
        const at = characters.findIndex((c) => c.id === character.id)
        if (at === -1) characters.push(character)
        else characters[at] = character
        if (dir) sheets.set(character.id, await readSheet(dir, file))
        playerFiles[character.id] = `${prefix}${file}`
      }
    }
    return { state, fromVersion, characters, sheets, playerFiles }
  }

  async saveSession(
    mesa: string,
    state: SessionState,
    opts: { backup?: boolean } = {},
  ): Promise<void> {
    await saveSession(await this.run(mesa), state, opts)
  }

  // --- the notes graph ------------------------------------------------------

  buildNotesIndex(): Promise<NotesIndex> {
    return buildIndex(this.notesRoot)
  }

  // --- assets ---------------------------------------------------------------

  /** Everything under `assets/`, split by what it can be used for. */
  async listAssets(): Promise<AssetIndex> {
    const dir = await this.campaignDir.dir(ASSETS_DIR)
    const out: AssetIndex = { images: [], pdfs: [], audio: [] }
    if (!dir) return out
    for (const name of (await dir.list()).files.sort()) {
      const at = name.lastIndexOf('.')
      const ext = at === -1 ? '' : name.slice(at).toLowerCase()
      const rel = `${ASSETS_DIR}/${name}`
      if (IMAGE_EXT.has(ext)) out.images.push(rel)
      else if (ext === '.pdf') out.pdfs.push(rel)
      else if (AUDIO_EXT.has(ext)) out.audio.push(rel)
    }
    return out
  }

  /** A campaign-relative file such as `assets/harbor.jpg`. */
  asset(relative: string): Promise<VaultFile | null> {
    const clean = relative.replace(/^\/+/, '')
    // A handle cannot address its parent, so `..` is simply not a path here —
    // but a caller passing one would silently look for a folder named `..`.
    if (clean.split('/').some((p) => p === '..' || p === '.' || p === '')) {
      return Promise.resolve(null)
    }
    return fileAt(this.campaignDir, clean)
  }

  // --- closing a session ----------------------------------------------------

  async nextSessionNumber(mesa: string): Promise<number> {
    const run = await this.runRead(mesa)
    return run ? nextSessionNumber(run) : 1
  }

  async readTemplate(mesa: string): Promise<string> {
    const run = await this.runRead(mesa)
    return run ? readTemplate(run) : ''
  }

  async readEstado(mesa: string): Promise<string> {
    const run = await this.runRead(mesa)
    return run ? readEstado(run) : ''
  }

  async writeBitacora(mesa: string, filename: string, content: string): Promise<string> {
    const written = await writeBitacora(await this.run(mesa), filename, content)
    return `${RUNS_DIR}/${mesa}/${written}`
  }

  async writeEstado(mesa: string, content: string): Promise<string> {
    const written = await writeEstado(await this.run(mesa), content)
    return `${RUNS_DIR}/${mesa}/${written}`
  }

  // --- the two writable descents -------------------------------------------

  /**
   * `runs/<mesa>/` — the only place a live session may write.
   *
   * `createDir` rather than `dir` so a run folder that exists in the campaign
   * but has no session yet still opens; the run itself is checked by the
   * caller through `listRuns`.
   */
  async run(mesa: string): Promise<WritableVaultDir> {
    assertRunName(mesa)
    const runs = await this.campaignWritable.createDir(RUNS_DIR)
    return runs.createDir(mesa)
  }

  /**
   * `scenarios/` — the one sanctioned exception, for authoring scene rosters
   * from Preparación. The caller must have gated it on no run being live.
   */
  scenarios(): Promise<WritableVaultDir> {
    return this.campaignWritable.createDir(SCENARIOS_DIR)
  }

  /** A read-only handle on a run, for everything that only reads one. */
  private runRead(mesa: string): Promise<VaultDir | null> {
    assertRunName(mesa)
    return this.campaignDir.dir(RUNS_DIR).then((runs) => (runs ? runs.dir(mesa) : null))
  }
}

function assertRunName(mesa: string): string {
  if (mesa === '' || mesa === '.' || mesa === '..' || mesa.includes('/')) {
    throw new VaultError(`Not a run name: ${JSON.stringify(mesa)}`)
  }
  return mesa
}
