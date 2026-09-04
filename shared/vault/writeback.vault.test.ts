import { describe, expect, it } from 'vitest'
import type { Scene, SessionState } from '../types.ts'
import { MESA, openWorld, pcsOf, playingPcs } from '../../test/fixture.ts'
import {
  applyDeviations,
  bitacoraFilename,
  draftBitacora,
  proposeDeviations,
  type Deviation,
} from './writeback.ts'

const vault = await openWorld()
const campaign = await vault.loadCampaign()
const scenes = new Map<string, Scene>(campaign.scenes.map((s) => [s.id, s]))
const { objects, pnjs } = campaign

const run = await vault.loadRun(MESA)
const last = (): SessionState => structuredClone(run.state)

// The party as the run itself names it, not as a literal that can rot.
const pcs = pcsOf(run)
const pcNames = new Map([...pcs].map(([id, info]) => [id, info.name]))
/** A PC with live state, so it is someone who can be handed an object. */
const somePc = playingPcs(run)[0]!
const someName = pcNames.get(somePc)!
const players = playingPcs(run).map((id) => pcNames.get(id)!)

const sessionNumber = await vault.nextSessionNumber(MESA)
const template = await vault.readTemplate(MESA)
const estado = await vault.readEstado(MESA)

describe('session numbering', () => {
  it('starts at 1 when only the template is there', () => {
    expect(sessionNumber).toBe(1)
  })

  it('names the file the way the template asks', () => {
    expect(bitacoraFilename(1, '2026-08-27')).toBe('01-2026-08-27.md')
    expect(bitacoraFilename(12, '2026-08-27')).toBe('12-2026-08-27.md')
  })
})

describe('draftBitacora', () => {
  const state = last()
  state.log = [
    { t: 1, kind: 'scene', text: 'camino-del-rio' },
    { t: 2, kind: 'encounter', text: 'Combate iniciado (6)' },
    { t: 3, kind: 'death', text: 'Bandido cae a 0 PG' },
    { t: 4, kind: 'loot', text: `${someName} saquea a Bandido: Anillo de la Corriente Ahogada` },
    { t: 5, kind: 'scene', text: 'faro' },
  ]
  const draft = draftBitacora(state, {
    date: '2026-08-27',
    scenes,
    players,
    sessionNumber,
    template,
  })

  it('numbers and names the note', () => {
    expect(draft.sessionNumber).toBe(1)
    expect(draft.filename).toBe('01-2026-08-27.md')
  })

  it('fills the front matter the template declares', () => {
    expect(draft.content).toMatch(/^---\nsesion: 1\nfecha: 2026-08-27\n/)
    expect(draft.content).toContain(
      `jugadores: [${players.map((p) => JSON.stringify(p)).join(', ')}]`,
    )
  })

  it('leaves a blank line between the front matter and the heading', () => {
    expect(draft.content).toContain('---\n\n# Sesión 1 — título')
  })

  it("puts the facts after each section's own guidance, not before it", () => {
    const happened = draft.content.slice(
      draft.content.indexOf('## Qué pasó'),
      draft.content.indexOf('## Decisiones'),
    )
    expect(happened.indexOf('En pasado y en corto')).toBeLessThan(
      happened.indexOf('Combate iniciado'),
    )
  })

  it("keeps the run's own section headings", () => {
    for (const heading of [
      '## Qué pasó',
      '## Decisiones',
      '## Cambios de mundo',
      '## Pendiente para la próxima',
    ]) {
      expect(draft.content).toContain(heading)
    }
  })

  it('drops the "this is a template" note', () => {
    expect(draft.content).not.toContain('Plantilla. Se copia')
  })

  it('lists the scenes shown, by name and in order', () => {
    expect(draft.content).toContain('Escenas: El camino junto al río → El faro')
  })

  it('puts deaths and loot under Cambios de mundo, not Qué pasó', () => {
    const world = draft.content.slice(draft.content.indexOf('## Cambios de mundo'))
    expect(world).toContain('Bandido cae a 0 PG')
    expect(world).toContain('saquea a Bandido')
    const happened = draft.content.slice(
      draft.content.indexOf('## Qué pasó'),
      draft.content.indexOf('## Decisiones'),
    )
    expect(happened).toContain('Combate iniciado')
    expect(happened).not.toContain('saquea a Bandido')
  })
})

