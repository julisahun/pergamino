/* One state object, one subscriber (the root render), and the verbs the whole
   admin app is allowed to use.

   There are four, and only four:

     update(fn)        mutate + re-render. Not a save, not an undo step: ui
                       state, filters, a drag in progress.
     touch()           re-render only (a picture decoded, a flash expired).
     commit(label, fn) an undo step: snapshot the session, mutate it, save it,
                       hand it to the television. Every play mutation.
     tweak(fn)         the same, minus the undo step. Every call site carries a
                       one-line reason it is not one.

   Nothing else may touch the session. That is invariant 1, and it is the rule
   that keeps `⟲` able to say what it will undo.

   Writing is never implicit about where it went. Every save goes through
   `wrote()`, which names the file and the layer in the flash, because with two
   layers "guardado" alone is the sentence that made the old app confusing:
   half of it wrote run-local and half wrote shared, from the same screen. */

/** @import { Run, Layer, Session } from '../shared/types.js' */
import { LAYER_WORDS, FLAT_RUN, layerOf, runRel } from '../shared/runs.js';
import { blankSession, serialiseSession } from '../shared/session.js';
import { Autosaver } from './disk.js';
import { readBlob } from './fs.js';

export const state = {
  booted: false,
  /** @type {FileSystemDirectoryHandle|null} */
  root: null,               // the picked campaign folder
  /** @type {string|null} */
  rootName: null,
  /** Which mesa is sitting at this campaign. @type {Run} */
  run: { ...FLAT_RUN },
  /** @type {import('./fs.js').RunInfo[]} */
  runs: [],                 // what listRuns() found, for the picker
  /** A granted folder waiting for its mesa to be picked.
      @type {FileSystemDirectoryHandle|null} */
  pendingRoot: null,
  /** @type {string|null} */
  rememberedName: null,     // last folder's name, for the gate's Reabrir
  /** @type {import('./fs.js').Tree|null} */
  tree: null,               // the last read, as it came off disk
  /** The table itself. @type {Session} */
  session: blankSession(),
  /** The scene library, both layers resolved. @type {any[]} */
  scenes: [],
  /** Every note this mesa can see: the campaign's story/ and its own.
      @type {any[]} */
  story: [],
  /** Every asset path, as the app refers to it (campaign-relative, with a
      mesa's own copy shadowing the campaign's). @type {string[]} */
  assetPaths: [],
  /** What the television last complained about, if anything. @type {string|null} */
  tvTrouble: null,
  /** @type {Map<string, string>} */
  assetUrls: new Map(),     // campaign-relative path -> object URL, this window only
  /** Where a campaign-level asset path actually reads from, when this mesa has
      its own copy of it. @type {Map<string, string>} */
  assetAliases: new Map(),
  /** @type {string|null} */
  flash: null,
  ui: {
    tab: 'juego',
    /** @type {string|null} */
    modal: null,
    /** Cards expanded to their details, kept across re-renders. @type {Set<string>} */
    openRows: new Set(),
    /** Cards marked for one shared damage box. @type {Set<string>} */
    picked: new Set(),
    /** Which condition's rules text is open. @type {string|null} */
    condFor: null,
    /** Who is ticked in the muster picker, before a fight exists. @type {Set<string>} */
    muster: new Set(),
    /** The initiative totals collected so far. Outside the session on purpose:
        nothing has started yet, and closing the wizard by accident four names
        in must not mean asking the table again. @type {Map<string, number>} */
    rolled: new Map(),
    /** The token whose reach is lit. @type {string|null} */
    selectedToken: null,
    /* Drafts: an editor edits a copy, and nothing reaches the campaign folder
       until Guardar. @type {any} */
    beastDraft: /** @type {any} */ (null),
    objectDraft: /** @type {any} */ (null),
    sceneDraft: /** @type {any} */ (null),
    /** Which note Historia has open. @type {string|null} */
    openNote: null,
    /** A save waiting for the DM to say which layer it goes to.
        @type {import('./layers.js').PendingSave|null} */
    pendingSave: null,
    /** The name being typed for a new mesa, or null. @type {string|null} */
    newMesa: null,
    /** The level being taken, before it is taken. @type {any} */
    levelDraft: null,
    /** @type {Record<string, string>} */
    filters: { monstruos: '', escenas: '', objetos: '', story: '' },
    sessionConflict: false,
  },
};

let listener = () => {};
export const subscribe = (/** @type {() => void} */ fn) => { listener = fn; };
export const touch = () => listener();

/* What happens after the session changes, wired at boot (main.js) rather than
   imported here: the television lives in another module and importing it from
   this one would make a cycle out of the two files everything else imports. */
let afterMutation = () => {};
export const onAfterMutation = (/** @type {() => void} */ fn) => { afterMutation = fn; };

export function update(/** @type {((s: typeof state) => void)=} */ fn) {
  if (fn) fn(state);
  listener();
}

/* ------------------------------------------------------ the session verbs
   A 25-deep stack of whole-session snapshots, not diffs: an area attack that
   wounded five characters undoes as one step, which is what the DM means by
   "undo that". */

/** @type {{label: string, snap: Session}[]} */
const undoStack = [];
export const undoDepth = () => undoStack.length;
export const undoLabel = () => (undoStack.length ? undoStack[undoStack.length - 1].label : '');

/** An undo step. `label` is shown on the button, so it is written as the thing
    the DM did: «7 de daño a Vann», not «updateHp».
    @param {string} label @param {(s: typeof state) => void} fn */
export function commit(label, fn) {
  undoStack.push({ label, snap: structuredClone(state.session) });
  if (undoStack.length > 25) undoStack.shift();
  fn(state);
  afterSessionMutation();
  listener();
}

