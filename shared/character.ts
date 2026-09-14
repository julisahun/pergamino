/**
 * A character, as the app owns it.
 *
 * This is the source of truth. Nothing re-derives it from a file, and no
 * uploaded document outranks it: a `-fc5.xml` is read **once**, at the moment
 * a character is created, and after that it is provenance rather than an
 * authority. What used to be `SheetStats` — a read-only projection of that
 * xml, rebuilt from the text on every load — is now a record the DM and the
 * player edit, which is what makes levelling up an edit rather than a
 * re-upload.
 *
 * ## Stored, or worked out
 *
 * The split is deliberate and it is the one decision everything else here
 * follows: **store what the rules make messy, work out what is a clean
 * formula.**
 *
 * - Stored: `hpMax`, `ac`, `initiative`, `abilities`, `proficiency`. A suit of
 *   armour, a shield, a Dex cap, *Armadura de Mago*, *Alerta* — the number a
 *   sheet quotes for these is the end of an argument this app is not having.
 * - Worked out: every skill, every saving throw, passive perception, the spell
 *   save DC and the spell attack bonus. Each is one line of arithmetic over
 *   numbers that *are* stored, so bumping `proficiency` to 3 at level 5 fixes
 *   eighteen skills, six saves, a DC and an attack bonus at once instead of
 *   asking someone to retype them and get one wrong.
 *
 * Every worked-out number has an override beside it, because a formula that
 * cannot be overruled is a rule this app is enforcing. A `mod` on a skill or a
 * save wins over the arithmetic; so do `passivePerception`, `spellcasting.dc`
 * and `spellcasting.attack`. An override is a number a human typed, which is
 * the same standing the old `stated` line had.
 *
 * ## What is not here
 *
 * Money. `LiveState.gold` is the character's gold — the one the player edits
 * and the DM hands out — and the sheet used to carry a second copy from
 * `<money>` that was written once at import and read by nobody. Items are
 * still in two places on purpose (`items` here is what the build starts with,
 * `LiveState.inventory` is the free text of what they are carrying now); that
 * one is a real duplication and it is left standing until it hurts.
 */

// --- the six ---------------------------------------------------------------

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

/** The order `<abilities>` writes the six, and the index a save id names. */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const satisfies readonly AbilityKey[]

export interface Abilities {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

/** The six, labelled the way a sheet writes them. */
export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'FUE',
  dex: 'DES',
  con: 'CON',
  int: 'INT',
  wis: 'SAB',
  cha: 'CAR',
}

/** `10` → `0`, `17` → `+3`. The one piece of arithmetic nobody argues about. */
export const abilityMod = (score: number): number => Math.floor((score - 10) / 2)

/** `+2` / `-1` / `+0`, the way a sheet writes a modifier. */
export const formatMod = (mod: number): string => (mod < 0 ? `${mod}` : `+${mod}`)

// --- the eighteen ----------------------------------------------------------

export type SkillKey =
  | 'acrobacias'
  | 'arcanos'
  | 'atletismo'
  | 'engano'
  | 'historia'
  | 'interpretacion'
  | 'intimidacion'
  | 'investigacion'
  | 'juego-de-manos'
  | 'medicina'
  | 'naturaleza'
  | 'percepcion'
  | 'perspicacia'
  | 'persuasion'
  | 'religion'
  | 'sigilo'
  | 'supervivencia'
  | 'trato-con-animales'

export interface Skill {
  key: SkillKey
  /** The Spanish the campaign notes and the sheets use. */
  name: string
  ability: AbilityKey
}

/**
 * All eighteen, alphabetical in Spanish, which is how a sheet lists them.
 *
 * The key is ascii and stable; the name is what goes on screen. Which ability
 * a skill keys off is a name, not a derivation — the same kind of vocabulary
 * table as `conditions.ts`.
 */
