/**
 * `scores:` and `saves:` in a pnj note — the six numbers the app used to have
 * no field for.
 *
 * Why they exist: the console judged a saving throw by comparing a bare d20
 * against the DC, because a pnj note stated no save bonus anywhere. Every
 * creature in the campaign therefore saved at exactly +0, a modifier nobody
 * had written. These two keys are where that number comes from now, and the
 * rule that matters is that a note which says nothing yields `null` rather
 * than a zero.
 *
 * Pure: the notes are strings in a `MemoryVault`, so this runs where the DM's
 * private vault is not.
 */
import { describe, expect, it, vi } from 'vitest'
import { MemoryVault } from './memory.ts'
import { loadPnj } from './pnj.ts'

const note = (front: string) => `---\nac: 12\nhpMax: 11\n${front}---\n\n# Bandido\n\nUn párrafo.\n`

const load = async (front: string) =>
  (await loadPnj(await new MemoryVault({ pnj: { 'bandido.md': note(front) } }).root().dir('pnj')))[0]!

const SIX = { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 }

describe('loadPnj — scores', () => {
  it('reads the six in Spanish, which is what the campaign writes', async () => {
    const pnj = await load('scores: {fue: 11, des: 12, con: 12, int: 10, sab: 10, car: 10}\n')
    expect(pnj.scores).toEqual(SIX)
  })

  it('reads them in English too, the way the shipped fixture would', async () => {
    const pnj = await load('scores: {str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10}\n')
    expect(pnj.scores).toEqual(SIX)
  })

  it('takes the block written out over several lines', async () => {
    const pnj = await load('scores:\n  fue: 11\n  des: 12\n  con: 12\n  int: 10\n  sab: 10\n  car: 10\n')
    expect(pnj.scores).toEqual(SIX)
  })

  it('states nothing for a note that states nothing', async () => {
    const pnj = await load('')
    expect(pnj.scores).toBeNull()
    expect(pnj.saves).toEqual({})
  })

  it('refuses a partial set rather than putting a silent +0 on the ficha', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pnj = await load('scores: {fue: 11, des: 12}\n')
    expect(pnj.scores).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('all six'))
    warn.mockRestore()
  })

  it('keeps only the saves the note quotes', async () => {
    const pnj = await load('scores: {fue: 11, des: 12, con: 12, int: 10, sab: 10, car: 10}\nsaves: {des: 3}\n')
    expect(pnj.saves).toEqual({ dex: 3 })
  })

  it('takes a quoted save with no scores beside it', async () => {
    const pnj = await load('saves: {sab: 5}\n')
    expect(pnj.scores).toBeNull()
    expect(pnj.saves).toEqual({ wis: 5 })
  })

  it('keeps a negative save, which is what a drowned soldier has', async () => {
    const pnj = await load('saves: {des: -2}\n')
    expect(pnj.saves).toEqual({ dex: -2 })
  })
})
