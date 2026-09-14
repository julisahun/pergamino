import type { PlayerView } from '../../../../shared/session/player.ts'
import type { TraitSource } from '../../../../shared/character.ts'
import { es } from '../../strings/es.ts'
import { Expandable } from '../ui/Expandable.tsx'

const ORDER: TraitSource[] = ['class', 'species', 'background', 'feat']

/** Every trait, with the text the sheet gives it, grouped by where it came from. */
export function Rasgos({ view }: { view: PlayerView }) {
  const { sheet } = view
  const label: Record<TraitSource, string> = {
    class: sheet.className ?? 'Clase',
    species: sheet.species ?? 'Especie',
    background: sheet.background ?? 'Trasfondo',
    feat: 'Dotes',
  }
  if (sheet.traits.length === 0) return <p className="muted">{es.sinRasgos}</p>
  return (
    <>
      {ORDER.map((source) => {
        const traits = sheet.traits.filter((t) => t.source === source)
        if (traits.length === 0) return null
        return (
          <section key={source}>
            <h3>{label[source]}</h3>
            {traits.map((t) => (
              <Expandable key={t.id} title={t.name}>
                <p>{t.text}</p>
              </Expandable>
            ))}
          </section>
        )
      })}
    </>
  )
}
