/* Objects — a campaign's catalog of carried items, one objects/<slug>.json
   each. An object is a name, a description and its extras: numeric modifiers
   over the five stats every combatant handle exposes, plus free-text effect
   lines the app shows but never computes. Holders keep object *ids* (in
   `play.objects` for a player, on the npc instance itself); duplicates stack.
   The catalog rides on the session in memory (`session.objects`, injected
   from disk like the bestiary) and is never written into session.json. */

/** @import { ItemDef } from './types.js' */
import { newId } from '../rules/character.js';
import { signed } from '../rules/engine.js';

/** The whole modifier vocabulary. Anything beyond these five is a free-text
    effect — a player-side save or skill bonus would have to reach into the
    sync-guarded derive(), which is the creator's, not this app's. */
export const MOD_KEYS = [
  ['ac', 'CA'],
  ['hpMax', 'PG máx'],
  ['initMod', 'Mod. inic.'],
  ['speed', 'Velocidad (m)'],
  ['pp', 'Perc. pasiva'],
];

/** @param {any} o @returns {ItemDef} */
export function normaliseObject(o) {
  /** @type {Record<string, number>} */
  const mods = {};
  for (const [key] of MOD_KEYS) {
    const v = Number(o?.mods?.[key]);
    if (Number.isFinite(v) && v !== 0) mods[key] = v;
  }
  return {
    id: o?.id || newId(),
    name: String(o?.name || 'Sin nombre'),
    description: String(o?.description || ''),
    mods,
    effects: Array.isArray(o?.effects)
      ? o.effects.map((/** @type {any} */ e) => String(e).trim()).filter(Boolean)
      : [],
    file: typeof o?.file === 'string' ? o.file : undefined,   // objects/<name>.json, when it came from disk
  };
}

/** Same upsert contract as absorbBeast: re-reading an edited file updates the
    entry, a fresh id lands as a new one. */
/** @param {ItemDef[]} catalog @param {ItemDef} o */
export function absorbObject(catalog, o) {
  const at = catalog.findIndex(x => x.id === o.id);
  if (at >= 0) catalog[at] = o;
  else catalog.push(o);
}

/** What a holder's id list adds up to, every key always present. An id the
    catalog no longer has — the file was deleted or renamed on disk — simply
    contributes nothing; skipping it here IS the normalisation of a stale
    assignment. */
/** @param {ItemDef[]} catalog @param {string[]|undefined} ids */
export function modTotals(catalog, ids) {
  /** @type {Record<string, number>} */
  const totals = { ac: 0, hpMax: 0, initMod: 0, speed: 0, pp: 0 };
  for (const id of ids || []) {
    const o = catalog.find(x => x.id === id);
    if (!o) continue;
    for (const [key, v] of Object.entries(o.mods)) totals[key] += v;
  }
  return totals;
}

/** Unknown + bonus is still unknown: an npc has no passive perception and an
    unparseable speed reads as null, and no ring changes that. */
/** @param {number|null} base @param {number} bonus */
export const addMod = (base, bonus) => (base == null ? base : base + bonus);

/** A holder's list grouped for display: [{obj, count}], catalog order lost in
    favour of first-held order, danglers skipped. */
/** @param {ItemDef[]} catalog @param {string[]|undefined} ids
    @returns {{obj: ItemDef, count: number}[]} */
export function heldObjects(catalog, ids) {
  /** @type {{obj: ItemDef, count: number}[]} */
  const out = [];
  for (const id of ids || []) {
    const o = catalog.find(x => x.id === id);
    if (!o) continue;
    const row = out.find(r => r.obj.id === id);
    if (row) row.count += 1;
    else out.push({ obj: o, count: 1 });
  }
  return out;
}

/** Every effect line a holder carries, deduped — two rings of the same kind
    glow once. */
/** @param {ItemDef[]} catalog @param {string[]|undefined} ids */
export function effectLines(catalog, ids) {
  const seen = new Set();
  for (const { obj } of heldObjects(catalog, ids)) {
    for (const e of obj.effects) seen.add(e);
  }
  return [...seen];
}

/** "CA +1 · PG máx +2" — the one-line summary a catalog card and a holder
    row both print. */
/** @param {Record<string, number>} mods */
export const modSummary = mods => MOD_KEYS
  .filter(([key]) => mods[key])
  .map(([key, es]) => `${es} ${signed(mods[key])}`)
  .join(' · ');
