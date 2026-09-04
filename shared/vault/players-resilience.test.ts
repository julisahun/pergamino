/**
 * A PJ is a folder, so the loader now makes a read *per PJ* that the flat
 * layout never made. In the browser those reads throw where node's return
 * nothing: `FsaDir.list()` surfaces the `NotAllowedError` of a lapsed
 * permission grant and the `NotFoundError` of a folder moved out from under a
 * remembered handle, while `NodeDir.list()` swallows both and returns empty.
 *
 * Uncaught, one of them fails the whole `loadRun` — the DM gets an error
 * screen and no party, instead of a party missing one member. That asymmetry
 * is invisible to every other test here, because they all run on node or on
 * memory.
 */
import { describe, expect, it } from 'vitest'
import { CampaignVault } from './binding.ts'
import { MemoryVault, type MemoryTree } from './memory.ts'
import type { VaultDir, VaultFile, WritableVaultDir } from './source.ts'

const player = (id: string, name: string) => `---\nid: ${id}\nficha: ${name}\n---\n\n# ${name}\n`

const tree = (): MemoryTree => ({
  scenarios: {},
  story: { 'README.md': '# Campaña\n' },
  runs: {
    mesa: {
      players: {
        abraxas: { 'abraxas.md': player('pj-chispa', 'Abraxas') },
        toribio: { 'toribio.md': player('pj-ganzua', 'Toribio') },
      },
    },
  },
})

/**
 * The same vault, except that descending into `players/<victim>` throws the
 * way a `FileSystemDirectoryHandle` does.
 */
function breakOnePlayerFolder(
  root: WritableVaultDir,
  victim: string,
  err: Error,
): WritableVaultDir {
  const wrap = (dir: WritableVaultDir, insidePlayers: boolean): WritableVaultDir => ({
    name: dir.name,
    list: () => dir.list(),
    file: (name: string): Promise<VaultFile | null> => dir.file(name),
    write: (name, data) => dir.write(name, data),
    createDir: async (name) => wrap(await dir.createDir(name), name === 'players'),
    readOnly: (): VaultDir => wrap(dir, insidePlayers),
    dir: async (name: string) => {
      if (insidePlayers && name === victim) throw err
      const child = await dir.dir(name)
      return child ? wrap(child as WritableVaultDir, name === 'players') : null
    },
  })
  return wrap(root, false)
}

const fsaError = (name: string, message: string): Error =>
  Object.assign(new Error(message), { name })

describe('a PJ folder the browser cannot read', () => {
  for (const err of [
    fsaError('NotAllowedError', 'permission lapsed'),
    fsaError('NotFoundError', 'folder moved'),
  ]) {
    it(`costs that character and not the party (${err.name})`, async () => {
      const memory = new MemoryVault(tree())
      const root = breakOnePlayerFolder(memory.writableRoot(), 'abraxas', err)
      const vault = await CampaignVault.open(root)

      const run = await vault.loadRun('mesa')
      // Toribio still sits down; only Abraxas is missing.
      expect(run.characters.map((c) => c.id)).toEqual(['pj-ganzua'])
    })
  }

  it('seats the whole party when every folder reads', async () => {
    const memory = new MemoryVault(tree())
    const vault = await CampaignVault.open(memory.writableRoot())
    const run = await vault.loadRun('mesa')
    expect(run.characters.map((c) => c.id).sort()).toEqual(['pj-chispa', 'pj-ganzua'])
  })
})
