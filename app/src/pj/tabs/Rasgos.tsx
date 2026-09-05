import type { PlayerView } from '../../../../shared/session/player.ts'
import type { FeatSource } from '../../../../shared/vault/sheet.ts'
import { es } from '../../strings/es.ts'
import { Expandable } from '../ui/Expandable.tsx'

const ORDER: FeatSource[] = ['class', 'race', 'background', 'feat']

/** Every trait, with the text the sheet gives it, grouped by where it came from. */
export function Rasgos({ view }: { view: PlayerView }) {
  const { sheet } = view
  const label: Record<FeatSource, string> = {
    class: sheet.className ?? 'Clase',
    race: sheet.race ?? 'Especie',
    background: sheet.background ?? 'Trasfondo',
    feat: 'Dotes',
  }
  if (sheet.feats.length === 0) return <p className="muted">{es.sinRasgos}</p>
  return (
    <>
      {ORDER.map((source) => {
        const feats = sheet.feats.filter((f) => f.source === source)
        if (feats.length === 0) return null
        return (
          <section key={source}>
            <h3>{label[source]}</h3>
            {feats.map((f, i) => (
              <Expandable key={`${f.name}-${i}`} title={f.name}>
                <p>{f.text}</p>
              </Expandable>
            ))}
          </section>
        )
      })}
    </>
  )
}
