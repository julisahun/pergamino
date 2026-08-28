/** Markdown → HTML, with wikilinks turned into navigable anchors. */
import { marked } from 'marked'
import type { Note } from './notes.ts'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const WIKILINK = /\[\[([^\][|]+)(?:\|([^\][]*))?\]\]/g

/**
 * Replace wikilinks before handing the text to the markdown parser, so that
 * `[[maraia|Maraia]]` becomes a link the reader can follow and a dangling
 * `[[bandido-lider]]` renders as visibly dead rather than as literal brackets.
 */
export function renderNote(note: Note): string {
  const resolvedByTarget = new Map(note.links.map((l) => [l.target, l.resolved]))

  const withLinks = note.body.replace(WIKILINK, (_match, rawTarget: string, alias?: string) => {
    const target = rawTarget.trim()
    const label = escapeHtml((alias ?? target).trim() || target)
    const resolved = resolvedByTarget.get(target)
    return resolved
      ? `<a class="wl" href="#" data-path="${escapeHtml(resolved)}">${label}</a>`
      : `<span class="wl dead" title="Sin nota">${label}</span>`
  })

  // Tag-only lines (`#npc #sequia`) are shown as chips in the header, so drop
  // them from the body rather than rendering a stray paragraph of hashes.
  const withoutTagLines = withLinks.replace(
    /^[ \t]*(?:#[\p{L}\p{N}_-]{2,}[ \t]*)+$\r?\n?/gmu,
    '',
  )

  return marked.parse(withoutTagLines, { async: false, gfm: true, breaks: false })
}
