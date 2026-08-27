/* The projection: what leaves for the television.

   Never the session — only what the players are allowed to see, already
   filtered. A hidden npc is ABSENT from this object rather than merely
   unrendered, so opening devtools on the television teaches a player nothing.

   Two things make this the centre of the rebuild:

   1. `mode` and `hud` are COPIED here, not computed. The old app derived the
      television's rendering from two booleans at push time, which is how the
      admin could say one thing while the television showed another.

   2. The admin renders this same object back at the DM, asking for audience
      'dm' — hidden npcs survive, marked `hidden`, and nothing else differs.
      The mirror is not a second renderer that resembles the television: it is
      the television's own payload, drawn by the television's own component.

   Paths travel as paths. Both windows hold the campaign folder — the admin by
   grant, the television by the handle the admin posts it — so each resolves
   `assets/maps/cala.jpg` for itself. Nothing is uploaded anywhere, because
   there is nowhere to upload to. */

/** @import { Session, Projection, Audience, TokenHP, Portrait, Reveal } from './types.js' */

import { handleFor, partyHandles, npcHandle, currentHP } from './handles.js';
import { inOrder, skippable, reachOf } from './combat.js';
import { CONDITION } from './conditions.js';
import { normaliseReveal } from './field.js';

/** One colour per player, in party order. Monsters are all one ink, so a
    glance at the field separates "us" from "them" before a name is read. */
export const TOKEN_COLOURS = Object.freeze(
  ['#2f6f4e', '#2d5f8a', '#7b3f9d', '#a8621b', '#146a72', '#8a2f4a']);

/** The five words the players get instead of a number. */
export function coarseWord(/** @type {number} */ hp, /** @type {number} */ max) {
  if (hp <= 0) return 'fuera de combate';
  const pct = max ? hp / max : 1;
  if (pct >= 1) return 'ileso';
  if (pct > .5) return 'herido';
  if (pct > .25) return 'malherido';
  return 'grave';
}

/** Hit points as this creature is allowed to report them.
    @param {number} hp @param {number} max @param {'none'|'coarse'|'exact'} mode
    @returns {TokenHP|null} */
export function tokenHP(hp, max, mode) {
  if (mode === 'none') return null;
  const pct = max ? Math.max(0, Math.min(1, hp / max)) : 0;
  if (mode === 'exact') return { mode: 'exact', cur: hp, max, pct };
  return { mode: 'coarse', word: coarseWord(hp, max), pct };
}

/** A portrait travels as whatever it is: a path into the campaign, which the
    receiving window resolves itself, or inline bytes (already downscaled by
    the portrait editor, so a bounded exception).
    @param {Portrait|null|undefined} p @returns {string|null} */
export const portraitSrc = p => (p ? (p.src || p.stamp || null) : null);

/**
 * `seq` counts what was actually handed over, so it is passed in by whoever
 * sends — building a projection for the mirror must not make the television
 * look like it received something.
 *
 * @param {Session} session
 * @param {{ audience?: Audience, master?: number, seq?: number }} [opts]
 * @returns {Projection}
 */
