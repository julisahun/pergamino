/**
 * What a campaign folder is, and the file that says it in full.
 *
 * The welcome screen asks for a folder without ever saying what has to be
 * inside one, which is fine for the DM whose vault is already shaped like this
 * and useless for anyone else — the format lived in `importing.md`, and that
 * file is gone.
 *
 * `instructions.md` is the format written for an LLM to convert existing
 * material with, so the useful thing to do with it is hand it over rather than
 * read it here: the sheet describes the shape and the button downloads the
 * whole contract.
 *
 * The markdown is bundled with `?raw` so the download is the repo's own file,
 * not a copy that drifts from it. Nothing is fetched: this page has no server
 * to fetch from.
 */
import { useEffect } from 'react'
import { es } from '../strings/es.ts'
import instructions from '../../../instructions.md?raw'

const FOLDERS: [string, string][] = [
  ['pnj/', es.formatoPnj],
  ['objects/', es.formatoObjetos],
  ['scenarios/', es.formatoEscenas],
  ['players/', es.formatoPlayers],
  ['story/', es.formatoStory],
  ['assets/', es.formatoAssets],
  ['runs/', es.formatoRuns],
]

export function CampaignFormat({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([instructions], { type: 'text/markdown;charset=utf-8' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'instructions.md'
    a.click()
    // Revoking in the same tick can beat the download in some builds.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet format-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{es.formatoTitulo}</h2>
        <div className="sub">{es.formatoSub}</div>

        <p>{es.formatoQueEs}</p>

        <ul className="format-list">
          {FOLDERS.map(([dir, what]) => (
            <li key={dir}>
              <code>{dir}</code>
              <span>{what}</span>
            </li>
          ))}
        </ul>

        <p>{es.formatoLlm}</p>
        <p className="muted small">{es.formatoReglas}</p>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" onClick={download}>
            {es.formatoDescargar}
          </button>
          <button onClick={onClose}>{es.cerrar}</button>
        </div>
      </div>
    </div>
  )
}
