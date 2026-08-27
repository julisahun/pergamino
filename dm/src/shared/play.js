/* What happens to a creature at the table: hit points, gold, expendables and
   the rests that bring them back.

   Nothing here rolls anything. Damage, healing and death saves are numbers the
   DM types from what happened in the room — this app has no opinion about dice
   and never will. */

/** @import { Session, Character, Play, Resource } from './types.js' */

import { playOf, pcMaxHP, currentHP } from './handles.js';
import { slotsAt, CASTER_KIND, pactMagic, levelOf } from '../rules/levels.js';

/** @typedef {import('./handles.js').Handle} Handle */

/* ------------------------------------------------------------ hit points
   One expression box per row, and this is its whole grammar:

     7      damage (bare, or negative — both read as "took 7")
     +3     healing, capped at the maximum
     t5     temporary hit points, which REPLACE rather than stack
     =11    set the total outright

   Anything else is refused rather than guessed at: a box that silently did
   something else with a typo would be worse than one that says no. */

/** @param {Handle} cb @param {number} n */
export function hurt(cb, n) {
  const p = cb.play;
  const soaked = Math.min(p.temp || 0, n);
  p.temp = (p.temp || 0) - soaked;
  p.hp = Math.max(0, (p.hp ?? 0) - (n - soaked));
}

/** @param {Handle} cb @param {number} n */
export function heal(cb, n) {
  const max = Math.max(0, cb.hpMax || 0);
  cb.play.hp = Math.min(max, Math.max(0, cb.play.hp ?? 0) + n);
}

/** @param {Handle} cb @param {string} raw @returns {boolean} whether it parsed */
export function applyDelta(cb, raw) {
  const p = cb.play;
  const max = Math.max(0, cb.hpMax || 0);
  /* `null` means untouched-therefore-full; the first thing typed makes it a
     real number. */
  if (p.hp == null) p.hp = max;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return false;

  let m;
  if ((m = s.match(/^t(\d+)$/))) {
    p.temp = Number(m[1]);
  } else if ((m = s.match(/^=(\d+)$/))) {
    /* A monster's maximum is whatever the DM decided it is, so `=20` on a
       goblin given 7 raises the maximum with it — otherwise the number typed
       silently became 7 and the box looked broken. A player's maximum belongs
       to their sheet and is not this box's business. The typed number is the
       EFFECTIVE total, so what lands on the instance has any object bonus
       taken back out; hpMax re-adds it on the next read. */
    const n = Number(m[1]);
    if (cb.kind === 'npc' && n > max) {
      cb.npc.hpMax = Math.max(1, n - (cb.mods?.hpMax || 0));
      p.hp = n;
    } else {
      p.hp = Math.min(max, n);
    }
  } else if ((m = s.match(/^\+(\d+)$/))) {
    heal(cb, Number(m[1]));
  } else if ((m = s.match(/^-?(\d+)$/))) {
    hurt(cb, Number(m[1]));
  } else {
    return false;
  }
  /* Anyone standing again has no death saves to remember. */
  if ((p.hp ?? 0) > 0) p.death = { ok: 0, fail: 0 };
  return true;
}

/** Same grammar minus temp and minus a maximum to clamp against — gold has
    neither. `-12` on 5 in hand floors at 0 rather than going into debt: a loan
    is a story beat, not a number this box should invent.
    @param {Play} p @param {string} raw */
export function applyGoldDelta(p, raw) {
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return false;
  let m;
  if ((m = s.match(/^=(\d+)$/))) p.gold = Number(m[1]);
  else if ((m = s.match(/^\+(\d+)$/))) p.gold = (p.gold || 0) + Number(m[1]);
  else if ((m = s.match(/^-(\d+)$/))) p.gold = Math.max(0, (p.gold || 0) - Number(m[1]));
  else return false;
  return true;
}

