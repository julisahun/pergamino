/**
 * `CampaignVault` — the one place that turns a picked folder into handles.
 *
 * It is the successor to `paths.ts`, and it does the same job by a different
 * means. There are no path strings to compare and no `assertWritable`: the
 * campaign, the world and every prep folder are handed out as `VaultDir`,
 * which has no `write`, and exactly three descents resolve a
 * `WritableVaultDir` — `runs/<mesa>/` while playing, `scenarios/` from
 * Preparación, and `.pergamino/`, the app's own folder, which holds the
 * campaign's id and nothing a human edits. Writing anywhere else is not
 * refused at runtime; there is nothing to write it with.
 *
 * The picked folder is shape-detected, so both layouts the format allows are
 * readable:
 *
 *   contains `campaigns/`            a world (`talasia/`) — several campaigns,
 *                                    and the notes index spans it so `mundo/`
 *                                    lore is reachable from a campaign note
 *   contains `scenarios/`/`story/`   a flat campaign (`campaigns/<name>/`)
 */
import { titleCase } from '../text.ts'
import { loadCampaign, SCENARIOS_DIR, type CampaignData } from './campaign.ts'
import { buildIndex, type NotesIndex } from './notes.ts'
import {
  exists,
  fileAt,
  readJson,
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
export const ASSETS_DIR = 'assets'
/** The app's own folder inside a campaign. Skipped by every note walk, being a dotdir. */
export const PERGAMINO_DIR = '.pergamino'
export const IDENTITY_FILE = 'campaign.json'
// The prep folders are named where they are loaded from.
export { OBJECTS_DIR, PNJ_DIR } from './pnj.ts'
export { SCENARIOS_DIR } from './campaign.ts'

/**
 * What `.pergamino/campaign.json` holds: the id the server knows the campaign
 * by. Minted by the server on registration and written here once; renaming
 * the folder changes nothing, and two campaigns are told apart by it alone.
 */
export interface CampaignIdentity {
  id: string
  /** The server it was registered with, for the DM's information. */
  server: string | null
  /** ISO date. */
  registered: string
}

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

export class CampaignVault {
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
    return loadCampaign(this.campaignDir, this.prefix)
  }

  // --- identity -------------------------------------------------------------

  /** The id the server knows this campaign by, or null before registration. */
  async readIdentity(): Promise<CampaignIdentity | null> {
    const dir = await this.campaignDir.dir(PERGAMINO_DIR)
    if (!dir || !(await exists(dir, IDENTITY_FILE))) return null
    const raw = (await readJson(dir, IDENTITY_FILE)) as Partial<CampaignIdentity> | null
    if (!raw || typeof raw.id !== 'string' || !raw.id) return null
    return {
      id: raw.id,
      server: typeof raw.server === 'string' ? raw.server : null,
      registered: typeof raw.registered === 'string' ? raw.registered : '',
    }
  }

  /** Written once, on registration — the only prep write that is not a scene. */
  async writeIdentity(identity: CampaignIdentity): Promise<void> {
    const dir = await this.pergamino()
    await dir.write(IDENTITY_FILE, `${JSON.stringify(identity, null, 2)}\n`)
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

  // --- the three writable descents -----------------------------------------

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

  /**
   * `.pergamino/` — the app's own folder, for the campaign's id. A dotdir,
   * so no note walk ever lists it and Obsidian's graph never shows it.
   */
  pergamino(): Promise<WritableVaultDir> {
    return this.campaignWritable.createDir(PERGAMINO_DIR)
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
