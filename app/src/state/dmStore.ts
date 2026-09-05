/**
 * DM console state.
 *
 * This window holds the directory handle: it reads prep, builds the notes
 * index, reads every asset, and publishes the table projection over the
 * transport. What it no longer holds is the session. Live state and the party
 * live on the campaign server, which runs the reducer; `dispatch` here is a
 * message, and the state the panels render is whatever the server sent back.
 *
 * Bringing the console up is therefore two halves. The folder half is what it
 * always was — pick, open, read. The server half comes after: is it there, is
 * is this campaign registered (`.pergamino/campaign.json`, id and DM secret),
 * publish the statblocks the reducer needs, connect. Each question the server
 * half cannot answer is a `Phase` the welcome screen knows how to ask.
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
import { noteFromUrl } from './noteUrl.ts'
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
import { es } from '../strings/es.ts'
import { api, ApiError } from '../net/api.ts'
import { publishPrep } from './publish.ts'
import { RemoteSessionStore, type Connection } from './remoteStore.ts'

export type { SheetStats }

export type Tab = 'mesa' | 'party' | 'pnj' | 'objetos' | 'notas' | 'sesion' | 'preparacion'

/** Where the console is in the business of having a folder open, then a server. */
export type Phase =
  /** No folder yet — the picker is the whole screen. */
  | 'sin-carpeta'
  /** A remembered handle is there, but the grant needs a click. */
  | 'reabrir'
  | 'abriendo'
  /** The folder is open; the server did not answer. */
  | 'sin-servidor'
  /** The folder is open and has no `.pergamino/campaign.json` yet. */
  | 'sin-registrar'
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

/** The dev fixture registers under one id and secret, wiped and rebuilt on every boot. */
const FIXTURE_ID = 'fixture-example'
const FIXTURE_SECRET = 'fixture-example'

const store = new RemoteSessionStore()
let vault: CampaignVault | null = null
/** This campaign's DM secret, read from `.pergamino/campaign.json` or minted at registration. */
let secret: string | null = null
let notes: NotesIndex | null = null
let transport: TableTransport | null = null
let unsubscribe: (() => void) | null = null
/** The DM side of the asset channel — also what answers the table's requests. */
let assetSource: VaultAssetSource | null = null
/** Set under `?fixture=`: the sheets the demo party uploads to the dev server. */
let fixtureSheets: (() => Promise<{ player: string; xml: string }[]>) | null = null
/**
 * `start` runs once. StrictMode mounts an effect twice in development, and a
 * second boot racing the first used to be harmless — two in-memory vaults —
 * but against a server it registers the campaign twice and seats the demo
 * party twice.
 */
let started = false

interface DmStore {
  phase: Phase
  ready: boolean
  vaultName: string
  campaign: string
  campaigns: string[]
  tab: Tab
  /** The run folder bitácora and estado.md are written into. */
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
  connection: Connection
  /** The server's id for this campaign, once registered. */
  campaignId: string | null
  /** The players' link, ready to hand out. */
  link: string | null
  /** The last thing the server refused, for the topbar. */
  serverError: string | null
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

  // --- the server ---
  retryServer: () => Promise<void>
  register: () => Promise<void>
  /** A new DM secret for this campaign, written to the folder; the old one stops working. */
  rotateSecret: () => Promise<void>
  rotateLink: () => Promise<void>
  addCharacter: (file: File, player: string) => Promise<void>
  replaceSheet: (pcId: string, file: File) => Promise<void>
  removeCharacter: (pcId: string) => Promise<void>
  resetSession: () => Promise<void>

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
  // A URL that names a note but lands on Mesa is a URL that did nothing.
  tab: noteFromUrl() ? 'notas' : 'mesa',
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
  connection: 'inactiva',
  campaignId: null,
  link: null,
  serverError: null,
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
    if (started) return
    started = true
    // `?fixture=example` mounts the bundled example campaign in memory. The
    // native directory picker cannot be driven from a script, so this is how
    // the Playwright runs get a campaign — and it is dev-only, so the
    // production bundle does not carry 370 kB of cheese.
    if (import.meta.env.DEV && new URLSearchParams(location.search).get('fixture')) {
      void import('../fixtures/index.ts').then(async ({ openFixture, fixtureSheets: sheets }) => {
        const { vault: memoryVault } = await openFixture()
        fixtureSheets = () => sheets(memoryVault)
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
      connection: 'inactiva',
      campaignId: null,
      link: null,
      serverError: null,
    })
  },

