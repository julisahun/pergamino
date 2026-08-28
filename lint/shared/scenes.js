/* A scene is *prep*: a named background, two audio layers, a grid setting,
   and what is standing on it. The encounter is play. Keeping them apart is
   what lets a scene be reused: loading one never mutates it, and throwing a
   session away never costs you a night's preparation.

   Scenes live in scenarios/*.json, one file each, small enough to write by
   hand in a text editor — so they have to survive being written by hand in
   a text editor (see normaliseScene's tolerances).

   Anything needing the DOM (decoding an image to learn its aspect ratio) is
   injected as `aspectOf(src, fallback)` so this module stays testable. */

/** @import { Scene, Session, Field } from './types.js' */

import { newId } from '../rules/character.js';
import { normaliseArt, normaliseAudio, clampCol, clampRow, deriveRows } from './field.js';
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
/** @param {any} raw */
export function normaliseRosterList(raw) {
  return Array.isArray(raw)
    ? raw.map((/** @type {any} */ r) => ({
        beastId: String(r?.beastId || '').trim(),
        x: Math.max(0, Math.round(Number(r?.x) || 0)),
        y: Math.max(0, Math.round(Number(r?.y) || 0)),
        objects: Array.isArray(r?.objects)
          ? r.objects.map((/** @type {any} */ id) => String(id || '').trim()).filter(Boolean)
          : [],
      })).filter(r => r.beastId)
    : [];
}

/** @returns {Scene} */
export function blankScene() {
  return {
    id: newId(), name: 'Escena sin nombre',
    art: null,                       // { src }
    audio: null,                     // { music, ambience }
    roster: [],
    cols: null,                      // this scene's own column count, or the table's if unset
    note: '',
    file: undefined,                 // scenarios/<name>.json, when it came from disk
  };
}

/** Tolerant the same way importCharacter() is: the envelope or a bare
    object, and anything missing filled in rather than refused. */
/** @param {any} s @returns {Scene} */
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
  out.cols = (() => {
    const c = String(raw?.grid?.cols ?? raw?.cols ?? '').trim();
    if (!c || !Number.isFinite(Number(c))) return null;
    return Math.min(60, Math.max(4, Math.round(Number(c))));
  })();
  out.file = typeof raw?.file === 'string' ? raw.file : undefined;
  /* `grid: {cols}` was the old shape's home for this, and is what every
     hand-written scene file says — read above, and dropped here so nothing
     downstream has two places to look. */
  delete (/** @type {any} */ (out)).grid;
  return out;
}

/** The grid a scene's own board should use — its own `grid`, when it is a
    real override, or whatever the table's is otherwise. The row count is
    derived from this scene's own art, never typed, so a scene's tiles can
    never come out anything but square. `aspectOf(src, fallback)` is the
    injected image-decoding seam; `urlFor` turns a campaign-relative path
    into something the decoder can actually load. */
/** @param {Scene|null} scene @param {Field} field
    @param {(src: string|null, fallback: number) => number} aspectOf
    @param {(src: string) => string|null} urlFor */
export function sceneGridSize(scene, field, aspectOf, urlFor) {
  if (!scene?.cols) return { cols: field.cols, rows: field.rows };
  const src = scene.art?.src ? urlFor(scene.art.src) : null;
  const aspect = aspectOf(src, field.cols / field.rows);
  return { cols: scene.cols, rows: deriveRows(scene.cols, aspect) };
}

/** Which of a scene's files are not in the campaign's asset list. An empty
    list cannot prove anything is missing, so it reports nothing rather than
    crying wolf about every scene in the library. */
/** @param {Scene} scene @param {string[]} assets */
export function missingAssets(scene, assets) {
  if (!assets.length) return [];
  const want = [scene?.art?.src, scene?.audio?.music?.src, scene?.audio?.ambience?.src];
  return want.filter(p => p && !assets.includes(p));
}

/** Seats scene.roster's prepared npcs the moment their scene goes live,
    spawning each from the bestiary — a fresh instance, never a shared
    reference, so tuning one goblin's hit points mid-fight cannot reach back
    into the roster. A beastId the bestiary no longer has is skipped rather
    than refused. A square already standing on somebody is left alone: that
    is what makes going live on the same scene twice not double its ambush. */
/** @param {Session} session @param {Scene} scene @param {Field} f */
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

/**
 * Putting a scene on the table. It writes the FIELD and nothing else: the
 * party stays as wounded as it was, a fight in progress is untouched, and no
 * tab moves — changing what the players are looking at is not an event in the
 * fight and not a reason to relocate the DM.
 *
 * One thing it deliberately does NOT decide any more: the mode. The old app
 * forced the grid off here, which meant a scene going live silently changed
 * what kind of thing the television was showing. The mode is one stated
 * control now; a scene supplies the picture, the sound and (when it says so)
 * the size of the board. `scene: null` is «Sin escena»: art, audio and the
 * scene id are cleared, and the mode stays exactly where the DM put it.
 *
 * @param {Session} session @param {Scene|null} scene
 * @param {{aspectOf: (src: string|null, fallback: number) => number,
 *          urlFor: (src: string) => string|null}} io
 */
export function putOnTable(session, scene, io) {
  const f = session.field;
  f.sceneId = scene ? scene.id : null;
  if (scene) {
    /* The board's size IS the scene's to decide when it says so — a floorplan
       drawn for a 20x20 room should not have to share the table's usual 24x14.
       Applied before the roster resolves and before anybody already on the
       field gets reclamped. */
    if (scene.cols) {
      const size = sceneGridSize(scene, f, io.aspectOf, io.urlFor);
      f.cols = size.cols; f.rows = size.rows;
    }
    /* Paths, not URLs: what the field persists is what a hand-written scene
       file says, and each window resolves it for itself. */
    f.map = scene.art ? { src: scene.art.src } : null;
    f.audio = normaliseAudio(scene.audio);
    resolveRoster(session, scene, f);
  } else {
    f.map = null;
    f.audio = null;
  }
  /* Shrinking the field can leave somebody outside it, the same way the column
     and row boxes can. */
  for (const at of Object.values(f.tokens)) {
    at.x = clampCol(f, at.x); at.y = clampRow(f, at.y);
  }
  seatAll(session);
}

export { freeSquare };
