/**
 * Derived character numbers.
 *
 * The `-fc5.xml` a player uploads is the *computed* sheet — written by the
 * DM's own `pregenerados/fightclub.py`, or exported from Fight Club 5 — and it
 * is the only mechanical source there is. Reading `<hpMax>` from there beats
 * re-deriving hit points from class, CON and species traits (dwarven toughness
 * and the like) and getting it subtly wrong at the table — which is why the
 * creator's build recipe is not kept anywhere the app can see.
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
 *
 * `weapons` and `spells` are the raw blocks, not actions: this file knows the
 * xml, and `shared/combat/attacks.ts` knows what «Ataque +5, daño 1d6 +3» and
 * «Salvación de Destreza … la mitad si acierta» mean. An item counts as a
 * weapon because it has a `<damage1H>`, which is structural — «Bastón (foco
 * arcano)» and a túnica have none — rather than because its prose was read.
 *
 * The rest of the sheet — feats with their text, every item, the spells'
 * school and components, which skills and saves are proficient — is read too,
 * because the player's page is the whole character sheet and the xml already
 * carries all of it. Proficiency comes as numeric ids, decoded through the
 * tables in `fc5.ts`: a lookup, not a derivation.
 */
import {
  ABILITY_KEYS,
  EXPERTISE_CATEGORY,
  ITEM_KIND,
  ITEM_SLOT,
  SKILL_FC5_ORDER,
  SPELL_SCHOOLS,
  type ItemKind,
  type ItemSlot,
} from './fc5.ts'

