/**
 * An NPC instantiated into a session carries `portrait: null` in the vault's
 * own files — the art lives in the pnj it came from. Resolve through
 * `file` so tokens still get a face.
 */
import type { Pnj, Npc, Portrait } from '../types.ts'

export const pnjIndex = <T extends Pick<Pnj, 'id' | 'file'>>(pnjs: T[]): Map<string, T> => {
  const byFile = new Map<string, T>()
  for (const m of pnjs) {
    if (m.file) byFile.set(m.file, m)
    byFile.set(m.id, m)
  }
  return byFile
}

export const hasArt = (p: Portrait | null | undefined): boolean =>
  Boolean(p && (p.stamp || p.src))

export function resolveNpcPortrait(
  npc: Pick<Npc, 'portrait' | 'file' | 'id'>,
  byFile: Map<string, Pick<Pnj, 'portrait'>>,
): Portrait | null {
  if (hasArt(npc.portrait)) return npc.portrait
  const pnj = (npc.file && byFile.get(npc.file)) || byFile.get(npc.id)
  return hasArt(pnj?.portrait) ? pnj!.portrait : null
}
