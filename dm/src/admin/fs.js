/* Storage: the File System Access API against the campaign folder the DM
   picked. The browser itself holds the readwrite grant; no server ever reads
   or writes a campaign file, and there is no endpoint that could.

   Everything here speaks campaign-relative paths ("monsters/vann.json",
   "runs/guils/session.json") — the same strings runs.js does arithmetic on,
   the writer writes, the trash records and the poll compares mtimes for. One
   vocabulary, end to end.

   Chromium-only, and it needs a secure context (https, or localhost). */

/** @import { Layer, Run } from '../shared/types.js' */
import { RUNS_DIR, classify, runLabel, mesaName } from '../shared/runs.js';
import { writeFile } from '../shared/files.js';

/** The folders a brand-new campaign gets. `runs/` is deliberately NOT among
    them: a campaign starts flat, with one implicit table, and grows a second
    layer only when the DM makes a second mesa. */
const SUBDIRS = ['scenarios', 'assets', 'players', 'monsters', 'objects', 'story'];

/* -------------------------------------------------- the remembered handle
   idb-keyval would be a vendored file for two keys; a bare get/put over one
   object store is all this needs. */

const DB_NAME = 'dnd-dm';
const KV_STORE = 'kv';
const ROOT_KEY = 'campaign-root';
const RUN_KEY = 'campaign-run';

