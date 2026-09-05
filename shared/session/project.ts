/**
 * Builds the payload each window receives.
 *
 * The table screen is driven by a *separate* object, not by CSS on the DM
 * state: an unrevealed NPC is absent from `TableView`, not hidden in it. Stat
 * blocks, DM notes and base64 portraits never cross this boundary.
 */
import type {
  Npc,
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
import { nextName } from './reducer.ts'

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

const PC_DEFAULT: RevealState = { on: true, hp: 'exact', name: 'alias' }
const NPC_DEFAULT: RevealState = { on: false, hp: 'none', name: 'alias' }

export const revealFor = (state: SessionState, ref: Ref): RevealState =>
  state.field.reveal[ref] ?? (ref.startsWith('pc:') ? PC_DEFAULT : NPC_DEFAULT)

/** What the server knows about a PC from its sheet, not from live state. */
export interface PcInfo {
  name: string
  /** The person at the table. Free text off the note; nothing routes on it. */
  player: string
  /** All three derived from the `-fc5.xml` sheet; null when it is missing. */
  hpMax: number | null
  initMod: number | null
  /**
   * The number the sheet's own line quotes. Read only by the bitácora, so a
   * swing at a player can say what it was up against — the hit or miss itself
   * is settled in the console, where the DM knows about the Escudo.
   */
  ac: number | null
  hasPortrait: boolean
}

export interface ProjectContext {
  /** Campaign display name, shown when there is nothing else on screen. */
  title: string
  pcs: Map<string, PcInfo>
  scenes: Map<string, Scene>
  /**
   * PNJ keyed by both `file` and `id`, for portrait fallback. Without `lead`,
   * because the server builds one of these from the published statblocks and
   * the prose never gets that far.
   */
  pnjs: Map<string, Omit<Pnj, 'lead'>>
}

/**
 * What the table calls each NPC, keyed by its runtime id.
 *
 * A mask is only any good if it is indistinguishable from the faces around it,
 * which is exactly what makes the names collide: Tulio's `Soldado ahogado`
 * lands on top of the actual soldado ahogado standing next to him. Real names
 * win that collision — whoever is not masked keeps precisely what the console
 * calls them, so "el soldado ahogado 1" means the same creature on both
 * screens — and the masked ones take the next free number the way `nextName`
 * numbers copies.
 *
 * The reservation runs over *every* NPC in the session, revealed or not, so a
 * label is settled when the creature is seated and does not shift under the
 * players as the rest of an ambush walks on. What that costs is a faint count:
 * a `Soldado ahogado 2` alone on screen says two others exist. What it never
 * costs is a name, which is the thing this boundary is here to keep.
 */
export function tableNames(state: SessionState): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<string>()
  const masked: Npc[] = []
  for (const npc of state.npcs) {
    if (npc.alias && revealFor(state, makeRef('npc', npc.id)).name === 'alias') {
      masked.push(npc)
      continue
    }
    out.set(npc.id, npc.name)
    taken.add(npc.name)
  }
  for (const npc of masked) {
    const name = nextName(taken, npc.alias!)
    taken.add(name)
    out.set(npc.id, name)
  }
  return out
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
  const labels = tableNames(state)
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
      // The mask, when there is one. `npc.name` stops here.
      name: labels.get(npc.id) ?? npc.name,
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

  // Being at the table is having a ficha — the rail lists exactly whoever
  // has a token, and «Quitar de la mesa» is `token/remove`. The projection has
  // to draw the same line, or a bandit the DM took off the board stays on the
  // television's HUD (his ficha and his reveal outlive the token) while no
  // row in the console can reach him any more. So: seated *and* revealed.
  const combatants: TableCombatant[] = []
  const visible = new Set<string>()
  for (const src of sources(state, ctx)) {
    if (!field.tokens[src.ref]) continue
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
