/* Runs — one table playing a campaign, and the arithmetic of two layers.

   A campaign folder holds the preparation every table shares; a run holds
   what one table did with it:

     <campaign>/                  scenarios/ monsters/ objects/ story/ assets/
     <campaign>/runs/<mesa>/      players/ session.json, plus that table's own
                                  scenarios/ monsters/ objects/ assets/ and its
                                  notes (estado.md, bitacora/*.md, <mesa>.md)

   A run-local file SHADOWS the campaign's by id: `runs/guils/monsters/vann.json`
   is the Vann this table met, and the campaign's copy stays untouched for
   everyone else. Two mesas take the same adventure to different places without
   either editing the other's anything.

   A campaign with no `runs/` folder is FLAT: the root is its one implicit run,
   there is one layer, and nothing ever asks which. That is what
   `campaigns/example` is, and what every campaign was before runs existed.

   This module is pure path arithmetic on purpose — fs.js walks a real folder
   with it and check-campaign.js lints one with it, so "what the app can see"
   is written down once. */

/** @import { Layer, Run } from './types.js' */

export const RUNS_DIR = 'runs';

/* The picker's third choice: preparation only, no table. Not a slug a folder
   could ever have — `runs/#prep/` is not a thing. */
export const PREP_SLUG = '#prep';

/** The implicit run of a flat campaign: the root itself.
    @type {Run} */
export const FLAT_RUN = Object.freeze({ slug: '', path: '', label: null, prep: false });

/** Preparation-only mode. `path: null` because there is no table: no session,
    no party, and nothing that could be saved «sólo a esta mesa».
    @type {Run} */
export const PREP_RUN = Object.freeze({ slug: PREP_SLUG, path: null, label: 'Sólo preparación', prep: true });

/** A listRuns() entry as the Run the app carries around.
    @param {{slug: string, path: string, label: string}} r @returns {Run} */
export const runFrom = r => ({ slug: r.slug, path: r.path, label: r.label, prep: false });

/** The campaign-relative folder a run lives in. */
export const runPrefix = (/** @type {string} */ slug) => (slug ? `${RUNS_DIR}/${slug}` : '');

/** A run-relative path as a campaign-relative one. Everything outside this
    module speaks campaign-relative paths only — the same strings fs.js writes,
    trashes and compares mtimes on — so there is no second vocabulary. */
export const runRel = (/** @type {string|null} */ prefix, /** @type {string} */ rel) =>
  (prefix ? `${prefix}/${rel}` : rel);

export const isRunPath = (/** @type {string} */ path) =>
  path === RUNS_DIR || path.startsWith(RUNS_DIR + '/');

/** Which mesa a path belongs to, or null when it is campaign-level. */
export function runSlugOf(/** @type {string} */ path) {
  if (!isRunPath(path)) return null;
  const parts = path.split('/');
  return parts.length > 1 && parts[1] ? parts[1] : null;
}

