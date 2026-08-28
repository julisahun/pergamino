import { describe, expect, it } from 'vitest'
import nodePath from 'node:path'
import * as path from './pathish.ts'

/**
 * The shim replaced `node:path` in four modules. What matters is that it
 * agrees with `path.posix` on the shapes those modules actually pass it —
 * so the comparison is made against the real thing rather than by hand.
 */
const CASES = [
  'a/b.json',
  'story/gente/vann.md',
  'campaigns/marea-baja/runs/README.md',
  './faro',
  'a/../b',
  'a/./b/',
  '/abs/path.md',
  'file.md',
  '',
]

describe('agrees with path.posix', () => {
  it('on normalize', () => {
    for (const c of CASES.filter(Boolean)) {
      expect(path.normalize(c)).toBe(nodePath.posix.normalize(c))
    }
  })

  it('on dirname and basename', () => {
    for (const c of CASES.filter(Boolean)) {
      expect(path.dirname(c)).toBe(nodePath.posix.dirname(c))
      expect(path.basename(c)).toBe(nodePath.posix.basename(c))
      expect(path.extname(c)).toBe(nodePath.posix.extname(c))
    }
  })

  it('on join', () => {
    const pairs: [string, string][] = [
      ['story', 'faro.md'],
      ['', 'faro.md'],
      ['campaigns/marea-baja', 'runs/README.md'],
      ['a/b', '../c'],
      ['.', 'x.md'],
    ]
    for (const [a, b] of pairs) expect(path.join(a, b)).toBe(nodePath.posix.join(a, b))
  })

  it('on relative', () => {
    const pairs: [string, string][] = [
      ['/a/b', '/a/b/c'],
      ['/a/b', '/a/d'],
      ['a/b', 'a/b/c/d'],
      ['a/b', 'a'],
    ]
    for (const [a, b] of pairs) expect(path.relative(a, b)).toBe(nodePath.posix.relative(a, b))
  })
})

describe('containedJoin', () => {
  it('resolves a link inside the base', () => {
    expect(path.containedJoin('story', 'gente/vann.md')).toBe('story/gente/vann.md')
    expect(path.containedJoin('', 'mundo/talasia.md')).toBe('mundo/talasia.md')
    expect(path.containedJoin('story', 'gente/../lugares/faro.md')).toBe(
      'story/lugares/faro.md',
    )
  })

  it('refuses one that climbs out', () => {
    expect(path.containedJoin('story', '../../etc/passwd')).toBeNull()
    expect(path.containedJoin('', '../outside.md')).toBeNull()
    // Even one step out of the base it was given.
    expect(path.containedJoin('story/gente', '../lugares/faro.md')).toBeNull()
  })
})
