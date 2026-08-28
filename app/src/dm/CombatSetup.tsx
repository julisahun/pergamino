/**
 * Who is in the fight, and what they rolled.
 *
 * «Iniciar combate» used to sweep everyone at the table into the encounter
 * and roll d20 for the PNJ. Both were the app deciding something the table
 * had already decided out loud, so it asks instead — everyone at the table,
 * ticked, and you untick whoever is watching rather than fighting.
 *
 * Every initiative box starts empty. The die beside each one is there for the
 * PNJ nobody is going to roll by hand, and it fires only when clicked.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from '../../../shared/types.ts'
import { es } from '../strings/es.ts'
import { Face } from './Face.tsx'
import type { Combatant } from './combat.ts'

const d20 = () => 1 + Math.floor(Math.random() * 20)

export function CombatSetup({
  all,
  onStart,
  onClose,
}: {
  all: Combatant[]
  onStart: (members: Ref[], init: Record<string, number>) => void
  onClose: () => void
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(all.map((c) => c.ref)))
  const [init, setInit] = useState<Record<string, string>>({})
  const boxes = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Party first, then PNJ — the order the DM reads them off the table in.
  const rows = useMemo(
    () =>
      [...all].sort(
        (a, b) =>
          Number(a.ref.startsWith('npc:')) - Number(b.ref.startsWith('npc:')) ||
          a.name.localeCompare(b.name, 'es'),
      ),
    [all],
  )

  const toggle = (ref: Ref) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })

  const setAll = (on: boolean) =>
    setChosen(on ? new Set(all.map((c) => c.ref)) : new Set())

  const rollInto = (c: Combatant) =>
    setInit((prev) => ({ ...prev, [c.ref]: String(d20() + c.initMod) }))

  const rollNpcs = () =>
    setInit((prev) => {
      const next = { ...prev }
      for (const c of rows) {
        if (c.ref.startsWith('npc:') && chosen.has(c.ref)) {
          next[c.ref] = String(d20() + c.initMod)
        }
      }
      return next
    })

  /** Enter walks down the chosen rows rather than submitting the sheet. */
  const nextBox = (from: Ref) => {
    const list = rows.filter((c) => chosen.has(c.ref))
    const i = list.findIndex((c) => c.ref === from)
    const target = list[i + 1]
    if (target) boxes.current[target.ref]?.focus()
  }

  const start = () => {
    const members = rows.filter((c) => chosen.has(c.ref)).map((c) => c.ref)
    if (members.length === 0) return
    const values: Record<string, number> = {}
    for (const ref of members) {
      const n = Number(init[ref])
      if (init[ref]?.trim() && Number.isFinite(n)) values[ref] = n
    }
    onStart(members, values)
  }

  const missing = rows.filter((c) => chosen.has(c.ref) && !init[c.ref]?.trim()).length

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2>{es.quienCombate}</h2>
            <div className="sub">{es.quienCombateAyuda}</div>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 10 }}>
          <button className="mini" onClick={() => setAll(true)}>{es.todos}</button>
          <button className="mini" onClick={() => setAll(false)}>{es.ninguno}</button>
          <button className="mini" onClick={rollNpcs}>🎲 {es.tirarPorLosPnj}</button>
        </div>

        <div className="setup-list">
          {rows.map((c) => {
            return (
              <div key={c.ref}>
                <label className={`setup-row${chosen.has(c.ref) ? ' in' : ''}`}>
                  <input
                    type="checkbox"
                    checked={chosen.has(c.ref)}
                    onChange={() => toggle(c.ref)}
                  />
                  <Face src={c.portrait} name={c.name} className="irow-face" />
                  <span className="setup-name">{c.name}</span>
                  <input
                    className="hp-input"
                    ref={(el) => {
                      boxes.current[c.ref] = el
                    }}
                    value={init[c.ref] ?? ''}
                    placeholder="–"
                    inputMode="numeric"
                    disabled={!chosen.has(c.ref)}
                    title={es.iniciativaLarga}
                    onChange={(e) =>
                      setInit((prev) => ({
                        ...prev,
                        [c.ref]: e.target.value.replace(/[^0-9-]/g, ''),
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        nextBox(c.ref)
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="mini"
                    disabled={!chosen.has(c.ref)}
                    title={`d20 ${c.initMod >= 0 ? '+' : ''}${c.initMod}`}
                    onClick={() => rollInto(c)}
                  >
                    🎲
                  </button>
                </label>
              </div>
            )
          })}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          {missing > 0 && <span className="muted">{es.faltaIniciativa}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose}>{es.cancelar}</button>
          <button
            className="primary"
            disabled={chosen.size === 0}
            onClick={start}
          >
            {es.empezar}
          </button>
        </div>
      </div>
    </div>
  )
}
