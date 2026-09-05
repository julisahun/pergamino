/** Shared helpers for the combat views. */
import { attacksOfPnj, attacksOfSheet, type Attack } from '../../../shared/combat/attacks.ts'
import type { SheetStats } from '../../../shared/vault/sheet.ts'
import type { LiveState, Npc, Portrait, Ref, SessionState } from '../../../shared/types.ts'
import { makeRef, refId, refKind } from '../../../shared/types.ts'

export interface Combatant {
  ref: Ref
  name: string
  tag: string | null
  ac: number | null
  hpMax: number | null
  initMod: number
  speed: number | null
  live: LiveState
  npc: Npc | null
  portrait: string | null
  /**
   * What this one can do on its turn — a pnj's abilities or a player's sheet,
   * whichever it has. Empty for anyone whose prose states no numbers, which is
   * the DM's cue that this one is run by hand.
   */
  attacks: Attack[]
}

export interface PcSheet {
  id: string
  name: string
  hpMax: number | null
  /** The number the sheet's own line quotes, so an attack has something to beat. */
  ac: number | null
  initMod: number
  hasPortrait: boolean
  /** What this character can do, parsed from the `-fc5.xml` beside the note. */
  attacks: Attack[]
}

/**
 * The party as `combatants` wants it: the note for who they are, the sheet for
 * every number.
 *
 * Four panels built this by hand and each had to be found again the moment a
 * field was added — which is how the armour class the sheet has always stated
 * went four screens without ever reaching a combatant.
 */
export const pcSheets = (
  characters: { id: string; name: string; portrait: Portrait | null }[],
  sheets: Record<string, SheetStats | undefined>,
): PcSheet[] =>
  characters.map((c) => ({
    id: c.id,
    name: c.name || c.id,
    hpMax: sheets[c.id]?.hpMax ?? null,
    ac: sheets[c.id]?.ac ?? null,
    initMod: sheets[c.id]?.initMod ?? 0,
    hasPortrait: Boolean(c.portrait?.stamp || c.portrait?.src),
    attacks: attacksOfSheet(sheets[c.id]),
  }))

/** PNJ that actually have art, keyed by `file` and `id`. */
export type ArtIndex = Set<string>

export const artIndex = (
  pnjs: { id: string; file: string; hasPortrait?: boolean }[],
): ArtIndex => {
  const set = new Set<string>()
  for (const m of pnjs) {
    if (!m.hasPortrait) continue
    if (m.file) set.add(m.file)
    set.add(m.id)
  }
  return set
}

export function combatants(
  state: SessionState,
  pcs: PcSheet[],
  art: ArtIndex = new Set(),
): Combatant[] {
  const out: Combatant[] = []
  for (const pc of pcs) {
    const live = state.play[pc.id]
    if (!live) continue
    out.push({
      ref: makeRef('pc', pc.id),
      name: pc.name,
      tag: null,
      // The sheet has always stated this one; the rail simply never carried it
      // across, so nothing could be swung at a player.
      ac: pc.ac,
      hpMax: pc.hpMax,
      initMod: pc.initMod,
      speed: null,
      live,
      npc: null,
      portrait: pc.hasPortrait ? `/api/portrait/pc/${encodeURIComponent(pc.id)}` : null,
      attacks: pc.attacks,
    })
  }
  for (const npc of state.npcs) {
    out.push({
      ref: makeRef('npc', npc.id),
      name: npc.name,
      tag: npc.tag,
      ac: npc.ac,
      hpMax: npc.hpMax,
      initMod: npc.initMod,
      speed: npc.speed,
      live: npc,
      npc,
      // Only ask for art we know exists — Ossian has none, for instance.
      portrait:
        art.has(npc.file) || art.has(npc.id)
          ? `/api/portrait/npc/${encodeURIComponent(npc.id)}`
          : null,
      attacks: attacksOfPnj(npc),
    })
  }
  return out
}

/** Mirrors the server's ordering so the DM list matches the turn advance. */
export function orderByInit(state: SessionState, list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => {
    const ia = state.encounter.init[a.ref] ?? -Infinity
    const ib = state.encounter.init[b.ref] ?? -Infinity
    if (ia !== ib) return ib - ia
    if (a.initMod !== b.initMod) return b.initMod - a.initMod
    return a.name.localeCompare(b.name, 'es') || a.ref.localeCompare(b.ref)
  })
}

export const isDown = (c: Combatant): boolean => c.live.hp !== null && c.live.hp <= 0

export const isDead = (c: Combatant): boolean =>
  c.live.death.fail >= 3 || (refKind(c.ref) === 'npc' && isDown(c))

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || name.slice(0, 2).toUpperCase()

export const pcIdOf = (ref: Ref): string => refId(ref)
