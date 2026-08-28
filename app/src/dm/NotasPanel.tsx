/** The campaign notes: search, tags, wikilink navigation and backlinks. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { es } from '../strings/es.ts'
import { useDm, type NoteDoc, type NoteRef } from '../state/dmStore.ts'

interface Hit {
  path: string
  title: string
  excerpt: string
}

/** `campaigns/marea-baja/story/gente/vann.md` → `story · gente`. */
const groupOf = (p: string): string => {
  const parts = p.split('/').slice(0, -1)
  const at = parts.indexOf('campaigns')
  const trimmed = at === -1 ? parts : parts.slice(at + 2)
  return trimmed.join(' · ') || '·'
}

export function NotasPanel() {
  const { pendingNote, clearPendingNote, noteList, readNote, searchNotes, mesa } = useDm()
  const [current, setCurrent] = useState<NoteDoc | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // The index is built once when the folder opens and lives in the store;
  // `mesa` is in the deps only so switching runs re-reads it.
  const index: { notes: NoteRef[]; tags: { tag: string; count: number }[] } = useMemo(
    () => noteList(),
    [noteList, mesa],
  )

  const open = (path: string) => {
    const doc = readNote(path)
    if (!doc) return
    setCurrent(doc)
    bodyRef.current?.parentElement?.scrollTo({ top: 0 })
  }

  // Another tab asked for a note (an NPC's stat block linking to its story note).
  useEffect(() => {
    if (!pendingNote) return
    open(pendingNote)
    clearPendingNote()
  }, [pendingNote, clearPendingNote])

  // Open the campaign index first, so the panel is never blank.
  useEffect(() => {
    if (current || index.notes.length === 0) return
    const readme = index.notes.find((n) => n.path.endsWith('story/README.md'))
    open((readme ?? index.notes[0]!).path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index.notes.length])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits(null)
      return
    }
    const timer = setTimeout(() => setHits(searchNotes(q)), 180)
    return () => clearTimeout(timer)
  }, [query, searchNotes])

  const groups = useMemo(() => {
    const filtered = tag ? index.notes.filter((n) => n.tags.includes(tag)) : index.notes
    const map = new Map<string, NoteRef[]>()
    for (const note of filtered) {
      const g = groupOf(note.path)
      map.set(g, [...(map.get(g) ?? []), note])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [index.notes, tag])

  // Wikilinks are plain anchors in the rendered HTML; catch their clicks here.
  const onBodyClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a.wl') as HTMLElement | null
    const path = anchor?.dataset.path
    if (!path) return
    e.preventDefault()
    open(path)
  }

  return (
    <div className="notas">
      <div>
        <input
          className="note-search"
          type="text"
          value={query}
          placeholder={es.buscar}
          onChange={(e) => setQuery(e.target.value)}
        />

        {!hits && index.tags.length > 0 && (
          <div className="tag-cloud">
            {index.tags.slice(0, 14).map((t) => (
              <button
                key={t.tag}
                aria-pressed={tag === t.tag}
                onClick={() => setTag(tag === t.tag ? null : t.tag)}
              >
                #{t.tag} {t.count}
              </button>
            ))}
          </div>
        )}

        {hits ? (
          <div className="note-group">
            <div className="group-label">
              {hits.length} {hits.length === 1 ? es.resultado : es.resultados}
            </div>
            <div className="note-list">
              {hits.map((h) => (
                <button key={h.path} aria-pressed={current?.path === h.path} onClick={() => open(h.path)}>
                  {h.title}
                  {h.excerpt && <span className="hit-excerpt">{h.excerpt}</span>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          groups.map(([group, notes]) => (
            <div className="note-group" key={group}>
              <div className="group-label">{group}</div>
              <div className="note-list">
                {notes.map((n) => (
                  <button key={n.path} aria-pressed={current?.path === n.path} onClick={() => open(n.path)}>
                    {n.title}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="reader">
        {current ? (
          <>
            <div className="reader-head">
              {current.tags.map((t) => (
                <span key={t} className="chip">
                  #{t}
                </span>
              ))}
              <span className="reader-path">{current.path}</span>
            </div>
            <div
              className="reader-body"
              ref={bodyRef}
              onClick={onBodyClick}
              dangerouslySetInnerHTML={{ __html: current.html }}
            />
          </>
        ) : (
          <p className="muted">{es.eligeNota}</p>
        )}
      </div>

      <div className="backlinks">
        <h3>{es.enlazanAqui}</h3>
        {current && current.backlinks.length > 0 ? (
          <div className="note-list">
            {current.backlinks.map((b) => (
              <button key={b.path} onClick={() => open(b.path)}>
                {b.title}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            {es.sinEnlaces}
          </p>
        )}
      </div>
    </div>
  )
}
