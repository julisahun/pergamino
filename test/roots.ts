/**
 * Where the vault fixture lives.
 *
 * The project has moved before and may move again — it was developed beside
 * the repo, then sat in `pergamino/dm/`, and is now the repo root — so the
 * root is a list of candidates rather than one relative path, and the first
 * one that exists wins.
 *
 * Kept apart from `fixture.ts` because `vitest.config.ts` needs it too: the
 * suite runs the real-vault tests only where the real vault is.
 */
import fs from 'node:fs'
import nodePath from 'node:path'

const firstThatExists = (root: string, candidates: string[]): string | null => {
  for (const candidate of candidates) {
    const abs = nodePath.resolve(root, candidate)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

export const WORLD = process.env.WORLD ?? 'talasia'
export const CAMPAIGN = process.env.CAMPAIGN ?? 'marea-baja'

/**
 * The DM's own Obsidian vault. Private, and not on any CI runner — every test
 * that reads it is named `*.vault.test.ts` so the suite can leave it out where
 * it is absent.
 */
export function worldRootPath(projectRoot: string): string | null {
  if (process.env.VAULT_ROOT) {
    const abs = nodePath.resolve(projectRoot, process.env.VAULT_ROOT, WORLD)
    return fs.existsSync(abs) ? abs : null
  }
  return firstThatExists(projectRoot, [
    // the repo sitting beside the vault, which is where it lives
    nodePath.join('../dnd', WORLD),
    // and from a nested checkout, which is where it used to
    nodePath.join('../../dnd', WORLD),
  ])
}