export const SKILLS: readonly Skill[] = [
  { key: 'acrobacias', name: 'Acrobacias', ability: 'dex' },
  { key: 'arcanos', name: 'Arcanos', ability: 'int' },
  { key: 'atletismo', name: 'Atletismo', ability: 'str' },
  { key: 'engano', name: 'Engaño', ability: 'cha' },
  { key: 'historia', name: 'Historia', ability: 'int' },
  { key: 'interpretacion', name: 'Interpretación', ability: 'cha' },
  { key: 'intimidacion', name: 'Intimidación', ability: 'cha' },
  { key: 'investigacion', name: 'Investigación', ability: 'int' },
  { key: 'juego-de-manos', name: 'Juego de Manos', ability: 'dex' },
  { key: 'medicina', name: 'Medicina', ability: 'wis' },
  { key: 'naturaleza', name: 'Naturaleza', ability: 'int' },
  { key: 'percepcion', name: 'Percepción', ability: 'wis' },
  { key: 'perspicacia', name: 'Perspicacia', ability: 'wis' },
  { key: 'persuasion', name: 'Persuasión', ability: 'cha' },
  { key: 'religion', name: 'Religión', ability: 'int' },
  { key: 'sigilo', name: 'Sigilo', ability: 'dex' },
  { key: 'supervivencia', name: 'Supervivencia', ability: 'wis' },
  { key: 'trato-con-animales', name: 'Trato con Animales', ability: 'wis' },
]

const BY_NAME = new Map(
  SKILLS.map((s) => [s.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), s.key]),
)

/** `Juego de Manos`, `juego de manos`, `JUEGO DE MANOS` → `juego-de-manos`. */
export const skillKeyOf = (name: string): SkillKey | null =>
  BY_NAME.get(name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()) ?? null

export const SKILL_BY_KEY: Record<SkillKey, Skill> = Object.fromEntries(
  SKILLS.map((s) => [s.key, s]),
) as Record<SkillKey, Skill>

// --- what the sheet holds --------------------------------------------------

export type Prof = 'proficient' | 'expertise'

/**
 * What the sheet says about one skill.
 *
 * Absent from `Sheet.skills` means "plain ability modifier, nothing special".
 * `prof` drives the arithmetic; `mod`, when present, overrules it.
 */
export interface SkillEntry {
  prof?: Prof
  /** An override: a number a human typed, which beats the formula. */
  mod?: number
}

/** The same, for one saving throw. */
export interface SaveEntry {
  proficient?: boolean
  mod?: number
}

export interface Weapon {
  /** Stable within one sheet, so a rename does not lose the row. */
  id: string
  name: string
  /** The attack bonus. Null when nothing states one — some things just hit. */
  mod: number | null
  /** Damage: `1d6+3`. The marker that this item is something to swing. */
  dice: string
  /** `perforante`. Nothing in this app resists anything; it is here to read. */
  damageType: string | null
  text: string
}

export interface Spell {
  id: string
  name: string
  /** `0` is a cantrip. */
  level: number
  /** The dice the spell rolls, as its own entry states them. No roll, no action. */
  roll: string | null
  school: string | null
  time: string | null
  range: string | null
  duration: string | null
  /** `V, S, M (un poco de lana)`. */
  components: string
  ritual: boolean
  /** The classes whose list it is on. */
  classes: string[]
  text: string
}

/** Where a trait came from. */
export type TraitSource = 'species' | 'class' | 'background' | 'feat'

export interface Trait {
  id: string
  name: string
  text: string
  source: TraitSource
}

export type ItemKind = 'light' | 'medium' | 'heavy' | 'shield' | 'melee' | 'ranged' | 'ammo'
export type ItemSlot = 'weapon' | 'shield' | 'armor'

export interface Item {
  id: string
  name: string
  kind: ItemKind | null
  /** Set when it is worn or in hand. */
  equipped: ItemSlot | null
  quantity: number
  weight: number | null
  /** The armour's base value — never the character's AC, which is stored. */
  ac: number | null
  /** `1d6` — the bare die, for an item that is also a weapon. Display only. */
  damage: string | null
  text: string
}

export interface Spellcasting {
  /** Which of the six the spells key off. */
  ability: AbilityKey
  /** Maximum slots by level: `{ "1": 3 }`. What is spent is live state. */
  slots: Record<string, number>
  /** Override for `8 + proficiency + ability`. */
  dc?: number
  /** Override for `proficiency + ability`. */
  attack?: number
}

/**
 * The character.
 *
 * Numbers are nullable because an imported sheet can be silent about one, and
 * `null` reading as «—» on screen is the app saying it was not told. That is
 * the truth and it is useful, where a `0` would be neither.
 */
export interface Sheet {
  name: string
  species: string | null
  className: string | null
  subclass: string | null
  background: string | null
  level: number | null

  abilities: Abilities | null
  proficiency: number | null

  hpMax: number | null
  ac: number | null
  initiative: number | null
  speed: number | null
  /** Override for `10 + percepción`. */
  passivePerception?: number | null

