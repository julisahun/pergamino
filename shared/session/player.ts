/**
 * What one player's phone receives: their own character in full, and about
 * everyone else exactly what the television shows.
 *
 * This is the second projection boundary, and it keeps the first one's
 * discipline: a thing the phone must not know is *absent* from the view, not
 * hidden in it. `party` and `foes` are `projectTable`'s own combatant list
 * split by kind — so another PC's hit points follow the same reveal rule the
 * screen in the room follows, and an unrevealed NPC is not here at all. The
 * DM's log never crosses, nor does `LiveState.note`, which is the DM's scratch
 * note *about* the character.
 */
import type { PublishedObject } from '../protocol.ts'
import type { LiveState, Ref, SessionState, TableCombatant } from '../types.ts'
import { makeRef, refKind } from '../types.ts'
import { emptySheet, type SheetStats } from '../vault/sheet.ts'
import { projectTable, type ProjectContext } from './project.ts'

/** A campaign object the character is carrying, with its charges. */
export interface PlayerObject {
  id: string
  name: string
  effects: string[]
  mods: { ac?: number }
  /** Null for something that is not a consumable. */
  uses: { left: number; total: number; spent: boolean } | null
}

/** The character's live layer, minus the DM's note about them. */
export type PlayerLive = Omit<LiveState, 'note'>

export interface PlayerView {
  campaign: { id: string; title: string }
  pc: { id: string; name: string; player: string; portrait: string | null }
  sheet: SheetStats
  live: PlayerLive
  objects: PlayerObject[]
  party: TableCombatant[]
  foes: TableCombatant[]
  encounter: { on: boolean; round: number; myTurn: boolean; active: Ref | null }
}

/** The table's context plus what only a player's own page needs. */
export interface PlayerContext extends ProjectContext {
  campaignId: string
  sheets: Map<string, SheetStats>
  objects: Map<string, PublishedObject>
}

export function projectPlayer(
  state: SessionState,
  ctx: PlayerContext,
  pcId: string,
): PlayerView | null {
  const live = state.play[pcId]
  const info = ctx.pcs.get(pcId)
  if (!live || !info) return null

  const table = projectTable(state, ctx)
  const me = makeRef('pc', pcId)
  const { note: _dmNote, ...mine } = live

  const objects: PlayerObject[] = live.objects.map((id) => {
    const def = ctx.objects.get(id)
    if (!def) return { id, name: id, effects: [], mods: {}, uses: null }
    const held = state.objects[id]
    return {
      id,
      name: def.name,
      effects: def.effects,
      mods: def.mods,
      uses:
        def.usos === undefined
          ? null
          : { left: held?.uses ?? def.usos, total: def.usos, spent: held?.spent ?? false },
    }
  })

  return {
    campaign: { id: ctx.campaignId, title: ctx.title },
    pc: {
      id: pcId,
      name: info.name,
      player: info.player,
      portrait: info.hasPortrait ? `/api/portrait/pc/${encodeURIComponent(pcId)}` : null,
    },
    sheet: ctx.sheets.get(pcId) ?? emptySheet(),
    live: mine,
    objects,
    party: table.combatants.filter((c) => refKind(c.ref) === 'pc'),
    foes: table.combatants.filter((c) => refKind(c.ref) === 'npc'),
    encounter: {
      on: state.encounter.on,
      round: table.round,
      myTurn: state.encounter.activeRef === me,
      active: table.activeRef,
    },
  }
}
