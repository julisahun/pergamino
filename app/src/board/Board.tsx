/**
 * The tactical board, shared by both windows.
 *
 * The DM instance is interactive; the table instance is inert. Both draw from
 * the same geometry so what the DM measures is what the players see.
 *
 * It used to carry fog of war and area templates as well. Measuring is the
 * only thing drawn over the map now, and it is drawn nowhere else: it lives
 * entirely in this component's own state, so nothing about a measurement
 * reaches the session or the television.
 */
import { useMemo, useRef, useState } from 'react'
import type { Token } from '../../../shared/types.ts'
import { cellDistance, formatMetres } from '../../../shared/grid.ts'
import { useAssetUrl } from '../assets/context.tsx'
import {
  cellMetrics,
  pointToCell,
  snap,
  useContainBox,
  type Natural,
} from './geometry.ts'

export interface BoardToken {
  ref: string
  name: string
  /** Asset key, resolved by whichever cache this window provides. */
  portrait: string | null
  dead: boolean
  active: boolean
  /** Rendered dashed on the DM board: placed, but not visible to the players. */
  hidden: boolean
}

export type BoardTool = 'select' | 'measure'

export interface BoardProps {
  /** Asset key for the map or scene art behind the grid. */
  mapUrl: string | null
  cols: number
  rows: number
  tokens: Record<string, Token>
  pieces: BoardToken[]
  showGrid?: boolean
  interactive?: boolean
  tool?: BoardTool
  onMoveToken?: (ref: string, x: number, y: number) => void
  onSelectToken?: (ref: string) => void
}

/** A token's face. Its own component so each portrait resolves on its own. */
function TokenFace({ portrait, name }: { portrait: string | null; name: string }) {
  const url = useAssetUrl(portrait)
  if (!url) return <span>{initials(name)}</span>
  return <img src={url} alt="" draggable={false} />
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || name.slice(0, 2).toUpperCase()

interface Drag {
  ref: string
  x: number
  y: number
}

interface Measure {
  from: { x: number; y: number }
  to: { x: number; y: number }
}

export function Board(props: BoardProps) {
  const {
    mapUrl,
    cols,
    rows,
    tokens,
    pieces,
    showGrid = true,
    interactive = false,
    tool = 'select',
  } = props

  const map = useAssetUrl(mapUrl)
  const hostRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<Natural | null>(null)
  const box = useContainBox(hostRef, natural)
  const cell = cellMetrics(box, cols, rows)

  const [drag, setDrag] = useState<Drag | null>(null)
  const [measure, setMeasure] = useState<Measure | null>(null)

  const byRef = useMemo(() => new Map(pieces.map((p) => [p.ref, p])), [pieces])

  const toCell = (e: { clientX: number; clientY: number }) =>
    hostRef.current
      ? pointToCell(e.clientX, e.clientY, hostRef.current, box, cols, rows)
      : { x: 0, y: 0 }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || !cell.w || tool !== 'measure') return
    const p = toCell(e)
    setMeasure({ from: snap(p.x, p.y, cols, rows), to: snap(p.x, p.y, cols, rows) })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || !cell.w) return
    const p = toCell(e)
    if (drag) {
      setDrag({ ...drag, x: p.x, y: p.y })
      return
    }
    if (measure) setMeasure({ ...measure, to: snap(p.x, p.y, cols, rows) })
  }

  const onPointerUp = () => {
    if (drag) {
      const s = snap(drag.x, drag.y, cols, rows)
      props.onMoveToken?.(drag.ref, s.x, s.y)
      setDrag(null)
    }
    setMeasure(null)
  }

  const startDrag = (e: React.PointerEvent, ref: string) => {
    if (!interactive || tool !== 'select') return
    e.stopPropagation()
    props.onSelectToken?.(ref)
    const p = toCell(e)
    setDrag({ ref, x: p.x, y: p.y })
    ;(e.currentTarget.parentElement as HTMLElement)?.setPointerCapture?.(e.pointerId)
  }

  const px = (x: number) => box.left + x * cell.w
  const py = (y: number) => box.top + y * cell.h
  const tokenSize = cell.size * 0.86

  return (
    <div
      className={`board tool-${tool}`}
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {map && (
        <img
          className="board-map"
          src={map}
          alt=""
          draggable={false}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}

      <svg
        className="board-overlay"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        viewBox={`0 0 ${cols} ${rows}`}
        preserveAspectRatio="none"
      >
        {showGrid && (
          <g className="grid-lines">
            {Array.from({ length: cols - 1 }, (_, i) => (
              <line key={`v${i}`} x1={i + 1} y1={0} x2={i + 1} y2={rows} />
            ))}
            {Array.from({ length: rows - 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i + 1} x2={cols} y2={i + 1} />
            ))}
          </g>
        )}

        {measure && (
          <line
            className="measure-line"
            x1={measure.from.x + 0.5}
            y1={measure.from.y + 0.5}
            x2={measure.to.x + 0.5}
            y2={measure.to.y + 0.5}
          />
        )}
      </svg>

      {Object.entries(tokens).map(([ref, pos]) => {
        const piece = byRef.get(ref)
        if (!piece) return null
        const dragging = drag?.ref === ref
        const x = dragging ? drag.x - 0.5 : pos.x
        const y = dragging ? drag.y - 0.5 : pos.y
        return (
          <div
            key={ref}
            className={`token${piece.dead ? ' dead' : ''}${piece.active ? ' active' : ''}${
              piece.hidden ? ' hidden-token' : ''
            }${dragging ? ' dragging' : ''}${ref.startsWith('pc:') ? ' pc' : ' npc'}`}
            style={{
              left: px(x) + (cell.w - tokenSize) / 2,
              top: py(y) + (cell.h - tokenSize) / 2,
              width: tokenSize,
              height: tokenSize,
              cursor: interactive && tool === 'select' ? 'grab' : undefined,
            }}
            onPointerDown={(e) => startDrag(e, ref)}
            title={piece.name}
          >
            <TokenFace portrait={piece.portrait} name={piece.name} />
            <b className="token-name" style={{ fontSize: Math.max(9, tokenSize * 0.2) }}>
              {piece.name}
            </b>
          </div>
        )
      })}

      {measure && (
        <div
          className="measure-label"
          style={{
            left: px(measure.to.x + 0.5),
            top: py(measure.to.y + 0.5) - 28,
          }}
        >
          {formatMetres(cellDistance(measure.from, measure.to))}
        </div>
      )}

      {!map && <div className="board-empty">—</div>}
    </div>
  )
}
