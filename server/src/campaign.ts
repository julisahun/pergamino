/**
 * One **partida**, live: a mesa sitting at a campaign. The prep and the DM's
 * credential come from the campaign; the party, the players' link and what
 * each PJ carries come from the mesa, because the group outlives the
 * adventure. The state on the table belongs to the pair.
 *
 * This is where `reduce` runs now. The reducer is the same pure function the
 * tests drive and the console used to run in the tab; what changed is who
 * owns the state it produces. Every change goes through `#commit`, which
 * writes the row, bumps the revision and tells every socket — so the console,
 * the phones and (later) the television all see the same `rev` and cannot
 * disagree about what happened.
 */
import { randomUUID } from 'node:crypto'
import type { Action } from '../../shared/actions.ts'
import type {
  Actor,
  CampaignPublic,
  CampaignSummary,
  DispatchResult,
  PrepBody,
  Role,
  ServerMsg,
} from '../../shared/protocol.ts'
import { allowed } from '../../shared/session/allow.ts'
import { projectPlayer, type PlayerContext, type PlayerView } from '../../shared/session/player.ts'
import type { PcInfo } from '../../shared/session/project.ts'
import { LocalProjection, contextOf, pcInfoOf } from '../../shared/session/projection.ts'
import { reduce } from '../../shared/session/reducer.ts'
import { seatParty } from '../../shared/session/seat.ts'
import type { Character, SessionState, TableView } from '../../shared/types.ts'
import { emptySession } from '../../shared/vault/session.ts'
import { isFc5Sheet, parseSheet, type SheetStats } from '../../shared/vault/sheet.ts'
import { badSheet, forbidden, notFound, stale } from './errors.ts'
import { randomSecret } from './auth.ts'
import { Store, toCharacter, type CampaignRow, type MesaRow } from './store.ts'

export interface Subscriber {
  role: Role
  pcId?: string
  send: (msg: ServerMsg) => void
}

const EMPTY_PREP: PrepBody = { pnjs: [], objects: [], scenes: [] }
const MAX_XML = 1024 * 1024

export class CampaignSession {
  /** The campaign. */
  readonly id: string
  /** The mesa playing it. Together they name the partida. */
  readonly mesaId: string
  #row: CampaignRow
  #mesa: MesaRow
  #rev: number
  #state: SessionState
  #characters: Character[] = []
  #sheets = new Map<string, SheetStats>()
  #prep: PrepBody = EMPTY_PREP
  #publishedAt: number | null = null
  #projection = new LocalProjection()
  #subs = new Set<Subscriber>()
  readonly #store: Store
  readonly #now: () => number

  private constructor(
    store: Store,
    row: CampaignRow,
    mesa: MesaRow,
    now: () => number = Date.now,
  ) {
    this.#store = store
    this.#now = now
    this.id = row.id
    this.mesaId = mesa.id
    this.#row = row
    this.#mesa = mesa
    const saved = store.partida(row.id, mesa.id)
    this.#rev = saved?.rev ?? 0
    // A mesa that has never played this campaign still arrives carrying what
    // it earned in the last one: an empty table, and the same people on it.
    this.#state = saved?.state ?? { ...emptySession(), play: store.play(mesa.id) }
    const prep = store.prep(row.id)
    if (prep) {
      this.#prep = prep.prep
      this.#publishedAt = prep.publishedAt
    }
    this.#loadParty()
    // A character added while the server was down is impossible, but a state
    // that predates one is not — the row's live layer exists from here on.
    this.#state = this.#seated(this.#state)
    this.#rebuild()
  }

  private get store(): Store {
    return this.#store
  }
  private get now(): () => number {
    return this.#now
  }

  static load(
    store: Store,
    id: string,
    mesaId: string,
    now?: () => number,
  ): CampaignSession | null {
    const row = store.campaign(id)
    const mesa = store.mesa(mesaId)
    return row && mesa ? new CampaignSession(store, row, mesa, now) : null
  }

  // --- reading ------------------------------------------------------------------

  get rev(): number {
    return this.#rev
  }
  get state(): SessionState {
    return this.#state
  }
  get title(): string {
    return this.#row.title
  }
  /** The players' link. It is the mesa's, so it survives changing campaign. */
  get link(): string {
    return this.#mesa.link_secret
  }
  get mesaTitle(): string {
    return this.#mesa.title
  }
  get dmSecret(): string {
    return this.#row.dm_secret
  }
  get characters(): Character[] {
    return this.#characters
  }
  get sheets(): Map<string, SheetStats> {
    return this.#sheets
  }
  get prep(): PrepBody {
    return this.#prep
  }

