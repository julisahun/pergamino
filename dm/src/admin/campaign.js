/* Opening, reading and letting go of a campaign — and the poll that notices
   what happened to it while nobody was looking.

   The way in has three doors and they are taken in order: a folder grant, a
   mesa, then the table. Each one is a thing the DM did, never something the
   app decided: the picker only ever runs inside a click, and boot re-opens the
   last folder only when the browser still holds the grant.

   Notes are edited in a text editor now, not in the app, which makes the 5s
   poll load-bearing rather than a nicety: it is how what you type in Obsidian
   reaches the table. */

/** @import { Run } from '../shared/types.js' */
import { state, update, flash, attachSaver, detachSaver, refreshAssetUrls,
         flushSaves, sessionPath, saveSession } from './store.js';
import { readTree, listRuns, pickCampaignFolder, hasPermission, verifyPermission,
         saveHandle, loadHandle, saveRunSlug, loadRunSlug, isEmptyDir,
         createCampaignSubdirs, createRun } from './fs.js';
import { seedBaseline, checkExternalChanges } from './disk.js';
import { FLAT_RUN, PREP_RUN, PREP_SLUG, runFrom, classify } from '../shared/runs.js';
import { normaliseSession, blankSession, normalisePlay } from '../shared/session.js';
import { pushState } from './broadcast.js';
import { firstTab } from './app.js';
import { shadowById, shadowByPath } from '../shared/runs.js';
import { normalise } from '../rules/character.js';
import { normaliseBeast } from '../shared/beasts.js';
import { normaliseObject } from '../shared/objects.js';
import { clearStatCache, pcMaxHP } from '../shared/handles.js';
import { normaliseScene } from '../shared/scenes.js';
import { noteFrom } from '../shared/story.js';

const readJSON = (/** @type {string|null} */ text) => {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
};

/** players/*.json → the party. The creator's export envelope or a bare
    character, which is the same tolerance the creator's own import has: a file
    a player sent by any route opens.
    @param {import('./fs.js').FileEntry[]} files */
function parseParty(files) {
  /** @type {import('../shared/types.js').Character[]} */
  const party = [];
  /** @type {Record<string, string>} */
  const playerFiles = {};
  for (const f of files) {
    const raw = readJSON(f.text);
    if (!raw) continue;
    const c = normalise(raw.character || raw);
    party.push(c);
    playerFiles[c.id] = f.path;
  }
  return { party, playerFiles };
}

/** The two layers of one entity folder, resolved into what this table sees: a
    run-local file wins over the campaign's by id, and says what it displaced.
    @template T
    @param {import('./fs.js').FileEntry[]} files
    @param {(raw: any) => T} parse */
function parseLayered(files, parse) {
  /** @type {any[]} */
  const campaign = [];
  /** @type {any[]} */
  const run = [];
  for (const f of files) {
    const raw = readJSON(f.text);
    if (!raw) continue;
    const entity = parse({ ...raw, file: f.path });
    (f.layer === 'run' ? run : campaign).push(entity);
  }
  return /** @type {any[]} */ (shadowById(campaign, run));
}

/* ------------------------------------------------------------- reading */

/** The whole boot-from-disk read, and the re-read the poll triggers.
    @param {FileSystemDirectoryHandle} root
    @param {{changedAssets?: string[], keepSession?: boolean}} [opts] */
