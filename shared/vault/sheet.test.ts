/**
 * `parseSheet` on its own, against the shape `fightclub.py` really writes —
 * no vault, so this is the half of the sheet coverage that runs on CI.
 *
 * What these pin, beyond "the xml is read correctly", is the **import rule**:
 * a number the sheet quotes that `Sheet` can work out for itself is compared
 * against the formula and kept only when the two disagree. That is what lets
 * raising `proficiency` at level 5 move eighteen skills at once instead of
 * being fought by eighteen numbers frozen at import.
 */
import { describe, expect, it } from 'vitest'
import { isFc5Sheet, parseSheet } from './sheet.ts'
import {
  abilityMod,
  emptySheet,
  formatMod,
  passivePerceptionOf,
  skillRow,
  spellAttackOf,
  spellDcOf,
  summaryOf,
} from '../character.ts'

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
    expect(sheet.initiative).toBe(2)
  })

  it('takes AC from the line too, not from the armour item', () => {
    // `<ac>16</ac>` is the mail's base; the sheet quotes 19.
    expect(sheet.ac).toBe(19)
  })

  it('reads the rest of the stated line', () => {
    expect(sheet.hpMax).toBe(13)
    expect(sheet.proficiency).toBe(2)
    expect(sheet.level).toBe(1)
  })

  it('builds the summary from the parts rather than keeping a line', () => {
    // The sheet opens with «Enano guerrero de nivel 1 (Guardia)», which the
    // record no longer stores: it is species, class, level and background, and
    // it has to follow them when one of them is edited.
    expect(summaryOf(sheet)).toBe('Enano Guerrero de nivel 1')
  })

  it('gives a non-caster no casting block at all', () => {
    expect(sheet.spellcasting).toBeNull()
    expect(spellDcOf(sheet)).toBeNull()
    expect(spellAttackOf(sheet)).toBeNull()
  })

  it('pins passive perception, because nothing here derives it', () => {
    // No `<proficiency>` ids on this trimmed sheet, so Percepción is WIS alone
    // (+2) and the formula gives 12. The sheet says 14, so 14 is kept.
    expect(skillRow(sheet, 'percepcion').mod).toBe(2)
    expect(sheet.passivePerception).toBe(14)
    expect(passivePerceptionOf(sheet)).toBe(14)
  })

  it('marks no skill or save proficient when the sheet states none', () => {
    expect(sheet.skills).toEqual({})
    expect(sheet.saves).toEqual({})
  })

  it('falls back to DEX when there is no stated line', () => {
    const bare = parseSheet('<pc><character><abilities>8,16,14,8,13,15,</abilities></character></pc>')
    expect(bare.initiative).toBe(3)
    expect(bare.ac).toBeNull()
    expect(summaryOf(bare)).toBeNull()
  })

  it('survives an empty document', () => {
    expect(parseSheet('')).toEqual(emptySheet())
  })

  it('recognises a Fight Club document and nothing else', () => {
    expect(isFc5Sheet(TOLMO)).toBe(true)
    expect(isFc5Sheet('<html><body>no</body></html>')).toBe(false)
  })
})

/** A caster, with the two lines a rogue's sheet does not carry. */
const ABRAXAS = `<?xml version='1.0' encoding='UTF-8'?>
<pc version="5">
 <character>
  <name>Abraxas</name>
  <class><name>Mago</name><level>1</level></class>
  <slots>3,2,0,0,0,0,0,0,0,0,</slots>
  <note>
   <name>Marea Baja — mesa Last</name>
   <text>Elfo mago de nivel 1 (Erudito). Tamaño Mediano.

CA 12 · PG 9 · Iniciativa +2 · Percepción pasiva 12 · Competencia +2
Conjuros: Inteligencia · CD 13 · ataque +5 · 2 espacios de nivel 1
Habilidades: Arcanos +5 · Historia +5
Salvaciones: INT +5 · SAB +2

Si algún número de la app no coincide con los de arriba, mandan los de arriba.</text>
  </note>
  <abilities>8,14,16,17,10,8,</abilities>
  <hpMax>9</hpMax>
 </character>
</pc>`

