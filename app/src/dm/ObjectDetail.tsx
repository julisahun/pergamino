/** The full text of an object, opened on demand rather than always expanded. */
import { useEffect } from 'react'
import type { GameObject } from '../../../shared/types.ts'
import { es } from '../strings/es.ts'

export function ObjectDetail({
  object,
  holder,
  uses,
  onRefill,
  onClose,
}: {
  object: GameObject
  holder: string | null
  uses: { uses: number; spent: boolean } | undefined
  onRefill?: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const remaining = uses?.uses ?? object.usos

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2>{object.name}</h2>
            <div className="sub">
              {[
                uses?.spent ? es.destruido : holder ?? es.nadieLoLleva,
                object.mods.ac ? `${es.ca} +${object.mods.ac}` : null,
                object.usos !== undefined ? `${remaining}/${object.usos} ${es.usos}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {uses?.spent && onRefill && (
            <button onClick={onRefill}>{es.recargar}</button>
          )}
          <button onClick={onClose}>{es.cerrar}</button>
        </div>

        <p className="obj-desc">{object.description}</p>

        {object.effects.length > 0 && (
          <>
            <h3 className="section-title" style={{ marginTop: 18 }}>
              {es.efectos}
            </h3>
            <ul>
              {object.effects.map((eff, i) => (
                <li key={i}>{eff}</li>
              ))}
            </ul>
          </>
        )}

        <p className="reader-path" style={{ marginTop: 16 }}>
          {object.file}
        </p>
      </div>
    </div>
  )
}
