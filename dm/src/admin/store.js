/* One state object, one subscriber (the root render), and the three verbs
   the whole admin app uses:

     update(fn)          mutate + re-render. NOT an undo step, NOT a save —
                         ui state, filters, drags in progress.
     commit(label, fn)   an undo step: snapshot the session, mutate, save
                         session.json, push the board. Every play mutation.
     touch()             re-render only (a decoded image arrived, a flash
                         expired).

   Token drags, pause, volume and scene-draft edits use update() — the exact
   "not an undo step" list the old app kept.

   Assets live in two URL spaces. For this window, `urlFor` maps a campaign-
   relative path to an object URL over the local file (instant, never leaves
   the machine). For the television — another device, which cannot see this
   browser's blob: URLs — the board push resolves the same paths against the
   relay's ephemeral asset cache instead (/api/asset/<sha-256>), uploading
   whatever the current board references that the relay does not hold yet. */

import { blankSession, serialiseSession } from '../shared/session.js';
import { buildBoard } from '../shared/board.js';
import { Autosaver, postBoard, putAsset, sha256 } from './api.js';
import { readAssetBlob } from './fs.js';

export const state = {
  booted: false,
  root: null,                // the picked campaign folder's directory handle
  rootName: null,            // its name, for the top bar
  room: null,                // this campaign's relay room code (.dm-room)
  rememberedName: null,      // last folder's name, for the gate's Reabrir
  lanUrl: null,              // http://192.168.x.x:8420 — shown beside Tablero ↗
  admins: 1,                 // SSE-reported admin count; >1 shows a warning
  session: blankSession(),
  scenes: [],
  assets: [],
  assetUrls: new Map(),      // relpath -> object URL, for this window only
  story: { notes: [] },
  flash: null,
  ui: {
    tab: 'juego',
    modal: null,
    condFor: null,
    selectedToken: null,
    openRows: new Set(),     // expanded cards, survives re-render
    picked: new Set(),       // multi-target damage selection
    musterOpen: false,
    showTV: false,
    editingSceneId: null,
    editorDraft: null,
    storyOpen: null,
    storyEditing: false,     // the open note is in the split editor
    storyDraft: null,        // the editor's text, written through saveRaw
    storyCollapsed: new Set(),  // index groups folded shut (per window, not stored)
    musterOpen: new Set(),   // expanded muster rows
    /* The initiative totals the wizard has collected so far, which outlive
       the modal: closing it by accident four names in should not mean asking
       the table again. endCombat() is what forgets them. */
    rolled: new Map(),
    dmgHelp: null,           // card ref whose damage-box legend is open
    filters: { escenas: '', monstruos: '', objetos: '', story: '' },
    sessionConflict: false,  // session.json changed on disk while we were open
  },
};

let listener = () => {};
export const subscribe = fn => { listener = fn; };
export const touch = () => listener();

export function update(fn) {
  if (fn) fn(state);
  listener();
}

/* --------------------------------------------------------------- undo
   A 25-deep snapshot stack of the whole session (not a diff) — an area
   attack undoes as one step. */

const undoStack = [];
export const undoDepth = () => undoStack.length;
export const undoLabel = () => undoStack.length ? undoStack[undoStack.length - 1].label : '';