describe('proposeDeviations', () => {
  it('proposes nothing from an untouched session', () => {
    const state = last()
    state.log = []
    const out = proposeDeviations(state, { sessionNumber: 1, scenes, objects, pnjs, pcNames })
    // Nobody has died and nothing has left an NPC's hands, so there is
    // nothing to say about the people yet.
    expect(out.filter((d) => d.section === 'Gente')).toEqual([])
  })

  it('reports a named NPC that died', () => {
    const state = last()
    state.npcs = [{ ...state.npcs[0]!, name: 'Ossian', hp: 0 }]
    const out = proposeDeviations(state, { sessionNumber: 2, scenes, objects, pnjs, pcNames })
    expect(out).toContainEqual({ section: 'Gente', text: '[[Ossian]] — **muerto**, sesión 2.' })
  })

  it('reports the scenes that went on screen', () => {
    const state = last()
    state.log = [{ t: 1, kind: 'scene', text: 'faro' }]
    const out = proposeDeviations(state, { sessionNumber: 1, scenes, objects, pnjs, pcNames })
    expect(out).toContainEqual({ section: 'Lugares', text: '[[faro]] — visitado, sesión 1.' })
  })

  it("reports where an object ended up, by the PC's name", () => {
    const state = last()
    state.play[somePc]!.objects = ['obj-anillo-corriente-ahogada']
    const out = proposeDeviations(state, { sessionNumber: 3, scenes, objects, pnjs, pcNames })
    expect(out).toContainEqual({
      section: 'Objetos',
      text: `[[anillo-corriente-ahogada]] — lo lleva ${someName}, sesión 3.`,
    })
  })

  it('reports a consumable that was used up', () => {
    const state = last()
    // Nobody may be holding it: whoever has it in hand is the more useful
    // fact, and it wins — see the next test.
    for (const live of Object.values(state.play)) {
      live.objects = live.objects.filter((id) => id !== 'obj-lagrima-de-milia')
    }
    state.objects['obj-lagrima-de-milia'] = { uses: 0, spent: true }
    const out = proposeDeviations(state, { sessionNumber: 4, scenes, objects, pnjs, pcNames })
    expect(out).toContainEqual({
      section: 'Objetos',
      text: '[[lagrima-de-milia]] — gastado y destruido, sesión 4.',
    })
  })

  it('says who holds an object rather than that it was spent', () => {
    const state = last()
    state.play[somePc]!.objects = ['obj-lagrima-de-milia']
    state.objects['obj-lagrima-de-milia'] = { uses: 0, spent: true }
    const out = proposeDeviations(state, { sessionNumber: 5, scenes, objects, pnjs, pcNames })
    const mine = out.filter((d) => d.text.includes('lagrima-de-milia'))
    expect(mine).toEqual([
      { section: 'Objetos', text: `[[lagrima-de-milia]] — lo lleva ${someName}, sesión 5.` },
    ])
  })
})

describe('applyDeviations, against the real estado.md', () => {
  const current = estado

  it('leaves the file alone when there is nothing to add', () => {
    expect(applyDeviations(current, [])).toBe(current)
  })

  it('adds each bullet under its own heading', () => {
    const deviations: Deviation[] = [
      { section: 'Gente', text: '[[Raimo]] — **muerto**, sesión 1.' },
      {
        section: 'Objetos',
        text: `[[anillo-corriente-ahogada]] — lo lleva ${someName}, sesión 1.`,
      },
    ]
    const out = applyDeviations(current, deviations)
    const gente = out.slice(out.indexOf('## Gente'), out.indexOf('## Lugares'))
    const objetos = out.slice(out.indexOf('## Objetos'), out.indexOf('## Decisiones'))
    expect(gente).toContain('[[Raimo]] — **muerto**, sesión 1.')
    expect(objetos).toContain(`lo lleva ${someName}`)
    expect(gente).not.toContain('anillo-corriente-ahogada')
  })

  it('never touches the prose that was already there', () => {
    const out = applyDeviations(current, [{ section: 'Gente', text: 'x' }])
    // Every original line survives, in order.
    const before = current.split('\n')
    const after = out.split('\n')
    let i = 0
    for (const line of before) {
      const at = after.indexOf(line, i)
      expect(at).toBeGreaterThanOrEqual(0)
      i = at + 1
    }
    expect(after.length).toBe(before.length + 1)
  })

  it('keeps the commented-out examples the file ships with', () => {
    const out = applyDeviations(current, [{ section: 'Lugares', text: 'y' }])
    expect(out).toContain('<!-- - [[faro]] — visitado, sesión 2.')
  })

  it('ignores a section the file does not have', () => {
    const out = applyDeviations(current, [
      { section: 'Decisiones', text: 'ok' },
      { section: 'NoExiste' as never, text: 'nope' },
    ])
    expect(out).toContain('ok')
    expect(out).not.toContain('nope')
  })
})
