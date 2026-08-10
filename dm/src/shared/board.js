/* The projection sent to the television. What travels is never the session:
   only what the players are allowed to see, already filtered. A hidden
   monster is absent from the payload rather than merely unrendered, so it
   cannot leak by opening the TV's devtools, and the TV page needs no rules
   data and no engine — it is a renderer with nothing to reason about.

   Every path in the payload is pre-resolved to a real URL by `urlFor`, so
   the TV never learns the campaign's name either. */

import { normaliseReveal } from './session.js';
import { handleFor, partyHandles, npcHandle, currentHP } from './handles.js';
import { inOrder, skippable } from './combat.js';
import { CONDITION } from './conditions.js';

/* One colour per player, in import order. Monsters are all the one ink, so a
   glance at the field separates "us" from "them" before any name is read. */
export const TOKEN_COLOURS = Object.freeze(['#2f6f4e', '#2d5f8a', '#7b3f9d', '#a8621b', '#146a72', '#8a2f4a']);

/** The five words the players get instead of a number. */
export function coarseWord(hp, max) {
  if (hp <= 0) return 'fuera de combate';
  const pct = max ? hp / max : 1;
  if (pct >= 1) return 'ileso';
  if (pct > .5) return 'herido';
  if (pct > .25) return 'malherido';
  return 'grave';
}

export function tokenHP(cb, mode) {
  const max = Math.max(0, cb.hpMax || 0);
  const hp = currentHP(cb);
  if (mode === 'none') return null;
  if (mode === 'exact') return { mode: 'exact', cur: hp, max, pct: max ? hp / max : 0 };
  return { mode: 'coarse', word: coarseWord(hp, max), pct: max ? hp / max : 0 };
}

/** A portrait resolves like any other asset — a path through `urlFor`, or a
    stamp, which is the data URI itself (downscaled to 512px already, so it
    stays a bounded exception to "big bytes never enter the payload"). */
export function portraitSrc(p, urlFor) {
  if (!p) return null;
  return p.src ? urlFor(p.src) : p.stamp || null;
}

let seq = 0;

export function buildBoard(session, audioPrefs, urlFor) {
  const f = session.field;
  const e = session.encounter;
  const order = inOrder(session);
  const active = order.find(o => o.ref === e.activeRef);
  const colourOf = ref => ref.startsWith('pc:')
    ? TOKEN_COLOURS[session.party.findIndex(c => 'pc:' + c.id === ref) % TOKEN_COLOURS.length]
    : null;

  const tokens = [];
  for (const [ref, at] of Object.entries(f.tokens)) {
    const cb = handleFor(session, ref);
    if (!cb) continue;
    /* An npc's ◉/○ decides whether it is in the payload at all, in or out of
       a fight — a hidden threat and a hidden bartender are staged off-screen
       for the same reason. A player is never staged; there is nothing to
       decide. Once it is in, whether its *card* shows — hit points,
       conditions — is a second, separate question: only a fight owes the
       table that, so a loaded npc nobody has put into one yet reads as pure
       scenery. */
    let hp = null, conditions = [];
    if (cb.kind === 'npc') {
      const r = f.reveal[cb.id] || normaliseReveal(null);
      if (!r.on) continue;
      if (e.members.includes(ref)) {
        hp = tokenHP(cb, r.hp);
        conditions = cb.play.conditions.map(k => CONDITION(k)?.es).filter(Boolean);
      }
    } else {
      hp = tokenHP(cb, 'exact');
      conditions = cb.play.conditions.map(k => CONDITION(k)?.es).filter(Boolean);
    }
    tokens.push({
      id: ref, name: cb.name, kind: cb.kind, colour: colourOf(ref),
      portrait: portraitSrc(cb.portrait, urlFor),
      x: at.x, y: at.y,
      active: ref === e.activeRef,
      hp, conditions,
      /* Squares this one can cross in a move, so selecting a token shows its
         reach. 5e 2024 counts a diagonal as one square, hence Chebyshev. Not
         gated on being in a fight — planning a position is useful before one
         starts too. */
      reach: cb.speed != null ? Math.round(cb.speed / 1.5) : null,
    });
  }

  /* A place or a battlemap, and nothing else distinguishes them — this is
     purely the grid toggle, not whether a fight happens to be running. In
     'scene' the television draws the art full-bleed and has no grid to put a
     token on, so tokens never travel in that mode regardless of combat. */
  const mode = !f.live ? 'idle' : f.grid ? 'field' : 'scene';

  const audio = f.live && f.audio
    ? { ...f.audio, master: audioPrefs.muted ? 0 : audioPrefs.master }
    : null;

  return {
    seq: ++seq,
    cols: f.cols, rows: f.rows,
    mode,
    map: f.map,
    audio,
    /* The turn banner and order strip are combat's own data, not a HUD
       visibility switch — they are null because there is no round or turn
       to report, the same reason an npc's hp is null outside a fight. */
    banner: e.on && order.length ? { round: e.round, active: active ? active.cb.name : null } : null,
    order: e.on ? order.map(o => {
      const revealed = o.cb.kind !== 'npc' || (f.reveal[o.cb.id] || {}).on;
      return {
        name: revealed ? o.cb.name : '···',
        /* A hidden monster's face is exactly as secret as its name — a
           portrait would put the goblin back in the payload the name just
           took it out of. */
        portrait: revealed ? portraitSrc(o.cb.portrait, urlFor) : null,
        kind: o.cb.kind, active: o.ref === e.activeRef,
        down: skippable(o.cb),
      };
    }) : [],
    /* On the game, period — a benched player is the one exception, since
       being off the board is the whole point of a bench. */
    party: partyHandles(session).filter(cb => !f.benched.includes(cb.ref)).map((cb, i) => ({
      name: cb.name, colour: TOKEN_COLOURS[i % TOKEN_COLOURS.length],
      portrait: portraitSrc(cb.portrait, urlFor),
      hp: currentHP(cb), hpMax: Math.max(0, cb.hpMax || 0), temp: cb.play.temp || 0,
      state: cb.broken.length ? '' : currentHP(cb) <= 0 ? 'inconsciente' : '',
    })),
    /* An npc's own HUD row: reveal decides whether it is here at all, the
       same gate a token already gets — combat decides only whether it says
       anything about hit points. */
    npcs: session.npcs.filter(n => (f.reveal[n.id] || normaliseReveal(null)).on).map(n => {
      const cb = npcHandle(n);
      const inCombat = e.members.includes('npc:' + n.id);
      return {
        name: cb.name, portrait: portraitSrc(cb.portrait, urlFor),
        hp: inCombat ? tokenHP(cb, (f.reveal[n.id] || normaliseReveal(null)).hp) : null,
      };
    }),
    /* Tokens are the one thing that stays grid-only even mid-fight: there is
       no board to place one on under full-bleed art. */
    tokens: mode === 'field' ? tokens : [],
  };
}
