/**
 * The player-facing screen.
 *
 * A pure subscriber: it renders the frame the DM window published and the
 * assets that frame named, and it has no way to ask for anything else. There
 * is no directory handle in this window, so "anything else" is not a thing it
 * could reach for even if it wanted to.
 */
import { useEffect } from 'react'
import { useAssetUrl } from '../assets/context.tsx'
import type { Handout } from '../../../shared/types.ts'
import { useTable } from '../state/tableStore.ts'
import { es } from '../strings/es.ts'
import { Hud } from './Hud.tsx'
import { SceneLayer } from './SceneLayer.tsx'
import { TableBoard } from './TableBoard.tsx'
import { Ambience } from './Ambience.tsx'

export function TableScreen() {
  const { view, status, start } = useTable()

  useEffect(() => {
    start()
    document.title = es.pantalla
  }, [start])

  if (!view) {
    return (
      <div className="table-screen">
        <div className="table-idle">
          {status === 'en-directo' ? es.conectando : es.esperandoConsola}
        </div>
      </div>
    )
  }

  const board = view.mode === 'tablero' && view.grid !== null
  const empty = !board && !view.scene && !view.handout

  return (
    <div className="table-screen">
      {board ? <TableBoard view={view} /> : <SceneLayer scene={view.scene} />}

      {/* Nothing chosen yet: a quiet title beats a black void on the TV. */}
      {empty && (
        <div className="table-title">
          <h1>{view.title}</h1>
        </div>
      )}

      {view.handout && <HandoutLayer handout={view.handout} />}

      {view.hud && <Hud view={view} />}

      <Ambience audio={view.audio} />
    </div>
  )
}

function HandoutLayer({ handout }: { handout: Handout }) {
  const url = useAssetUrl(handout.src)
  if (!url) return null
  return (
    <div className="handout">
      {handout.kind === 'pdf' ? (
        <iframe src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} title="" />
      ) : (
        <img src={url} alt="" />
      )}
    </div>
  )
}
