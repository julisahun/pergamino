/**
 * The campaign's objects, all of them.
 *
 * Party shows what each PC is carrying; this shows what *exists* — including
 * the ones nobody holds and the ones already spent, which fell out of every
 * list before. Handing an item out lives here now, so the Party screen can go
 * back to being about the party.
 */
import { useMemo, useState } from 'react'
import type { GameObject, Ref } from '../../../shared/types.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { artIndex, combatants, type Combatant } from './combat.ts'

export function ObjetosPanel() {
  const { objects, pnjs, characters, sheets, state, dispatch, openNote } = useDm()
  const [query, setQuery] = useState('')
  const [onlyFree, setOnlyFree] = useState(false)

  const art = useMemo(() => artIndex(pnjs), [pnjs])
  const pcs = useMemo(
    () =>
      characters.map((c) => ({
        id: c.id,
        name: c.name || c.id,
        hpMax: sheets[c.id]?.hpMax ?? null,
        initMod: sheets[c.id]?.initMod ?? 0,
        hasPortrait: Boolean(c.portrait?.stamp || c.portrait?.src),
      })),
    [characters, sheets],
  )
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
          <ObjectCard
            key={o.id}
            object={o}
            holder={holderOf(o.id) ?? null}
            everyone={everyone}
            uses={state?.objects[o.id]}
            onGive={(ref) => dispatch({ type: 'object/give', ref, objectId: o.id })}
            onTake={(ref) => dispatch({ type: 'object/take', ref, objectId: o.id })}
            onUse={(ref) => dispatch({ type: 'object/use', ref, objectId: o.id })}
            onRefill={() => dispatch({ type: 'object/refill', objectId: o.id })}
            onNote={() => openNote(o.file)}
          />
        ))}
      </div>
    </div>
  )
}

function ObjectCard({
  object,
  holder,
  everyone,
  uses,
  onGive,
  onTake,
  onUse,
  onRefill,
  onNote,
}: {
  object: GameObject
  holder: Combatant | null
  everyone: Combatant[]
  uses: { uses: number; spent: boolean } | undefined
  onGive: (ref: Ref) => void
  onTake: (ref: Ref) => void
  onUse: (ref: Ref) => void
  onRefill: () => void
  onNote: () => void
}) {
  const spent = uses?.spent ?? false
  const remaining = uses?.uses ?? object.usos

  return (
    <div className={`obj-card${spent ? ' spent' : ''}`}>
      <h4>{object.name}</h4>
      <div className="holder">
        {[
          spent ? es.destruido : holder ? `${es.lleva}: ${holder.name}` : es.nadieLoLleva,
          object.mods.ac ? `${es.ca} +${object.mods.ac}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {object.usos !== undefined && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="uses" title={`${remaining}/${object.usos} ${es.usos}`}>
            {Array.from({ length: object.usos }, (_, i) => (
              <span key={i} className={`use-pip${i < (remaining ?? 0) ? ' on' : ''}`} />
            ))}
          </span>
          {holder && (
            <button className="mini" onClick={() => onUse(holder.ref)}>
              {es.usar}
            </button>
          )}
          {spent && (
            <button className="mini" onClick={onRefill}>
              {es.recargar}
            </button>
          )}
        </div>
      )}

      {object.description && <p className="obj-desc">{object.description}</p>}

      {object.effects.length > 0 && (
        <ul>
          {object.effects.map((eff, i) => (
            <li key={i}>{eff}</li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <select
          value=""
          disabled={everyone.length === 0}
          onChange={(e) => e.target.value && onGive(e.target.value as Ref)}
        >
          <option value="">{es.dar}</option>
          {everyone
            .filter((c) => c.ref !== holder?.ref)
            .map((c) => (
              <option key={c.ref} value={c.ref}>
                {c.name}
              </option>
            ))}
        </select>
        {holder && (
          <button className="mini" title={`${es.quitarA} ${holder.name}`} onClick={() => onTake(holder.ref)}>
            {es.quitar}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="mini" onClick={onNote}>
          {es.verNota} →
        </button>
      </div>
    </div>
  )
}
