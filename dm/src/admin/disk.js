/* The write side of storage: what lands on disk, when, and how the app finds
   out about edits made outside it.

   Three things live here, and they are all about time rather than paths:

     Autosaver          a dirty-set with a trailing debounce per file. There
                        are no save buttons anywhere in this app.
     the mtime baseline what the last look at the folder saw, so our own
                        writes can be told apart from a text editor's.
     checkExternalChanges  one poll tick.

   Every write goes through here. Bypassing it — writing straight through
   fs.js — makes the write look external on the next tick and triggers a
   pointless re-read of the whole campaign. */

import { writeFile, deleteToTrash, scanMtimes } from './fs.js';

/* --------------------------------------------------------- the baseline */

/** @type {Map<string, number>} */
let baseline = new Map();          // relpath -> mtime as of the last look
/** @type {Map<string, number>} */
const ownWrites = new Map();       // relpath -> the mtime OUR last write produced
/** @type {Set<string>} */
const ownDeletes = new Set();      // relpaths we trashed since the last look

/** Seed the baseline from a tree read, and forget any pending self-knowledge:
    a fresh read has just seen the truth. @param {Map<string, number>} mtimes */
export function seedBaseline(mtimes) {
  baseline = mtimes;
  ownWrites.clear();
  ownDeletes.clear();
}

/** @param {FileSystemDirectoryHandle} root @param {string} rel @param {string|Blob} body */
export async function putFile(root, rel, body) {
  const mtime = await writeFile(root, rel, body);
  ownWrites.set(rel, mtime);
  baseline.set(rel, mtime);
  return mtime;
}

/** @param {FileSystemDirectoryHandle} root @param {string} rel */
export async function deleteFile(root, rel) {
  const r = await deleteToTrash(root, rel);
  ownDeletes.add(rel);
  baseline.delete(rel);
  return r;
}

/**
 * One poll tick: what moved on disk since the last look, our own writes
 * excluded. A scan that sees exactly the mtime our write produced saw us, not
 * the DM's text editor.
 * @param {FileSystemDirectoryHandle} root
 * @returns {Promise<{changed: string[], removed: string[]}>}
 */
export async function checkExternalChanges(root) {
  const now = await scanMtimes(root);
  /** @type {string[]} */
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

/* --------------------------------------------------------------- saving */

const DEBOUNCE_MS = 500;

/**
 * A dirty-set of relpaths, each with its own trailing debounce. Entries hold a
 * *producer*, not a payload, so a burst of edits serialises the state as it is
 * at write time: one write, latest truth.
 */
export class Autosaver {
  /** @param {FileSystemDirectoryHandle} root
      @param {(msg: string) => void} [onError] */
  constructor(root, onError) {
    this.root = root;
    this.onError = onError || (() => {});
    /** @type {Map<string, {producer: () => string|Blob, timer: ReturnType<typeof setTimeout>}>} */
    this.pending = new Map();
    /* A window closed mid-debounce should still write: pagehide is
       best-effort, but a local disk write answers in single-digit ms. */
    this.onPageHide = () => this.flush();
    this.onHide = () => { if (document.visibilityState === 'hidden') this.flush(); };
    addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onHide);
  }

  /** Queue `rel` to be written soon. producer() runs at write time and returns
      the file's whole content. @param {string} rel @param {() => string|Blob} producer */
  mark(rel, producer) {
    const entry = this.pending.get(rel);
    if (entry) clearTimeout(entry.timer);
    this.pending.set(rel, { producer, timer: setTimeout(() => this.write(rel), DEBOUNCE_MS) });
  }

  /** @param {string} rel */
  async write(rel) {
    const entry = this.pending.get(rel);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(rel);
    try {
      await putFile(this.root, rel, entry.producer());
    } catch (e) {
      this.onError(`No se pudo guardar ${rel}: ${e instanceof Error ? e.message : e}`);
    }
  }

  flush() {
    for (const rel of [...this.pending.keys()]) this.write(rel);
  }

  /** Stop listening. A saver outlives neither its folder nor its mesa. */
  detach() {
    this.flush();
    removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onHide);
  }
}
