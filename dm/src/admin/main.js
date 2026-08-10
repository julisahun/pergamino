/* Boot: remember the campaign folder, reopen it silently when the browser
   still holds the grant, wire the SSE channel, and mount the app. The folder
   is read and written directly through the File System Access API (fs.js) —
   no server touches campaign files — and a light poll replaces the old
   server-side watcher for edits made outside the app. */

import { render, h } from './html.js';
import { App } from './app.js';
/* Tab modules register themselves into app.js's `screens` on import. */
import './jugadores.js';
import './pnj.js';
import './escenas.js';
import './historia.js';
import './juego.js';
import { state, subscribe, update, flash, attachSaver, detachSaver, saveSession,
         syncBoard, refreshAssetUrls } from './store.js';
import { ping, fetchTree, connectSSE, checkExternalChanges } from './api.js';
import { pickCampaignFolder, hasPermission, verifyPermission,
         saveHandle, loadHandle, isEmptyDir, createCampaignSubdirs } from './fs.js';
import { normalise } from '../rules/character.js';
import { normaliseSession, blankSession, normalisePlay } from '../shared/session.js';
import { normaliseBeast } from '../shared/beasts.js';
import { normaliseScene } from '../shared/scenes.js';
import { noteFrom } from '../shared/story.js';
import { seatAll, applyMove } from '../shared/combat.js';
import { stats, clearStatCache } from '../shared/handles.js';

const readJSON = text => { try { return JSON.parse(text); } catch { return null; } };

/** players/*.json → party members. The envelope or a bare character, the
    same tolerance the creator's own import has. */
function parseParty(files) {
  const party = [], playerFiles = {};
  for (const f of files) {
    const raw = readJSON(f.text);
    if (!raw) continue;
    const c = normalise(raw.character || raw);
    party.push(c);
    playerFiles[c.id] = f.path;
  }
  return { party, playerFiles };
}

const parseBeasts = files => files
  .map(f => {
    const raw = readJSON(f.text);
    return raw ? normaliseBeast({ ...raw, file: f.path }) : null;
  })
  .filter(Boolean);

const parseScenes = files => files
  .map(f => {
    const raw = readJSON(f.text);
    if (!raw) return null;
    const s = normaliseScene(raw);
    s.file = f.path;
    return s;
  })
  .filter(Boolean);

const parseStory = files => ({ notes: files.map(f => noteFrom(f.path, f.text)) });

/* field.map/field.audio hold campaign-relative paths now; a session saved by
   the served-files era holds fully-resolved '/campaigns/<name>/…' URLs (each
   segment percent-encoded), and one saved mid-crash could hold a blob: URL.
   Both read back as plain paths — or as nothing, when nothing survives. */
function rawAssetPath(src) {
  if (typeof src !== 'string' || !src) return null;
  const m = src.match(/^\/campaigns\/[^/]+\/(.+)$/);
  if (m) {
    try { return m[1].split('/').map(decodeURIComponent).join('/'); } catch { return m[1]; }
  }
  return src.startsWith('blob:') || src.startsWith('/api/asset/') ? null : src;
}

function migrateFieldAssets(f) {
  if (f.map?.src) {
    f.map.src = rawAssetPath(f.map.src);
    if (!f.map.src && !f.map.stamp) f.map = null;
  }
  if (f.audio) {
    for (const k of ['music', 'ambience']) {
      const l = f.audio[k];
      if (l) { l.src = rawAssetPath(l.src); if (!l.src) f.audio[k] = null; }
    }
    if (!f.audio.music && !f.audio.ambience) f.audio = null;
  }
}

/** The whole boot-from-disk read. Also the re-read the poll triggers: under
    autosave, memory and disk agree within half a second, so the disk is
    simply re-adopted — except session.json, where memory wins while a table
    is open (see pollChanges below). */
async function loadCampaign(root, { keepSession = false, changedAssets = [] } = {}) {
  const tree = await fetchTree(root);
  const { party, playerFiles } = parseParty(tree.players);
  const bestiary = parseBeasts(tree.monsters);

  let session;
  if (keepSession) {
    session = state.session;
    session.party = party;
    session.bestiary = bestiary;
    for (const c of party) if (!session.play[c.id]) session.play[c.id] = normalisePlay(null);
    for (const c of party) {
      /* A re-imported sheet must never cost the party its wounds — but a
         lowered max must clamp what is left. */
      const p = session.play[c.id];
      const max = stats(c).hp ?? 0;
      if (p.hp != null) p.hp = Math.min(p.hp, max);
    }
    session.playerFiles = playerFiles;
  } else {
    const raw = readJSON(tree.session || 'null');
    /* No session.json = a fresh table, and a fresh table starts with nothing
       live — only a *stored* session with no opinion gets the old-save
       defaults of live/grid true. */
    const base = raw && typeof raw === 'object' ? raw : { field: { live: false, grid: false } };
    session = normaliseSession({ ...base, party, bestiary, playerFiles: { ...base.playerFiles, ...playerFiles } });
    migrateFieldAssets(session.field);
  }
  clearStatCache();
  seatAll(session);

  update(s => {
    s.root = root;
    s.rootName = root.name;
    s.session = session;
    s.scenes = parseScenes(tree.scenarios);
    s.assets = tree.assets;
    s.story = parseStory(tree.story);
    /* Land in the fight if there is one, on the party if there is not. */
    if (!keepSession) s.ui.tab = session.encounter.on ? 'juego' : 'jugadores';
  });
  await refreshAssetUrls(root, tree.assets, changedAssets);
}

