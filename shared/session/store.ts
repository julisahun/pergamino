/** Authoritative session state: one run live at a time, persisted debounced. */
import type { Action } from '../actions.ts'
import type { Character, Scene, SessionState, TableView } from '../types.ts'
import type { CampaignData } from '../vault/campaign.ts'
import { emptyLiveState } from '../vault/session.ts'
import type { SheetStats } from '../vault/sheet.ts'
import { SESSION_VERSION } from '../types.ts'
import { reduce } from './reducer.ts'
import { pnjIndex } from './portraits.ts'
import { projectTable, type PcInfo, type ProjectContext } from './project.ts'

const PERSIST_DEBOUNCE_MS = 400

/** Everything a run contributes, read in one pass by whoever holds the files. */
export interface RunData {
  state: SessionState
  /** The version found on disk, or null when there was no `session.json`. */
  fromVersion: number | null
  characters: Character[]
  sheets: Map<string, SheetStats>
  /** Vault-relative `runs/<mesa>/players/<file>` per character id. */
  playerFiles: Record<string, string>
}

/**
 * The store's whole view of storage.
 *
 * It is deliberately this small: the store never sees a directory, let alone a
 * writable one. `CampaignVault` implements it over whatever holds the files —
 * a browser directory handle, an in-memory tree, or `node:fs` under the tests.
 */
export interface StoreVault {
  /** Campaign display name, shown when there is nothing else on screen. */
  title: string
  /** Set when the vault refuses writes — the suite's real-vault fixture. */
  readOnly?: boolean
  loadCampaign(): Promise<CampaignData>
  loadRun(mesa: string): Promise<RunData>
  saveSession(mesa: string, state: SessionState, opts: { backup?: boolean }): Promise<void>
}

type Listener = () => void

const EMPTY_CAMPAIGN: CampaignData = { pnjs: [], objects: [], scenes: [] }

