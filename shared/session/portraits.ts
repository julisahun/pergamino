/**
 * An NPC instantiated into a session carries `portrait: null` in the vault's
 * own files — the art lives in the monster it came from. Resolve through
 * `file` so tokens still get a face.
 */
import type { Monster, Npc, Portrait } from '../types.ts'

export const monsterIndex = (monsters: Monster[]): Map<string, Monster> => {
  const byFile = new Map<string, Monster>()
  for (const m of monsters) {
    if (m.file) byFile.set(m.file, m)
    byFile.set(m.id, m)
  }
  return byFile
}

export const hasArt = (p: Portrait | null | undefined): boolean =>
  Boolean(p && (p.stamp || p.src))

export function resolveNpcPortrait(
  npc: Pick<Npc, 'portrait' | 'file' | 'id'>,
  byFile: Map<string, Monster>,
): Portrait | null {
  if (hasArt(npc.portrait)) return npc.portrait
  const monster = (npc.file && byFile.get(npc.file)) || byFile.get(npc.id)
  return hasArt(monster?.portrait) ? monster!.portrait : null
}
