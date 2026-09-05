/** Right-hand panel: stat block, conditions, death saves, notes. */
import { useMemo, useState } from 'react'
import type { Ref } from '../../../shared/types.ts'
import { CONDITIONS } from '../../../shared/conditions.ts'
import { revealFor, tableNames } from '../../../shared/session/project.ts'
import { es } from '../strings/es.ts'
import { useDraft } from './useDraft.ts'
import { useDm } from '../state/dmStore.ts'
import { Face } from './Face.tsx'
import { isDead, isDown, type Combatant } from './combat.ts'

export function CombatantDetail({ c }: { c: Combatant | null }) {
  const { dispatch, pnjs, objects, openNote, state, characters } = useDm()
  // Hooks run before the early return below, so they tolerate no selection.
  const temp = useDraft(c?.live.temp || '', (t) => {
    if (c) dispatch({ type: 'hp/temp', ref: c.ref, temp: Number(t || 0) })
  })
  const { onKeyDown: _ignoreEnter, ...noteProps } = useDraft(c?.live.note ?? '', (t) => {
    if (c) dispatch({ type: 'live/note', ref: c.ref, note: t })
  })
  const pcNameOf = (pcId: string) =>
    characters.find((ch) => ch.id === pcId)?.name || pcId

  if (!c) return <p className="muted">{es.seleccionaFicha}</p>

  // The prep text lives in the pnj note, not on the instantiated NPC, and
  // `file` is that note's path — so there is nothing to look up by slug.
  const prep = c.npc ? pnjs.find((m) => m.file === c.npc!.file || m.id === c.npc!.id) : undefined
  const carried = objects.filter((o) => c.live.objects.includes(o.id))
  // A masked PNJ is the one place the console's name and the television's part
  // ways, so the ficha says which one the players are hearing.
  const masked = c.npc?.alias && state ? revealFor(state, c.ref).name === 'alias' : false
  const tableName = c.npc && state ? tableNames(state).get(c.npc.id) : undefined
  const lootable = c.npc !== null && (carried.length > 0 || c.live.gold > 0)
  const party = Object.keys(state?.play ?? {})

  return (
    <div className="detail">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <Face src={c.portrait} name={c.name} className="crow-face" />
        <div style={{ flex: 1 }}>
          <h2>{c.name}</h2>
          {c.npc?.alias && (
            <div className="mask-line">
              {masked ? `${es.laMesaVe}: ${tableName ?? c.npc.alias}` : es.nombreALaVista}
            </div>
          )}
          <div className="sub">
            {[
              c.tag,
              c.ac !== null && `${es.ca} ${c.ac}`,
              c.hpMax !== null && `${es.pg} ${c.hpMax}`,
              c.speed !== null && `${es.velocidad} ${c.speed} m`,
              c.initMod !== 0 && `${es.iniciativa} ${c.initMod > 0 ? '+' : ''}${c.initMod}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 12 }}>
        <h3>{es.pg}</h3>
        <div className="row">
          <button onClick={() => dispatch({ type: 'hp/full', ref: c.ref })} disabled={c.hpMax === null}>
            {es.alMaximo}
          </button>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted">{es.temporales}</span>
            <input className="hp-input" placeholder="0" inputMode="numeric" {...temp} />
          </label>
        </div>
        <div className="row">
          <span className="muted">{es.agotamiento}</span>
          <div className="pips">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                className={`pip${c.live.exh >= n ? ' on-fail' : ''}`}
                title={`${es.agotamiento} ${n}`}
                onClick={() =>
                  dispatch({ type: 'exh/set', ref: c.ref, value: c.live.exh === n ? n - 1 : n })
                }
              />
            ))}
          </div>
        </div>
      </section>

      {isDown(c) && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h3>{es.salvaciones}</h3>
          <div className="row">
            <span className="muted" style={{ width: 52 }}>{es.exitos}</span>
            <div className="pips">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className={`pip${c.live.death.ok >= n ? ' on-ok' : ''}`}
                  onClick={() => dispatch({ type: 'death/mark', ref: c.ref, outcome: 'ok' })}
                />
              ))}
            </div>
          </div>
          <div className="row">
            <span className="muted" style={{ width: 52 }}>{es.fallos}</span>
            <div className="pips">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className={`pip${c.live.death.fail >= n ? ' on-fail' : ''}`}
                  onClick={() => dispatch({ type: 'death/mark', ref: c.ref, outcome: 'fail' })}
                />
              ))}
            </div>
            <button className="mini" onClick={() => dispatch({ type: 'death/reset', ref: c.ref })}>
              {es.reiniciar}
            </button>
          </div>
        </section>
      )}

      {lootable && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h3>{es.saquear}</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {[
              ...carried.map((o) => o.name),
              c.live.gold > 0 ? `${c.live.gold} po` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="row">
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                dispatch({ type: 'loot/transfer', from: c.ref, to: e.target.value as Ref })
              }}
            >
              <option value="">{es.saquearA}…</option>
              {party.map((pcId) => (
                <option key={pcId} value={`pc:${pcId}`}>
                  {pcNameOf(pcId)}
                </option>
              ))}
            </select>
            {!isDead(c) && <span className="muted">{es.sigueVivo}</span>}
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: 12 }}>
        <h3>{es.condiciones}</h3>
        <div className="cond-grid">
          {CONDITIONS.map((cond) => (
            <button
              key={cond}
              aria-pressed={c.live.conditions.includes(cond)}
              onClick={() => dispatch({ type: 'condition/toggle', ref: c.ref, condition: cond })}
            >
              {cond}
            </button>
          ))}
        </div>
      </section>

      {c.npc && c.npc.abilities.length > 0 && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h3>{es.rasgos}</h3>
          {c.npc.abilities.map((a) => (
            <div className="ability" key={a.id}>
              <strong>{a.name}</strong>
              <p>{a.desc}</p>
            </div>
          ))}
        </section>
      )}

      {prep && (prep.lead || prep.file) && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h3>{es.notaPreparacion}</h3>
          {prep.lead && <p className="prep-note">{prep.lead}</p>}
          {prep.file && (
            <button className="mini" style={{ marginTop: 8 }} onClick={() => openNote(prep.file)}>
              {es.verNota} →
            </button>
          )}
        </section>
      )}

      <section className="card">
        <h3>{es.notaDm}</h3>
        <textarea {...noteProps} />
        {c.npc && (
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => dispatch({ type: 'npc/remove', id: c.npc!.id })}>
              {es.quitar}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