/** A session change that is deliberately NOT an undo step. Every call site
    says why in one line — dragging a token, pausing the television, resizing
    the grid: things where an undo button would undo the wrong thing.
    @param {(s: typeof state) => void} fn */
export function tweak(fn) {
  fn(state);
  afterSessionMutation();
  listener();
}

export function undo() {
  const last = undoStack.pop();
  if (!last) return;
  state.session = last.snap;
  afterSessionMutation();
  listener();
}

function afterSessionMutation() {
  saveSession();
  afterMutation();
}

/** Where this mesa's play state lives. Preparation-only mode has no table, so
    it has no session file either. */
export const sessionPath = () => (state.run.prep ? null : runRel(state.run.path, 'session.json'));

export function saveSession() {
  const rel = sessionPath();
  if (rel) saver?.mark(rel, () => JSON.stringify(serialiseSession(state.session), null, 2) + '\n');
}

/* The volume is a property of this machine and the television plugged into it
   — not session state, not an undo step, not in the campaign folder. */
export const audioPrefs = (() => {
  try {
    const r = JSON.parse(localStorage.getItem('dnd-dm-audio') || 'null');
    const m = Number(r?.master);
    return { master: Number.isFinite(m) ? Math.min(1, Math.max(0, m)) : .7,
             muted: r?.muted === true };
  } catch { return { master: .7, muted: false }; }
})();

export function saveAudioPrefs() {
  try { localStorage.setItem('dnd-dm-audio', JSON.stringify(audioPrefs)); } catch { /* private mode */ }
}

/* ----------------------------------------------------------------- flash */

/** @type {ReturnType<typeof setTimeout>|undefined} */
let flashTimer;
export function flash(/** @type {string} */ msg) {
  state.flash = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { state.flash = null; listener(); }, 5000);
  listener();
}

/** The one sentence a write is allowed to say. Invariant 6: every write names
    the file it landed in and the layer it belongs to.
      «Vann guardado en runs/guils/monsters/vann.json — sólo esta mesa.»
    In a flat campaign there is one layer, so the words for it are dropped
    rather than stated pointlessly.
    @param {string} what @param {string} rel */
export function wrote(what, rel) {
  const layer = layerOf(state.run, rel);
  const twoLayers = !!state.run.path;
  flash(twoLayers
    ? `${what} guardado en ${rel} — ${LAYER_WORDS[layer].said}.`
    : `${what} guardado en ${rel}.`);
}

/* ------------------------------------------------------------- the saver */

/** @type {Autosaver|null} */
let saver = null;

export function attachSaver(/** @type {FileSystemDirectoryHandle} */ root) {
  saver = new Autosaver(root, msg => flash(msg));
}

export function detachSaver() {
  saver?.detach();
  saver = null;
}

/** JSON entity, pretty-printed the way a hand-edited file looks.
    @param {string} rel @param {unknown} obj */
export function saveEntity(rel, obj) {
  saver?.mark(rel, () => JSON.stringify(obj, null, 2) + '\n');
}

/** A file that is plain text on disk — a note. @param {string} rel @param {string} text */
export function saveRaw(rel, text) {
  saver?.mark(rel, () => text);
}

/** A picture or a sound. The blob is in hand, so this window's URL cache
    learns about it now rather than after the debounced write lands: a
    just-dropped map renders at once.
    @param {string} rel @param {Blob} blob */
export function saveBinary(rel, blob) {
  if (!saver) return;
  const old = state.assetUrls.get(rel);
  if (old) URL.revokeObjectURL(old);
  state.assetUrls.set(rel, URL.createObjectURL(blob));
  saver.mark(rel, () => blob);
}

/** Force everything pending to disk now — used before a folder or a mesa is
    let go of. */
export const flushSaves = () => saver?.flush();

/* ------------------------------------------------------------- aspectOf
   A picture's own width-over-height, decoded once and remembered. Unknown or
   still decoding reads as `fallback` rather than blocking: whatever asked gets
   an answer now, and a re-render once the image actually decodes. */

/** @type {Record<string, number>} */
const aspects = {};

/** @param {string|null} src @param {number} fallback */
export function aspectOf(src, fallback) {
  if (!src) return fallback;
  const url = urlFor(src) ?? src;
  if (url in aspects) return aspects[url] || fallback;
  aspects[url] = 0;
  const img = new Image();
  img.onload = () => { aspects[url] = img.naturalWidth / img.naturalHeight; touch(); };
  img.onerror = () => { aspects[url] = fallback; };
  img.src = url;
  return fallback;
}

/* ------------------------------------------------------------ asset URLs
   A campaign-relative path resolved to something this window can load. Object
   URLs over local Files are lazy — no bytes are read to make one — so the
   whole asset list costs nothing until something is actually rendered. */

export const urlFor = (/** @type {string|null} */ p) => {
  if (!p) return null;
  if (p.startsWith('data:') || p.startsWith('blob:')) return p;   // inline portrait bytes
  return state.assetUrls.get(state.assetAliases.get(p) ?? p) ?? null;
};

/** @param {FileSystemDirectoryHandle} root @param {string[]} paths
    @param {string[]} [changed] paths whose bytes moved under an existing URL */
export async function refreshAssetUrls(root, paths, changed = []) {
  const keep = new Set(paths);
  for (const [rel, url] of [...state.assetUrls]) {
    if (!keep.has(rel) || changed.includes(rel)) {
      URL.revokeObjectURL(url);
      state.assetUrls.delete(rel);
    }
  }
  await Promise.all(paths.map(async rel => {
    if (state.assetUrls.has(rel)) return;
    try {
      state.assetUrls.set(rel, URL.createObjectURL(await readBlob(root, rel)));
    } catch { /* listed a moment ago, gone now — the next poll settles it */ }
  }));
  touch();
}
