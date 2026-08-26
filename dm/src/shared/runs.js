/* Runs — one table playing a campaign. A campaign folder holds the
   preparation every table shares (story/, scenarios/, monsters/, objects/,
   assets/); a run holds what one table did with it:

     runs/<mesa>/players/*.json     the party that sat down
     runs/<mesa>/session.json       the live table
     runs/<mesa>/.dm-room           which relay channel it broadcasts on

   Two mesas can take the same adventure to different places without either
   one editing the other's anything.

   A campaign with no `runs/` folder at all is a *flat* campaign — the way
   every campaign looked before runs existed, and the way `campaigns/example`
   still looks. There the root itself is the implicit run: prefix `''`, and
   every path below reads exactly as it always did.

   This module is pure path arithmetic on purpose: fs.js walks a real folder
   with it, and check-campaign.js lints one with it, so "what the app can
   see" is written down once. */

export const RUNS_DIR = 'runs';

/* The picker's third choice, and what the remembered-mesa key holds for it.
   Not a slug a folder could ever have: `runs/#prep/` is not a thing. */
export const PREP_SLUG = '#prep';

/* The three kinds of thing the mesa picker hands back. A flat campaign — no
   runs/ folder, the way every campaign looked before runs existed — has
   exactly one implicit run at the root and never shows a picker at all. */
export const FLAT_RUN = { path: '', slug: '', label: null, prep: false };
export const PREP_RUN = { path: null, slug: PREP_SLUG, label: 'Sólo preparación', prep: true };
export const runFrom = r => ({ path: r.path, slug: r.slug, label: r.label, prep: false });

/** The campaign-relative folder a run lives in. `null`/`''` — the implicit
    run of a flat campaign — is the campaign root itself. */
export const runPrefix = slug => (slug ? `${RUNS_DIR}/${slug}` : '');

/** A run-relative path as a campaign-relative one. Everything outside this
    module speaks campaign-relative paths only — the same strings fs.js
    writes, trashes and compares mtimes on — so there is no second
    vocabulary to keep straight. */
export const runRel = (prefix, rel) => (prefix ? `${prefix}/${rel}` : rel);

export const isRunPath = path => path === RUNS_DIR || path.startsWith(RUNS_DIR + '/');

/** Which run a path belongs to, or null when it is campaign-level. */
export function runSlugOf(path) {
  if (!isRunPath(path)) return null;
  const parts = path.split('/');
  return parts.length > 1 && parts[1] ? parts[1] : null;
}

/** A mesa's name for the picker when nothing better is on disk: the slug,
    spaced and capitalised. */
export function runLabel(slug) {
  const spaced = String(slug || '').replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `mesa: Guils` out of a run note's YAML frontmatter. The app does not
    otherwise care what is in these files — this is the one field it reads,
    so the picker can show the name the DM wrote rather than the folder. */
export function mesaName(text) {
  const m = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find(l => /^mesa\s*:/.test(l));
  const name = line ? line.replace(/^mesa\s*:/, '').trim() : '';
  return name || null;
}

const PREP_JSON = new Set(['scenarios', 'monsters', 'objects']);

/** Which bucket of the boot payload a campaign-relative path belongs to, or
    null for a file the app does not read at all.

    `prefix` is the open run's folder — `''` for a flat campaign's implicit
    run, and `null` for preparation-only mode, where there is no table and so
    neither a session nor a party to find. */
export function classify(path, prefix = '') {
  if (prefix != null) {
    if (path === runRel(prefix, 'session.json')) return 'session';
    const players = runRel(prefix, 'players/');
    if (path.startsWith(players) && path.endsWith('.json')
        && !path.slice(players.length).includes('/')) return 'players';
  }
  /* Anything else under runs/ belongs to some table — this one's leftovers or
     another's — and nothing reads it yet. */
  if (isRunPath(path)) return null;
  const parts = path.split('/');
  if (parts.length === 2 && PREP_JSON.has(parts[0]) && path.endsWith('.json')) return parts[0];
  if (path.startsWith('story/') && path.endsWith('.md')) return 'story';
  if (path.startsWith('assets/')) return 'assets';
  return null;
}
