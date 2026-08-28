/**
 * DM console state.
 *
 * This window *is* the server now. It holds the directory handle, owns the
 * `SessionStore`, builds the notes index, reads every asset, and publishes the
 * table projection over the transport. Nothing here talks to a network.
 */
import { create } from 'zustand'
import type { Action, FrozenSummary } from '../../../shared/actions.ts'
import type {
  Character,
  GameObject,
  Pnj,
  RosterEntry,
  Scene,
  SessionState,
} from '../../../shared/types.ts'
import { SessionStore } from '../../../shared/session/store.ts'
import { projectDm } from '../../../shared/session/project.ts'
import { pnjIndex } from '../../../shared/session/portraits.ts'
import type { CampaignVault, AssetIndex } from '../../../shared/vault/binding.ts'
import type { NotesIndex } from '../../../shared/vault/notes.ts'
import { search } from '../../../shared/vault/notes.ts'
import { renderNote } from '../../../shared/vault/render.ts'
import type { SheetStats } from '../../../shared/vault/sheet.ts'
import {
  applyDeviations,
  draftBitacora,
  proposeDeviations,
  type Deviation,
} from '../../../shared/vault/writeback.ts'
import { AssetCache } from '../assets/cache.ts'
import { VaultAssetSource } from '../assets/sources.ts'
import { BroadcastChannelTransport } from '../transport/broadcast.ts'
import type { TableTransport } from '../transport/index.ts'
import {
  fsaSupported,
  forget,
  lastMesa,
  openVault,
  permissionOf,
  pickVault,
  regrant,
  rememberMesa,
  remembered,
  UnsupportedBrowserError,
} from '../vault/open.ts'

export type { SheetStats }

export type Tab = 'mesa' | 'party' | 'notas' | 'sesion' | 'preparacion'

/** Where the console is in the business of having a folder open. */
export type Phase =
  /** No folder yet — the picker is the whole screen. */
  | 'sin-carpeta'
  /** A remembered handle is there, but the grant needs a click. */
  | 'reabrir'
  | 'abriendo'
  | 'lista'
  | 'sin-soporte'
  | 'error'

export interface NoteRef {
  path: string
  title: string
  slug: string
  tags: string[]
  backlinks: number
}

export interface NoteDoc {
  path: string
  title: string
  tags: string[]
  frontmatter: Record<string, unknown>
  html: string
  backlinks: { path: string; title: string }[]
}

export interface CloseDraft {
  mesa: string
  bitacora: { sessionNumber: number; filename: string; content: string }
  deviations: Deviation[]
  estado: string
  estadoPreview: string
}

/** The one asset cache the DM window uses, shared by every panel. */
export const dmAssets = new AssetCache()

const store = new SessionStore()
let vault: CampaignVault | null = null
let notes: NotesIndex | null = null
let transport: TableTransport | null = null
let unsubscribe: (() => void) | null = null
/** The DM side of the asset channel — also what answers the table's requests. */
let assetSource: VaultAssetSource | null = null

interface DmStore {
  phase: Phase
  ready: boolean
  vaultName: string
  campaign: string
  campaigns: string[]
  tab: Tab
  mesa: string
  runs: string[]
  scenes: Scene[]
  pnjs: (Pnj & { hasPortrait: boolean })[]
  objects: GameObject[]
  characters: Character[]
  sheets: Record<string, SheetStats>
  assets: AssetIndex
  state: SessionState | null
  /** Non-null while the table screen is holding an older frame. */
  frozen: FrozenSummary | null
  /** Set when a save failed — Obsidian holding the file, a revoked grant. */
  persistError: string | null
  error: string | null
  /** Set when another panel asks the Notas tab to open a specific note. */
  pendingNote: string | null

  start: () => void
  pick: () => Promise<void>
  reopen: () => Promise<void>
  close: () => Promise<void>
  setTab: (tab: Tab) => void
  openNote: (path: string) => void
  clearPendingNote: () => void
  dispatch: (action: Action) => void
  openRun: (mesa: string) => Promise<void>
  openCampaign: (id: string) => Promise<void>
  reload: () => Promise<void>

