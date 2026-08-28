/**
 * Grid geometry. The campaign notes speak metres ("6/18 m", "1,5 m"), so this
 * is metric throughout: one square is 1.5 m.
 */
export const METRES_PER_CELL = 1.5

export interface Cell {
  x: number
  y: number
}

/**
 * Distance between two squares, using 5e's default rule where a diagonal
 * costs the same as a straight step (Chebyshev), not Pythagoras.
 */
export function cellDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * METRES_PER_CELL
}

/** Formatted the way the notes write it: `7,5 m`. */
export function formatMetres(m: number): string {
  const rounded = Math.round(m * 10) / 10
  return `${String(rounded).replace('.', ',')} m`
}

export const metresToCells = (m: number): number => m / METRES_PER_CELL

export type TemplateKind = 'circle' | 'cone' | 'line'

export interface Template {
  id: string
  kind: TemplateKind
  /** Origin, in grid coordinates (cell corners, so 0..cols). */
  x: number
  y: number
  /** Radius for a circle, length for a cone or line, in metres. */
  size: number
  /** Direction in degrees, clockwise from east. Ignored by circles. */
  angle: number
}

/** SVG geometry for a template, in cell units, ready to scale by cell size. */
export function templateShape(
  t: Template,
): { kind: 'circle'; cx: number; cy: number; r: number } | { kind: 'polygon'; points: [number, number][] } {
  const length = metresToCells(t.size)
  const rad = (t.angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)

  if (t.kind === 'circle') {
    return { kind: 'circle', cx: t.x, cy: t.y, r: length }
  }
  if (t.kind === 'cone') {
    // A 5e cone is as wide at its end as it is long.
    const endX = t.x + dx * length
    const endY = t.y + dy * length
    const halfWidth = length / 2
    const px = -dy * halfWidth
    const py = dx * halfWidth
    return {
      kind: 'polygon',
      points: [
        [t.x, t.y],
        [endX + px, endY + py],
        [endX - px, endY - py],
      ],
    }
  }
  // A line is 1,5 m wide — one square.
  const half = 0.5
  const px = -dy * half
  const py = dx * half
  const endX = t.x + dx * length
  const endY = t.y + dy * length
  return {
    kind: 'polygon',
    points: [
      [t.x + px, t.y + py],
      [endX + px, endY + py],
      [endX - px, endY - py],
      [t.x - px, t.y - py],
    ],
  }
}

/** Fog cells are stored as row-major indices so the payload stays small. */
export const cellIndex = (x: number, y: number, cols: number): number => y * cols + x
export const cellFromIndex = (i: number, cols: number): Cell => ({
  x: i % cols,
  y: Math.floor(i / cols),
})

/** Every cell within `radius` cells of (cx, cy), for the fog brush. */
export function brushCells(
  cx: number,
  cy: number,
  radius: number,
  cols: number,
  rows: number,
): number[] {
  const out: number[] = []
  const r = Math.max(0, Math.floor(radius))
  for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r) out.push(cellIndex(x, y, cols))
    }
  }
  return out
}
