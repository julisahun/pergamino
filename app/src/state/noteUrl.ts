/**
 * The note being read, in the URL: `?nota=<vault-relative path>`.
 *
 * The path *is* the identity — it is the note's key in `NotesIndex`, which is
 * what `openNote` already passes around — so there is nothing to invent and
 * nothing to look up. What it buys: a reload comes back to the same note,
 * leaving the tab and returning keeps it, and a note can be linked to.
 *
 * It lives in its own module because two places need it and neither should own
 * the other: `NotasPanel` writes it and reads it back, and `dmStore` needs it
 * to decide which tab the console opens on — a URL that names a note but lands
 * on Mesa is a URL that did nothing.
 *
 * `replaceState`, not `pushState`: reading a note is not navigation, and the
 * back button belongs to the browser rather than to the list of notes the DM
 * clicked through. Other params — `?fixture=` — are preserved.
 */
const NOTE_PARAM = 'nota'

/** The note the URL names, or null. Never throws: it is a convenience. */
export function noteFromUrl(): string | null {
  try {
    return new URLSearchParams(location.search).get(NOTE_PARAM)
  } catch {
    return null
  }
}

export function rememberNoteInUrl(path: string | null): void {
  try {
    const url = new URL(location.href)
    if (path) url.searchParams.set(NOTE_PARAM, path)
    else url.searchParams.delete(NOTE_PARAM)
    history.replaceState(null, '', url)
  } catch {
    /* a sandboxed frame can refuse this; the note is state, the URL is not */
  }
}
