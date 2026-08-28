/**
 * Turn order beside the board, so a fight needs no tab flipping: whose turn it
 * is, how hurt everyone is, and damage — all one click away. The stat block
 * slides in over the rail when you pick someone.
 */
import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Ref, RevealState } from '../../../shared/types.ts'
import { CONDITION_SHORT } from '../../../shared/conditions.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { Face } from './Face.tsx'
import { CombatantDetail } from './CombatantDetail.tsx'
import { artIndex, combatants, isDead, isDown, orderByInit, type Combatant } from './combat.ts'

const PC_DEFAULT: RevealState = { on: true, hp: 'exact' }
const NPC_DEFAULT: RevealState = { on: false, hp: 'none' }
const HP_CYCLE = ['none', 'bar', 'exact'] as const
const HP_LABEL: Record<string, string> = { none: '—', bar: '▤', exact: '#' }

/** A control's click must not also open the row's stat block. */
const stop = (fn: () => void) => (e: ReactMouseEvent) => {
  e.stopPropagation()
  fn()
}

function RailRow({
  c,
  reveal,
  init,
  active,
  inEncounter,
  showInit,
  onSelect,
}: {
  c: Combatant
  reveal: RevealState
  init: number | undefined
  active: boolean
  inEncounter: boolean
  showInit: boolean
  onSelect: () => void
}) {
  const dispatch = useDm((s) => s.dispatch)
  const [amount, setAmount] = useState('')

  const apply = (sign: 1 | -1) => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return
    dispatch(
      sign === -1
        ? { type: 'hp/damage', ref: c.ref, amount: n }
        : { type: 'hp/heal', ref: c.ref, amount: n },
    )
    setAmount('')
  }

  const hp = c.live.hp
  const fraction = hp !== null && c.hpMax ? Math.max(0, Math.min(1, hp / c.hpMax)) : null

  return (
    <div
      className={`irow${showInit ? '' : ' no-init'}${active ? ' active' : ''}${
        isDown(c) ? ' down' : ''
      }${inEncounter ? '' : ' out'}`}
      onClick={onSelect}
    >
      {showInit && (
        <input
          className="irow-init"
          value={init ?? ''}
          placeholder="–"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (e.target.value === '' || Number.isFinite(v)) {
              dispatch({ type: 'encounter/init', ref: c.ref, value: v })
            }
          }}
          title={es.iniciativa}
        />
      )}

      <Face src={c.portrait} name={c.name} className="irow-face" />

      <div className="irow-main">
        <div className="irow-top">
          <span className="irow-name">{c.name}</span>
          <span className={`irow-hp${isDown(c) ? ' down' : fraction !== null && fraction < 0.5 ? ' hurt' : ''}`}>
            {isDead(c) ? es.muerto : `${hp ?? '–'}${c.hpMax !== null ? `/${c.hpMax}` : ''}`}
            {c.live.temp > 0 && ` +${c.live.temp}`}
          </span>
        </div>

        <div className="irow-bottom">
          {c.live.conditions.length > 0 && (
            <div className="chips">
              {c.live.conditions.map((cond) => (
                <span key={cond} className="chip" title={cond}>
                  {CONDITION_SHORT[cond] ?? cond.slice(0, 3).toUpperCase()}
                </span>
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <input
            className="irow-amount"
            value={amount}
            placeholder="0"
            inputMode="numeric"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply(e.shiftKey ? 1 : -1)
            }}
            title={`${es.dano} / ${es.curar}`}
          />
          <button className="mini" onClick={stop(() => apply(-1))} title={es.dano}>−</button>
          <button className="mini" onClick={stop(() => apply(1))} title={es.curar}>+</button>
          <button
            className="mini eye"
            aria-pressed={reveal.on}
            title={reveal.on ? es.visible : es.oculto}
            onClick={stop(() => dispatch({ type: 'reveal/set', ref: c.ref, on: !reveal.on }))}
          >
            {reveal.on ? '◉' : '○'}
          </button>
          <button
            className="mini eye"
            title={`${es.pg}: ${reveal.hp}`}
            disabled={!reveal.on}
            onClick={stop(() => {
              const i = HP_CYCLE.indexOf(reveal.hp)
              dispatch({ type: 'reveal/set', ref: c.ref, hp: HP_CYCLE[(i + 1) % 3]! })
            })}
          >
            {HP_LABEL[reveal.hp]}
          </button>
        </div>
      </div>
    </div>
  )
}

export function InitiativeRail() {
  const { state, characters, monsters, sheets, dispatch } = useDm()
  const [selected, setSelected] = useState<Ref | null>(null)
  const [adding, setAdding] = useState(false)
  const [monsterId, setMonsterId] = useState('')
  const [count, setCount] = useState(1)

  const art = useMemo(() => artIndex(monsters), [monsters])
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

  const all = useMemo(() => (state ? combatants(state, pcs, art) : []), [state, pcs, art])
  const ordered = useMemo(() => (state ? orderByInit(state, all) : all), [state, all])

  if (!state) return null
  const { encounter } = state
  const members = new Set(encounter.members)
  const current = all.find((c) => c.ref === selected) ?? null

  if (current) {
    return (
      <div className="rail">
        <div className="rail-head">
          <button className="mini" onClick={() => setSelected(null)}>
            ← {es.volver}
          </button>
        </div>
        <div className="rail-body">
          <CombatantDetail c={current} />
        </div>
      </div>
    )
  }

  // Out of combat, initiative order means nothing: list the party first, then
  // whoever else is on the table, so HP is still one click away between fights.
  const roster = encounter.on
    ? ordered
    : [...all].sort((a, b) => {
        const pcA = a.ref.startsWith('pc:') ? 0 : 1
        const pcB = b.ref.startsWith('pc:') ? 0 : 1
        return pcA - pcB || a.name.localeCompare(b.name, 'es')
      })
  const inCombat = encounter.on ? roster.filter((c) => members.has(c.ref)) : []
  const outOfCombat = encounter.on ? roster.filter((c) => !members.has(c.ref)) : roster

  const row = (c: Combatant, inEncounter: boolean) => (
    <RailRow
      key={c.ref}
      c={c}
      reveal={state.field.reveal[c.ref] ?? (c.npc ? NPC_DEFAULT : PC_DEFAULT)}
      init={encounter.init[c.ref]}
      active={encounter.activeRef === c.ref}
      inEncounter={inEncounter}
      showInit={encounter.on}
      onSelect={() => setSelected(c.ref)}
    />
  )

  return (
    <div className="rail">
      <div className="rail-head">
        {encounter.on ? (
          <>
            <span className="round-pill">
              {es.ronda} {encounter.round}
            </span>
            <button
              className="mini"
              title={es.turnoAnterior}
              onClick={() => dispatch({ type: 'encounter/advance', delta: -1 })}
            >
              ←
            </button>
            <button onClick={() => dispatch({ type: 'encounter/advance', delta: 1 })}>
              {es.siguienteTurno} →
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              dispatch({ type: 'encounter/start', members: ordered.map((c) => c.ref) })
            }
            disabled={ordered.length === 0}
          >
            {es.iniciarCombate}
          </button>
        )}
      </div>

      <div className="rail-body">
        {inCombat.length > 0 && <div className="rows">{inCombat.map((c) => row(c, true))}</div>}

        {outOfCombat.length > 0 && (
          <>
            {encounter.on && <div className="group-label">{es.fueraDeCombate}</div>}
            <div className="rows">
              {outOfCombat.map((c) => row(c, !encounter.on))}
            </div>
          </>
        )}

        {roster.length === 0 && <p className="muted">{es.sinCombatientes}</p>}
      </div>

      <div className="rail-foot">
        {adding ? (
          <>
            <select value={monsterId} onChange={(e) => setMonsterId(e.target.value)} style={{ flex: 1 }}>
              <option value="">—</option>
              {monsters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.tag ? ` · ${m.tag}` : ''}
                </option>
              ))}
            </select>
            <input
              className="hp-input"
              value={count}
              inputMode="numeric"
              onChange={(e) => setCount(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))}
            />
            <button
              className="mini"
              disabled={!monsterId}
              onClick={() => {
                dispatch({ type: 'npc/add', monsterId, count })
                setAdding(false)
              }}
            >
              {es.anadir}
            </button>
            <button className="mini" onClick={() => setAdding(false)}>✕</button>
          </>
        ) : (
          <>
            <button className="mini" title={es.anadirPnj} onClick={() => setAdding(true)}>
              + {es.pnjs}
            </button>
            <button className="mini" onClick={() => dispatch({ type: 'encounter/roll' })}>
              {es.tirarIniciativa}
            </button>
            <div style={{ flex: 1 }} />
            <button className="mini" title={es.revelarTodos} onClick={() => dispatch({ type: 'reveal/all', on: true })}>
              ◉
            </button>
            <button className="mini" title={es.ocultarTodos} onClick={() => dispatch({ type: 'reveal/all', on: false })}>
              ○
            </button>
            {state.encounter.on && (
              <button className="mini" onClick={() => dispatch({ type: 'encounter/end' })}>
                {es.terminarCombate}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
