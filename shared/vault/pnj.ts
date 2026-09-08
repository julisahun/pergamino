/**
 * `pnj/*.md` and `objects/*.md` — a statblock in front matter, the note below.
 *
 * These two folders used to be json beside a parallel prose note that said the
 * same things in worse words: `pnjs/cristelle.json` carried a `note` field
 * restating the opening line of `story/gente/cristelle.md`, and the console
 * stitched the halves back together by slug at render time. One file per PNJ
 * removes the seam, and the file is an ordinary Obsidian note — it indexes,
 * it backlinks, `[[Cristelle]]` resolves to the statblock.
 *
 * Nothing writes these. The loaders take a `VaultDir`, so they cannot.
 */
import * as path from '../pathish.ts'
import type { Ability, GameObject, Pnj, Portrait, Scores } from '../types.ts'
import { leadParagraph, parseNote, type Note } from './notes.ts'
import { markdownNames, type VaultDir } from './source.ts'

export const PNJ_DIR = 'pnj'
export const OBJECTS_DIR = 'objects'

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const nullableNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** `Cheese-Fattened Nibble` → `cheese-fattened-nibble`, for a stable React key. */
const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * `portrait: assets/pnj/cristelle.jpg`, or the `{src: …}` map the json used.
 *
 * There is no `stamp` any more. The old files inlined a ~60 KB base64 JPEG
 * per PNJ, which is exactly what a note cannot hold — the migration writes
 * those out to `assets/` and points here instead.
 */
function portraitOf(raw: unknown): Portrait | null {
  if (typeof raw === 'string') return raw.trim() ? { src: raw.trim(), stamp: null } : null
  const src = str(record(raw).src).trim()
  return src ? { src, stamp: null } : null
}

/**
 * `fue` / `str`, and the four others each way.
 *
 * Both languages, for the same reason `attacks.ts` reads «+3 al ataque» and
 * «+3 to hit» with one pattern: a campaign folder is written in whichever the
 * DM writes in, and this is one format in two languages rather than a setting
 * somebody has to get right.
 */
const SCORE_KEYS: Record<keyof Scores, readonly string[]> = {
  str: ['str', 'fue'],
  dex: ['dex', 'des'],
  con: ['con'],
  int: ['int'],
  wis: ['wis', 'sab'],
  cha: ['cha', 'car'],
}

/** The first key of `names` the map actually has a finite number under. */
function scoreOf(raw: Record<string, unknown>, names: readonly string[]): number | null {
  for (const name of names) {
    const v = raw[name]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/**
 * `scores: {fue: 11, des: 12, con: 12, int: 10, sab: 10, car: 10}`.
 *
 * **All six or none**, the same rule the `-fc5.xml` reader keeps for
 * `<abilities>`: five scores and a missing one would put a silent `+0` on the
 * ficha, which is the exact failure this field exists to end. A note that
 * states a partial set gets nothing and says so in the console log.
 */
function scoresOf(raw: unknown, id: string): Scores | null {
  const d = record(raw)
  if (Object.keys(d).length === 0) return null
  const out = {} as Scores
  for (const key of Object.keys(SCORE_KEYS) as (keyof Scores)[]) {
    const v = scoreOf(d, SCORE_KEYS[key])
    if (v === null) {
      console.warn(`[vault] ${id}: 'scores' needs all six (missing ${key}) — ignoring it`)
      return null
    }
    out[key] = v
  }
  return out
}

/**
 * `saves: {des: 3}` — only what the statblock quotes.
 *
 * Partial by design, and every key optional: a save that is just the ability
 * modifier does not need a line, and writing one would be two places that can
 * disagree.
 */
function savesOf(raw: unknown): Partial<Scores> {
  const d = record(raw)
  const out: Partial<Scores> = {}
  for (const key of Object.keys(SCORE_KEYS) as (keyof Scores)[]) {
    const v = scoreOf(d, SCORE_KEYS[key])
    if (v !== null) out[key] = v
  }
  return out
}

function abilitiesOf(raw: unknown): Ability[] {
  const out: Ability[] = []
  for (const entry of list(raw)) {
    const d = record(entry)
    const name = str(d.name).trim()
    const desc = str(d.desc).trim()
    if (!name && !desc) continue
    out.push({ id: str(d.id).trim() || slugify(name) || `ability-${out.length}`, name, desc })
  }
  return out
}

/** Every `*.md` in `dir`, parsed as a note with its vault-relative path. */
async function readNotes(dir: VaultDir | null, prefix: string): Promise<Note[]> {
  if (!dir) return []
  const out: Note[] = []
  for (const name of await markdownNames(dir)) {
    try {
      const file = await dir.file(name)
      if (file) out.push(parseNote(path.join(prefix, name), await file.text()))
    } catch (err) {
      console.warn(`[vault] skipping ${prefix}/${name}: ${(err as Error).message}`)
    }
  }
  return out
}

/**
 * The bestiary and the cast, which are now the same folder.
 *
 * `id` falls back to the file name rather than being required: a note's name
 * is already stable and unique within its folder, which is what the old spec
 * had to ask for in prose because json had no such thing.
 *
 * `hpMax` is what makes a note a *combatant*. A PNJ the party only ever talks
 * to — Jonás, Vann — has no hit points in its front matter, so Preparación
 * will not seat it and a scene roster cannot name it. It is still a note.
 */
export async function loadPnj(dir: VaultDir | null, prefix = PNJ_DIR): Promise<Pnj[]> {
  const notes = await readNotes(dir, prefix)
  return notes.map((note) => {
    const fm = note.frontmatter
    return {
      id: str(fm.id).trim() || note.slug,
      name: note.title,
      // `alias: Soldado ahogado` — the name the table is given instead of the
      // title. Absent from almost every note, and that is the default.
      alias: str(fm.alias).trim() || null,
      tag: typeof fm.tag === 'string' ? fm.tag : null,
      ac: num(fm.ac, 10),
      hpMax: nullableNum(fm.hpMax),
      initMod: num(fm.initMod, 0),
      speed: nullableNum(fm.speed),
      portrait: portraitOf(fm.portrait),
      abilities: abilitiesOf(fm.abilities),
      scores: scoresOf(fm.scores, note.slug),
      saves: savesOf(fm.saves),
      file: note.path,
      lead: leadParagraph(note.body),
    }
  })
}

/** A PNJ the app can seat on the board: it has hit points. */
export const isCombatant = (p: Pnj): boolean => p.hpMax !== null

export async function loadObjects(
  dir: VaultDir | null,
  prefix = OBJECTS_DIR,
): Promise<GameObject[]> {
  const notes = await readNotes(dir, prefix)
  return notes.map((note) => {
    const fm = note.frontmatter
    const mods = record(fm.mods)
    const obj: GameObject = {
      id: str(fm.id).trim() || note.slug,
      name: note.title,
      description: leadParagraph(note.body),
      mods: nullableNum(mods.ac) === null ? {} : { ac: mods.ac as number },
      effects: list(fm.effects).flatMap((e) => (typeof e === 'string' && e.trim() ? [e] : [])),
      file: note.path,
    }
    const usos = nullableNum(fm.usos)
    if (usos !== null) obj.usos = usos
    return obj
  })
}