describe('the casting line', () => {
  const sheet = parseSheet(ABRAXAS)

  it('reads which of the six the spells key off', () => {
    expect(sheet.spellcasting?.ability).toBe('int')
  })

  it('keeps no override when the quoted DC and attack are the formula', () => {
    // INT 17 is +3 and the sheet's competencia is +2, so 8+2+3 = 13 and
    // 2+3 = +5 — exactly what the line quotes. Nothing is pinned, and both
    // numbers will move on their own when proficiency does.
    expect(sheet.spellcasting?.dc).toBeUndefined()
    expect(sheet.spellcasting?.attack).toBeUndefined()
    expect(spellDcOf(sheet)).toBe(13)
    expect(spellAttackOf(sheet)).toBe(5)
  })

  it('pins the DC when the sheet disagrees with the formula', () => {
    const odd = parseSheet(ABRAXAS.replace('CD 13', 'CD 15'))
    expect(odd.spellcasting?.dc).toBe(15)
    expect(spellDcOf(odd)).toBe(15)
  })

  it('still takes the slots from <slots>, not from the prose', () => {
    // The line says "2 espacios de nivel 1" and so does the tag; the tag is
    // the one that can express levels 2-9.
    expect(sheet.spellcasting?.slots).toEqual({ '1': 2 })
  })

  it('does not mistake a weapon attack for the spell attack', () => {
    // `ataque` is asked for inside the `Conjuros:` line and nowhere else.
    const withWeapon = parseSheet(ABRAXAS.replace('Idiomas', 'Daga: ataque +7 · Idiomas'))
    expect(spellAttackOf(withWeapon)).toBe(5)
  })
})

describe('stated skills and saves', () => {
  const sheet = parseSheet(ABRAXAS)

  it('pins the ones the formula cannot reach', () => {
    // This sheet states no proficiency ids, so Arcanos and Historia are INT
    // alone (+3) and the quoted +5 cannot be derived. Both are kept.
    expect(sheet.skills.arcanos).toEqual({ mod: 5 })
    expect(sheet.skills.historia).toEqual({ mod: 5 })
    expect(sheet.saves.int).toEqual({ mod: 5 })
    expect(sheet.saves.wis).toEqual({ mod: 2 })
  })

  it('accepts a comma-separated line as well as a middot one', () => {
    const commas = parseSheet(
      ABRAXAS.replace('Habilidades: Arcanos +5 · Historia +5', 'Habilidades: Sigilo +7, Percepción +5'),
    )
    expect(commas.skills.sigilo?.mod).toBe(7)
    expect(commas.skills.percepcion?.mod).toBe(5)
  })

  it('reads a negative modifier, and pins it only when it disagrees', () => {
    // FUE 8 is −1, so «Atletismo -1» is exactly the formula and nothing is
    // kept; «Atletismo -3» is not, and is.
    const agrees = parseSheet(ABRAXAS.replace('Arcanos +5', 'Atletismo -1'))
    expect(agrees.skills.atletismo?.mod).toBeUndefined()
    expect(formatMod(skillRow(agrees, 'atletismo').mod!)).toBe('-1')

    const differs = parseSheet(ABRAXAS.replace('Arcanos +5', 'Atletismo -3'))
    expect(differs.skills.atletismo?.mod).toBe(-3)
    expect(skillRow(differs, 'atletismo').override).toBe(true)
  })
})

/**
 * The rest of a sheet, in the shape the real ones have: feats inside their
 * section, a `<mod>` inside a feat, proficiency ids, equipped and loose items,
 * a ritual and a spell with materials.
 */
const RASTRO = `<?xml version='1.0' encoding='UTF-8'?>
<pc version="5">
 <character>
  <name>Rastro</name>
  <race>
   <name>Mediano</name>
   <speed>30</speed>
   <feat><name>Suerte</name><text>Repite los 1.</text></feat>
  </race>
  <class>
   <name>Pícaro</name>
   <level>1</level>
   <proficiency>1</proficiency>
   <proficiency>3</proficiency>
   <proficiency>111</proficiency>
   <proficiency>116</proficiency>
   <proficiency>116</proficiency>
   <feat>
    <name>Experticia</name>
    <text>Dobla dos.</text>
    <mod><name>Experticia: sigilo</name><category>4</category><type>16</type></mod>
   </feat>
  </class>
  <background><name>Criminal</name></background>
  <money>24.0</money>
  <feat><name>Alerta</name><text>Sumas competencia a la iniciativa.</text></feat>
  <item><name>Armadura de cuero</name><type>1</type><slot>5</slot><ac>11</ac><weight>11.0</weight></item>
  <item>
   <name>Daga</name><type>5</type><slot>3</slot><quantity>2</quantity><weight>1.1</weight>
   <damage1H>1d4</damage1H><text>Ataque +5, daño 1d4 +3 perforante.</text>
  </item>
  <item><name>Cuerda</name><weight>4.5</weight></item>
  <spell>
   <name>Detectar Magia</name><level>1</level><school>3</school>
   <time>Acción</time><range>Personal</range><duration>10 minutos</duration>
   <v>1</v><s>1</s><ritual>1</ritual>
   <text>Notas la magia a 9 m.</text>
   <sclass>Bardo</sclass><sclass>Mago</sclass>
  </spell>
  <spell>
   <name>Encontrar Familiar</name><level>1</level><school>2</school>
   <v>1</v><s>1</s><m>1</m><materials>10 po de carbón</materials>
   <text>Un espíritu toma forma de animal.</text>
  </spell>
  <note>
   <text>Mediano pícaro de nivel 1 (Criminal).

CA 14 · PG 10 · Iniciativa +5 · Percepción pasiva 15 · Competencia +2
Habilidades: Sigilo +7</text>
  </note>
  <abilities>10,17,12,10,14,12,</abilities>
  <hpMax>10</hpMax>
 </character>
</pc>`

