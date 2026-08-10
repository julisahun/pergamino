/* A uniform handle over a player and a monster. Everything a card or the
   projection draws comes from here, so neither ever asks which one it is
   holding. derive() is the creator's, untouched, and it is the only source
   of a player's *base* numbers — a player who edits their sheet and re-sends
   the file updates this board. Held objects are layered on top HERE, after
   the stats() memo: derive() never learns about them (it is sync-guarded),
   and an object edit needs no cache invalidation because the memo never saw
   it. */

import { derive, validate } from '../rules/engine.js';
import { SPECIES, CLASSES } from '../rules/data.js';
import { blankPlay } from './session.js';
import { modTotals, addMod } from './objects.js';

/* Memoised on updatedAt because a card can ask for the same character
   several times in one render. */
const statCache = new Map();
export function stats(c) {
  const key = c.id + ':' + (c.updatedAt || 0);
  let hit = statCache.get(key);
  if (!hit) { hit = derive(c); statCache.set(key, hit); }
  return hit;
}
export const clearStatCache = () => statCache.clear();

export function playOf(session, id) {
  if (!session.play[id]) session.play[id] = blankPlay();
  return session.play[id];
}

export function pcHandle(session, c) {
  const d = stats(c);
  const play = playOf(session, c.id);
  const mods = modTotals(session.objects || [], play.objects);
  const sp = SPECIES[c.species], cls = CLASSES[c.class];
  const lineage = sp?.lineages?.[c.lineage];
  return {
    kind: 'pc', id: c.id, ref: 'pc:' + c.id,
    name: c.name || 'Sin nombre',
    sub: [[sp?.es, lineage ? `(${lineage.es})` : null].filter(Boolean).join(' '),
      cls ? `${cls.es} 1` : null, c.player ? `jugador: ${c.player}` : null].filter(Boolean).join(' · '),
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

/** `catalog` is session.objects — optional so a bare call degrades to base
    stats instead of throwing, but every real call site passes it. */
export function npcHandle(n, catalog = []) {
  const mods = modTotals(catalog, n.objects);
  return {
    kind: 'npc', id: n.id, ref: 'npc:' + n.id,
    name: n.name, sub: '',
    ac: addMod(n.ac, mods.ac), hpMax: n.hpMax + mods.hpMax,
    initMod: addMod(n.initMod, mods.initMod),
    pp: null, speed: addMod(n.speed, mods.speed),
    mods, portrait: n.portrait,
    play: n, npc: n,
  };
}

export const partyHandles = session => session.party.map(c => pcHandle(session, c));
export const npcById = (session, id) => session.npcs.find(n => n.id === id) || null;

export function handleFor(session, ref) {
  const [kind, id] = String(ref).split(':');
  if (kind === 'pc') {
    const c = session.party.find(x => x.id === id);
    return c ? pcHandle(session, c) : null;
  }
  const n = npcById(session, id);
  return n ? npcHandle(n, session.objects || []) : null;
}

/** The one authoritative maximum for a player: derive()'s plus what their
    objects add. Every clamp that used to read `stats(c).hp ?? 0` reads this
    instead — clamping against the raw max would silently eat a +2 PG ring. */
export const pcMaxHP = (session, c) =>
  (stats(c).hp ?? 0) + modTotals(session.objects || [], playOf(session, c.id).objects).hpMax;

export const currentHP = cb => {
  const max = Math.max(0, cb.hpMax || 0);
  return Math.max(0, Math.min(max, cb.play.hp == null ? max : cb.play.hp));
};
