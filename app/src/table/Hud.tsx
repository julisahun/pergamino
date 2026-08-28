/** The party strip along the bottom of the table screen. */
import type { TableCombatant, TableView } from '../../../shared/types.ts'
import { useAssetUrl } from '../assets/context.tsx'
import { es } from '../strings/es.ts'

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || name.slice(0, 2).toUpperCase()

function Face({ c }: { c: TableCombatant }) {
  const url = useAssetUrl(c.portrait)
  if (url) return <img className="hud-face" src={url} alt="" />
  return <div className="hud-face">{initials(c.name)}</div>
}

function Hp({ c }: { c: TableCombatant }) {
  if (c.hp !== undefined) {
    const max = c.hpMax
    const fraction = max ? Math.max(0, Math.min(1, c.hp / max)) : null
    return (
      <>
        <div className="hud-hp">
          {c.hp}
          {max !== undefined && ` / ${max}`}
          {c.temp ? ` (+${c.temp})` : ''}
        </div>
        {fraction !== null && (
          <div className="hud-bar">
            <span style={{ width: `${fraction * 100}%` }} />
          </div>
        )}
      </>
    )
  }
  if (c.hpFraction !== undefined) {
    return (
      <div className="hud-bar">
        <span style={{ width: `${c.hpFraction * 100}%` }} />
      </div>
    )
  }
  return null
}

export function Hud({ view }: { view: TableView }) {
  if (view.combatants.length === 0) return null
  const active = view.combatants.find((c) => c.ref === view.activeRef)

  return (
    <div className="hud">
      {view.round > 0 && view.activeRef && (
        <div className="hud-round">
          {es.ronda} {view.round}
          {active && (
            <>
              <br />
              {es.turnoDe} {active.name}
            </>
          )}
        </div>
      )}
      <div className="hud-list">
        {view.combatants.map((c) => (
          <div
            key={c.ref}
            className={`hud-card${c.ref === view.activeRef ? ' active' : ''}${c.dead ? ' dead' : ''}`}
          >
            <Face c={c} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="hud-name">{c.name}</div>
              <Hp c={c} />
              {c.conditions.length > 0 && (
                <div className="hud-conditions">
                  {c.conditions.map((cond) => (
                    <span key={cond}>{cond}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
