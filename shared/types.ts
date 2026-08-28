/** Domain types shared by the server and both browser windows. */
import type { Template } from './grid.ts'

export type { Template } from './grid.ts'

/** A participant reference: `pc:<characterId>` or `npc:<runtimeId>`. */
export type Ref = `pc:${string}` | `npc:${string}`

export type RefKind = 'pc' | 'npc'

export const refKind = (ref: Ref): RefKind => (ref.startsWith('pc:') ? 'pc' : 'npc')
export const refId = (ref: Ref): string => ref.slice(ref.indexOf(':') + 1)
export const makeRef = (kind: RefKind, id: string): Ref => `${kind}:${id}` as Ref

// ---------------------------------------------------------------------------
// Prep data — read from the vault, never written during play
// ---------------------------------------------------------------------------

export interface Portrait {
  src: string | null
  /** Inline data: URI. Can be ~100 KB; kept out of the table projection. */
  stamp: string | null
}

export interface Ability {
  id: string
  name: string
  desc: string
}

/** `monsters/*.json` */
export interface Monster {
  id: string
  name: string
  tag: string | null
  ac: number
  hpMax: number
  initMod: number
  speed: number | null
  note: string
  portrait: Portrait | null
  abilities: Ability[]
  file: string
}

/** `objects/*.json` */
export interface GameObject {
  id: string
  name: string
  description: string
  /** Total charges, when the item is consumable. */
  usos?: number
  mods: { ac?: number }
  effects: string[]
  file: string
}

/** An entry in a scene's roster: which monster, and how many copies. */
export interface RosterEntry {
  monsterId: string
  count: number
}

/** `scenarios/*.json` → `.scene` */
export interface Scene {
  id: string
  name: string
  art: { src: string | null; stamp: string | null } | null
  audio: string | null
  roster: RosterEntry[]
  grid: { cols: number; rows?: number } | null
  note: string
}

/** `runs/<mesa>/players/*.json` → `.character` */
export interface Character {
  id: string
  name: string
  player: string
  portrait: Portrait | null
  species: string | null
  class: string | null
  background: string | null
  size: string | null
  buy: Record<string, number>
  boosts: Record<string, number>
  spells: { cantrips: string[]; level1: string[] } | Record<string, string[]>
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Live state — `runs/<mesa>/session.json` v4
// ---------------------------------------------------------------------------

export const SESSION_VERSION = 4

export interface DeathSaves {
  ok: number
  fail: number
}

/** Live state carried by every combatant, PC or NPC. */
export interface LiveState {
  hp: number | null
  temp: number
  conditions: string[]
  exh: number
  death: DeathSaves
  note: string
  gold: number
  inventory: string
  /** Ids of `objects/*.json` currently held. */
  objects: string[]
  /** Spell slots spent, by level: `{ "1": 2 }`. */
  spent: Record<string, number>
}

/**
 * A monster instantiated into the session: prep data + a runtime id + live state.
 *
 * `Monster.note` (prep text) and `LiveState.note` (the DM's scratch note for
 * this particular creature) are different things that the vault's own schema
 * collapses into one field, losing the prep note on instantiation. Here `note`
 * is the live one; the prep note stays resolvable through `file`.
 */
export interface Npc extends Omit<Monster, 'note'>, LiveState {}

export interface Encounter {
  on: boolean
  round: number
  activeRef: Ref | null
  members: Ref[]
  init: Record<string, number>
}

export type HpReveal = 'none' | 'bar' | 'exact'

export interface RevealState {
  on: boolean
  hp: HpReveal
}

export interface Token {
  x: number
  y: number
}

export type FieldMode = 'escena' | 'tablero'

export interface Handout {
  kind: 'image' | 'pdf'
  src: string
  page?: number
}

export interface AudioState {
  src: string
  volume: number
  loop: boolean
  playing: boolean
}

export interface Field {
  mode: FieldMode
  hud: boolean
  /**
   * Sync paused. The table screen holds the last frame it was sent while the
   * DM works ahead — placing tokens, loading a roster, painting fog — so the
   * players go on seeing an ordinary scene instead of a curtain that announces
   * something is being prepared.
   */
  paused: boolean
  cols: number
  rows: number
  sceneId: string | null
  map: { src: string } | null
  audio: AudioState | null
  tokens: Record<string, Token>
  /** Keyed by `Ref` — normalised from bare npc ids on migration. */
  reveal: Record<string, RevealState>
  benched: Ref[]
  fog: { on: boolean; revealed: number[] }
  handout: Handout | null
  /** Area-of-effect markers, visible on both screens. */
  templates: Template[]
}

export type LogKind =
  | 'scene'
  | 'damage'
  | 'heal'
  | 'death'
  | 'loot'
  | 'condition'
  | 'encounter'
  | 'rest'
  | 'note'

export interface LogEntry {
  t: number
  kind: LogKind
  text: string
}

/**
 * Remaining charges of a consumable, tracked per *object*, not per holder:
 * the Lágrima de Milia's five uses are "acumulados a lo largo de toda la
 * aventura", so passing it on does not refill it.
 */
export interface ObjectState {
  uses: number
  /** Set when the last charge was spent — "el vidrio se raja". */
  spent: boolean
}

export interface SessionState {
  version: number
  play: Record<string, LiveState>
  /** Keyed by the id in `objects/*.json`. */
  objects: Record<string, ObjectState>
  playerFiles: Record<string, string>
  npcs: Npc[]
  encounter: Encounter
  field: Field
  log: LogEntry[]
}

// ---------------------------------------------------------------------------
// Projections — what each window is allowed to see
// ---------------------------------------------------------------------------

/** A combatant as the table screen sees it. Secrets are absent, not hidden. */
export interface TableCombatant {
  ref: Ref
  name: string
  portrait: string | null
  /** Present only when the reveal mode allows it. */
  hp?: number
  hpMax?: number
  /** 0..1, when reveal mode is `bar`. */
  hpFraction?: number
  temp?: number
  conditions: string[]
  dead: boolean
}

export interface TableView {
  /** Campaign display name, shown when there is nothing else on screen. */
  title: string
  mode: FieldMode
  hud: boolean
  scene: { id: string; name: string; artUrl: string | null } | null
  map: { src: string } | null
  audio: AudioState | null
  handout: Handout | null
  grid: { cols: number; rows: number } | null
  fog: { on: boolean; revealed: number[] }
  templates: Template[]
  tokens: Record<string, Token>
  combatants: TableCombatant[]
  round: number
  activeRef: Ref | null
}
