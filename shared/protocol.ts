/**
 * What crosses the wire between the server and its three kinds of client —
 * the console, a player's phone, and (later) the television.
 *
 * Both sides import this file; nothing here is a class or a function. Prep
 * that reaches the server is the *published* shape: a `Pnj` without its
 * `lead`, an object without its `description`, a scene without its `note` —
 * the statblock and the rules, never the prose. Characters are not published
 * at all: they are created on the server from an uploaded `-fc5.xml`.
 */
import type { Action } from './actions.ts'
import type { PlayerView } from './session/player.ts'
import type { Character, GameObject, Pnj, Scene, SessionState, TableView } from './types.ts'
import type { Sheet } from './character.ts'

/**
 * An edit to a character: the fields that change, and only those.
 *
 * Applied as a **shallow merge** — a key that is present replaces what was
 * there, a key that is absent is left alone, and an array or a nested object
 * arrives whole rather than being merged item by item. Levelling up is one of
 * these: `{ level, hpMax, spellcasting, traits, skills }` and nothing else.
 */
export type SheetPatch = Partial<Sheet>

// --- who is asking -----------------------------------------------------------

/** The DM holds the token; a player holds a link and picked a character. */
export type Actor = { kind: 'dm' } | { kind: 'pc'; pcId: string }

// --- prep, as published ------------------------------------------------------

export type PublishedPnj = Omit<Pnj, 'lead'>
export type PublishedObject = Omit<GameObject, 'description'>
export type PublishedScene = Omit<Scene, 'note'>

export interface PrepBody {
  pnjs: PublishedPnj[]
  objects: PublishedObject[]
  scenes: PublishedScene[]
}

// --- campaigns ---------------------------------------------------------------

export interface RegisterBody {
  title: string
}

/**
 * What registering (or re-registering) a campaign hands back. No link: that
 * belongs to the mesa now, and comes back from registering one.
 */
export interface Registered {
  id: string
  /**
   * The DM's credential for this campaign, and nothing else. The console
   * writes it to `.pergamino/campaign.json`: holding the folder is being the
   * DM, and no server-wide secret exists.
   */
  dmSecret: string
}

/**
 * What registering a mesa hands back. The link is the group's and outlives any
 * one campaign; the console keeps the id in `partidas/<mesa>/.pergamino/`.
 */
export interface MesaRegistered {
  id: string
  title: string
  /** The players' link secret — separate from `id`, so it can be rotated. */
  link: string
  /** The full URL to hand out, built from the server's own public address. */
  url: string
}

export interface PartyMember {
  id: string
  name: string
  player: string
  hasPortrait: boolean
}

/**
 * What the DM sees of a campaign before picking a mesa: whether the server
 * knows it, and which groups are around to sit at it.
 */
export interface CampaignRegistration {
  exists: true
  id: string
  title: string
  /**
   * `playing` marks the group that has this campaign on the table right now;
   * `party` is how many people it has, which is what tells a real group from
   * an empty shell left over by an upgrade.
   */
  mesas: { id: string; title: string; playing: boolean; party: number }[]
}

/** The DM's view of one partida — a mesa at a campaign. */
export interface CampaignSummary {
  exists: true
  id: string
  title: string
  /** The group at this campaign. The party and the link are its, not the campaign's. */
  mesa: { id: string; title: string }
  link: string
  url: string
  rev: number
  party: PartyMember[]
  publishedAt: number | null
}

/** What a link alone reveals: enough to pick who you are. */
export interface CampaignPublic {
  title: string
  party: { id: string; name: string; player: string; portrait: string | null }[]
}

// --- state -------------------------------------------------------------------

export interface StateSnapshot {
  rev: number
  state: SessionState
}

export interface PlayerSnapshot {
  rev: number
  view: PlayerView
}

export interface ActionRequest {
  action: Action
  /** Refuse unless the server is still at this revision — for absolute setters. */
  expectRev?: number
}

export interface DispatchResult {
  rev: number
  /** False when the reducer left the state as it was. */
  changed: boolean
}

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'stale'
  | 'bad-request'
  | 'bad-sheet'

export interface ApiError {
  error: string
  code: ErrorCode
}

// --- WebSocket ---------------------------------------------------------------

export type Role = 'dm' | 'pc' | 'tv'

/** The first message on a socket. `since` is the last revision the client saw. */
export type ClientHello =
  | { type: 'hello'; role: 'dm'; secret: string; campaign: string; mesa: string; since?: number }
  | { type: 'hello'; role: 'pc'; link: string; pc: string; since?: number }
  | { type: 'hello'; role: 'tv'; link: string; since?: number }

export type ClientMsg =
  | ClientHello
  | { type: 'action'; id: string; action: Action; expectRev?: number }
  | { type: 'ping' }

export type ServerMsg =
  | { type: 'welcome'; role: Role; campaign: string; rev: number }
  | { type: 'dm'; rev: number; state: SessionState }
  | { type: 'pc'; rev: number; view: PlayerView }
  | { type: 'tv'; rev: number; view: TableView }
  /**
   * The party as it stands — sent on hello and whenever a character is added,
   * replaced or removed. The DM gets everyone's sheet; a phone gets the
   * signal only and refetches what its role may see.
   */
  | { type: 'party'; rev: number; characters?: Character[]; sheets?: Record<string, Sheet> }
  | { type: 'ack'; id: string; rev: number; changed: boolean }
  | { type: 'reject'; id: string; code: ErrorCode; reason: string }
  | { type: 'pong' }
  /** Fatal for this socket; the server closes after sending it. */
  | { type: 'error'; message: string }
