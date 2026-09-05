/**
 * The REST half of talking to the server, typed by `shared/protocol.ts`.
 *
 * Same origin always: in development Vite proxies `/api` and `/ws` to the
 * server, in production the server *is* the origin. `ApiError` carries the
 * server's code so the UI can say why in Spanish.
 */
import type {
  CampaignPublic,
  CampaignSummary,
  DispatchResult,
  ErrorCode,
  PrepBody,
  Registered,
} from '../../../shared/protocol.ts'
import type { Character } from '../../../shared/types.ts'
import type { SheetStats } from '../../../shared/vault/sheet.ts'

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
  campaign: (secret: string, id: string) =>
    call<CampaignSummary | { exists: false }>(`/api/dm/campaigns/${enc(id)}`, { secret }),
  remove: (secret: string, id: string) =>
    call<void>(`/api/dm/campaigns/${enc(id)}`, { secret, method: 'DELETE' }),
  prep: (secret: string, id: string, prep: PrepBody) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/prep`, { secret, method: 'PUT', json: prep }),
  pnjPortrait: (secret: string, id: string, pnjId: string, blob: Blob) =>
    call<void>(`/api/dm/campaigns/${enc(id)}/portrait/pnj/${enc(pnjId)}`, {
      secret,
      method: 'PUT',
      body: blob,
      type: blob.type || 'image/jpeg',
    }),
  party: (secret: string, id: string) =>
    call<{ characters: Character[]; sheets: Record<string, SheetStats> }>(
      `/api/dm/campaigns/${enc(id)}/party`,
      { secret },
    ),
  addCharacter: (secret: string, id: string, xml: string, player: string) =>
    call<{ id: string; rev: number }>(
      `/api/dm/campaigns/${enc(id)}/characters?player=${enc(player)}`,
      { secret, method: 'POST', body: xml, type: 'application/xml' },
    ),
  replaceSheet: (secret: string, id: string, pc: string, xml: string) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/characters/${enc(pc)}/sheet`, {
      secret,
      method: 'PUT',
      body: xml,
      type: 'application/xml',
    }),
  removeCharacter: (secret: string, id: string, pc: string) =>
    call<void>(`/api/dm/campaigns/${enc(id)}/characters/${enc(pc)}`, { secret, method: 'DELETE' }),
  rotateLink: (secret: string, id: string) =>
    call<{ link: string; url: string }>(`/api/dm/campaigns/${enc(id)}/link/rotate`, {
      secret,
      method: 'POST',
    }),
  reset: (secret: string, id: string) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/reset`, { secret, method: 'POST' }),
  dispatch: (secret: string, id: string, action: unknown) =>
    call<DispatchResult>(`/api/dm/campaigns/${enc(id)}/actions`, { secret, json: { action } }),

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
  },
}

const enc = encodeURIComponent

/** `ws(s)://<this host>/ws` — whichever this page was loaded over. */
export const wsUrl = (): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
