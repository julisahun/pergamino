/* A scene is *prep*: a named background, two audio layers, a grid setting,
   and what is standing on it. The encounter is play. Keeping them apart is
   what lets a scene be reused: loading one never mutates it, and throwing a
   session away never costs you a night's preparation.

   Scenes live in scenarios/*.json, one file each, small enough to write by
   hand in a text editor — so they have to survive being written by hand in
   a text editor (see normaliseScene's tolerances).

   Anything needing the DOM (decoding an image to learn its aspect ratio) is
   injected as `aspectOf(src, fallback)` so this module stays testable. */

import { newId } from '../rules/character.js';
import { normaliseArt, normaliseAudio, clampCol, clampRow } from './session.js';
import { normaliseBeast } from './beasts.js';
import { blankPlay } from './session.js';
import { freeSquare, seatAll } from './combat.js';
import { modTotals } from './objects.js';

/** A roster is a list of bestiary ids, squares, and what each one carries
    (object ids, duplicates stack — the same shape a holder's list has in
    play). An entry with no bestiary id is not a placement of anything, so it
    is dropped rather than kept as a blank; whether the ids still point at
    somebody in the bestiary or the catalog is a question for whoever
    resolves the roster, not for parsing it. */
export function normaliseRosterList(raw) {
  return Array.isArray(raw)
    ? raw.map(r => ({
        beastId: String(r?.beastId || '').trim(),
        x: Math.max(0, Math.round(Number(r?.x) || 0)),
        y: Math.max(0, Math.round(Number(r?.y) || 0)),
        objects: Array.isArray(r?.objects)
          ? r.objects.map(id => String(id || '').trim()).filter(Boolean)
          : [],
      })).filter(r => r.beastId)
    : [];
}

export function blankScene() {
  return {
    id: newId(), name: 'Escena sin nombre',
    art: null,                       // { src }
    audio: null,                     // { music, ambience }
    roster: [],
    grid: null,                      // { cols } — this scene's own column count, or the table's if unset
    note: '',
    file: null,                      // scenarios/<name>.json, when it came from disk
  };
}

/** Tolerant the same way importCharacter() is: the envelope or a bare
    object, and anything missing filled in rather than refused. */
export function normaliseScene(s) {
  const raw = s?.kind === 'dnd-dm-scene' ? s.scene : (s?.scene || s);
  const out = Object.assign(blankScene(), raw);
  out.id = String(raw?.id || '').trim() || newId();
  out.name = String(raw?.name || '').trim() || 'Escena sin nombre';
  /* `art` accepts a bare string, because "assets/taberna.jpg" is what somebody
     writing this by hand will type before anything else about it. */
  out.art = typeof raw?.art === 'string'
    ? normaliseArt({ src: raw.art })
    : normaliseArt(raw?.art);
  out.audio = normaliseAudio(raw?.audio);
  out.note = String(raw?.note || '');
  /* Whether a beastId still points at somebody in the bestiary is checked
     later, at resolve time, not here: a scene read before its campaign's
     monsters are should not lose its roster for it. */
  out.roster = normaliseRosterList(raw?.roster);
  /* Only a real override if it is a number at all — an empty string is not
     zero even though Number('') says otherwise. Absent, it stays absent: a
     scene with no opinion keeps using whatever the table's own grid already
     is. A `rows` from a save written before rows stopped being typed is read
     and quietly dropped — sceneGridSize() derives it fresh from this scene's
     own art every time, so a stale number here could only drift. */
  out.grid = (() => {
    const c = String(raw?.grid?.cols ?? '').trim();
    if (!c || !Number.isFinite(Number(c))) return null;
    return { cols: Math.min(60, Math.max(4, Math.round(Number(c)))) };
  })();
  out.file = typeof raw?.file === 'string' ? raw.file : null;
  return out;
}

/** Rows a column count turns into once squares have to stay square: the
    board's actual shape (an image's own proportions, or the table's current
    ratio absent one) divided out of the column count the DM actually typed. */
export function deriveRows(cols, aspect) {
  return Math.min(40, Math.max(4, Math.round(cols / (aspect || 1))));
}

/** The grid a scene's own board should use — its own `grid`, when it is a
    real override, or whatever the table's is otherwise. The row count is
    derived from this scene's own art, never typed, so a scene's tiles can
    never come out anything but square. `aspectOf(src, fallback)` is the
    injected image-decoding seam; `urlFor` turns a campaign-relative path
    into something the decoder can actually load. */
export function sceneGridSize(scene, field, aspectOf, urlFor) {
  if (!scene?.grid) return { cols: field.cols, rows: field.rows };
  const src = scene.art?.src ? urlFor(scene.art.src) : null;
  const aspect = aspectOf(src, field.cols / field.rows);
  return { cols: scene.grid.cols, rows: deriveRows(scene.grid.cols, aspect) };
}