export function commit(label, fn) {
  undoStack.push({ label, snap: structuredClone(state.session) });
  if (undoStack.length > 25) undoStack.shift();
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

/* ------------------------------------------------------------ asset URLs */

export const urlFor = p => p ? (state.assetUrls.get(p) ?? null) : p;

/* The relay-side resolution of the same paths, lazily built: hash on first
   need, upload on first need, remembered until the file changes on disk. */
const relayUrls = new Map();       // relpath -> '/api/asset/<hash>'
const hashToRel = new Map();       // hash -> relpath, to honour "missing" replies

function invalidateAsset(rel) {
  const old = state.assetUrls.get(rel);
  if (old) { URL.revokeObjectURL(old); state.assetUrls.delete(rel); }
  const url = relayUrls.get(rel);
  if (url) { relayUrls.delete(rel); hashToRel.delete(url.split('/').pop()); }
}

/** Rebuild the relpath → object URL map after a tree (re)load. Object URLs
    over Files are lazy — no bytes are read here — so doing every asset at
    once is cheap. `changed` forces new URLs where the file's content moved
    under an existing one. */
export async function refreshAssetUrls(root, assetPaths, changed = []) {
  const keep = new Set(assetPaths);
  for (const rel of [...state.assetUrls.keys()]) if (!keep.has(rel)) invalidateAsset(rel);
  for (const rel of changed) if (keep.has(rel)) invalidateAsset(rel);
  await Promise.all(assetPaths.map(async rel => {
    if (state.assetUrls.has(rel)) return;
    try {
      state.assetUrls.set(rel, URL.createObjectURL(await readAssetBlob(root, rel)));
    } catch { /* listed a moment ago, gone now — the poll will settle it */ }
  }));
  touch();
}

async function ensureRelayUrl(rel) {
  if (relayUrls.has(rel)) return;
  const blob = await readAssetBlob(state.root, rel);
  const hash = await sha256(blob);
  const url = await putAsset(hash, blob);
  relayUrls.set(rel, url);
  hashToRel.set(hash, rel);
}

/* ----------------------------------------------------- save + board push */

let saver = null;
export function attachSaver(root) {
  saver = new Autosaver(root, msg => update(s => { s.flash = msg; }));
}

export function detachSaver() {
  if (saver) saver.flush();
  saver = null;
}

export function saveSession() {
  if (saver) saver.mark('session.json',
    () => JSON.stringify(serialiseSession(state.session), null, 2));
}

export function saveEntity(rel, obj) {
  if (saver) saver.mark(rel, () => JSON.stringify(obj, null, 2));
}

/** For files that are plain text on disk — a story note — not JSON. */
export function saveRaw(rel, text) {
  if (saver) saver.mark(rel, () => text);
}

export function saveBinary(rel, blob) {
  if (!saver) return;
  /* The blob is in hand — the map and asset list learn about it now, not
     after the debounced write lands, so a just-dropped map renders at once. */
  invalidateAsset(rel);
  state.assetUrls.set(rel, URL.createObjectURL(blob));
  if (!state.assets.includes(rel)) state.assets.push(rel);
  saver.mark(rel, () => blob);
}

/* The audio prefs are a property of this machine and the television it is
   plugged into — not session state, not in the undo stack. */
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

/* field.map and field.audio hold campaign-relative paths (that is what
   session.json persists); the payload the television gets needs them as
   relay URLs. Copies, never mutation — the audio layers are shared with the
   live session object. */
function resolveBoardAssets(board, resolve) {
  if (board.map) board.map = { ...board.map, src: board.map.src ? resolve(board.map.src) : board.map.src };
  if (board.audio) {
    const layer = l => l ? { ...l, src: resolve(l.src) } : l;
    board.audio = { ...board.audio, music: layer(board.audio.music), ambience: layer(board.audio.ambience) };
  }
  return board;
}

async function pushBoardNow() {
  /* First build collects which paths the board actually references (hidden
     npcs are already filtered out by buildBoard itself, so nothing secret is
     ever uploaded); anything the relay does not hold yet gets uploaded, then
     the board is rebuilt fully resolved. */
  const wanted = new Set();
  const collect = p => { if (p) wanted.add(p); return p ? (relayUrls.get(p) ?? null) : p; };
  resolveBoardAssets(buildBoard(state.session, audioPrefs, collect), collect);

  const missing = [...wanted].filter(rel => !relayUrls.has(rel));
  await Promise.all(missing.map(rel => ensureRelayUrl(rel).catch(() => { /* file gone — travels null */ })));

  const resolve = p => p ? (relayUrls.get(p) ?? null) : p;
  const board = resolveBoardAssets(buildBoard(state.session, audioPrefs, resolve), resolve);
  const reply = await postBoard(state.room, board);

  /* The relay answers with referenced hashes it does not hold — it restarted,
     or evicted them — so the next push self-heals without anyone noticing. */
  const gone = (reply.missing || []).filter(h => hashToRel.has(h));
  if (gone.length) {
    await Promise.all(gone.map(async h => {
      const rel = hashToRel.get(h);
      relayUrls.delete(rel); hashToRel.delete(h);
      await ensureRelayUrl(rel);
    }));
    await postBoard(state.room, board);
  }
}

let pushing = false, pushAgain = false;

/** Every place that used to call pushBoard() straight after changing
    something calls this instead: the one gate `field.paused` has to pass
    through to reach the television. Pushes serialise — a burst of commits
    collapses into "one in flight, one queued". */
export function syncBoard() {
  if (state.session.field.paused || !state.root || !state.room) return;
  if (pushing) { pushAgain = true; return; }
  pushing = true;
  pushBoardNow()
    .catch(() => { /* server gone — the flash on save already covers it */ })
    .finally(() => {
      pushing = false;
      if (pushAgain) { pushAgain = false; syncBoard(); }
    });
}

function afterSessionMutation() {
  saveSession();
  syncBoard();
}

/** For the few mutations that are deliberately NOT undo steps but still have
    to persist and reach the TV: token drags, pause/unpause, field resize. */
export function updateSession(fn) {
  fn(state);
  afterSessionMutation();
  listener();
}

/* ----------------------------------------------------------------- flash */

let flashTimer = null;
export function flash(msg) {
  state.flash = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { state.flash = null; listener(); }, 4000);
  listener();
}

/* ------------------------------------------------------------- aspectOf
   A picture's own width-over-height, decoded once and cached by src. Unknown
   or still loading reads as `fallback` rather than blocking: whatever asked
   gets an answer now and a re-render once the image actually decodes. */

const aspectCache = {};
export function aspectOf(src, fallback) {
  if (!src) return fallback;
  if (src in aspectCache) return aspectCache[src] || fallback;
  aspectCache[src] = 0;
  const img = new Image();
  img.onload = () => { aspectCache[src] = img.naturalWidth / img.naturalHeight; touch(); };
  img.onerror = () => { aspectCache[src] = fallback; };
  img.src = src;
  return fallback;
}
