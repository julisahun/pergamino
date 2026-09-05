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
import { abilityMod, formatMod, type Abilities, type SheetStats } from '../../../shared/vault/sheet.ts'
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
  sheet: SheetStats | undefined
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rolls = [
    sheet?.initMod != null ? [es.iniciativaLarga, formatMod(sheet.initMod)] : null,
    sheet?.proficiency != null ? [es.competencia, formatMod(sheet.proficiency)] : null,
    sheet?.passivePerception != null
      ? [es.percepcionPasiva, String(sheet.passivePerception)]
      : null,
    sheet?.spellDc != null ? [es.cdConjuros, String(sheet.spellDc)] : null,
    sheet?.spellAttack != null ? [es.ataqueConjuros, formatMod(sheet.spellAttack)] : null,
    sheet?.spellAbility ? [es.conjurosPor, sheet.spellAbility] : null,
  ].filter(Boolean) as [string, string][]

  const skills = skillRows(sheet)
  // A sheet that quotes none tells us nothing about proficiency, so every row
  // is a bare ability modifier and the reader has to be told.
  const anyStated = skills.some((s) => s.stated)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Face src={c.portrait} name={c.name} className="crow-face" />
          <div style={{ flex: 1 }}>
            <h2>{c.name}</h2>
            {sheet?.summary && <div className="sub">{sheet.summary}</div>}
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

        {sheet?.saves.length ? (
          <div className="pc-field">
            <span>{es.tiradasSalvacion}</span>
            <div className="rolls">
              {sheet.saves.map((s) => (
                <span className="roll" key={s.name}>
                  {s.name} <b>{formatMod(s.mod)}</b>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="carry-label">{es.habilidades}</div>
        {!anyStated && <p className="muted skill-note">{es.habilidadesSinDeclarar}</p>}
        <div className="skill-grid">
          {skills.map((s) => (
            <div className={`skill${s.stated ? ' stated' : ''}`} key={s.name}>
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
