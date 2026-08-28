/**
 * `VaultSource` — the seam between the app and wherever the campaign lives.
 *
 * Three implementations fill it: `fsa.ts` over a `FileSystemDirectoryHandle`
 * in the browser, `memory.ts` for tests and the bundled example campaign, and
 * `node.ts` over `node:fs` for the suite that uses the DM's real vault as its
 * fixture.
 *
 * The write guard lives in the *shape* of these types rather than in a check.
 * A loader is handed a `VaultDir`, which has no `write`, and a handle cannot
 * address its parent — so writing outside a run is a compile error, not a
 * runtime refusal. Only `runs/<mesa>/` (play) and `scenarios/` (Preparación)
 * are ever resolved as a `WritableVaultDir`; that is what `runs/README.md`
 * asks for:
 *
 *   "La preparación no se toca durante el juego; una partida sólo acumula.
 *    Nada de `runs/` edita `story/`, `pnj/`, `objects/` ni `scenarios/`."
 */

export class VaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultError'
  }
}

/** Refused writes: a read-only source, or a name that is not a plain entry. */
export class VaultWriteError extends VaultError {
  constructor(message: string) {
    super(message)
    this.name = 'VaultWriteError'
  }
}

export interface VaultFile {
  name: string
  text(): Promise<string>
  blob(): Promise<Blob>
}

/** A directory that can only be read, and only downwards. */
export interface VaultDir {
  name: string
  list(): Promise<{ files: string[]; dirs: string[] }>
  file(name: string): Promise<VaultFile | null>
  dir(name: string): Promise<VaultDir | null>
}

export interface WritableVaultDir extends VaultDir {
  /** Narrowed: descending a writable handle stays writable. */
  dir(name: string): Promise<WritableVaultDir | null>
  write(name: string, data: string | Uint8Array | Blob): Promise<void>
  createDir(name: string): Promise<WritableVaultDir>
  /**
   * The same directory, as a handle that cannot write and whose children
   * cannot either.
   *
   * `WritableVaultDir` is structurally a `VaultDir`, so typing a handle down
   * is enough for the compiler — but it leaves `write` reachable at runtime by
   * anyone who casts, and leaves the descent itself a writable one. This gives
   * back a handle that is read-only all the way down, which is what lets the
   * scoping test say something true: the only handles that can write are the
   * two the vault deliberately resolves as writable.
   */
  readOnly(): VaultDir
}

/**
 * One path segment, and nothing clever: no separators, no `.`/`..`, no
 * dotfiles. Every implementation runs names through this before touching
 * storage, so `dir('..')` cannot exist to be exploited.
 */
export function assertEntryName(name: string): string {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new VaultError(`Not a directory entry name: ${JSON.stringify(name)}`)
  }
  return name
}

// --- walking, in terms of the interface above ------------------------------

/** Descend a `/`-separated path. Returns null if any segment is missing. */
export async function dirAt(dir: VaultDir, relative: string): Promise<VaultDir | null> {
  let cur: VaultDir | null = dir
  for (const part of relative.split('/')) {
    if (part === '' || part === '.') continue
    if (!cur) return null
    cur = await cur.dir(part)
  }
  return cur
}

/** Resolve a `/`-separated file path, e.g. `assets/harbor.jpg`. */
export async function fileAt(dir: VaultDir, relative: string): Promise<VaultFile | null> {
  const at = relative.lastIndexOf('/')
  if (at === -1) return dir.file(relative)
  const parent = await dirAt(dir, relative.slice(0, at))
  return parent ? parent.file(relative.slice(at + 1)) : null
}

export async function readText(dir: VaultDir, name: string): Promise<string | null> {
  const file = await dir.file(name)
  return file ? file.text() : null
}

export async function readJson(dir: VaultDir, name: string): Promise<unknown | null> {
  const raw = await readText(dir, name)
  if (raw === null) return null
  return JSON.parse(raw) as unknown
}

export async function exists(dir: VaultDir, name: string): Promise<boolean> {
  const { files, dirs } = await dir.list()
  return files.includes(name) || dirs.includes(name)
}

/** Sorted `*.json` entries — the order every loader has always read in. */
export async function jsonNames(dir: VaultDir): Promise<string[]> {
  const { files } = await dir.list()
  return files.filter((n) => n.endsWith('.json')).sort()
}

/**
 * Sorted `*.md` entries. Dotfiles are skipped so an editor's swap file never
 * loads as a PNJ with an empty statblock.
 */
export async function markdownNames(dir: VaultDir): Promise<string[]> {
  const { files } = await dir.list()
  return files.filter((n) => !n.startsWith('.') && n.toLowerCase().endsWith('.md')).sort()
}

/** Folders a vault walk never descends into. */
export const SKIP_DIRS = new Set(['.obsidian', '.git', '.venv', 'node_modules', '__pycache__'])

/**
 * Every `.md` under `root`, as `/`-separated paths relative to it. Dot-folders
 * and the usual machinery are skipped, and an unreadable folder is stepped
 * over rather than thrown from — one bad directory should not cost the index.
 */
export async function walkMarkdown(root: VaultDir): Promise<string[]> {
  const out: string[] = []
  const visit = async (dir: VaultDir, prefix: string): Promise<void> => {
    let entries: { files: string[]; dirs: string[] }
    try {
      entries = await dir.list()
    } catch {
      return
    }
    for (const name of entries.files) {
      if (name.startsWith('.')) continue
      if (name.toLowerCase().endsWith('.md')) out.push(prefix ? `${prefix}/${name}` : name)
    }
    for (const name of entries.dirs) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue
      const sub = await dir.dir(name)
      if (sub) await visit(sub, prefix ? `${prefix}/${name}` : name)
    }
  }
  await visit(root, '')
  return out
}

