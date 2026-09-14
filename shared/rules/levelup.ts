/**
 * Turning what a person answered into a patch.
 *
 * Pure, and in `shared/` rather than in the component, for the reason the rest
 * of this repo keeps its core here: it can be driven by a test without a DOM,
 * and the spell picker — which no fixture character can exercise on screen —
 * gets covered like everything else.
 *
 * Nothing is decided here. The grant says what is on offer, the answers say
 * what was taken, and this puts the two together into the fields that changed.
 * A grant of `null` is an ordinary case, not an error: then the patch is
 * whatever the person typed by hand.
 */
import { slugId, type Sheet, type SkillKey, type Spell, type Trait } from '../character.ts'
import type { SheetPatch } from '../protocol.ts'
import { damageDice } from '../combat/prose.ts'
import { formatDice } from '../combat/dice.ts'
import { classSlug, type Feature, type LevelGrant } from './progression.ts'
import { spellsFor, type RuleSpell } from './spells.ts'

export interface LevelUpAnswers {
  level: number | null
  hpMax: number | null
  /** Every slot level the form showed, as it was left. */
  slots?: Record<string, number>
  /** What was picked, per choice id. */
  picks?: Record<string, string[]>
  /** Traits typed in by hand, on top of whatever the grant gave. */
  traits?: { name: string; text: string }[]
  /** The manual skill grid, as it was left. */
  skills?: Sheet['skills']
}

/**
 * A picked spell, as the record holds one.
 *
 * The rules table states no roll, so the dice come out of the summary the way
 * a pnj's come out of its statblock. `no dice, no action` still decides
 * whether it reaches the action bar: a spell whose prose describes no roll
 * stays prose on the ficha, which is where the DM runs it from.
 */
export function toSpell(rule: RuleSpell, taken: Set<string> = new Set()): Spell {
  const id = slugId(rule.es, taken)
  taken.add(id)
  const dice = damageDice(rule.sum)
  return {
    id,
    name: rule.es,
    level: rule.lvl,
    roll: dice ? formatDice(dice) : null,
    school: rule.school,
    time: rule.time,
    range: rule.range,
    duration: rule.dur,
    components: rule.comp,
    ritual: rule.rit ?? false,
    classes: rule.classes,
    text: rule.sum,
  }
}

/** The spells this character could still be offered at or below a level. */
export const offerableSpells = (sheet: Sheet, maxLevel: number): RuleSpell[] => {
  const already = new Set(sheet.spells.map((s) => s.name))
  return spellsFor(classSlug(sheet.className), maxLevel).filter((s) => !already.has(s.es))
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export function buildLevelUp(
  sheet: Sheet,
  grant: LevelGrant | null,
  answers: LevelUpAnswers,
): SheetPatch {
  const picks = answers.picks ?? {}
  const taken = (id: string): string[] => picks[id] ?? []
  const out: SheetPatch = {}

  if (answers.level !== null && answers.level !== sheet.level) out.level = answers.level
  if (answers.hpMax !== null && answers.hpMax !== sheet.hpMax) out.hpMax = answers.hpMax

  if (sheet.spellcasting && answers.slots) {
    const slots: Record<string, number> = {}
    for (const [level, n] of Object.entries(answers.slots)) if (n > 0) slots[level] = n
    if (!same(slots, sheet.spellcasting.slots)) out.spellcasting = { ...sheet.spellcasting, slots }
  }

  // Traits: granted outright, then picked, then typed. All appended, because a
  // patch replaces a list rather than merging into it.
  const takenTraits = new Set(sheet.traits.map((t) => t.id))
  const add = (f: Feature): Trait => {
    const id = slugId(f.name, takenTraits)
    takenTraits.add(id)
    return { id, name: f.name.trim(), text: f.text.trim(), source: 'class' }
  }
  const added: Trait[] = (grant?.features ?? []).map(add)
  for (const choice of grant?.choices ?? []) {
    if (choice.kind !== 'features') continue
    for (const name of taken(choice.id)) {
      const feature = choice.from.find((f) => f.name === name)
      if (feature) added.push(add(feature))
    }
  }
  for (const typed of answers.traits ?? []) {
    if (typed.name.trim() === '') continue
    added.push(add(typed))
  }
  if (added.length > 0) out.traits = [...sheet.traits, ...added]

  // Skills: the manual grid, then whatever a choice granted on top of it.
  let skills = answers.skills ?? sheet.skills
  for (const choice of grant?.choices ?? []) {
    if (choice.kind !== 'skills') continue
    for (const key of taken(choice.id) as SkillKey[]) {
      skills = { ...skills, [key]: { ...skills[key], prof: choice.as } }
    }
  }
  if (!same(skills, sheet.skills)) out.skills = skills

  // Spells: appended too, and looked up in the same pool the picker offered.
  const takenSpells = new Set(sheet.spells.map((s) => s.id))
  const spells: Spell[] = []
  for (const choice of grant?.choices ?? []) {
    if (choice.kind !== 'spells') continue
    const pool = offerableSpells(sheet, choice.maxLevel)
    for (const name of taken(choice.id)) {
      const rule = pool.find((s) => s.es === name)
      if (rule) spells.push(toSpell(rule, takenSpells))
    }
  }
  if (spells.length > 0) out.spells = [...sheet.spells, ...spells]

  return out
}