  saves: Partial<Record<AbilityKey, SaveEntry>>
  skills: Partial<Record<SkillKey, SkillEntry>>
  spellcasting: Spellcasting | null

  weapons: Weapon[]
  spells: Spell[]
  traits: Trait[]
  items: Item[]
}

export const emptySheet = (): Sheet => ({
  name: '',
  species: null,
  className: null,
  subclass: null,
  background: null,
  level: null,
  abilities: null,
  proficiency: null,
  hpMax: null,
  ac: null,
  initiative: null,
  speed: null,
  saves: {},
  skills: {},
  spellcasting: null,
  weapons: [],
  spells: [],
  traits: [],
  items: [],
})

// --- what is worked out ----------------------------------------------------

const modOf = (sheet: Sheet, ability: AbilityKey): number | null => {
  const score = sheet.abilities?.[ability]
  return score === undefined ? null : abilityMod(score)
}

export interface SkillRow extends Skill {
  /** Null when there are no scores to work from and no override either. */
  mod: number | null
  proficient: boolean
  expertise: boolean
  /** True when a human typed this number and the formula was not used. */
  override: boolean
}

/**
 * One skill: the ability's modifier, plus proficiency, doubled for expertise.
 *
 * An override wins outright. With no scores and no override there is no
 * number, and `null` is the honest answer.
 */
export function skillRow(sheet: Sheet, key: SkillKey): SkillRow {
  const skill = SKILL_BY_KEY[key]
  const entry = sheet.skills[key]
  const proficient = entry?.prof === 'proficient' || entry?.prof === 'expertise'
  const expertise = entry?.prof === 'expertise'
  const flags = { ...skill, proficient, expertise }
  if (entry?.mod !== undefined) return { ...flags, mod: entry.mod, override: true }
  const base = modOf(sheet, skill.ability)
  if (base === null) return { ...flags, mod: null, override: false }
  const bonus = sheet.proficiency
  if (proficient && bonus !== null) {
    return { ...flags, mod: base + bonus * (expertise ? 2 : 1), override: false }
  }
  return { ...flags, mod: base, override: false }
}

/** All eighteen, in the order `SKILLS` lists them. */
export const skillRows = (sheet: Sheet | undefined): SkillRow[] =>
  SKILLS.map((s) =>
    sheet
      ? skillRow(sheet, s.key)
      : { ...s, mod: null, proficient: false, expertise: false, override: false },
  )

export interface SheetSaveRow {
  ability: AbilityKey
  label: string
  mod: number | null
  proficient: boolean
  override: boolean
}

/** One saving throw: the ability's modifier, plus proficiency when trained. */
export function saveRow(sheet: Sheet, ability: AbilityKey): SheetSaveRow {
  const entry = sheet.saves[ability]
  const proficient = entry?.proficient === true
  const label = ABILITY_LABEL[ability]
  if (entry?.mod !== undefined) {
    return { ability, label, mod: entry.mod, proficient, override: true }
  }
  const base = modOf(sheet, ability)
  if (base === null) return { ability, label, mod: null, proficient, override: false }
  const bonus = sheet.proficiency
  return {
    ability,
    label,
    mod: proficient && bonus !== null ? base + bonus : base,
    proficient,
    override: false,
  }
}

/** All six, in the order `<abilities>` writes them. */
export const sheetSaveRows = (sheet: Sheet | undefined): SheetSaveRow[] =>
  ABILITY_KEYS.map((ability) =>
    sheet
      ? saveRow(sheet, ability)
      : { ability, label: ABILITY_LABEL[ability], mod: null, proficient: false, override: false },
  )

/** Maximum spell slots by level, or none at all for someone who does not cast. */
export const slotsOf = (sheet: Sheet): Record<string, number> => sheet.spellcasting?.slots ?? {}

/** `10 + Percepción`, or whatever a human typed instead. */
export function passivePerceptionOf(sheet: Sheet): number | null {
  if (sheet.passivePerception !== undefined && sheet.passivePerception !== null) {
    return sheet.passivePerception
  }
  const percepcion = skillRow(sheet, 'percepcion').mod
  return percepcion === null ? null : 10 + percepcion
}

/** The modifier the spells key off, before proficiency. */
const castingMod = (sheet: Sheet): number | null =>
  sheet.spellcasting ? modOf(sheet, sheet.spellcasting.ability) : null

