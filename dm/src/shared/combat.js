/* The fight, and the board it happens on.

   Three facts are kept apart on purpose, because collapsing any two of them is
   what made the old app impossible to reason about:

     LOADED    an npc exists at the table (session.npcs). Independent of
               everything else — a bartender is loaded and will never fight.
     REVEALED  the players are allowed to know it is there (field.reveal). A
               hidden npc is absent from the projection, not greyed out.
     IN THE FIGHT  it is in the initiative order (encounter.members). Only this
               one decides whether its card reports hit points.

   Nothing here rolls anything: initiative totals are read out at the table and
   typed in. An ABSENT entry in `init` means "has not rolled yet", which is a
   different thing from being out of the fight — and is why `init` is a map
   rather than a number on each member. */

/** @import { Session, Field, Ref, Beast } from './types.js' */

import { handleFor, currentHP } from './handles.js';
import { clampCol, clampRow } from './field.js';
import { blankPlay } from './session.js';
import { normaliseBeast } from './beasts.js';
import { newId } from '../rules/character.js';

/* ------------------------------------------------------------ initiative */

/** The order, highest total first. Ties break on the initiative modifier and
    then on the name, so the same two creatures never swap places between
    renders. A creature that has not rolled sorts last rather than first.
    @param {Session} session */
export function inOrder(session) {
  const e = session.encounter;
  return e.members
    .map(ref => ({ ref, init: e.init[ref], cb: handleFor(session, ref) }))
    .filter(o => o.cb)
    .sort((a, b) => (b.init ?? -999) - (a.init ?? -999)
      || ((b.cb?.initMod ?? 0) - (a.cb?.initMod ?? 0))
      || String(a.cb?.name).localeCompare(String(b.cb?.name), 'es'));
}

/** @param {Session} session */
export const allRolled = session => inOrder(session).every(o => o.init != null);

/** A monster on 0 hit points keeps its card but loses its turn. A player on 0
    is making death saves, which is a turn.
    @param {import('./handles.js').Handle} cb */
export const skippable = cb => cb.kind === 'npc' && currentHP(cb) <= 0;

/** @param {Session} session @param {1|-1} dir */
export function advance(session, dir) {
  const e = session.encounter;
  const list = inOrder(session);
  if (!list.length) return;
  let i = list.findIndex(o => o.ref === e.activeRef);
  if (i < 0) { e.activeRef = /** @type {Ref} */ (list[0].ref); return; }

  for (let step = 0; step < list.length; step++) {
    i += dir;
    if (i >= list.length) { i = 0; e.round++; }
    if (i < 0) { i = list.length - 1; e.round = Math.max(1, e.round - 1); }
    if (!skippable(/** @type {any} */ (list[i].cb))) break;
  }
  e.activeRef = /** @type {Ref} */ (list[i].ref);
}

/**
 * Combat starts when the DM says so, with whoever was ticked and whatever they
 * rolled. Whoever was left unticked is simply not in this fight — they do not
 * leave the table, and `session.npcs` is not this function's to touch.
 *
 * It does not touch the television either: a fight is a state of the game, not
 * a mode of the screen. If the DM wants the board up, the DM puts it up.
 *
 * @param {Session} session @param {string[]} refs
 * @param {Iterable<[string, number]>} inits
 */
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
  seatAll(session);
}

/** Bookkeeping only: who is in the fight, whose turn it is, what round it is.
    None of that is a fact about who exists — an npc loaded for this fight is
    exactly as loaded after it as before, and exactly as wounded.
    @param {Session} session */
export function endCombat(session) {
  session.encounter = { on: false, round: 1, activeRef: null, members: [], init: {} };
}

/* ----------------------------------------------------------------- field */

/** @param {Field} f */
export function freeSquare(f) {
  const taken = new Set(Object.values(f.tokens).map(p => p.x + ',' + p.y));
  for (let y = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++) if (!taken.has(x + ',' + y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/** Everybody who exists is on the field, in or out of any fight. Whether the
    PLAYERS see one is the reveal switch, and whether a card shows hit points is
    whether it is in a fight — neither is a reason to leave somebody off the
    board itself. A benched player is the one exception. @param {Session} session */
export function seatAll(session) {
  const f = session.field;
  const refs = [
    ...session.party.map(c => 'pc:' + c.id).filter(r => !f.benched.includes(r)),
    ...session.npcs.map(n => 'npc:' + n.id),
  ];
  for (const ref of refs) if (!f.tokens[ref]) f.tokens[ref] = freeSquare(f);
  for (const ref of Object.keys(f.tokens)) if (!refs.includes(ref)) delete f.tokens[ref];
}

/** `Goblin ×3` becomes Goblin 1, 2 and 3, each with its own hit points, the
    moment they are loaded — not the moment they join a fight, which is a
    separate decision made later. Nothing here touches `session.encounter`.
    @param {Session} session @param {Beast} beast @param {number} count */
export function loadNpc(session, beast, count) {
  /** @type {string[]} */
  const created = [];
  for (let i = 1; i <= count; i++) {
    const n = normaliseBeast({
      ...beast, id: newId(), name: count > 1 ? `${beast.name} ${i}` : beast.name,
    });
    session.npcs.push(Object.assign(n, blankPlay(), { hp: n.hpMax }));
    /* Hidden until the DM says otherwise — the one you forgot to configure
       must not be the one that spoils the ambush. */
    session.field.reveal[n.id] = { on: false, hp: 'coarse' };
    created.push('npc:' + n.id);
  }
  seatAll(session);
  return created;
}

/** Off the board for good. A monster has no bench: it is cheap to load again,
    so taking one off the table deletes it. @param {Session} session @param {string} ref */
export function removeNpc(session, ref) {
  const id = ref.slice(4);
  session.npcs = session.npcs.filter(n => n.id !== id);
  delete session.field.reveal[id];
  delete session.field.tokens[ref];
  const e = session.encounter;
  e.members = e.members.filter(r => r !== ref);
  delete e.init[ref];
  if (e.activeRef === ref) e.activeRef = null;
  if (!e.members.length) e.on = false;
}

/** Folds a position dragged on the television back into the session. Positions
    are the only thing that ever flows that way.
    @param {Session} session @param {string} ref @param {number} x @param {number} y */
export function applyMove(session, ref, x, y) {
  const at = session.field.tokens[ref];
  if (!at) return false;
  const cx = clampCol(session.field, x), cy = clampRow(session.field, y);
  if (at.x === cx && at.y === cy) return false;
  at.x = cx; at.y = cy;
  return true;
}

/** How many squares this creature crosses in a move. 5e 2024 counts a diagonal
    as one square, so reach is a Chebyshev radius — and 1.5 m is one square.
    @param {number|null} speed */
export const reachOf = speed => (speed != null ? Math.round(speed / 1.5) : null);

/** Chebyshev distance in squares: the diagonal costs the same as the straight
    line, which is the whole rule. @param {{x: number, y: number}} a @param {{x: number, y: number}} b */
export const stepsBetween = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
