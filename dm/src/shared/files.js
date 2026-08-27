/* Reading and writing one file, given a directory handle.

   Both windows need this half of storage: the admin writes the campaign and
   the television reads pictures and sound out of the same folder, through the
   handle it was handed over the bus. Everything above this — grants, the
   remembered handle, the tree walk, the runs — belongs to the admin alone and
   lives in admin/fs.js.

   Paths are campaign-relative, always. */

/** @param {FileSystemDirectoryHandle} root @param {string} rel */
async function dirFor(root, rel, { create = false } = {}) {
  const parts = rel.split('/');
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
  return { dir, name: parts[parts.length - 1] };
}

/** A File IS a Blob — this is how a picture reaches an <img> without a server.
    @param {FileSystemDirectoryHandle} root @param {string} rel */
export async function readBlob(root, rel) {
  const { dir, name } = await dirFor(root, rel);
  return (await dir.getFileHandle(name)).getFile();
}

/** @param {FileSystemDirectoryHandle} root @param {string} rel */
export async function readText(root, rel) {
  return (await readBlob(root, rel)).text();
}

/** Write a string or a Blob, creating folders as needed. createWritable()
    stages into a .crswap sibling and replaces atomically on close, so a crash
    mid-write never leaves half a monster on disk. Returns the mtime the write
    landed with, which is how the poll tells our own writes from a text editor's.
    @param {FileSystemDirectoryHandle} root @param {string} rel
    @param {string|Blob} body @returns {Promise<number>} */
export async function writeFile(root, rel, body) {
  const { dir, name } = await dirFor(root, rel, { create: true });
  const handle = await dir.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  await w.write(body);
  await w.close();
  return (await handle.getFile()).lastModified;
}

/** Copy into `trash/<basename>-<epoch>`, then remove the original: deletes are
    moves, never unlinks. The FS API has no rename, so a copy is what there is.
    @param {FileSystemDirectoryHandle} root @param {string} rel */
export async function deleteToTrash(root, rel) {
  const { dir, name } = await dirFor(root, rel);
  const blob = await (await dir.getFileHandle(name)).getFile();
  const trashedTo = `trash/${name}-${Date.now()}`;
  await writeFile(root, trashedTo, blob);
  await dir.removeEntry(name);
  return { ok: true, trashedTo };
}

