/**
 * Levelling a character up.
 *
 * One component for both screens — the DM's console and a player's phone —
 * because the thing being edited is the same record and there is no reason for
 * the two to drift. What it produces is a `SheetPatch`: the fields that change
 * and nothing else, which the server merges shallowly.
 *
 * ## The table decides, the person picks
 *
 * `shared/rules/progression.ts` is asked what this class gains at the next
 * level. Level, hit points (the hit die's average) and spell slots come from
 * that row and are **shown, not typed**; the only things touched here are the
 * row's choices, and the form will not apply until each one is answered — a
 * level-up that skipped them is what left a party at level 2 with level-1
 * spellbooks.
 *
 * A level with no row cannot be taken from here. That is not a missing
 * feature: the row is where the numbers get checked once, before a session,
 * and writing it is content, not code.
 */
import { useMemo, useState } from 'react'
import {
  SKILLS,
  skillRow,
  slotsOf,
  summaryOf,
  formatMod,
  type Sheet,
} from '../../../shared/character.ts'
import type { Choice } from '../../../shared/rules/progression.ts'
import {
  buildLevelUp,
  missingPicks,
  nextLevel,
  skillOptions,
  spellOffer,
} from '../../../shared/rules/levelup.ts'
import type { RuleSpell } from '../../../shared/rules/spells.ts'
import type { SheetPatch } from '../../../shared/protocol.ts'
import { es } from '../strings/es.ts'
import './level-up.css'

