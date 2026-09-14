/**
 * The REST half of talking to the server, typed by `shared/protocol.ts`.
 *
 * Same origin always: in development Vite proxies `/api` and `/ws` to the
 * server, in production the server *is* the origin. `ApiError` carries the
 * server's code so the UI can say why in Spanish.
 */
import type {
  CampaignPublic,
  CampaignRegistration,
  CampaignSummary,
  MesaRegistered,
  DispatchResult,
  ErrorCode,
  PrepBody,
  Registered,
} from '../../../shared/protocol.ts'
import type { Character } from '../../../shared/types.ts'
import type { Sheet } from '../../../shared/character.ts'
import type { SheetPatch } from '../../../shared/protocol.ts'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface Options {
  method?: string
  /** The campaign's DM secret, sent as a bearer. */
  secret?: string | null
  json?: unknown
  body?: BodyInit
  type?: string
  timeoutMs?: number
}

async function call<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.secret) headers.Authorization = `Bearer ${opts.secret}`
  let body: BodyInit | undefined = opts.body
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  } else if (opts.type) {
    headers['Content-Type'] = opts.type
  }
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? (body !== undefined ? 'POST' : 'GET'),
      headers,
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    })
  } catch (err) {
    throw new ApiError(0, 'network', (err as Error).message)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* not JSON — an error page from a proxy, most likely */
  }
  if (!res.ok) {
    const e = (parsed ?? {}) as { error?: string; code?: ErrorCode }
    throw new ApiError(res.status, e.code ?? 'bad-request', e.error ?? `${res.status} ${res.statusText}`)
  }
  return parsed as T
}

export const api = {
  ping: () => call<{ app: string }>('/api/ping', { timeoutMs: 4000 }),
  /** Open to anyone: what comes back — the id and both secrets — is the only way in. */
  register: (title: string) => call<Registered>('/api/dm/campaigns', { json: { title } }),
  /**
   * Under the id the folder holds. With the folder's secret after a wiped
   * database, the server takes that secret as the campaign's; without one
   * (a file from before secrets) it mints one, and the answer carries it.
   */
  reregister: (secret: string | null, id: string, title: string) =>
    call<Registered>(`/api/dm/campaigns/${enc(id)}`, { secret, method: 'PUT', json: { title } }),
  rotateSecret: (secret: string, id: string) =>
    call<{ dmSecret: string }>(`/api/dm/campaigns/${enc(id)}/secret/rotate`, { secret, method: 'POST' }),
  /** Is the server holding this campaign, and which mesas could sit at it. */
  campaign: (secret: string, id: string) =>
    call<CampaignRegistration | { exists: false }>(`/api/dm/campaigns/${enc(id)}`, { secret }),
  /**
   * The group, registered once and then good for every campaign it plays. The
   * console keeps what comes back in `partidas/<mesa>/.pergamino/mesa.json`.
   */
  registerMesa: (secret: string, id: string, title: string, mesaId?: string) =>
    call<MesaRegistered>(`/api/dm/campaigns/${enc(id)}/mesas`, {
      secret,
      json: { title, ...(mesaId ? { id: mesaId } : {}) },
    }),
  /** One partida: this mesa at this campaign. Asking also puts it on the table. */
  partida: (secret: string, id: string, mesa: string) =>
    call<CampaignSummary>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}`, { secret }),
  remove: (secret: string, id: string) =>
    call<void>(`/api/dm/campaigns/${enc(id)}`, { secret, method: 'DELETE' }),
  prep: (secret: string, id: string, mesa: string, prep: PrepBody) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/prep`, {
      secret,
      method: 'PUT',
      json: prep,
    }),
  pnjPortrait: (secret: string, id: string, pnjId: string, blob: Blob) =>
    call<void>(`/api/dm/campaigns/${enc(id)}/portrait/pnj/${enc(pnjId)}`, {
      secret,
      method: 'PUT',
      body: blob,
      type: blob.type || 'image/jpeg',
    }),
  party: (secret: string, id: string, mesa: string) =>
    call<{ characters: Character[]; sheets: Record<string, Sheet> }>(
      `/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/party`,
      { secret },
    ),
  addCharacter: (secret: string, id: string, mesa: string, xml: string, player: string) =>
    call<{ id: string; rev: number }>(
      `/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/characters?player=${enc(player)}`,
      { secret, method: 'POST', body: xml, type: 'application/xml' },
    ),
  replaceSheet: (secret: string, id: string, mesa: string, pc: string, xml: string) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/characters/${enc(pc)}/sheet`, {
      secret,
      method: 'PUT',
      body: xml,
      type: 'application/xml',
    }),
  /** A level-up, or any edit: the fields that change and nothing else. */
  editSheet: (secret: string, id: string, mesa: string, pc: string, patch: SheetPatch) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/characters/${enc(pc)}/sheet`, {
      secret,
      method: 'PATCH',
      json: patch,
    }),
  removeCharacter: (secret: string, id: string, mesa: string, pc: string) =>
    call<void>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/characters/${enc(pc)}`, { secret, method: 'DELETE' }),
  rotateLink: (secret: string, id: string, mesa: string) =>
    call<{ link: string; url: string }>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/link/rotate`, {
      secret,
      method: 'POST',
    }),
  reset: (secret: string, id: string, mesa: string) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/reset`, { secret, method: 'POST' }),
  dispatch: (secret: string, id: string, mesa: string, action: unknown) =>
    call<DispatchResult>(`/api/dm/campaigns/${enc(id)}/mesas/${enc(mesa)}/actions`, { secret, json: { action } }),

  // --- a player's link ---
  pj: {
    campaign: (link: string) => call<CampaignPublic>(`/api/pj/${enc(link)}`),
    create: (link: string, xml: string, player: string) =>
      call<{ id: string; rev: number }>(`/api/pj/${enc(link)}/characters?player=${enc(player)}`, {
        method: 'POST',
        body: xml,
        type: 'application/xml',
      }),
    replaceSheet: (link: string, pc: string, xml: string) =>
      call<{ rev: number }>(`/api/pj/${enc(link)}/characters/${enc(pc)}/sheet`, {
        method: 'PUT',
        body: xml,
        type: 'application/xml',
      }),
    editSheet: (link: string, pc: string, patch: SheetPatch) =>
      call<{ rev: number }>(`/api/pj/${enc(link)}/characters/${enc(pc)}/sheet`, {
        method: 'PATCH',
        json: patch,
      }),
  },
}

const enc = encodeURIComponent

/** `ws(s)://<this host>/ws` — whichever this page was loaded over. */
export const wsUrl = (): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
