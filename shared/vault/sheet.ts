/**
 * Reading a `-fc5.xml` **into** a character, once.
 *
 * This file used to be the character: `parseSheet` ran on every load and its
 * output, `Sheet`, was what the app showed. The xml was the authority and
 * said so in its own `<note>` — *«si algún número de la app no coincide con
 * los de arriba, mandan los de arriba»*.
 *
 * That is over. `shared/character.ts` is the source of truth now, and this is
 * an **adapter on the way in**: it runs when a character is created, its
 * output is written to the database, and the xml is never consulted again.
 * What the DM's `pregenerados/fightclub.py` and Fight Club 5 produce still
 * gets a character into the app in one step, which is the whole reason it
 * survives — but a level-up is an edit to the record, not a new document.
 *
 * ## The one rule worth knowing
 *
 * The sheet quotes numbers that `Sheet` works out for itself: `Habilidades:
 * Sigilo +7 · Percepción +5`, `Salvaciones: SAB +5`, `CD 13`, `ataque +5`.
 * Each is compared against what the formula gives, and **stored as an override
 * only when the two disagree**. A sheet whose numbers are ordinary imports
 * with no overrides at all, so raising `proficiency` at level 5 moves every
 * one of them; a sheet with something the app cannot see — a magic item, a
 * feat, a house rule — pins that one number and leaves the rest alone.
 *
 * The scores in `<abilities>` are post-boost and stated, so their modifiers
 * are arithmetic on a given number rather than a rule being re-derived. `ac`,
 * `initiative` and `hpMax` are read and kept as-is, for the same reason they
 * are stored rather than computed.
 */
import {
  ABILITY_KEYS,
  abilityMod,
  emptySheet,
  skillKeyOf,
  skillRow,
  spellAttackOf,
  spellDcOf,
  type AbilityKey,
  type Abilities,
  type Item,
  type ItemKind,
  type ItemSlot,
  type SaveEntry,
  type Sheet,
  type SkillEntry,
  type SkillKey,
  type Spell,
  type Trait,
  type TraitSource,
  type Weapon,
} from '../character.ts'
import { damageDice, damageType, SHEET_MOD, signed } from '../combat/prose.ts'
import { formatDice } from '../combat/dice.ts'
import { EXPERTISE_CATEGORY, ITEM_KIND, ITEM_SLOT, SKILL_FC5_ORDER, SPELL_SCHOOLS } from './fc5.ts'

export { emptySheet }

// --- reading the xml -------------------------------------------------------

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)
  return m ? m[1]!.trim() : null
}

const int = (v: string | null): number | null => {
  if (v === null) return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

const float = (v: string | null): number | null => {
  if (v === null) return null
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/** Does this look like a Fight Club 5 character at all? The upload path asks. */
export const isFc5Sheet = (xml: string): boolean => /<pc\b[^>]*>[\s\S]*<character>/.test(xml)

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

/**
 * The rest of the line the sheet opens with `label:` — `Conjuros`,
 * `Habilidades`, `Salvaciones`.
 *
 * Scoped to the one line on purpose. `ataque` reads as the spell attack only
 * because it is asked for inside `Conjuros:`; loose in the note it would just
 * as happily match a weapon's.
 */
const statedLine = (text: string, label: string): string | null => {
  const m = new RegExp(`^[ \\t]*${label}\\s*:\\s*(.+)$`, 'im').exec(text)
  return m ? m[1]!.trim() : null
}

/** `Sigilo +7 · Percepción +5` → the two of them, by name. */
function statedMods(line: string | null): { name: string; mod: number }[] {
  if (!line) return []
  const out: { name: string; mod: number }[] = []
  for (const part of line.split(/[·,]/)) {
    const m = /^\s*(.+?)\s*([+-]\d+)\s*$/.exec(part)
    if (m) out.push({ name: m[1]!.trim(), mod: Number.parseInt(m[2]!, 10) })
  }
  return out
}

/** Every `<name>…</name>` block of one kind, in document order. */
function blocks(xml: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g')
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push(m[1]!)
  return out
}

/** A child tag's text, scoped to one block rather than to the document. */
const inner = (block: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)
  return m ? m[1]!.trim() : null
}

/** The first block of one kind, with where it sits — to place traits by section. */
function section(xml: string, name: string): { inner: string; start: number; end: number } | null {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)
  return m ? { inner: m[1]!, start: m.index, end: m.index + m[0].length } : null
}

/**
 * A trait's or item's `<mod>` children carry their own `<name>` and `<type>`,
 * so the parent's are read with the mods cut out first.
 */
const withoutMods = (block: string): string => block.replace(/<mod>[\s\S]*?<\/mod>/g, '')

const dedupe = <T>(xs: T[]): T[] => [...new Set(xs)]

/** `Juego de Manos` → `juego-de-manos`; unique within one list. */
function ids<T extends { name: string }>(rows: T[]): (T & { id: string })[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const base =
      row.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'x'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return { ...row, id: n === 0 ? base : `${base}-${n + 1}` }
  })
}

// --- the pieces ------------------------------------------------------------

