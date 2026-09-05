/**
 * Fight Club 5's enumerations.
 *
 * The `-fc5.xml` format is undocumented; these tables were lifted from real
 * exports and are the same ones the DM's own generator writes with
 * (`pregenerados/fightclub.py`: `SKILL_IX`, `ESCUELA`, `TIPO_*`, `SLOT_*`,
 * `CAT_EXPERTICIA`). They decode ids into names — a lookup, not a rule.
 */
import type { Abilities } from './sheet.ts'

/** The order `<abilities>` writes the six, and the index a save id names. */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const satisfies readonly (keyof Abilities)[]

/**
 * Skill ids are `100 + i`, with `i` the skill's position in **English**
 * alphabetical order (Acrobatics 0 … Survival 17) — not the Spanish one the
 * sheet lists them in. Names are the ones `shared/skills.ts` uses.
 */
export const SKILL_FC5_ORDER: readonly string[] = [
  'Acrobacias',
  'Trato con Animales',
  'Arcanos',
  'Atletismo',
  'Engaño',
  'Historia',
  'Perspicacia',
  'Intimidación',
  'Investigación',
  'Medicina',
  'Naturaleza',
  'Percepción',
  'Interpretación',
  'Persuasión',
  'Religión',
  'Juego de Manos',
  'Sigilo',
  'Supervivencia',
]

/** `<mod><category>4</category><type>i</type></mod>` marks expertise in skill `i`. */
export const EXPERTISE_CATEGORY = 4

export const SPELL_SCHOOLS: Record<number, string> = {
  1: 'Abjuración',
  2: 'Conjuración',
  3: 'Divinación',
  4: 'Encantamiento',
  5: 'Evocación',
  6: 'Ilusión',
  7: 'Nigromancia',
  8: 'Transmutación',
}

export type ItemKind = 'light' | 'medium' | 'heavy' | 'shield' | 'melee' | 'ranged' | 'ammo'

/** `<item><type>` */
export const ITEM_KIND: Record<number, ItemKind> = {
  1: 'light',
  2: 'medium',
  3: 'heavy',
  4: 'shield',
  5: 'melee',
  6: 'ranged',
  7: 'ammo',
}

export type ItemSlot = 'weapon' | 'shield' | 'armor'

/** `<item><slot>` — where an equipped item sits. Anything else is carried. */
export const ITEM_SLOT: Record<number, ItemSlot> = {
  3: 'weapon',
  4: 'shield',
  5: 'armor',
}