  summary(publicUrl: string): CampaignSummary {
    return {
      exists: true,
      id: this.id,
      title: this.#row.title,
      mesa: { id: this.#mesa.id, title: this.#mesa.title },
      link: this.#mesa.link_secret,
      url: linkUrl(publicUrl, this.#mesa.link_secret),
      rev: this.#rev,
      party: this.#characters.map((c) => ({
        id: c.id,
        name: c.name,
        player: c.player,
        hasPortrait: c.portrait !== null,
      })),
      publishedAt: this.#publishedAt,
    }
  }

  /** What the link alone reveals. */
  public(): CampaignPublic {
    return {
      title: this.#row.title,
      party: this.#characters.map((c) => ({
        id: c.id,
        name: c.name,
        player: c.player,
        portrait: c.portrait ? `/api/portrait/pc/${encodeURIComponent(c.id)}` : null,
      })),
    }
  }

  tableView(): TableView {
    return this.#projection.tableView(this.#state)
  }

  playerView(pcId: string): PlayerView | null {
    return projectPlayer(this.#state, this.#playerCtx(), pcId)
  }

  hasCharacter(pcId: string): boolean {
    return this.#characters.some((c) => c.id === pcId)
  }

  // --- changing -----------------------------------------------------------------

  /** Apply one action. Refused before `reduce` when the actor may not. */
  dispatch(action: Action, actor: Actor, expectRev?: number): DispatchResult {
    const verdict = allowed(actor, action, this.#state)
    if (verdict !== true) throw forbidden(verdict)
    if (expectRev !== undefined && expectRev !== this.#rev) throw stale()
    const ctx = this.#projection.ctx
    const { state } = reduce(this.#state, action, this.now(), {
      pnj: (id) => this.#prep.pnjs.find((p) => p.id === id) as never,
      object: (id) => this.#prep.objects.find((o) => o.id === id) as never,
      scene: (id) => this.#prep.scenes.find((s) => s.id === id),
      pcName: (id) => ctx.pcs.get(id)?.name,
      pcMaxHp: (id) => ctx.pcs.get(id)?.hpMax ?? null,
      pcInitMod: (id) => ctx.pcs.get(id)?.initMod ?? null,
      newId: () => randomUUID().slice(0, 12),
    })
    if (state === this.#state) return { rev: this.#rev, changed: false }
    this.#projection.advance(this.#state, state)
    this.#commit(state, actor.kind === 'dm' ? 'dm' : `pc:${actor.pcId}`, action)
    return { rev: this.#rev, changed: true }
  }

  /**
   * The console published prep. Everything else stays as it was.
   *
   * Prep belongs to the campaign, not to this partida, so the row is written
   * by the registry and handed to **every** mesa sitting at that campaign —
   * otherwise the second table would go on playing yesterday's statblocks.
   */
  adoptPrep(prep: PrepBody, publishedAt: number): number {
    this.#prep = prep
    this.#publishedAt = publishedAt
    this.#rebuild()
    return this.#bump('system:prep')
  }

  /** A player (or the DM) uploaded a sheet: a new row, seated at full HP. */
  addCharacter(xml: string, player: string): { id: string; rev: number } {
    const sheet = this.#parse(xml)
    const id = randomUUID().slice(0, 8)
    const now = this.now()
    this.store.insertCharacter({
      id,
      mesa: this.mesaId,
      name: sheet.name ?? player ?? id,
      player: player.trim().slice(0, 80),
      sheet_xml: xml,
      created_at: now,
      updated_at: now,
    })
    this.#loadParty()
    this.#rebuild()
    const rev = this.#bump('system:character', this.#seated(this.#state), { id })
    return { id, rev }
  }

  /** A level-up: the sheet changes, the live layer is kept. */
  replaceSheet(id: string, xml: string): number {
    if (!this.hasCharacter(id)) throw notFound('Ese personaje no está en la campaña')
    const sheet = this.#parse(xml)
    this.store.setSheet(id, xml, sheet.name ?? id, this.now())
    this.#loadParty()
    this.#rebuild()
    // HP above the new maximum is capped; anything else the player typed stays.
    const live = this.#state.play[id]
    const cap = sheet.hpMax
    const state =
      live && cap !== null && live.hp !== null && live.hp > cap
        ? { ...this.#state, play: { ...this.#state.play, [id]: { ...live, hp: cap } } }
        : this.#state
    return this.#bump('system:sheet', this.#seated(state), { id })
  }

  setPortrait(id: string, mime: string, bytes: Uint8Array): number {
    if (!this.hasCharacter(id)) throw notFound('Ese personaje no está en la campaña')
    this.store.setPortrait(id, mime, bytes, this.now())
    this.#loadParty()
    this.#rebuild()
    return this.#bump('system:portrait', this.#state, { id })
  }

  /** Out of the campaign: the row, the live layer, the ficha and the turn. */
  removeCharacter(id: string): number {
    if (!this.hasCharacter(id)) throw notFound('Ese personaje no está en la campaña')
    this.store.deleteCharacter(id)
    this.#loadParty()
    this.#rebuild()
    const ref = `pc:${id}`
    const { [id]: _live, ...play } = this.#state.play
    const { [ref]: _token, ...tokens } = this.#state.field.tokens
    const { [ref]: _reveal, ...reveal } = this.#state.field.reveal
    const { encounter } = this.#state
    const members = encounter.members.filter((m) => m !== ref)
    const { [ref]: _init, ...init } = encounter.init
    const state: SessionState = {
      ...this.#state,
      play,
      field: { ...this.#state.field, tokens, reveal },
      encounter: {
        ...encounter,
        members,
        init,
        activeRef: encounter.activeRef === ref ? null : encounter.activeRef,
      },
    }
    return this.#bump('system:remove', state, { id })
  }

  /**
   * Nueva sesión: the table is put away and laid out again.
   *
   * What is cleared is the table — the NPCs on it, the encounter, the scene,
   * the log. **What the party carries is not touched**: oro, inventario, PG y
   * espacios are the people's, and a new session is not a thing that takes
   * them away. That is also why they are still there when this mesa opens the
   * next campaign.
   */
  reset(): number {
    this.store.archivePartida(this.id, this.mesaId, this.now())
    this.#projection.release()
    return this.#bump('system:reset', this.#seated({ ...emptySession(), play: this.#state.play }))
  }

  setTitle(title: string): void {
    this.store.setTitle(this.id, title)
    this.#row = { ...this.#row, title }
    this.#rebuild()
  }

  /** A new players' link. It belongs to the mesa, so every campaign it plays moves with it. */
  rotateLink(): string {
    const secret = randomSecret()
    this.store.setMesaLink(this.mesaId, secret)
    this.#mesa = { ...this.#mesa, link_secret: secret }
    return secret
  }

  /** Point the mesa at this campaign, which is where a phone with its link lands. */
  takeTheTable(): void {
    if (this.#mesa.playing === this.id) return
    this.store.setPlaying(this.mesaId, this.id)
    this.#mesa = { ...this.#mesa, playing: this.id }
  }

  /** The registry rotated this campaign's DM secret; take the new one. */
  adoptDmSecret(secret: string): void {
    this.#row = { ...this.#row, dm_secret: secret }
  }

  // --- listening ----------------------------------------------------------------

  subscribe(sub: Subscriber): () => void {
    this.#subs.add(sub)
    return () => this.#subs.delete(sub)
  }

  /** The party message for a role, with the DM's payload where it applies. */
  partyMessage(role: Role): ServerMsg {
    if (role !== 'dm') return { type: 'party', rev: this.#rev }
    return {
      type: 'party',
      rev: this.#rev,
      characters: this.#characters,
      sheets: Object.fromEntries(this.#sheets),
    }
  }

  /** The state message for one subscriber, in the shape its role may see. */
  snapshot(sub: Pick<Subscriber, 'role' | 'pcId'>): ServerMsg | null {
    if (sub.role === 'dm') return { type: 'dm', rev: this.#rev, state: this.#state }
    if (sub.role === 'tv') return { type: 'tv', rev: this.#rev, view: this.tableView() }
    const view = sub.pcId ? this.playerView(sub.pcId) : null
    return view ? { type: 'pc', rev: this.#rev, view } : null
  }

  // --- internals ----------------------------------------------------------------

  #parse(xml: string): SheetStats {
    if (xml.length > MAX_XML) throw badSheet('La ficha es demasiado grande')
    if (!isFc5Sheet(xml)) throw badSheet('Eso no es una ficha de Fight Club 5')
    return parseSheet(xml)
  }

  #loadParty(): void {
    const rows = this.store.characters(this.mesaId)
    this.#characters = rows.map(toCharacter)
    this.#sheets = new Map(rows.map((r) => [r.id, parseSheet(r.sheet_xml)]))
  }

  #seated(state: SessionState): SessionState {
    return seatParty(
      state,
      this.#characters.map((c) => ({ id: c.id, hpMax: this.#sheets.get(c.id)?.hpMax ?? null })),
    )
  }

  #rebuild(): void {
    const pcs = new Map<string, PcInfo>()
    for (const c of this.#characters) pcs.set(c.id, pcInfoOf(c, this.#sheets.get(c.id)))
    this.#projection.setContext(contextOf(this.#row.title, this.#prep.scenes, this.#prep.pnjs, pcs))
  }

  #playerCtx(): PlayerContext {
    return {
      ...this.#projection.ctx,
      campaignId: this.id,
      sheets: this.#sheets,
      objects: new Map(this.#prep.objects.map((o) => [o.id, o])),
    }
  }

  /** A change that is not an action: prep, a character, a reset. */
  #bump(what: string, state: SessionState = this.#state, detail: unknown = {}): number {
    this.#commit(state, what, { type: what, ...(detail as object) }, true)
    return this.#rev
  }

  #commit(state: SessionState, actor: string, action: unknown, party = false): void {
    this.#rev++
    this.#state = state
    this.store.savePartida(this.id, this.mesaId, this.#rev, state, actor, action, this.now())
    for (const sub of this.#subs) {
      try {
        if (party) sub.send(this.partyMessage(sub.role))
        const snap = this.snapshot(sub)
        if (snap) sub.send(snap)
      } catch {
        /* a socket that died between two messages; the ws layer drops it */
      }
    }
  }
}

export const linkUrl = (publicUrl: string, secret: string): string => `${publicUrl}/pj#${secret}`
