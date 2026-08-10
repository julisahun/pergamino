/* Hit points, gold, initiative and the fight itself. Nothing here rolls
   dice — initiative totals, damage and death saves are entered, never
   generated. */

import { playOf, handleFor, currentHP, pcMaxHP } from './handles.js';
import { clampCol, clampRow, blankPlay } from './session.js';
import { normaliseBeast } from './beasts.js';
import { newId } from '../rules/character.js';

/* ------------------------------------------------------------ hit points
   One expression box per row. Bare or negative is damage, `+n` heals, `tn`
   sets temporary hit points and `=n` sets the total outright — the last one
   is for monsters, whose maximum is whatever the DM decided it is. */

export function applyDelta(cb, raw) {
  const p = cb.play;
  const max = Math.max(0, cb.hpMax || 0);
  if (p.hp == null) p.hp = max;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return false;

  let m;
  if ((m = s.match(/^t(\d+)$/))) {
    p.temp = Number(m[1]);                     // temporary hit points replace, never stack
  } else if ((m = s.match(/^=(\d+)$/))) {
    /* A monster's maximum is whatever you decided it is, so `=20` on a goblin
       you gave 7 raises the maximum with it — otherwise the number you typed
       silently became 7 and the box looked broken. A player's maximum is
       derive()'s and not this box's business. The typed number is the
       *effective* total, so what lands on the instance has the object bonus
       taken back out — cb.hpMax re-adds it on the next read. */
    const n = Number(m[1]);
    if (cb.kind === 'npc' && n > max) {
      cb.npc.hpMax = Math.max(1, n - (cb.mods?.hpMax || 0));
      p.hp = n;
    } else p.hp = Math.min(max, n);
  } else if ((m = s.match(/^\+(\d+)$/))) {
    heal(cb, Number(m[1]));
  } else if ((m = s.match(/^-?(\d+)$/))) {
    hurt(cb, Number(m[1]));
  } else {
    return false;
  }
  if (p.hp > 0) p.death = { ok: 0, fail: 0 };
  return true;
}

export function hurt(cb, n) {
  const p = cb.play;
  const soaked = Math.min(p.temp || 0, n);
  p.temp = (p.temp || 0) - soaked;
  p.hp = Math.max(0, p.hp - (n - soaked));
}

export function heal(cb, n) {
  const max = Math.max(0, cb.hpMax || 0);
  cb.play.hp = Math.min(max, Math.max(0, cb.play.hp) + n);
}

/* Same grammar as the hit point box, minus temp and minus a maximum to clamp
   against — gold has neither. `-12` on 5 in hand floors at 0 rather than
   going into debt; a loan is a story beat, not a number this box should
   invent on its own. */
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

export function longRest(session) {
  for (const c of session.party) {
    const p = playOf(session, c.id);
    p.hp = pcMaxHP(session, c);
    p.temp = 0;
    p.conditions = [];
    p.exh = Math.max(0, p.exh - 1);            // a long rest removes one level
    p.death = { ok: 0, fail: 0 };
  }
}

/* -------------------------------------------------------------- initiative
   Typed, never rolled. `init` maps a ref to the total the player read out;
   a ref with no entry has not rolled yet, which is a different thing from
   not being in the fight. The active combatant is held by ref rather than by
   index, so editing a total mid-fight re-sorts the order without moving the
   cursor onto somebody else. */

export function inOrder(session) {
  const e = session.encounter;
  return e.members
    .map(ref => ({ ref, init: e.init[ref], cb: handleFor(session, ref) }))
    .filter(o => o.cb)
    .sort((a, b) => (b.init ?? -999) - (a.init ?? -999) || (b.cb.initMod - a.cb.initMod)
      || a.cb.name.localeCompare(b.cb.name, 'es'));
}

export const allRolled = session => inOrder(session).every(o => o.init != null);

/** A monster on 0 hit points keeps its card but loses its turn. */
export const skippable = cb => cb.kind === 'npc' && currentHP(cb) <= 0;

export function advance(session, dir) {
  const e = session.encounter;
  const list = inOrder(session);
  if (!list.length) return;
  let i = list.findIndex(o => o.ref === e.activeRef);
  if (i < 0) { e.activeRef = list[0].ref; return; }

  for (let step = 0; step < list.length; step++) {
    i += dir;
    if (i >= list.length) { i = 0; e.round++; }
    if (i < 0) { i = list.length - 1; e.round = Math.max(1, e.round - 1); }
    if (!skippable(list[i].cb)) break;
  }
  e.activeRef = list[i].ref;
}

/** Combat starts when you say so, with whoever you ticked and whatever they
    rolled. Whoever you left unticked simply is not in this fight — it does
    not leave the table. Loading and joining are two different decisions, so
    `session.npcs` is not this function's to touch at all. */
export function startCombat(session, refs, inits) {
  const e = session.encounter;
  e.members = [...new Set(refs)].filter(r => handleFor(session, r));
  e.on = e.members.length > 0;
  e.round = 1;
  e.activeRef = null;
  e.init = {};
  for (const [ref, v] of (inits || [])) {
    if (e.members.includes(ref) && Number.isFinite(v)) e.init[ref] = v;
  }
  /* Combat is a state of the game, not a mode of the television: starting one
     does not touch the grid. */
  session.field.live = true;
  seatAll(session);
}

/** Bookkeeping only: who is in the fight, whose turn it is, what round it is.
    None of that is a fact about who exists — an npc loaded for this fight is
    exactly as loaded after it as before. */
export function endCombat(session) {
  session.encounter = { on: false, round: 1, activeRef: null, members: [], init: {} };
}

/* ------------------------------------------------------------------ field */

export function freeSquare(f) {
  const taken = new Set(Object.values(f.tokens).map(p => p.x + ',' + p.y));
  for (let y = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++) if (!taken.has(x + ',' + y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/** Everybody who exists is on the field, in or out of any fight. Whether the
    *players* see one is the reveal switch, and whether a card shows hit
    points is whether it is in a fight — neither is a reason to leave someone
    off the board itself. A benched player is the one exception. */
export function seatAll(session) {
  const f = session.field;
  const refs = [...session.party.map(c => 'pc:' + c.id).filter(r => !f.benched.includes(r)),
                ...session.npcs.map(n => 'npc:' + n.id)];
  for (const ref of refs) if (!f.tokens[ref]) f.tokens[ref] = freeSquare(f);
  for (const ref of Object.keys(f.tokens)) if (!refs.includes(ref)) delete f.tokens[ref];
}

/** `Goblin ×3` becomes Goblin 1, 2 and 3, each with its own hit points, the
    moment they are loaded — not the moment they join a fight, which is a
    separate decision made later. Nothing here touches `session.encounter`. */
export function loadNpc(session, beast, count) {
  const created = [];
  for (let i = 1; i <= count; i++) {
    const n = normaliseBeast({ ...beast, id: newId(), name: count > 1 ? `${beast.name} ${i}` : beast.name });
    session.npcs.push(Object.assign(n, blankPlay(), { hp: n.hpMax }));
    created.push('npc:' + n.id);
  }
  seatAll(session);
  return created;
}

/** Folds a television-dragged token position back into the session.
    Positions are the only thing that ever flows that way. */
export function applyMove(session, ref, x, y) {
  const at = session.field.tokens[ref];
  if (!at) return false;
  const cx = clampCol(session.field, x), cy = clampRow(session.field, y);
  if (at.x === cx && at.y === cy) return false;
  at.x = cx; at.y = cy;
  return true;
}
