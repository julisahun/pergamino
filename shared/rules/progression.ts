/**
 * What a class gains at a level — as a table, not as code.
 *
 * ## Why this can exist
 *
 * The repo's rule is that the app does not implement 5e rules, and this does
 * not: it is a **vocabulary table**, the same kind of thing as `conditions.ts`
 * and `SKILLS`, and nothing here derives anything. A level-up reads the row
 * for `(class, level)`, *proposes* what it says, and the person confirms — the
 * numbers still land as a patch a human can change on the way past. So the app
 * never puts a number in front of the players that nobody wrote; it just stops
 * making someone remember it.
 *
 * ## Gaps are normal
 *
 * **Nothing depends on this being complete.** A class nobody has written, a
 * level nobody has reached, a homebrew — `grantFor` returns `null` and the
 * level-up form falls back to what it always was: type the numbers yourself.
 * Filling a row in is content, never code, and no class is special.
 *
 * ## About the content below
 *
 * Written against the 2024 rules and **worth checking before a player sees
 * it** — a wrong row here is exactly the failure this repo is otherwise
 * careful about. Correcting one is editing one object.
 *
 * Rules content paraphrased from the SRD 5.2 (CC-BY-4.0, © Wizards of the
 * Coast). No text is copied from the Player's Handbook.
 */
import { slugId, type Prof, type SkillKey } from '../character.ts'

/** Something the level hands over with no decision attached. */
export interface Feature {
  name: string
  text: string
}

/**
 * Something the player decides.
 *
 * `id` is stable within one grant, so the form can hold an answer per choice
 * without caring what the choice is.
 */
export type Choice =
  | {
      kind: 'skills'
      id: string
      label: string
      /** How many to pick. */
      pick: number
      /** What picking one makes it. */
      as: Prof
      /** The shortlist, when the class narrows it. Absent means all eighteen. */
      from?: SkillKey[]
      help?: string
    }
  | {
      kind: 'spells'
      id: string
      label: string
      pick: number
      /** The highest spell level that may be picked here. */
      maxLevel: number
      help?: string
    }
  | {
      kind: 'features'
      id: string
      label: string
      pick: number
      from: Feature[]
      help?: string
    }

export interface LevelGrant {
  /** The class's hit die, so the form can offer the average rather than ask. */
  hitDie?: number
  /** Handed over outright. */
  features?: Feature[]
  /** Handed over if the player chooses. */
  choices?: Choice[]
  /** Every spell slot the class has **at this level**, not the difference. */
  slots?: Record<string, number>
  /** How many spells are prepared at this level — the picker's target. */
  prepared?: number
  /** The spell list to pick from, when it is not the class's own slug. */
  spellList?: string
}

/** `Pícaro` → `picaro`, `Clérigo` → `clerigo`. What the tables are keyed by. */
export const classSlug = (className: string | null | undefined): string =>
  className ? slugId(className) : ''

const ARCANE_SKILLS: SkillKey[] = [
  'arcanos',
  'historia',
  'investigacion',
  'medicina',
  'naturaleza',
  'religion',
]

/**
 * `class slug` → `level` → what that level gives.
 *
 * Add a row by writing one; nothing else has to know about it.
 */
export const PROGRESSION: Record<string, Record<number, LevelGrant>> = {
  picaro: {
    2: {
      hitDie: 8,
      features: [
        {
          name: 'Astucia',
          text: 'Puedes Correr, Destrabarte o Esconderte como acción adicional, sin gastar tu acción.',
        },
      ],
    },
  },
  bardo: {
    2: {
      hitDie: 8,
      slots: { '1': 3 },
      prepared: 5,
      features: [
        {
          name: 'Aprendiz de todo',
          text: 'Sumas la mitad de tu bonificador de competencia, redondeando hacia abajo, a cualquier prueba de característica en la que no seas ya competente. También cuenta para la iniciativa.',
        },
      ],
      choices: [
        {
          kind: 'skills',
          id: 'experticia',
          label: 'Experticia',
          pick: 2,
          as: 'expertise',
          help: 'Dos habilidades en las que ya seas competente: pasan a doblar la competencia.',
        },
        {
          kind: 'spells',
          id: 'preparado',
          label: 'Un conjuro más',
          pick: 1,
          maxLevel: 1,
          help: 'Un bardo sólo cambia conjuros al subir de nivel, así que éste se queda una temporada.',
        },
      ],
    },
  },
  clerigo: {
    2: {
      hitDie: 8,
      slots: { '1': 3 },
      prepared: 5,
      features: [
        {
          name: 'Canalizar Divinidad',
          text: 'Dos usos por descanso corto o largo. Chispa Divina: acción mágica, tocas o apuntas a 9 m y curas o haces 1d8 de daño radiante o necrótico. Expulsar Muertos Vivientes: los no muertos a 9 m hacen una salvación de Sabiduría o huyen durante un minuto.',
        },
      ],
      choices: [
        {
          kind: 'spells',
          id: 'preparado',
          label: 'Un conjuro más preparado',
          pick: 1,
          maxLevel: 1,
          help: 'Se puede cambiar en cada descanso largo, así que no es una decisión cara.',
        },
      ],
    },
  },
  mago: {
    2: {
      hitDie: 6,
      slots: { '1': 3 },
      prepared: 5,
      choices: [
        {
          kind: 'skills',
          id: 'erudito',
          label: 'Erudito',
          pick: 1,
          as: 'expertise',
          from: ARCANE_SKILLS,
          help: 'Una en la que ya seas competente, de entre Arcanos, Historia, Investigación, Medicina, Naturaleza y Religión.',
        },
        {
          kind: 'spells',
          id: 'libro',
          label: 'Dos conjuros para el libro',
          pick: 2,
          maxLevel: 1,
          help: 'Los copia él, y son suyos para siempre.',
        },
      ],
    },
  },
}

/** What this class gains at this level, or `null` when nobody has written it. */
export function grantFor(className: string | null | undefined, level: number): LevelGrant | null {
  return PROGRESSION[classSlug(className)]?.[level] ?? null
}

/** The average of a die, rounded up — what a level-up takes instead of rolling. */
export const averageOf = (die: number): number => Math.floor(die / 2) + 1

/** Which classes and levels the table knows, for a screen that wants to say so. */
export const known = (): { className: string; levels: number[] }[] =>
  Object.entries(PROGRESSION).map(([className, levels]) => ({
    className,
    levels: Object.keys(levels).map(Number).sort((a, b) => a - b),
  }))
