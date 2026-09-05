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
  token?: string | null
  json?: unknown
  body?: BodyInit
  type?: string
  timeoutMs?: number
}

async function call<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
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
  whoami: (token: string) => call<{ ok: true }>('/api/dm/whoami', { token }),
  register: (token: string, title: string) =>
    call<Registered>('/api/dm/campaigns', { token, json: { title } }),
  reregister: (token: string, id: string, title: string) =>
    call<Registered>(`/api/dm/campaigns/${enc(id)}`, { token, method: 'PUT', json: { title } }),
  campaign: (token: string, id: string) =>
    call<CampaignSummary | { exists: false }>(`/api/dm/campaigns/${enc(id)}`, { token }),
  remove: (token: string, id: string) =>
    call<void>(`/api/dm/campaigns/${enc(id)}`, { token, method: 'DELETE' }),
  prep: (token: string, id: string, prep: PrepBody) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/prep`, { token, method: 'PUT', json: prep }),
  pnjPortrait: (token: string, id: string, pnjId: string, blob: Blob) =>
    call<void>(`/api/dm/campaigns/${enc(id)}/portrait/pnj/${enc(pnjId)}`, {
      token,
      method: 'PUT',
      body: blob,
      type: blob.type || 'image/jpeg',
    }),
  party: (token: string, id: string) =>
    call<{ characters: Character[]; sheets: Record<string, SheetStats> }>(
      `/api/dm/campaigns/${enc(id)}/party`,
      { token },
    ),
  addCharacter: (token: string, id: string, xml: string, player: string) =>
    call<{ id: string; rev: number }>(
      `/api/dm/campaigns/${enc(id)}/characters?player=${enc(player)}`,
      { token, method: 'POST', body: xml, type: 'application/xml' },
    ),
  replaceSheet: (token: string, id: string, pc: string, xml: string) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/characters/${enc(pc)}/sheet`, {
      token,
      method: 'PUT',
      body: xml,
      type: 'application/xml',
    }),
  removeCharacter: (token: string, id: string, pc: string) =>
    call<void>(`/api/dm/campaigns/${enc(id)}/characters/${enc(pc)}`, { token, method: 'DELETE' }),
  rotateLink: (token: string, id: string) =>
    call<{ link: string; url: string }>(`/api/dm/campaigns/${enc(id)}/link/rotate`, {
      token,
      method: 'POST',
    }),
  reset: (token: string, id: string) =>
    call<{ rev: number }>(`/api/dm/campaigns/${enc(id)}/reset`, { token, method: 'POST' }),
  dispatch: (token: string, id: string, action: unknown) =>
    call<DispatchResult>(`/api/dm/campaigns/${enc(id)}/actions`, { token, json: { action } }),

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
