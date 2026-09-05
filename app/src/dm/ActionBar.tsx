/**
 * Resolving one action, in the rail, on the row whose turn it is.
 *
 * The shape of the thing is *pick, aim, roll, look, apply*. Nothing reaches
 * the session until Aplicar: every number on screen is editable right up to
 * that click, because the console's verdict is a suggestion and the DM is the
 * one who knows the wizard put Escudo up in response.
 *
 * The die button and the number field are the same field. Pressing 🎲 fills it
 * in; typing over it wins. That is the whole answer to "does the app roll or
 * do I" — it does whichever the DM did not.
 */
import { useEffect, useMemo, useState } from 'react'
import { isCrit, isFumble, type Attack } from '../../../shared/combat/attacks.ts'
import { formatDice, rollD20, rollDice } from '../../../shared/combat/dice.ts'
import { critical, hpAfter, resolveTarget, type Aim } from '../../../shared/combat/resolve.ts'
import type { AttackSpend, AttackTarget } from '../../../shared/actions.ts'
import { refId, refKind, type Ref } from '../../../shared/types.ts'
import { formatMod } from '../../../shared/vault/sheet.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import type { Combatant } from './combat.ts'

/**
 * What is in the two fields of one target's row.
 *
 * Strings rather than numbers, because empty is a state the DM is allowed to
 * be in and `0` is not the same as "has not said yet". `resolveTarget` takes
 * the parsed `Aim`.
 */
interface Entry {
  /** The d20 face. Empty until rolled or typed. */
  roll: string
  /** The target's own roll, for a save. */
  save: string
  /** Overridden hit/miss, when the DM disagrees with the verdict. */
  forced: boolean | null
}

const blank = (): Entry => ({ roll: '', save: '', forced: null })

const aimOf = (entry: Entry): Aim => ({
  roll: num(entry.roll),
  save: num(entry.save),
  forced: entry.forced,
})

const num = (text: string): number | null => {
  const n = Number.parseInt(text, 10)
  return Number.isFinite(n) ? n : null
}

const digits = (text: string): string => text.replace(/[^0-9]/g, '').slice(0, 2)

/** `Cimitarra +3 · 1d6+1`, `Manos Ardientes · CD 13 Destreza · 3d6`. */
function subtitle(attack: Attack): string {
  const bits: string[] = []
  if (attack.kind === 'attack' && attack.mod !== null) bits.push(formatMod(attack.mod))
  if (attack.save) {
    bits.push(`CD ${attack.save.dc} ${attack.save.ability}`)
    if (attack.save.half) bits.push(es.mitad)
  }
  bits.push(formatDice(attack.dice))
  return bits.join(' · ')
}

/** A number field with a die beside it. Empty means "not decided yet". */
function Roll({
  value,
  onChange,
  onRoll,
  label,
  width = 44,
}: {
  value: string
  onChange: (v: string) => void
  onRoll: () => void
  label: string
  width?: number
}) {
  return (
    <span className="act-roll">
      <span className="act-roll-label">{label}</span>
      <input
        value={value}
        placeholder="–"
        inputMode="numeric"
        style={{ width }}
        onChange={(e) => onChange(digits(e.target.value))}
      />
      <button className="mini" title={es.tirar} onClick={onRoll}>
        🎲
      </button>
    </span>
  )
}

