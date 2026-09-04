/**
 * `parseSheet` on its own, against the shape `fightclub.py` really writes —
 * no vault, so this is the half of the sheet coverage that runs on CI.
 */
import { describe, expect, it } from 'vitest'
import { abilityMod, formatMod, parseSheet, sheetNameFor } from './sheet.ts'

/** Tolmo, trimmed: a level 1 fighter with *Alerta*, so DEX 10 but Iniciativa +2. */
const TOLMO = `<?xml version='1.0' encoding='UTF-8'?>
<pc version="5">
 <character>
  <name>Tolmo</name>
  <race><name>Enano</name><speed>30</speed></race>
  <class><name>Guerrero</name><level>1</level><slots>0,0,0,0,0,0,0,0,0,0,</slots></class>
  <slots>0,0,0,0,0,0,0,0,0,0,</slots>
  <item><name>Cota de malla</name><ac>16</ac></item>
  <note>
   <name>Marea Baja — mesa Guils</name>
   <text>Enano guerrero de nivel 1 (Guardia). Tamaño Mediano.

CA 19 · PG 13 · Iniciativa +2 · Percepción pasiva 14 · Competencia +2

Si algún número de la app no coincide con los de arriba, mandan los de arriba.</text>
  </note>
  <abilities>17,10,14,8,14,12,</abilities>
  <hpMax>13</hpMax>
 </character>
</pc>`

describe('parseSheet', () => {
  const sheet = parseSheet(TOLMO)

  it('reads the six post-boost scores in the sheet\'s own order', () => {
    expect(sheet.abilities).toEqual({ str: 17, dex: 10, con: 14, int: 8, wis: 14, cha: 12 })
  })

  it('takes initiative from the sheet\'s line, not from DEX', () => {
    // DEX 10 is +0; *Alerta* adds the proficiency bonus, and the sheet says so.
    expect(abilityMod(sheet.abilities!.dex)).toBe(0)
    expect(sheet.initMod).toBe(2)
  })

  it('takes AC from the line too, not from the armour item', () => {
    // `<ac>16</ac>` is the mail's base; the sheet quotes 19.
    expect(sheet.ac).toBe(19)
  })

  it('reads the rest of the stated line', () => {
    expect(sheet.hpMax).toBe(13)
    expect(sheet.passivePerception).toBe(14)
    expect(sheet.proficiency).toBe(2)
    expect(sheet.level).toBe(1)
  })

  it('keeps the sheet\'s own first line as the summary', () => {
    expect(sheet.summary).toBe('Enano guerrero de nivel 1 (Guardia). Tamaño Mediano.')
  })

  it('gives a non-caster no slots', () => {
    expect(sheet.slots).toEqual({})
  })

  it('falls back to DEX when there is no stated line', () => {
    const bare = parseSheet('<pc><character><abilities>8,16,14,8,13,15,</abilities></character></pc>')
    expect(bare.initMod).toBe(3)
    expect(bare.ac).toBeNull()
    expect(bare.summary).toBeNull()
  })

  it('survives an empty document', () => {
    const none = parseSheet('')
    expect(none).toEqual({
      hpMax: null,
      initMod: null,
      level: null,
      slots: {},
      abilities: null,
      ac: null,
      passivePerception: null,
      proficiency: null,
      summary: null,
    })
  })
})

describe('modifiers', () => {
  it('rounds down, including below ten', () => {
    expect([8, 9, 10, 11, 12, 17].map(abilityMod)).toEqual([-1, -1, 0, 0, 1, 3])
  })

  it('writes a modifier the way a sheet does', () => {
    expect([formatMod(-1), formatMod(0), formatMod(3)]).toEqual(['-1', '+0', '+3'])
  })
})

describe('sheetNameFor', () => {
  it('pairs the note with the xml beside it', () => {
    expect(sheetNameFor('el-cantor.md')).toBe('el-cantor-fc5.xml')
  })

  it("keeps the PJ's folder, so the xml stays inside it", () => {
    // A PJ is a folder, and the loader enumerates `<pj>/<pj>.md`. Only the
    // last segment is the note name; rewriting the whole path would look for
    // the sheet one level up, where nothing is.
    expect(sheetNameFor('toribio/toribio.md')).toBe('toribio/toribio-fc5.xml')
  })
})
