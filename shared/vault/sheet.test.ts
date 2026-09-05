/**
 * `parseSheet` on its own, against the shape `fightclub.py` really writes —
 * no vault, so this is the half of the sheet coverage that runs on CI.
 */
import { describe, expect, it } from 'vitest'
import { abilityMod, formatMod, isFc5Sheet, parseSheet } from './sheet.ts'

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
      name: null,
      race: null,
      className: null,
      background: null,
      speed: null,
      money: null,
      hpMax: null,
      initMod: null,
      level: null,
      slots: {},
      abilities: null,
      ac: null,
      passivePerception: null,
      proficiency: null,
      spellAbility: null,
      spellDc: null,
      spellAttack: null,
      skills: [],
      saves: [],
      summary: null,
      weapons: [],
      spells: [],
      feats: [],
      items: [],
      proficient: { saves: [], skills: [], expertise: [] },
    })
  })

  it('gives a non-caster no casting line at all', () => {
    expect(sheet.spellAbility).toBeNull()
    expect(sheet.spellDc).toBeNull()
    expect(sheet.spellAttack).toBeNull()
  })

  it('quotes no skill or save the sheet does not state', () => {
    // Tolmo's sheet has no `Habilidades:` line, and this app will not derive
    // one: Fight Club states skill proficiency as opaque numeric ids.
    expect(sheet.skills).toEqual([])
    expect(sheet.saves).toEqual([])
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

  it('reads the ability, the DC and the attack bonus', () => {
    expect(sheet.spellAbility).toBe('Inteligencia')
    expect(sheet.spellDc).toBe(13)
    expect(sheet.spellAttack).toBe(5)
  })

  it('still takes the slots from <slots>, not from the prose', () => {
    // The line says "2 espacios de nivel 1" and so does the tag; the tag is
    // the one that can express levels 2-9.
    expect(sheet.slots).toEqual({ '1': 2 })
  })

  it('does not mistake a weapon attack for the spell attack', () => {
    // `ataque` is asked for inside the `Conjuros:` line and nowhere else.
    const withWeapon = parseSheet(ABRAXAS.replace('Idiomas', 'Daga: ataque +7 · Idiomas'))
    expect(withWeapon.spellAttack).toBe(5)
  })
})

describe('stated skills and saves', () => {
  const sheet = parseSheet(ABRAXAS)

  it('keeps them in the order the sheet quotes them', () => {
    expect(sheet.skills).toEqual([
      { name: 'Arcanos', mod: 5 },
      { name: 'Historia', mod: 5 },
    ])
    expect(sheet.saves).toEqual([
      { name: 'INT', mod: 5 },
      { name: 'SAB', mod: 2 },
    ])
  })

  it('accepts a comma-separated line as well as a middot one', () => {
    const commas = parseSheet(
      ABRAXAS.replace('Habilidades: Arcanos +5 · Historia +5', 'Habilidades: Sigilo +7, Percepción +5'),
    )
    expect(commas.skills).toEqual([
      { name: 'Sigilo', mod: 7 },
      { name: 'Percepción', mod: 5 },
    ])
  })

  it('reads a negative modifier', () => {
    const bad = parseSheet(ABRAXAS.replace('Arcanos +5', 'Atletismo -1'))
    expect(bad.skills[0]).toEqual({ name: 'Atletismo', mod: -1 })
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
    expect(sheet.race).toBe('Mediano')
    expect(sheet.className).toBe('Pícaro')
    expect(sheet.background).toBe('Criminal')
    expect(sheet.speed).toBe(30)
    expect(sheet.money).toBe(24)
  })

  it('attributes each feat to the section it sits in, mods cut out', () => {
    expect(sheet.feats).toEqual([
      { name: 'Suerte', text: 'Repite los 1.', source: 'race' },
      // The `<mod>` inside carries its own `<name>`; the feat keeps its own.
      { name: 'Experticia', text: 'Dobla dos.', source: 'class' },
      { name: 'Alerta', text: 'Sumas competencia a la iniciativa.', source: 'feat' },
    ])
  })

  it('lists every item, and still only arms the ones with a die', () => {
    expect(sheet.items).toEqual([
      { name: 'Armadura de cuero', kind: 'light', equipped: 'armor', quantity: 1, weight: 11, ac: 11, damage: null, text: '' },
      { name: 'Daga', kind: 'melee', equipped: 'weapon', quantity: 2, weight: 1.1, ac: null, damage: '1d4', text: 'Ataque +5, daño 1d4 +3 perforante.' },
      { name: 'Cuerda', kind: null, equipped: null, quantity: 1, weight: 4.5, ac: null, damage: null, text: '' },
    ])
    expect(sheet.weapons.map((w) => w.name)).toEqual(['Daga'])
  })

  it('decodes proficiency ids once each, expertise from the mod', () => {
    // 1 and 3 are DES and INT; 111 is Percepción, 116 Sigilo (stated twice).
    expect(sheet.proficient).toEqual({
      saves: ['dex', 'int'],
      skills: ['Percepción', 'Sigilo'],
      expertise: ['Sigilo'],
    })
  })

  it('reads a spell\'s school, components and ritual tag', () => {
    const [detectar, familiar] = sheet.spells
    expect(detectar).toMatchObject({
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
      classes: [],
      time: null,
    })
  })

  it('knows a Fight Club character from anything else', () => {
    expect(isFc5Sheet(RASTRO)).toBe(true)
    expect(isFc5Sheet(TOLMO)).toBe(true)
    expect(isFc5Sheet('')).toBe(false)
    expect(isFc5Sheet('<html><body>404</body></html>')).toBe(false)
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
