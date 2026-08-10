/* ============================================================ DM RULES DATA
   Frozen tables the character creator has no use for, so they are dm-owned
   and outside check-sync's remit — unlike src/rules/*, which must stay
   byte-identical to the creator's blocks.

   Text paraphrased from SRD 5.2 (CC-BY-4.0), (c) Wizards of the Coast.
   Nothing is copied from the Player's Handbook.
========================================================================= */

/* The fifteen conditions, plus concentration — which is not a condition but
   is the thing a DM forgets most, and a marked player taking damage is
   exactly the moment it matters. `exh` marks the one that has levels. */
export const CONDITIONS = Object.freeze([
  { key: 'apresado', es: 'Apresado', en: 'Restrained',
    d: 'Velocidad 0. Desventaja en tus ataques y en tus salvaciones de Destreza; ventaja en los ataques contra ti.' },
  { key: 'agarrado', es: 'Agarrado', en: 'Grappled',
    d: 'Velocidad 0. Desventaja en tus ataques contra cualquiera que no sea quien te agarra. Termina si el agarrador queda incapacitado o si os separan.' },
  { key: 'agotamiento', es: 'Agotamiento', en: 'Exhaustion', exh: true,
    d: 'Seis niveles. Cada nivel resta 2 a todas tus tiradas d20 y 1,5 m a tu velocidad. Al nivel 6 mueres. Un descanso largo quita un nivel.' },
  { key: 'asustado', es: 'Asustado', en: 'Frightened',
    d: 'Desventaja en pruebas y ataques mientras veas la fuente del miedo, y no puedes acercarte a ella voluntariamente.' },
  { key: 'aturdido', es: 'Aturdido', en: 'Stunned',
    d: 'Incapacitado, no te puedes mover y hablas con dificultad. Fallas las salvaciones de Fuerza y Destreza. Ventaja en los ataques contra ti.' },
  { key: 'cegado', es: 'Cegado', en: 'Blinded',
    d: 'No ves: fallas toda prueba que requiera vista. Desventaja en tus ataques; ventaja en los ataques contra ti.' },
  { key: 'derribado', es: 'Derribado', en: 'Prone',
    d: 'Solo puedes arrastrarte hasta levantarte, y levantarte cuesta la mitad de tu movimiento. Desventaja en tus ataques. Los ataques contra ti tienen ventaja desde 1,5 m y desventaja desde más lejos.' },
  { key: 'encantado', es: 'Encantado', en: 'Charmed',
    d: 'No puedes atacar a quien te encantó ni elegirlo como objetivo de un efecto dañino. Él tiene ventaja en las pruebas sociales contigo.' },
  { key: 'ensordecido', es: 'Ensordecido', en: 'Deafened',
    d: 'No oyes: fallas toda prueba que requiera oído.' },
  { key: 'envenenado', es: 'Envenenado', en: 'Poisoned',
    d: 'Desventaja en tiradas de ataque y en pruebas de característica.' },
  { key: 'incapacitado', es: 'Incapacitado', en: 'Incapacitated',
    d: 'Sin acciones, acciones adicionales ni reacciones. Pierdes la concentración y no puedes hablar. Desventaja en iniciativa si lo estás al tirarla.' },
  { key: 'inconsciente', es: 'Inconsciente', en: 'Unconscious',
    d: 'Incapacitado y derribado, sueltas lo que llevas y no percibes nada. Fallas las salvaciones de Fuerza y Destreza. Ventaja en los ataques contra ti, y todo impacto desde 1,5 m es crítico.' },
  { key: 'invisible', es: 'Invisible', en: 'Invisible',
    d: 'No te ven sin ayuda mágica, y puedes esconderte aun estando a la vista. Ventaja en tus ataques y en la iniciativa; desventaja en los ataques contra ti.' },
  { key: 'paralizado', es: 'Paralizado', en: 'Paralyzed',
    d: 'Incapacitado, no te mueves ni hablas. Fallas las salvaciones de Fuerza y Destreza. Ventaja en los ataques contra ti, y todo impacto desde 1,5 m es crítico.' },
  { key: 'petrificado', es: 'Petrificado', en: 'Petrified',
    d: 'Piedra: incapacitado, sin percibir nada, peso ×10 y dejas de envejecer. Resistencia a todo el daño, inmune a veneno y enfermedad. Fallas las salvaciones de Fuerza y Destreza. Ventaja en los ataques contra ti.' },
  { key: 'concentracion', es: 'Concentración', en: 'Concentration', mark: true,
    d: 'No es una condición: es un recordatorio. Al recibir daño, salvación de Constitución con CD 10 o la mitad del daño, la que sea mayor. Se pierde al quedar incapacitado.' },
]);

export const CONDITION = key => CONDITIONS.find(c => c.key === key) || null;