describe('the rest of the sheet', () => {
  const sheet = parseSheet(RASTRO)

  it('reads who the character is', () => {
    expect(sheet.name).toBe('Rastro')
    expect(sheet.species).toBe('Mediano')
    expect(sheet.className).toBe('Pícaro')
    expect(sheet.background).toBe('Criminal')
    expect(sheet.speed).toBe(30)
  })

  it('drops the money: gold is the live layer\'s, not the sheet\'s', () => {
    expect(RASTRO).toContain('<money>24.0</money>')
    expect(Object.keys(sheet)).not.toContain('money')
  })

  it('decodes proficiency ids once each, expertise from the mod', () => {
    // 1 and 3 are DES and INT; 111 is Percepción, 116 Sigilo (stated twice).
    expect(sheet.saves).toEqual({ dex: { proficient: true }, int: { proficient: true } })
    expect(sheet.skills.percepcion).toEqual({ prof: 'proficient' })
    expect(sheet.skills.sigilo).toEqual({ prof: 'expertise' })
  })

  it('keeps no override for a skill the formula already gets right', () => {
    // This is the case that matters. DEX 17 is +3, competencia +2, expertise
    // doubles it: 3 + 4 = +7, which is exactly what «Habilidades: Sigilo +7»
    // says. So nothing is pinned, and the day this character reaches level 5
    // the number moves by itself.
    expect(sheet.skills.sigilo?.mod).toBeUndefined()
    expect(skillRow(sheet, 'sigilo').mod).toBe(7)
    const atFive = { ...sheet, proficiency: 3, level: 5 }
    expect(skillRow(atFive, 'sigilo').mod).toBe(9)
  })

  it('attributes each trait to the section it sits in, mods cut out', () => {
    expect(sheet.traits.map((t) => [t.name, t.source])).toEqual([
      ['Suerte', 'species'],
      // The `<mod>` inside carries its own `<name>`; the trait keeps its own.
      ['Experticia', 'class'],
      ['Alerta', 'feat'],
    ])
    expect(sheet.traits[0]).toMatchObject({ id: 'suerte', text: 'Repite los 1.' })
  })

  it('lists every item, and still only arms the ones with a die', () => {
    expect(sheet.items.map((i) => [i.id, i.kind, i.equipped, i.quantity])).toEqual([
      ['armadura-de-cuero', 'light', 'armor', 1],
      ['daga', 'melee', 'weapon', 2],
      ['cuerda', null, null, 1],
    ])
    expect(sheet.weapons.map((w) => w.name)).toEqual(['Daga'])
  })

  it('takes a weapon\'s numbers out of the prose once, at import', () => {
    // `attacks.ts` used to run this regex on every load. The record carries
    // the result instead, so what it holds is numbers rather than a sentence.
    expect(sheet.weapons[0]).toMatchObject({
      id: 'daga',
      name: 'Daga',
      mod: 5,
      dice: '1d4+3',
      damageType: 'perforante',
    })
  })

  it('reads a spell\'s school, components and ritual tag', () => {
    const [detectar, familiar] = sheet.spells
    expect(detectar).toMatchObject({
      id: 'detectar-magia',
      school: 'Divinación',
      time: 'Acción',
      range: 'Personal',
      duration: '10 minutos',
      components: 'V, S',
      ritual: true,
      classes: ['Bardo', 'Mago'],
    })
    expect(familiar).toMatchObject({
      school: 'Conjuración',
      components: 'V, S, M (10 po de carbón)',
      ritual: false,
    })
  })
})
