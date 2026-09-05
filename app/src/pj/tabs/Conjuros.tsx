import type { PlayerView } from '../../../../shared/session/player.ts'
import { makeRef } from '../../../../shared/types.ts'
import { es } from '../../strings/es.ts'
import { usePj } from '../../state/pjStore.ts'
import { Expandable } from '../ui/Expandable.tsx'
import { Pips } from '../ui/Pips.tsx'

/** Slots to tap and every spell with its text. */
export function Conjuros({ view, disabled }: { view: PlayerView; disabled: boolean }) {
  const dispatch = usePj((s) => s.dispatch)
  const ref = makeRef('pc', view.pc.id)
  const { sheet, live } = view
  const levels = Object.keys(sheet.slots).sort()
  const byLevel = new Map<number, typeof sheet.spells>()
  for (const s of sheet.spells) byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), s])

  return (
    <>
      {levels.length > 0 && (
        <>
          <h3>{es.espacios}</h3>
          <ul className="pj-list">
            {levels.map((level) => (
              <li key={level} className="pj-row">
                <span className="pj-row-title">
                  {es.nivelN} {level}
                </span>
                <Pips
                  total={sheet.slots[level]!}
                  used={live.spent[level] ?? 0}
                  label={`${es.nivelN} ${level}`}
                  onChange={(spent) => !disabled && dispatch({ type: 'slots/set', ref, level, spent })}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {[...byLevel.keys()]
        .sort((a, b) => a - b)
        .map((level) => (
          <section key={level}>
            <h3>{level === 0 ? es.trucos : `${es.nivelN} ${level}`}</h3>
            {byLevel.get(level)!.map((s) => (
              <Expandable
                key={s.name}
                title={s.name}
                meta={[s.school, s.time, s.ritual ? es.ritual : null].filter(Boolean).join(' · ')}
              >
                <dl className="pj-dl">
                  {s.range && (
                    <>
                      <dt>{es.alcance}</dt>
                      <dd>{s.range}</dd>
                    </>
                  )}
                  {s.duration && (
                    <>
                      <dt>{es.duracion}</dt>
                      <dd>{s.duration}</dd>
                    </>
                  )}
                  {s.components && (
                    <>
                      <dt>{es.componentes}</dt>
                      <dd>{s.components}</dd>
                    </>
                  )}
                  {s.roll && (
                    <>
                      <dt>{es.dano}</dt>
                      <dd>{s.roll}</dd>
                    </>
                  )}
                </dl>
                <p>{s.text}</p>
              </Expandable>
            ))}
          </section>
        ))}
      {levels.length === 0 && sheet.spells.length === 0 && <p className="muted">{es.sinConjuros}</p>}
    </>
  )
}