function openDB() {
  return new Promise((/** @type {(db: IDBDatabase) => void} */ resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(KV_STORE);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

/** @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest} op */
function kv(mode, op) {
  return openDB().then(db => new Promise((/** @type {(v: any) => void} */ resolve, reject) => {
    const rq = op(db.transaction(KV_STORE, mode).objectStore(KV_STORE));
    rq.onsuccess = () => { resolve(rq.result); db.close(); };
    rq.onerror = () => { reject(rq.error); db.close(); };
  }));
}

export const saveHandle = (/** @type {FileSystemDirectoryHandle} */ h) =>
  kv('readwrite', s => s.put(h, ROOT_KEY));
export const loadHandle = () =>
  kv('readonly', s => s.get(ROOT_KEY)).then(h => /** @type {FileSystemDirectoryHandle|null} */ (h ?? null));
export const clearHandle = () => kv('readwrite', s => s.delete(ROOT_KEY));

/** Which mesa this device sat at last, so reopening the remembered folder does
    not ask again: a slug, `''` for a flat campaign, `'#prep'` for preparation. */
export const saveRunSlug = (/** @type {string} */ slug) =>
  kv('readwrite', s => s.put(String(slug ?? ''), RUN_KEY));
export const loadRunSlug = () =>
  kv('readonly', s => s.get(RUN_KEY)).then(v => /** @type {string|null} */ (v ?? null));

/* ------------------------------------------------------------ permission */

export const pickCampaignFolder = () =>
  window.showDirectoryPicker({ mode: 'readwrite', id: 'dnd-dm-campaign' });

/** Existing permission WITHOUT prompting — safe on page load, outside any user
    gesture, to decide whether the remembered folder reopens by itself.
    @param {FileSystemDirectoryHandle} handle */
export async function hasPermission(handle) {
  /* OPFS handles (what the probes run against) have no permission model at
     all: nothing to ask, nothing to grant. */
  if (!handle.queryPermission) return true;
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
}

/** Ensure readwrite permission, prompting if needed — only ever call this from
    inside a real user gesture. @param {FileSystemDirectoryHandle} handle */
export async function verifyPermission(handle) {
  if (await hasPermission(handle)) return true;
  if (!handle.requestPermission) return true;      // OPFS again: nothing to ask
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/* --------------------------------------------------------------- walking */

/* Dotfiles are invisible (so a `.obsidian/` or a `.DS_Store` is never an
   entity), and so are Chromium's in-flight `.crswap` write buffers: every
   createWritable() stages into a sibling one, and a walker that saw them would
   read every autosave as an edit made outside the app. */
const skip = (/** @type {string} */ name) => name.startsWith('.') || name.endsWith('.crswap');

/**
 * Every visible file under `dir`, as campaign-relative paths. `trash/` is
 * skipped: deleted things are kept, not shown.
 * @param {FileSystemDirectoryHandle} dir @param {string} prefix
 * @param {{path: string, handle: FileSystemFileHandle}[]} out
 */
async function collectFiles(dir, prefix, out) {
  for await (const handle of dir.values()) {
    if (skip(handle.name)) continue;
    const path = prefix ? `${prefix}/${handle.name}` : handle.name;
    if (handle.kind === 'directory') {
      if (path !== 'trash') await collectFiles(handle, path, out);
    } else {
      out.push({ path, handle });
    }
  }
  return out;
}

/** {relpath: lastModified} for the whole campaign — what the external-edit poll
    compares between ticks. @param {FileSystemDirectoryHandle} root */
export async function scanMtimes(root) {
  const files = await collectFiles(root, '', []);
  /** @type {Map<string, number>} */
  const out = new Map();
  await Promise.all(files.map(async f => {
    try { out.set(f.path, (await f.handle.getFile()).lastModified); } catch { /* raced a delete */ }
  }));
  return out;
}

/* ------------------------------------------------------------- the tree */

/** One file the app reads, and which layer it came from.
    @typedef {{ path: string, text: string, layer: Layer, shadows?: string|null }} FileEntry */

/** @typedef {{ path: string, layer: Layer }} AssetEntry */

/**
 * @typedef {Object} Tree
 * @property {string|null} session
 * @property {FileEntry[]} players
 * @property {FileEntry[]} scenarios
 * @property {FileEntry[]} monsters
 * @property {FileEntry[]} objects
 * @property {FileEntry[]} story
 * @property {AssetEntry[]} assets
 */

const blankTree = () => /** @type {Tree} */ ({
  session: null, players: [], scenarios: [], monsters: [], objects: [], story: [], assets: [],
});

/**
 * The whole boot payload, in one walk. Which bucket and which layer a path
 * lands in is `classify()` in shared/runs.js — the walker collects everything
 * and asks, so there is exactly one answer to "what can the app see".
 *
 * Nothing is resolved here: both layers' entries come back, each stamped with
 * its layer, and shadowing happens once the files are parsed and have ids.
 *
 * @param {FileSystemDirectoryHandle} root
 * @param {string|null} runPath  '' flat · 'runs/<mesa>' · null preparation-only
 * @returns {Promise<{tree: Tree, mtimes: Map<string, number>}>}
 */
export async function readTree(root, runPath = '') {
  const files = (await collectFiles(root, '', [])).sort((a, b) => a.path < b.path ? -1 : 1);
  const tree = blankTree();
  /** @type {Map<string, number>} */
  const mtimes = new Map();
  await Promise.all(files.map(async ({ path, handle }) => {
    let file;
    try { file = await handle.getFile(); } catch { return; }
    mtimes.set(path, file.lastModified);
    const hit = classify(path, runPath);
    if (!hit) return;
    if (hit.bucket === 'session') tree.session = await file.text();
    else if (hit.bucket === 'assets') tree.assets.push({ path, layer: hit.layer });
    else tree[hit.bucket].push({ path, text: await file.text(), layer: hit.layer });
  }));
  for (const k of /** @type {const} */ (['players', 'scenarios', 'monsters', 'objects', 'story'])) {
    tree[k].sort((a, b) => a.path < b.path ? -1 : 1);
  }
  tree.assets.sort((a, b) => a.path < b.path ? -1 : 1);
  return { tree, mtimes };
}

/* ------------------------------------------------------------------ runs */

/** @typedef {{ slug: string, path: string, label: string, players: number, played: boolean }} RunInfo */

/** Every mesa on disk, with just enough to tell them apart in the picker.
    Nothing here creates anything: a run is a folder, and the picker lists what
    is there. @param {FileSystemDirectoryHandle} root @returns {Promise<RunInfo[]>} */
export async function listRuns(root) {
  let dir;
  try { dir = await root.getDirectoryHandle(RUNS_DIR); } catch { return []; }
  /** @type {RunInfo[]} */
  const runs = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'directory' || skip(entry.name)) continue;
    runs.push(await describeRun(/** @type {FileSystemDirectoryHandle} */ (entry)));
  }
  return runs.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/** @param {FileSystemDirectoryHandle} dir @returns {Promise<RunInfo>} */
async function describeRun(dir) {
  const slug = dir.name;
  const run = { slug, path: `${RUNS_DIR}/${slug}`, label: runLabel(slug), players: 0, played: false };
  try {
    const players = await dir.getDirectoryHandle('players');
    for await (const f of players.values()) {
      if (f.kind === 'file' && f.name.endsWith('.json') && !skip(f.name)) run.players++;
    }
  } catch { /* no players/ yet — a mesa with nobody at it is still a mesa */ }
  try {
    await dir.getFileHandle('session.json');
    run.played = true;
  } catch { /* never sat down */ }
  /* `runs/guils/guils.md` carries `mesa: Guils` — the name the DM wrote beats a
     humanised slug whenever it is there. */
  try {
    const note = await (await dir.getFileHandle(`${slug}.md`)).getFile();
    run.label = mesaName(await note.text()) || run.label;
  } catch { /* no note, or no frontmatter — the slug it is */ }
  return run;
}

/* Reading and writing single files lives in shared/files.js: the television
   needs that half too, and it has no business importing the admin's grants.
   Re-exported here so call sites keep one import. */
export { readBlob, readText, writeFile, deleteToTrash } from '../shared/files.js';

/* --------------------------------------------------------- new campaigns */

/** True when the folder has nothing visible in it — the case "Abrir carpeta"
    treats as "start a campaign here". @param {FileSystemDirectoryHandle} root */
export async function isEmptyDir(root) {
  for await (const handle of root.values()) if (!skip(handle.name)) return false;
  return true;
}

/** @param {FileSystemDirectoryHandle} root */
export async function createCampaignSubdirs(root) {
  for (const name of SUBDIRS) await root.getDirectoryHandle(name, { create: true });
}

/* --------------------------------------------------------------- new runs
   A mesa is a folder, and making one is making a folder — plus the two notes
   that give a table somewhere to write. The scaffolds are deliberately almost
   empty: they exist so the DM's text editor has a file to open, not so the app
   can have opinions about what goes in them. */

/** @param {FileSystemDirectoryHandle} root @param {string} slug @param {string} label
    @returns {Promise<{slug: string, path: string, label: string}>} */
export async function createRun(root, slug, label) {
  const clean = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!clean) throw new Error('la mesa necesita un nombre');
  const runs = await root.getDirectoryHandle(RUNS_DIR, { create: true });
  for await (const entry of runs.values()) {
    if (entry.name === clean) throw new Error(`ya hay una mesa llamada ${clean}`);
  }
  const path = `${RUNS_DIR}/${clean}`;
  await (await runs.getDirectoryHandle(clean, { create: true }))
    .getDirectoryHandle('players', { create: true });
  const name = String(label || '').trim() || runLabel(clean);
  /* The frontmatter is the one field the app reads back — it is what the mesa
     picker shows instead of a humanised folder name. */
  await writeFile(root, `${path}/${clean}.md`,
    `---\nmesa: ${name}\n---\n\n# ${name}\n\nQuién juega, cuándo, y lo que haga falta recordar.\n`);
  await writeFile(root, `${path}/estado.md`,
    `# Estado\n\nDónde están y qué está pasando ahora mismo.\n`);
  await writeFile(root, `${path}/bitacora/00-plantilla.md`,
    `# Sesión 0\n\nQué pasó. Una nota por sesión, con el número delante para que se ordenen solas.\n`);
  return { slug: clean, path, label: name };
}
