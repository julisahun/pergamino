import { attacksOfSheet } from '../../../../shared/combat/attacks.ts'
import { formatDice } from '../../../../shared/combat/dice.ts'
import type { PlayerView } from '../../../../shared/session/player.ts'
import { formatMod } from '../../../../shared/vault/sheet.ts'
import { es } from '../../strings/es.ts'

/** The numbers read out loud in a fight, and what the character swings. */
export function Combate({ view }: { view: PlayerView }) {
  const { sheet } = view
  const stats: [string, string | null][] = [
    [es.ca, sheet.ac !== null ? String(sheet.ac) : null],
    [es.iniciativaLarga, sheet.initMod !== null ? formatMod(sheet.initMod) : null],
    [es.velocidadLabel, sheet.speed !== null ? String(sheet.speed) : null],
    [es.competencia, sheet.proficiency !== null ? formatMod(sheet.proficiency) : null],
    [es.percepcionPasiva, sheet.passivePerception !== null ? String(sheet.passivePerception) : null],
    [es.cdConjuros, sheet.spellDc !== null ? String(sheet.spellDc) : null],
    [es.ataqueConjuros, sheet.spellAttack !== null ? formatMod(sheet.spellAttack) : null],
  ]
  const attacks = attacksOfSheet(sheet)

  return (
    <>
      <div className="pj-stats">
        {stats
          .filter(([, v]) => v !== null)
          .map(([label, value]) => (
            <div className="pj-stat" key={label}>
              <span className="pj-stat-value">{value}</span>
              <span className="pj-stat-label">{label}</span>
            </div>
          ))}
      </div>

      <h3>{es.ataque}</h3>
      {attacks.length === 0 && <p className="muted">{es.sinEquipo}</p>}
      <ul className="pj-list">
        {attacks.map((a) => (
          <li key={a.id} className="pj-row">
            <span className="pj-row-title">{a.name}</span>
            <span className="pj-row-meta">
              {a.kind === 'attack' && a.mod !== null && <b>{formatMod(a.mod)}</b>}
              {a.kind === 'save' && a.save && (
                <b>
                  {es.salvacion} {a.save.ability} · CD {a.save.dc}
                </b>
              )}
              {a.kind === 'heal' && <b>{es.curacion}</b>}
              <span className="pj-dice">{formatDice(a.dice)}</span>
              {a.save?.half && <span className="muted small">{es.mitadSiAcierta}</span>}
            </span>
          </li>
        ))}
      </ul>

      {sheet.weapons.length > 0 && (
        <ul className="pj-list muted small">
          {sheet.weapons.map((w) => (
            <li key={w.name}>
              <b>{w.name}</b> — {w.text || w.damage}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