/** A mesa's name for the picker when nothing better is on disk. */
export function runLabel(/** @type {string} */ slug) {
  const spaced = String(slug || '').replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `mesa: Guils` out of a run note's YAML frontmatter. The app does not
    otherwise care what is in these files — this is the one field it reads, so
    the picker can show the name the DM wrote rather than the folder's. */
export function mesaName(/** @type {string} */ text) {
  const m = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find(l => /^mesa\s*:/.test(l));
  const name = line ? line.replace(/^mesa\s*:/, '').trim() : '';
  return name || null;
}

/* ------------------------------------------------------------- buckets */

/** The three entity folders that exist in BOTH layers, and can therefore
    shadow. @type {ReadonlySet<string>} */
const PREP_JSON = new Set(['scenarios', 'monsters', 'objects']);

/** @typedef {'session'|'players'|'scenarios'|'monsters'|'objects'|'story'|'assets'} Bucket */

/** What the shared preparation holds. Notes must live under `story/` here: a
    README at the campaign root is somebody's own file, not a note.
    @param {string} rel @returns {Bucket|null} */
function campaignBucket(rel) {
  const parts = rel.split('/');
  if (parts.length === 2 && PREP_JSON.has(parts[0]) && rel.endsWith('.json'))
    return /** @type {Bucket} */ (parts[0]);
  if (parts[0] === 'story' && parts.length > 1 && rel.endsWith('.md')) return 'story';
  if (parts[0] === 'assets' && parts.length > 1) return 'assets';
  return null;
}

/** What one table's folder holds. Every `.md` inside a run is a note — the
    mesa's own `estado.md`, its `bitacora/`, `<mesa>.md`, a sheet's `players/*.md`
    — because that is what a run folder is for, and the DM wants to read them
    at the table beside the campaign's own.
    @param {string} rel @returns {Bucket|null} */
function runBucket(rel) {
  if (rel === 'session.json') return 'session';
  const parts = rel.split('/');
  if (parts.length === 2 && parts[0] === 'players' && rel.endsWith('.json')) return 'players';
  if (parts.length === 2 && PREP_JSON.has(parts[0]) && rel.endsWith('.json'))
    return /** @type {Bucket} */ (parts[0]);
  if (parts[0] === 'assets' && parts.length > 1) return 'assets';
  if (rel.endsWith('.md')) return 'story';
  return null;
}

/**
 * Which bucket of the boot payload a campaign-relative path belongs to and
 * which layer it is in — or null for a file the app does not read at all.
 *
 * `prefix` is the open run's folder: `''` for a flat campaign's implicit run
 * (one layer, everything reads as 'campaign'), `'runs/<mesa>'` for a real one,
 * and `null` for preparation-only mode, where there is no table and so neither
 * a session nor a party to find.
 *
 * @param {string} path @param {string|null} [prefix]
 * @returns {{ bucket: Bucket, layer: Layer }|null}
 */
export function classify(path, prefix = '') {
  if (prefix && (path === prefix || path.startsWith(prefix + '/'))) {
    const bucket = runBucket(path.slice(prefix.length + 1));
    return bucket ? { bucket, layer: 'run' } : null;
  }
  /* Anything else under runs/ belongs to some other table. Nothing reads it. */
  if (isRunPath(path)) return null;
  /* A flat campaign's root is its own run, so it answers to both vocabularies
     — but it is still one layer, and one layer is never called 'run'. */
  const bucket = prefix === '' ? (campaignBucket(path) ?? runBucket(path)) : campaignBucket(path);
  return bucket ? { bucket, layer: 'campaign' } : null;
}

/* ------------------------------------------------------------- layers */

/** Where a file of this layer goes, as a campaign-relative path. In a flat
    campaign or in preparation-only mode there is only one place it can go.
    @param {Run} run @param {Layer} layer @param {string} rel */
export const layerPath = (run, layer, rel) =>
  (layer === 'run' && run.path ? `${run.path}/${rel}` : rel);

/** Which layers this run can save into. One of them means no question to ask:
    the per-save modal appears only where there is a real choice.
    @param {Run} run @returns {Layer[]} */
export const layersOf = run => (run.path ? ['campaign', 'run'] : ['campaign']);

/** Which layer a campaign-relative path is in. A path under `runs/` belongs to
    a mesa — full stop, whichever mesa is open and whether one is at all. Asking
    "is it in the OPEN run" is a different question (`isMine`), and conflating
    the two made another table's file look like shared preparation from
    preparation-only mode, where `run.path` is null.
    @param {Run} run @param {string} path @returns {Layer} */
export const layerOf = (run, path) => (isRunPath(path) ? 'run' : 'campaign');

/** Whether a path belongs to the run that is currently open. A flat campaign's
    implicit run owns everything that is not under `runs/`.
    @param {Run} run @param {string} path */
export const isMine = (run, path) => (run.path
  ? path === run.path || path.startsWith(run.path + '/')
  : !run.prep && !isRunPath(path));

/** The words for a layer, as the DM reads them on a button and in a flash.
    @type {Record<Layer, {button: string, said: string}>} */
export const LAYER_WORDS = Object.freeze({
  campaign: { button: 'a la campaña', said: 'compartido con todas las mesas' },
  run: { button: 'sólo a esta mesa', said: 'sólo esta mesa' },
});

/**
 * The two layers resolved into what this table sees: a run-local entity wins
 * over the campaign's with the same id, and remembers what it displaced, so
 * the app can say «esta mesa tiene su propia versión» instead of silently
 * showing a different monster from the one the prep folder holds.
 *
 * @template {{id: string, file?: string}} T
 * @param {T[]} campaign @param {T[]} run
 * @returns {(T & {layer: Layer, shadows: string|null})[]}
 */
export function shadowById(campaign, run) {
  /** @type {Map<string, T & {layer: Layer, shadows: string|null}>} */
  const out = new Map();
  for (const e of campaign) out.set(e.id, { ...e, layer: 'campaign', shadows: null });
  for (const e of run) {
    const displaced = out.get(e.id);
    out.set(e.id, { ...e, layer: 'run', shadows: displaced?.file ?? null });
  }
  return [...out.values()];
}

/**
 * Assets have no ids, so they shadow by their path below `assets/`:
 * `runs/guils/assets/maps/cala.jpg` is this table's version of
 * `assets/maps/cala.jpg`. The campaign-relative path of the winner is what
 * comes back, because that is what everything downstream loads.
 *
 * @param {string[]} campaign @param {string[]} run @param {string} prefix
 * @returns {{ path: string, rel: string, layer: Layer, shadows: string|null }[]}
 */
export function shadowByPath(campaign, run, prefix) {
  /** @type {Map<string, { path: string, rel: string, layer: Layer, shadows: string|null }>} */
  const out = new Map();
  for (const path of campaign) out.set(path, { path, rel: path, layer: 'campaign', shadows: null });
  for (const path of run) {
    const rel = prefix && path.startsWith(prefix + '/') ? path.slice(prefix.length + 1) : path;
    const displaced = out.get(rel);
    out.set(rel, { path, rel, layer: 'run', shadows: displaced ? displaced.path : null });
  }
  return [...out.values()];
}
