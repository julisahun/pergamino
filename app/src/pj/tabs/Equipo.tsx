import type { PlayerView } from '../../../../shared/session/player.ts'
import { makeRef } from '../../../../shared/types.ts'
import { useDraft } from '../../dm/useDraft.ts'
import { es } from '../../strings/es.ts'
import { usePj } from '../../state/pjStore.ts'
import { Expandable } from '../ui/Expandable.tsx'
import { Pips } from '../ui/Pips.tsx'

const SLOT: Record<string, string> = { weapon: 'en mano', shield: 'escudo', armor: 'puesta' }

/** Gold and inventory to edit, the campaign's objects with their charges, and the sheet's own items. */
export function Equipo({ view, disabled }: { view: PlayerView; disabled: boolean }) {
  const dispatch = usePj((s) => s.dispatch)
  const ref = makeRef('pc', view.pc.id)
  const { sheet, live, objects } = view
  const gold = useDraft(live.gold, (t) =>
    dispatch({ type: 'gold/set', ref, gold: Number(t.replace(/\D/g, '')) || 0 }),
  )
  const { onKeyDown: _enter, ...inventory } = useDraft(live.inventory, (t) =>
    dispatch({ type: 'inventory/set', ref, text: t }),
  )

  return (
    <>
      <div className="pj-field">
        <span>{es.oro}</span>
        <input className="pj-input" inputMode="numeric" disabled={disabled} {...gold} />
        <span className="muted">po</span>
        {sheet.money !== null && (
          <span className="muted small">
            ({es.monedas}: {sheet.money})
          </span>
        )}
      </div>

      {objects.length > 0 && (
        <>
          <h3>{es.llevas}</h3>
          {objects.map((o) => (
            <Expandable
              key={o.id}
              title={o.name}
              meta={o.uses ? `${o.uses.left}/${o.uses.total} ${es.cargas.toLowerCase()}` : undefined}
            >
              {o.uses && (
                <div className="pj-field">
                  <span>{es.cargas}</span>
                  <Pips
                    total={o.uses.total}
                    used={o.uses.total - o.uses.left}
                    label={o.name}
                    onChange={(used) =>
                      !disabled && dispatch({ type: 'object/charges', objectId: o.id, uses: o.uses!.total - used })
                    }
                  />
                </div>
              )}
              {o.mods.ac !== undefined && (
                <p className="muted small">
                  {es.ca} +{o.mods.ac}
                </p>
              )}
              <ul>
                {o.effects.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Expandable>
          ))}
        </>
      )}

      <h3>{es.equipoTab}</h3>
      {sheet.items.length === 0 && <p className="muted">{es.sinEquipo}</p>}
      <ul className="pj-list">
        {sheet.items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="pj-row">
            <span className="pj-row-title">
              {it.name}
              {it.quantity > 1 && <span className="muted"> ×{it.quantity}</span>}
              {it.equipped && <span className="pj-tag">{SLOT[it.equipped]}</span>}
            </span>
            <span className="pj-row-meta muted small">
              {[it.ac !== null ? `${es.ca} ${it.ac}` : null, it.damage, it.weight !== null ? `${it.weight} lb` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>

      <h3>{es.inventario}</h3>
      <textarea className="pj-textarea" placeholder={es.sinObjetos} disabled={disabled} {...inventory} />
    </>
  )
}
