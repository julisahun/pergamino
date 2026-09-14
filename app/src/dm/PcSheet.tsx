/**
 * A PC's whole ficha, opened on demand.
 *
 * The card in Party is for the session — hit points, conditions, gold, what
 * they are carrying — and it was carrying every derived number as well, which
 * is what made it unreadable. Everything the `-fc5.xml` states lives here
 * instead: the scores, the rolls, the casting line and all eighteen skills.
 *
 * Nothing on this screen is computed from a build. A skill row is either the
 * number the sheet quoted or the bare ability modifier, and it says which —
 * see `skillRows` in `shared/skills.ts`.
 */
import { useEffect } from 'react'
import { ABILITY_LABEL, skillRows } from '../../../shared/skills.ts'
import {
  abilityMod,
  formatMod,
  passivePerceptionOf,
  sheetSaveRows,
  spellAttackOf,
  spellDcOf,
  summaryOf,
  ABILITY_LABEL as ABILITY_NAME,
  type Abilities,
  type Sheet,
} from '../../../shared/character.ts'
import { es } from '../strings/es.ts'
import { Face } from './Face.tsx'
import type { Combatant } from './combat.ts'

const SCORES: (keyof Abilities)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export function PcSheet({
  c,
  sheet,
  onClose,
}: {
  c: Combatant
  sheet: Sheet | undefined
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const passive = sheet ? passivePerceptionOf(sheet) : null
  const dc = sheet ? spellDcOf(sheet) : null
  const spellAttack = sheet ? spellAttackOf(sheet) : null
  const rolls = [
    sheet?.initiative != null ? [es.iniciativaLarga, formatMod(sheet.initiative)] : null,
    sheet?.proficiency != null ? [es.competencia, formatMod(sheet.proficiency)] : null,
    passive != null ? [es.percepcionPasiva, String(passive)] : null,
    dc != null ? [es.cdConjuros, String(dc)] : null,
    spellAttack != null ? [es.ataqueConjuros, formatMod(spellAttack)] : null,
    sheet?.spellcasting ? [es.conjurosPor, ABILITY_NAME[sheet.spellcasting.ability]] : null,
  ].filter(Boolean) as [string, string][]

  const skills = skillRows(sheet)
  const saves = sheetSaveRows(sheet)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Face src={c.portrait} name={c.name} className="crow-face" />
          <div style={{ flex: 1 }}>
            <h2>{c.name}</h2>
            {sheet && summaryOf(sheet) && <div className="sub">{summaryOf(sheet)}</div>}
            <div className="sub">
              {[
                c.hpMax !== null && `${es.pg} ${c.live.hp ?? 0}/${c.hpMax}`,
                sheet?.ac != null && `${es.ca} ${sheet.ac}`,
                sheet?.level != null && `${es.nivel} ${sheet.level}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <button onClick={onClose}>{es.cerrar}</button>
        </div>

        {sheet?.abilities && (
          <>
            <div className="carry-label">{es.puntuaciones}</div>
            <div className="stats">
              {SCORES.map((key) => (
                <div className="stat" key={key}>
                  <span className="stat-label">{ABILITY_LABEL[key]}</span>
                  <span className="stat-mod">{formatMod(abilityMod(sheet.abilities![key]))}</span>
                  <span className="stat-score">{sheet.abilities![key]}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {rolls.length > 0 && (
          <div className="pc-field">
            <span>{es.tiradas}</span>
            <div className="rolls">
              {rolls.map(([label, value]) => (
                <span className="roll" key={label}>
                  {label} <b>{value}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {sheet && (
          <div className="pc-field">
            <span>{es.tiradasSalvacion}</span>
            <div className="rolls">
              {saves.map((s) => (
                <span className={`roll${s.proficient ? ' stated' : ''}`} key={s.ability}>
                  {s.label} <b>{s.mod === null ? '—' : formatMod(s.mod)}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="carry-label">{es.habilidades}</div>
        <div className="skill-grid">
          {skills.map((s) => (
            <div className={`skill${s.proficient ? ' stated' : ''}`} key={s.key}>
              <span className="skill-name">{s.name}</span>
              <span className="skill-ability">{ABILITY_LABEL[s.ability]}</span>
              <span className="skill-mod">{s.mod === null ? '—' : formatMod(s.mod)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
