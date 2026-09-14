/**
 * The parser runs on prose a human wrote for a human, so these cases are the
 * real sentences out of `talasia/campaigns/marea-baja` rather than invented
 * ones — including the four that must yield *nothing*.
 */
import { describe, expect, it } from 'vitest'
import type { Ability } from '../types.ts'
import { emptySheet, type Spell, type Sheet } from '../character.ts'
import { attacksOfAbilities, attacksOfSheet } from './attacks.ts'
import { formatDice } from './dice.ts'

const ability = (name: string, desc: string): Ability => ({ id: name, name, desc })

/** The four fields an action is read from; the sheet's other spell fields are noise here. */
type SpellSeed = Pick<Spell, 'name' | 'level' | 'roll' | 'text'>
const spell = (seed: SpellSeed): Spell => ({
  id: seed.name.toLowerCase().replace(/[^a-z]+/g, '-'),
  school: null,
  time: null,
  range: null,
  duration: null,
  components: '',
  ritual: false,
  classes: [],
  ...seed,
})

/**
 * A caster whose numbers come out as the ones these cases were written against:
 * INT 17 is +3, competencia +2, so CD 13 and ataque +5 — and the casting
 * modifier a heal folds in is that same +3, read off the score now rather than
 * worked back out of the attack bonus.
 */
const sheet = (
  over: Partial<Omit<Sheet, 'spells' | 'spellcasting'>> & { spells?: SpellSeed[] } = {},
): Sheet => ({
  ...emptySheet(),
  proficiency: 2,
  abilities: { str: 10, dex: 10, con: 10, int: 17, wis: 10, cha: 10 },
  ...over,
  spellcasting: { ability: 'int', slots: {} },
  spells: (over.spells ?? []).map(spell),
})

/** A weapon as the importer leaves it: numbers, not a sentence. */
const weapon = (name: string, mod: number | null, dice: string): Sheet['weapons'][number] => ({
  id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
  name,
  mod,
  dice,
  damageType: null,
  text: '',
})

describe('a pnj note', () => {
  it('reads the attack out of an ability', () => {
    const [attack] = attacksOfAbilities([
      ability('Cimitarra', '+3 al ataque, 1d6+1 de daño cortante.'),
    ])
    expect(attack).toMatchObject({ name: 'Cimitarra', kind: 'attack', mod: 3, origin: 'pnj' })
    expect(formatDice(attack!.dice)).toBe('1d6+1')
  })

  it('takes the numbers even when prose follows them', () => {
    // Tulio's sword: the same numbers as the others, and three lines saying so.
    const [attack] = attacksOfAbilities([
      ability(
        'Espada de la guerra',
        '+3 al ataque, 1d6+1 de daño cortante — los mismos números que la espada oxidada de los ' +
          'otros dos. Es mejor acero y lleva tres meses en el fango.',
      ),
    ])
    expect(attack).toMatchObject({ mod: 3 })
    expect(formatDice(attack!.dice)).toBe('1d6+1')
  })

  it('accepts damage with no type — Cristelle has a daga and no adjective', () => {
    const [attack] = attacksOfAbilities([ability('Daga', '+2 al ataque, 1d4 de daño.')])
    expect(formatDice(attack!.dice)).toBe('1d4')
  })

  it('reads the demo campaign, which is written in English', () => {
    // A campaign folder is in whatever language the DM writes in, and the one
    // shipped with the app is not the one this was built against.
    const [attack] = attacksOfAbilities([
      ability('Cheese-Fattened Nibble', '+4 to hit, 1d4+2 piercing damage.'),
    ])
    expect(attack).toMatchObject({ mod: 4 })
    expect(formatDice(attack!.dice)).toBe('1d4+2')
  })

  it('reads every spelling of the to-hit the format allows', () => {
    // `instructions.md` writes «a impactar»; the campaign writes «al ataque»;
    // the fixture writes «to hit». A statblock converted by following the
    // contract has to come out with a bonus, not a null.
    for (const desc of [
      '+4 al ataque, 1d6+2 de daño perforante.',
      '+4 a impactar, 1d6+2 de daño perforante.',
      '+4 to hit, 1d6+2 piercing damage.',
    ]) {
      const [attack] = attacksOfAbilities([ability('Lanza corta', desc)])
      expect(attack, desc).toMatchObject({ mod: 4 })
      expect(formatDice(attack!.dice)).toBe('1d6+2')
    }
  })

  it('offers an attack that states damage and no bonus, with no bonus', () => {
    // Gerald's Devastating Cuddle. Refusing it would be refusing to run the
    // only attack the boss of the demo campaign has.
    const [attack] = attacksOfAbilities([
      ability(
        'Devastating Cuddle',
        'Only used if provoked. 2d8+4 crushing damage and the target is restrained until it escapes.',
      ),
    ])
    expect(attack).toMatchObject({ mod: null })
    expect(formatDice(attack!.dice)).toBe('2d8+4')
  })

  it('leaves an ability that is not an attack alone', () => {
    expect(
      attacksOfAbilities([
        ability(
          'El agua lo cierra todo',
          'Mientras toque el agua de la poza, cada vez que recibe daño la herida se le cierra al ' +
            'instante y lo recupera entero.',
        ),
        ability(
          'La sal',
          'Le afecta como a los suyos: acción, criatura a 1,5 m, salvación de Constitución CD 11, ' +
            'y si falla no puede acercarse ni atacar en su siguiente turno.',
        ),
      ]),
    ).toEqual([])
  })
})

