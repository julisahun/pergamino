/**
 * Who else is in this scene, from one button.
 *
 * Three sources in one list, because from the DM's side they are one
 * question, even though the app answers them differently: a PC is already in
 * `state.play` and only needs a ficha, a PNJ already instantiated needs the
 * same, and a PNJ still in `pnj/*.md` has to be minted first — which now
 * places it too, so that being in the session and being on the table are the
 * same fact. The rows say which is which; the button says «Añadir» either
 * way.
 *
 * It stays open after adding, because a scene is usually more than one thing.
 */
import { useMemo, useState } from 'react'
import type { Pnj, Ref } from '../../../shared/types.ts'
import { isCombatant } from '../../../shared/vault/campaign.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { Face } from './Face.tsx'
import type { Combatant } from './combat.ts'

export function AddToTable({
  all,
  onBoard,
  onClose,
}: {
  /** Everyone already in the session, PC and PNJ alike. */
  all: Combatant[]
  onBoard: (ref: Ref) => boolean
  onClose: () => void
}) {
  const { pnjs, dispatch } = useDm()
  const [query, setQuery] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})

  const q = query.trim().toLowerCase()
  const hit = (name: string) => !q || name.toLowerCase().includes(q)

  const waiting = useMemo(() => all.filter((c) => !onBoard(c.ref)), [all, onBoard])
  const pcs = waiting.filter((c) => c.ref.startsWith('pc:') && hit(c.name))
  const npcs = waiting.filter((c) => c.ref.startsWith('npc:') && hit(c.name))
  const catalogue = useMemo(
    () => pnjs.filter(isCombatant).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [pnjs],
  )
  const fromCampaign = catalogue.filter((m) => hit(m.name) || hit(m.tag ?? ''))

  const place = (ref: Ref) => dispatch({ type: 'token/place', ref })

  const summon = (pnj: Pnj) => {
    // One action: `npc/add` mints the copies and gives each a ficha, because
    // a PNJ in the session with no ficha would be in no list at all.
    dispatch({ type: 'npc/add', pnjId: pnj.id, count: Math.max(1, counts[pnj.id] ?? 1) })
    setCounts((c) => ({ ...c, [pnj.id]: 1 }))
  }

  const nothing = pcs.length === 0 && npcs.length === 0 && fromCampaign.length === 0

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2>{es.anadirALaMesa}</h2>
            <div className="sub">{es.anadirALaMesaAyuda}</div>
          </div>
          <button onClick={onClose}>{es.listo}</button>
        </div>

        <input
          className="note-search"
          type="text"
          value={query}
          placeholder={es.buscarCombatiente}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        <div className="add-list">
          {pcs.length > 0 && <div className="group-label">{es.party}</div>}
          {pcs.map((c) => (
            <div className="add-row" key={c.ref}>
              <Face src={c.portrait} name={c.name} className="irow-face" />
              <span className="add-name">{c.name}</span>
              <button className="mini" onClick={() => place(c.ref)}>
                {es.anadir}
              </button>
            </div>
          ))}

          {npcs.length > 0 && <div className="group-label">{es.yaEnLaMesa}</div>}
          {npcs.map((c) => (
            <div className="add-row" key={c.ref}>
              <Face src={c.portrait} name={c.name} className="irow-face" />
              <span className="add-name">{c.name}</span>
              <button className="mini" onClick={() => place(c.ref)}>
                {es.anadir}
              </button>
            </div>
          ))}

          {fromCampaign.length > 0 && <div className="group-label">{es.pnjDeLaCampana}</div>}
          {fromCampaign.map((m) => (
            <div className="add-row" key={m.id}>
              <Face src={m.hasPortrait ? `/api/portrait/npc/${m.id}` : null} name={m.name} className="irow-face" />
              <span className="add-name">
                {m.name}
                {m.tag && <span className="muted"> · {m.tag}</span>}
              </span>
              <input
                className="hp-input"
                value={counts[m.id] ?? 1}
                inputMode="numeric"
                title={es.cuantos}
                onChange={(e) =>
                  setCounts((c) => ({
                    ...c,
                    [m.id]: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1),
                  }))
                }
              />
              <button className="mini" onClick={() => summon(m)}>
                {es.anadir}
              </button>
            </div>
          ))}

          {nothing && <p className="muted">{es.sinResultados}</p>}
        </div>
      </div>
    </div>
  )
}