export function buildProjection(session, opts = {}) {
  const audience = opts.audience ?? 'tv';
  const dm = audience === 'dm';
  const f = session.field;
  const e = session.encounter;
  const order = inOrder(session);
  const active = order.find(o => o.ref === e.activeRef);

  /** Whether the players may know this npc is there at all. The DM's own
      mirror keeps hidden ones, marked — that is the ONLY difference between
      the two audiences. @param {string} id */
  const shown = id => (f.reveal[id] || normaliseReveal(null)).on;
  /** @param {string} id */
  const disclosure = id => (f.reveal[id] || normaliseReveal(null)).hp;

  const colourOf = (/** @type {string} */ ref) => (ref.startsWith('pc:')
    ? TOKEN_COLOURS[session.party.findIndex(c => 'pc:' + c.id === ref) % TOKEN_COLOURS.length]
    : null);

  /** @type {import('./types.js').TokenEntry[]} */
  const tokens = [];
  for (const [ref, at] of Object.entries(f.tokens)) {
    const cb = handleFor(session, ref);
    if (!cb) continue;
    /* An npc's reveal decides whether it is in the payload at all, in a fight
       or out of one — a hidden threat and a hidden bartender are staged
       off-screen for the same reason. Whether its card then says anything
       about hit points is a second, separate question, and only a fight owes
       the table that: a loaded npc nobody has put in one reads as scenery. */
    let hp = null;
    /** @type {string[]} */
    let conditions = [];
    let hidden = false;
    if (cb.kind === 'npc') {
      if (!shown(cb.id)) {
        if (!dm) continue;
        hidden = true;
      }
      if (e.members.includes(ref)) {
        hp = tokenHP(currentHP(cb), Math.max(0, cb.hpMax || 0), disclosure(cb.id));
        conditions = cb.play.conditions.map(k => CONDITION(k)?.es ?? '').filter(Boolean);
      }
    } else {
      hp = tokenHP(currentHP(cb), Math.max(0, cb.hpMax || 0), 'exact');
      conditions = cb.play.conditions.map(k => CONDITION(k)?.es ?? '').filter(Boolean);
    }
    tokens.push({
      id: ref, name: cb.name, kind: cb.kind, colour: colourOf(ref),
      portrait: portraitSrc(cb.portrait),
      x: at.x, y: at.y,
      active: ref === e.activeRef,
      hp, conditions,
      /* Not gated on being in a fight: planning a position is useful before
         one starts too. */
      reach: reachOf(cb.speed ?? null),
      ...(hidden ? { hidden: true } : {}),
    });
  }

  return {
    seq: opts.seq ?? 0,
    audience,
    /* Copied, never derived. This is the whole point. */
    mode: f.mode,
    hud: f.hud,
    cols: f.cols,
    rows: f.rows,
    /* Nothing is on the television in 'nada', so nothing about a picture or a
       sound is either — the mode is the one gate, and it is stated. */
    map: f.mode === 'nada' ? null : f.map,
    audio: f.mode === 'nada' || !f.audio
      ? null
      : { ...f.audio, master: Math.max(0, Math.min(1, opts.master ?? 1)) },
    /* The turn banner and the order strip are combat's own data, not a display
       switch: they are null and empty because there is no round or turn to
       report, the same reason an npc's hit points are null outside a fight. */
    banner: e.on && order.length
      ? { round: e.round, active: active?.cb ? active.cb.name : null }
      : null,
    order: e.on ? order.map(o => {
      const cb = /** @type {NonNullable<typeof o.cb>} */ (o.cb);
      const hidden = cb.kind === 'npc' && !shown(cb.id);
      return {
        /* A hidden monster's face is exactly as secret as its name: a portrait
           would put the goblin back in the payload the name just took out. */
        name: hidden && !dm ? '···' : cb.name,
        portrait: hidden && !dm ? null : portraitSrc(cb.portrait),
        kind: cb.kind, active: o.ref === e.activeRef,
        down: skippable(cb),
        ...(hidden ? { hidden: true } : {}),
      };
    }) : [],
    /* On the game, period — a benched player is the one exception, since being
       off the board is the whole point of a bench. */
    party: partyHandles(session).filter(cb => !f.benched.includes(cb.ref)).map((cb, i) => ({
      name: cb.name, colour: TOKEN_COLOURS[i % TOKEN_COLOURS.length],
      portrait: portraitSrc(cb.portrait),
      hp: currentHP(cb), hpMax: Math.max(0, cb.hpMax || 0), temp: cb.play.temp || 0,
      state: cb.broken.length ? '' : currentHP(cb) <= 0 ? 'inconsciente' : '',
    })),
    /* An npc's own row: reveal decides whether it is here at all — the same
       gate a token gets — and combat decides only whether it says anything
       about hit points. */
    npcs: session.npcs.filter(n => dm || shown(n.id)).map(n => {
      const cb = npcHandle(n, session.objects || []);
      const inFight = e.members.includes('npc:' + n.id);
      const hidden = !shown(n.id);
      return {
        name: cb.name, portrait: portraitSrc(cb.portrait),
        hp: inFight
          ? tokenHP(currentHP(cb), Math.max(0, cb.hpMax || 0), disclosure(n.id))
          : null,
        ...(hidden ? { hidden: true } : {}),
      };
    }),
    /* Tokens stay grid-only even mid-fight: there is no board to place one on
       under full-bleed art. */
    tokens: f.mode === 'tablero' ? tokens : [],
  };
}
