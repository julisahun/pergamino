/**
 * The 5e skill list, in the Spanish the campaign notes use — the same kind of
 * vocabulary table as `conditions.ts`, and no more of a rules engine than that
 * one is. Which ability a skill keys off is a name, not a derivation.
 *
 * Which skills a character is proficient in comes off the sheet: `-fc5.xml`
 * states it as numeric ids (`<proficiency>104</proficiency>`) that
 * `vault/fc5.ts` decodes — the same table the DM's generator writes with. What
 * the sheet does not quote a number for, `skillRows` adds up from stated
 * numbers and says so (`derived`): the ability's modifier plus the sheet's
 * proficiency bonus, doubled for an expertise. The sheet's own line, when it
 * has one, always wins.
 */
import type { Scores } from './types.ts'
import type { Abilities, SheetStats } from './vault/sheet.ts'
import { abilityMod } from './vault/sheet.ts'
import { ABILITY_KEYS } from './vault/fc5.ts'

export interface Skill {
  name: string
  ability: keyof Abilities
}

/** All eighteen, alphabetical in Spanish, which is how a sheet lists them. */
export const SKILLS: readonly Skill[] = [
  { name: 'Acrobacias', ability: 'dex' },
  { name: 'Arcanos', ability: 'int' },
  { name: 'Atletismo', ability: 'str' },
  { name: 'Engaño', ability: 'cha' },
  { name: 'Historia', ability: 'int' },
  { name: 'Interpretación', ability: 'cha' },
  { name: 'Intimidación', ability: 'cha' },
  { name: 'Investigación', ability: 'int' },
  { name: 'Juego de Manos', ability: 'dex' },
  { name: 'Medicina', ability: 'wis' },
  { name: 'Naturaleza', ability: 'int' },
  { name: 'Percepción', ability: 'wis' },
  { name: 'Perspicacia', ability: 'wis' },
  { name: 'Persuasión', ability: 'cha' },
  { name: 'Religión', ability: 'int' },
  { name: 'Sigilo', ability: 'dex' },
  { name: 'Supervivencia', ability: 'wis' },
  { name: 'Trato con Animales', ability: 'wis' },
]

/** The six, labelled the way the sheet writes them. */
export const ABILITY_LABEL: Record<keyof Abilities, string> = {
  str: 'FUE',
  dex: 'DES',
  con: 'CON',
  int: 'INT',
  wis: 'SAB',
  cha: 'CAR',
}

/** Accents and case are how a human writes; neither identifies a skill. */
const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

export interface SkillRow extends Skill {
  /** Null when the sheet states nothing and there are no scores either. */
  mod: number | null
  /**
   * True when the sheet quoted this one by name, which makes the number the
   * sheet's own — proficiency, expertise and anything else the build adds.
   */
  stated: boolean
  /**
   * True when the number is the ability's modifier plus the sheet's stated
   * proficiency bonus (doubled for an expertise) — arithmetic on numbers the
   * sheet gives, done here because the sheet did not quote this skill.
   */
  derived: boolean
  proficient: boolean
  expertise: boolean
}

/**
 * Every skill, with the sheet's number where the sheet gives one.
 *
 * A `Habilidades:` line quotes the skills that are *not* just their ability;
 * a proficient skill it leaves out is added up from the sheet's proficiency
 * bonus and marked `derived`; everything else is the bare ability modifier.
 * With no sheet at all every row is null.
 */
export function skillRows(sheet: SheetStats | undefined): SkillRow[] {
  const quoted = new Map((sheet?.skills ?? []).map((s) => [norm(s.name), s.mod]))
  const proficient = new Set((sheet?.proficient.skills ?? []).map(norm))
  const expertise = new Set((sheet?.proficient.expertise ?? []).map(norm))
  return SKILLS.map((skill) => {
    const key = norm(skill.name)
    const flags = { proficient: proficient.has(key) || expertise.has(key), expertise: expertise.has(key) }
    const stated = quoted.get(key)
    if (stated !== undefined) return { ...skill, ...flags, mod: stated, stated: true, derived: false }
    const score = sheet?.abilities?.[skill.ability]
    if (score === undefined) return { ...skill, ...flags, mod: null, stated: false, derived: false }
    const bonus = sheet?.proficiency
    if (flags.proficient && bonus !== null && bonus !== undefined) {
      const mod = abilityMod(score) + bonus * (flags.expertise ? 2 : 1)
      return { ...skill, ...flags, mod, stated: false, derived: true }
    }
    return { ...skill, ...flags, mod: abilityMod(score), stated: false, derived: false }
  })
}

// --- a statblock's own six -------------------------------------------------

export interface SaveRow {
  ability: keyof Scores
  /** `FUE`, `DES`… — the same label the player's sheet is drawn with. */
  label: string
  /** Null when the note states neither a score nor a save for this one. */
  mod: number | null
  /** True when the note quoted this save by name, which makes it the note's. */
  stated: boolean
}

/**
 * The six saving throws of a PNJ, from what its note states and nothing else.
 *
 * The same rule `skillRows` keeps for a player: **a stated line always wins**,
 * an unstated one is the ability modifier, and what the note is silent about
 * comes back `null` rather than `+0`. That last part is the whole point. The
 * console used to resolve a saving throw by comparing a bare d20 against the
 * DC, which is `+0` for every creature in the campaign — a modifier no note
 * had ever given it. A `null` here reads as «—» on screen: the app saying it
 * was not told, which is the truth and is useful, where a `+0` was neither.
 */
export function saveRows(scores: Scores | null, stated: Partial<Scores> = {}): SaveRow[] {
  return ABILITY_KEYS.map((ability) => {
    const label = ABILITY_LABEL[ability]
    const quoted = stated[ability]
    if (quoted !== undefined) return { ability, label, mod: quoted, stated: true }
    const score = scores?.[ability]
    return { ability, label, mod: score === undefined ? null : abilityMod(score), stated: false }
  })
}
