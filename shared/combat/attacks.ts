/**
 * What a combatant can *do*, read out of the prose that already describes it.
 *
 * Nothing was added to the campaign for this. A pnj note writes its attack the
 * way a statblock always did —
 *
 *     - name: Cimitarra
 *       desc: +3 al ataque, 1d6+1 de daño cortante.
 *
 * — and the `-fc5.xml` beside a player writes theirs the way `fightclub.py`
 * generates them (`Ataque +4, daño 1d4 +2 perforante.`). Both are regular
 * across every file in the vault, so this reads them rather than asking the DM
 * to restate them in a second format that could then disagree with the first.
 *
 * **A source with no numbers yields no action.** Ossian's «El agua lo cierra
 * todo», Tulio's «La sal», Misil Mágico's «no fallan nunca» — those are things
 * the DM runs by hand, and they stay prose on the ficha rather than appearing
 * in a list that implies the app understood them. The rule that gets that
 * right is *no dice, no action*: a spell with no `<roll>` is never offered.
 *
 * The damage *type* is deliberately dropped. Nothing in this app resists,
 * absorbs or doubles anything, so carrying "cortante" through to the log would
 * be decoration that reads like a mechanic.
 */
import type { Ability, Pnj } from '../types.ts'
import type { SheetSpell, SheetStats, SheetWeapon } from '../vault/sheet.ts'
import { parseDice, withMod, type Dice } from './dice.ts'

/**
 * How an action lands.
 *
 * - `attack` — a d20 against the target's AC, the attacker's own roll.
 * - `save`   — a DC the *target* rolls against, often for half.
 * - `heal`   — no roll to land at all; hit points back.
 */
export type AttackKind = 'attack' | 'save' | 'heal'

export interface AttackSave {
  dc: number
  /** The ability named in the prose: `Destreza`, `Sabiduría`. */
  ability: string
  /** «la mitad si acierta» — a made save still takes half. */
  half: boolean
}

export interface Attack {
  /** Unique within one combatant's list; the name is what a source has. */
  id: string
  name: string
  kind: AttackKind
  /** The attack bonus, for `kind: 'attack'`. Null when nothing states one. */
  mod: number | null
  /** Damage, or hit points restored for a heal. */
  dice: Dice
  save: AttackSave | null
  /** Spell level — `0` for a cantrip, `null` for a weapon or a pnj ability. */
  level: number | null
  origin: 'pnj' | 'weapon' | 'spell'
}

// --- the prose ------------------------------------------------------------

/**
 * Both languages, because a campaign folder is written in whichever the DM
 * writes in. `marea-baja` says «+3 al ataque, 1d6+1 de daño cortante»; the
 * demo campaign says «+4 to hit, 1d4+2 piercing damage». That is one format in
 * two languages, not two formats, so it is one pattern with an alternation
 * rather than a setting somebody has to get right.
 *
 * «a impactar» is the third spelling because `instructions.md` writes it that
 * way, and a statblock converted by following the contract has to parse. The
 * alternation is the cheap half of that agreement; `attacks.test.ts` pins all
 * three so the next phrasing added is a deliberate one.
 */
const HIT_MOD = /([+-]\s*\d+)\s*(?:al\s+ataque|a\s+impactar|to\s+hit)/i
/** `Ataque +4,` — how the sheet generator states it. */
const SHEET_MOD = /\b(?:ataque|attack)\s*([+-]\s*\d+)/i

const signed = (raw: string): number => Number.parseInt(raw.replace(/\s+/g, ''), 10)

const DIE = String.raw`\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?`

/**
 * The dice that are *damage*, not some other number in the same sentence.
 *
 * Anchored on the word every format puts beside them — `1d6+1 de daño`,
 * `1d4+2 piercing damage`, `daño 1d4 +2` — so that «munición 24/96», «a 1,5 m»
 * and a spell's range cannot be mistaken for a roll. The optional word in
 * between is the damage type, which English writes there and Spanish writes
 * after; either way nothing here keeps it.
 */
function damageDice(text: string): Dice | null {
  const before = new RegExp(
    String.raw`(${DIE})\s*(?:de\s+)?(?:[\wáéíóúñ]+\s+)?(?:daño|damage)`,
    'i',
  ).exec(text)
  if (before) return parseDice(before[1]!)
  const after = new RegExp(String.raw`(?:daño|damage)\s*:?\s*(${DIE})`, 'i').exec(text)
  return after ? parseDice(after[1]!) : null
}

// --- pnj ------------------------------------------------------------------

/**
 * The attacks among a pnj's abilities.
 *
 * **Damage is what makes one.** A to-hit bonus is taken when the ability
 * states one and left null when it does not — Gerald's Devastating Cuddle is
 * `2d8+4 crushing damage` and no bonus at all, and refusing to offer it would
 * be refusing to run the only attack the boss has. What that costs is the
 * verdict: with no bonus there is nothing to add to the d20, so the console
 * hands the hit/miss call back to the DM instead of inventing one.
 *
 * Everything that is not an attack — the ring, what the patrol does when its
 * sergeant falls, the sal, the water closing Ossian's wounds — states no
 * damage dice and is left alone.
 */
