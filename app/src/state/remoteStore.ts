/**
 * The console's view of a campaign whose live state lives on the server.
 *
 * Nothing is reduced here. `dispatch` sends the action and the answer arrives
 * later as a whole state with a revision; the reducer runs once, on the
 * server, and this store holds what it produced. Prep — scenes, pnj, objects
 * — is the console's own, read from the folder, because the television is
 * still projected here and the panels still browse the campaign; the party
 * and its sheets come from the server, where the characters are.
 *
 * Non-optimistic on purpose. The round trip is milliseconds on the LAN, and
 * `reduce` mints ids and stamps times a client could not reproduce; applying
 * locally would mean reconciling on every echo for a difference nobody sees.
 */
import type { Action } from '../../../shared/actions.ts'
import type { ClientHello, ServerMsg } from '../../../shared/protocol.ts'
import type { Character, SessionState, TableView } from '../../../shared/types.ts'
import type { FrozenSummary } from '../../../shared/actions.ts'
import type { PcInfo, ProjectContext } from '../../../shared/session/project.ts'
import { LocalProjection, contextOf, pcInfoOf } from '../../../shared/session/projection.ts'
import type { CampaignData } from '../../../shared/vault/campaign.ts'
import { emptySession } from '../../../shared/vault/session.ts'
import type { SheetStats } from '../../../shared/vault/sheet.ts'
import { LiveSocket, type SocketStatus } from '../net/ws.ts'
import { wsUrl } from '../net/api.ts'

export type Connection = 'inactiva' | SocketStatus

const EMPTY_CAMPAIGN: CampaignData = { pnjs: [], objects: [], scenes: [] }

export class RemoteSessionStore {
  #campaignId = ''
  #title = ''
  #rev = 0
  #state: SessionState = emptySession()
  #campaign: CampaignData = EMPTY_CAMPAIGN
  #characters: Character[] = []
  #sheets = new Map<string, SheetStats>()
  #projection = new LocalProjection()
  #listeners = new Set<() => void>()
  #socket: LiveSocket | null = null
  #connection: Connection = 'inactiva'
  #synced = false
  /** The last refusal the server sent back, for the console to say out loud. */
  #lastReject: string | null = null

  get campaignId(): string {
    return this.#campaignId
  }
  get rev(): number {
    return this.#rev
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
  get sheets(): Map<string, SheetStats> {
    return this.#sheets
  }
  get ctx(): ProjectContext {
    return this.#projection.ctx
  }
  get connection(): Connection {
    return this.#connection
  }
  /** True once the first state has arrived on this connection. */
  get synced(): boolean {
    return this.#synced
  }
  get lastReject(): string | null {
    return this.#lastReject
  }

  /** The folder's side: what the reducer's context and the panels need. */
  setPrep(title: string, campaign: CampaignData): void {
    this.#title = title
    this.#campaign = campaign
    this.#rebuild()
    // Preparación is refused while a run is live, so nothing should be held —
    // but if it somehow is, the frame belongs to a campaign that just changed.
    this.#projection.release()
    this.#emit()
  }

  /** Open the socket; resolves on the first full state, rejects when refused. */
  connect(campaignId: string, token: string): Promise<void> {
    this.close()
    this.#campaignId = campaignId
    this.#synced = false
    return new Promise((resolve, reject) => {
      let settled = false
      const hello = (): ClientHello => ({
        type: 'hello',
        role: 'dm',
        token,
        campaign: campaignId,
      })
      this.#socket = new LiveSocket(
        wsUrl(),
        hello,
        (msg) => {
          this.#receive(msg)
          if (!settled && msg.type === 'dm') {
            settled = true
            resolve()
          }
        },
        (status) => {
          this.#connection = status
          if (status === 'sin-autorizar' && !settled) {
            settled = true
            reject(new Error('sin-autorizar'))
          }
          this.#emit()
        },
      )
      this.#socket.open()
    })
  }

  close(): void {
    this.#socket?.close()
    this.#socket = null
    this.#connection = 'inactiva'
    this.#synced = false
  }

  /** Fire and forget. Throws when there is no connection to fire on. */
  dispatch(action: Action): void {
    const id = Math.random().toString(36).slice(2, 10)
    if (!this.#socket?.send({ type: 'action', id, action })) {
      throw new Error('Sin conexión con el servidor: la acción no se ha enviado.')
    }
  }

  subscribe(fn: () => void): () => void {
    this.#listeners.add(fn)
    return () => this.#listeners.delete(fn)
  }

  tableView(): TableView {
    return this.#projection.tableView(this.#state)
  }

  frozenSummary(): FrozenSummary | null {
    return this.#projection.frozenSummary()
  }

  #receive(msg: ServerMsg): void {
    switch (msg.type) {
      case 'party':
        if (msg.characters) this.#characters = msg.characters
        if (msg.sheets) this.#sheets = new Map(Object.entries(msg.sheets))
        this.#rebuild()
        this.#emit()
        return
      case 'dm': {
        const prev = this.#state
        if (this.#synced) this.#projection.advance(prev, msg.state)
        this.#state = msg.state
        this.#rev = msg.rev
        this.#synced = true
        this.#socket?.saw(msg.rev)
        this.#emit()
        return
      }
      case 'reject':
        this.#lastReject = msg.reason
        this.#emit()
        return
      case 'error':
        this.#lastReject = msg.message
        this.#emit()
        return
      default:
        return
    }
  }

  #rebuild(): void {
    const pcs = new Map<string, PcInfo>()
    for (const c of this.#characters) pcs.set(c.id, pcInfoOf(c, this.#sheets.get(c.id)))
    this.#projection.setContext(
      contextOf(this.#title, this.#campaign.scenes, this.#campaign.pnjs, pcs),
    )
  }

  #emit(): void {
    for (const fn of this.#listeners) fn()
  }
}
