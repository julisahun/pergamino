/**
 * Loads prep data (scenes, monsters, objects) and a run's characters.
 *
 * Every loader takes a `VaultDir`, which has no `write` — reading prep can
 * therefore never turn into editing it, whatever the caller does next.
 */
import type { Character, GameObject, Monster, Scene } from '../types.ts'
import { jsonNames, readJson, type VaultDir } from './source.ts'

async function readJsonDir<T>(
  dir: VaultDir | null,
  parse: (raw: unknown, file: string) => T | null,
): Promise<T[]> {
  if (!dir) return []
  const out: T[] = []
  for (const name of await jsonNames(dir)) {
    try {
      const value = parse(await readJson(dir, name), name)
      if (value) out.push(value)
    } catch (err) {
      console.warn(`[vault] skipping ${dir.name}/${name}: ${(err as Error).message}`)
    }
  }
  return out
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const nullableNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

export function loadMonsters(dir: VaultDir | null): Promise<Monster[]> {
  return readJsonDir<Monster>(dir, (raw, file) => {
    const d = raw as Record<string, unknown>
    if (typeof d.id !== 'string') return null
    return {
      id: d.id,
      name: str(d.name, d.id),
      tag: typeof d.tag === 'string' ? d.tag : null,
      ac: num(d.ac, 10),
      hpMax: num(d.hpMax, 1),
      initMod: num(d.initMod, 0),
      speed: nullableNum(d.speed),
      note: str(d.note),
      portrait: (d.portrait as Monster['portrait']) ?? null,
      abilities: Array.isArray(d.abilities) ? (d.abilities as Monster['abilities']) : [],
      // Every monster in the vault carries `file`; the fallback is the shape
      // those values have, so a hand-written one still resolves its portrait.
      file: str(d.file, `monsters/${file}`),
    }
  })
}

export function loadObjects(dir: VaultDir | null): Promise<GameObject[]> {
  return readJsonDir<GameObject>(dir, (raw, file) => {
    const d = raw as Record<string, unknown>
    if (typeof d.id !== 'string') return null
    const obj: GameObject = {
      id: d.id,
      name: str(d.name, d.id),
      description: str(d.description),
      mods: (d.mods as GameObject['mods']) ?? {},
      effects: Array.isArray(d.effects) ? (d.effects as string[]) : [],
      file: str(d.file, `objects/${file}`),
    }
    if (typeof d.usos === 'number') obj.usos = d.usos
    return obj
  })
}

export function loadScenes(dir: VaultDir | null): Promise<Scene[]> {
  return readJsonDir<Scene>(dir, (raw) => {
    const d = raw as Record<string, unknown>
    const s = d.scene as Record<string, unknown> | undefined
    if (!s || typeof s.id !== 'string') return null
    // `roster` is [] in every scene today; Preparación mode fills it in.
    const roster = Array.isArray(s.roster)
      ? (s.roster as unknown[]).flatMap((e) => {
          if (typeof e === 'string') return [{ monsterId: e, count: 1 }]
          const r = e as Record<string, unknown>
          return typeof r?.monsterId === 'string'
            ? [{ monsterId: r.monsterId, count: num(r.count, 1) }]
            : []
        })
      : []
    return {
      id: s.id,
      name: str(s.name, s.id),
      art: (s.art as Scene['art']) ?? null,
      audio: typeof s.audio === 'string' ? s.audio : null,
      roster,
      grid: (s.grid as Scene['grid']) ?? null,
      note: str(s.note),
    }
  })
}

/**
 * A run's characters, read from `runs/<mesa>/players/*.json`.
 *
 * `file` is the entry name inside that folder — enough to find the `-fc5.xml`
 * beside it, and no longer an absolute path that could name anywhere else.
 */
export async function loadCharacters(
  runDir: VaultDir | null,
): Promise<{ character: Character; file: string }[]> {
  const players = runDir ? await runDir.dir('players') : null
  if (!players) return []
  const out: { character: Character; file: string }[] = []
  for (const name of await jsonNames(players)) {
    try {
      const raw = (await readJson(players, name)) as Record<string, unknown> | null
      const c = raw?.character as Character | undefined
      if (!c || typeof c.id !== 'string') continue
      out.push({ character: c, file: name })
    } catch (err) {
      console.warn(`[vault] skipping players/${name}: ${(err as Error).message}`)
    }
  }
  return out
}

export interface CampaignData {
  monsters: Monster[]
  objects: GameObject[]
  scenes: Scene[]
}

/** The three prep folders, read from a campaign directory. */
export async function loadCampaign(campaignDir: VaultDir): Promise<CampaignData> {
  const [monsters, objects, scenes] = await Promise.all([
    campaignDir.dir('monsters').then(loadMonsters),
    campaignDir.dir('objects').then(loadObjects),
    campaignDir.dir('scenarios').then(loadScenes),
  ])
  return { monsters, objects, scenes }
}
