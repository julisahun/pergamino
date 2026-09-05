/**
 * The context a projection needs, and the frame the television holds.
 *
 * Both used to live inside `SessionStore`, tangled with persistence. They are
 * pure: a context is built from prep plus the party, and the held frame is a
 * function of the state before and after one change. Whoever owns the state —
 * the console receiving it, the server producing it — owns one of these.
 */
import type { FrozenSummary } from '../actions.ts'
import type { Character, Pnj, Scene, SessionState, TableView } from '../types.ts'
import type { SheetStats } from '../vault/sheet.ts'
import { hasArt, pnjIndex } from './portraits.ts'
import { projectTable, type PcInfo, type ProjectContext } from './project.ts'

/** What a projection knows about one PC: the name, and the sheet's numbers. */
export function pcInfoOf(
  character: Pick<Character, 'id' | 'name' | 'player' | 'portrait'>,
  sheet: SheetStats | undefined,
): PcInfo {
  return {
    name: character.name || character.id,
    player: character.player,
    hpMax: sheet?.hpMax ?? null,
    initMod: sheet?.initMod ?? null,
    ac: sheet?.ac ?? null,
    hasPortrait: hasArt(character.portrait),
  }
}

export function contextOf(
  title: string,
  scenes: Omit<Scene, 'note'>[],
  pnjs: Omit<Pnj, 'lead'>[],
  pcs: Map<string, PcInfo>,
): ProjectContext {
  return {
    title,
    // A scene's `note` is the DM's reading text; the projection only ever
    // reads id, name and art, so a published scene (which has none) fits.
    scenes: new Map(scenes.map((s) => [s.id, s as Scene])),
    pnjs: pnjIndex(pnjs),
    pcs,
  }
}

export const emptyContext = (): ProjectContext => contextOf('', [], [], new Map())

/**
 * The frame the table keeps holding after the state moved from `prev` to
 * `next`.
 *
 * Pausing captures the frame *before* the change, so the players go on seeing
 * exactly what was on screen when the DM hit pause; resuming lets go of it.
 * Anything else leaves whatever was held.
 */
export function nextFrozen(
  held: TableView | null,
  prev: SessionState,
  next: SessionState,
  ctx: ProjectContext,
): TableView | null {
  if (!prev.field.paused && next.field.paused) return projectTable(prev, ctx)
  if (prev.field.paused && !next.field.paused) return null
  return held
}

/** A context and the frame it is holding, for whoever has the state. */
export class LocalProjection {
  #ctx: ProjectContext
  #frozen: TableView | null = null

  constructor(ctx: ProjectContext = emptyContext()) {
    this.#ctx = ctx
  }

  get ctx(): ProjectContext {
    return this.#ctx
  }

  setContext(ctx: ProjectContext): void {
    this.#ctx = ctx
  }

  /** Track one change of state, holding or releasing the frame as it says. */
  advance(prev: SessionState, next: SessionState): void {
    this.#frozen = nextFrozen(this.#frozen, prev, next, this.#ctx)
  }

  /** Let go of the held frame — a run switch, a campaign reload. */
  release(): void {
    this.#frozen = null
  }

  /**
   * What the table screen should be showing: the held frame while paused, so
   * a screen that reloads mid-pause still shows what the players were looking
   * at; the live projection otherwise.
   */
  tableView(state: SessionState): TableView {
    return this.#frozen ?? projectTable(state, this.#ctx)
  }

  /** A short description of the held frame, for the DM's banner. */
  frozenSummary(): FrozenSummary | null {
    if (!this.#frozen) return null
    return {
      scene: this.#frozen.scene?.name ?? null,
      handout: this.#frozen.handout !== null,
    }
  }
}
