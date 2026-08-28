/**
 * Closing the session: the bitácora note and the estado.md deviations, both
 * shown in full before anything is written.
 */
import { useCallback, useEffect, useState } from 'react'
import { es } from '../strings/es.ts'
import { useDm, type CloseDraft } from '../state/dmStore.ts'

const KIND_LABEL: Record<string, string> = {
  scene: 'escena',
  damage: 'daño',
  heal: 'curación',
  death: 'muerte',
  loot: 'botín',
  condition: 'estado',
  encounter: 'combate',
  rest: 'descanso',
  note: 'nota',
}

export function SesionPanel() {
  const { mesa, state, closeDraft, previewEstado, commitClose } = useDm()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draft, setDraft] = useState<CloseDraft | null>(null)
  const [content, setContent] = useState('')
  const [filename, setFilename] = useState('')
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [estadoPreview, setEstadoPreview] = useState('')
  const [result, setResult] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await closeDraft(date)
    if (!data) return
    setDraft(data)
    setContent(data.bitacora.content)
    setFilename(data.bitacora.filename)
    setChosen(new Set(data.deviations.map((_, i) => i)))
    setEstadoPreview(data.estadoPreview)
    setResult(null)
    setError(null)
  }, [date, closeDraft])

  useEffect(() => {
    void load()
  }, [load, mesa])

  // Re-render the estado.md preview whenever the selection changes.
  useEffect(() => {
    if (!draft) return
    let live = true
    const deviations = draft.deviations.filter((_, i) => chosen.has(i))
    void previewEstado(deviations).then((content) => {
      if (live) setEstadoPreview(content)
    })
    return () => {
      live = false
    }
  }, [draft, chosen, previewEstado])

  const commit = async () => {
    setError(null)
    const data = await commitClose(filename, content, chosen.size > 0 ? estadoPreview : null)
    if (data.error) setError(data.error)
    else setResult(data.written ?? [])
  }

  if (!draft || !state) return <div className="panel muted">…</div>

  const bySection = new Map<string, { d: (typeof draft.deviations)[number]; i: number }[]>()
  draft.deviations.forEach((d, i) => {
    bySection.set(d.section, [...(bySection.get(d.section) ?? []), { d, i }])
  })

  return (
    <div className="sesion">
      <div>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted">{es.fecha}</span>
            <input
              type="text"
              value={date}
              size={11}
              onChange={(e) => setDate(e.target.value)}
              onBlur={() => void load()}
            />
          </label>
          <label className="row" style={{ gap: 6, flex: 1 }}>
            <span className="muted">{es.nombreFichero}</span>
            <input
              type="text"
              value={filename}
              style={{ flex: 1 }}
              onChange={(e) => setFilename(e.target.value)}
            />
          </label>
        </div>

        <h2 className="section-title">{es.bitacora}</h2>
        <textarea className="draft" value={content} onChange={(e) => setContent(e.target.value)} />

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={() => void commit()} disabled={!filename || !content}>
            {es.escribir}
          </button>
          <span className="muted">{es.avisoEscritura}</span>
        </div>
        <p className="muted small">{es.avisoObsidian}</p>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {result && (
          <div className="card" style={{ marginTop: 12 }}>
            <h3>{es.escrito}</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.map((p) => (
                <li key={p} className="muted" style={{ fontSize: 12 }}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="side">
        <section className="card">
          <h3>{es.desviaciones}</h3>
          {draft.deviations.length === 0 ? (
            <p className="muted">{es.sinDesviaciones}</p>
          ) : (
            <div className="dev-list">
              {[...bySection.entries()].map(([section, items]) => (
                <div key={section}>
                  {items.map(({ d, i }) => (
                    <div className="dev-item" key={i}>
                      <input
                        type="checkbox"
                        id={`dev-${i}`}
                        checked={chosen.has(i)}
                        onChange={(e) => {
                          const next = new Set(chosen)
                          if (e.target.checked) next.add(i)
                          else next.delete(i)
                          setChosen(next)
                        }}
                      />
                      <span className="dev-section">{section}</span>
                      <label htmlFor={`dev-${i}`}>{d.text}</label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {draft.deviations.length > 0 && (
          <section className="card">
            <h3>{es.vistaPrevia}</h3>
            <textarea
              className="preview"
              value={estadoPreview}
              onChange={(e) => setEstadoPreview(e.target.value)}
            />
          </section>
        )}

        <section className="card">
          <h3>{es.registro}</h3>
          {state.log.length === 0 ? (
            <p className="muted">{es.sinRegistro}</p>
          ) : (
            <div className="log-list">
              {[...state.log].reverse().map((entry, i) => (
                <div className="log-entry" key={i}>
                  <span className={`log-kind ${entry.kind}`}>
                    {KIND_LABEL[entry.kind] ?? entry.kind}
                  </span>
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