/* ---------------------------------------------------------- expendables
   Two kinds of pool, one mechanism. Spell slots come from the progression
   tables; per-day features (Second Wind, Rage, Channel Divinity…) are named by
   the DM, because what a feature IS at each level is free text here.

   Keys are namespaced so a feature called "1" can never collide with a first
   level spell slot: `slot:1`, `slot:pact`, `res:<key>`. */

export const slotKey = (/** @type {string} */ level) => `slot:${level}`;
export const resKey = (/** @type {string} */ key) => `res:${key}`;

/** @typedef {{key: string, label: string, max: number, spent: number,
               per: 'corto'|'largo', kind: 'slot'|'resource'}} Pool */

/**
 * Every pool this character has, with how much of it is gone. Spell slots
 * first, in level order, then whatever the DM wrote down.
 * @param {Session} session @param {Character} c @returns {Pool[]}
 */
export function poolsOf(session, c) {
  const play = playOf(session, c.id);
  const level = levelOf(c);
  /** @type {Pool[]} */
  const out = [];
  const slots = slotsAt(c.class, level);
  for (const [lvl, max] of Object.entries(slots)) {
    const pact = lvl === 'pact';
    out.push({
      key: slotKey(lvl),
      label: pact ? `Pacto (nivel ${pactMagic(level).level})` : `Nivel ${lvl}`,
      max, spent: Math.min(max, play.spent[slotKey(lvl)] || 0),
      /* Pact magic is the one kind of slot a short rest brings back — that is
         what makes it pact magic rather than a small spell list. */
      per: pact ? 'corto' : 'largo',
      kind: 'slot',
    });
  }
  for (const r of (c.resources || [])) {
    out.push({
      key: resKey(r.key), label: r.name,
      max: Math.max(0, r.uses), spent: Math.min(r.uses, play.spent[resKey(r.key)] || 0),
      per: r.per === 'corto' ? 'corto' : 'largo',
      kind: 'resource',
    });
  }
  return out;
}

/** Spend one, or give one back. Bounded by the pool: a pip that is not there
    cannot be spent, and one that was never spent cannot be returned.
    @param {Play} play @param {Pool} pool @param {1|-1} dir */
export function spend(play, pool, dir) {
  const now = play.spent[pool.key] || 0;
  const next = Math.max(0, Math.min(pool.max, now + dir));
  if (next === 0) delete play.spent[pool.key];
  else play.spent[pool.key] = next;
}

/* --------------------------------------------------------------- rests */

/** An hour by the fire: pact slots and anything the DM marked as coming back
    on a short rest. Hit points are not touched — spending hit dice is a
    decision at the table, typed into the box like everything else.
    @param {Session} session */
export function shortRest(session) {
  for (const c of session.party) {
    const play = playOf(session, c.id);
    for (const pool of poolsOf(session, c)) {
      if (pool.per === 'corto') delete play.spent[pool.key];
    }
  }
}

/** A night: hit points full, temporary gone, conditions cleared, death saves
    forgotten, one level of exhaustion off, and every pool back.
    @param {Session} session */
export function longRest(session) {
  for (const c of session.party) {
    const play = playOf(session, c.id);
    play.hp = pcMaxHP(session, c);
    play.temp = 0;
    play.conditions = [];
    play.exh = Math.max(0, play.exh - 1);
    play.death = { ok: 0, fail: 0 };
    play.spent = {};
  }
}

/** Whether this character has anything to spend at all — what decides if the
    card shows a row of pips or nothing. @param {Session} session @param {Character} c */
export const hasPools = (session, c) => poolsOf(session, c).length > 0;

/** Whether a class casts by pact, for the wording around its slots.
    @param {string|null} classKey */
export const isPactCaster = classKey => CASTER_KIND[classKey ?? ''] === 'pact';

/** A player at 0 hit points is making death saves; a monster is simply down.
    @param {Handle} cb */
export const isDown = cb => currentHP(cb) <= 0;
