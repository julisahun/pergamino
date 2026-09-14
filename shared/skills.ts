/**
 * The skill and saving-throw vocabulary, and the arithmetic over a **PNJ**.
 *
 * A player character's skills moved to `shared/character.ts` when the record
 * became the source of truth: `skillRows` there works them out from scores,
 * proficiency and expertise that the record holds, with an override beside
 * each. They are re-exported here so the old import path keeps working.
 *
 * What stays is `saveRows`, which is a different problem with a different
 * rule. A pnj is an Obsidian note, its statblock is prose a human wrote, and
 * there is nothing to work a missing number out from — so **a stated line
 * always wins**, an unstated one is the ability modifier, and what the note is
 * silent about comes back `null` rather than `+0`.
 */
import type { Scores } from './types.ts'
import { ABILITY_KEYS, ABILITY_LABEL, abilityMod } from './character.ts'

export {
  ABILITY_LABEL,
  SKILLS,
  SKILL_BY_KEY,
  skillKeyOf,
  skillRow,
  skillRows,
  sheetSaveRows,
  type Skill,
  type SkillKey,
  type SkillRow,
} from './character.ts'

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
 * That last part is the whole point. The console used to resolve a saving
 * throw by comparing a bare d20 against the DC, which is `+0` for every
 * creature in the campaign — a modifier no note had ever given it. A `null`
 * here reads as «—» on screen: the app saying it was not told, which is the
 * truth and is useful, where a `+0` was neither.
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
