/**
 * Derived character numbers.
 *
 * The `.md` next to each character says who they are; the `-fc5.xml` beside it
 * is the *computed* sheet the DM's own `pregenerados/fightclub.py` generates,
 * and it is the only mechanical source there is. Reading `<hpMax>` from there
 * beats re-deriving hit points from class, CON and species traits (dwarven
 * toughness and the like) and getting it subtly wrong at the table — which is
 * why the creator's build recipe is no longer kept beside it at all.
 *
 * The sheet says the same thing about itself, in its own `<note>`:
 *
 *   > Si algún número de la app no coincide con los de arriba, mandan los de
 *   > arriba.
 *
 * "Los de arriba" is one generated line —
 *
 *   CA 19 · PG 13 · Iniciativa +2 · Percepción pasiva 14 · Competencia +2
 *
 * — so that line is what this reads, and it settles two things the tags alone
 * got wrong. AC used to be skipped entirely because `<ac>` is the armour's
 * base value rather than the number the sheet quotes; the note quotes the
 * final one. And initiative used to be DEX alone, which is short by the
 * proficiency bonus for anyone with *Alerta* — three of the six real sheets,
 * every one of them off by two in the turn order.
 *
 * The scores in `<abilities>` are post-boost and stated, so their modifiers
 * are arithmetic on a given number rather than a rule being re-derived.
 */
import { fileAt, type VaultDir } from './source.ts'

/** The six scores, in the order `<abilities>` writes them. */
export interface Abilities {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

export interface SheetStats {
  hpMax: number | null
  /** From the sheet's own line — DEX plus whatever else the build adds. */
  initMod: number | null
  level: number | null
  /** Maximum spell slots by level: `{ "1": 2 }`. Empty for non-casters. */
  slots: Record<string, number>
  /** Post-boost scores. Null when the sheet does not state them. */
  abilities: Abilities | null
  /** The final number the sheet quotes, not the armour's base value. */
  ac: number | null
  passivePerception: number | null
  proficiency: number | null
  /** The sheet's own first line: «Enano guerrero de nivel 1 (Guardia).» */
  summary: string | null
}

/** The modifier for a stated score. */
export const abilityMod = (score: number): number => Math.floor((score - 10) / 2)

/** `+2` / `-1` / `+0`, the way a sheet writes a modifier. */
export const formatMod = (mod: number): string => (mod < 0 ? `${mod}` : `+${mod}`)

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)
  return m ? m[1]!.trim() : null
}

const int = (v: string | null): number | null => {
  if (v === null) return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** `el-cantor.md` → `el-cantor-fc5.xml`. */
export const sheetNameFor = (noteName: string): string =>
  noteName.replace(/\.md$/i, '-fc5.xml')

const EMPTY: SheetStats = {
  hpMax: null,
  initMod: null,
  level: null,
  slots: {},
  abilities: null,
  ac: null,
  passivePerception: null,
  proficiency: null,
  summary: null,
}

export const emptySheet = (): SheetStats => ({ ...EMPTY, slots: {} })

/** The prose the sheet declares authoritative, or '' when there is none. */
function noteText(xml: string): string {
  const note = /<note>[\s\S]*?<text>([\s\S]*?)<\/text>/.exec(xml)
  return note ? note[1]! : ''
}

/** `CA 19` → 19. The word boundary keeps `PG` out of the middle of a word. */
const numberAfter = (text: string, label: string): number | null => {
  const m = new RegExp(`\\b${label}\\s*([+-]?\\d+)`).exec(text)
  return m ? Number.parseInt(m[1]!, 10) : null
}

/** The XML parsing on its own, so it can be tested without a vault. */
export function parseSheet(xml: string): SheetStats {
  // `<abilities>` is the post-boost score line: FUE,DES,CON,INT,SAB,CAR
  const scores = (tag(xml, 'abilities') ?? '')
    .split(',')
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n))
  const abilities: Abilities | null =
    scores.length >= 6
      ? {
          str: scores[0]!,
          dex: scores[1]!,
          con: scores[2]!,
          int: scores[3]!,
          wis: scores[4]!,
          cha: scores[5]!,
        }
      : null

  // `<slots>` is "cantrips, level 1, level 2, …"; only the spell levels matter.
  const slots: Record<string, number> = {}
  const raw = (tag(xml, 'slots') ?? '').split(',').map((v) => Number.parseInt(v, 10))
  for (let level = 1; level <= 9; level++) {
    const n = raw[level]
    if (Number.isFinite(n) && n! > 0) slots[String(level)] = n!
  }

  const note = noteText(xml)
  const stated = numberAfter(note, 'Iniciativa')

  return {
    hpMax: int(tag(xml, 'hpMax')) ?? numberAfter(note, 'PG'),
    // The sheet's line wins; DEX alone is the fallback when there is no line.
    initMod: stated ?? (abilities ? abilityMod(abilities.dex) : null),
    level: int(tag(xml, 'level')),
    slots,
    abilities,
    ac: numberAfter(note, 'CA'),
    passivePerception: numberAfter(note, 'Percepción pasiva'),
    proficiency: numberAfter(note, 'Competencia'),
    summary: note.split('\n')[0]?.trim() || null,
  }
}

/**
 * Read the sheet beside `noteName` in a `players/` folder.
 *
 * `noteName` is what the loader enumerated, so it is `toribio/toribio.md` for
 * a character with a folder — and the xml is beside the *note*, inside it.
 */
export async function readSheet(players: VaultDir, noteName: string): Promise<SheetStats> {
  const file = await fileAt(players, sheetNameFor(noteName))
  if (!file) return emptySheet()
  try {
    return parseSheet(await file.text())
  } catch {
    return emptySheet()
  }
}
