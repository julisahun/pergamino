/* The session — play state over a party and a set of npc instances. One
   in-memory object is the single source of truth; on disk it is
   `campaigns/<name>/session.json`, holding ONLY {version, play, npcs,
   encounter, field}. The party lives in players/*.json and the bestiary in
   monsters/*.json — the session never duplicates them; the boot sequence
   injects both before normalising (see admin/main.js).

   normaliseSession() still reads the full legacy shape too (party and
   bestiary inline), which is what makes "Importar mesa.json" able to rescue
   a session exported by the old file:// app. */

import { normalise } from '../rules/character.js';
import { normaliseBeast } from './beasts.js';
import { normaliseObject } from './objects.js';
import { CONDITION } from './conditions.js';

export function blankPlay() {
  return { hp: null, temp: 0, conditions: [], exh: 0, death: { ok: 0, fail: 0 }, note: '',
           gold: 0, inventory: '', objects: [] };
}

/* The field is squares, not pixels: 24 x 14 of them is 36 m x 21 m, which is
   16:9 and so fills a television with no bars.

   `live` is whether anything is on the television at all. `grid` is a session
   toggle, independent of the scene and of combat alike. `benched` is the one
   exception to "everyone who exists is on the field": a player taken off the
   board on purpose without touching their character. There is no npc
   equivalent — an npc is cheap to load again, so taking one off the board
   deletes it outright. */
export function blankField() {
  return { cols: 24, rows: 14, live: false, grid: false, sceneId: null,
           map: null, audio: null, paused: false,
           tokens: {}, reveal: {}, benched: [] };
}

export function blankSession() {
  return {
    version: 2,
    party: [],
    play: {},
    playerFiles: {},          // '<charId>': 'players/<name>.json', when it came from disk
    bestiary: [],
    objects: [],              // the objects/*.json catalog — injected, never serialised

    /* Every npc instance currently loaded, in or out of any fight — see
       normaliseBeast() for the shape. Combat is a separate fact about a
       subset of these, tracked below. */
    npcs: [],
    encounter: { on: false, round: 1, activeRef: null, members: [], init: {} },
    field: blankField(),
  };
}

export const clampCol = (f, x) => Math.min(f.cols - 1, Math.max(0, Math.round(Number(x) || 0)));
export const clampRow = (f, y) => Math.min(f.rows - 1, Math.max(0, Math.round(Number(y) || 0)));

/** Where a picture comes from. `src` is a campaign-relative path, which is
    what a scene uses and what both windows can load over http. `stamp`
    (inline bytes) survives normalisation only so the mesa.json importer can
    see it and turn it into a real file under assets/ — nothing else reads it
    any more. */
export function normaliseArt(m) {
  if (!m) return null;
  const src = typeof m.src === 'string' && m.src.trim() ? m.src.trim() : null;
  const stamp = src ? null : String(m.stamp || '');
  if (!src && !stamp) return null;
  return { src, stamp };
}

/** One sound layer: a path, how loud it sits in this scene's mix, and whether
    it repeats. A layer with no path is no layer, which is how a scene has
    music and no ambience without carrying an empty object around. */
export function normaliseLayer(l) {
  const src = typeof l === 'string' ? l.trim()
    : (typeof l?.src === 'string' ? l.src.trim() : '');
  if (!src) return null;
  /* `?? .5` rather than `|| .5`: a deliberate 0 is a layer you have turned all
     the way down, not a layer you forgot to set. */
  const v = l?.volume ?? .5;
  return {
    src,
    volume: Math.min(1, Math.max(0, Number.isFinite(Number(v)) ? Number(v) : .5)),
    loop: l?.loop !== false,
  };
}

/** Two layers, music and ambience, mixed per scene. Tolerant the same way
    `art` is: a bare string is the music, which is what somebody typing a
    scene into a text editor writes before they read about ambience. */
export function normaliseAudio(a) {
  if (!a) return null;
  if (typeof a === 'string') {
    const music = normaliseLayer(a);
    return music ? { music, ambience: null } : null;
  }
  const music = normaliseLayer(a.music);
  const ambience = normaliseLayer(a.ambience);
  return music || ambience ? { music, ambience } : null;
}

/** What the players are allowed to learn about one npc. Hidden by default:
    one you forgot to configure should not be the one that spoils the
    ambush — the same rule whether it turns out to be a threat or a
    bartender, so there is exactly one default to remember. */
export function normaliseReveal(r) {
  const hp = ['none', 'coarse', 'exact'].includes(r?.hp) ? r.hp : 'coarse';
  return { on: r?.on === true, hp };
}

export function normalisePlay(p) {
  const out = Object.assign(blankPlay(), p);
  /* `hp: null` means "untouched, therefore full" and has to survive a round
     trip. Testing Number.isFinite alone does not: Number(null) is 0, which is
     finite, so a stored null came back as a character on the floor. */
  out.hp = p && p.hp != null && Number.isFinite(Number(p.hp)) ? Number(p.hp) : null;
  out.temp = Math.max(0, Number(out.temp) || 0);
  out.exh = Math.min(6, Math.max(0, Number(out.exh) || 0));
  out.conditions = Array.isArray(out.conditions) ? out.conditions.filter(CONDITION) : [];
  out.death = { ok: Math.min(3, Math.max(0, Number(out.death?.ok) || 0)),
                fail: Math.min(3, Math.max(0, Number(out.death?.fail) || 0)) };
  out.note = String(out.note || '');
  out.gold = Math.max(0, Number(out.gold) || 0);
  out.inventory = String(out.inventory || '');
  /* Held object ids. Whether an id still names anything is the catalog's
     question, answered at read time — no catalog in scope here. */
  out.objects = Array.isArray(out.objects)
    ? out.objects.filter(x => typeof x === 'string' && x)
    : [];
  return out;
}

