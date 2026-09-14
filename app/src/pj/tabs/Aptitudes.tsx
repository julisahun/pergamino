import { ABILITY_LABEL, sheetSaveRows, skillRows } from '../../../../shared/skills.ts'
import type { PlayerView } from '../../../../shared/session/player.ts'
import { abilityMod, formatMod, type Abilities } from '../../../../shared/character.ts'
import { es } from '../../strings/es.ts'

const SCORES: (keyof Abilities)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** Scores, saves and all eighteen skills — the sheet's numbers, marked for what they are. */
export function Aptitudes({ view }: { view: PlayerView }) {
  const { sheet } = view
  const rows = skillRows(sheet)
  return (
    <>
      {sheet.abilities && (
        <div className="pj-stats six">
          {SCORES.map((k) => (
            <div className="pj-stat" key={k}>
              <span className="pj-stat-value">{formatMod(abilityMod(sheet.abilities![k]))}</span>
              <span className="pj-stat-label">
                {ABILITY_LABEL[k]} {sheet.abilities![k]}
              </span>
            </div>
          ))}
        </div>
      )}

      <h3>{es.tiradasSalvacion}</h3>
      <ul className="pj-list">
        {sheetSaveRows(sheet).map((r) => (
          <li key={r.ability} className={`pj-row${r.proficient ? ' prof' : ''}`}>
            <span className="pj-row-title">
              {r.proficient && <span className="pj-dot" />}
              {r.label}
            </span>
            <b>{r.mod !== null ? formatMod(r.mod) : '—'}</b>
          </li>
        ))}
      </ul>

      <h3>{es.habilidades}</h3>
      <ul className="pj-list">
        {rows.map((r) => (
          <li
            key={r.key}
            className={`pj-row${r.proficient ? ' prof' : ''}`}
            title={r.expertise ? es.experticia : r.proficient ? es.competente : ''}
          >
            <span className="pj-row-title">
              {r.proficient && <span className={`pj-dot${r.expertise ? ' double' : ''}`} />}
              {r.name} <span className="muted small">{ABILITY_LABEL[r.ability]}</span>
            </span>
            <b>{r.mod !== null ? formatMod(r.mod) : '—'}</b>
          </li>
        ))}
      </ul>
    </>
  )
}
