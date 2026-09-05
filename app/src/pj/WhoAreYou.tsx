import { es } from '../strings/es.ts'
import { usePj } from '../state/pjStore.ts'
import { Face } from './ui/Face.tsx'

/** The first thing a link shows: the party, and a way in for someone new. */
export function WhoAreYou() {
  const { title, party, choose, startCreate } = usePj()
  return (
    <div className="pj-page">
      <header className="pj-top">
        <div className="muted small">{title}</div>
        <h1>{es.quienEres}</h1>
        <p className="muted">{es.quienEresAyuda}</p>
      </header>
      <div className="pj-party-grid">
        {party.map((p) => (
          <button key={p.id} className="pj-party-card" onClick={() => choose(p.id)}>
            <Face src={p.portrait} name={p.name} size={56} />
            <div>
              <div className="pj-party-name">{p.name}</div>
              {p.player && <div className="muted small">{p.player}</div>}
            </div>
          </button>
        ))}
        {party.length === 0 && <p className="muted">{es.sinPersonajesAun}</p>}
      </div>
      <div className="pj-actions">
        <button className="primary big" onClick={startCreate}>
          {es.crearPersonaje}
        </button>
      </div>
    </div>
  )
}
