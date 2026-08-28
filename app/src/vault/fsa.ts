/**
 * A vault over `FileSystemDirectoryHandle` — the browser reading the DM's own
 * folder, with no server in between.
 *
 * This is the implementation that makes the deployment shareable: the bytes
 * never leave the machine that granted the folder, so hosting the app in
 * public exposes nothing but the app.
 */
import {
  assertEntryName,
  VaultError,
  VaultWriteError,
  type VaultDir,
  type VaultFile,
  type WritableVaultDir,
} from '../../../shared/vault/source.ts'

class FsaFile implements VaultFile {
  constructor(
    readonly name: string,
    private handle: FileSystemFileHandle,
  ) {}

  async text(): Promise<string> {
    return (await this.handle.getFile()).text()
  }

  async blob(): Promise<Blob> {
    return this.handle.getFile()
  }
}

class FsaDir implements WritableVaultDir {
  constructor(
    private handle: FileSystemDirectoryHandle,
    readonly name: string,
    private writable: boolean,
  ) {}

  async list(): Promise<{ files: string[]; dirs: string[] }> {
    const files: string[] = []
    const dirs: string[] = []
    for await (const [name, entry] of this.handle.entries()) {
      ;(entry.kind === 'directory' ? dirs : files).push(name)
    }
    return { files: files.sort(), dirs: dirs.sort() }
  }

  async file(name: string): Promise<VaultFile | null> {
    try {
      return new FsaFile(name, await this.handle.getFileHandle(assertEntryName(name)))
    } catch (err) {
      if (err instanceof VaultError) throw err
      return null
    }
  }

  async dir(name: string): Promise<FsaDir | null> {
    try {
      const child = await this.handle.getDirectoryHandle(assertEntryName(name))
      return new FsaDir(child, name, this.writable)
    } catch (err) {
      if (err instanceof VaultError) throw err
      return null
    }
  }

  async write(name: string, data: string | Uint8Array | Blob): Promise<void> {
    if (!this.writable) throw new VaultWriteError(`Read-only handle: ${this.name}/${name}`)
    const file = await this.handle.getFileHandle(assertEntryName(name), { create: true })
    // `createWritable` buffers into a swap file the browser only commits on
    // close — the atomicity the node version got from write-then-rename.
    const stream = await file.createWritable()
    try {
      await stream.write(data as FileSystemWriteChunkType)
      await stream.close()
    } catch (err) {
      await stream.abort().catch(() => undefined)
      throw err
    }
  }

  /** Reuses a directory that is already there; only creating one may write. */
  async createDir(name: string): Promise<FsaDir> {
    assertEntryName(name)
    try {
      return new FsaDir(await this.handle.getDirectoryHandle(name), name, this.writable)
    } catch {
      /* not there yet */
    }
    if (!this.writable) throw new VaultWriteError(`Read-only handle: ${this.name}/${name}`)
    return new FsaDir(await this.handle.getDirectoryHandle(name, { create: true }), name, true)
  }

  readOnly(): VaultDir {
    return this.writable ? new FsaDir(this.handle, this.name, false) : this
  }
}

/** Wrap a granted directory handle as a vault root. */
export const openFsaVault = (
  handle: FileSystemDirectoryHandle,
  opts: { writable?: boolean } = {},
): WritableVaultDir => new FsaDir(handle, handle.name, opts.writable !== false)

/** Chromium only, and only in a secure context. */
export const fsaSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
