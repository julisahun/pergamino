/* One handle over a player and over a monster, so that a card, a token and the
   projection never have to ask which one they are holding.

   A player's base numbers come from `derive()` — the sheet is a recipe and the
   numbers are computed from it, never stored. Held objects are layered on
   afterwards, on top of the memo: derive() knows nothing about them, which is
   why an object edit needs no cache invalidation. */

/** @import { Session, Character, Npc, ItemDef, Ref } from './types.js' */

import { derive, validate } from '../rules/engine.js';
import { levelOf } from '../rules/levels.js';
import { SPECIES, CLASSES } from '../rules/data.js';
import { blankPlay } from './session.js';
import { modTotals, addMod } from './objects.js';

/* Memoised on updatedAt and level, because a card asks for the same character
   several times in one render, and because levelling up must invalidate it. */
/** @type {Map<string, ReturnType<typeof derive>>} */
const statCache = new Map();

/** @param {Character} c */
export function stats(c) {
  const key = `${c.id}:${c.updatedAt || 0}:${levelOf(c)}`;
  let hit = statCache.get(key);
  if (!hit) { hit = derive(c); statCache.set(key, hit); }
  return hit;
}
export const clearStatCache = () => statCache.clear();

/** @param {Session} session @param {string} id */
export function playOf(session, id) {
  if (!session.play[id]) session.play[id] = blankPlay();
  return session.play[id];
}

/** @param {Session} session @param {Character} c */
export function pcHandle(session, c) {
  const d = stats(c);
  const play = playOf(session, c.id);
  const mods = modTotals(session.objects || [], play.objects);
  const sp = SPECIES[c.species ?? ''];
  const cls = CLASSES[c.class ?? ''];
  const lineage = sp?.lineages?.[c.lineage ?? ''];
  const level = d.level;
  return {
    kind: /** @type {const} */ ('pc'), id: c.id, ref: /** @type {Ref} */ ('pc:' + c.id),
    name: c.name || 'Sin nombre',
    sub: [
      [sp?.es, lineage ? `(${lineage.es})` : null].filter(Boolean).join(' '),
      cls ? `${cls.es} ${level}` : null,
      c.player ? `jugador: ${c.player}` : null,
    ].filter(Boolean).join(' · '),
    level,
    ac: addMod(d.ca, mods.ac), hpMax: (d.hp ?? 0) + mods.hpMax,
    initMod: addMod(d.initiative, mods.initMod),
    pp: addMod(d.passivePerception, mods.pp), speed: addMod(d.speed, mods.speed),
    mods, portrait: c.portrait,
    play, char: c, d,
    /* A sheet still being built has no hit points at all, which must not read
       as a player lying on the floor. */
    broken: validate(c).filter(n => n.level === 'error'),
  };
}

/** @param {Npc} n @param {ItemDef[]} catalog */
export function npcHandle(n, catalog = []) {
  const mods = modTotals(catalog, n.objects);
  return {
    kind: /** @type {const} */ ('npc'), id: n.id, ref: /** @type {Ref} */ ('npc:' + n.id),
    name: n.name, sub: n.tag || '',
    level: null,
    ac: addMod(n.ac, mods.ac), hpMax: n.hpMax + mods.hpMax,
    initMod: addMod(n.initMod, mods.initMod),
    pp: null, speed: addMod(n.speed, mods.speed),
    mods, portrait: n.portrait,
    play: n, npc: n,
    /** @type {{level: string, step: string, text: string}[]} */
    broken: [],
  };
}

/** What a card, a token or the projection holds — either kind.
    @typedef {ReturnType<typeof pcHandle> | ReturnType<typeof npcHandle>} Handle */

/** @param {Session} session */
export const partyHandles = session => session.party.map(c => pcHandle(session, c));

/** @param {Session} session @param {string} id */
export const npcById = (session, id) => session.npcs.find(n => n.id === id) || null;

/** @param {Session} session @param {string} ref @returns {Handle|null} */
export function handleFor(session, ref) {
  const [kind, id] = String(ref).split(':');
  if (kind === 'pc') {
    const c = session.party.find(x => x.id === id);
    return c ? pcHandle(session, c) : null;
  }
  const n = npcById(session, id);
  return n ? npcHandle(n, session.objects || []) : null;
}

/** The one authoritative maximum for a player: what the sheet computes plus
    what their objects add. Every clamp reads this — clamping against the raw
    maximum would silently eat a ring that grants +2 hit points.
    @param {Session} session @param {Character} c */
export const pcMaxHP = (session, c) =>
  (stats(c).hp ?? 0) + modTotals(session.objects || [], playOf(session, c.id).objects).hpMax;

/** @param {Handle} cb */
export const currentHP = cb => {
  const max = Math.max(0, cb.hpMax || 0);
  return Math.max(0, Math.min(max, cb.play.hp == null ? max : cb.play.hp));
};
