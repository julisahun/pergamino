import { useEffect } from 'react'
import { es } from '../strings/es.ts'
import { usePj } from '../state/pjStore.ts'
import { CreateCharacter } from './CreateCharacter.tsx'
import { SheetScreen } from './SheetScreen.tsx'
import { WhoAreYou } from './WhoAreYou.tsx'

export function PlayerApp() {
  const { start, phase, error } = usePj()

  useEffect(() => {
    start()
    document.title = `${es.app} · ${es.ficha}`
  }, [start])

  switch (phase) {
    case 'cargando':
      return <div className="pj-center muted">{es.cargando}</div>
    case 'sin-enlace':
      return (
        <div className="pj-center">
          <h2>{es.sinEnlace}</h2>
          <p className="muted">{es.sinEnlaceAyuda}</p>
        </div>
      )
    case 'caducado':
      return (
        <div className="pj-center">
          <h2>{es.enlaceCaducado}</h2>
        </div>
      )
    case 'error':
      return (
        <div className="pj-center">
          <h2>{es.sinConexion}</h2>
          <p className="muted">{error}</p>
        </div>
      )
    case 'quien-eres':
      return <WhoAreYou />
    case 'crear':
      return <CreateCharacter />
    case 'ficha':
      return <SheetScreen />
  }
}
