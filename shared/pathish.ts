/**
 * The slice of `node:path` the vault modules actually use, POSIX-only.
 *
 * The pure modules moved to `shared/` so both the browser and the tests could
 * import them; `node:path` was the one import standing in the way. Vault
 * paths are `/`-separated everywhere — that is what Obsidian writes into a
 * wikilink and what a `FileSystemDirectoryHandle` walk produces — so a POSIX
 * shim is not an approximation of `node:path`, it is the whole of it that
 * applies here.
 */

export const sep = '/'

export const isAbsolute = (p: string): boolean => p.startsWith('/')

/** Collapse `.`, `..` and repeated separators. Mirrors `path.posix.normalize`. */
export function normalize(p: string): string {
  const absolute = isAbsolute(p)
  const trailing = p.length > 1 && p.endsWith('/')
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')
      continue
    }
    out.push(part)
  }
  let joined = out.join('/')
  if (absolute) joined = `/${joined}`
  else if (joined === '') joined = '.'
  return trailing && !joined.endsWith('/') ? `${joined}/` : joined
}

export function join(...parts: string[]): string {
  const joined = parts.filter((p) => p !== '').join('/')
  return joined === '' ? '.' : normalize(joined)
}

export function dirname(p: string): string {
  const norm = p.replace(/\/+$/, '')
  const at = norm.lastIndexOf('/')
  if (at === -1) return '.'
  if (at === 0) return '/'
  return norm.slice(0, at)
}

export function basename(p: string, ext?: string): string {
  const norm = p.replace(/\/+$/, '')
  const name = norm.slice(norm.lastIndexOf('/') + 1)
  return ext && name !== ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name
}

export function extname(p: string): string {
  const name = basename(p)
  const at = name.lastIndexOf('.')
  return at <= 0 ? '' : name.slice(at)
}

/** Relative path from `from` to `to`, both treated as directories. */
export function relative(from: string, to: string): string {
  const split = (p: string) => normalize(p).split('/').filter((s) => s !== '' && s !== '.')
  const a = split(from)
  const b = split(to)
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...Array<string>(a.length - i).fill('..'), ...b.slice(i)].join('/')
}

/**
 * `join(base, rel)` that refuses anything escaping `base`.
 *
 * The old `paths.ts` needed this against the filesystem, symlinks and all.
 * Handles cannot address their parent, so the only place left that needs it
 * is wikilink resolution, where `[[../x]]` is just a string to reject.
 */
export function containedJoin(base: string, rel: string): string | null {
  const target = normalize(join(base, rel))
  if (base === '' || base === '.') return target.startsWith('..') ? null : target
  const back = relative(base, target)
  return back === '..' || back.startsWith('../') ? null : target
}