/** The six scores, in the order `<abilities>` writes them. */
export interface Abilities {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

/**
 * One modifier the sheet states by name: `Sigilo +7`.
 *
 * Named rather than keyed, because the sheet is what decides which of these
 * are worth quoting — a rogue's two expertises and a cleric's none are the
 * same shape here.
 */
export interface StatedMod {
  name: string
  mod: number
}

/** One item the sheet arms the character with: `<damage1H>` says it is one. */
export interface SheetWeapon {
  name: string
  /** `<damage1H>` — the bare die, when the generated line is unreadable. */
  damage: string | null
  /** `Ataque +5, daño 1d6 +3 perforante.` plus whatever follows it. */
  text: string
}

/** One spell as the sheet lists it. `roll` is `<roll>`; no roll, no numbers. */
export interface SheetSpell {
  name: string
  /** `0` for a cantrip — `<level>` is absent on those. */
  level: number
  roll: string | null
  text: string
  /** `<school>` decoded: «Evocación». Null when unstated. */
  school: string | null
  time: string | null
  range: string | null
  duration: string | null
  /** `V, S, M (un poco de lana)` — the way a sheet abbreviates them. */
  components: string
  ritual: boolean
  /** `<sclass>` — the classes whose list it is on. */
  classes: string[]
}

/** Where a feat came from — the section of the xml it sits in. */
export type FeatSource = 'race' | 'class' | 'background' | 'feat'

/** One trait, with the text the sheet gives it. */
export interface SheetFeat {
  name: string
  text: string
  source: FeatSource
}

/** Every `<item>`, weapon or not. */
export interface SheetItem {
  name: string
  kind: ItemKind | null
  /** Set when the sheet has it worn or in hand. */
  equipped: ItemSlot | null
  quantity: number
  weight: number | null
  /** The armour's base value — never the character's AC. */
  ac: number | null
  damage: string | null
  text: string
}

/** What the sheet marks proficient, decoded from its ids. */
export interface Proficient {
  saves: (keyof Abilities)[]
  skills: string[]
  expertise: string[]
}

export interface SheetStats {
  /** `<name>` — the character's name as the sheet writes it. */
  name: string | null
  race: string | null
  /** `<class><name>`; `class` is a reserved word. */
  className: string | null
  background: string | null
  /** `<race><speed>`, in the unit the sheet uses. */
  speed: number | null
  /** `<money>`, in gold pieces. */
  money: number | null
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
  /** The casting ability the `Conjuros:` line names. Null for non-casters. */
  spellAbility: string | null
  /** `CD 13` — the save DC for this character's spells. */
  spellDc: number | null
  /** `ataque +5` — the spell attack bonus. */
  spellAttack: number | null
  /** What the `Habilidades:` line quotes, in the order it quotes it. */
  skills: StatedMod[]
  /** What the `Salvaciones:` line quotes. */
  saves: StatedMod[]
  /** The sheet's own first line: «Enano guerrero de nivel 1 (Guardia).» */
  summary: string | null
  /** Items with a damage die, in the order the sheet lists them. */
  weapons: SheetWeapon[]
  /** Spells that state a roll, in the order the sheet lists them. */
  spells: SheetSpell[]
  feats: SheetFeat[]
  items: SheetItem[]
  proficient: Proficient
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

const EMPTY: SheetStats = {
  name: null,
  race: null,
  className: null,
  background: null,
  speed: null,
  money: null,
  hpMax: null,
  initMod: null,
  level: null,
  slots: {},
  abilities: null,
  ac: null,
  passivePerception: null,
  proficiency: null,
  spellAbility: null,
  spellDc: null,
  spellAttack: null,
  skills: [],
  saves: [],
  summary: null,
  weapons: [],
  spells: [],
  feats: [],
  items: [],
  proficient: { saves: [], skills: [], expertise: [] },
}

export const emptySheet = (): SheetStats => ({
  ...EMPTY,
  slots: {},
  skills: [],
  saves: [],
  weapons: [],
  spells: [],
  feats: [],
  items: [],
  proficient: { saves: [], skills: [], expertise: [] },
})

/** Does this look like a Fight Club 5 character at all? The upload path asks. */
export const isFc5Sheet = (xml: string): boolean =>
  /<pc\b[^>]*>[\s\S]*<character>/.test(xml)

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

/**
 * `Sigilo +7 · Percepción +5` → the two of them, in that order.
 *
 * Nothing is computed here: a skill modifier is proficiency and expertise on
 * top of an ability, and this app does not re-derive that — the sheet says the
 * number or the app does not show one. Fight Club states skill proficiency as
 * opaque numeric ids (`<proficiency>104</proficiency>`), so deriving it would
 * mean guessing which skill each id is, and a guess here is a wrong number in
 * front of the players.
 */
function statedMods(line: string | null): StatedMod[] {
  if (!line) return []
  const out: StatedMod[] = []
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

/** The first block of one kind, with where it sits — to place feats by section. */
function section(xml: string, name: string): { inner: string; start: number; end: number } | null {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)
  return m ? { inner: m[1]!, start: m.index, end: m.index + m[0].length } : null
}

/**
 * A feat's or item's `<mod>` children carry their own `<name>` and `<type>`,
 * so the parent's are read with the mods cut out first.
 */
const withoutMods = (block: string): string => block.replace(/<mod>[\s\S]*?<\/mod>/g, '')

const float = (v: string | null): number | null => {
  if (v === null) return null
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : null
}

const dedupe = <T>(xs: T[]): T[] => [...new Set(xs)]

/**
 * Every `<feat>`, attributed to the section it sits in — `<race>`, `<class>`,
 * `<background>` — or to the character itself when it sits in none.
 */
function featsOf(xml: string): SheetFeat[] {
  const sections = (['race', 'class', 'background'] as const).map(
    (name) => [name, section(xml, name)] as const,
  )
  const out: SheetFeat[] = []
  const re = /<feat>([\s\S]*?)<\/feat>/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const at = m.index
    const source =
      sections.find(([, s]) => s && at > s.start && at < s.end)?.[0] ?? ('feat' as const)
    const block = withoutMods(m[1]!)
    const name = inner(block, 'name')
    if (!name) continue
    out.push({ name, text: inner(block, 'text') ?? '', source })
  }
  return out
}

/** Every `<item>`, decoded through the format's own enumerations. */
function itemsOf(xml: string): SheetItem[] {
  const out: SheetItem[] = []
  for (const raw of blocks(xml, 'item')) {
    const block = withoutMods(raw)
    const name = inner(block, 'name')
    if (!name) continue
    const type = int(inner(block, 'type'))
    const slot = int(inner(block, 'slot'))
    out.push({
      name,
      kind: type === null ? null : (ITEM_KIND[type] ?? null),
      equipped: slot === null ? null : (ITEM_SLOT[slot] ?? null),
      quantity: int(inner(block, 'quantity')) ?? 1,
      weight: float(inner(block, 'weight')),
      ac: int(inner(block, 'ac')),
      damage: inner(block, 'damage1H'),
      text: inner(block, 'text') ?? '',
    })
  }
  return out
}

/**
 * `<proficiency>` ids — `0..5` a save by ability index, `100 + i` a skill —
 * and expertise as `<mod>` blocks of the expertise category. A sheet can
 * state one twice (Toribio's does); each is listed once.
 */
function proficientOf(xml: string): Proficient {
  const saves: (keyof Abilities)[] = []
  const skills: string[] = []
  for (const v of blocks(xml, 'proficiency')) {
    const n = int(v)
    if (n === null) continue
    if (n >= 0 && n < ABILITY_KEYS.length) saves.push(ABILITY_KEYS[n]!)
    else if (n >= 100 && SKILL_FC5_ORDER[n - 100]) skills.push(SKILL_FC5_ORDER[n - 100]!)
  }
  const expertise: string[] = []
  for (const mod of blocks(xml, 'mod')) {
    if (int(inner(mod, 'category')) !== EXPERTISE_CATEGORY) continue
    const skill = SKILL_FC5_ORDER[int(inner(mod, 'type')) ?? -1]
    if (skill) expertise.push(skill)
  }
  return { saves: dedupe(saves), skills: dedupe(skills), expertise: dedupe(expertise) }
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

/**
 * The items that are weapons.
 *
 * `<damage1H>` is the marker, not the prose: the same character carries a
 * «Bastón» that has one and a «Bastón (foco arcano)» that does not, and only
 * the first is something to swing.
 */
function weaponsOf(xml: string): SheetWeapon[] {
  const out: SheetWeapon[] = []
  for (const block of blocks(xml, 'item')) {
    const damage = inner(block, 'damage1H')
    const name = inner(block, 'name')
    if (!damage || !name) continue
    out.push({ name, damage, text: inner(block, 'text') ?? '' })
  }
  return out
}

/** The spells, with `<level>` absent standing for a cantrip. */
function spellsOf(xml: string): SheetSpell[] {
  const out: SheetSpell[] = []
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
  return out
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

  // `Conjuros: Inteligencia · CD 13 · ataque +5 · 2 espacios de nivel 1`.
  // The slots are read off `<slots>` above; what only this line has is the
  // ability the spells key off and the two numbers the DM reads out loud.
  const conjuros = statedLine(note, 'Conjuros')
  const spellAbility = conjuros?.split(/[·,]/)[0]?.trim() || null

  // The character's own `<name>` is the document's first; a feat's or an
  // item's comes later. The three sections each open with their own name too.
  const race = section(xml, 'race')
  const cls = section(xml, 'class')
  const background = section(xml, 'background')

  return {
    name: tag(xml, 'name'),
    race: race ? inner(race.inner, 'name') : null,
    className: cls ? inner(cls.inner, 'name') : null,
    background: background ? inner(background.inner, 'name') : null,
    speed: race ? int(inner(race.inner, 'speed')) : null,
    money: float(tag(xml, 'money')),
    hpMax: int(tag(xml, 'hpMax')) ?? numberAfter(note, 'PG'),
    // The sheet's line wins; DEX alone is the fallback when there is no line.
    initMod: stated ?? (abilities ? abilityMod(abilities.dex) : null),
    level: int(tag(xml, 'level')),
    slots,
    abilities,
    ac: numberAfter(note, 'CA'),
    passivePerception: numberAfter(note, 'Percepción pasiva'),
    proficiency: numberAfter(note, 'Competencia'),
    spellAbility,
    spellDc: conjuros ? numberAfter(conjuros, 'CD') : null,
    spellAttack: conjuros ? numberAfter(conjuros, 'ataque') : null,
    skills: statedMods(statedLine(note, 'Habilidades')),
    saves: statedMods(statedLine(note, 'Salvaciones')),
    summary: note.split('\n')[0]?.trim() || null,
    weapons: weaponsOf(xml),
    spells: spellsOf(xml),
    feats: featsOf(xml),
    items: itemsOf(xml),
    proficient: proficientOf(xml),
  }
}