export class SessionStore {
  #vault: StoreVault | null = null
  #mesa = ''
  #state: SessionState = { version: SESSION_VERSION } as SessionState
  #campaign: CampaignData = EMPTY_CAMPAIGN
  #characters: Character[] = []
  #sheets = new Map<string, SheetStats>()
  #ctx: ProjectContext = {
    title: '',
    pcs: new Map(),
    scenes: new Map(),
    pnjs: new Map(),
  }
  #listeners = new Set<Listener>()
  /** The frame the table screen is holding while sync is paused. */
  #frozen: TableView | null = null
  #timer: ReturnType<typeof setTimeout> | null = null
  #needsBackup = false
  /** Set by the last failed persist, so the console can say so out loud. */
  #persistError: string | null = null

  get mesa(): string {
    return this.#mesa
  }
  get state(): SessionState {
    return this.#state
  }
  get campaign(): CampaignData {
    return this.#campaign
  }
  get characters(): Character[] {
    return this.#characters
  }
  /** Derived numbers per PC, read from the `-fc5.xml` sheets. */
  get sheets(): Map<string, SheetStats> {
    return this.#sheets
  }
  get ctx(): ProjectContext {
    return this.#ctx
  }
  get persistError(): string | null {
    return this.#persistError
  }

  /** Attach the store to a vault. Nothing is read until `open`. */
  bind(vault: StoreVault): void {
    this.#vault = vault
    this.#campaign = EMPTY_CAMPAIGN
  }

  /** Switch to a run, loading its session and characters from the vault. */
  async open(mesa: string): Promise<void> {
    const vault = this.#requireVault()
    await this.flush()
    const [run, campaign] = await Promise.all([vault.loadRun(mesa), vault.loadCampaign()])
    const { state, fromVersion } = run
    this.#mesa = mesa
    this.#state = state
    this.#needsBackup = fromVersion !== null && fromVersion < SESSION_VERSION
    this.#campaign = campaign
    this.#characters = run.characters
    this.#sheets = run.sheets

    // A run whose session.json predates a character gets an entry on open,
    // starting at full HP so the tracker is usable straight away.
    const play = { ...state.play }
    const playerFiles = { ...state.playerFiles }
    for (const character of run.characters) {
      const hpMax = this.#sheets.get(character.id)?.hpMax ?? null
      const existing = play[character.id]
      play[character.id] = existing
        ? { ...existing, hp: existing.hp ?? hpMax }
        : emptyLiveState(hpMax)
      playerFiles[character.id] ??= run.playerFiles[character.id] ?? ''
    }
    this.#state = { ...state, play, playerFiles }

    this.#rebuildContext()
    // A run switch always resumes: a frozen frame belongs to the old mesa.
    this.#frozen = null
    if (this.#state.field.paused) {
      this.#state = { ...this.#state, field: { ...this.#state.field, paused: false } }
    }
    this.#persistError = null
    this.#emit()
    if (fromVersion !== null && fromVersion < SESSION_VERSION) {
      console.log(`[session] ${mesa}: migrated v${fromVersion} → v${SESSION_VERSION}`)
    }
  }

  #rebuildContext(): void {
    const scenes = new Map<string, Scene>(this.#campaign.scenes.map((s) => [s.id, s]))
    const pcs = new Map<string, PcInfo>()
    for (const c of this.#characters) {
      const sheet = this.#sheets.get(c.id)
      pcs.set(c.id, {
        name: c.name || c.id,
        hpMax: sheet?.hpMax ?? null,
        initMod: sheet?.initMod ?? null,
        hasPortrait: Boolean(c.portrait?.stamp || c.portrait?.src),
      })
    }
    this.#ctx = {
      title: this.#vault?.title ?? '',
      scenes,
      pcs,
      pnjs: pnjIndex(this.#campaign.pnjs),
    }
  }

  /**
   * What the table screen should be showing. While `field.paused` is set this
   * is the frame captured at the moment of pausing, so a screen that reloads
   * mid-pause still shows what the players were looking at.
   */
  tableView(): TableView {
    return this.#frozen ?? projectTable(this.#state, this.#ctx)
  }

  /** A short description of the held frame, for the DM's banner. */
  frozenSummary(): { scene: string | null; handout: boolean } | null {
    if (!this.#frozen) return null
    return {
      scene: this.#frozen.scene?.name ?? null,
      handout: this.#frozen.handout !== null,
    }
  }

  dispatch(action: Action): void {
    const wasPaused = this.#state.field.paused
    const { state } = reduce(this.#state, action, Date.now(), {
      pnj: (id) => this.#campaign.pnjs.find((m) => m.id === id),
      object: (id) => this.#campaign.objects.find((o) => o.id === id),
      scene: (id) => this.#campaign.scenes.find((s) => s.id === id),
      pcName: (pcId) => this.#ctx.pcs.get(pcId)?.name,
      pcMaxHp: (pcId) => this.#ctx.pcs.get(pcId)?.hpMax ?? null,
      pcInitMod: (pcId) => this.#ctx.pcs.get(pcId)?.initMod ?? null,
    })
    if (state === this.#state) return

    // Capture the frame before the state moves on, so the players keep seeing
    // exactly what was on screen when the DM hit pause.
    if (!wasPaused && state.field.paused) {
      this.#frozen = projectTable(this.#state, this.#ctx)
    } else if (wasPaused && !state.field.paused) {
      this.#frozen = null
    }

    this.#state = state
    this.#emit()
    this.#schedulePersist()
  }

  subscribe(fn: Listener): () => void {
    this.#listeners.add(fn)
    return () => this.#listeners.delete(fn)
  }

  #emit(): void {
    for (const fn of this.#listeners) fn()
  }

  #schedulePersist(): void {
    if (!this.#vault || this.#vault.readOnly || !this.#mesa) return
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.#persist()
    }, PERSIST_DEBOUNCE_MS)
  }

  async #persist(): Promise<void> {
    if (!this.#vault) return
    try {
      await this.#vault.saveSession(this.#mesa, this.#state, { backup: this.#needsBackup })
      this.#needsBackup = false
      if (this.#persistError !== null) {
        this.#persistError = null
        this.#emit()
      }
    } catch (err) {
      this.#persistError = (err as Error).message
      console.error(`[session] persist failed: ${this.#persistError}`)
      this.#emit()
    }
  }

  /** Re-read the prep folders after Preparación has edited a scene. */
  async reloadCampaign(): Promise<void> {
    this.#campaign = await this.#requireVault().loadCampaign()
    this.#rebuildContext()
    // Preparación is refused while a run is live, so nothing should be held —
    // but if it somehow is, the frame belongs to a campaign that just changed.
    this.#frozen = null
    if (this.#state.field.paused) {
      this.#state = { ...this.#state, field: { ...this.#state.field, paused: false } }
    }
    this.#emit()
  }

  /** Write any pending change now — on run switch and on shutdown. */
  async flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
      await this.#persist()
    }
  }

  #requireVault(): StoreVault {
    if (!this.#vault) throw new Error('No vault is open')
    return this.#vault
  }
}

/** `marea-baja` → `Marea Baja`. */
export function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}