export function LevelUp({
  sheet,
  currentHp,
  busy,
  error,
  onApply,
  onClose,
}: {
  sheet: Sheet
  /** What the character has on them now, to show what the new maximum does to it. */
  currentHp?: number | null
  busy?: boolean
  error?: string | null
  onApply: (patch: SheetPatch) => void
  onClose: () => void
}) {
  const from = sheet.level ?? 1
  const { level, grant } = useMemo(() => nextLevel(sheet), [sheet])
  const [picks, setPicks] = useState<Record<string, string[]>>({})

  const has = (id: string) => picks[id] ?? []
  const toggle = (id: string, value: string, max: number) => {
    const chosen = has(id)
    const next = chosen.includes(value)
      ? chosen.filter((v) => v !== value)
      : [...chosen, value].slice(-max)
    setPicks({ ...picks, [id]: next })
  }

  if (!grant) {
    return (
      <div className="lvl-backdrop" onClick={onClose}>
        <div className="lvl-panel" onClick={(e) => e.stopPropagation()}>
          <h2>{es.subirDeNivel}</h2>
          <div className="lvl-who">
            {sheet.name}
            {summaryOf(sheet) ? ` · ${summaryOf(sheet)}` : ''}
          </div>
          <p className="lvl-note lvl-manual">
            {es.sinTabla} <b>{sheet.className ?? '—'}</b> {es.aNivel} {level}.{' '}
            {es.sinTablaAyuda}
          </p>
          <div className="lvl-actions">
            <button onClick={onClose}>{es.cancelar}</button>
          </div>
        </div>
      </div>
    )
  }

  const built = buildLevelUp(sheet, grant, picks)
  const preview = { ...sheet, ...built }
  const pending = missingPicks(sheet, grant, picks)
  const hpMax = built.hpMax ?? null
  const gained = hpMax !== null && sheet.hpMax !== null ? hpMax - sheet.hpMax : 0
  const hpNow = currentHp ?? null
  const slotsBefore = slotsOf(sheet)
  const slotsAfter = slotsOf(preview)
  const slotLevels = [...new Set([...Object.keys(slotsBefore), ...Object.keys(slotsAfter)])].sort()

  return (
    <div className="lvl-backdrop" onClick={onClose}>
      <div className="lvl-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{es.subirDeNivel}</h2>
        <div className="lvl-who">
          {sheet.name}
          {summaryOf(sheet) ? ` · ${summaryOf(sheet)}` : ''}
        </div>

        <dl className="lvl-summary">
          <dt>{es.nivel}</dt>
          <dd>
            {from} → <b>{level}</b>
          </dd>
          {hpMax !== null && (
            <>
              <dt>{es.pgMaximos}</dt>
              <dd>
                {sheet.hpMax} → <b>{hpMax}</b>
                <span className="lvl-gain"> +{gained}</span>
                {grant.hitDie && (
                  <span className="lvl-from"> · {es.mediaDe} d{grant.hitDie}</span>
                )}
              </dd>
            </>
          )}
          {built.spellcasting &&
            slotLevels
              .filter((l) => (slotsBefore[l] ?? 0) !== (slotsAfter[l] ?? 0))
              .map((l) => (
                <SlotRow key={l} level={l} before={slotsBefore[l] ?? 0} after={slotsAfter[l] ?? 0} />
              ))}
        </dl>
        {gained > 0 && hpNow !== null && hpMax !== null && (
          <p className="lvl-note">
            {es.pgActualesSuben} <b>{hpNow} → {Math.min(hpNow + gained, hpMax)}</b>
          </p>
        )}

        {grant.features && grant.features.length > 0 && (
          <>
            <div className="lvl-label">{es.teLlevas}</div>
            {grant.features.map((f) => (
              <div className="lvl-granted" key={f.name}>
                <b>{f.name}</b>
                <p>{f.text}</p>
              </div>
            ))}
          </>
        )}

        {(grant.choices ?? []).map((choice) => (
          <div className="lvl-choice" key={choice.id}>
            <div className="lvl-choice-head">
              {choice.label}
              <span className={has(choice.id).length >= choice.pick ? 'lvl-gain' : 'lvl-pending'}>
                {' '}{has(choice.id).length}/{choice.pick}
              </span>
            </div>
            {choice.help && <p className="lvl-help">{choice.help}</p>}
            <ChoicePicker
              sheet={sheet}
              preview={preview}
              choice={choice}
              chosen={has(choice.id)}
              onToggle={(value) => toggle(choice.id, value, choice.pick)}
            />
          </div>
        ))}

        {error && <p className="lvl-error">{error}</p>}
        {pending.length > 0 && (
          <p className="lvl-help lvl-pending">
            {es.faltaElegir} {pending.map((c) => c.label.toLowerCase()).join(', ')}.
          </p>
        )}
        <div className="lvl-actions">
          <button onClick={onClose}>{es.cancelar}</button>
          <button
            className="primary"
            disabled={busy || pending.length > 0}
            onClick={() => onApply(built)}
          >
            {busy ? es.subiendo : `${es.subirA} ${level}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function SlotRow({ level, before, after }: { level: string; before: number; after: number }) {
  return (
    <>
      <dt>
        {es.espacios} {level}º
      </dt>
      <dd>
        {before} → <b>{after}</b>
      </dd>
    </>
  )
}

function ChoicePicker({
  sheet,
  preview,
  choice,
  chosen,
  onToggle,
}: {
  sheet: Sheet
  preview: Sheet
  choice: Choice
  chosen: string[]
  onToggle: (value: string) => void
}) {
  if (choice.kind === 'skills') {
    return (
      <div className="lvl-skills">
        {skillOptions(sheet, choice).map((key) => {
          const skill = SKILLS.find((s) => s.key === key)!
          const already = sheet.skills[key]?.prof
          return (
            <button
              key={key}
              className={`lvl-skill ${chosen.includes(key) ? choice.as : (already ?? 'none')}`}
              onClick={() => onToggle(key)}
            >
              <span className="lvl-skill-name">{skill.name}</span>
              <b>{formatMod(skillRow(preview, key).mod ?? 0)}</b>
            </button>
          )
        })}
      </div>
    )
  }
  if (choice.kind === 'spells') return <SpellPicker sheet={sheet} choice={choice} chosen={chosen} onToggle={onToggle} />
  return (
    <div className="lvl-spells">
      {choice.from.map((f) => (
        <button
          key={f.name}
          className={`lvl-spell${chosen.includes(f.name) ? ' on' : ''}`}
          onClick={() => onToggle(f.name)}
        >
          <span className="lvl-spell-head">
            <b>{f.name}</b>
          </span>
          <span className="lvl-spell-sum">{f.text}</span>
        </button>
      ))}
    </div>
  )
}

/** Recommended first; the rest of the class's list one tap away. */
function SpellPicker({
  sheet,
  choice,
  chosen,
  onToggle,
}: {
  sheet: Sheet
  choice: Extract<Choice, { kind: 'spells' }>
  chosen: string[]
  onToggle: (value: string) => void
}) {
  const { recommended, rest } = useMemo(() => spellOffer(sheet, choice), [sheet, choice])
  // A choice with no recommendations has nothing to put first, so it opens on the list.
  const [all, setAll] = useState(recommended.length === 0)
  // A pick from the full list stays visible when the list is folded again.
  const shownRest = all ? rest : rest.filter((s) => chosen.includes(s.es))

  if (recommended.length === 0 && rest.length === 0) {
    return <p className="lvl-help">{es.sinConjurosQueOfrecer}</p>
  }
  return (
    <div className="lvl-spells">
      {recommended.length > 0 && <div className="lvl-sublabel">{es.recomendados}</div>}
      {recommended.map((s) => (
        <SpellButton key={s.es} spell={s} on={chosen.includes(s.es)} onClick={() => onToggle(s.es)} />
      ))}
      {recommended.length > 0 && rest.length > 0 && (
        <button className="lvl-toggle" onClick={() => setAll(!all)}>
          {all ? `▾ ${es.ocultarElResto}` : `▸ ${es.verTodos} (${rest.length})`}
        </button>
      )}
      {shownRest.map((s) => (
        <SpellButton key={s.es} spell={s} on={chosen.includes(s.es)} onClick={() => onToggle(s.es)} />
      ))}
    </div>
  )
}

function SpellButton({ spell, on, onClick }: { spell: RuleSpell; on: boolean; onClick: () => void }) {
  return (
    <button className={`lvl-spell${on ? ' on' : ''}`} onClick={onClick}>
      <span className="lvl-spell-head">
        <b>{spell.es}</b>
        <span className="lvl-from">
          {spell.school}
          {spell.conc ? ' · conc.' : ''}
          {spell.rit ? ` · ${es.ritual}` : ''}
        </span>
      </span>
      <span className="lvl-spell-sum">{spell.sum}</span>
    </button>
  )
}
