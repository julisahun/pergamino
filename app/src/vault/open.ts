/**
 * Opening a vault: the directory picker, the handle kept in IndexedDB so a
 * reload can offer "Reabrir", and the campaign/mesa choice in localStorage.
 *
 * A handle survives a reload but its *permission* does not always: the browser
 * hands it back in the `prompt` state, and only a user gesture can re-grant.
 * That is why reopening is a button rather than something that happens on
 * load — see `remembered()` and `regrant()`.
 */
import { CampaignVault } from '../../../shared/vault/binding.ts'
import { fsaSupported, openFsaVault } from './fsa.ts'

const DB_NAME = 'pantalla-dm'
const DB_STORE = 'handles'
const HANDLE_KEY = 'vault-root'
const CAMPAIGN_KEY = 'pantalla-dm.campaign'
const MESA_KEY = 'pantalla-dm.mesa'

export { fsaSupported }

// --- the handle, in IndexedDB ----------------------------------------------

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB no disponible'))
  })
}

function transact<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  return db().then(
    (conn) =>
      new Promise<T>((resolve, reject) => {
        const tx = conn.transaction(DB_STORE, mode)
        const req = fn(tx.objectStore(DB_STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB'))
        tx.oncomplete = () => conn.close()
      }),
  )
}

/** The folder the DM opened last time, if the browser still has it. */
export async function remembered(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await transact('readonly', (s) => s.get(HANDLE_KEY))) ?? null
  } catch {
    return null
  }
}

async function remember(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await transact('readwrite', (s) => s.put(handle, HANDLE_KEY))
  } catch {
    /* a private window, or storage the user has turned off — not fatal */
  }
}

export async function forget(): Promise<void> {
  try {
    await transact('readwrite', (s) => s.delete(HANDLE_KEY))
  } catch {
    /* nothing to forget */
  }
}

// --- permission -------------------------------------------------------------

export type Grant = 'granted' | 'prompt' | 'denied'

export async function permissionOf(handle: FileSystemDirectoryHandle): Promise<Grant> {
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) as Grant
  } catch {
    return 'prompt'
  }
}

/** Ask for read-write again. Must be called from a user gesture. */
export async function regrant(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await permissionOf(handle)) === 'granted') return true
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

// --- the picker -------------------------------------------------------------

export class UnsupportedBrowserError extends Error {
  constructor() {
    super(
      'Este navegador no puede abrir carpetas. La pantalla de DM necesita ' +
        'Chrome, Edge u otro navegador Chromium: Firefox y Safari no ' +
        'implementan la File System Access API.',
    )
    this.name = 'UnsupportedBrowserError'
  }
}

/** Show the native folder picker and remember what was chosen. */
export async function pickVault(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) throw new UnsupportedBrowserError()
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ id: 'pantalla-dm', mode: 'readwrite' })
  } catch {
    return null // the DM cancelled the dialog
  }
  await remember(handle)
  return handle
}

// --- campaign and mesa ------------------------------------------------------

const local = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setLocal = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage off — the choice just will not be remembered */
  }
}

export const lastCampaign = (): string | null => local(CAMPAIGN_KEY)
export const rememberCampaign = (id: string | null): void => setLocal(CAMPAIGN_KEY, id)
/** Keyed by campaign: two campaigns rarely share a mesa name. */
export const lastMesa = (campaign: string): string | null => local(`${MESA_KEY}.${campaign}`)
export const rememberMesa = (campaign: string, mesa: string | null): void =>
  setLocal(`${MESA_KEY}.${campaign}`, mesa)

// --- putting it together ----------------------------------------------------

export interface OpenedVault {
  vault: CampaignVault
  handle: FileSystemDirectoryHandle
}

/** Open a campaign from a granted handle, honouring the remembered choice. */
export async function openVault(
  handle: FileSystemDirectoryHandle,
  campaign?: string,
): Promise<OpenedVault> {
  const vault = await CampaignVault.open(openFsaVault(handle), {
    campaign: campaign ?? lastCampaign() ?? undefined,
  })
  rememberCampaign(vault.campaignId)
  return { vault, handle }
}