const TRAIT_SECTION: Record<string, TraitSource> = {
  race: 'species',
  class: 'class',
  background: 'background',
}

/**
 * Every `<feat>`, attributed to the section it sits in — `<race>`, `<class>`,
 * `<background>` — or to the character itself when it sits in none.
 */
function traitsOf(xml: string): Trait[] {
  const sections = (['race', 'class', 'background'] as const).map(
    (name) => [name, section(xml, name)] as const,
  )
  const out: Omit<Trait, 'id'>[] = []
  const re = /<feat>([\s\S]*?)<\/feat>/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const at = m.index
    const found = sections.find(([, s]) => s && at > s.start && at < s.end)?.[0]
    const source: TraitSource = found ? TRAIT_SECTION[found]! : 'feat'
    const block = withoutMods(m[1]!)
    const name = inner(block, 'name')
    if (!name) continue
    out.push({ name, text: inner(block, 'text') ?? '', source })
  }
  return ids(out)
}

/** Every `<item>`, decoded through the format's own enumerations. */
function itemsOf(xml: string): Item[] {
  const out: Omit<Item, 'id'>[] = []
  for (const raw of blocks(xml, 'item')) {
    const block = withoutMods(raw)
    const name = inner(block, 'name')
    if (!name) continue
    const type = int(inner(block, 'type'))
    const slot = int(inner(block, 'slot'))
    out.push({
      name,
      kind: type === null ? null : ((ITEM_KIND[type] ?? null) as ItemKind | null),
      equipped: slot === null ? null : ((ITEM_SLOT[slot] ?? null) as ItemSlot | null),
      quantity: int(inner(block, 'quantity')) ?? 1,
      weight: float(inner(block, 'weight')),
      ac: int(inner(block, 'ac')),
      damage: inner(block, 'damage1H'),
      text: inner(block, 'text') ?? '',
    })
  }
  return ids(out)
}

/**
 * The items that are weapons, with their numbers taken out of the prose here
 * rather than on every read.
 *
 * `<damage1H>` is the marker, not the prose: the same character carries a
 * «Bastón» that has one and a «Bastón (foco arcano)» that does not, and only
 * the first is something to swing. The generated line («Ataque +5, daño 1d6 +3
 * perforante») is where the bonus and the final dice are; `<damage1H>` is the
 * fallback when that line is worded some other way.
 */
function weaponsOf(xml: string): Weapon[] {
  const out: Omit<Weapon, 'id'>[] = []
  for (const block of blocks(xml, 'item')) {
    const damage = inner(block, 'damage1H')
    const name = inner(block, 'name')
    if (!damage || !name) continue
    const text = inner(block, 'text') ?? ''
    const mod = SHEET_MOD.exec(text)
    const dice = damageDice(text) ?? damageDice(damage)
    out.push({
      name,
      mod: mod ? signed(mod[1]!) : null,
      dice: dice ? formatDice(dice) : damage,
      damageType: damageType(text),
      text,
    })
  }
  return ids(out)
}

/** `<v>1</v><s>1</s><m>1</m><materials>lana</materials>` → `V, S, M (lana)`. */
function componentsOf(block: string): string {
  const parts: string[] = []
  if (inner(block, 'v') === '1') parts.push('V')
  if (inner(block, 's') === '1') parts.push('S')
  if (inner(block, 'm') === '1') {
    const materials = inner(block, 'materials')
    parts.push(materials ? `M (${materials})` : 'M')
  }
  return parts.join(', ')
}

/** The spells, with `<level>` absent standing for a cantrip. */
function spellsOf(xml: string): Spell[] {
  const out: Omit<Spell, 'id'>[] = []
  for (const block of blocks(xml, 'spell')) {
    const name = inner(block, 'name')
    if (!name) continue
    const school = int(inner(block, 'school'))
    out.push({
      name,
      level: int(inner(block, 'level')) ?? 0,
      roll: inner(block, 'roll'),
      text: inner(block, 'text') ?? '',
      school: school === null ? null : (SPELL_SCHOOLS[school] ?? null),
      time: inner(block, 'time'),
      range: inner(block, 'range'),
      duration: inner(block, 'duration'),
      components: componentsOf(block),
      ritual: inner(block, 'ritual') === '1',
      classes: blocks(block, 'sclass').map((c) => c.trim()),
    })
  }
  return ids(out)
}

/**
 * `<proficiency>` ids — `0..5` a save by ability index, `100 + i` a skill —
 * and expertise as `<mod>` blocks of the expertise category. A sheet can state
 * one twice (Toribio's does); each is listed once.
 */
