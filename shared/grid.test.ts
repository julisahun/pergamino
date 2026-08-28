import { describe, expect, it } from 'vitest'
import {
  brushCells,
  cellDistance,
  cellFromIndex,
  cellIndex,
  formatMetres,
  METRES_PER_CELL,
  templateShape,
} from './grid.ts'

describe('cellDistance', () => {
  it('counts a straight step as one square', () => {
    expect(cellDistance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1.5)
    expect(cellDistance({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(6)
  })

  it('counts a diagonal as one square too, per the default 5e rule', () => {
    expect(cellDistance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1.5)
    expect(cellDistance({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(4.5)
  })

  it('takes the longer axis on a mixed move', () => {
    expect(cellDistance({ x: 0, y: 0 }, { x: 4, y: 2 })).toBe(6)
  })

  it('is symmetric and zero for the same square', () => {
    expect(cellDistance({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(0)
    expect(cellDistance({ x: 5, y: 1 }, { x: 2, y: 3 })).toBe(
      cellDistance({ x: 2, y: 3 }, { x: 5, y: 1 }),
    )
  })

  it('covers the harpoon ranges the vault quotes (6/18 m)', () => {
    // arpón de nasa: "arrojadiza 6/18 m"
    expect(cellDistance({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(6)
    expect(cellDistance({ x: 0, y: 0 }, { x: 12, y: 0 })).toBe(18)
  })
})

describe('formatMetres', () => {
  it('uses the comma decimal the notes use', () => {
    expect(formatMetres(1.5)).toBe('1,5 m')
    expect(formatMetres(6)).toBe('6 m')
    expect(formatMetres(4.5)).toBe('4,5 m')
  })
})

describe('cell indices', () => {
  it('round-trips through row-major indices', () => {
    expect(cellIndex(3, 2, 16)).toBe(35)
    expect(cellFromIndex(35, 16)).toEqual({ x: 3, y: 2 })
  })
})

describe('brushCells', () => {
  it('returns just the cell for radius 0', () => {
    expect(brushCells(2, 2, 0, 16, 9)).toEqual([cellIndex(2, 2, 16)])
  })

  it('clips at the board edges', () => {
    const cells = brushCells(0, 0, 2, 16, 9)
    for (const i of cells) {
      const { x, y } = cellFromIndex(i, 16)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
    }
    expect(cells).toContain(cellIndex(0, 0, 16))
  })

  it('grows with the radius', () => {
    expect(brushCells(5, 4, 2, 16, 9).length).toBeGreaterThan(
      brushCells(5, 4, 1, 16, 9).length,
    )
  })
})

describe('templateShape', () => {
  it('sizes a circle in cells', () => {
    const s = templateShape({ id: 'a', kind: 'circle', x: 4, y: 4, size: 6, angle: 0 })
    expect(s).toEqual({ kind: 'circle', cx: 4, cy: 4, r: 6 / METRES_PER_CELL })
  })

  it('makes a cone as wide at its end as it is long', () => {
    const s = templateShape({ id: 'a', kind: 'cone', x: 0, y: 0, size: 4.5, angle: 0 })
    if (s.kind !== 'polygon') throw new Error('expected a polygon')
    const [origin, a, b] = s.points as [number, number][]
    expect(origin).toEqual([0, 0])
    const width = Math.hypot(a![0] - b![0], a![1] - b![1])
    const length = 4.5 / METRES_PER_CELL
    expect(width).toBeCloseTo(length)
  })

  it('makes a line one square wide', () => {
    const s = templateShape({ id: 'a', kind: 'line', x: 0, y: 0, size: 9, angle: 0 })
    if (s.kind !== 'polygon') throw new Error('expected a polygon')
    expect(s.points).toHaveLength(4)
    const [p0, , , p3] = s.points as [number, number][]
    expect(Math.hypot(p0![0] - p3![0], p0![1] - p3![1])).toBeCloseTo(1)
  })

  it('points the cone where the angle says', () => {
    const east = templateShape({ id: 'a', kind: 'cone', x: 0, y: 0, size: 4.5, angle: 0 })
    const south = templateShape({ id: 'a', kind: 'cone', x: 0, y: 0, size: 4.5, angle: 90 })
    if (east.kind !== 'polygon' || south.kind !== 'polygon') throw new Error('polygon')
    // East spreads along x; south spreads along y.
    expect(Math.abs(east.points[1]![0])).toBeGreaterThan(Math.abs(east.points[1]![1]))
    expect(Math.abs(south.points[1]![1])).toBeGreaterThan(Math.abs(south.points[1]![0]))
  })
})