export function ActionBar({
  actor,
  everyone,
  targets,
  onArm,
  onDisarm,
}: {
  actor: Combatant
  /** Everyone with a ficha, so a target can be named without the board. */
  everyone: Combatant[]
  /** Refs the DM has clicked on the board, in the order they were clicked. */
  targets: Ref[]
  /** Put the board into targeting mode, replacing whatever was picked. */
  onArm: (initial: Ref[]) => void
  onDisarm: () => void
}) {
  const { dispatch, sheets } = useDm()
  const [chosen, setChosen] = useState<Attack | null>(null)
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  /** The damage roll, shared: one fireball is one roll for everyone in it. */
  const [amount, setAmount] = useState('')
  const [spend, setSpend] = useState(true)

  const byRef = useMemo(() => new Map(everyone.map((c) => [c.ref, c])), [everyone])

  // Dropping the actor — the turn moved on — must not leave the board armed.
  useEffect(() => {
    setChosen(null)
    setEntries({})
    setAmount('')
    onDisarm()
  }, [actor.ref, onDisarm])

  if (actor.attacks.length === 0) {
    return <div className="act-bar empty">{es.sinAcciones}</div>
  }

  const close = () => {
    setChosen(null)
    setEntries({})
    setAmount('')
    onDisarm()
  }

  const open = (attack: Attack) => {
    setChosen(attack)
    setEntries({})
    setAmount('')
    setSpend(attack.level !== null && attack.level > 0)
    // A heal usually lands on one of the party and an attack on one enemy, so
    // the obvious first target is offered rather than demanded — the DM can
    // click a different one and it is replaced.
    onArm([])
  }

  const entryOf = (ref: Ref): Entry => entries[ref] ?? blank()
  const setEntry = (ref: Ref, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [ref]: { ...(prev[ref] ?? blank()), ...patch } }))

  /** The outcome of one target, as it stands right now. */
  const outcomeOf = (ref: Ref): AttackTarget | null =>
    chosen
      ? resolveTarget(chosen, ref, aimOf(entryOf(ref)), num(amount), byRef.get(ref)?.ac ?? null)
      : null

  const outcomes = targets.map(outcomeOf).filter((o): o is AttackTarget => o !== null)
  const ready = Boolean(chosen) && outcomes.length > 0 && num(amount) !== null

  const rollDamage = () => {
    if (!chosen) return
    setAmount(String(rollDice(chosen.dice, { crit: critical(chosen, targets.map(outcomeOf)) })))
  }

  const apply = () => {
    if (!chosen || !ready) return
    const cost: AttackSpend | undefined =
      spend && chosen.level !== null && chosen.level > 0
        ? { level: String(chosen.level) }
        : undefined
    dispatch({
      type: 'attack/resolve',
      ref: actor.ref,
      name: chosen.name,
      kind: chosen.kind,
      mod: chosen.kind === 'attack' ? chosen.mod : null,
      dc: chosen.save?.dc ?? null,
      targets: outcomes,
      ...(cost ? { spend: cost } : {}),
    })
    close()
  }

  if (!chosen) {
    return (
      <div className="act-bar">
        {actor.attacks.map((attack) => (
          <button key={attack.id} className="act-pick" onClick={() => open(attack)}>
            <b>{attack.name}</b>
            <span className="muted">{subtitle(attack)}</span>
          </button>
        ))}
      </div>
    )
  }

  const canSpend = chosen.level !== null && chosen.level > 0
  // How many are left, so ticking the box is an informed click. Nothing stops
  // the DM spending a slot they do not have — they are the authority, and a
  // ritual or a generous ruling is a real thing — but it should not be silent.
  const level = String(chosen.level)
  const sheet = refKind(actor.ref) === 'pc' ? sheets[refId(actor.ref)] : undefined
  const maxSlots = sheet?.slots[level]
  const left =
    maxSlots === undefined ? null : maxSlots - (actor.live.spent[level] ?? 0)

  return (
    <div className="act-bar open">
      <div className="act-head">
        <b>{chosen.name}</b>
        <span className="muted">{subtitle(chosen)}</span>
        <div style={{ flex: 1 }} />
        <button className="mini" onClick={close}>
          {es.cancelar}
        </button>
      </div>

      <div className="act-row">
        <Roll
          label={chosen.kind === 'heal' ? es.curacion : es.dano}
          value={amount}
          onChange={setAmount}
          onRoll={rollDamage}
          width={52}
        />
        {canSpend && (
          <label className={`act-spend${left !== null && left <= 0 ? ' none-left' : ''}`}>
            <input type="checkbox" checked={spend} onChange={(e) => setSpend(e.target.checked)} />
            {es.gastar} {es.espacioNivel} {chosen.level}
            {left !== null && ` · ${es.quedan} ${Math.max(0, left)}`}
          </label>
        )}
      </div>

      {targets.length === 0 ? (
        <p className="act-hint">{es.elegirEnTablero}</p>
      ) : (
        <div className="act-targets">
          {targets.map((ref) => {
            const target = byRef.get(ref)
            const entry = entryOf(ref)
            const outcome = outcomeOf(ref)
            const d20 = num(entry.roll)
            return (
              <div className="act-target" key={ref}>
                <span className="act-who">{target?.name ?? ref}</span>

                {chosen.kind === 'attack' && (
                  <Roll
                    label="d20"
                    value={entry.roll}
                    onChange={(v) => setEntry(ref, { roll: v, forced: null })}
                    onRoll={() => setEntry(ref, { roll: String(rollD20()), forced: null })}
                  />
                )}
                {chosen.kind === 'save' && (
                  <Roll
                    label={es.salvacion}
                    value={entry.save}
                    onChange={(v) => setEntry(ref, { save: v })}
                    onRoll={() => setEntry(ref, { save: String(rollD20()) })}
                  />
                )}

                {/* Its own line: the rail is narrow, and «Impacta · 18 vs CA
                    12 · 5 → 4 PG» does not fit beside a name and a die. */}
                <div className="act-outcome">
                  <span className="act-verdict">{verdictOf(chosen, outcome, target, d20)}</span>
                  {/* The verdict is only ever a suggestion — an unstated AC, a
                      bonus the note never gave, or a reaction the sheet knows
                      nothing about. */}
                  {chosen.kind === 'attack' && d20 !== null && !isCrit(d20) && !isFumble(d20) && (
                    <button
                      className="mini"
                      title={outcome?.hit ? es.falla : es.impacta}
                      onClick={() => setEntry(ref, { forced: !(outcome?.hit ?? false) })}
                    >
                      ⇄
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="act-foot">
        {/* The board is the way in — but it is only on screen in modo tablero,
            and a fight can be run over a scene with no grid at all. */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onArm([...targets, e.target.value as Ref])
          }}
        >
          <option value="">{es.elegirObjetivo}…</option>
          {everyone
            .filter((c) => !targets.includes(c.ref))
            .map((c) => (
              <option key={c.ref} value={c.ref}>
                {c.name}
              </option>
            ))}
        </select>
        {targets.length > 0 && (
          <button className="mini" onClick={() => onArm([])}>
            {es.objetivos}: {targets.length} ⊗
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button disabled={!ready} onClick={apply}>
          {es.aplicar}
        </button>
      </div>
    </div>
  )
}

/** The one line that says what will happen to this target if Aplicar is clicked. */
function verdictOf(
  attack: Attack,
  outcome: AttackTarget | null,
  target: Combatant | undefined,
  d20: number | null,
): string {
  // Capped both ways, so a 2d8 into somebody one hit point down previews the
  // one it will actually restore.
  const after =
    target && outcome ? hpAfter(attack, outcome, target.live.hp, target.hpMax) : null
  const left = after === null ? '' : ` → ${after} ${es.pg}`

  if (attack.kind === 'heal') {
    return outcome && outcome.amount > 0 ? `+${outcome.amount}${left}` : '—'
  }

  if (attack.kind === 'save') {
    if (!outcome) return '—'
    const verb = outcome.hit ? es.noSalva : es.salva
    return outcome.amount > 0 ? `${verb} · ${outcome.amount}${left}` : `${verb} · ${es.sinDano}`
  }

  if (d20 === null) return '—'
  if (isFumble(d20)) return es.pifia
  if (!outcome) return '—'
  // Either half of the comparison can be missing: a pnj ability that states
  // damage and no bonus, or a combatant nothing states an AC for.
  const versus =
    attack.mod === null || target?.ac === null || target?.ac === undefined
      ? es.sinCa
      : `${d20 + attack.mod} vs CA ${target.ac}`
  if (!outcome.hit) return `${es.falla} · ${versus}`
  const head = outcome.crit ? es.critico : `${es.impacta} · ${versus}`
  return outcome.amount > 0 ? `${head} · ${outcome.amount}${left}` : head
}