function proficientOf(xml: string): {
  saves: AbilityKey[]
  skills: SkillKey[]
  expertise: SkillKey[]
} {
  const saves: AbilityKey[] = []
  const skills: SkillKey[] = []
  for (const v of blocks(xml, 'proficiency')) {
    const n = int(v)
    if (n === null) continue
    if (n >= 0 && n < ABILITY_KEYS.length) saves.push(ABILITY_KEYS[n]!)
    else if (n >= 100) {
      const key = skillKeyOf(SKILL_FC5_ORDER[n - 100] ?? '')
      if (key) skills.push(key)
    }
  }
  const expertise: SkillKey[] = []
  for (const mod of blocks(xml, 'mod')) {
    if (int(inner(mod, 'category')) !== EXPERTISE_CATEGORY) continue
    const key = skillKeyOf(SKILL_FC5_ORDER[int(inner(mod, 'type')) ?? -1] ?? '')
    if (key) expertise.push(key)
  }
  return { saves: dedupe(saves), skills: dedupe(skills), expertise: dedupe(expertise) }
}

/** `Conjuros: Inteligencia · …` — the word the sheet uses for one of the six. */
const CASTING_ABILITY: Record<string, AbilityKey> = {
  fuerza: 'str',
  destreza: 'dex',
  constitucion: 'con',
  inteligencia: 'int',
  sabiduria: 'wis',
  carisma: 'cha',
}

const unaccent = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

const castingAbilityOf = (word: string | null): AbilityKey | null =>
  word ? (CASTING_ABILITY[unaccent(word)] ?? null) : null

/** `Salvaciones: SAB +5` names them by label, not by key. */
const SAVE_BY_LABEL: Record<string, AbilityKey> = {
  fue: 'str',
  des: 'dex',
  con: 'con',
  int: 'int',
  sab: 'wis',
  car: 'cha',
}

// --- the whole thing -------------------------------------------------------

/** Read a `-fc5.xml` into a character. Runs once, when the character is created. */
export function parseSheet(xml: string): Sheet {
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
  const conjuros = statedLine(note, 'Conjuros')
  const proficient = proficientOf(xml)

  // The character's own `<name>` is the document's first; a trait's or an
  // item's comes later. The three sections each open with their own name too.
  const race = section(xml, 'race')
  const cls = section(xml, 'class')
  const background = section(xml, 'background')

  const skills: Partial<Record<SkillKey, SkillEntry>> = {}
  for (const key of proficient.skills) skills[key] = { prof: 'proficient' }
  for (const key of proficient.expertise) skills[key] = { prof: 'expertise' }

  const saves: Partial<Record<AbilityKey, SaveEntry>> = {}
  for (const ability of proficient.saves) saves[ability] = { proficient: true }

  const castingAbility = castingAbilityOf(conjuros?.split(/[·,]/)[0]?.trim() ?? null)

  const sheet: Sheet = {
    ...emptySheet(),
    name: tag(xml, 'name') ?? '',
    species: race ? inner(race.inner, 'name') : null,
    className: cls ? inner(cls.inner, 'name') : null,
    subclass: null,
    background: background ? inner(background.inner, 'name') : null,
    level: int(tag(xml, 'level')),
    abilities,
    proficiency: numberAfter(note, 'Competencia'),
    hpMax: int(tag(xml, 'hpMax')) ?? numberAfter(note, 'PG'),
    ac: numberAfter(note, 'CA'),
    // The sheet's line wins; DEX alone is the fallback when there is no line.
    initiative: numberAfter(note, 'Iniciativa') ?? (abilities ? abilityMod(abilities.dex) : null),
    speed: race ? int(inner(race.inner, 'speed')) : null,
    saves,
    skills,
    spellcasting: castingAbility ? { ability: castingAbility, slots } : null,
    weapons: weaponsOf(xml),
    spells: spellsOf(xml),
    traits: traitsOf(xml),
    items: itemsOf(xml),
  }

  // Every number the sheet quotes that this app can work out for itself is
  // compared against the formula, and kept only when the two disagree. An
  // ordinary character imports with no overrides at all; one with something
  // the app cannot see pins that number and leaves the rest free to move.
  for (const stated of statedMods(statedLine(note, 'Habilidades'))) {
    const key = skillKeyOf(stated.name)
    if (!key) continue
    if (skillRow(sheet, key).mod !== stated.mod) skills[key] = { ...skills[key], mod: stated.mod }
  }
  for (const stated of statedMods(statedLine(note, 'Salvaciones'))) {
    const ability = SAVE_BY_LABEL[unaccent(stated.name)]
    if (!ability) continue
    const entry: SaveEntry = saves[ability] ?? {}
    const base = abilities ? abilityMod(abilities[ability]) : null
    const bonus = sheet.proficiency
    const computed = base === null ? null : entry.proficient && bonus !== null ? base + bonus : base
    if (computed !== stated.mod) saves[ability] = { ...entry, mod: stated.mod }
  }

  const passive = numberAfter(note, 'Percepción pasiva')
  if (passive !== null) {
    const percepcion = skillRow(sheet, 'percepcion').mod
    if (percepcion === null || 10 + percepcion !== passive) sheet.passivePerception = passive
  }

  if (sheet.spellcasting && conjuros) {
    const dc = numberAfter(conjuros, 'CD')
    if (dc !== null && spellDcOf(sheet) !== dc) sheet.spellcasting.dc = dc
    const attack = numberAfter(conjuros, 'ataque')
    if (attack !== null && spellAttackOf(sheet) !== attack) sheet.spellcasting.attack = attack
  }

  return sheet
}
