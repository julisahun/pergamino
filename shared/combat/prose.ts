/**
 * Reading numbers out of the prose a human wrote for a human.
 *
 * Two callers, for two different reasons, which is why this is its own file:
 *
 * - `combat/attacks.ts`, at read time, for a **PNJ**. A pnj is an Obsidian
 *   note whose statblock says «+3 al ataque, 1d6+1 de daño cortante», and
 *   asking the DM to restate that in a second structured field would mean two
 *   places that can disagree. That prose is the format, permanently.
 * - `vault/sheet.ts`, at **import** time, for a player. A `-fc5.xml` writes
 *   «Ataque +5, daño 1d6 +3 perforante» and used to be re-read on every load;
 *   now it is read once, on the way in, and what is stored is the numbers.
 *
 * Both languages, because a campaign folder is written in whichever the DM
 * writes in: `marea-baja` is Spanish and the shipped fixture is English. That
 * is one format in two languages, so it is one alternation rather than a
 * setting somebody has to get right.
 */
import { parseDice, type Dice } from './dice.ts'

/**
 * «+3 al ataque», «+3 a impactar», «+4 to hit» — a statblock's to-hit bonus.
 *
 * The third spelling is there because `instructions.md` writes it that way,
 * and a statblock converted by following the contract has to parse.
 */
export const HIT_MOD = /([+-]\s*\d+)\s*(?:al\s+ataque|a\s+impactar|to\s+hit)/i

/** `Ataque +4,` — how the sheet generator states it. */
export const SHEET_MOD = /\b(?:ataque|attack)\s*([+-]\s*\d+)/i

export const signed = (raw: string): number => Number.parseInt(raw.replace(/\s+/g, ''), 10)

const DIE = String.raw`\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?`

/**
 * The dice that are *damage*, not some other number in the same sentence.
 *
 * Anchored on the word every format puts beside them — `1d6+1 de daño`,
 * `1d4+2 piercing damage`, `daño 1d4 +2` — so that «munición 24/96», «a 1,5 m»
 * and a spell's range cannot be mistaken for a roll.
 */
export function damageDice(text: string): Dice | null {
  const before = new RegExp(
    String.raw`(${DIE})\s*(?:de\s+)?(?:[\wáéíóúñ]+\s+)?(?:daño|damage)`,
    'i',
  ).exec(text)
  if (before) return parseDice(before[1]!)
  const after = new RegExp(String.raw`(?:daño|damage)\s*:?\s*(${DIE})`, 'i').exec(text)
  return after ? parseDice(after[1]!) : null
}

/**
 * The damage type, when the prose names one: `1d6+3 perforante`, `1d4+2
 * piercing damage`. Dropped by everything that resolves an attack — nothing in
 * this app resists, absorbs or doubles anything — and kept on a player's
 * weapon only so the sheet can show what it always showed.
 */
export function damageType(text: string): string | null {
  const es = new RegExp(String.raw`${DIE}\s*(?:de\s+)?da[ñn]o\s+([\wáéíóúñ]+)`, 'i').exec(text)
  if (es) return es[1]!
  const es2 = new RegExp(String.raw`${DIE}\s+([\wáéíóúñ]+)(?=\s*[.,]|$)`, 'i').exec(text)
  if (es2) return es2[1]!
  const en = new RegExp(String.raw`${DIE}\s+([\w]+)\s+damage`, 'i').exec(text)
  return en ? en[1]! : null
}
