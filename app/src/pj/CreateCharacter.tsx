import { useState } from 'react'
import { isFc5Sheet, parseSheet, type SheetStats } from '../../../shared/vault/sheet.ts'
import { es } from '../strings/es.ts'
import { usePj } from '../state/pjStore.ts'

/** Upload a `-fc5.xml`; the sheet is read here first so the name can be shown before it is sent. */
export function CreateCharacter() {
  const { create, cancelCreate, busy, error } = usePj()
  const [player, setPlayer] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<SheetStats | null>(null)
  const [bad, setBad] = useState(false)

  const pick = async (f: File | null) => {
    setFile(f)
    setPreview(null)
    setBad(false)
    if (!f) return
    const xml = await f.text()
    if (!isFc5Sheet(xml)) {
      setBad(true)
      return
    }
    setPreview(parseSheet(xml))
  }

  return (
    <div className="pj-page">
      <header className="pj-top">
        <h1>{es.crearPersonaje}</h1>
        <p className="muted">{es.crearPersonajeAyuda}</p>
      </header>
      <form
        className="pj-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (file && !bad) void create(file, player)
        }}
      >
        <label>
          <span>{es.tuNombre}</span>
          <input type="text" value={player} onChange={(e) => setPlayer(e.target.value)} autoComplete="name" />
        </label>
        <label>
          <span>{es.fichaFc5}</span>
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={(e) => void pick(e.target.files?.[0] ?? null)}
          />
        </label>
        {bad && <p className="pj-error">{es.fichaNoValida}</p>}
        {preview && (
          <div className="pj-card">
            <b>{preview.name ?? '—'}</b>
            <div className="muted small">
              {[preview.race, preview.className, preview.level !== null ? `${es.nivel} ${preview.level}` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {preview.summary && <div className="muted small">{preview.summary}</div>}
          </div>
        )}
        {error && <p className="pj-error">{error}</p>}
        <div className="pj-actions">
          <button type="button" onClick={cancelCreate}>
            {es.volver}
          </button>
          <button className="primary big" type="submit" disabled={!file || bad || busy}>
            {busy ? es.subiendo : es.crear}
          </button>
        </div>
      </form>
    </div>
  )
}
