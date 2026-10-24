/**
 * Turning what a person answered into a patch.
 *
 * Pure, and in `shared/` rather than in the component, for the reason the rest
 * of this repo keeps its core here: it can be driven by a test without a DOM,
 * and the spell picker — which no fixture character can exercise on screen —
 * gets covered like everything else.
 *
 * Nothing is decided here. The grant says what the level gives and what is on
 * offer, the picks say what was taken, and this puts the two together into
 * the fields that changed. Level, hit points and slots are **not** asked for:
 * they are what the row says, shown on the form and never typed. A level with
 * no row cannot be taken here at all — the answer to that is writing the row.
 */
import { slugId, SKILLS, type Sheet, type SkillKey, type Spell, type Trait } from '../character.ts'
import type { SheetPatch } from '../protocol.ts'
import { damageDice } from '../combat/prose.ts'
import { formatDice } from '../combat/dice.ts'
import { averageOf, classSlug, grantFor, type Choice, type Feature, type LevelGrant } from './progression.ts'
import { spellsFor, type RuleSpell } from './spells.ts'

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

/**
 * The spells this character could still be offered, from level 1 up to
 * `maxLevel`.
 *
 * Cantrips are left out: no choice in the table grants one, and a level-2
 * "one more spell" that offered Luz beside Escudo was offering the wrong thing.
 */
export const offerableSpells = (sheet: Sheet, maxLevel: number): RuleSpell[] => {
  const already = new Set(sheet.spells.map((s) => s.name))
  return spellsFor(classSlug(sheet.className), maxLevel).filter(
    (s) => s.lvl >= 1 && !already.has(s.es),
  )
}

/** A spell choice's pool, split into what the table recommends and the rest. */
export function spellOffer(
  sheet: Sheet,
  choice: Extract<Choice, { kind: 'spells' }>,
): { recommended: RuleSpell[]; rest: RuleSpell[] } {
  const pool = offerableSpells(sheet, choice.maxLevel)
  const recommended = (choice.recommended ?? [])
    .map((name) => pool.find((s) => s.es === name))
    .filter((s): s is RuleSpell => s !== undefined)
  const shown = new Set(recommended.map((s) => s.es))
  return { recommended, rest: pool.filter((s) => !shown.has(s.es)) }
}

/**
 * The skills a skill choice may land on. Expertise only goes where the
 * character is already proficient — offering the rest is offering a pick the
 * rules would refuse.
 */
export function skillOptions(sheet: Sheet, choice: Extract<Choice, { kind: 'skills' }>): SkillKey[] {
  const from = choice.from ?? SKILLS.map((s) => s.key)
  if (choice.as !== 'expertise') return from.filter((k) => !sheet.skills[k]?.prof)
  return from.filter((k) => sheet.skills[k]?.prof === 'proficient')
}

/** What one choice can actually take: its `pick`, or less when the pool is short. */
function needed(sheet: Sheet, choice: Choice): number {
  const available =
    choice.kind === 'spells'
      ? offerableSpells(sheet, choice.maxLevel).length
      : choice.kind === 'skills'
        ? skillOptions(sheet, choice).length
        : choice.from.length
  return Math.min(choice.pick, available)
}

/** The choices still short of picks — the form will not apply until this is empty. */
export function missingPicks(
  sheet: Sheet,
  grant: LevelGrant,
  picks: Record<string, string[]>,
): Choice[] {
  return (grant.choices ?? []).filter((c) => (picks[c.id] ?? []).length < needed(sheet, c))
}

/** The level a character goes to next, and what the table says it gives. */
export function nextLevel(sheet: Sheet): { level: number; grant: LevelGrant | null } {
  const level = (sheet.level ?? 1) + 1
  return { level, grant: grantFor(sheet.className, level) }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export function buildLevelUp(
  sheet: Sheet,
  grant: LevelGrant,
  picks: Record<string, string[]> = {},
): SheetPatch {
  const taken = (id: string): string[] => picks[id] ?? []
  const out: SheetPatch = { level: (sheet.level ?? 1) + 1 }

  if (grant.hitDie && sheet.hpMax !== null) out.hpMax = sheet.hpMax + averageOf(grant.hitDie)

  // The row states every slot at the new level, not the difference.
  if (sheet.spellcasting && grant.slots) {
    const slots = { ...sheet.spellcasting.slots, ...grant.slots }
    if (!same(slots, sheet.spellcasting.slots)) out.spellcasting = { ...sheet.spellcasting, slots }
  }

  // Traits: granted outright, then picked. Appended, because a patch replaces
  // a list rather than merging into it.
  const takenTraits = new Set(sheet.traits.map((t) => t.id))
  const add = (f: Feature): Trait => {
    const id = slugId(f.name, takenTraits)
    takenTraits.add(id)
    return { id, name: f.name.trim(), text: f.text.trim(), source: 'class' }
  }
  const added: Trait[] = (grant.features ?? []).map(add)
  for (const choice of grant.choices ?? []) {
    if (choice.kind !== 'features') continue
    for (const name of taken(choice.id)) {
      const feature = choice.from.find((f) => f.name === name)
      if (feature) added.push(add(feature))
    }
  }
  if (added.length > 0) out.traits = [...sheet.traits, ...added]

  // Skills: only what a choice offered and the person took.
  let skills = sheet.skills
  for (const choice of grant.choices ?? []) {
    if (choice.kind !== 'skills') continue
    const allowed = new Set(skillOptions(sheet, choice))
    for (const key of taken(choice.id) as SkillKey[]) {
      if (allowed.has(key)) skills = { ...skills, [key]: { ...skills[key], prof: choice.as } }
    }
  }
  if (!same(skills, sheet.skills)) out.skills = skills

  // Spells: appended too, and looked up in the same pool the picker offered.
  const takenSpells = new Set(sheet.spells.map((s) => s.id))
  const spells: Spell[] = []
  for (const choice of grant.choices ?? []) {
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