  /** The mesa only says where bitácora and estado.md are written now. */
  openRun: async (mesa) => {
    if (!vault || mesa === get().mesa) return
    rememberMesa(vault.campaignId, mesa)
    set({ mesa })
  },

  openCampaign: async (id) => {
    const handle = await remembered()
    if (!handle) return
    await attach(handle, set, id)
  },

  reload: async () => {
    if (!vault) return
    const campaign = await vault.loadCampaign()
    store.setPrep(vault.title, campaign)
    notes = await vault.buildNotesIndex()
    set({ assets: await vault.listAssets() })
    const campaignId = get().campaignId
    if (secret && campaignId) {
      try {
        await publishPrep(secret, campaignId, vault, campaign)
      } catch (err) {
        set({ serverError: (err as Error).message })
      }
    }
    syncFromStore(set)
    publish()
  },

  // --- the server ------------------------------------------------------------

  retryServer: async () => {
    if (vault) await connectServer(set)
  },

  register: async () => {
    if (!vault) return
    set({ phase: 'abriendo', error: null })
    try {
      const reg = await api.register(vault.title)
      await vault.writeIdentity({
        id: reg.id,
        dmSecret: reg.dmSecret,
        server: location.origin,
        registered: new Date().toISOString().slice(0, 10),
      })
      await connectServer(set)
    } catch (err) {
      set({ phase: 'sin-registrar', error: (err as Error).message })
    }
  },

  rotateSecret: async () => {
    const id = get().campaignId
    if (!vault || !secret || !id) return
    try {
      const { dmSecret } = await api.rotateSecret(secret, id)
      const identity = await vault.readIdentity()
      await vault.writeIdentity({
        id,
        dmSecret,
        server: identity?.server ?? location.origin,
        registered: identity?.registered || new Date().toISOString().slice(0, 10),
      })
      secret = dmSecret
      // The open socket said hello with the old secret; say it again with the new.
      await store.connect(id, secret)
      set({ serverError: null })
    } catch (err) {
      set({ serverError: describe(err) })
    }
  },

  rotateLink: async () => {
    const id = get().campaignId
    if (!secret || !id) return
    try {
      const { url } = await api.rotateLink(secret, id)
      set({ link: url })
    } catch (err) {
      set({ serverError: (err as Error).message })
    }
  },

  addCharacter: async (file, player) => {
    const id = get().campaignId
    if (!secret || !id) return
    try {
      await api.addCharacter(secret, id, await file.text(), player)
      set({ serverError: null })
    } catch (err) {
      set({ serverError: describe(err) })
    }
  },

  replaceSheet: async (pcId, file) => {
    const id = get().campaignId
    if (!secret || !id) return
    try {
      await api.replaceSheet(secret, id, pcId, await file.text())
      set({ serverError: null })
    } catch (err) {
      set({ serverError: describe(err) })
    }
  },

  removeCharacter: async (pcId) => {
    const id = get().campaignId
    if (!secret || !id) return
    try {
      await api.removeCharacter(secret, id, pcId)
    } catch (err) {
      set({ serverError: describe(err) })
    }
  },

