/**
 * An in-memory vault. Backs the shell tests, the Playwright fixture and the
 * bundled example campaign, so the same tree can be asserted against, driven
 * from a browser and read by the loaders without a filesystem in sight.
 */
import {
  assertEntryName,
  VaultWriteError,
  type VaultDir,
  type VaultFile,
  type WritableVaultDir,
} from './source.ts'

/** A file is its bytes; a directory is a plain object of its entries. */
export type MemoryNode = string | Uint8Array | MemoryTree
export interface MemoryTree {
  [name: string]: MemoryNode
}

const isDirNode = (node: MemoryNode | undefined): node is MemoryTree =>
  typeof node === 'object' && !(node instanceof Uint8Array)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

class MemoryFile implements VaultFile {
  constructor(
    readonly name: string,
    private node: string | Uint8Array,
  ) {}

  async text(): Promise<string> {
    return typeof this.node === 'string' ? this.node : decoder.decode(this.node)
  }

  async blob(): Promise<Blob> {
    const bytes = typeof this.node === 'string' ? encoder.encode(this.node) : this.node
    return new Blob([bytes as BlobPart])
  }
}

/**
 * The whole tree. Directory handles are views onto it, so a write through one
 * is visible from every other — the property a real folder has.
 */
export class MemoryVault {
  /**
   * Every path handed out as writable, in order. The scoping test reads this:
   * nothing outside `runs/<mesa>/` and `scenarios/` may appear.
   */
  readonly openedWritable: string[] = []
  readonly writes: string[] = []

  constructor(private tree: MemoryTree = {}) {}

  /** A read-only handle on the root. */
  root(): VaultDir {
    return new MemoryDir(this, this.tree, '', '')
  }

  /**
   * A writable handle on the root. Only the code that resolves `runs/<mesa>/`
   * and `scenarios/` calls this; everything else takes `root()`.
   */
  writableRoot(): WritableVaultDir {
    return new MemoryDir(this, this.tree, '', '', true)
  }

  /** Read a file back by `/`-separated path — for assertions. */
  read(path: string): string | null {
    const parts = path.split('/').filter(Boolean)
    let node: MemoryNode | undefined = this.tree
    for (const part of parts) {
      if (!isDirNode(node)) return null
      node = node[part]
    }
    if (node === undefined || isDirNode(node)) return null
    return typeof node === 'string' ? node : decoder.decode(node)
  }

  has(path: string): boolean {
    const parts = path.split('/').filter(Boolean)
    let node: MemoryNode | undefined = this.tree
    for (const part of parts) {
      if (!isDirNode(node)) return false
      node = node[part]
    }
    return node !== undefined
  }

  /** @internal */
  noteWritable(path: string): void {
    this.openedWritable.push(path)
  }

  /** @internal */
  noteWrite(path: string): void {
    this.writes.push(path)
  }
}

class MemoryDir implements WritableVaultDir {
  constructor(
    private vault: MemoryVault,
    private node: MemoryTree,
    private path: string,
    readonly name: string,
    private writable = false,
  ) {}

  async list(): Promise<{ files: string[]; dirs: string[] }> {
    const files: string[] = []
    const dirs: string[] = []
    for (const [name, child] of Object.entries(this.node)) {
      ;(isDirNode(child) ? dirs : files).push(name)
    }
    return { files: files.sort(), dirs: dirs.sort() }
  }

  async file(name: string): Promise<VaultFile | null> {
    const child = this.node[assertEntryName(name)]
    if (child === undefined || isDirNode(child)) return null
    return new MemoryFile(name, child)
  }

  async dir(name: string): Promise<MemoryDir | null> {
    const child = this.node[assertEntryName(name)]
    if (!isDirNode(child)) return null
    const path = this.child(name)
    if (this.writable) this.vault.noteWritable(path)
    return new MemoryDir(this.vault, child, path, name, this.writable)
  }

  async write(name: string, data: string | Uint8Array | Blob): Promise<void> {
    if (!this.writable) throw new VaultWriteError(`Read-only handle: ${this.child(name)}`)
    assertEntryName(name)
    const value =
      typeof data === 'string'
        ? data
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(await data.arrayBuffer())
    this.node[name] = value
    this.vault.noteWrite(this.child(name))
  }

  /**
   * Reuses a directory that is already there — only *creating* one needs a
   * writable handle, which is what lets a read-only vault still descend.
   */
  async createDir(name: string): Promise<MemoryDir> {
    assertEntryName(name)
    const path = this.child(name)
    const existing = this.node[name]
    if (!isDirNode(existing)) {
      if (!this.writable) throw new VaultWriteError(`Read-only handle: ${path}`)
      this.node[name] = {}
    }
    if (this.writable) this.vault.noteWritable(path)
    return new MemoryDir(this.vault, this.node[name] as MemoryTree, path, name, this.writable)
  }

  readOnly(): VaultDir {
    return this.writable
      ? new MemoryDir(this.vault, this.node, this.path, this.name, false)
      : this
  }

  private child(name: string): string {
    return this.path ? `${this.path}/${name}` : name
  }
}