export async function loadCampaign(root, opts = {}) {
  const changedAssets = opts.changedAssets ?? [];
  /* state.run is set before the read (adopt() below), because which mesa is
     open decides which files are even visible. */
  const { tree, mtimes } = await readTree(root, state.run.path);
  seedBaseline(mtimes);

  /* The entities live in their own files and are injected here; the session
     file holds only what happened to them. A mesa with no session.json is
     simply a table nobody has sat at yet. */
  const { party, playerFiles } = parseParty(tree.players);
  const bestiary = parseLayered(tree.monsters, normaliseBeast);
  const objects = parseLayered(tree.objects, normaliseObject);

  let session;
  if (opts.keepSession) {
    /* A re-read while the table is open: the sheets and the prep are adopted,
       what happened tonight is not. */
    session = state.session;
    session.party = party;
    session.playerFiles = playerFiles;
    session.bestiary = bestiary;
    session.objects = objects;
    for (const c of party) {
      if (!session.play[c.id]) session.play[c.id] = normalisePlay(null);
      /* A re-imported sheet must never cost the party its wounds — but a
         maximum that dropped has to clamp what is left of them. */
      const p = session.play[c.id];
      if (p.hp != null) p.hp = Math.min(p.hp, pcMaxHP(session, c));
    }
  } else {
    session = normaliseSession({ ...(readJSON(tree.session) || {}),
                                 party, playerFiles, bestiary, objects });
  }
  clearStatCache();

  update(s => {
    s.root = root;
    s.rootName = root.name;
    s.tree = tree;
    s.session = session;
    s.scenes = parseLayered(tree.scenarios, normaliseScene);
    /* Notes keep their file's own path and layer: a mesa's `estado.md` and the
       campaign's lore sit in one index, grouped apart. */
    s.story = tree.story.map(f => noteFrom(f.path, f.text, state.run.path || ''));
  });
  /* An asset the mesa has its own copy of shadows the campaign's, by path
     below assets/ — so `urlFor('assets/maps/cala.jpg')` loads this table's
     version wherever one exists. */
  const assets = shadowByPath(
    tree.assets.filter(a => a.layer === 'campaign').map(a => a.path),
    tree.assets.filter(a => a.layer === 'run').map(a => a.path),
    state.run.path || '');
  update(s => {
    s.assetAliases = new Map(assets.map(a => [a.rel, a.path]));
    s.assetPaths = assets.map(a => a.rel);
  });
  await refreshAssetUrls(root, assets.map(a => a.path), changedAssets);
  pushState();
}

/* ------------------------------------------------- opening and closing */

/** @type {FileSystemDirectoryHandle|null} */
let rememberedHandle = null;

/** @param {FileSystemDirectoryHandle} handle @param {Run} run */
async function adopt(handle, run) {
  update(s => {
    s.run = run;
    /* Boot is the one place other than a tab click that writes this, and it
       writes it once, before anything is on screen. */
    s.ui.tab = firstTab(run);
  });
  await loadCampaign(handle);
  /* Only now: the picker stays up while pendingRoot stands, and dropping it
     before the folder is read would flash the gate in between. */
  update(s => { s.pendingRoot = null; });
  rememberedHandle = handle;
  state.rememberedName = handle.name;
  attachSaver(handle);
  saveSession();               // a fresh table gets its file immediately
  pushState();
  startPolling();
  try { await saveRunSlug(run.slug); } catch { /* private mode — just not remembered */ }
}

/** Between the grant and the table: which mesa? A campaign with no runs/ has
    only its implicit one and opens straight away; otherwise the mesa this
    device sat at last is taken if it is still there, and the picker shows when
    it is not. @param {FileSystemDirectoryHandle} handle */
async function enterCampaign(handle, remembered = /** @type {string|null} */ (null)) {
  const runs = await listRuns(handle);
  if (!runs.length) return adopt(handle, { ...FLAT_RUN });
  if (remembered === PREP_SLUG) return adopt(handle, { ...PREP_RUN });
  const hit = remembered ? runs.find(r => r.slug === remembered) : null;
  if (hit) {
    update(s => { s.runs = runs; });
    return adopt(handle, runFrom(hit));
  }
  rememberedHandle = handle;
  update(s => {
    s.pendingRoot = handle;
    s.runs = runs;
    s.rememberedName = handle.name;
  });
}

/** The mesa picker's buttons. @param {Run} run */
export async function chooseRun(run) {
  const handle = state.pendingRoot;
  if (!handle) return;
  try {
    await adopt(handle, run);
  } catch (e) {
    flash('No se pudo abrir la mesa: ' + (e instanceof Error ? e.message : e));
  }
}

/** A new mesa, made from the picker: the folder, the players/ inside it, and
    the two notes a table writes in. The campaign it belongs to gains its second
    layer at that moment — which is also the moment the app starts asking where
    a save goes.
    @param {string} slug @param {string} label */
export async function newRun(slug, label) {
  const handle = state.pendingRoot || state.root;
  if (!handle) return;
  try {
    const run = await createRun(handle, slug, label);
    const runs = await listRuns(handle);
    update(s => { s.runs = runs; s.pendingRoot = handle; });
    flash(`Mesa ${run.label} creada en ${run.path}.`);
    await adopt(handle, { slug: run.slug, path: run.path, label: run.label, prep: false });
  } catch (e) {
    flash('No se pudo crear la mesa: ' + (e instanceof Error ? e.message : e));
  }
}

/** Back to the mesa picker without giving up the folder grant. */
export function switchRun() {
  const handle = state.root;
  if (!handle) return;
  closeTable();
  update(s => { s.pendingRoot = handle; });
  listRuns(handle)
    .then(runs => update(s => { s.runs = runs; }))
    .catch(() => flash('No se pudieron leer las mesas de la carpeta.'));
}

