/**
 * A player's phone: one link, one character, one projection.
 *
 * The link is in the URL's fragment, so it never reaches a server log. Which
 * character is this phone's is remembered per link, on the device. Everything
 * the page shows arrives as a `PlayerView` from the server; everything it
 * does is an action on its own character, sent and forgotten.
 */
import { create } from 'zustand'
import type { Action } from '../../../shared/actions.ts'
import type { CampaignPublic, ClientHello, ServerMsg } from '../../../shared/protocol.ts'
import type { PlayerView } from '../../../shared/session/player.ts'
import { isFc5Sheet } from '../../../shared/vault/sheet.ts'
import { AssetCache } from '../assets/cache.ts'
import { HttpAssetSource } from '../assets/http.ts'
import { api, ApiError, wsUrl } from '../net/api.ts'
import { LiveSocket, type SocketStatus } from '../net/ws.ts'
import { es } from '../strings/es.ts'

export type PjPhase =
  | 'sin-enlace'
  | 'cargando'
  | 'quien-eres'
  | 'crear'
  | 'ficha'
  | 'caducado'
  | 'error'

export const pjAssets = new AssetCache()

const linkFromUrl = (): string => decodeURIComponent(location.hash.replace(/^#/, '')).trim()
const whoKey = (link: string) => `pantalla-dm.pj.${link}.who`
const remembered = (link: string): string | null => {
  try {
    return localStorage.getItem(whoKey(link))
  } catch {
    return null
  }
}
const remember = (link: string, pcId: string | null): void => {
  try {
    if (pcId) localStorage.setItem(whoKey(link), pcId)
    else localStorage.removeItem(whoKey(link))
  } catch {
    /* storage off */
  }
}

let socket: LiveSocket | null = null
let started = false

interface PjStore {
  phase: PjPhase
  link: string
  title: string
  party: CampaignPublic['party']
  pcId: string | null
  view: PlayerView | null
  rev: number
  connection: SocketStatus | 'inactiva'
  /** What the server refused last, shown briefly. */
  reject: string | null
  error: string | null
  busy: boolean

  start: () => void
  choose: (pcId: string) => void
  forget: () => void
  startCreate: () => void
  cancelCreate: () => void
  create: (file: File, player: string) => Promise<void>
  replaceSheet: (file: File) => Promise<void>
  dispatch: (action: Action) => void
}

export const usePj = create<PjStore>((set, get) => ({
  phase: 'cargando',
  link: '',
  title: '',
  party: [],
  pcId: null,
  view: null,
  rev: 0,
  connection: 'inactiva',
  reject: null,
  error: null,
  busy: false,

  start: () => {
    if (started) return
    started = true
    const link = linkFromUrl()
    if (!link) {
      set({ phase: 'sin-enlace' })
      return
    }
    pjAssets.setSource(new HttpAssetSource(link))
    set({ link })
    void loadParty(set, get).then((ok) => {
      if (!ok) return
      const who = remembered(link)
      if (who && get().party.some((p) => p.id === who)) get().choose(who)
      else set({ phase: 'quien-eres' })
    })
  },

  choose: (pcId) => {
    const { link } = get()
    remember(link, pcId)
    set({ pcId, phase: 'ficha', view: null })
    connect(set, get)
  },

  forget: () => {
    const { link } = get()
    remember(link, null)
    socket?.close()
    socket = null
    set({ pcId: null, view: null, phase: 'quien-eres', connection: 'inactiva' })
  },

  startCreate: () => set({ phase: 'crear', error: null }),
  cancelCreate: () => set({ phase: 'quien-eres', error: null }),

  create: async (file, player) => {
    const { link } = get()
    set({ busy: true, error: null })
    try {
      const xml = await file.text()
      if (!isFc5Sheet(xml)) throw new Error(es.fichaNoValida)
      const { id } = await api.pj.create(link, xml, player)
      await loadParty(set, get)
      get().choose(id)
    } catch (err) {
      set({ error: describe(err) })
    } finally {
      set({ busy: false })
    }
  },

  replaceSheet: async (file) => {
    const { link, pcId } = get()
    if (!pcId) return
    set({ busy: true, error: null })
    try {
      const xml = await file.text()
      if (!isFc5Sheet(xml)) throw new Error(es.fichaNoValida)
      await api.pj.replaceSheet(link, pcId, xml)
    } catch (err) {
      set({ error: describe(err) })
    } finally {
      set({ busy: false })
    }
  },

  dispatch: (action) => {
    const id = Math.random().toString(36).slice(2, 10)
    if (!socket?.send({ type: 'action', id, action })) set({ reject: es.sinConexion })
  },
}))

type Setter = (partial: Partial<PjStore>) => void
type Getter = () => PjStore

const describe = (err: unknown): string =>
  err instanceof ApiError && err.code === 'bad-sheet' ? es.fichaNoValida : (err as Error).message

/** The picker's data. False when the link is dead, with the phase set. */
async function loadParty(set: Setter, get: Getter): Promise<boolean> {
  try {
    const pub = await api.pj.campaign(get().link)
    set({ title: pub.title, party: pub.party })
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) set({ phase: 'caducado' })
    else set({ phase: 'error', error: (err as Error).message })
    return false
  }
}

function connect(set: Setter, get: Getter): void {
  socket?.close()
  const { link, pcId } = get()
  if (!pcId) return
  const hello = (): ClientHello => ({ type: 'hello', role: 'pc', link, pc: pcId })
  const onMessage = (msg: ServerMsg) => {
    switch (msg.type) {
      case 'pc':
        set({ view: msg.view, rev: msg.rev, reject: null })
        socket?.saw(msg.rev)
        return
      case 'party':
        // Someone was added, replaced or removed — maybe me.
        void loadParty(set, get).then((ok) => {
          if (ok && !get().party.some((p) => p.id === get().pcId)) get().forget()
        })
        return
      case 'reject':
        set({ reject: msg.reason })
        return
      case 'error':
        set({ reject: msg.message })
        return
      default:
        return
    }
  }
  socket = new LiveSocket(wsUrl(), hello, onMessage, (status) => {
    set({ connection: status })
    // The server said no: the link rotated, or the character is gone.
    if (status === 'sin-autorizar') {
      void loadParty(set, get).then((ok) => {
        if (ok) get().forget()
      })
    }
  })
  socket.open()
}
