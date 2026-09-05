/**
 * What changes in a fight, always on screen: hit points with a way to lose
 * and gain them, temporary points, conditions, and — at zero — death saves.
 */
import { useState } from 'react'
import { CONDITIONS } from '../../../shared/conditions.ts'
import type { PlayerView } from '../../../shared/session/player.ts'
import { makeRef } from '../../../shared/types.ts'
import { es } from '../strings/es.ts'
import { usePj } from '../state/pjStore.ts'
import { Face } from './ui/Face.tsx'

export function HpHeader({
  view,
  disabled,
  onMenu,
}: {
  view: PlayerView
  disabled: boolean
  onMenu: () => void
}) {
  const dispatch = usePj((s) => s.dispatch)
  const [amount, setAmount] = useState('')
  const [conditions, setConditions] = useState(false)
  const ref = makeRef('pc', view.pc.id)
  const { live, sheet } = view
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0
  const down = live.hp !== null && live.hp <= 0

  const apply = (sign: 1 | -1) => {
    if (!valid) return
    dispatch(
      sign === -1 ? { type: 'hp/damage', ref, amount: n } : { type: 'hp/heal', ref, amount: n },
    )
    setAmount('')
  }

  return (
    <header className="pj-head">
      <div className="pj-head-row">
        <Face src={view.pc.portrait} name={view.pc.name} size={48} />
        <div className="pj-head-name">
          <h1>{view.pc.name}</h1>
          <div className="muted small">{sheet.summary ?? [sheet.race, sheet.className].filter(Boolean).join(' ')}</div>
        </div>
        <button className="pj-icon" aria-label={es.ajustes} onClick={onMenu}>
          ⋯
        </button>
      </div>

      <div className="pj-hp-row">
        <div className="pj-hp">
          <span className="pj-hp-now">{live.hp ?? '—'}</span>
          <span className="pj-hp-max">/ {sheet.hpMax ?? '—'}</span>
          {live.temp > 0 && <span className="pj-hp-temp">+{live.temp}</span>}
        </div>
        <div className="pj-hp-controls">
          <button className="pj-big danger" disabled={disabled || !valid} onClick={() => apply(-1)}>
            −
          </button>
          <input
            className="pj-amount"
            inputMode="numeric"
            placeholder="—"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            disabled={disabled}
          />
          <button className="pj-big ok" disabled={disabled || !valid} onClick={() => apply(1)}>
            +
          </button>
        </div>
      </div>

      <div className="pj-chips">
        {live.conditions.map((c) => (
          <button
            key={c}
            className="pj-chip on"
            disabled={disabled}
            onClick={() => dispatch({ type: 'condition/toggle', ref, condition: c })}
          >
            {c} ✕
          </button>
        ))}
        <button className="pj-chip" disabled={disabled} onClick={() => setConditions((v) => !v)}>
          {live.conditions.length ? '+' : es.estados}
        </button>
        {live.temp > 0 && (
          <button className="pj-chip" disabled={disabled} onClick={() => dispatch({ type: 'hp/temp', ref, temp: 0 })}>
            {es.temporales} {live.temp} ✕
          </button>
        )}
      </div>
      {conditions && (
        <div className="pj-chips pj-chips-all">
          {CONDITIONS.filter((c) => !live.conditions.includes(c)).map((c) => (
            <button
              key={c}
              className="pj-chip"
              disabled={disabled}
              onClick={() => {
                dispatch({ type: 'condition/toggle', ref, condition: c })
                setConditions(false)
              }}
            >
              {c}
            </button>
          ))}
          <button
            className="pj-chip"
            disabled={disabled || !valid}
            onClick={() => {
              dispatch({ type: 'hp/temp', ref, temp: n })
              setAmount('')
              setConditions(false)
            }}
          >
            {es.temporales} +{valid ? n : '…'}
          </button>
        </div>
      )}

      {down && (
        <div className="pj-death">
          <span className="muted small">{es.salvacionesMuerte}</span>
          <span>{es.exito}</span>
          {[0, 1, 2].map((i) => (
            <button
              key={`ok${i}`}
              className={`pj-pip${i < live.death.ok ? ' spent ok' : ''}`}
              disabled={disabled}
              onClick={() => dispatch({ type: 'death/mark', ref, outcome: 'ok' })}
            />
          ))}
          <span>{es.fallo}</span>
          {[0, 1, 2].map((i) => (
            <button
              key={`ko${i}`}
              className={`pj-pip${i < live.death.fail ? ' spent bad' : ''}`}
              disabled={disabled}
              onClick={() => dispatch({ type: 'death/mark', ref, outcome: 'fail' })}
            />
          ))}
          <button className="pj-chip" disabled={disabled} onClick={() => dispatch({ type: 'death/reset', ref })}>
            ↺
          </button>
        </div>
      )}
    </header>
  )
}
