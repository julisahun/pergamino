/* A uniform handle over a player and a monster. Everything a card or the
   projection draws comes from here, so neither ever asks which one it is
   holding. derive() is the creator's, untouched, and it is the only source
   of a player's numbers — a player who edits their sheet and re-sends the
   file updates this board. */

import { derive, validate } from '../rules/engine.js';
import { SPECIES, CLASSES } from '../rules/data.js';
import { blankPlay } from './session.js';

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
  const sp = SPECIES[c.species], cls = CLASSES[c.class];
  const lineage = sp?.lineages?.[c.lineage];
  return {
    kind: 'pc', id: c.id, ref: 'pc:' + c.id,
    name: c.name || 'Sin nombre',
    sub: [[sp?.es, lineage ? `(${lineage.es})` : null].filter(Boolean).join(' '),
      cls ? `${cls.es} 1` : null, c.player ? `jugador: ${c.player}` : null].filter(Boolean).join(' · '),
    ac: d.ca, hpMax: d.hp ?? 0, initMod: d.initiative,
    pp: d.passivePerception, speed: d.speed, portrait: c.portrait,
    play: playOf(session, c.id), char: c, d,
    /* A sheet still being built has no hit points at all, which must not read
       as a player lying on the floor. */
    broken: validate(c).filter(n => n.level === 'error'),
  };
}

export function npcHandle(n) {
  return {
    kind: 'npc', id: n.id, ref: 'npc:' + n.id,
    name: n.name, sub: '',
    ac: n.ac, hpMax: n.hpMax, initMod: n.initMod,
    pp: null, speed: n.speed, portrait: n.portrait,
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
  return n ? npcHandle(n) : null;
}

export const currentHP = cb => {
  const max = Math.max(0, cb.hpMax || 0);
  return Math.max(0, Math.min(max, cb.play.hp == null ? max : cb.play.hp));
};
