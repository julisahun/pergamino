/* The field: what the television is showing.

   This module is the whole reason for the rebuild. In the previous app the
   television's rendering was computed at push time from two booleans nobody
   named — `mode = !live ? 'idle' : grid ? 'field' : 'scene'` — which meant
   the state the players were looking at existed nowhere: not in the file, not
   on the DM's screen, not in one vocabulary. It could be written from a scene
   going live, from a dropped map, from starting a fight, and from a migration
   default, and the header reported a third thing entirely.

   So: `mode` is stored, it is written by the mode control and by nothing
   else, and there are exactly three of it. `hud` is the second stated fact —
   whether the party and turn-order strips ride along — rather than something
   the television grows on its own the moment a combatant exists. `paused` is
   a third, orthogonal one: the television keeps its last picture. None of the
   three is a synonym for another, and "en vivo" is not a word this app uses. */

/** @import { Field, FieldMode, Reveal, AudioLayer, AudioMix } from './types.js' */

/** The three modes, in the order the control shows them, each with the words
    the DM reads. This list IS the vocabulary: the admin control, the header
    and the mirror all render from here, so they cannot drift apart.
    @type {ReadonlyArray<{ key: FieldMode, es: string, hint: string }>} */
export const MODES = Object.freeze([
  { key: 'nada', es: 'Nada', hint: 'La tele no muestra nada.' },
  { key: 'escena', es: 'Escena', hint: 'Una imagen a pantalla completa. Sin cuadrícula.' },
  { key: 'tablero', es: 'Tablero', hint: 'La cuadrícula con las fichas encima.' },
]);

/** @type {ReadonlySet<string>} */
const MODE_KEYS = new Set(MODES.map(m => m.key));

export const isMode = (/** @type {unknown} */ v) => typeof v === 'string' && MODE_KEYS.has(v);

/** The Spanish word for a mode — the one the header says and the one the DM
    says out loud. @param {FieldMode} mode */
export const modeLabel = mode => MODES.find(m => m.key === mode)?.es ?? 'Nada';

/* The field is squares, not pixels: 24 x 14 of them is 36 m x 21 m, which is
   16:9 and so fills a television with no bars. */
export const COLS_MIN = 4, COLS_MAX = 60, ROWS_MIN = 4, ROWS_MAX = 40;

/** @returns {Field} */
export function blankField() {
  return {
    mode: 'nada', hud: false, paused: false,
    cols: 24, rows: 14,
    sceneId: null, map: null, audio: null,
    tokens: {}, reveal: {}, benched: [],
  };
}

const clamp = (/** @type {number} */ n, /** @type {number} */ lo, /** @type {number} */ hi) =>
  Math.min(hi, Math.max(lo, n));

export const clampCol = (/** @type {{cols:number}} */ f, /** @type {unknown} */ x) =>
  clamp(Math.round(Number(x) || 0), 0, f.cols - 1);
export const clampRow = (/** @type {{rows:number}} */ f, /** @type {unknown} */ y) =>
  clamp(Math.round(Number(y) || 0), 0, f.rows - 1);

/** How many rows of square tiles a picture of this shape wants. Rows are
    always derived from real proportions and never typed, which is what keeps
    a tile square. */
export const deriveRows = (/** @type {number} */ cols, /** @type {number} */ aspect) =>
  clamp(Math.round(cols / (aspect || 1)), ROWS_MIN, ROWS_MAX);

/** A picture reference: a campaign-relative path and nothing else. Bare
    strings are accepted because that is what a hand-written scene file says.
    @returns {{ src: string }|null} */
export function normaliseArt(/** @type {any} */ m) {
  const src = typeof m === 'string' ? m.trim()
    : (typeof m?.src === 'string' ? m.src.trim() : '');
  return src ? { src } : null;
}

/** One sound layer. `?? .5` rather than `|| .5`: a deliberate 0 is a layer
    turned all the way down, not a layer nobody configured.
    @returns {import('./types.js').AudioLayer|null} */
export function normaliseLayer(/** @type {any} */ l) {
  const src = typeof l === 'string' ? l.trim()
    : (typeof l?.src === 'string' ? l.src.trim() : '');
  if (!src) return null;
  const v = Number(l?.volume ?? .5);
  return { src, volume: clamp(Number.isFinite(v) ? v : .5, 0, 1), loop: l?.loop !== false };
}