export function attacksOfAbilities(abilities: Ability[]): Attack[] {
  const out: Attack[] = []
  for (const ability of abilities) {
    const dice = damageDice(ability.desc)
    if (!dice) continue
    const mod = HIT_MOD.exec(ability.desc)
    out.push({
      id: ability.id,
      name: ability.name,
      kind: 'attack',
      mod: mod ? signed(mod[1]!) : null,
      dice,
      save: null,
      level: null,
      origin: 'pnj',
    })
  }
  return out
}

export const attacksOfPnj = (pnj: Pick<Pnj, 'abilities'>): Attack[] =>
  attacksOfAbilities(pnj.abilities)

// --- players --------------------------------------------------------------

/** `Ataque +5, daño 1d6 +3 perforante.` — the first line of a weapon's text. */
function weaponAttack(weapon: SheetWeapon): Attack | null {
  const mod = SHEET_MOD.exec(weapon.text)
  // `<damage1H>` is what marked this item a weapon in the first place, so it
  // is the fallback when the generated line is worded some other way.
  const dice = damageDice(weapon.text) ?? (weapon.damage ? parseDice(weapon.damage) : null)
  if (!dice) return null
  return {
    id: `weapon:${weapon.name}`,
    name: weapon.name,
    kind: 'attack',
    mod: mod ? signed(mod[1]!) : null,
    dice,
    save: null,
    level: null,
    origin: 'weapon',
  }
}

const SPELL_ATTACK = /ataque\s+de\s+conjuro/i
const SPELL_SAVE = /salvaci[óo]n\s+de\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/i
const SPELL_HALF = /mitad[^.]*si\s+acierta/i
const SPELL_HEAL = /\bcuras?\s+\d+\s*d\s*\d+/i

/**
 * Which of the three shapes a spell is, from what its own text says.
 *
 * The order matters: Rayo Guía mentions a later *ataque* in its rider and
 * Susurros Disonantes mentions *tiradas de ataque* in its, so «ataque de
 * conjuro» is asked for as a phrase and asked for first.
 */
function spellAction(spell: SheetSpell, sheet: SheetStats): Attack | null {
  // No dice, no action. This is the whole reason Misil Mágico («no fallan
  // nunca», three darts, one `<roll>` that describes none of that) and Grasa
  // stay off the list instead of being offered as something they are not.
  const rolled = parseDice(spell.roll ?? '')
  if (!rolled) return null

  const base = {
    id: `spell:${spell.name}`,
    name: spell.name,
    level: spell.level,
    origin: 'spell' as const,
  }

  if (SPELL_ATTACK.test(spell.text)) {
    return { ...base, kind: 'attack', mod: sheet.spellAttack, dice: rolled, save: null }
  }

  const save = SPELL_SAVE.exec(spell.text)
  if (save && sheet.spellDc !== null) {
    return {
      ...base,
      kind: 'save',
      mod: null,
      dice: rolled,
      save: { dc: sheet.spellDc, ability: save[1]!, half: SPELL_HALF.test(spell.text) },
    }
  }

  if (SPELL_HEAL.test(spell.text)) {
    // «Curas 2d8 + tu modificador de lanzamiento» — the modifier is never
    // written as a number, but the sheet states both numbers it falls out of:
    // an attack bonus is that modifier plus proficiency. Arithmetic on two
    // stated numbers, the same kind `abilityMod` already does — not a rule
    // being re-derived from a build.
    const casting =
      sheet.spellAttack !== null && sheet.proficiency !== null
        ? sheet.spellAttack - sheet.proficiency
        : 0
    return { ...base, kind: 'heal', mod: null, dice: withMod(rolled, casting), save: null }
  }

  return null
}

/** Everything a player's sheet can actually resolve: weapons, then spells. */
export function attacksOfSheet(sheet: SheetStats | undefined): Attack[] {
  if (!sheet) return []
  const out: Attack[] = []
  for (const weapon of sheet.weapons) {
    const attack = weaponAttack(weapon)
    if (attack) out.push(attack)
  }
  for (const spell of sheet.spells) {
    const action = spellAction(spell, sheet)
    if (action) out.push(action)
  }
  return out
}

// --- resolving ------------------------------------------------------------

/** A natural 20 always lands and doubles the dice; a natural 1 always misses. */
export const isCrit = (roll: number): boolean => roll === 20
export const isFumble = (roll: number): boolean => roll === 1

/**
 * Did it land? `null` for an AC nobody stated — the console shows the total
 * and lets the DM say.
 *
 * The verdict is only ever a suggestion: a wizard with Escudo up has an AC no
 * sheet knows about, which is why nothing applies until the DM presses
 * Aplicar.
 */
export function hits(roll: number, mod: number, ac: number | null): boolean | null {
  if (isCrit(roll)) return true
  if (isFumble(roll)) return false
  if (ac === null) return null
  return roll + mod >= ac
}

/** What a save does to the damage: nothing, half, or all of it. */
export const afterSave = (amount: number, made: boolean, half: boolean): number =>
  made ? (half ? Math.floor(amount / 2) : 0) : amount
