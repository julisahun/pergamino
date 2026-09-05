import type { TableCombatant } from '../../../../shared/types.ts'
import type { PlayerView } from '../../../../shared/session/player.ts'
import { es } from '../../strings/es.ts'
import { Face } from '../ui/Face.tsx'

function Row({ c, active }: { c: TableCombatant; active: boolean }) {
  return (
    <li className={`pj-row pj-combatant${active ? ' active' : ''}${c.dead ? ' dead' : ''}`}>
      <Face src={c.portrait} name={c.name} size={32} />
      <span className="pj-row-title">{c.name}</span>
      <span className="pj-row-meta">
        {c.hp !== undefined && (
          <b>
            {c.hp}
            {c.hpMax !== undefined && `/${c.hpMax}`}
          </b>
        )}
        {c.hpFraction !== undefined && (
          <span className="pj-bar">
            <span style={{ width: `${Math.round(c.hpFraction * 100)}%` }} />
          </span>
        )}
        {c.conditions.length > 0 && <span className="muted small">{c.conditions.join(', ')}</span>}
      </span>
    </li>
  )
}

/** What the television shows about everyone, and whose turn it is. */
export function Mesa({ view }: { view: PlayerView }) {
  const { party, foes, encounter } = view
  const me = `pc:${view.pc.id}`
  return (
    <>
      {encounter.on && (
        <div className={`pj-turn${encounter.myTurn ? ' mine' : ''}`}>
          {encounter.myTurn
            ? es.tuTurno
            : `${es.ronda} ${encounter.round}${encounter.active ? ` · ${es.turnoDeOtro} ${[...party, ...foes].find((c) => c.ref === encounter.active)?.name ?? '…'}` : ''}`}
        </div>
      )}
      <h3>{es.party}</h3>
      {party.length === 0 && <p className="muted">{es.nadieEnMesa}</p>}
      <ul className="pj-list">
        {party.map((c) => (
          <Row key={c.ref} c={c} active={encounter.active === c.ref || (c.ref === me && encounter.myTurn)} />
        ))}
      </ul>
      {foes.length > 0 && (
        <>
          <h3>{es.enemigos}</h3>
          <ul className="pj-list">
            {foes.map((c) => (
              <Row key={c.ref} c={c} active={encounter.active === c.ref} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}
