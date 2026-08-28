/**
 * The campaign notes as a linked graph.
 *
 * The vault is an Obsidian vault, so notes address each other with
 * `[[wikilinks]]` in three shapes that all appear in the real files:
 *   [[Raimo]]                  bare basename, capitalised differently
 *   [[maraia|Maraia]]          basename with an alias
 *   [[runs/README|Partidas]]   a path, needed because README is ambiguous
 *
 * Resolution follows Obsidian: try it as a path first (relative to the linking
 * note, then to the vault), then fall back to a basename match, preferring the
 * candidate nearest the note that links to it.
 */
import * as path from '../pathish.ts'
import { fileAt, walkMarkdown, type VaultDir } from './source.ts'

export interface WikiLink {
  /** Raw target as written, without the alias. */
  target: string
  alias: string | null
  /** Vault-relative path of the note it resolves to, or null when dangling. */
  resolved: string | null
}

export interface Note {
  /** Vault-relative path, e.g. `campaigns/marea-baja/story/gente/vann.md`. */
  path: string
  /** File name without extension. */
  slug: string
  title: string
  frontmatter: Record<string, string>
  tags: string[]
  body: string
  links: WikiLink[]
}

export interface NotesIndex {
  notes: Map<string, Note>
  /** Vault-relative path → the notes that link to it. */
  backlinks: Map<string, string[]>
  tags: Map<string, string[]>
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const WIKILINK = /\[\[([^\][|]+)(?:\|([^\][]*))?\]\]/g
const TAG = /(?:^|\s)#([\p{L}\p{N}_-]{2,})/gu

export function parseNote(rel: string, raw: string): Note {
  const frontmatter: Record<string, string> = {}
  let body = raw
  const fm = FRONTMATTER.exec(raw)
  if (fm) {
    body = raw.slice(fm[0].length)
    for (const line of fm[1]!.split(/\r?\n/)) {
      const at = line.indexOf(':')
      if (at > 0) frontmatter[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
  }

  const links: WikiLink[] = []
  for (const m of body.matchAll(WIKILINK)) {
    links.push({ target: m[1]!.trim(), alias: m[2]?.trim() ?? null, resolved: null })
  }

  const tags = [...new Set([...body.matchAll(TAG)].map((m) => m[1]!))]

  const heading = /^#\s+(.+)$/m.exec(body)
  const slug = path.basename(rel).replace(/\.md$/i, '')

  return {
    path: rel,
    slug,
    title: frontmatter.ficha ?? heading?.[1]?.trim() ?? slug,
    frontmatter,
    tags,
    body,
    links,
  }
}

/**
 * Resolve a wikilink target from `fromPath`.
 * Exported so the resolution order can be tested against the real vault.
 */
export function resolveLink(
  target: string,
  fromPath: string,
  byPath: Map<string, string>,
  bySlug: Map<string, string[]>,
): string | null {
  const clean = target.replace(/^\.\//, '').replace(/#.*$/, '').trim()
  if (!clean) return null
  const withExt = clean.toLowerCase().endsWith('.md') ? clean : `${clean}.md`
  const fromDir = path.dirname(fromPath)

  // 1. As a path, tried against every ancestor of the linking note and then
  //    the vault root. `[[runs/README]]` is written from inside
  //    `campaigns/marea-baja/story/`, so it only resolves once we try it
  //    against `campaigns/marea-baja/`.
  const ancestors: string[] = []
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    ancestors.push(dir === '.' ? '' : dir)
    if (dir === '.' || dir === path.sep || dir === '') break
  }
  for (const base of ancestors) {
    // The one thing `contain()` still guards: a target that climbs out of the
    // vault. There is no filesystem behind this any more, so it is pure
    // string work — but `[[../../etc/passwd]]` is still not a note.
    const target = path.containedJoin('', path.join(base, withExt))
    if (target === null) continue
    const hit = byPath.get(target.toLowerCase())
    if (hit) return hit
  }

  // 2. As a bare basename. `[[README]]` is ambiguous across the vault, so
  //    prefer the candidate sharing the longest directory prefix with the
  //    note doing the linking — the same "nearest note wins" rule Obsidian uses.
  const slug = path.basename(clean).toLowerCase()
  let candidates = bySlug.get(slug)
  if (!candidates?.length) return null

  // A target with a directory in it must match that directory, or
  // `[[runs/README]]` would happily settle for `story/README.md`.
  if (clean.includes('/')) {
    const suffix = `/${withExt.toLowerCase()}`
    const constrained = candidates.filter((c) => `/${c.toLowerCase()}`.endsWith(suffix))
    if (constrained.length === 0) return null
    candidates = constrained
  }
  if (candidates.length === 1) return candidates[0]!

  const fromParts = fromDir.split(path.sep)
  let best = candidates[0]!
  let bestScore = -1
  for (const candidate of candidates) {
    const parts = path.dirname(candidate).split(path.sep)
    let shared = 0
    while (shared < parts.length && shared < fromParts.length && parts[shared] === fromParts[shared]) {
      shared++
    }
    if (shared > bestScore) {
      bestScore = shared
      best = candidate
    }
  }
  return best
}

/**
 * Index every note under `root`.
 *
 * The root is the *world* folder when one was opened (`talasia/`), so
 * `mundo/` lore stays reachable from a campaign note, and the campaign folder
 * itself for a flat campaign.
 */
export async function buildIndex(root: VaultDir): Promise<NotesIndex> {
  const files = await walkMarkdown(root)

  const notes = new Map<string, Note>()
  const byPath = new Map<string, string>()
  const bySlug = new Map<string, string[]>()

  for (const rel of files.sort()) {
    let raw: string
    try {
      const file = await fileAt(root, rel)
      if (!file) continue
      raw = await file.text()
    } catch {
      continue
    }
    const note = parseNote(rel, raw)
    notes.set(rel, note)
    byPath.set(path.normalize(rel).toLowerCase(), rel)
    const slug = note.slug.toLowerCase()
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), rel])
  }

  const backlinks = new Map<string, string[]>()
  const tags = new Map<string, string[]>()

  for (const note of notes.values()) {
    for (const link of note.links) {
      link.resolved = resolveLink(link.target, note.path, byPath, bySlug)
      if (link.resolved) {
        const list = backlinks.get(link.resolved) ?? []
        if (!list.includes(note.path)) list.push(note.path)
        backlinks.set(link.resolved, list)
      }
    }
    for (const tag of note.tags) {
      tags.set(tag, [...(tags.get(tag) ?? []), note.path])
    }
  }

  return { notes, backlinks, tags }
}

export interface SearchHit {
  path: string
  title: string
  /** A line containing the match, for context. */
  excerpt: string
}

export function search(index: NotesIndex, query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const hits: SearchHit[] = []
  for (const note of index.notes.values()) {
    const inTitle = note.title.toLowerCase().includes(q)
    const at = note.body.toLowerCase().indexOf(q)
    if (!inTitle && at === -1) continue
    let excerpt = ''
    if (at !== -1) {
      const start = note.body.lastIndexOf('\n', at) + 1
      const end = note.body.indexOf('\n', at)
      excerpt = note.body.slice(start, end === -1 ? undefined : end).trim().slice(0, 220)
    }
    hits.push({ path: note.path, title: note.title, excerpt })
    if (hits.length >= limit) break
  }
  // Title matches first — they are almost always what the DM meant.
  return hits.sort((a, b) => {
    const at = a.title.toLowerCase().includes(q) ? 0 : 1
    const bt = b.title.toLowerCase().includes(q) ? 0 : 1
    return at - bt || a.title.localeCompare(b.title, 'es')
  })
}
