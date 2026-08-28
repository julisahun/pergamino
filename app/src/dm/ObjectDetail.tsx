/** The full text of an object, opened on demand rather than always expanded. */
import { useEffect } from 'react'
import type { GameObject, Ref } from '../../../shared/types.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { Charges } from './Charges.tsx'
import type { Combatant } from './combat.ts'

/**
 * Handing the object around, for the callers that own that. Party opens this
 * sheet from a PC who is already carrying the thing and has no use for it;
 * Objetos is the screen where objects change hands, so it passes the lot.
 */
export interface ObjectActions {
  everyone: Combatant[]
  holderRef: Ref | null
  onGive: (ref: Ref) => void
  onTake: (ref: Ref) => void
}

export function ObjectDetail({
  object,
  holder,
  uses,
  actions,
  onCharges,
  onRefill,
  onClose,
}: {
  object: GameObject
  holder: string | null
  uses: { uses: number; spent: boolean } | undefined
  actions?: ObjectActions
  onCharges?: (uses: number) => void
  onRefill?: () => void
  onClose: () => void
}) {
  const { openNote } = useDm()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const remaining = uses?.uses ?? object.usos
  const spent = uses?.spent ?? false
  // Pulled out of `actions` so the callbacks below narrow with it.
  const heldBy = actions?.holderRef ?? null
  const charges = object.usos !== undefined && onCharges && (
    <Charges total={object.usos} left={remaining ?? 0} onSet={onCharges} />
  )

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2>{object.name}</h2>
            <div className="sub">
              {[
                spent ? es.destruido : holder ? `${es.lleva}: ${holder}` : es.nadieLoLleva,
                object.mods.ac ? `${es.ca} +${object.mods.ac}` : null,
                object.usos !== undefined ? `${remaining}/${object.usos} ${es.usos}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {spent && onRefill && <button onClick={onRefill}>{es.recargar}</button>}
          <button onClick={onClose}>{es.cerrar}</button>
        </div>

        {(charges || actions) && (
          <div className="row sheet-actions">
            {charges}
            {actions && (
              <>
                <select
                  value=""
                  disabled={actions.everyone.length === 0}
                  onChange={(e) => e.target.value && actions.onGive(e.target.value as Ref)}
                >
                  <option value="">{es.dar}</option>
                  {actions.everyone
                    .filter((c) => c.ref !== heldBy)
                    .map((c) => (
                      <option key={c.ref} value={c.ref}>
                        {c.name}
                      </option>
                    ))}
                </select>
                {heldBy && (
                  <button className="mini" onClick={() => actions.onTake(heldBy)}>
                    {es.quitar}
                  </button>
                )}
              </>
            )}
          </div>
        )}

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

        {/* `file` is the object's own note; the description above is its
            opening paragraph, so there is more of it one click away. */}
        <button
          className="mini"
          style={{ marginTop: 16 }}
          onClick={() => {
            openNote(object.file)
            onClose()
          }}
        >
          {es.verNota} →
        </button>
        <p className="reader-path" style={{ marginTop: 8 }}>
          {object.file}
        </p>
      </div>
    </div>
  )
}
