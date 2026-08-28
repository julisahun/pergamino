/**
 * Grid geometry. The campaign notes speak metres ("6/18 m", "1,5 m"), so this
 * is metric throughout: one square is 1.5 m.
 *
 * Measuring is all that is left here. Area templates and the fog brush lived
 * beside it — `templateShape`, `brushCells`, and the row-major `cellIndex`
 * pair the fog payload needed — and went with the tools that drew them.
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
