/**
 * A vault over `node:fs`. Dev and test only — nothing the browser bundle
 * imports reaches this file.
 *
 * The suite uses the DM's real vault as its fixture, so the root it opens is
 * read-only by construction: `write` throws before it can touch a byte. That
 * is the same backstop `VAULT_READONLY=1` gave, moved from a global flag into
 * the handle itself.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import nodePath from 'node:path'
import {
  assertEntryName,
  VaultWriteError,
  type VaultDir,
  type VaultFile,
  type WritableVaultDir,
} from './source.ts'

class NodeFile implements VaultFile {
  constructor(
    readonly name: string,
    private abs: string,
  ) {}

  text(): Promise<string> {
    return fsp.readFile(this.abs, 'utf8')
  }

  async blob(): Promise<Blob> {
    const buf = await fsp.readFile(this.abs)
    return new Blob([new Uint8Array(buf)])
  }
}

class NodeDir implements WritableVaultDir {
  constructor(
    readonly abs: string,
    readonly name: string,
    private writable: boolean,
  ) {}

  async list(): Promise<{ files: string[]; dirs: string[] }> {
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(this.abs, { withFileTypes: true })
    } catch {
      return { files: [], dirs: [] }
    }
    const files: string[] = []
    const dirs: string[] = []
    for (const e of entries) (e.isDirectory() ? dirs : files).push(e.name)
    return { files: files.sort(), dirs: dirs.sort() }
  }

  async file(name: string): Promise<VaultFile | null> {
    const abs = nodePath.join(this.abs, assertEntryName(name))
    try {
      if (!(await fsp.stat(abs)).isFile()) return null
    } catch {
      return null
    }
    return new NodeFile(name, abs)
  }

  async dir(name: string): Promise<NodeDir | null> {
    const abs = nodePath.join(this.abs, assertEntryName(name))
    try {
      if (!(await fsp.stat(abs)).isDirectory()) return null
    } catch {
      return null
    }
    return new NodeDir(abs, name, this.writable)
  }

  async write(name: string, data: string | Uint8Array | Blob): Promise<void> {
    const abs = nodePath.join(this.abs, assertEntryName(name))
    if (!this.writable) throw new VaultWriteError(`Read-only vault — refusing to write ${abs}`)
    const bytes =
      typeof data === 'string'
        ? data
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(await data.arrayBuffer())
    await fsp.writeFile(abs, bytes)
  }

  /**
   * Reuses a directory that is already there — only *creating* one needs a
   * writable vault, which is what lets the read-only fixture still descend
   * into a run and then refuse the write itself.
   */
  async createDir(name: string): Promise<NodeDir> {
    const abs = nodePath.join(this.abs, assertEntryName(name))
    try {
      if ((await fsp.stat(abs)).isDirectory()) return new NodeDir(abs, name, this.writable)
    } catch {
      /* not there yet */
    }
    if (!this.writable) throw new VaultWriteError(`Read-only vault — refusing to create ${abs}`)
    await fsp.mkdir(abs, { recursive: true })
    return new NodeDir(abs, name, true)
  }

  readOnly(): VaultDir {
    return this.writable ? new NodeDir(this.abs, this.name, false) : this
  }
}

/** Open `abs` as a vault root. `writable` defaults to false on purpose. */
export function openNodeVault(abs: string, opts: { writable?: boolean } = {}): WritableVaultDir {
  const resolved = nodePath.resolve(abs)
  return new NodeDir(resolved, nodePath.basename(resolved), opts.writable === true)
}
