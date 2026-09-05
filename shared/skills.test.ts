/**
 * `skillRows` merges what the sheet states with what the scores imply, and
 * marks which is which. Nothing here needs a vault.
 */
import { describe, expect, it } from 'vitest'
import { SKILLS, skillRows } from './skills.ts'
import { emptySheet, parseSheet, type SheetStats } from './vault/sheet.ts'

const sheetWith = (lines: string): SheetStats =>
  parseSheet(`<pc><character><abilities>8,16,14,10,12,17,</abilities>
  <note><text>Bardo de nivel 2.

CA 14 · PG 16 · Competencia +2
${lines}</text></note></character></pc>`)

/** The same bard, with the class's proficiency ids and one expertise. */
const proficientWith = (lines: string): SheetStats =>
  parseSheet(`<pc><character><abilities>8,16,14,10,12,17,</abilities>
  <class><name>Bardo</name>
   <proficiency>112</proficiency><proficiency>116</proficiency><proficiency>111</proficiency>
   <feat><name>Experticia</name><mod><category>4</category><type>16</type></mod></feat>
  </class>
  <note><text>Bardo de nivel 2.

CA 14 · PG 16 · Competencia +2
${lines}</text></note></character></pc>`)

describe('skillRows', () => {
  it('covers all eighteen, once each', () => {
    const rows = skillRows(sheetWith(''))
    expect(rows).toHaveLength(18)
    expect(new Set(rows.map((r) => r.name)).size).toBe(18)
    expect(rows.map((r) => r.name)).toEqual(SKILLS.map((s) => s.name))
  })

  it('falls back to the ability modifier, and says it did', () => {
    const rows = skillRows(sheetWith(''))
    const atletismo = rows.find((r) => r.name === 'Atletismo')!
    expect(atletismo.mod).toBe(-1) // FUE 8
    expect(atletismo.stated).toBe(false)
    const sigilo = rows.find((r) => r.name === 'Sigilo')!
    expect(sigilo.mod).toBe(3) // DES 16, no proficiency known
    expect(sigilo.stated).toBe(false)
  })

  it("takes the sheet's number where the sheet quotes one", () => {
    const rows = skillRows(sheetWith('Habilidades: Sigilo +7 · Interpretación +5'))
    const sigilo = rows.find((r) => r.name === 'Sigilo')!
    // +7, not the +3 DES alone would give: that is the whole point.
    expect(sigilo.mod).toBe(7)
    expect(sigilo.stated).toBe(true)
    // And the ones it does not quote stay the bare ability.
    expect(rows.find((r) => r.name === 'Acrobacias')).toMatchObject({ mod: 3, stated: false })
  })

  it('matches a quoted name whatever its accents and case', () => {
    const rows = skillRows(sheetWith('Habilidades: percepcion +5 · ENGAÑO +6'))
    expect(rows.find((r) => r.name === 'Percepción')).toMatchObject({ mod: 5, stated: true })
    expect(rows.find((r) => r.name === 'Engaño')).toMatchObject({ mod: 6, stated: true })
  })

  it('adds up a proficient skill the sheet does not quote, and says so', () => {
    const rows = skillRows(proficientWith(''))
    // Interpretación: CAR 17 is +3, plus the sheet's +2 competencia.
    expect(rows.find((r) => r.name === 'Interpretación')).toMatchObject({
      mod: 5,
      stated: false,
      derived: true,
      proficient: true,
      expertise: false,
    })
    // Sigilo with expertise: DES 16 is +3, plus twice the +2.
    expect(rows.find((r) => r.name === 'Sigilo')).toMatchObject({
      mod: 7,
      derived: true,
      proficient: true,
      expertise: true,
    })
    // Not proficient: the bare ability, and no claim otherwise.
    expect(rows.find((r) => r.name === 'Atletismo')).toMatchObject({
      mod: -1,
      derived: false,
      proficient: false,
    })
  })

  it('lets a stated line win over the derived number', () => {
    const rows = skillRows(proficientWith('Habilidades: Sigilo +9'))
    expect(rows.find((r) => r.name === 'Sigilo')).toMatchObject({
      mod: 9,
      stated: true,
      derived: false,
      expertise: true,
    })
  })

  it('derives nothing without a stated proficiency bonus', () => {
    const noBonus = parseSheet(`<pc><character><abilities>8,16,14,10,12,17,</abilities>
      <class><proficiency>116</proficiency></class></character></pc>`)
    expect(skillRows(noBonus).find((r) => r.name === 'Sigilo')).toMatchObject({
      mod: 3,
      derived: false,
      proficient: true,
    })
  })

  it('has no modifier at all when there is no sheet and no scores', () => {
    for (const sheet of [undefined, emptySheet()]) {
      const rows = skillRows(sheet)
      expect(rows).toHaveLength(18)
      expect(rows.every((r) => r.mod === null && !r.stated)).toBe(true)
    }
  })
})
