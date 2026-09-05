import nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { worldRootPath } from './test/roots.ts'

const root = nodePath.dirname(fileURLToPath(import.meta.url))

/**
 * The suite splits by what a machine has.
 *
 * The DM's own Obsidian vault is private and is not on a CI runner, so the
 * tests that read it are named `*.vault.test.ts` and are left out when it is
 * not there — rather than the whole suite failing on a machine that was never
 * going to have it. What runs everywhere is the half built on `MemoryVault`:
 * the write-scope guard and the async shells.
 *
 * The vault tests are the check that moving the pure modules to `shared/`
 * changed no behaviour, so being told when they are skipped matters more than
 * the convenience of skipping them. Hence the line below.
 */
const vault = worldRootPath(root)
if (vault) {
  console.log(`[vitest] real vault fixture: ${vault} (read-only)`)
} else {
  console.log('[vitest] no real vault here — skipping *.vault.test.ts')
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: vault ? [] : ['shared/**/*.vault.test.ts'],
    // The real vault stays a fixture by construction rather than by flag:
    // `test/fixture.ts` opens it read-only, so a handle refuses the write
    // instead of a check catching it. Anything that needs to test a write
    // does it against a `MemoryVault`.
  },
})
