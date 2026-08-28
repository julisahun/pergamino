/** Shared helpers for the combat views. */
import type { LiveState, Npc, Ref, SessionState } from '../../../shared/types.ts'
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
}

export interface PcSheet {
  id: string
  name: string
  hpMax: number | null
  initMod: number
  hasPortrait: boolean
}

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
      ac: null,
      hpMax: pc.hpMax,
      initMod: pc.initMod,
      speed: null,
      live,
      npc: null,
      portrait: pc.hasPortrait ? `/api/portrait/pc/${encodeURIComponent(pc.id)}` : null,
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
