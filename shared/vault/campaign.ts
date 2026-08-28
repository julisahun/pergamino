/**
 * Loads prep data (PNJ, objects, scenes) and a run's characters.
 *
 * Every loader takes a `VaultDir`, which has no `write` — reading prep can
 * therefore never turn into editing it, whatever the caller does next.
 *
 * Two of the three folders are markdown now (`pnj.ts`); `scenarios/` stays
 * json because it is the one prep folder the app writes back to, from
 * Preparación, and a round-trip through the markdown renderer would cost the
 * DM their formatting every time they moved a token.
 */
import * as path from '../pathish.ts'
import type { Character, GameObject, Pnj, Portrait, Scene } from '../types.ts'
import { loadObjects, loadPnj, OBJECTS_DIR, PNJ_DIR } from './pnj.ts'
import { parseNote } from './notes.ts'
import { jsonNames, markdownNames, readJson, type VaultDir } from './source.ts'

export { isCombatant, loadObjects, loadPnj, OBJECTS_DIR, PNJ_DIR } from './pnj.ts'

export const SCENARIOS_DIR = 'scenarios'
export const PLAYERS_DIR = 'players'

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

export function loadScenes(dir: VaultDir | null): Promise<Scene[]> {
  return readJsonDir<Scene>(dir, (raw) => {
    const d = raw as Record<string, unknown>
    const s = (d.scene as Record<string, unknown> | undefined) ?? d
    if (!s || typeof s.id !== 'string') return null
    // `pnjId` is the field now; `pnjId` and `beastId` are what prep files
    // written before the bestiary and the cast merged still say.
    const roster = Array.isArray(s.roster)
      ? (s.roster as unknown[]).flatMap((e) => {
          if (typeof e === 'string') return [{ pnjId: e, count: 1 }]
          const r = e as Record<string, unknown>
          const id = r?.pnjId ?? r?.pnjId ?? r?.beastId
          return typeof id === 'string' ? [{ pnjId: id, count: num(r.count, 1) }] : []
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

/**
 * A run's characters, read from `runs/<mesa>/players/*.md`.
 *
 * The note is the identity — a name, a portrait, and the prose about who this
 * person is. Everything with a number in it comes from the `-fc5.xml` beside
 * it, which `sheet.ts` reads; nothing here re-derives anything.
 *
 * `file` is the entry name inside the folder, which is what finds the sheet.
 */
export async function loadCharacters(
  runDir: VaultDir | null,
  prefix: string,
): Promise<{ character: Character; file: string }[]> {
  const players = runDir ? await runDir.dir(PLAYERS_DIR) : null
  if (!players) return []
  const out: { character: Character; file: string }[] = []
  for (const name of await markdownNames(players)) {
    try {
      const file = await players.file(name)
      if (!file) continue
      const note = parseNote(path.join(prefix, PLAYERS_DIR, name), await file.text())
      const fm = note.frontmatter
      const portrait = str(fm.portrait).trim()
      out.push({
        character: {
          id: str(fm.id).trim() || note.slug,
          name: note.title,
          player: str(fm.jugador).trim() || str(fm.player).trim(),
          portrait: portrait ? ({ src: portrait, stamp: null } satisfies Portrait) : null,
          file: note.path,
        },
        file: name,
      })
    } catch (err) {
      console.warn(`[vault] skipping ${PLAYERS_DIR}/${name}: ${(err as Error).message}`)
    }
  }
  return out
}

export interface CampaignData {
  pnjs: Pnj[]
  objects: GameObject[]
  scenes: Scene[]
}

/** The three prep folders, read from a campaign directory. */
export async function loadCampaign(
  campaignDir: VaultDir,
  prefix = '',
): Promise<CampaignData> {
  const [pnjs, objects, scenes] = await Promise.all([
    campaignDir.dir(PNJ_DIR).then((d) => loadPnj(d, path.join(prefix, PNJ_DIR))),
    campaignDir.dir(OBJECTS_DIR).then((d) => loadObjects(d, path.join(prefix, OBJECTS_DIR))),
    campaignDir.dir(SCENARIOS_DIR).then(loadScenes),
  ])
  return { pnjs, objects, scenes }
}