/** `8 + competencia + modificador`, or the override. */
export function spellDcOf(sheet: Sheet): number | null {
  if (!sheet.spellcasting) return null
  if (sheet.spellcasting.dc !== undefined) return sheet.spellcasting.dc
  const mod = castingMod(sheet)
  return mod === null || sheet.proficiency === null ? null : 8 + sheet.proficiency + mod
}

/** `competencia + modificador`, or the override. */
export function spellAttackOf(sheet: Sheet): number | null {
  if (!sheet.spellcasting) return null
  if (sheet.spellcasting.attack !== undefined) return sheet.spellcasting.attack
  const mod = castingMod(sheet)
  return mod === null || sheet.proficiency === null ? null : sheet.proficiency + mod
}

/**
 * What a healing spell adds to its dice.
 *
 * «Curas 2d8 + tu modificador de lanzamiento» never writes the number, so it
 * comes off the casting ability directly now that the sheet states which one
 * it is — where the old projection had to work it back out of the attack bonus
 * minus proficiency.
 */
export const castingModifier = (sheet: Sheet): number => castingMod(sheet) ?? 0

// --- checking one on the way in --------------------------------------------

/**
 * Whether a patch is something this app is willing to write, and why not.
 *
 * The record is the source of truth now, so it arrives over the wire and has
 * to be checked before it lands — where the xml path had `isFc5Sheet` and a
 * parser that simply ignored what it did not understand. This is the same job
 * for the same reason: an unknown key or a number out of range is a bug or an
 * attack, and either way it does not belong in a character.
 *
 * Deliberately shallow. It checks the shape of each field, not that the
 * character makes sense: whether a level 2 rogue should have 17 hit points is
 * the DM's call, and this file has no opinion — that is the whole design.
 */
const NUMERIC: Record<string, [number, number]> = {
  level: [1, 20],
  proficiency: [0, 10],
  hpMax: [0, 1000],
  ac: [0, 50],
  initiative: [-10, 30],
  speed: [0, 1000],
  passivePerception: [0, 50],
}
const TEXT = ['name', 'species', 'className', 'subclass', 'background']
const LISTS = ['weapons', 'spells', 'traits', 'items']
const MAX_TEXT = 4000
const MAX_LIST = 500

export function sheetPatchError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'La ficha tiene que ser un objeto'
  }
  const patch = value as Record<string, unknown>
  const known = new Set([...TEXT, ...Object.keys(NUMERIC), ...LISTS, 'abilities', 'saves', 'skills', 'spellcasting'])
  for (const [key, v] of Object.entries(patch)) {
    if (!known.has(key)) return `No sé qué es «${key}»`
    if (TEXT.includes(key)) {
      if (v !== null && typeof v !== 'string') return `«${key}» tiene que ser texto`
      if (typeof v === 'string' && v.length > MAX_TEXT) return `«${key}» es demasiado largo`
      continue
    }
    const range = NUMERIC[key]
    if (range) {
      if (v === null) continue
      if (typeof v !== 'number' || !Number.isFinite(v)) return `«${key}» tiene que ser un número`
      if (v < range[0] || v > range[1]) return `«${key}» se sale de lo razonable`
      continue
    }
    if (LISTS.includes(key)) {
      if (!Array.isArray(v)) return `«${key}» tiene que ser una lista`
      if (v.length > MAX_LIST) return `«${key}» tiene demasiadas cosas`
      continue
    }
    // abilities, saves, skills, spellcasting: an object, or nothing
    if (v !== null && (typeof v !== 'object' || Array.isArray(v))) return `«${key}» tiene que ser un objeto`
  }
  const abilities = patch.abilities
  if (abilities && typeof abilities === 'object') {
    for (const key of ABILITY_KEYS) {
      const score = (abilities as Record<string, unknown>)[key]
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 1 || score > 30) {
        return `«${key}» tiene que ser una puntuación de 1 a 30`
      }
    }
  }
  return null
}

/** «Enano clérigo de nivel 1 (Acólito)» — for a card's second line. */
export function summaryOf(sheet: Sheet): string | null {
  const parts = [sheet.species, sheet.className].filter(Boolean).join(' ')
  const level = sheet.level === null ? '' : ` de nivel ${sheet.level}`
  const background = sheet.background ? ` (${sheet.background})` : ''
  const out = `${parts}${level}${background}`.trim()
  return out === '' ? null : out
}