/** The gate's «Abrir carpeta…» — must run inside the click, the picker is
    gesture-gated. An empty folder becomes a campaign on the spot; anything
    else opens as it is, missing categories simply reading as empty. */
export async function openFolder() {
  let handle;
  try { handle = await pickCampaignFolder(); } catch { return; /* cancelled */ }
  try {
    if (await isEmptyDir(handle)) await createCampaignSubdirs(handle);
    await enterCampaign(handle);
  } catch (e) {
    flash('No se pudo abrir la carpeta: ' + (e instanceof Error ? e.message : e));
    return;
  }
  try { await saveHandle(handle); } catch { /* private mode — just not remembered */ }
}

/** The gate's «Reabrir …» — the remembered handle needs its grant confirmed,
    which may prompt, so this too only runs from a click. */
export async function reopenLast() {
  const handle = rememberedHandle;
  if (!handle) return;
  try {
    if (!(await verifyPermission(handle))) {
      flash('El navegador no ha dado permiso sobre esa carpeta.');
      return;
    }
    await enterCampaign(handle, await loadRunSlug().catch(() => null));
  } catch (e) {
    flash('No se pudo reabrir la carpeta: ' + (e instanceof Error ? e.message : e));
  }
}

/** Everything the open table owns, torn down — shared by leaving the campaign
    and by switching mesa within it. Pending writes go to disk first: nothing
    the DM typed is lost to a click on the folder's name. */
function closeTable() {
  stopPolling();
  flushSaves();
  detachSaver();
  update(s => {
    s.root = null;
    s.rootName = null;
    s.run = { ...FLAT_RUN };
    s.tree = null;
    s.session = blankSession();
    s.scenes = []; s.story = []; s.assetPaths = [];
    for (const url of s.assetUrls.values()) URL.revokeObjectURL(url);
    s.assetUrls.clear();
  });
}

export function leaveCampaign() {
  closeTable();
  update(s => { s.pendingRoot = null; s.runs = []; });
}

/* -------------------------------------------------------- external edits
   The browser cannot be told about its own disk, so it looks: every 5s (never
   while the tab is hidden), scan mtimes and re-read whatever moved. Our own
   writes are excluded by the mtime they landed with (disk.js). */

const POLL_MS = 5000;
/** @type {ReturnType<typeof setInterval>|undefined} */
let pollTimer;
let pollBusy = false;

export async function pollChanges() {
  if (!state.root || document.hidden || pollBusy) return;
  pollBusy = true;
  try {
    const { changed, removed } = await checkExternalChanges(state.root);
    const touched = [...changed, ...removed];
    if (!touched.length) return;
    /* The scan covers the whole folder, other mesas included; only what THIS
       mesa can see is worth a re-read. */
    const mine = touched.filter(p => classify(p, state.run.path));
    if (!mine.length) return;
    const ours = sessionPath();
    if (ours && mine.includes(ours)) {
      update(s => { s.ui.sessionConflict = true; });
      flash(`${ours} cambió en disco; se ignora mientras la mesa está abierta.`);
    }
    if (!mine.some(p => p !== ours)) return;
    const changedAssets = mine.filter(p => classify(p, state.run.path)?.bucket === 'assets');
    /* Memory wins over disk for session.json while a table is open: the DM's
       own window is the authority on what is happening right now. */
    await loadCampaign(state.root, { changedAssets, keepSession: true });
    flash(mine.length === 1
      ? `${mine[0]} cambió fuera de la app; releído.`
      : `${mine.length} archivos cambiaron fuera de la app; releídos.`);
  } catch {
    /* A scan raced a save, or the grant went away mid-session — the next tick
       tells the difference, and a one-off never deserves a flash. */
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
  pollTimer = undefined;
}

/* ----------------------------------------------------------------- boot */

export async function boot() {
  if (!('showDirectoryPicker' in window)) return;
  let remembered = null;
  try { remembered = await loadHandle(); } catch { /* first run */ }
  if (!remembered) return;
  rememberedHandle = remembered;
  state.rememberedName = remembered.name;
  /* queryPermission only: a prompt outside a user gesture is refused by the
     browser anyway. Still granted means the last folder reopens by itself;
     anything else leaves the gate showing «Reabrir». */
  if (!(await hasPermission(remembered))) return;
  let lastRun = null;
  try { lastRun = await loadRunSlug(); } catch { /* first run */ }
  try {
    await enterCampaign(remembered, lastRun);
  } catch { /* folder moved or gone — the gate stays up */ }
}
