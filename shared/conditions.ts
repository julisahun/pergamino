/** The 5e condition list, in the Spanish the campaign notes use. */
export const CONDITIONS = [
  'Agarrado',
  'Apresado',
  'Aturdido',
  'Asustado',
  'Cegado',
  'Derribado',
  'Ensordecido',
  'Envenenado',
  'Hechizado',
  'Incapacitado',
  'Inconsciente',
  'Invisible',
  'Paralizado',
  'Petrificado',
] as const

export type Condition = (typeof CONDITIONS)[number]

/** Two-letter chips for the table HUD, where space is tight. */
export const CONDITION_SHORT: Record<string, string> = {
  Agarrado: 'AGA',
  Apresado: 'APR',
  Aturdido: 'ATU',
  Asustado: 'MIE',
  Cegado: 'CEG',
  Derribado: 'DER',
  Ensordecido: 'SOR',
  Envenenado: 'VEN',
  Hechizado: 'HEC',
  Incapacitado: 'INC',
  Inconsciente: 'K.O.',
  Invisible: 'INV',
  Paralizado: 'PAR',
  Petrificado: 'PET',
}
