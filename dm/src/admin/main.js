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
import './objetos.js';
import './escenas.js';
import './historia.js';
import './juego.js';
import { state, subscribe, update, flash, attachSaver, detachSaver, saveSession,
         syncBoard, refreshAssetUrls, sessionPath } from './store.js';
import { ping, fetchTree, connectSSE, checkExternalChanges } from './api.js';
import { pickCampaignFolder, hasPermission, verifyPermission, saveHandle,
         loadHandle, isEmptyDir, createCampaignSubdirs, readRoomCode,
         listRuns, saveRun, loadRun } from './fs.js';
import { normalise } from '../rules/character.js';
import { normaliseSession, blankSession, normalisePlay } from '../shared/session.js';
import { normaliseBeast } from '../shared/beasts.js';
import { normaliseObject } from '../shared/objects.js';
import { normaliseScene } from '../shared/scenes.js';
import { noteFrom } from '../shared/story.js';
import { PREP_SLUG, FLAT_RUN, PREP_RUN, runFrom } from '../shared/runs.js';
import { seatAll, applyMove } from '../shared/combat.js';
import { pcMaxHP, clearStatCache } from '../shared/handles.js';

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

const parseObjects = files => files
  .map(f => {
    const raw = readJSON(f.text);
    return raw ? normaliseObject({ ...raw, file: f.path }) : null;
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
  /* state.run is set before the first read (adopt below), so the tree knows
     which mesa's session and party to pick up — and preparation-only mode
     (`path: null`) finds neither, on purpose. */
  const tree = await fetchTree(root, state.run.path);
  const { party, playerFiles } = parseParty(tree.players);
  const bestiary = parseBeasts(tree.monsters);
  const objects = parseObjects(tree.objects);

  let session;
  if (keepSession) {
    session = state.session;
    session.party = party;
    session.bestiary = bestiary;
    /* The catalog lands before the clamp below — a held +2 PG object is part
       of the maximum the clamp compares against. */
    session.objects = objects;
    for (const c of party) if (!session.play[c.id]) session.play[c.id] = normalisePlay(null);
    for (const c of party) {
      /* A re-imported sheet must never cost the party its wounds — but a
         lowered max must clamp what is left. */
      const p = session.play[c.id];
      const max = pcMaxHP(session, c);
      if (p.hp != null) p.hp = Math.min(p.hp, max);
    }
    session.playerFiles = playerFiles;
  } else {
    const raw = readJSON(tree.session || 'null');
    /* No session.json = a fresh table, and a fresh table starts with nothing
       live — only a *stored* session with no opinion gets the old-save
       defaults of live/grid true. */
    const base = raw && typeof raw === 'object' ? raw : { field: { live: false, grid: false } };
    session = normaliseSession({ ...base, party, bestiary, objects,
                                 playerFiles: { ...base.playerFiles, ...playerFiles } });
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
    /* Land in the fight if there is one, on the party if there is not — and
       in preparation-only mode neither tab exists, so land in the scenes. */
    if (!keepSession) {
      s.ui.tab = s.run.prep ? 'escenas' : session.encounter.on ? 'juego' : 'jugadores';
    }
  });
  await refreshAssetUrls(root, tree.assets, changedAssets);
}

/* The channel is per-room now, and the room comes from the campaign folder —
   so the SSE connection lives from adopt() to leaveCampaign(), not from
   boot. One at a time: switching campaigns swaps the whole connection. */
let sse = null;