describe('a player sheet', () => {
  it('offers a weapon as the record holds it', () => {
    // Reading «Ataque +5, daño 1d6 +3 perforante» is the importer's job now,
    // and is pinned in `vault/sheet.test.ts`. What is left here is the shape.
    const [attack] = attacksOfSheet(sheet({ weapons: [weapon('Espada corta', 5, '1d6+3')] }))
    expect(attack).toMatchObject({ name: 'Espada corta', mod: 5, origin: 'weapon' })
    expect(formatDice(attack!.dice)).toBe('1d6+3')
  })

  it('carries a negative modifier through — Abraxas swinging a staff', () => {
    const [attack] = attacksOfSheet(sheet({ weapons: [weapon('Bastón', 1, '1d6-1')] }))
    expect(formatDice(attack!.dice)).toBe('1d6-1')
  })

  it('offers nothing for a weapon with no dice on it', () => {
    expect(attacksOfSheet(sheet({ weapons: [weapon('Bastón (foco arcano)', null, '')] }))).toEqual([])
  })

  it('keys a spell attack to the bonus the sheet quotes, not the weapon', () => {
    const [spell] = attacksOfSheet(
      sheet({
        spells: [
          {
            name: 'Saeta de Fuego',
            level: 0,
            roll: '1d10',
            text: 'Ataque de conjuro a distancia por 1d10 de daño de fuego.',
          },
        ],
      }),
    )
    expect(spell).toMatchObject({ kind: 'attack', mod: 5, level: 0 })
  })

  it('reads a save, and whether a made one still takes half', () => {
    const [half, full] = attacksOfSheet(
      sheet({
        spells: [
          {
            name: 'Manos Ardientes',
            level: 1,
            roll: '3d6',
            text: 'Un cono de fuego de 4,5 m. Salvación de Destreza: 3d6 de daño de fuego si falla, la mitad si acierta.',
          },
          {
            name: 'Llama Sagrada',
            level: 0,
            roll: '1d8',
            text: 'Una criatura que puedas ver hace una salvación de Destreza; si falla recibe 1d8 de daño radiante.',
          },
        ],
      }),
    )
    expect(half).toMatchObject({ kind: 'save', save: { dc: 13, ability: 'Destreza', half: true } })
    expect(full!.save!.half).toBe(false)
  })

  it('recognises «La mitad de daño si acierta» too', () => {
    const [spell] = attacksOfSheet(
      sheet({
        spells: [
          {
            name: 'Susurros Disonantes',
            level: 1,
            roll: '3d6',
            text: 'Salvación de Sabiduría: si falla, 3d6 de daño psíquico y tiene que usar su reacción para alejarse de ti. La mitad de daño si acierta.',
          },
        ],
      }),
    )
    expect(spell!.save).toMatchObject({ ability: 'Sabiduría', half: true })
  })

  it('folds the casting modifier into a heal, from the two numbers stated', () => {
    // «Curas 2d4 + tu modificador de lanzamiento» never writes the modifier as
    // a number, but an attack bonus is that modifier plus proficiency.
    const [heal] = attacksOfSheet(
      sheet({
        spells: [
          {
            name: 'Curar Heridas',
            level: 1,
            roll: '2d8',
            text: 'Tocas a una criatura y le curas 2d8 + tu modificador de lanzamiento.',
          },
        ],
      }),
    )
    expect(heal).toMatchObject({ kind: 'heal' })
    expect(formatDice(heal!.dice)).toBe('2d8+3')
  })

  it('prefers «ataque de conjuro» over an ataque mentioned in the rider', () => {
    // Rayo Guía's rider says the *next* attack has advantage; it is still an
    // attack spell, and Susurros' «tiradas de ataque» must not make one.
    const [rayo] = attacksOfSheet(
      sheet({
        spells: [
          {
            name: 'Rayo Guía',
            level: 1,
            roll: '4d6',
            text: 'Ataque de conjuro a distancia por 4d6 de daño radiante; al acertar, el siguiente ataque contra ese objetivo tiene ventaja.',
          },
        ],
      }),
    )
    expect(rayo!.kind).toBe('attack')
  })

  describe('offers nothing it did not understand', () => {
    const nothing = (name: string, roll: string | null, text: string) =>
      it(name, () => {
        expect(attacksOfSheet(sheet({ spells: [{ name, level: 1, roll, text }] }))).toEqual([])
      })

    // Three darts, 1d4+1 each, no attack roll — one `<roll>` describes none of
    // that, so the app must not pretend to run it.
    nothing(
      'Misil Mágico',
      '1d4',
      'Tres dardos que no fallan nunca: 1d4 + 1 de daño de fuerza cada uno, repartidos entre los objetivos que quieras. Sin tirada de ataque.',
    )
    // A save with no damage: nothing to apply, so nothing to resolve.
    nothing(
      'Grasa',
      null,
      'Un cuadrado de 3 m se vuelve resbaladizo: terreno difícil, y quien esté o entre hace una salvación de Destreza o cae derribado.',
    )
    // A d4 that is a bonus to someone else's roll, not damage.
    nothing(
      'Bendición',
      '1d4',
      'Hasta tres aliados suman 1d4 a sus tiradas de ataque y salvaciones mientras dure.',
    )
    nothing(
      'Guía',
      '1d4',
      'Tocas a alguien dispuesto: puede sumar 1d4 a una prueba de característica que haga.',
    )
  })

  it('offers nothing at all without a sheet', () => {
    expect(attacksOfSheet(undefined)).toEqual([])
  })
})