  noteList: () => { notes: NoteRef[]; tags: { tag: string; count: number }[] }
  readNote: (path: string) => NoteDoc | null
  searchNotes: (query: string) => { path: string; title: string; excerpt: string }[]

  saveRoster: (sceneId: string, roster: RosterEntry[]) => Promise<void>
  closeDraft: (date: string) => Promise<CloseDraft | null>
  previewEstado: (deviations: Deviation[]) => Promise<string>
  commitClose: (
    filename: string,
    content: string,
    estado: string | null,
  ) => Promise<{ written?: string[]; error?: string }>
}

export const useDm = create<DmStore>((set, get) => ({
  phase: 'sin-carpeta',
  ready: false,
  vaultName: '',
  campaign: '',
  campaigns: [],
  tab: 'mesa',
  mesa: '',
  runs: [],
  scenes: [],
  pnjs: [],
  objects: [],
  characters: [],
  sheets: {},
  assets: { images: [], pdfs: [], audio: [] },
  state: null,
  frozen: null,
  persistError: null,
  error: null,
  pendingNote: null,

  setTab: (tab) => set({ tab }),
  openNote: (path) => set({ tab: 'notas', pendingNote: path }),
  clearPendingNote: () => set({ pendingNote: null }),

  dispatch: (action) => {
    try {
      store.dispatch(action)
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  /** Decide, without touching anything, what the console should offer. */
  start: () => {
    // `?fixture=example` mounts the bundled example campaign in memory. The
    // native directory picker cannot be driven from a script, so this is how
    // the Playwright runs get a campaign — and it is dev-only, so the
    // production bundle does not carry 370 kB of cheese.
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('fixture')) {
      void import('../fixtures/index.ts').then(async ({ openFixture }) => {
        const { vault: memoryVault } = await openFixture()
        await bringUp(memoryVault, set, 'example (fixture)')
      })
      return
    }
    if (!fsaSupported()) {
      set({ phase: 'sin-soporte' })
      return
    }
    void remembered().then(async (handle) => {
      if (!handle) return
      const grant = await permissionOf(handle)
      // A granted handle can be reopened without a gesture; `prompt` cannot.
      if (grant === 'granted') await attach(handle, set)
      else set({ phase: 'reabrir', vaultName: handle.name })
    })
  },

  pick: async () => {
    set({ error: null })
    try {
      const handle = await pickVault()
      if (handle) await attach(handle, set)
    } catch (err) {
      if (err instanceof UnsupportedBrowserError) set({ phase: 'sin-soporte' })
      else set({ phase: 'error', error: (err as Error).message })
    }
  },

  reopen: async () => {
    const handle = await remembered()
    if (!handle) {
      set({ phase: 'sin-carpeta' })
      return
    }
    if (await regrant(handle)) await attach(handle, set)
    else set({ error: 'La carpeta sigue sin permiso de lectura y escritura.' })
  },

  close: async () => {
    await store.flush()
    await forget()
    detach()
    set({
      phase: 'sin-carpeta',
      ready: false,
      vaultName: '',
      campaign: '',
      campaigns: [],
      mesa: '',
      runs: [],
      state: null,
      scenes: [],
      pnjs: [],
      objects: [],
      characters: [],
      sheets: {},
      assets: { images: [], pdfs: [], audio: [] },
    })
  },

  openRun: async (mesa) => {
    if (!vault || mesa === get().mesa) return
    try {
      await store.open(mesa)
      rememberMesa(vault.campaignId, mesa)
      syncFromStore(set)
      publish()
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  openCampaign: async (id) => {
    const handle = await remembered()
    if (!handle) return
    await attach(handle, set, id)
  },

  reload: async () => {
    if (!vault) return
    await store.reloadCampaign()
    notes = await vault.buildNotesIndex()
    set({ assets: await vault.listAssets() })
    syncFromStore(set)
    publish()
  },

  // --- notes ---------------------------------------------------------------

  noteList: () => {
    if (!notes) return { notes: [], tags: [] }
    return {
      notes: [...notes.notes.values()].map((n) => ({
        path: n.path,
        title: n.title,
        slug: n.slug,
        tags: n.tags,
        backlinks: notes!.backlinks.get(n.path)?.length ?? 0,
      })),
      tags: [...notes.tags.entries()]
        .map(([tag, paths]) => ({ tag, count: paths.length }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'es')),
    }
  },

  readNote: (path) => {
    const note = notes?.notes.get(path)
    if (!note || !notes) return null
    return {
      path: note.path,
      title: note.title,
      tags: note.tags,
      frontmatter: note.frontmatter,
      html: renderNote(note),
      backlinks: (notes.backlinks.get(note.path) ?? []).map((p) => ({
        path: p,
        title: notes!.notes.get(p)?.title ?? p,
      })),
    }
  },

  searchNotes: (query) => (notes ? search(notes, query) : []),

  // --- Preparación ---------------------------------------------------------

  /**
   * The one place the app writes prep. Refused while a run is live, so it can
   * never be a *session* editing preparation — see `runs/README.md`.
   */
  saveRoster: async (sceneId, roster) => {
    const state = get().state
    if (!vault || !state) return
    if (state.encounter.on || state.field.sceneId) {
      throw new Error(
        'Hay una partida en marcha: cierra la escena y el combate antes de preparar.',
      )
    }
    const scenarios = await vault.scenarios()
    const { files } = await scenarios.list()
    let target: string | null = null
    let raw: Record<string, unknown> | null = null
    for (const name of files.filter((n) => n.endsWith('.json'))) {
      const file = await scenarios.file(name)
      if (!file) continue
      try {
        const parsed = JSON.parse(await file.text()) as Record<string, unknown>
        if ((parsed.scene as { id?: string } | undefined)?.id === sceneId) {
          target = name
          raw = parsed
          break
        }
      } catch {
        /* a scene file we cannot read is not the one we are looking for */
      }
    }
    if (!target || !raw) throw new Error(`No encuentro el fichero de la escena ${sceneId}`)

    const scene = raw.scene as Record<string, unknown>
    scene.roster = roster.filter((r) => r.pnjId && r.count > 0)
    await scenarios.write(target, `${JSON.stringify(raw, null, 2)}\n`)
    await get().reload()
  },

  // --- closing a session ---------------------------------------------------

  closeDraft: async (date) => {
    if (!vault) return null
    const mesa = get().mesa
    const [sessionNumber, template, estado] = await Promise.all([
      vault.nextSessionNumber(mesa),
      vault.readTemplate(mesa),
      vault.readEstado(mesa),
    ])
    const bitacora = draftBitacora(store.state, {
      date,
      scenes: store.ctx.scenes,
      players: [...store.ctx.pcs.values()].map((p) => p.name),
      sessionNumber,
      template,
    })
    const deviations = proposeDeviations(store.state, {
      sessionNumber: bitacora.sessionNumber,
      scenes: store.ctx.scenes,
      objects: store.campaign.objects,
      pnjs: store.campaign.pnjs,
      pcNames: new Map([...store.ctx.pcs].map(([id, info]) => [id, info.name])),
    })
    return {
      mesa,
      bitacora,
      deviations,
      estado,
      estadoPreview: applyDeviations(estado, deviations),
    }
  },

  previewEstado: async (deviations) => {
    if (!vault) return ''
    return applyDeviations(await vault.readEstado(get().mesa), deviations)
  },

  commitClose: async (filename, content, estado) => {
    if (!vault) return { error: 'No hay carpeta abierta' }
    const mesa = get().mesa
    const written: string[] = []
    try {
      written.push(await vault.writeBitacora(mesa, filename, content))
      if (typeof estado === 'string' && estado.trim()) {
        written.push(await vault.writeEstado(mesa, estado))
      }
    } catch (err) {
      return { error: (err as Error).message, written }
    }
    return { written }
  },
}))

// --- wiring -----------------------------------------------------------------

type Setter = (partial: Partial<DmStore>) => void

/** Open a granted handle and bring the console up on it. */
async function attach(
  handle: FileSystemDirectoryHandle,
  set: Setter,
  campaign?: string,
): Promise<void> {
  set({ phase: 'abriendo', error: null, vaultName: handle.name })
  detach()
  try {
    const opened = await openVault(handle, campaign)
    await bringUp(opened.vault, set, handle.name)
  } catch (err) {
    detach()
    set({ phase: 'error', ready: false, error: (err as Error).message })
  }
}

/**
 * Everything that happens once there *is* a vault, whatever it is backed by:
 * a directory handle in normal use, an in-memory tree under `?fixture=`.
 */
async function bringUp(opened: CampaignVault, set: Setter, name: string): Promise<void> {
  set({ phase: 'abriendo', error: null, vaultName: name })
  detach()
  try {
    vault = opened
    store.bind(vault)

    const runs = await vault.listRuns()
    if (runs.length === 0) {
      set({
        phase: 'error',
        error: `${name}: la campaña ${vault.campaignId} no tiene ninguna mesa en runs/.`,
      })
      return
    }
    const wanted = lastMesa(vault.campaignId)
    const mesa = wanted && runs.includes(wanted) ? wanted : runs[0]!
    await store.open(mesa)
    rememberMesa(vault.campaignId, mesa)

    notes = await vault.buildNotesIndex()

    // The DM window is the only one that can read the folder, so it is the
    // only one that can answer for an asset.
    assetSource = new VaultAssetSource(vault, {
      npcs: () => store.state.npcs,
      pnjs: () => pnjIndex(store.campaign.pnjs),
      pcPortrait: (id) => store.characters.find((c) => c.id === id)?.portrait,
    })
    dmAssets.setSource(assetSource)

    transport = new BroadcastChannelTransport()
    transport.subscribe((msg) => {
      if (msg.type === 'join') publish()
      else if (msg.type === 'need') void answer(msg.key)
    })
    unsubscribe = store.subscribe(() => {
      syncFromStore(set)
      publish()
    })

    set({
      phase: 'lista',
      ready: true,
      campaign: vault.campaignId,
      campaigns: await vault.listCampaigns(),
      runs,
      assets: await vault.listAssets(),
      error: null,
    })
    syncFromStore(set)
    publish()
  } catch (err) {
    detach()
    set({ phase: 'error', ready: false, error: (err as Error).message })
  }
}

function detach(): void {
  unsubscribe?.()
  unsubscribe = null
  transport?.close()
  transport = null
  dmAssets.setSource(null)
  assetSource = null
  notes = null
  vault = null
}

/** Copy the store's view of the world into the React state. */
function syncFromStore(set: Setter): void {
  set({
    mesa: store.mesa,
    scenes: store.campaign.scenes,
    // Stat blocks stay here; the inline base64 does not travel with them.
    pnjs: store.campaign.pnjs.map((m) => ({
      ...m,
      portrait: m.portrait ? { src: m.portrait.src, stamp: null } : null,
      hasPortrait: Boolean(m.portrait?.stamp || m.portrait?.src),
    })),
    objects: store.campaign.objects,
    characters: store.characters,
    sheets: Object.fromEntries(store.sheets),
    state: projectDm(store.state),
    frozen: store.frozenSummary(),
    persistError: store.persistError,
  })
}

function publish(): void {
  if (transport) transport.publish(store.tableView())
}

/**
 * Answer a table window's request for an asset.
 *
 * Read from the vault rather than from `dmAssets`: that cache holds blob URLs,
 * which mean nothing in the other window, and a re-read is a file the OS has
 * in page cache anyway.
 */
async function answer(key: string): Promise<void> {
  if (!transport) return
  try {
    transport.sendAsset(key, (await assetSource?.blobFor(key)) ?? null)
  } catch {
    transport.sendAsset(key, null)
  }
}