function wireSSE(room) {
  if (sse) sse.close();
  sse = connectSSE(room, {
    /* hello fires on every (re)connect. The relay keeps boards in RAM, so a
       restarted server (a deploy) greets us empty-handed — and any TV that
       loads before the next play mutation would wait forever. Re-push here:
       it also heals pushes lost while this tab was offline, and the initial
       double-push with adopt() collapses in syncBoard's queue. */
    hello: d => { update(s => { s.admins = d.admins; }); syncBoard(); },
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

function unwireSSE() {
  if (sse) sse.close();
  sse = null;
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
    /* The scan covers the whole campaign, other mesas included — only this
       run's session is the one memory refuses to give up. */
    const mine = sessionPath();
    if (mine && touched.includes(mine)) {
      update(s => { s.ui.sessionConflict = true; });
      flash(mine + ' cambió en disco; se ignora mientras la mesa está abierta.');
    }
    if (touched.some(p => p !== mine)) {
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

async function adopt(handle, run) {
  update(s => { s.run = run; });
  /* Preparation has no table: no room, no channel, no session file. */
  const room = run.prep ? null : await readRoomCode(handle, run.path);
  await loadCampaign(handle);
  /* Only now — App() shows the picker while pendingRoot stands, and dropping
     it before the folder is read would flash the gate in between. */
  update(s => { s.pendingRoot = null; s.runs = []; });
  state.room = room;
  rememberedHandle = handle;
  state.rememberedName = handle.name;
  if (room) wireSSE(room); else unwireSSE();
  attachSaver(handle);
  saveSession();                   // a fresh table gets its session.json immediately
  syncBoard();
  startPolling();
  try { await saveRun(run.slug); } catch { /* private mode — just not remembered */ }
}

/** Between the grant and the table: which mesa? A campaign with no runs/
    folder has only its implicit one and opens straight away; otherwise the
    remembered mesa is taken if it is still on disk, and the picker shows
    when it is not. */
async function enterCampaign(handle, remembered = null) {
  const runs = await listRuns(handle);
  if (!runs.length) return adopt(handle, FLAT_RUN);
  if (remembered === PREP_SLUG) return adopt(handle, PREP_RUN);
  const hit = remembered ? runs.find(r => r.slug === remembered) : null;
  if (hit) return adopt(handle, runFrom(hit));
  rememberedHandle = handle;
  update(s => { s.pendingRoot = handle; s.runs = runs; s.rememberedName = handle.name; });
}

/** The mesa picker's buttons. `run` is a listRuns() entry, or PREP_RUN. */
export async function chooseRun(run) {
  const handle = state.pendingRoot;
  if (!handle) return;
  try {
    await adopt(handle, run.prep ? PREP_RUN : runFrom(run));
  } catch (e) {
    flash('No se pudo abrir la partida: ' + e.message);
  }
}

/** Back to the mesa picker without giving up the folder grant. */
export function switchRun() {
  const handle = state.root;
  if (!handle) return;
  closeTable();
  update(s => { s.pendingRoot = handle; });
  listRuns(handle).then(runs => update(s => { s.runs = runs; }))
    .catch(() => flash('No se pudieron leer las partidas de la carpeta.'));
}

/** The gate's "Abrir carpeta…" — must run inside the click, the picker is
    gesture-gated. A folder with nothing in it becomes a campaign on the
    spot (the 6 subdirs are seeded); anything else opens as it is, missing
    categories simply reading as empty. */
export async function openFolder() {
  let handle;
  try { handle = await pickCampaignFolder(); } catch { return; /* cancelled */ }
  try {
    if (await isEmptyDir(handle)) await createCampaignSubdirs(handle);
    await enterCampaign(handle);
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
    await enterCampaign(handle, await loadRun().catch(() => null));
  } catch (e) {
    flash('No se pudo reabrir la carpeta: ' + e.message);
  }
}

/** Everything the open table owns, torn down — shared by leaving the
    campaign and by switching mesa within it. */
function closeTable() {
  stopPolling();
  detachSaver();
  unwireSSE();
  update(s => {
    s.root = null;
    s.rootName = null;
    s.room = null;
    s.run = { ...FLAT_RUN };
    s.session = blankSession();
    s.scenes = []; s.assets = []; s.story = { notes: [] };
  });
}

export function leaveCampaign() {
  closeTable();
  update(s => { s.pendingRoot = null; s.runs = []; });
}

/* ----------------------------------------------------------------- boot */

async function boot() {
  const mount = document.getElementById('app');
  subscribe(() => render(h(App, null), mount));

  /* The LAN address is decoration on the connect modal — a dead server must
     not keep the gate from opening a folder. The SSE channel is wired in
     adopt(): it needs the room, and the room needs the folder. */
  ping().then(info => update(s => { s.lanUrl = info.lanUrl; })).catch(() => {});

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
        let lastRun = null;
        try { lastRun = await loadRun(); } catch { /* first run */ }
        try {
          /* Straight back to the mesa this device was at; the picker only
             appears when that folder no longer has it. */
          await enterCampaign(remembered, lastRun);
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
