/**
 * What is on the table screen right now — scene art or the tactical board —
 * with the turn order beside it. `field.mode` already modelled these as one
 * thing; this is the screen that matches.
 */
import { useMemo, useState } from 'react'
import type { Ref, Scene, Template } from '../../../shared/types.ts'
import { assetUrl } from '../../../shared/session/project.ts'
import { Art } from '../assets/context.tsx'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { Board, type BoardTool } from '../board/Board.tsx'
import { InitiativeRail } from './InitiativeRail.tsx'
import { Popover } from './Popover.tsx'
import { artIndex, combatants, isDead } from './combat.ts'

const basename = (p: string) => p.split('/').pop() ?? p

const TOOLS: { id: BoardTool; label: string; title: string }[] = [
  { id: 'select', label: '✥', title: es.mover },
  { id: 'measure', label: '↔', title: es.medir },
  { id: 'reveal', label: '☀', title: es.revelarNiebla },
  { id: 'hide', label: '☁', title: es.ocultarNiebla },
  { id: 'circle', label: '◯', title: es.circulo },
  { id: 'cone', label: '◺', title: es.cono },
  { id: 'line', label: '▬', title: es.linea },
]

export function MesaPanel() {
  const { scenes, pnjs, characters, sheets, state, frozen, assets, dispatch } = useDm()
  const [tool, setTool] = useState<BoardTool>('select')
  const [brush, setBrush] = useState(2)
  const [size, setSize] = useState(6)

  const art = useMemo(() => artIndex(pnjs), [pnjs])
  const pcs = useMemo(
    () =>
      characters.map((c) => ({
        id: c.id,
        name: c.name || c.id,
        hpMax: sheets[c.id]?.hpMax ?? null,
        initMod: sheets[c.id]?.initMod ?? 0,
        hasPortrait: Boolean(c.portrait?.stamp || c.portrait?.src),
      })),
    [characters, sheets],
  )

  const pieces = useMemo(() => {
    if (!state) return []
    return combatants(state, pcs, art).map((c) => ({
      ref: c.ref,
      name: c.name,
      portrait: c.portrait,
      dead: isDead(c),
      active: state.encounter.activeRef === c.ref,
      hidden: !(state.field.reveal[c.ref]?.on ?? c.ref.startsWith('pc:')),
    }))
  }, [state, pcs, art])

  if (!state) return null
  const { field } = state
  const current: Scene | undefined = scenes.find((s) => s.id === field.sceneId)
  const board = field.mode === 'tablero'
  const mapUrl = assetUrl(field.map?.src)

  const showScene = (scene: Scene) => {
    const same = field.sceneId === scene.id
    dispatch({ type: 'scene/show', sceneId: same ? null : scene.id })
    if (!same && scene.art?.src) dispatch({ type: 'field/map', src: scene.art.src })
  }

  const addTemplate = (t: Omit<Template, 'id'>) =>
    dispatch({ type: 'template/add', template: { ...t, id: `tpl-${Date.now().toString(36)}` } })

  return (
    <div className="mesa">
      <div className="mesa-bar">
        <button aria-pressed={!board} onClick={() => dispatch({ type: 'field/mode', mode: 'escena' })}>
          {es.modoEscena}
        </button>
        <button aria-pressed={board} onClick={() => dispatch({ type: 'field/mode', mode: 'tablero' })}>
          {es.modoTablero}
        </button>

        <span className="sep" />

        <button
          className={field.paused ? 'frozen-toggle on' : 'frozen-toggle'}
          aria-pressed={field.paused}
          title={es.congelarAyuda}
          onClick={() => dispatch({ type: 'field/paused', paused: !field.paused })}
        >
          {field.paused ? `⏸ ${es.congelada}` : `● ${es.enDirecto}`}
        </button>
        <button aria-pressed={field.hud} onClick={() => dispatch({ type: 'field/hud', hud: !field.hud })}>
          {field.hud ? es.hudOn : es.hudOff}
        </button>

        <span className="sep" />

        <Popover label={es.audio} active={Boolean(field.audio)}>
          {(close) =>
            field.audio ? (
              <>
                <div className="row" style={{ padding: '4px 8px' }}>
                  <strong style={{ flex: 1, fontSize: 12 }}>{basename(field.audio.src)}</strong>
                </div>
                <button
                  onClick={() => dispatch({ type: 'audio/playing', playing: !field.audio!.playing })}
                >
                  {field.audio.playing ? es.pausar : es.reproducir}
                </button>
                <div className="row" style={{ padding: '4px 8px' }}>
                  <span className="muted">{es.volumen}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={field.audio.volume}
                    onChange={(e) => dispatch({ type: 'audio/volume', volume: Number(e.target.value) })}
                  />
                </div>
                <div className="divider" />
                <button
                  onClick={() => {
                    dispatch({ type: 'audio/set', audio: null })
                    close()
                  }}
                >
                  {es.quitarAudio}
                </button>
              </>
            ) : assets.audio.length > 0 ? (
              assets.audio.map((src) => (
                <button
                  key={src}
                  onClick={() => {
                    dispatch({ type: 'audio/set', audio: { src, volume: 0.6, loop: true, playing: true } })
                    close()
                  }}
                >
                  {basename(src)}
                </button>
              ))
            ) : (
              <div className="muted" style={{ padding: '6px 10px', fontSize: 12 }}>
                {es.sinAudio}
              </div>
            )
          }
        </Popover>

        <Popover label={es.documentos} active={Boolean(field.handout)}>
          {(close) => (
            <>
              {field.handout && (
                <>
                  <button
                    onClick={() => {
                      dispatch({ type: 'handout/show', handout: null })
                      close()
                    }}
                  >
                    {es.quitarDocumento}
                  </button>
                  <div className="divider" />
                </>
              )}
              {[...assets.pdfs, ...assets.images].map((src) => {
                const kind = src.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'
                return (
                  <button
                    key={src}
                    aria-pressed={field.handout?.src === src}
                    onClick={() => {
                      dispatch({ type: 'handout/show', handout: { kind, src } })
                      close()
                    }}
                  >
                    {basename(src)}
                  </button>
                )
              })}
            </>
          )}
        </Popover>

        {board && (
          <>
            <span className="sep" />
            {TOOLS.map((t) => (
              <button
                key={t.id}
                aria-pressed={tool === t.id}
                title={t.title}
                onClick={() => setTool(t.id)}
                style={{ minWidth: 34, padding: '6px 8px' }}
              >
                {t.label}
              </button>
            ))}

            {(tool === 'reveal' || tool === 'hide') && (
              <label className="row" style={{ gap: 6 }}>
                <span className="muted">{es.pincel}</span>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={brush}
                  style={{ width: 70 }}
                  onChange={(e) => setBrush(Number(e.target.value))}
                />
              </label>
            )}
            {(tool === 'circle' || tool === 'cone' || tool === 'line') && (
              <label className="row" style={{ gap: 6 }}>
                <span className="muted">{es.tamano}</span>
                <input
                  type="range"
                  min={1.5}
                  max={30}
                  step={1.5}
                  value={size}
                  style={{ width: 80 }}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
                <span className="muted">{String(size).replace('.', ',')} m</span>
              </label>
            )}

            <span className="sep" />
            <Popover label={es.tablero}>
              {() => (
                <>
                  <button
                    aria-pressed={field.fog.on}
                    onClick={() => dispatch({ type: 'fog/on', on: !field.fog.on })}
                  >
                    {field.fog.on ? es.nieblaOn : es.nieblaOff}
                  </button>
                  <button onClick={() => dispatch({ type: 'fog/reset', revealed: true })}>
                    {es.revelarTodo}
                  </button>
                  <button onClick={() => dispatch({ type: 'fog/reset', revealed: false })}>
                    {es.cubrirTodo}
                  </button>
                  <div className="divider" />
                  <button onClick={() => dispatch({ type: 'token/placeAll' })}>{es.colocarFichas}</button>
                  <button
                    onClick={() => dispatch({ type: 'template/clear' })}
                    disabled={field.templates.length === 0}
                  >
                    {es.limpiarPlantillas}
                  </button>
                  <div className="divider" />
                  <div className="row" style={{ padding: '4px 8px', gap: 6 }}>
                    <span className="muted">{es.rejilla}</span>
                    <input
                      className="hp-input"
                      value={field.cols}
                      inputMode="numeric"
                      onChange={(e) =>
                        dispatch({
                          type: 'field/grid',
                          cols: Number(e.target.value.replace(/\D/g, '')) || field.cols,
                          rows: field.rows,
                        })
                      }
                    />
                    <span className="muted">×</span>
                    <input
                      className="hp-input"
                      value={field.rows}
                      inputMode="numeric"
                      onChange={(e) =>
                        dispatch({
                          type: 'field/grid',
                          cols: field.cols,
                          rows: Number(e.target.value.replace(/\D/g, '')) || field.rows,
                        })
                      }
                    />
                  </div>
                </>
              )}
            </Popover>
          </>
        )}
      </div>

      <div className={`mesa-main${field.paused ? ' frozen' : ''}`}>
        {field.paused && (
          <div className="frozen-banner">
            <span className="badge warn">⏸ {es.congelada}</span>
            <span className="muted">
              {es.congeladaEn}: {frozen?.scene ?? es.sinEscena}
              {frozen?.handout ? ` · ${es.documentos.toLowerCase()}` : ''}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={() => dispatch({ type: 'field/paused', paused: false })}>
              {es.descongelar}
            </button>
          </div>
        )}
        <div className={`mesa-stage${board ? ' is-board' : ''}`}>
          {board ? (
            <Board
              mapUrl={mapUrl}
              cols={field.cols}
              rows={field.rows}
              tokens={field.tokens}
              pieces={pieces}
              fog={field.fog}
              templates={field.templates}
              interactive
              tool={tool}
              brush={brush}
              templateSize={size}
              onMoveToken={(ref, x, y) => dispatch({ type: 'token/move', ref: ref as Ref, x, y })}
              onPaintFog={(cells, reveal) => dispatch({ type: 'fog/paint', cells, reveal })}
              onAddTemplate={addTemplate}
            />
          ) : (
            <div className="scene-grid">
              {scenes.map((scene) => {
                const live = field.sceneId === scene.id
                return (
                  <button
                    key={scene.id}
                    className="scene-card"
                    aria-pressed={live}
                    onClick={() => showScene(scene)}
                    title={live ? es.ocultarEscena : scene.name}
                  >
                    {/* The empty div keeps the card its size while the art is
                        being read off disk, and for scenes that have none. */}
                    <div style={{ height: '100%' }} />
                    <Art src={assetUrl(scene.art?.src)} alt="" loading="lazy" />
                    {live && <span className="live">{es.enPantalla}</span>}
                    <span className="label">{scene.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="mesa-read">
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="label">{es.paraLeer}</span>
            <div style={{ flex: 1 }} />
            {current && current.roster.length > 0 && (
              <button
                className="mini"
                onClick={() => dispatch({ type: 'roster/load', sceneId: current.id })}
              >
                {es.cargarReparto} · {current.roster.map((r) => `${r.count}×`).join(' ')}
              </button>
            )}
          </div>
          <p className={`readaloud${current?.note ? '' : ' empty'}`}>
            {current ? current.note || es.sinNota : es.sinEscena}
          </p>
        </div>
      </div>

      <InitiativeRail />
    </div>
  )
}
