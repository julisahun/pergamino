/**
 * The campaign's objects, all of them.
 *
 * Party shows what each PC is carrying; this shows what *exists* — including
 * the ones nobody holds and the ones already spent, which fell out of every
 * list before. Handing an item out lives here now, so the Party screen can go
 * back to being about the party.
 *
 * A tile is deliberately thin — name, holder, charges — because a campaign's
 * shelf is long and the DM is looking for one thing on it. The prose, the
 * effects and the handing over are in the sheet, one click away, which is the
 * same sheet Party opens.
 */
import { useMemo, useState } from 'react'
import type { GameObject } from '../../../shared/types.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { ObjectDetail } from './ObjectDetail.tsx'
import { artIndex, combatants, pcSheets, type Combatant } from './combat.ts'

export function ObjetosPanel() {
  const { objects, pnjs, characters, sheets, state, dispatch } = useDm()
  const [query, setQuery] = useState('')
  const [onlyFree, setOnlyFree] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)

  const art = useMemo(() => artIndex(pnjs), [pnjs])
  const pcs = useMemo(() => pcSheets(characters, sheets), [characters, sheets])
  const everyone = useMemo(
    () => (state ? combatants(state, pcs, art) : []),
    [state, pcs, art],
  )

  const holderOf = (id: string): Combatant | undefined =>
    everyone.find((c) => c.live.objects.includes(id))

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byText = q
      ? objects.filter((o) =>
          [o.name, o.description, ...o.effects].join(' ').toLowerCase().includes(q),
        )
      : objects
    return [...byText].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [objects, query])

  const shown = onlyFree ? found.filter((o) => !holderOf(o.id)) : found

  // Looked up rather than stashed, so giving the object away from inside the
  // sheet redraws the sheet.
  const open = detail ? objects.find((o) => o.id === detail) ?? null : null
  const openHolder = open ? holderOf(open.id) ?? null : null

  if (objects.length === 0) return <div className="panel muted">{es.sinObjetosCampana}</div>

  return (
    <div className="catalogo-ancho">
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="note-search cat-search"
          type="text"
          value={query}
          placeholder={es.buscarObjeto}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button aria-pressed={onlyFree} onClick={() => setOnlyFree((v) => !v)}>
          {es.soloSinRepartir}
        </button>
        <span className="muted">
          {shown.length}/{objects.length}
        </span>
      </div>

      {shown.length === 0 && <p className="muted">{es.sinResultados}</p>}

      <div className="obj-grid">
        {shown.map((o) => (
          <ObjectTile
            key={o.id}
            object={o}
            holder={holderOf(o.id) ?? null}
            uses={state?.objects[o.id]}
            onOpen={() => setDetail(o.id)}
          />
        ))}
      </div>

      {open && (
        <ObjectDetail
          object={open}
          holder={openHolder?.name ?? null}
          uses={state?.objects[open.id]}
          actions={{
            everyone,
            holderRef: openHolder?.ref ?? null,
            onGive: (ref) => dispatch({ type: 'object/give', ref, objectId: open.id }),
            onTake: (ref) => dispatch({ type: 'object/take', ref, objectId: open.id }),
          }}
          onCharges={(uses) => dispatch({ type: 'object/charges', objectId: open.id, uses })}
          onRefill={() => dispatch({ type: 'object/refill', objectId: open.id })}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

function ObjectTile({
  object,
  holder,
  uses,
  onOpen,
}: {
  object: GameObject
  holder: Combatant | null
  uses: { uses: number; spent: boolean } | undefined
  onOpen: () => void
}) {
  const spent = uses?.spent ?? false
  const remaining = uses?.uses ?? object.usos

  return (
    <button className={`obj-tile${spent ? ' spent' : ''}`} title={object.name} onClick={onOpen}>
      <span className="obj-tile-name">{object.name}</span>
      <span className="holder">
        {[
          spent ? es.destruido : holder ? `${es.lleva}: ${holder.name}` : es.nadieLoLleva,
          object.mods.ac ? `${es.ca} +${object.mods.ac}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {object.usos !== undefined && (
        <span className="uses" title={`${remaining}/${object.usos} ${es.usos}`}>
          {Array.from({ length: object.usos }, (_, i) => (
            <span key={i} className={`use-pip${i < (remaining ?? 0) ? ' on' : ''}`} />
          ))}
        </span>
      )}
    </button>
  )
}
