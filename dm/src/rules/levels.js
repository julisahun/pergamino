/* Levels 1 to 20 — the tables, and nothing but the tables.

   This is the part of levelling that is arithmetic: how big the proficiency
   bonus is, how many hit points a level is worth, how many spell slots of
   which level a class has, when an ability increase is due, when a subclass
   is chosen. All of it is a handful of rows.

   What is deliberately NOT here is the other part: what a class feature does.
   That is a text the DM writes when the level is taken (`LevelUp.features`),
   because transcribing twelve classes × twenty levels of the SRD would be a
   different project, would be wrong within a year, and would not make a single
   card at the table more useful.

   Paraphrased from the SRD 5.2 (CC-BY-4.0, © Wizards of the Coast). */

/** @import { Character } from '../shared/types.js' */
import { CLASSES } from './data.js';

export const MAX_LEVEL = 20;

/** What level a sheet is at. A character exported by the creator is level 1
    and has no `levels` at all; each entry is one level taken since.
    @param {Character} c */
export const levelOf = c =>
  Math.min(MAX_LEVEL, 1 + (Array.isArray(c?.levels) ? c.levels.length : 0));

/** +2 at 1st, and one more every four levels after 4th. @param {number} level */
export const proficiencyBonus = level =>
  2 + Math.floor((Math.max(1, Math.min(MAX_LEVEL, level)) - 1) / 4);

/** The levels that grant an ability score increase (or a feat instead).
    Fighters and Rogues get extra ones — the only class-specific rows here.
    @param {string|null} classKey @returns {number[]} */
export function asiLevels(classKey) {
  const base = [4, 8, 12, 16, 19];
  if (classKey === 'guerrero') return [4, 6, 8, 12, 14, 16, 19];
  if (classKey === 'picaro') return [4, 8, 10, 12, 16, 19];
  return base;
}

/** In the 2024 rules every class chooses its subclass at 3rd level. */
export const SUBCLASS_LEVEL = 3;

/** How a class gets its spell slots, if it does.
      'full'  bard, cleric, druid, sorcerer, wizard
      'half'  paladin, ranger — the full table at half the level, rounded up
      'pact'  warlock — few slots, all of the highest level, back on a short rest
    @type {Record<string, 'full'|'half'|'pact'>} */
export const CASTER_KIND = Object.freeze({
  bardo: 'full', clerigo: 'full', druida: 'full', hechicero: 'full', mago: 'full',
  paladin: 'half', explorador: 'half',
  brujo: 'pact',
});

/* The full caster's slot table: one row per level, one number per spell level.
   Half casters read row ceil(level / 2) of this same table, which is what the
   half-caster table IS — worth stating once here rather than copying twenty
   more rows that could drift from it. */
const FULL = Object.freeze([
  /*  1 */[2],
  /*  2 */[3],
  /*  3 */[4, 2],
  /*  4 */[4, 3],
  /*  5 */[4, 3, 2],
  /*  6 */[4, 3, 3],
  /*  7 */[4, 3, 3, 1],
  /*  8 */[4, 3, 3, 2],
  /*  9 */[4, 3, 3, 3, 1],
  /* 10 */[4, 3, 3, 3, 2],
  /* 11 */[4, 3, 3, 3, 2, 1],
  /* 12 */[4, 3, 3, 3, 2, 1],
  /* 13 */[4, 3, 3, 3, 2, 1, 1],
  /* 14 */[4, 3, 3, 3, 2, 1, 1],
  /* 15 */[4, 3, 3, 3, 2, 1, 1, 1],
  /* 16 */[4, 3, 3, 3, 2, 1, 1, 1],
  /* 17 */[4, 3, 3, 3, 2, 1, 1, 1, 1],
  /* 18 */[4, 3, 3, 3, 3, 1, 1, 1, 1],
  /* 19 */[4, 3, 3, 3, 3, 2, 1, 1, 1],
  /* 20 */[4, 3, 3, 3, 3, 2, 2, 1, 1],
]);

/** The warlock's pact magic: how many slots, and what level they all are.
    @param {number} level @returns {{slots: number, level: number}} */
export function pactMagic(level) {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  const slots = l === 1 ? 1 : l < 11 ? 2 : l < 17 ? 3 : 4;
  return { slots, level: Math.min(5, Math.ceil(l / 2)) };
}

/**
 * Spell slots at a level, as {spellLevel: count}. Pact magic answers under the
 * key 'pact' instead, because its slots are one pool of one level that a short
 * rest brings back — a different thing wearing the same word.
 *
 * @param {string|null} classKey @param {number} level
 * @returns {Record<string, number>}
 */
export function slotsAt(classKey, level) {
  const kind = CASTER_KIND[classKey ?? ''];
  if (!kind) return {};
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  if (kind === 'pact') {
    const p = pactMagic(l);
    return { pact: p.slots };
  }
  const row = FULL[(kind === 'half' ? Math.ceil(l / 2) : l) - 1] ?? [];
  /** @type {Record<string, number>} */
  const out = {};
  row.forEach((n, i) => { if (n > 0) out[String(i + 1)] = n; });
  return out;
}

/** The highest spell level this character can cast, 0 if none. Pact magic's
    single level counts. @param {string|null} classKey @param {number} level */
export function topSpellLevel(classKey, level) {
  const kind = CASTER_KIND[classKey ?? ''];
  if (!kind) return 0;
  if (kind === 'pact') return pactMagic(level).level;
  const keys = Object.keys(slotsAt(classKey, level)).map(Number);
  return keys.length ? Math.max(...keys) : 0;
}

/** Hit points a class gains on taking a level, using the fixed average — half
    the die plus one, which is what a table takes when it does not want to roll.
    A DM who rolled types the number in instead. @param {string|null} classKey */
export function averageHitPoints(classKey) {
  const die = CLASSES[classKey ?? '']?.hitDie;
  return die ? Math.floor(die / 2) + 1 : 0;
}

/** The hit die, as it is written on a card: `5d8`.
    @param {string|null} classKey @param {number} level */
export function hitDice(classKey, level) {
  const die = CLASSES[classKey ?? '']?.hitDie;
  return die ? `${Math.max(1, level)}d${die}` : '';
}

/** What taking this level introduces, so a wizard can ask about exactly that
    and nothing else. Species and background are level-1 facts and never appear.
    @param {string|null} classKey @param {number} level */
export function levelBrings(classKey, level) {
  const before = slotsAt(classKey, level - 1);
  const after = slotsAt(classKey, level);
  /* Every slot level whose count moved, with both numbers: a wizard can then
     say «2º: nuevas» and «1º: una más» rather than lumping them together. */
  /** @type {{level: string, from: number, to: number}[]} */
  const newSlots = [];
  for (const [k, n] of Object.entries(after)) {
    const from = before[k] ?? 0;
    if (from !== n) newSlots.push({ level: k, from, to: n });
  }
  return {
    proficiencyBonus: proficiencyBonus(level) > proficiencyBonus(level - 1)
      ? proficiencyBonus(level) : null,
    asi: asiLevels(classKey).includes(level),
    subclass: level === SUBCLASS_LEVEL,
    slots: newSlots,
    hitPoints: averageHitPoints(classKey),
  };
}