/** Which of a scene's files are not in the campaign's asset list. An empty
    list cannot prove anything is missing, so it reports nothing rather than
    crying wolf about every scene in the library. */
export function missingAssets(scene, assets) {
  if (!assets.length) return [];
  const want = [scene?.art?.src, scene?.audio?.music?.src, scene?.audio?.ambience?.src];
  return want.filter(p => p && !assets.includes(p));
}

/** A scene's art and audio, resolved to real URLs once, rather than at every
    place f.map/f.audio get rendered or sent to the television — the
    library's own copy (scene.art, scene.audio) stays the portable,
    campaign-root-relative path a hand-written scene file has. */
export function resolveSceneAssets(scene, urlFor) {
  const map = scene.art ? { ...scene.art, src: scene.art.src ? urlFor(scene.art.src) : scene.art.src } : null;
  /* normaliseAudio rather than a spread, because it builds fresh objects: the
     result must not end up sharing a layer with the library, or turning the
     tavern's music down would quietly edit the tavern. */
  const audio = normaliseAudio(scene.audio);
  if (audio) {
    if (audio.music) audio.music.src = urlFor(audio.music.src);
    if (audio.ambience) audio.ambience.src = urlFor(audio.ambience.src);
  }
  return { map, audio };
}

/** Seats scene.roster's prepared npcs the moment their scene goes live,
    spawning each from the bestiary — a fresh instance, never a shared
    reference, so tuning one goblin's hit points mid-fight cannot reach back
    into the roster. A beastId the bestiary no longer has is skipped rather
    than refused. A square already standing on somebody is left alone: that
    is what makes going live on the same scene twice not double its ambush. */
export function resolveRoster(session, scene, f) {
  if (!scene.roster.length) return;
  const seated = new Set(Object.values(f.tokens).map(p => p.x + ',' + p.y));
  for (const r of scene.roster) {
    const beast = session.bestiary.find(b => b.id === r.beastId);
    if (!beast) continue;
    const x = clampCol(f, r.x), y = clampRow(f, r.y), key = x + ',' + y;
    if (seated.has(key)) continue;
    const n = normaliseBeast({ ...beast, id: newId(), name: beast.name });
    /* What it carries is filtered against the catalog the same way beastId
       is against the bestiary: an object deleted since the scene was written
       spawns nothing rather than a dangling id. The spawn hp counts the
       carried +PG in, because a numeric hp below the handle's maximum reads
       as wounded — and nobody starts an ambush wounded by their own ring. */
    const held = r.objects.filter(id => (session.objects || []).some(o => o.id === id));
    session.npcs.push(Object.assign(n, blankPlay(), {
      hp: n.hpMax + modTotals(session.objects || [], held).hpMax,
      objects: held,
    }));
    f.tokens['npc:' + n.id] = { x, y };
    seated.add(key);
  }
}

/** Loading a scene onto the board — the only scene action there is. It
    writes the *field* and nothing else: the party stays as wounded as it
    was, and a fight in progress is untouched, because changing what the
    players are looking at is not an event in the fight. `scene: null` is
    "Sin escena" — clears art, audio and grid entirely. */
export function goLive(session, scene, { aspectOf, urlFor }) {
  const f = session.field;
  f.live = true;
  f.sceneId = scene ? scene.id : null;
  if (scene) {
    /* A scene always loads with the grid off — full-bleed art — regardless of
       whatever the toggle was doing before. The DM decides fresh each time
       whether this one needs tokens on it; the scene itself has no opinion. */
    f.grid = false;
    /* The board's size, on the other hand, *is* the scene's to decide when it
       says so — a floorplan drawn for a 20×20 room should not have to share
       the table's usual 24×14. Applied before the roster resolves and before
       anyone already on the field gets reclamped. */
    if (scene.grid) { const size = sceneGridSize(scene, f, aspectOf, urlFor); f.cols = size.cols; f.rows = size.rows; }
    const { map, audio } = resolveSceneAssets(scene, urlFor);
    f.map = map;
    f.audio = audio;
    resolveRoster(session, scene, f);
  } else {
    /* "Sin escena" clears the grid too: an empty board with no art and no
       tokens on it reads as a mistake, not a deliberate battlemap. The DM
       still has the toggle to turn it back on once there is a reason to. */
    f.grid = false;
    f.map = null;
    f.audio = null;
  }
  /* Shrinking the field can leave somebody outside it, the same way the
     column and row boxes can. */
  for (const at of Object.values(f.tokens)) {
    at.x = clampCol(f, at.x); at.y = clampRow(f, at.y);
  }
  seatAll(session);
}

export { freeSquare };
