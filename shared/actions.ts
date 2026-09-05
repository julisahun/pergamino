/** Every mutation a client can ask the server to perform. */
import type { AttackKind } from './combat/attacks.ts'
import type { AudioState, FieldMode, Handout, HpReveal, NameReveal, Ref } from './types.ts'

/**
 * What one action did to one of the people it was aimed at.
 *
 * The dice are already thrown. They are thrown in the console — by the DM's
 * hand or by its die button, which come to the same thing here — because
 * `reduce` is deterministic and the suite drives it without stubbing a
 * generator. What crosses into the reducer is an outcome, not a chance.
 */
export interface AttackTarget {
  ref: Ref
  /** The d20 face, before the modifier. Null when nothing was rolled to land. */
  roll: number | null
  /**
   * Whether it landed — and for a save, whether the target *failed* it, which
   * is the same statement about the same event. The console suggests it from
   * the target's AC and the DM can overrule it: a wizard with Escudo up has an
   * AC no sheet knows about.
   *
   * It does not decide the damage. `amount` is already what this target takes,
   * a made save's half included.
   */
  hit: boolean
  crit: boolean
  /** What the *target* rolled against the DC, for a save. */
  save: number | null
  /** Hit points off, or on for a heal. Already halved for a made save. */
  amount: number
}

/**
 * The resource an action costs, when it costs one — a spell level.
 *
 * Not a charged object, deliberately. Both of the ones the campaign has say in
 * their own prose that they are not actions: the Lágrima de Milia is *«pasivo:
 * no cuesta acción, no hay que activarla ni declarar que se usa»* and the Óleo
 * de Santa Milia is *«sin tirada, sin salvación, no falla»*. Charges are spent
 * where they are tracked, in `Charges.tsx`.
 */
export type AttackSpend = { level: string }

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
  | { type: 'reveal/set'; ref: Ref; on?: boolean; hp?: HpReveal; name?: NameReveal }
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
  /**
   * Who is in the fight and what they rolled. The initiatives come with the
   * action because the DM states them in one pass before anything starts —
   * nothing is rolled on their behalf.
   */
  | { type: 'encounter/start'; members: Ref[]; init?: Record<string, number> }
  | { type: 'encounter/end' }
  | { type: 'encounter/members'; members: Ref[] }
  | { type: 'encounter/init'; ref: Ref; value: number }
  | { type: 'encounter/advance'; delta: 1 | -1 }
  /**
   * One resolved action, applied in a single step.
   *
   * It exists rather than the console firing `hp/damage` per target and a
   * `slots/set` beside it, because those would be three entries in the
   * bitácora that do not say they were the same swing, and a half-applied
   * fireball if anything went wrong between them. The reducer still reaches
   * the same helpers `hp/damage` does, so temporary hit points absorb and a PC
   * dropped to zero still goes Inconsciente.
   */
  | {
      type: 'attack/resolve'
      /** Who acted. */
      ref: Ref
      /** What they used — the ability, weapon or spell, for the bitácora. */
      name: string
      kind: AttackKind
      /** The attacker's bonus, so a line can read `15 +3 = 18`. */
      mod: number | null
      /** The DC a save was against. */
      dc: number | null
      targets: AttackTarget[]
      spend?: AttackSpend
    }
  // --- Tablero ------------------------------------------------------------
  | { type: 'token/move'; ref: Ref; x: number; y: number }
  | { type: 'token/remove'; ref: Ref }
  /** One combatant onto the board; without a square, the first free one. */
  | { type: 'token/place'; ref: Ref; x?: number; y?: number }
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
