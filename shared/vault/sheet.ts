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
 * AC is deliberately not read: the XML's `<ac>` is the armour's base value,
 * not the final number the sheets quote, and a wrong AC is worse than none.
 */
import type { VaultDir } from './source.ts'

export interface SheetStats {
  hpMax: number | null
  /** Dexterity modifier — the initiative bonus at level 1. */
  initMod: number | null
  level: number | null
  /** Maximum spell slots by level: `{ "1": 2 }`. Empty for non-casters. */
  slots: Record<string, number>
}

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

const EMPTY: SheetStats = { hpMax: null, initMod: null, level: null, slots: {} }

export const emptySheet = (): SheetStats => ({ ...EMPTY, slots: {} })

/** The XML parsing on its own, so it can be tested without a vault. */
export function parseSheet(xml: string): SheetStats {
  // `<abilities>` is the post-boost score line: FUE,DES,CON,INT,SAB,CAR
  const abilities = (tag(xml, 'abilities') ?? '')
    .split(',')
    .map((v) => Number.parseInt(v, 10))
  const dex = abilities[1]

  // `<slots>` is "cantrips, level 1, level 2, …"; only the spell levels matter.
  const slots: Record<string, number> = {}
  const raw = (tag(xml, 'slots') ?? '').split(',').map((v) => Number.parseInt(v, 10))
  for (let level = 1; level <= 9; level++) {
    const n = raw[level]
    if (Number.isFinite(n) && n! > 0) slots[String(level)] = n!
  }

  return {
    hpMax: int(tag(xml, 'hpMax')),
    initMod: Number.isFinite(dex) ? Math.floor((dex! - 10) / 2) : null,
    level: int(tag(xml, 'level')),
    slots,
  }
}

/** Read the sheet beside `noteName` in a `players/` folder. */
export async function readSheet(players: VaultDir, noteName: string): Promise<SheetStats> {
  const file = await players.file(sheetNameFor(noteName))
  if (!file) return emptySheet()
  try {
    return parseSheet(await file.text())
  } catch {
    return emptySheet()
  }
}
