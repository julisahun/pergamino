/**
 * The party and what they carry.
 *
 * An object lives on whoever holds it: give, take and spend charges from their
 * card. The prose from `objects/*.json` is reference, so it opens on demand
 * instead of sitting expanded under every character.
 */
import { useMemo, useState } from 'react'
import type { GameObject, Ref } from '../../../shared/types.ts'
import { CONDITION_SHORT } from '../../../shared/conditions.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { Face } from './Face.tsx'
import { ObjectDetail } from './ObjectDetail.tsx'
import { Popover } from './Popover.tsx'
import { artIndex, combatants, isDown, type Combatant } from './combat.ts'

export function PartyPanel() {
  const { state, characters, monsters, objects, sheets, dispatch } = useDm()
  const [confirmLong, setConfirmLong] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)

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
  if (!state) return null

  const party = all.filter((c) => c.ref.startsWith('pc:'))
  const partyRefs = party.map((c) => c.ref)
  const holderOf = (id: string) => all.find((c) => c.live.objects.includes(id))

  const unassigned = objects.filter(
    (o) => !holderOf(o.id) && !state.objects[o.id]?.spent,
  )
  const detailObject = objects.find((o) => o.id === detail)

  return (
    <div className="fichas">
      <div className="row" style={{ marginBottom: 14 }}>
        <button onClick={() => dispatch({ type: 'rest/short', refs: partyRefs })}>
          {es.descansoCorto}
        </button>
        {confirmLong ? (
          <>
            <span className="muted">{es.confirmarLargo}</span>
            <button
              onClick={() => {
                dispatch({ type: 'rest/long', refs: partyRefs })
                setConfirmLong(false)
              }}
            >
              {es.descansoLargo}
            </button>
            <button onClick={() => setConfirmLong(false)}>✕</button>
          </>
        ) : (
          <button onClick={() => setConfirmLong(true)}>{es.descansoLargo}</button>
        )}

        <div style={{ flex: 1 }} />

        {unassigned.length > 0 && (
          <Popover
            label={`${unassigned.length} ${
              unassigned.length === 1 ? es.unoSinRepartir : es.sinRepartir
            }`}
          >
            {(close) => (
              <>
                {unassigned.map((o) => (
                  <div className="row" key={o.id} style={{ gap: 4, padding: '2px 4px' }}>
                    <button
                      style={{ flex: 1, textAlign: 'left' }}
                      onClick={() => {
                        setDetail(o.id)
                        close()
                      }}
                    >
                      {o.name}
                    </button>
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return
                        dispatch({ type: 'object/give', ref: e.target.value as Ref, objectId: o.id })
                        close()
                      }}
                    >
                      <option value="">{es.dar}</option>
                      {all.map((c) => (
                        <option key={c.ref} value={c.ref}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </>
            )}
          </Popover>
        )}
      </div>

      <div className="pc-grid">
        {party.map((c) => (
          <PcCard
            key={c.ref}
            c={c}
            slots={sheets[c.ref.slice(3)]?.slots ?? {}}
            objects={objects}
            everyone={all}
            usesOf={(id) => state.objects[id]}
            onDetail={setDetail}
          />
        ))}
      </div>

      {detailObject && (
        <ObjectDetail
          object={detailObject}
          holder={holderOf(detailObject.id)?.name ?? null}
          uses={state.objects[detailObject.id]}
          onRefill={() => dispatch({ type: 'object/refill', objectId: detailObject.id })}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

function PcCard({
  c,
  slots,
  objects,
  everyone,
  usesOf,
  onDetail,
}: {
  c: Combatant
  slots: Record<string, number>
  objects: GameObject[]
  everyone: Combatant[]
  usesOf: (id: string) => { uses: number; spent: boolean } | undefined
  onDetail: (id: string) => void
}) {
  const dispatch = useDm((s) => s.dispatch)
  const carried = objects.filter((o) => c.live.objects.includes(o.id))
  const acBonus = carried.reduce((sum, o) => sum + (o.mods.ac ?? 0), 0)
  const givable = objects.filter((o) => !c.live.objects.includes(o.id) && !usesOf(o.id)?.spent)

  return (
    <div className={`pc-card${isDown(c) ? ' down' : ''}`}>
      <div className="pc-head">
        <Face src={c.portrait} name={c.name} />
        <div style={{ flex: 1 }}>
          <h3>{c.name}</h3>
          <div className="sub">
            {c.hpMax !== null && `${es.pg} ${c.live.hp ?? 0}/${c.hpMax}`}
            {c.live.temp > 0 && ` +${c.live.temp}`}
            {acBonus > 0 && ` · ${es.ca} +${acBonus}`}
          </div>
        </div>
        <button className="mini" onClick={() => dispatch({ type: 'hp/full', ref: c.ref })}>
          {es.alMaximo}
        </button>
      </div>

      {c.live.conditions.length > 0 && (
        <div className="chips" style={{ marginBottom: 4 }}>
          {c.live.conditions.map((cond) => (
            <span key={cond} className="chip" title={cond}>
              {CONDITION_SHORT[cond] ?? cond}
            </span>
          ))}
        </div>
      )}

      <div className="pc-field">
        <span>{es.oro}</span>
        <input
          className="hp-input"
          value={c.live.gold}
          inputMode="numeric"
          onChange={(e) =>
            dispatch({ type: 'gold/set', ref: c.ref, gold: Number(e.target.value.replace(/\D/g, '')) || 0 })
          }
        />
        <span className="muted">po</span>
      </div>

      {Object.keys(slots).length > 0 && (
        <div className="pc-field">
          <span>{es.espacios}</span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(slots).map(([level, max]) => {
              const spent = c.live.spent[level] ?? 0
              return (
                <div key={level} className="slot-row">
                  <span className="muted">{level}º</span>
                  <div className="uses">
                    {Array.from({ length: max }, (_, i) => (
                      <button
                        key={i}
                        className={`use-pip${i >= spent ? ' on' : ''}`}
                        title={`${es.nivel} ${level}`}
                        onClick={() =>
                          dispatch({
                            type: 'slots/set',
                            ref: c.ref,
                            level,
                            spent: i >= spent ? spent + 1 : i,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="carry">
        <div className="carry-label">{es.lleva}</div>
        {carried.map((o) => {
          const uses = usesOf(o.id)
          const remaining = uses?.uses ?? o.usos
          return (
            <div className="carry-row" key={o.id}>
              <span className="carry-name">{o.name}</span>
              {o.mods.ac ? <span className="carry-mod">{es.ca} +{o.mods.ac}</span> : null}
              {o.usos !== undefined && (
                <>
                  <span className="uses" title={`${remaining}/${o.usos} ${es.usos}`}>
                    {Array.from({ length: o.usos }, (_, i) => (
                      <span key={i} className={`use-pip${i < (remaining ?? 0) ? ' on' : ''}`} />
                    ))}
                  </span>
                  <button
                    className="mini"
                    onClick={() => dispatch({ type: 'object/use', ref: c.ref, objectId: o.id })}
                  >
                    {es.usar}
                  </button>
                </>
              )}
              <button className="mini" title={es.verDetalle} onClick={() => onDetail(o.id)}>
                ⓘ
              </button>
              <button
                className="mini"
                title={es.quitar}
                onClick={() => dispatch({ type: 'object/take', ref: c.ref, objectId: o.id })}
              >
                ✕
              </button>
            </div>
          )
        })}

        {givable.length > 0 && (
          <Popover label={`+ ${es.darObjeto}`}>
            {(close) =>
              givable.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    dispatch({ type: 'object/give', ref: c.ref, objectId: o.id })
                    close()
                  }}
                >
                  {o.name}
                  {holderNote(o, everyone)}
                </button>
              ))
            }
          </Popover>
        )}
      </div>

      <div className="pc-field" style={{ alignItems: 'flex-start' }}>
        <span>{es.equipo}</span>
        <textarea
          value={c.live.inventory}
          placeholder={es.sinObjetos}
          onChange={(e) => dispatch({ type: 'inventory/set', ref: c.ref, text: e.target.value })}
        />
      </div>
    </div>
  )
}

/** Giving an item that someone else holds should say so before it moves. */
function holderNote(o: GameObject, everyone: Combatant[]): string {
  const holder = everyone.find((c) => c.live.objects.includes(o.id))
  return holder ? ` · ${holder.name}` : ''
}
