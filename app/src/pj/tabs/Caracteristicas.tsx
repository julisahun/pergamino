import { ABILITY_LABEL, skillRows } from '../../../../shared/skills.ts'
import type { PlayerView } from '../../../../shared/session/player.ts'
import { abilityMod, formatMod, type Abilities } from '../../../../shared/vault/sheet.ts'
import { es } from '../../strings/es.ts'

const SCORES: (keyof Abilities)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** Scores, saves and all eighteen skills — the sheet's numbers, marked for what they are. */
export function Caracteristicas({ view }: { view: PlayerView }) {
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
        {SCORES.map((k) => {
          const stated = sheet.saves.find((s) => s.name.toUpperCase().startsWith(ABILITY_LABEL[k].slice(0, 3)))
          const proficient = sheet.proficient.saves.includes(k)
          const mod = stated
            ? stated.mod
            : sheet.abilities
              ? abilityMod(sheet.abilities[k]) + (proficient && sheet.proficiency !== null ? sheet.proficiency : 0)
              : null
          return (
            <li key={k} className={`pj-row${proficient ? ' prof' : ''}`}>
              <span className="pj-row-title">
                {proficient && <span className="pj-dot" />}
                {ABILITY_LABEL[k]}
              </span>
              <b>{mod !== null ? formatMod(mod) : '—'}</b>
            </li>
          )
        })}
      </ul>

      <h3>{es.habilidades}</h3>
      <ul className="pj-list">
        {rows.map((r) => (
          <li
            key={r.name}
            className={`pj-row${r.proficient ? ' prof' : ''}`}
            title={r.derived ? es.derivado : r.expertise ? es.experticia : r.proficient ? es.competente : ''}
          >
            <span className="pj-row-title">
              {r.proficient && <span className={`pj-dot${r.expertise ? ' double' : ''}`} />}
              {r.name} <span className="muted small">{ABILITY_LABEL[r.ability]}</span>
            </span>
            <b className={r.derived ? 'muted' : ''}>{r.mod !== null ? formatMod(r.mod) : '—'}</b>
          </li>
        ))}
      </ul>
    </>
  )
}
