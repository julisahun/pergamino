/* The admin window's transports. Storage is the File System Access layer
   (fs.js) — fetchTree/putFile/deleteFile keep their old names and shapes but
   take the picked directory handle where they used to take a campaign name,
   so call sites barely moved. The network half — the SSE client, the board
   post, the ephemeral asset uploads — still talks to server.py, which is now
   a relay that never touches campaign files. */

import { readTree, writeFile, deleteToTrash, scanMtimes } from './fs.js';

/* Who this window is on the SSE channel — events it caused come back
   stamped with this and are ignored, the same echo-suppression the old
   dnd-dm-rev counter did. */
export const CLIENT_ID = 'admin-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

const jsonOrThrow = async r => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};

export const ping = () => fetch('/api/ping').then(jsonOrThrow);

/* ------------------------------------------------------- files on disk
   The external-edit poll needs to tell a text-editor save from our own
   autosave writing half a second ago. Same trick the server's watcher used:
   remember the mtime each own write landed with, and a scan that sees
   exactly that mtime saw us, not Obsidian. `baseline` is what the last scan
   (or tree read) saw; both maps live here so every write keeps them true. */

let baseline = new Map();           // relpath -> mtime as of the last scan
const ownWrites = new Map();        // relpath -> mtime our last write produced
const ownDeletes = new Set();       // relpaths we trashed since the last scan

export async function fetchTree(root, runPath = '') {
  const { tree, mtimes } = await readTree(root, runPath);
  baseline = mtimes;
  ownWrites.clear();
  ownDeletes.clear();
  return tree;
}

export async function putFile(root, rel, body) {
  const mtime = await writeFile(root, rel, body);
  ownWrites.set(rel, mtime);
  baseline.set(rel, mtime);
  return { ok: true, mtime };
}

export async function deleteFile(root, rel) {
  const r = await deleteToTrash(root, rel);
  ownDeletes.add(rel);
  baseline.delete(rel);
  return r;
}

/** One poll tick: what changed on disk since the last look, our own writes
    excluded — the same {changed, removed} the server's watcher used to push
    as a `files` event. */
export async function checkExternalChanges(root) {
  const now = await scanMtimes(root);
  const changed = [];
  for (const [path, mtime] of now) {
    if (baseline.get(path) !== mtime && ownWrites.get(path) !== mtime) changed.push(path);
  }
  const removed = [...baseline.keys()].filter(p => !now.has(p) && !ownDeletes.has(p));
  baseline = now;
  for (const [path, mtime] of ownWrites) if (now.get(path) !== mtime) ownWrites.delete(path);
  ownDeletes.clear();
  return { changed, removed };
}

/* ------------------------------------------------------------ the relay */

export const postBoard = (room, board) =>
  fetch('/api/board', { method: 'POST', body: JSON.stringify({ origin: CLIENT_ID, room, board }) })
    .then(jsonOrThrow);

/** Upload one asset the current board references into the relay's ephemeral
    in-memory cache, addressed by its own sha-256 — the server verifies the
    hash, so nobody can poison someone else's address. Returns the URL the
    board (and the television) will use. */
export async function putAsset(hash, blob) {
  await fetch(`/api/asset/${hash}`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  }).then(jsonOrThrow);
  return `/api/asset/${hash}`;
}

export async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The one channel this table's events arrive on — scoped to the campaign's
    room. EventSource reconnects on its own; the server's `hello` snapshot on
    every (re)connect is what makes that free. */
export function connectSSE(room, handlers) {
  const es = new EventSource(`/api/events?role=admin&client=${CLIENT_ID}&room=${room}`);
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, e => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      if (data.origin === CLIENT_ID) return;
      fn(data);
    });
  }
  return es;
}

/* ------------------------------------------------------------- autosaver
   A dirty-set of relpaths with a trailing debounce per path. Each entry
   holds a *producer*, not a payload, so a burst of edits serialises the
   state as it is at write time — one write, latest truth. */

const DEBOUNCE_MS = 500;

export class Autosaver {
  constructor(root, onError) {
    this.root = root;
    this.onError = onError || (() => {});
    this.pending = new Map();           // rel -> {producer, timer}
    /* A tab closed mid-debounce should still write: pagehide is best-effort
       but a local disk write answers in single-digit milliseconds. */
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  /** Queue `rel` to be written soon; producer() is called at write time and
      must return the file's full content (string or Blob). */
  mark(rel, producer) {
    const entry = this.pending.get(rel);
    if (entry) clearTimeout(entry.timer);
    this.pending.set(rel, {
      producer,
      timer: setTimeout(() => this.write(rel), DEBOUNCE_MS),
    });
  }

  async write(rel) {
    const entry = this.pending.get(rel);
    if (!entry) return;
    this.pending.delete(rel);
    try {
      await putFile(this.root, rel, entry.producer());
    } catch (e) {
      this.onError(`No se pudo guardar ${rel}: ${e.message}`);
    }
  }

  flush() {
    for (const rel of [...this.pending.keys()]) this.write(rel);
  }
}
