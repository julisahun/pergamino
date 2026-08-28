import { describe, expect, it } from 'vitest'
import { cellDistance, formatMetres } from './grid.ts'

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
