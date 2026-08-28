/**
 * Builds the payload each window receives.
 *
 * The table screen is driven by a *separate* object, not by CSS on the DM
 * state: an unrevealed NPC is absent from `TableView`, not hidden in it. Stat
 * blocks, DM notes and base64 portraits never cross this boundary.
 */
import type {
  Pnj,
  Ref,
  RevealState,
  Scene,
  SessionState,
  TableCombatant,
  TableView,
} from '../types.ts'
import { makeRef } from '../types.ts'
import { resolveNpcPortrait } from './portraits.ts'

/**
 * Vault-relative asset reference → the key the view names it by.
 *
 * Nothing serves `/vault/…` any more — the DM window reads the bytes from its
 * own directory handle and the table window asks for them over the transport.
 * The string kept its shape because it is a *name*, and a stable one: the
 * projection is asserted against it, and the table screen has no way to turn
 * a key it was not sent into a file it can read.
 */
export const assetUrl = (src: string | null | undefined): string | null =>
  src ? `/vault/${src.replace(/^\/+/, '')}` : null

const PC_DEFAULT: RevealState = { on: true, hp: 'exact' }
const NPC_DEFAULT: RevealState = { on: false, hp: 'none' }

export const revealFor = (state: SessionState, ref: Ref): RevealState =>
  state.field.reveal[ref] ?? (ref.startsWith('pc:') ? PC_DEFAULT : NPC_DEFAULT)

/** What the server knows about a PC from its sheet, not from live state. */
export interface PcInfo {
  name: string
  /** Both derived from the `-fc5.xml` sheet; null when it is missing. */
  hpMax: number | null
  initMod: number | null
  hasPortrait: boolean
}

export interface ProjectContext {
  /** Campaign display name, shown when there is nothing else on screen. */
  title: string
  pcs: Map<string, PcInfo>
  scenes: Map<string, Scene>
  /** PNJ keyed by both `file` and `id`, for portrait fallback. */
  pnjs: Map<string, Pnj>
}

interface CombatantSource {
  ref: Ref
  name: string
  hp: number | null
  hpMax: number | null
  temp: number
  conditions: string[]
  portraitUrl: string | null
}

function sources(state: SessionState, ctx: ProjectContext): CombatantSource[] {
  const out: CombatantSource[] = []
  for (const [pcId, live] of Object.entries(state.play)) {
    const info = ctx.pcs.get(pcId)
    out.push({
      ref: makeRef('pc', pcId),
      name: info?.name ?? pcId,
      hp: live.hp,
      hpMax: info?.hpMax ?? null,
      temp: live.temp,
      conditions: live.conditions,
      portraitUrl: info?.hasPortrait
        ? `/api/portrait/pc/${encodeURIComponent(pcId)}`
        : null,
    })
  }
  for (const npc of state.npcs) {
    out.push({
      ref: makeRef('npc', npc.id),
      name: npc.name,
      hp: npc.hp,
      hpMax: npc.hpMax,
      temp: npc.temp,
      conditions: npc.conditions,
      portraitUrl: resolveNpcPortrait(npc, ctx.pnjs)
        ? `/api/portrait/npc/${encodeURIComponent(npc.id)}`
        : null,
    })
  }
  return out
}

function toTableCombatant(src: CombatantSource, reveal: RevealState): TableCombatant {
  const c: TableCombatant = {
    ref: src.ref,
    name: src.name,
    portrait: src.portraitUrl,
    conditions: src.conditions,
    dead: src.hp !== null && src.hp <= 0,
  }
  if (reveal.hp === 'exact' && src.hp !== null) {
    c.hp = src.hp
    if (src.hpMax !== null) c.hpMax = src.hpMax
    if (src.temp > 0) c.temp = src.temp
  } else if (reveal.hp === 'bar' && src.hp !== null && src.hpMax) {
    c.hpFraction = Math.max(0, Math.min(1, src.hp / src.hpMax))
  }
  return c
}

export function projectTable(state: SessionState, ctx: ProjectContext): TableView {
  const { field } = state
  const scene = field.sceneId ? ctx.scenes.get(field.sceneId) : undefined

  const combatants: TableCombatant[] = []
  const visible = new Set<string>()
  for (const src of sources(state, ctx)) {
    const reveal = revealFor(state, src.ref)
    if (!reveal.on) continue
    visible.add(src.ref)
    combatants.push(toTableCombatant(src, reveal))
  }

  // Only tokens for visible combatants — a hidden NPC has no position on the table.
  const tokens: TableView['tokens'] = {}
  for (const [ref, pos] of Object.entries(field.tokens)) {
    if (visible.has(ref)) tokens[ref] = pos
  }

  // Naming the active combatant would leak an ambush that has not been revealed.
  const { activeRef } = state.encounter
  const active = activeRef && visible.has(activeRef) ? activeRef : null

  // The field's grid, and nothing else. This used to prefer `scene.grid` — the
  // *prep* number — which meant the television drew 16 columns while the DM
  // drew 24, and every cell coordinate in the frame meant two different
  // things and tokens landed elsewhere. A scene's prepped grid is adopted into
  // the field when the scene is shown, so there is one number.
  const grid = field.mode === 'tablero' ? { cols: field.cols, rows: field.rows } : null

  return {
    title: ctx.title,
    mode: field.mode,
    hud: field.hud,
    scene: scene
      ? { id: scene.id, name: scene.name, artUrl: assetUrl(scene.art?.src) }
      : null,
    map: field.map ? { src: assetUrl(field.map.src) ?? field.map.src } : null,
    audio: field.audio,
    handout: field.handout
      ? { ...field.handout, src: assetUrl(field.handout.src) ?? field.handout.src }
      : null,
    grid,
    tokens,
    combatants,
    round: state.encounter.round,
    activeRef: active,
  }
}

/** The DM window gets the state verbatim, minus the inline base64 portraits. */
export function projectDm(state: SessionState): SessionState {
  return {
    ...state,
    npcs: state.npcs.map((npc) => ({ ...npc, portrait: null })),
  }
}
