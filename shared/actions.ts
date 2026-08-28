/** Every mutation a client can ask the server to perform. */
import type { AudioState, FieldMode, Handout, HpReveal, Ref } from './types.ts'

export type Action =
  // --- Escena -------------------------------------------------------------
  | { type: 'scene/show'; sceneId: string | null }
  | { type: 'field/mode'; mode: FieldMode }
  | { type: 'field/paused'; paused: boolean }
  | { type: 'field/hud'; hud: boolean }
  | { type: 'field/map'; src: string | null }
  | { type: 'audio/set'; audio: AudioState | null }
  | { type: 'audio/volume'; volume: number }
  | { type: 'audio/playing'; playing: boolean }
  | { type: 'handout/show'; handout: Handout | null }
  // --- Revelado -----------------------------------------------------------
  | { type: 'reveal/set'; ref: Ref; on?: boolean; hp?: HpReveal }
  | { type: 'reveal/all'; on: boolean }
  // --- PNJ en la sesión ---------------------------------------------------
  | { type: 'npc/add'; pnjId: string; count: number }
  | { type: 'npc/remove'; id: string }
  | { type: 'npc/rename'; id: string; name: string }
  | { type: 'roster/load'; sceneId: string }
  // --- Estado vivo --------------------------------------------------------
  | { type: 'hp/damage'; ref: Ref; amount: number }
  | { type: 'hp/heal'; ref: Ref; amount: number }
  | { type: 'hp/set'; ref: Ref; hp: number }
  | { type: 'hp/temp'; ref: Ref; temp: number }
  | { type: 'hp/full'; ref: Ref }
  | { type: 'condition/toggle'; ref: Ref; condition: string }
  | { type: 'condition/clear'; ref: Ref }
  | { type: 'exh/set'; ref: Ref; value: number }
  | { type: 'death/mark'; ref: Ref; outcome: 'ok' | 'fail' }
  | { type: 'death/reset'; ref: Ref }
  | { type: 'live/note'; ref: Ref; note: string }
  // --- Combate ------------------------------------------------------------
  | { type: 'encounter/start'; members: Ref[] }
  | { type: 'encounter/end' }
  | { type: 'encounter/members'; members: Ref[] }
  | { type: 'encounter/init'; ref: Ref; value: number }
  | { type: 'encounter/roll'; refs?: Ref[] }
  | { type: 'encounter/advance'; delta: 1 | -1 }
  // --- Tablero ------------------------------------------------------------
  | { type: 'token/move'; ref: Ref; x: number; y: number }
  | { type: 'token/remove'; ref: Ref }
  | { type: 'token/placeAll' }
  | { type: 'field/grid'; cols: number; rows: number }
  // --- Objetos y descansos ------------------------------------------------
  | { type: 'object/give'; ref: Ref; objectId: string }
  | { type: 'object/take'; ref: Ref; objectId: string }
  /**
   * How many charges the object has left, stated the way `slots/set` states a
   * spell level: a count, not a decrement. Charges belong to the object, not
   * to whoever is holding it, so there is no `ref` here — the old
   * `object/use` carried one and the reducer never read it.
   */
  | { type: 'object/charges'; objectId: string; uses: number }
  | { type: 'object/refill'; objectId: string }
  | { type: 'loot/transfer'; from: Ref; to: Ref }
  | { type: 'gold/set'; ref: Ref; gold: number }
  | { type: 'inventory/set'; ref: Ref; text: string }
  | { type: 'slots/set'; ref: Ref; level: string; spent: number }
  | { type: 'rest/short'; refs: Ref[] }
  | { type: 'rest/long'; refs: Ref[] }
  // --- Bitácora -----------------------------------------------------------
  | { type: 'log/note'; text: string }

export type ActionType = Action['type']

/** Messages the server pushes to a window. */
/** What the table screen is holding while sync is paused. */
export interface FrozenSummary {
  scene: string | null
  handout: boolean
}

export type ServerMessage =
  | { type: 'hello'; audience: Audience; mesa: string }
  | {
      type: 'dm'
      state: import('./types.ts').SessionState
      frozen: FrozenSummary | null
    }
  | { type: 'table'; view: import('./types.ts').TableView }
  | { type: 'error'; message: string }

export type Audience = 'dm' | 'table'

/** Messages a window sends to the server. */
export type ClientMessage =
  | { type: 'action'; action: Action }
  | { type: 'subscribe'; audience: Audience }
