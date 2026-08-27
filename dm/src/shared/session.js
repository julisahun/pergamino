/* The session: play state over a party and a set of npc instances.

   One in-memory object is the table. On disk it is `session.json` inside the
   open run, and it holds ONLY what happened at this table — play state, the
   npcs that were seated, the fight, the field. The party lives in
   `players/*.json`, the bestiary in `monsters/*.json` and the catalog in
   `objects/*.json`; the session never stores a second copy of any of them.
   That split is what killed the old app's three-way merge rules, and it is
   invariant 5 in file form: no fact stored twice.

   The loader injects `party`, `bestiary` and `objects` after reading them from
   their own files — see admin/campaign.js. */

/** @import { Session, Play, Encounter } from './types.js' */
import { blankField, normaliseField } from './field.js';
import { isCondition } from './conditions.js';

/** The version `session.json` is written with. v2 was the two-boolean board
    (`live`/`grid`); v3 is the one stored `field.mode`. Reading v2 is
    normaliseField's job and it is tested by name. */
export const SESSION_VERSION = 3;

/** @returns {Play} */
export function blankPlay() {
  return {
    hp: null, temp: 0, conditions: [], exh: 0, death: { ok: 0, fail: 0 },
    note: '', gold: 0, inventory: '', objects: [], spent: {},
  };
}

/** @returns {Session} */
export function blankSession() {
  return {
    version: SESSION_VERSION,
    party: [],
    play: {},
    playerFiles: {},
    bestiary: [],
    objects: [],
    npcs: [],
    encounter: { on: false, round: 1, activeRef: null, members: [], init: {} },
    field: blankField(),
  };
}

const clamp = (/** @type {number} */ n, /** @type {number} */ lo, /** @type {number} */ hi) =>
  Math.min(hi, Math.max(lo, n));

/** @param {any} p @returns {Play} */
export function normalisePlay(p) {
  const out = blankPlay();
  if (!p || typeof p !== 'object') return out;
  /* `hp: null` means "untouched, therefore full" and has to survive a round
     trip. Testing Number.isFinite alone does not: Number(null) is 0, which is
     finite, so a stored null came back as a character on the floor. */
  out.hp = p.hp != null && Number.isFinite(Number(p.hp)) ? Number(p.hp) : null;
  out.temp = Math.max(0, Number(p.temp) || 0);
  out.exh = clamp(Math.round(Number(p.exh) || 0), 0, 6);
  /* Only conditions this app knows about: a key from an older file, or a typo
     in a hand-edited session, would otherwise sit on a card forever with no
     way to tap it off. */
  out.conditions = Array.isArray(p.conditions)
    ? [...new Set(p.conditions.filter(isCondition))]
    : [];
  out.death = {
    ok: clamp(Math.round(Number(p.death?.ok) || 0), 0, 3),
    fail: clamp(Math.round(Number(p.death?.fail) || 0), 0, 3),
  };
  out.note = String(p.note || '');
  out.gold = Math.max(0, Number(p.gold) || 0);
  out.inventory = String(p.inventory || '');
  /* Held object ids. Whether an id still names anything is the catalog's
     question, answered at read time — no catalog in scope here. */
  out.objects = Array.isArray(p.objects)
    ? p.objects.filter((/** @type {any} */ x) => typeof x === 'string' && x)
    : [];
  /* Expendables spent so far, under namespaced keys (`slot:3`, `slot:pact`,
     `res:furia`) so a feature can never collide with a spell level. What the
     maximum IS comes from the progression tables and the character's own
     resource list, so a stored number that outgrew its pool is clamped where
     the pool is known — see play.js. */
  out.spent = {};
  for (const [k, v] of Object.entries(p.spent || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out.spent[k] = Math.round(n);
  }
  return out;
}

/**
 * Fills in whatever a stored session is missing, so older saves keep opening.
 * `party`, `bestiary` and `objects` come in already parsed by their own
 * modules — this function never invents an entity, it only reads play state.
 *
 * @param {any} s @returns {Session}
 */
export function normaliseSession(s) {
  const out = blankSession();
  const raw = s && typeof s === 'object' ? s : {};

  out.party = Array.isArray(raw.party) ? raw.party : [];
  out.bestiary = Array.isArray(raw.bestiary) ? raw.bestiary : [];
  out.objects = Array.isArray(raw.objects) ? raw.objects : [];

  /* Every party member gets play state, and nobody else does: an entry for a
     character who left the table is not worth carrying. */
  for (const c of out.party) out.play[c.id] = normalisePlay(raw.play?.[c.id]);

  /* Which file a party member came from, so a save knows which one owns them
     rather than inventing a new one. */
  for (const [id, path] of Object.entries(raw.playerFiles || {})) {
    if (typeof path === 'string' && out.party.some((/** @type {any} */ c) => c.id === id)) {
      out.playerFiles[id] = path;
    }
  }

  /* Seated npcs. Their statblock half is normalised by beasts.js at the point
     where npcs can first exist (the muster picker); what this file owns is the
     play state mixed into them. */
  const rawNpcs = Array.isArray(raw.npcs) ? raw.npcs : [];
  out.npcs = rawNpcs
    .filter((/** @type {any} */ n) => n && typeof n === 'object' && typeof n.id === 'string')
    .map((/** @type {any} */ n) => ({ ...n, ...normalisePlay(n) }));

  const refs = new Set([
    ...out.party.map((/** @type {any} */ c) => 'pc:' + c.id),
    ...out.npcs.map(n => 'npc:' + n.id),
  ]);

  const e = raw.encounter || {};
  /** @type {Encounter} */
  const enc = { on: false, round: Math.max(1, Math.round(Number(e.round) || 1)),
                activeRef: null, members: [], init: {} };
  for (const [ref, v] of Object.entries(e.init || {})) {
    if (refs.has(ref) && Number.isFinite(Number(v))) enc.init[ref] = Number(v);
  }
  const wanted = Array.isArray(e.members) ? e.members : [];
  enc.members = [...new Set(wanted.filter((/** @type {any} */ r) => refs.has(r)))];
  enc.on = e.on === true && enc.members.length > 0;
  if (typeof e.activeRef === 'string' && enc.members.includes(e.activeRef)) {
    enc.activeRef = /** @type {any} */ (e.activeRef);
  }
  out.encounter = enc;

  out.field = normaliseField(raw.field);
  /* Positions and reveals of anyone who no longer exists are dropped, the same
     way stale initiative entries are. A benched player keeps their bench. */
  for (const ref of Object.keys(out.field.tokens)) if (!refs.has(ref)) delete out.field.tokens[ref];
  for (const id of Object.keys(out.field.reveal)) {
    if (!out.npcs.some(n => n.id === id)) delete out.field.reveal[id];
  }
  out.field.benched = out.field.benched.filter(r => refs.has(r));

  return out;
}

/** What `session.json` actually holds. The party, the bestiary and the catalog
    live in their own files; writing them here again is how the old app ended
    up with merge rules. `playerFiles` rides along because it is a fact about
    this table's copy of the party, not about any character.
    @param {Session} session */
export function serialiseSession(session) {
  return {
    version: SESSION_VERSION,
    play: session.play,
    playerFiles: session.playerFiles,
    npcs: session.npcs,
    encounter: session.encounter,
    field: session.field,
  };
}
