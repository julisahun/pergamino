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
import type { SheetStats } from './vault/sheet.ts'

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

/** What registering (or re-registering) a campaign hands back. */
export interface Registered {
  id: string
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

/** The DM's view of a campaign row. */
export interface CampaignSummary {
  exists: true
  id: string
  title: string
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
  | { type: 'hello'; role: 'dm'; token: string; campaign: string; since?: number }
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
  | { type: 'party'; rev: number; characters?: Character[]; sheets?: Record<string, SheetStats> }
  | { type: 'ack'; id: string; rev: number; changed: boolean }
  | { type: 'reject'; id: string; code: ErrorCode; reason: string }
  | { type: 'pong' }
  /** Fatal for this socket; the server closes after sending it. */
  | { type: 'error'; message: string }