  resetSession: async () => {
    const id = get().campaignId
    if (!secret || !id) return
    try {
      await api.reset(secret, id)
    } catch (err) {
      set({ serverError: describe(err) })
    }
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
   * The one place the app writes a scene. Refused while a run is live, so it
   * can never be a *session* editing preparation — see `runs/README.md`.
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

/** What the server said, or what went wrong on the way there. */
const describe = (err: unknown): string =>
  err instanceof ApiError && err.code === 'bad-sheet'
    ? es.fichaNoValida
    : (err as Error).message

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
 * The folder half: everything that happens once there *is* a vault, whatever
 * it is backed by — a directory handle in normal use, an in-memory tree under
 * `?fixture=`. Ends by asking the server half to take over.
 */
async function bringUp(opened: CampaignVault, set: Setter, name: string): Promise<void> {
  set({ phase: 'abriendo', error: null, vaultName: name })
  detach()
  try {
    vault = opened

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
    rememberMesa(vault.campaignId, mesa)

    store.setPrep(vault.title, await vault.loadCampaign())
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
      campaign: vault.campaignId,
      campaigns: await vault.listCampaigns(),
      runs,
      mesa,
      assets: await vault.listAssets(),
      error: null,
    })
    syncFromStore(set)
    await connectServer(set)
  } catch (err) {
    detach()
    set({ phase: 'error', ready: false, error: (err as Error).message })
  }
}

/**
 * The server half. Each early return is a question for the welcome screen;
 * the end is `lista`. Safe to call again after the DM answers one.
 */
async function connectServer(set: Setter): Promise<void> {
  if (!vault) return
  set({ phase: 'abriendo', ready: false, error: null })

  try {
    await api.ping()
  } catch {
    set({ phase: 'sin-servidor' })
    return
  }

  try {
    let id: string
    if (fixtureSheets) {
      id = await fixtureIdentity(vault.title)
      secret = FIXTURE_SECRET
    } else {
      const identity = await vault.readIdentity()
      if (!identity) {
        set({ phase: 'sin-registrar' })
        return
      }
      id = identity.id
      secret = identity.dmSecret
      // A wiped database still recognises the id the folder holds — and takes
      // the folder's secret as the campaign's. A file from before secrets has
      // none: the server mints one, and it is written back beside the id.
      const known = secret ? await api.campaign(secret, id) : { exists: false as const }
      if (!known.exists) {
        const reg = await api.reregister(secret, id, vault.title)
        if (reg.dmSecret !== secret) {
          secret = reg.dmSecret
          await vault.writeIdentity({ ...identity, dmSecret: secret })
        }
      }
    }

    await publishPrep(secret!, id, vault, store.campaign)
    await store.connect(id, secret!)
    const summary = await api.campaign(secret!, id)

    set({
      phase: 'lista',
      ready: true,
      campaignId: id,
      link: summary.exists ? summary.url : null,
      serverError: null,
    })
    syncFromStore(set)
    publish()
  } catch (err) {
    // The folder's secret is not this campaign's: the DM can register anew,
    // knowingly, and that is a different campaign on the server.
    if ((err as Error).message === 'sin-autorizar' || (err instanceof ApiError && err.status === 401)) {
      set({ phase: 'sin-registrar', error: es.sinAutorizar })
    } else {
      set({ phase: 'error', error: (err as Error).message })
    }
  }
}

/**
 * The fixture's campaign on the dev server: torn down and rebuilt on every
 * boot, so each driver starts from the same party and an empty table — the
 * isolation a fresh `MemoryVault` used to give for free.
 */
async function fixtureIdentity(title: string): Promise<string> {
  await api.remove(FIXTURE_SECRET, FIXTURE_ID).catch(() => undefined)
  await api.reregister(FIXTURE_SECRET, FIXTURE_ID, title)
  for (const { player, xml } of await fixtureSheets!()) {
    await api.addCharacter(FIXTURE_SECRET, FIXTURE_ID, xml, player)
  }
  return FIXTURE_ID
}

function detach(): void {
  unsubscribe?.()
  unsubscribe = null
  transport?.close()
  transport = null
  store.close()
  dmAssets.setSource(null)
  assetSource = null
  notes = null
  vault = null
}

/** Copy the store's view of the world into the React state. */
function syncFromStore(set: Setter): void {
  set({
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
    state: store.synced ? projectDm(store.state) : null,
    frozen: store.frozenSummary(),
    connection: store.connection,
    serverError: store.lastReject,
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
