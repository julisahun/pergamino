/* The storage layer: the File System Access API against the campaign folder
   the DM picked. The browser itself holds a readwrite grant on that folder —
   no server ever reads or writes campaign files. The one remembered
   directory handle persists in IndexedDB (structured-cloneable), and the
   permission is re-checked silently on boot, prompted only from a click.

   Everything here speaks campaign-relative paths ("scenarios/posada.json"),
   the same paths the old HTTP API used, so the rest of the app kept its
   vocabulary. */

const SUBDIRS = ['scenarios', 'assets', 'players', 'monsters', 'objects', 'story'];

/* ------------------------------------------------- the remembered handle
   idb-keyval would be a vendored file for one key — a bare get/set/del over
   one object store is all this needs. */

const DB_NAME = 'dnd-dm';
const KV_STORE = 'kv';
const ROOT_KEY = 'campaign-root';

function openDB() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(KV_STORE);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

function kv(mode, op) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const rq = op(db.transaction(KV_STORE, mode).objectStore(KV_STORE));
    rq.onsuccess = () => { resolve(rq.result); db.close(); };
    rq.onerror = () => { reject(rq.error); db.close(); };
  }));
}

export const saveHandle = handle => kv('readwrite', s => s.put(handle, ROOT_KEY));
export const loadHandle = () => kv('readonly', s => s.get(ROOT_KEY)).then(h => h ?? null);
export const clearHandle = () => kv('readwrite', s => s.delete(ROOT_KEY));

/* ------------------------------------------------------------ permission */

export function pickCampaignFolder() {
  return window.showDirectoryPicker({ mode: 'readwrite', id: 'dnd-dm-campaign' });
}

/** Existing permission WITHOUT prompting — safe on page load, outside any
    user gesture, to decide whether the remembered folder auto-reopens. */
export async function hasPermission(handle) {
  if (!handle.queryPermission) return true;      // OPFS handles in tests
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
}

/** Ensure readwrite permission, prompting if needed — only ever call this
    from inside a real user gesture (a click handler). */
export async function verifyPermission(handle) {
  if (await hasPermission(handle)) return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/* -------------------------------------------------------------- walking */

const skip = name => name.startsWith('.') || name.endsWith('.crswap');

/** Every visible file under `dir` as {path, handle}; dotfiles, Chromium's
    in-flight .crswap write buffers, and trash/ stay invisible — the same
    holes the old server-side snapshot() had. */
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

/** {relpath: lastModified} for the whole campaign — what the external-edit
    poll compares between ticks. */
export async function scanMtimes(root) {
  const files = await collectFiles(root, '', []);
  const out = new Map();
  await Promise.all(files.map(async f => {
    try { out.set(f.path, (await f.handle.getFile()).lastModified); } catch { /* raced a delete */ }
  }));
  return out;
}

/* ------------------------------------------------------------- the tree */

const isTop = (path, top, ext) => {
  const parts = path.split('/');
  return parts.length === 2 && parts[0] === top && path.endsWith(ext);
};

/** The whole boot payload, in exactly the shape the old GET /api/c/:name/tree
    returned: {session, scenarios, players, monsters, objects, story, assets}
    with JSON/MD entries as {path, text} and assets as bare relpaths — plus
    the mtime map, so the caller can seed the external-edit baseline for
    free. */
export async function readTree(root) {
  const files = (await collectFiles(root, '', [])).sort((a, b) => a.path < b.path ? -1 : 1);
  const tree = { session: null, scenarios: [], players: [], monsters: [], objects: [], story: [], assets: [] };
  const mtimes = new Map();
  await Promise.all(files.map(async ({ path, handle }) => {
    let file;
    try { file = await handle.getFile(); } catch { return; }
    mtimes.set(path, file.lastModified);
    if (path === 'session.json') tree.session = await file.text();
    else if (isTop(path, 'scenarios', '.json')) tree.scenarios.push({ path, text: await file.text() });
    else if (isTop(path, 'players', '.json')) tree.players.push({ path, text: await file.text() });
    else if (isTop(path, 'monsters', '.json')) tree.monsters.push({ path, text: await file.text() });
    else if (isTop(path, 'objects', '.json')) tree.objects.push({ path, text: await file.text() });
    else if (path.startsWith('story/') && path.endsWith('.md')) tree.story.push({ path, text: await file.text() });
    else if (path.startsWith('assets/')) tree.assets.push(path);
  }));
  for (const k of ['scenarios', 'players', 'monsters', 'objects', 'story']) {
    tree[k].sort((a, b) => a.path < b.path ? -1 : 1);
  }
  tree.assets.sort();
  return { tree, mtimes };
}

/* ---------------------------------------------------------- reads/writes */

async function dirFor(root, rel, { create = false } = {}) {
  const parts = rel.split('/');
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return { dir, name: parts[parts.length - 1] };
}

export async function readAssetBlob(root, rel) {
  const { dir, name } = await dirFor(root, rel);
  return (await dir.getFileHandle(name)).getFile();     // a File IS a Blob
}

/** Write string or Blob. createWritable() stages into a .crswap file and
    replaces atomically on close — a crash mid-write never leaves half a
    monster on disk, same promise the old server's tempfile+rename made. */
export async function writeFile(root, rel, body) {
  const { dir, name } = await dirFor(root, rel, { create: true });
  const handle = await dir.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  await w.write(body);
  await w.close();
  return (await handle.getFile()).lastModified;
}

/** Copy into trash/<basename>-<epoch-ms>, then remove the original — the
    same "never unlink" contract server.py kept. */
export async function deleteToTrash(root, rel) {
  const { dir, name } = await dirFor(root, rel);
  const blob = await (await dir.getFileHandle(name)).getFile();
  const trashed = `trash/${name}-${Date.now()}`;
  await writeFile(root, trashed, blob);
  await dir.removeEntry(name);
  return { ok: true, trashedTo: trashed };
}

/* -------------------------------------------------------- new campaigns */

/** True when the folder has nothing visible in it (dotfiles like .DS_Store
    do not count) — the case "Abrir carpeta" treats as "start a campaign
    here" by seeding the subdirs. */
export async function isEmptyDir(root) {
  for await (const handle of root.values()) {
    if (!skip(handle.name)) return false;
  }
  return true;
}

export async function createCampaignSubdirs(root) {
  for (const name of SUBDIRS) await root.getDirectoryHandle(name, { create: true });
}

/* --------------------------------------------------------------- the room
   Which relay channel this table broadcasts on. A 6-char code from an
   unambiguous alphabet (no 0/O/1/I/L — nothing to misread off a screen),
   minted once per campaign and stored INSIDE the folder as `.dm-room`:
   dotfiles are invisible to the walkers above, so it is never an entity and
   never reads as an external edit — and it travels with the campaign to any
   device, so the table TV's remembered room keeps working. */

const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export function mintRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(b => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export async function readRoomCode(root) {
  try {
    const file = await (await root.getFileHandle('.dm-room')).getFile();
    const code = (await file.text()).trim().toUpperCase();
    if (ROOM_RE.test(code)) return code;
  } catch { /* no file yet */ }
  const code = mintRoomCode();
  await writeFile(root, '.dm-room', code + '\n');
  return code;
}
