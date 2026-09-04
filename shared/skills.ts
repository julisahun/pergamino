/**
 * The 5e skill list, in the Spanish the campaign notes use — the same kind of
 * vocabulary table as `conditions.ts`, and no more of a rules engine than that
 * one is. Which ability a skill keys off is a name, not a derivation.
 *
 * What is *not* here is which skills a character is proficient in. That is the
 * one number this app will not compute: proficiency and expertise on top of an
 * ability is a build being re-derived, and `-fc5.xml` states skill proficiency
 * as opaque numeric ids (`<proficiency>104</proficiency>`) with no table
 * anywhere saying which skill each id is. So the sheet says the number or the
 * app shows the bare ability modifier and says that is what it is showing.
 */
import type { Abilities, SheetStats } from './vault/sheet.ts'
import { abilityMod } from './vault/sheet.ts'

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
   * False means it is the bare ability modifier and nothing more.
   */
  stated: boolean
}

/**
 * Every skill, with the sheet's number where the sheet gives one.
 *
 * A `Habilidades:` line quotes the skills that are *not* just their ability,
 * so whatever is missing from it is the ability modifier — which is why the
 * two can be merged into one honest list. Until a sheet writes that line,
 * every row comes back `stated: false` and the caller has to say so.
 */
export function skillRows(sheet: SheetStats | undefined): SkillRow[] {
  const quoted = new Map((sheet?.skills ?? []).map((s) => [norm(s.name), s.mod]))
  return SKILLS.map((skill) => {
    const stated = quoted.get(norm(skill.name))
    if (stated !== undefined) return { ...skill, mod: stated, stated: true }
    const score = sheet?.abilities?.[skill.ability]
    return { ...skill, mod: score === undefined ? null : abilityMod(score), stated: false }
  })
}
