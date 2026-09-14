/**
 * What a combatant can *do*, read out of the prose that already describes it.
 *
 * Reading, and only reading. Nothing here judges whether an action landed:
 * the app has no save bonus for a PNJ to judge one against, and a verdict it
 * had to invent a modifier for was worse than no verdict at all. What comes
 * out of this file is a list for the DM to read.
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
import { castingModifier, spellAttackOf, spellDcOf, type Sheet, type Spell, type Weapon } from '../character.ts'
import { parseDice, withMod, type Dice } from './dice.ts'
import { damageDice, HIT_MOD, signed } from './prose.ts'

/**
 * How an action lands — which is what the line about it has to say.
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
//
// `HIT_MOD`, `damageDice` and `signed` moved to `./prose.ts` when a player's
// weapon stopped being prose. They are still what reads a **pnj**, whose
// statblock is a note a human wrote; the importer uses them once, on the way
// in, for the sheet a generator wrote.

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

/**
 * A weapon, which arrives already read.
 *
 * This used to run `SHEET_MOD` and `damageDice` over the generated line on
 * every load. The numbers are on the record now — taken out of that prose once,
 * by the importer — so all that is left is the shape change.
 */
function weaponAttack(weapon: Weapon): Attack | null {
  const dice = parseDice(weapon.dice)
  if (!dice) return null
  return {
    id: `weapon:${weapon.id}`,
    name: weapon.name,
    kind: 'attack',
    mod: weapon.mod,
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
function spellAction(spell: Spell, sheet: Sheet): Attack | null {
  // No dice, no action. This is the whole reason Misil Mágico («no fallan
  // nunca», three darts, one `<roll>` that describes none of that) and Grasa
  // stay off the list instead of being offered as something they are not.
  const rolled = parseDice(spell.roll ?? '')
  if (!rolled) return null

  const dc = spellDcOf(sheet)
  const base = {
    id: `spell:${spell.id}`,
    name: spell.name,
    level: spell.level,
    origin: 'spell' as const,
  }

  if (SPELL_ATTACK.test(spell.text)) {
    return { ...base, kind: 'attack', mod: spellAttackOf(sheet), dice: rolled, save: null }
  }

  const save = SPELL_SAVE.exec(spell.text)
  if (save && dc !== null) {
    return {
      ...base,
      kind: 'save',
      mod: null,
      dice: rolled,
      save: { dc, ability: save[1]!, half: SPELL_HALF.test(spell.text) },
    }
  }

  if (SPELL_HEAL.test(spell.text)) {
    // «Curas 2d8 + tu modificador de lanzamiento» — the modifier is never
    // written as a number. The record says which of the six the spells key
    // off, so it comes straight off that score; the old projection had to
    // work it back out of the attack bonus minus proficiency.
    return { ...base, kind: 'heal', mod: null, dice: withMod(rolled, castingModifier(sheet)), save: null }
  }

  return null
}

/** Everything a player's sheet can actually resolve: weapons, then spells. */
export function attacksOfSheet(sheet: Sheet | undefined): Attack[] {
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

