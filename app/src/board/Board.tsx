/**
 * The tactical board, shared by both windows.
 *
 * The DM instance is interactive and shows the fog translucently; the table
 * instance is inert and the fog is opaque. Both draw from the same geometry so
 * what the DM measures is what the players see.
 */
import { useMemo, useRef, useState } from 'react'
import type { Template, Token } from '../../../shared/types.ts'
import {
  cellDistance,
  cellFromIndex,
  cellIndex,
  formatMetres,
  templateShape,
} from '../../../shared/grid.ts'
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

export type BoardTool = 'select' | 'reveal' | 'hide' | 'measure' | 'circle' | 'cone' | 'line'

export interface BoardProps {
  /** Asset key for the map or scene art behind the grid. */
  mapUrl: string | null
  cols: number
  rows: number
  tokens: Record<string, Token>
  pieces: BoardToken[]
  fog: { on: boolean; revealed: number[] }
  templates: Template[]
  showGrid?: boolean
  interactive?: boolean
  tool?: BoardTool
  brush?: number
  templateSize?: number
  onMoveToken?: (ref: string, x: number, y: number) => void
  onPaintFog?: (cells: number[], reveal: boolean) => void
  onAddTemplate?: (t: Omit<Template, 'id'>) => void
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

/** A template being aimed: dropped at the origin, angled by dragging out. */
interface Pending {
  kind: 'circle' | 'cone' | 'line'
  x: number
  y: number
  angle: number
}

export function Board(props: BoardProps) {
  const {
    mapUrl,
    cols,
    rows,
    tokens,
    pieces,
    fog,
    templates,
    showGrid = true,
    interactive = false,
    tool = 'select',
    brush = 1,
    templateSize = 6,
  } = props

  const map = useAssetUrl(mapUrl)
  const hostRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<Natural | null>(null)
  const box = useContainBox(hostRef, natural)
  const cell = cellMetrics(box, cols, rows)

  const [drag, setDrag] = useState<Drag | null>(null)
  const [measure, setMeasure] = useState<Measure | null>(null)
  const [painting, setPainting] = useState<boolean | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const byRef = useMemo(() => new Map(pieces.map((p) => [p.ref, p])), [pieces])
  const revealed = useMemo(() => new Set(fog.revealed), [fog.revealed])

  const toCell = (e: { clientX: number; clientY: number }) =>
    hostRef.current
      ? pointToCell(e.clientX, e.clientY, hostRef.current, box, cols, rows)
      : { x: 0, y: 0 }

  const paintAt = (cx: number, cy: number, reveal: boolean) => {
    const cells: number[] = []
    const r = Math.max(0, Math.floor(brush) - 1)
    for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++) {
        cells.push(cellIndex(x, y, cols))
      }
    }
    props.onPaintFog?.(cells, reveal)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || !cell.w) return
    const p = toCell(e)
    const s = snap(p.x, p.y, cols, rows)
    if (tool === 'reveal' || tool === 'hide') {
      const reveal = tool === 'reveal'
      setPainting(reveal)
      paintAt(s.x, s.y, reveal)
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (tool === 'measure') {
      setMeasure({ from: s, to: s })
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (tool === 'circle' || tool === 'cone' || tool === 'line') {
      setPending({ kind: tool, x: p.x, y: p.y, angle: 0 })
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || !cell.w) return
    const p = toCell(e)
    if (drag) {
      setDrag({ ...drag, x: p.x, y: p.y })
      return
    }
    if (pending) {
      // Drag away from the origin to aim a cone or a line.
      const dx = p.x - pending.x
      const dy = p.y - pending.y
      if (Math.hypot(dx, dy) > 0.25) {
        setPending({ ...pending, angle: (Math.atan2(dy, dx) * 180) / Math.PI })
      }
      return
    }
    const s = snap(p.x, p.y, cols, rows)
    if (painting !== null) paintAt(s.x, s.y, painting)
    else if (measure) setMeasure({ ...measure, to: s })
  }

  const onPointerUp = () => {
    if (drag) {
      const s = snap(drag.x, drag.y, cols, rows)
      props.onMoveToken?.(drag.ref, s.x, s.y)
      setDrag(null)
    }
    if (pending) {
      props.onAddTemplate?.({ ...pending, size: templateSize })
      setPending(null)
    }
    setPainting(null)
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
        <defs>
          <mask id="fog-mask">
            <rect x="0" y="0" width={cols} height={rows} fill="white" />
            {[...revealed].map((i) => {
              const c = cellFromIndex(i, cols)
              return <rect key={i} x={c.x} y={c.y} width="1" height="1" fill="black" />
            })}
          </mask>
        </defs>

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

        {[
          ...templates,
          ...(pending ? [{ ...pending, id: '__pending', size: templateSize }] : []),
        ].map((t) => {
          const shape = templateShape(t)
          const cls = t.id === '__pending' ? 'template pending' : 'template'
          return shape.kind === 'circle' ? (
            <circle key={t.id} className={cls} cx={shape.cx} cy={shape.cy} r={shape.r} />
          ) : (
            <polygon
              key={t.id}
              className={cls}
              points={shape.points.map(([x, y]) => `${x},${y}`).join(' ')}
            />
          )
        })}

        {fog.on && (
          <rect
            className={`fog${interactive ? ' fog-dm' : ''}`}
            x="0"
            y="0"
            width={cols}
            height={rows}
            mask="url(#fog-mask)"
          />
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
        // The players' board hides anyone standing in unexplored fog; the DM's
        // board always shows everyone.
        if (!interactive && fog.on && !revealed.has(cellIndex(pos.x, pos.y, cols))) {
          return null
        }
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
