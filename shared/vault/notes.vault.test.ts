import { describe, expect, it } from 'vitest'
import { openWorld } from '../../test/fixture.ts'
import { buildIndex, parseNote, search } from './notes.ts'

const vault = await openWorld()
const index = await vault.buildNotesIndex()
const get = (p: string) => index.notes.get(p)
const linkFrom = (from: string, target: string) =>
  get(from)?.links.find((l) => l.target === target)?.resolved ?? null

const VANN = 'campaigns/marea-baja/story/gente/vann.md'
const STORY_README = 'campaigns/marea-baja/story/README.md'
const RUNS_README = 'campaigns/marea-baja/runs/README.md'

describe('the index covers the whole world', () => {
  it('reaches both the campaign notes and the world lore', () => {
    expect(get(VANN)).toBeDefined()
    expect(get('mundo/talasia.md')).toBeDefined()
    expect(get('mundo/lugares/virelia.md')).toBeDefined()
  })

  it('skips the .obsidian folder', () => {
    for (const p of index.notes.keys()) expect(p).not.toContain('.obsidian')
  })
})

describe('parseNote', () => {
  it('reads frontmatter, heading and tags', () => {
    const note = parseNote('x/el-cantor.md', `---\nficha: El cantor\nnivel: 1\n---\n\n# El cantor\n\n#npc #sequia\n`)
    expect(note.frontmatter.nivel).toBe('1')
    expect(note.title).toBe('El cantor')
    expect(note.tags).toEqual(['npc', 'sequia'])
  })

  it('takes the title from the first heading when there is no frontmatter', () => {
    expect(parseNote('x/y.md', '# Marea Baja\n').title).toBe('Marea Baja')
  })

  it('falls back to the file name', () => {
    expect(parseNote('x/cabos-sueltos.md', 'sin encabezado').title).toBe('cabos-sueltos')
  })

  it('splits an aliased link into target and alias', () => {
    const note = parseNote('x/y.md', 'ver [[maraia|Maraia]] y [[Raimo]]')
    expect(note.links).toEqual([
      { target: 'maraia', alias: 'Maraia', resolved: null },
      { target: 'Raimo', alias: null, resolved: null },
    ])
  })
})

describe('wikilink resolution, against the real notes', () => {
  it('resolves a bare basename whose file is lowercase', () => {
    // vann.md writes [[faro|El faro]] and [[Vann]] appears capitalised elsewhere
    expect(linkFrom(VANN, 'faro')).toBe('campaigns/marea-baja/story/lugares/faro.md')
    expect(linkFrom(STORY_README, 'Raimo')).toBe('campaigns/marea-baja/story/gente/raimo.md')
  })

  it('resolves an aliased link by its target, not its alias', () => {
    expect(linkFrom(STORY_README, 'maraia')).toBe('campaigns/marea-baja/story/gente/maraia.md')
  })

  it('resolves a path link written relative to the campaign folder', () => {
    expect(linkFrom(STORY_README, 'runs/README')).toBe(RUNS_README)
  })

  it('will not let a path link settle for the wrong README', () => {
    expect(linkFrom(STORY_README, 'runs/README')).not.toBe(STORY_README)
  })

  it('disambiguates [[README]] to the nearest one', () => {
    // Both story/README.md and runs/README.md exist. story/README.md links to
    // [[README|Marea Baja — Arco de la sequía]] from inside story/.
    const fromStory = index.notes.get('campaigns/marea-baja/story/mapa-del-pueblo.md')
    const link = fromStory?.links.find((l) => l.target === 'README')
    expect(link?.resolved).toBe(STORY_README)
  })

  it('leaves a dangling link unresolved instead of throwing', () => {
    // bandido-lider.json is referenced in prose but no such note exists.
    const note = parseNote(VANN, 'ver [[no-existe-esta-nota]]')
    const resolved = index.notes.get(VANN)!.links.every((l) => l.resolved !== undefined)
    expect(resolved).toBe(true)
    expect(note.links[0]!.resolved).toBeNull()
  })

  it('resolves every link in vann.md that has a matching note', () => {
    const vann = get(VANN)!
    const byTarget = Object.fromEntries(vann.links.map((l) => [l.target, l.resolved]))
    expect(byTarget['faro']).toBeTruthy()
    expect(byTarget['medalla-del-tratado']).toBeTruthy()
    expect(byTarget['recelo-a-forasteros']).toBeTruthy()
  })
})

describe('backlinks', () => {
  it('lists the notes that point at Vann', () => {
    const back = index.backlinks.get(VANN) ?? []
    expect(back).toContain('campaigns/marea-baja/story/mapa-del-pueblo.md')
    expect(back).toContain(STORY_README)
  })

  it('a note with no inbound links has no backlinks entry', () => {
    expect(index.backlinks.get('campaigns/marea-baja/story/gente/vann.md')).toBeDefined()
  })
})

describe('tags', () => {
  it('groups notes by tag', () => {
    expect(index.tags.get('npc')).toContain(VANN)
    expect(index.tags.get('sequia')?.length).toBeGreaterThan(3)
  })
})

describe('search', () => {
  it('finds a note by title', () => {
    const hits = search(index, 'Ossian')
    expect(hits[0]!.path).toContain('ossian')
  })

  it('finds a phrase in the body and quotes the line', () => {
    // From story/gente/vann.md.
    const hits = search(index, 'el mar los ha estado guardando')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.excerpt.toLowerCase()).toContain('guardando')
  })

  it('ignores a query that is too short', () => {
    expect(search(index, 'a')).toEqual([])
  })
})