function wireSSE() {
  connectSSE({
    hello: d => update(s => { s.admins = d.admins; }),
    clients: d => update(s => { s.admins = d.admins; }),
    move: d => {
      if (applyMove(state.session, d.ref, d.x, d.y)) {
        saveSession();
        syncBoard();               // other TVs learn the move from us
        update();
      }
    },
  });
}

/* ------------------------------------------------------- external edits
   The old server pushed a `files` event from a 1s mtime watcher; the
   browser cannot be pushed to about its own disk, so it looks for itself:
   every 5s (never while hidden), scan mtimes, and re-adopt whatever moved.
   session.json is the one exception — while a table is open, memory wins. */

const POLL_MS = 5000;
let pollTimer = null;
let pollBusy = false;

async function pollChanges() {
  if (!state.root || document.hidden || pollBusy) return;
  pollBusy = true;
  try {
    const diff = await checkExternalChanges(state.root);
    const touched = [...diff.changed, ...diff.removed];
    if (!touched.length) return;
    if (touched.includes('session.json')) {
      update(s => { s.ui.sessionConflict = true; });
      flash('session.json cambió en disco; se ignora mientras la mesa está abierta.');
    }
    if (touched.some(p => p !== 'session.json')) {
      const changedAssets = touched.filter(p => p.startsWith('assets/'));
      await loadCampaign(state.root, { keepSession: true, changedAssets });
      syncBoard();
    }
  } catch (e) {
    /* A scan raced a save, or the grant was revoked mid-session — the next
       tick tells the difference; a one-off never deserves a flash. */
  } finally {
    pollBusy = false;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollChanges, POLL_MS);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

/* ------------------------------------------------------- opening folders */

let rememberedHandle = null;

async function adopt(handle) {
  await loadCampaign(handle);
  rememberedHandle = handle;
  state.rememberedName = handle.name;
  attachSaver(handle);
  saveSession();                   // a fresh table gets its session.json immediately
  syncBoard();
  startPolling();
}

/** The gate's "Abrir carpeta…" — must run inside the click, the picker is
    gesture-gated. A folder with nothing in it becomes a campaign on the
    spot (the 5 subdirs are seeded); anything else opens as it is, missing
    categories simply reading as empty. */
export async function openFolder() {
  let handle;
  try { handle = await pickCampaignFolder(); } catch { return; /* cancelled */ }
  try {
    if (await isEmptyDir(handle)) await createCampaignSubdirs(handle);
    await adopt(handle);
  } catch (e) {
    flash('No se pudo abrir la carpeta: ' + e.message);
    return;
  }
  try { await saveHandle(handle); } catch { /* private mode — just not remembered */ }
}

/** The gate's "Reabrir <last>" — the remembered handle needs its grant
    confirmed, which may prompt, so this too only runs from a click. */
export async function reopenLast() {
  const handle = rememberedHandle;
  if (!handle) return;
  try {
    if (!(await verifyPermission(handle))) {
      flash('El navegador no ha dado permiso sobre esa carpeta.');
      return;
    }
    await adopt(handle);
  } catch (e) {
    flash('No se pudo reabrir la carpeta: ' + e.message);
  }
}

export function leaveCampaign() {
  stopPolling();
  detachSaver();
  update(s => {
    s.root = null;
    s.rootName = null;
    s.session = blankSession();
    s.scenes = []; s.assets = []; s.story = { notes: [] };
  });
}

/* ----------------------------------------------------------------- boot */

async function boot() {
  const mount = document.getElementById('app');
  subscribe(() => render(h(App, null), mount));

  /* The LAN address is decoration on the connect modal — a dead server must
     not keep the gate from opening a folder. */
  ping().then(info => update(s => { s.lanUrl = info.lanUrl; })).catch(() => {});
  wireSSE();

  if ('showDirectoryPicker' in window) {
    let remembered = null;
    try { remembered = await loadHandle(); } catch { /* first run */ }
    if (remembered) {
      rememberedHandle = remembered;
      state.rememberedName = remembered.name;
      /* queryPermission only — a prompt outside a user gesture is refused by
         the browser anyway. Granted means the last folder reopens by itself;
         anything else leaves the gate showing Reabrir. */
      if (await hasPermission(remembered)) {
        try {
          await adopt(remembered);
        } catch { /* folder moved or gone — the gate stays up */ }
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollChanges();
  });

  update(s => { s.booted = true; });
}

boot();