/** Two layers, music and ambience. A bare string is the music — what somebody
    typing a scene into a text editor writes before they read about ambience.
    @returns {import('./types.js').AudioMix|null} */
export function normaliseAudio(/** @type {any} */ a) {
  if (!a) return null;
  if (typeof a === 'string') {
    const music = normaliseLayer(a);
    return music ? { music, ambience: null } : null;
  }
  const music = normaliseLayer(a.music), ambience = normaliseLayer(a.ambience);
  return music || ambience ? { music, ambience } : null;
}

/** What the players may learn about one npc. Hidden by default: the one you
    forgot to configure must not be the one that spoils the ambush.
    @returns {import('./types.js').Reveal} */
export function normaliseReveal(/** @type {any} */ r) {
  return {
    on: r?.on === true,
    hp: ['none', 'coarse', 'exact'].includes(r?.hp) ? r.hp : 'coarse',
  };
}

/** The one place the old two-boolean board is translated into the one mode.
    Kept as its own exported function because it is a claim about the past
    that a test can hold to account, not an implementation detail:

      live=false            → nada     (nothing was on the television)
      live=true, grid=true  → tablero  (the grid, with tokens)
      live=true, grid=false → escena   (art, full-bleed)

    A session from before scenes existed has neither flag and was always a
    live battlemap — that is all the board could be — so it reads as tablero.
    @param {any} f @returns {FieldMode} */
export function modeFromLegacy(f) {
  const live = f?.live === undefined ? true : f.live === true;
  const grid = f?.grid === undefined ? true : f.grid !== false;
  return !live ? 'nada' : grid ? 'tablero' : 'escena';
}

/** Reads any field ever written: the new shape, and the `live`/`grid` one.

    Tokens, reveal and benched are shape-checked here but not resolved — who
    still exists is a question about the whole session, answered by
    normaliseSession() once the party and the npcs are in hand.
    @param {any} raw @returns {Field} */
export function normaliseField(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const out = blankField();

  /* Three sources, in order of how much they actually know:
       a stored mode           — the only one that is a decision
       `live`/`grid`           — a v2 save, translated (modeFromLegacy)
       neither                 — a table nobody has sat at yet, which shows
                                 NOTHING. Reading the legacy default here is
                                 how a fresh campaign used to open with a bare
                                 grid on the television nobody asked for. */
  const legacy = 'live' in f || 'grid' in f;
  out.mode = isMode(f.mode) ? f.mode : legacy ? modeFromLegacy(f) : 'nada';
  /* The old television grew a HUD by itself as soon as a combatant existed,
     which is exactly the invisible state this rebuild removes. Migrating, the
     grid keeps its strips (it always had them) and a full-bleed scene starts
     without them; from then on it is the DM's switch, not a consequence. */
  out.hud = typeof f.hud === 'boolean' ? f.hud : out.mode === 'tablero';
  /* Persisted rather than reset on reload: a laptop that sleeps mid-ambush
     must not wake up and push the half-arranged board. */
  out.paused = f.paused === true;

  /* A number that is there is read and clamped; only one that is missing or
     unreadable falls back to the default. `|| 24` would quietly turn a
     deliberate (if silly) 0 into a full-size grid and tell nobody. */
  const size = (/** @type {unknown} */ v, /** @type {number} */ dflt,
                /** @type {number} */ lo, /** @type {number} */ hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : dflt;
  };
  out.cols = size(f.cols, 24, COLS_MIN, COLS_MAX);
  out.rows = size(f.rows, 14, ROWS_MIN, ROWS_MAX);
  out.sceneId = typeof f.sceneId === 'string' ? f.sceneId : null;
  out.map = normaliseArt(f.map);
  out.audio = normaliseAudio(f.audio);

  for (const [ref, at] of Object.entries(f.tokens || {})) {
    const p = /** @type {any} */ (at);
    if (Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) {
      out.tokens[ref] = { x: clampCol(out, p.x), y: clampRow(out, p.y) };
    }
  }
  for (const [id, r] of Object.entries(f.reveal || {})) out.reveal[id] = normaliseReveal(r);
  const benched = Array.isArray(f.benched) ? f.benched : [];
  out.benched = [...new Set(benched.filter((/** @type {any} */ r) =>
    typeof r === 'string' && r.startsWith('pc:')))];

  return out;
}