/** Fills in anything a stored session is missing, so old saves keep opening —
    including the old app's full mesa.json shape with party and bestiary
    inline. `field.staged` (the removed Preparar feature) is read and quietly
    dropped. */
export function normaliseSession(s) {
  const out = Object.assign(blankSession(), s);
  out.version = 2;
  out.party = Array.isArray(s?.party) ? s.party.map(normalise) : [];
  out.bestiary = Array.isArray(s?.bestiary) ? s.bestiary.map(normaliseBeast) : [];
  out.objects = Array.isArray(s?.objects) ? s.objects.map(normaliseObject) : [];

  out.play = {};
  for (const c of out.party) out.play[c.id] = normalisePlay(s?.play?.[c.id]);

  /* Which players/*.json a party member came from, so autosave knows which
     file owns the character rather than inventing a new one. */
  out.playerFiles = {};
  for (const [id, path] of Object.entries(s?.playerFiles || {})) {
    if (typeof path === 'string' && out.party.some(c => c.id === id)) out.playerFiles[id] = path;
  }

  /* An npc instance, loaded independent of any scene or fight. A save from
     before this existed kept them nested under `encounter.npcs` instead —
     read from there too, so an old fight's monsters keep existing as loaded
     npcs rather than vanishing on import. */
  const oldNpcs = Array.isArray(s?.encounter?.npcs) ? s.encounter.npcs : [];
  const rawNpcs = Array.isArray(s?.npcs) ? s.npcs : oldNpcs;
  out.npcs = rawNpcs.map(n => Object.assign(normaliseBeast(n), normalisePlay(n)));

  const refs = new Set([...out.party.map(c => 'pc:' + c.id), ...out.npcs.map(n => 'npc:' + n.id)]);

  const e = s?.encounter || {};
  out.encounter = {
    on: false,
    round: Math.max(1, Number(e.round) || 1),
    activeRef: typeof e.activeRef === 'string' ? e.activeRef : null,
    members: [],
    init: {},
  };
  for (const [ref, v] of Object.entries(e.init || {})) {
    if (refs.has(ref) && Number.isFinite(Number(v))) out.encounter.init[ref] = Number(v);
  }
  /* Which npcs are in this fight used to be implied — every npc that existed
     was, by definition, in the one fight npcs could exist for. A save from
     before that split still has every one of its npcs in the fight it came
     from. */
  const wanted = Array.isArray(e.members) ? e.members : [...Object.keys(out.encounter.init), ...out.npcs.map(n => 'npc:' + n.id)];
  out.encounter.members = [...new Set(wanted.filter(r => refs.has(r)))];
  out.encounter.on = e.on === undefined
    ? out.encounter.members.length > 0            // migrating a save with no flag
    : e.on === true && out.encounter.members.length > 0;
  if (!out.encounter.members.includes(out.encounter.activeRef)) out.encounter.activeRef = null;

  const f = s?.field || {};
  out.field = blankField();
  out.field.cols = Math.min(60, Math.max(4, Number(f.cols) || 24));
  out.field.rows = Math.min(40, Math.max(4, Number(f.rows) || 14));
  /* A save from before scenes existed was always a live battlemap — that is
     all the board could be — so an absent flag reads as true rather than
     dropping an old session onto an empty library. */
  out.field.live = f.live === undefined ? true : f.live === true;
  out.field.grid = f.grid === undefined ? true : f.grid !== false;
  /* Whether the television is currently hearing about anything. Persisted
     rather than reset on reload: a laptop that sleeps mid-ambush should not
     wake up and quietly push the half-arranged board the moment it
     reconnects. */
  out.field.paused = f.paused === true;
  out.field.sceneId = typeof f.sceneId === 'string' ? f.sceneId : null;
  out.field.map = normaliseArt(f.map);
  out.field.audio = normaliseAudio(f.audio);
  /* A benched player is one the DM took off the board on purpose; an entry
     pointing at nobody, or at an npc (which has no bench of its own), is
     dropped. */
  out.field.benched = Array.isArray(f.benched)
    ? [...new Set(f.benched.filter(r => typeof r === 'string' && r.startsWith('pc:') && refs.has(r)))]
    : [];
  const seatedRefs = new Set([...refs].filter(r => !out.field.benched.includes(r)));
  /* Positions of anyone who no longer exists, or who was benched, are
     dropped, the same way stale initiative entries already are. */
  for (const [ref, at] of Object.entries(f.tokens || {})) {
    if (seatedRefs.has(ref) && Number.isFinite(Number(at?.x)) && Number.isFinite(Number(at?.y))) {
      out.field.tokens[ref] = { x: clampCol(out.field, at.x), y: clampRow(out.field, at.y) };
    }
  }
  for (const n of out.npcs) out.field.reveal[n.id] = normaliseReveal(f.reveal?.[n.id]);

  return out;
}

/** What session.json actually holds: play state only. The party and the
    bestiary live in their own files — writing them here again is how the old
    app ended up with three merge rules. playerFiles rides along because it
    is a fact about this table's copy of the party, not about any character. */
export function serialiseSession(session) {
  return {
    version: 2,
    play: session.play,
    playerFiles: session.playerFiles,
    npcs: session.npcs,
    encounter: session.encounter,
    field: session.field,
  };
}
