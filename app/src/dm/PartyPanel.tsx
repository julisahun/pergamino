/**
 * The party and what they carry.
 *
 * An object lives on whoever holds it: give, take and spend charges from their
 * card. The prose from `objects/*.md` is reference, so it opens on demand
 * instead of sitting expanded under every character.
 *
 * Handing an item out is a *secondary* thing to do here — the catalogue of
 * everything the campaign has, and the item nobody is carrying yet, are the
 * Objetos tab's job.
 */
import { useMemo, useState } from 'react'
import type { GameObject } from '../../../shared/types.ts'
import { CONDITION_SHORT } from '../../../shared/conditions.ts'
import { abilityMod, formatMod, type Abilities, type SheetStats } from '../../../shared/vault/sheet.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { Face } from './Face.tsx'
import { Charges } from './Charges.tsx'
import { ObjectDetail } from './ObjectDetail.tsx'
import { PcSheet } from './PcSheet.tsx'
import { Popover } from './Popover.tsx'
import { artIndex, combatants, isDown, type Combatant } from './combat.ts'

export function PartyPanel() {
  const { state, characters, pnjs, objects, sheets, dispatch } = useDm()
  const [confirmLong, setConfirmLong] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)

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

  const all = useMemo(() => (state ? combatants(state, pcs, art) : []), [state, pcs, art])
  if (!state) return null

  const party = all.filter((c) => c.ref.startsWith('pc:'))
  const partyRefs = party.map((c) => c.ref)
  const holderOf = (id: string) => all.find((c) => c.live.objects.includes(id))

  const detailObject = objects.find((o) => o.id === detail)
  const fichaOf = ficha ? (party.find((p) => p.ref === `pc:${ficha}`) ?? null) : null

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
      </div>

      <div className="pc-grid">
        {party.map((c) => (
          <PcCard
            key={c.ref}
            c={c}
            sheet={sheets[c.ref.slice(3)]}
            objects={objects}
            everyone={all}
            usesOf={(id) => state.objects[id]}
            onDetail={setDetail}
            onSheet={() => setFicha(c.ref.slice(3))}
          />
        ))}
      </div>

      {fichaOf && (
        <PcSheet
          c={fichaOf}
          sheet={sheets[ficha!]}
          noteFile={characters.find((ch) => ch.id === ficha)?.file ?? null}
          onClose={() => setFicha(null)}
        />
      )}

      {detailObject && (
        <ObjectDetail
          object={detailObject}
          holder={holderOf(detailObject.id)?.name ?? null}
          uses={state.objects[detailObject.id]}
          onCharges={(uses) => dispatch({ type: 'object/charges', objectId: detailObject.id, uses })}
          onRefill={() => dispatch({ type: 'object/refill', objectId: detailObject.id })}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

/** Labelled the way the sheet writes them: FUE,DES,CON,INT,SAB,CAR. */
const SCORES: { key: keyof Abilities; label: string }[] = [
  { key: 'str', label: 'FUE' },
  { key: 'dex', label: 'DES' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'SAB' },
  { key: 'cha', label: 'CAR' },
]

function PcCard({
  c,
  sheet,
  objects,
  everyone,
  usesOf,
  onDetail,
  onSheet,
}: {
  c: Combatant
  sheet: SheetStats | undefined
  objects: GameObject[]
  everyone: Combatant[]
  usesOf: (id: string) => { uses: number; spent: boolean } | undefined
  onDetail: (id: string) => void
  onSheet: () => void
}) {
  const dispatch = useDm((s) => s.dispatch)
  const slots = sheet?.slots ?? {}
  const carried = objects.filter((o) => c.live.objects.includes(o.id))
  const acBonus = carried.reduce((sum, o) => sum + (o.mods.ac ?? 0), 0)
  // Shown side by side rather than added up: the sheet's AC is the sheet's,
  // and whether a second source of AC stacks is not this app's ruling to make.
  const givable = objects.filter((o) => !c.live.objects.includes(o.id) && !usesOf(o.id)?.spent)

  return (
    <div className={`pc-card${isDown(c) ? ' down' : ''}`}>
      <div className="pc-head">
        <Face src={c.portrait} name={c.name} />
        <div style={{ flex: 1 }}>
          <h3>{c.name}</h3>
          {sheet?.summary && <div className="sub">{sheet.summary}</div>}
          <div className="sub">
            {c.hpMax !== null && `${es.pg} ${c.live.hp ?? 0}/${c.hpMax}`}
            {c.live.temp > 0 && ` +${c.live.temp}`}
            {sheet?.ac != null && ` · ${es.ca} ${sheet.ac}`}
            {acBonus > 0 && ` (+${acBonus} ${es.porObjetos})`}
          </div>
        </div>
        <button className="mini" title={es.verFicha} onClick={onSheet}>
          &#9432;
        </button>
        <button className="mini" onClick={() => dispatch({ type: 'hp/full', ref: c.ref })}>
          {es.alMaximo}
        </button>
      </div>

      {sheet?.abilities && (
        // Modifiers only: the score itself is reference, and an ability call
        // at the table wants the number you add. Both are in the ficha.
        <div className="mod-strip">
          {SCORES.map(({ key, label }) => (
            <div className="mod" key={key} title={`${label} ${sheet.abilities![key]}`}>
              <span className="mod-label">{label}</span>
              <b>{formatMod(abilityMod(sheet.abilities![key]))}</b>
            </div>
          ))}
        </div>
      )}


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
                <Charges
                  total={o.usos}
                  left={remaining ?? 0}
                  onSet={(uses) => dispatch({ type: 'object/charges', objectId: o.id, uses })}
                />
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
