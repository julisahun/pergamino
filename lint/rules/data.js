/* ============================================================== RULES DATA
   Frozen tables. Spanish names first, English in `en` so the sheet can show
   "Sigilo (Stealth)" and the DM can look the term up in an English book.
   No calculations in this block.
========================================================================= */

export const PROFICIENCY_BONUS = 2;            // level 1, all classes

export const ABILITIES = Object.freeze([
  { key: 'FUE', es: 'Fuerza',       en: 'Strength' },
  { key: 'DES', es: 'Destreza',     en: 'Dexterity' },
  { key: 'CON', es: 'Constitución', en: 'Constitution' },
  { key: 'INT', es: 'Inteligencia', en: 'Intelligence' },
  { key: 'SAB', es: 'Sabiduría',    en: 'Wisdom' },
  { key: 'CAR', es: 'Carisma',      en: 'Charisma' },
]);

export const SKILLS = Object.freeze([
  { key: 'acrobacias',   es: 'Acrobacias',        en: 'Acrobatics',      ability: 'DES' },
  { key: 'animales',     es: 'Trato con Animales',en: 'Animal Handling', ability: 'SAB' },
  { key: 'arcanos',      es: 'Arcanos',           en: 'Arcana',          ability: 'INT' },
  { key: 'atletismo',    es: 'Atletismo',         en: 'Athletics',       ability: 'FUE' },
  { key: 'engano',       es: 'Engaño',            en: 'Deception',       ability: 'CAR' },
  { key: 'historia',     es: 'Historia',          en: 'History',         ability: 'INT' },
  { key: 'perspicacia',  es: 'Perspicacia',       en: 'Insight',         ability: 'SAB' },
  { key: 'intimidacion', es: 'Intimidación',      en: 'Intimidation',    ability: 'CAR' },
  { key: 'investigacion',es: 'Investigación',     en: 'Investigation',   ability: 'INT' },
  { key: 'medicina',     es: 'Medicina',          en: 'Medicine',        ability: 'SAB' },
  { key: 'naturaleza',   es: 'Naturaleza',        en: 'Nature',          ability: 'INT' },
  { key: 'percepcion',   es: 'Percepción',        en: 'Perception',      ability: 'SAB' },
  { key: 'interpretacion',es:'Interpretación',    en: 'Performance',     ability: 'CAR' },
  { key: 'persuasion',   es: 'Persuasión',        en: 'Persuasion',      ability: 'CAR' },
  { key: 'religion',     es: 'Religión',          en: 'Religion',        ability: 'INT' },
  { key: 'manos',        es: 'Juego de Manos',    en: 'Sleight of Hand', ability: 'DES' },
  { key: 'sigilo',       es: 'Sigilo',            en: 'Stealth',         ability: 'DES' },
  { key: 'supervivencia',es: 'Supervivencia',     en: 'Survival',        ability: 'SAB' },
]);

/* Weapon mastery properties (2024). Spanish label, English in parentheses. */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const MASTERIES = Object.freeze({
  tajo:      { es: 'Tajo',       en: 'Cleave',  d: 'Al acertar cuerpo a cuerpo, golpeas también a otro enemigo a 1,5 m del primero (sin sumar el modificador al daño). Una vez por turno.' },
  roce:      { es: 'Roce',       en: 'Graze',   d: 'Si fallas, el objetivo recibe daño igual al modificador de la característica de ataque.' },
  mella:     { es: 'Mella',      en: 'Nick',    d: 'El ataque extra de arma ligera lo haces como parte del ataque principal, no con acción adicional. Una vez por turno.' },
  empujar:   { es: 'Empujar',    en: 'Push',    d: 'Al acertar, puedes empujar al objetivo hasta 3 m en línea recta si es Grande o menor.' },
  minar:     { es: 'Minar',      en: 'Sap',     d: 'Al acertar, el objetivo tiene desventaja en su siguiente tirada de ataque.' },
  ralentizar:{ es: 'Ralentizar', en: 'Slow',    d: 'Al acertar, la velocidad del objetivo baja 3 m hasta el inicio de tu siguiente turno. Una vez por turno.' },
  derribar:  { es: 'Derribar',   en: 'Topple',  d: 'Al acertar, el objetivo hace una salvación de Constitución contra tu CD de conjuros de arma o queda derribado.' },
  hostigar:  { es: 'Hostigar',   en: 'Vex',     d: 'Al acertar, tienes ventaja en tu siguiente ataque contra ese objetivo en este turno o el siguiente.' },
});

export const ARMORS = Object.freeze([
  { key: 'ninguna',   es: 'Sin armadura',        en: '—',              cat: 'ninguna', ca: 10, dex: 'full', str: 0, stealth: false, weight: 0 },
  { key: 'acolchada', es: 'Armadura acolchada',  en: 'Padded',         cat: 'ligera',  ca: 11, dex: 'full', str: 0, stealth: true,  weight: 4 },
  { key: 'cuero',     es: 'Armadura de cuero',   en: 'Leather',        cat: 'ligera',  ca: 11, dex: 'full', str: 0, stealth: false, weight: 5 },
  { key: 'tachonado', es: 'Cuero tachonado',     en: 'Studded Leather',cat: 'ligera',  ca: 12, dex: 'full', str: 0, stealth: false, weight: 6.5 },
  { key: 'pieles',    es: 'Armadura de pieles',  en: 'Hide',           cat: 'media',   ca: 12, dex: 2,      str: 0, stealth: false, weight: 6 },
  { key: 'camisote',  es: 'Camisote de mallas',  en: 'Chain Shirt',    cat: 'media',   ca: 13, dex: 2,      str: 0, stealth: false, weight: 10 },
  { key: 'escamas',   es: 'Coraza de escamas',   en: 'Scale Mail',     cat: 'media',   ca: 14, dex: 2,      str: 0, stealth: true,  weight: 22.5 },
  { key: 'coraza',    es: 'Coraza',              en: 'Breastplate',    cat: 'media',   ca: 14, dex: 2,      str: 0, stealth: false, weight: 10 },
  { key: 'semiplacas',es: 'Semiplacas',          en: 'Half Plate',     cat: 'media',   ca: 15, dex: 2,      str: 0, stealth: true,  weight: 20 },
  { key: 'anillas',   es: 'Cota de anillas',     en: 'Ring Mail',      cat: 'pesada',  ca: 14, dex: 'none',      str: 0, stealth: true,  weight: 20 },
  { key: 'malla',     es: 'Cota de malla',       en: 'Chain Mail',     cat: 'pesada',  ca: 16, dex: 'none',      str: 13,stealth: true,  weight: 27.5 },
  { key: 'bandas',    es: 'Armadura de bandas',  en: 'Splint',         cat: 'pesada',  ca: 17, dex: 'none',      str: 15,stealth: true,  weight: 30 },
  { key: 'placas',    es: 'Armadura de placas',  en: 'Plate',          cat: 'pesada',  ca: 18, dex: 'none',      str: 15,stealth: true,  weight: 32.5 },
]);

/* dmg types: c = contundente, p = perforante, t = cortante */
export const WEAPONS = Object.freeze([
  // --- simples cuerpo a cuerpo
  { key:'daga',         es:'Daga',               en:'Dagger',         cat:'simple', melee:true,  dmg:'1d4',  type:'p', props:['sutil','ligera','arrojadiza 6/18'],mastery:'mella',      weight:.5 },
  { key:'maza',         es:'Maza',               en:'Mace',           cat:'simple', melee:true,  dmg:'1d6',  type:'c', props:[],                                  mastery:'minar',      weight:2 },
  { key:'baston',       es:'Bastón',             en:'Quarterstaff',   cat:'simple', melee:true,  dmg:'1d6',  type:'c', props:['versátil 1d8'],                    mastery:'derribar',   weight:2 },
  // --- simples a distancia
  { key:'arco-corto',   es:'Arco corto',         en:'Shortbow',       cat:'simple', melee:false, dmg:'1d6',  type:'p', props:['munición 24/96','a dos manos'],    mastery:'hostigar',   weight:1 },
  // --- marciales cuerpo a cuerpo
  { key:'hacha-grande', es:'Hacha grande',       en:'Greataxe',       cat:'marcial',melee:true,  dmg:'1d12', type:'t', props:['pesada','a dos manos'],            mastery:'tajo',       weight:3.5 },
  { key:'espada-larga', es:'Espada larga',       en:'Longsword',      cat:'marcial',melee:true,  dmg:'1d8',  type:'t', props:['versátil 1d10'],                   mastery:'minar',      weight:1.5 },
  { key:'espada-corta', es:'Espada corta',       en:'Shortsword',     cat:'marcial',melee:true,  dmg:'1d6',  type:'p', props:['sutil','ligera'],                  mastery:'hostigar',   weight:1 },
  { key:'martillo-gue', es:'Martillo de guerra', en:'Warhammer',      cat:'marcial',melee:true,  dmg:'1d8',  type:'c', props:['versátil 1d10'],                   mastery:'empujar',    weight:2.5 },
  // --- marciales a distancia
  { key:'arco-largo',   es:'Arco largo',         en:'Longbow',        cat:'marcial',melee:false, dmg:'1d8',  type:'p', props:['munición 45/180','pesada','a dos manos'], mastery:'ralentizar', weight:1 },
]);

export const DAMAGE_TYPES = Object.freeze({ c: 'contundente', p: 'perforante', t: 'cortante' });

export const ARTISAN_TOOLS = Object.freeze([
  'Herramientas de albañil', 'Herramientas de alfarero', 'Herramientas de calderero',
  'Herramientas de carpintero', 'Herramientas de cartógrafo', 'Herramientas de cervecero',
  'Herramientas de curtidor', 'Herramientas de herrero', 'Herramientas de joyero',
  'Herramientas de pintor', 'Herramientas de sopladores de vidrio', 'Herramientas de tejedor',
  'Herramientas de zapatero', 'Herramientas de cocinero', 'Herramientas de calafate',
  'Útiles de calígrafo', 'Herramientas de trampero',
]);

export const INSTRUMENTS = Object.freeze([
  'Laúd', 'Flauta', 'Tambor', 'Lira', 'Cuerno', 'Gaita', 'Dulcémele',
  'Flauta de Pan', 'Shawm', 'Viol',
]);

export const GAMING_SETS = Object.freeze(['Juego de dados', 'Juego de naipes', 'Juego de ajedrez de dragón', 'Set de tres dragones']);

/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const LANGUAGES = Object.freeze({
  standard: ['Común', 'Common Sign Language', 'Enano', 'Élfico', 'Gigante', 'Gnómico', 'Goblin', 'Mediano', 'Orco'],
  rare: ['Abisal', 'Celestial', 'Dracónico', 'Habla Profunda', 'Infernal', 'Primordial', 'Silvano', 'Bajo Común'],
});

/* Origin feats (2024). `hooks` is what the engine must apply mechanically. */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const ORIGIN_FEATS = Object.freeze({
  alerta: {
    es: 'Alerta', en: 'Alert',
    d: 'Sumas tu bonificador de competencia a la iniciativa. Además puedes cambiar tu puesto en el orden de iniciativa con un aliado dispuesto.',
    hooks: { initiativeProficiency: true },
  },
  artesano: {
    es: 'Artesano', en: 'Crafter',
    d: 'Competencia con tres herramientas de artesano a tu elección, un 20 % de descuento al comprar equipo no mágico, y fabricas objetos sencillos más rápido.',
    hooks: { toolChoices: { n: 3, from: 'artisan' } },
  },
  curandero: {
    es: 'Curandero', en: 'Healer',
    d: 'Con un botiquín puedes gastar un uso como acción adicional para curar a alguien 1d4 + su bonificador de competencia + su número de dados de golpe. Además vuelves a tirar cualquier 1 en dados de curación.',
    hooks: {},
  },
  afortunado: {
    es: 'Afortunado', en: 'Lucky',
    d: 'Tienes puntos de suerte iguales a tu bonificador de competencia y se recuperan con un descanso largo. Gasta uno para dar ventaja a una prueba de d20 tuya, o desventaja a un ataque contra ti.',
    hooks: {},
  },
  iniciado: {
    es: 'Iniciado en la magia', en: 'Magic Initiate',
    d: 'Aprendes dos trucos y un conjuro de nivel 1 de la lista que elijas. El conjuro de nivel 1 lo puedes lanzar una vez por descanso largo sin gastar espacio, o gastando un espacio si lo tienes.',
    hooks: { magicInitiate: true },
  },
  musico: {
    es: 'Músico', en: 'Musician',
    d: 'Competencia con tres instrumentos musicales a tu elección. Al terminar un descanso corto o largo puedes dar Inspiración Heroica a tantos aliados como tu bonificador de competencia.',
    hooks: { toolChoices: { n: 3, from: 'instruments' } },
  },
  atacante: {
    es: 'Atacante salvaje', en: 'Savage Attacker',
    d: 'Una vez por turno, cuando aciertas un ataque con arma, puedes volver a tirar el daño del arma y quedarte con el resultado que prefieras.',
    hooks: {},
  },
  instruido: {
    es: 'Instruido', en: 'Skilled',
    d: 'Ganas competencia en tres habilidades o herramientas a tu elección.',
    hooks: { skillChoices: { n: 3 } },
  },
  camorrista: {
    es: 'Camorrista de taberna', en: 'Tavern Brawler',
    d: 'Tu golpe sin armas hace 1d4 contundente, puedes volver a tirar un 1 en ese daño, y al acertar puedes empujar al objetivo 1,5 m. Además ganas competencia con improvisadas.',
    hooks: { unarmed: '1d4' },
  },
  robusto: {
    es: 'Robusto', en: 'Tough',
    d: 'Tus puntos de golpe máximos aumentan en 2 por cada nivel que tengas.',
    hooks: { hpPerLevel: 2 },
  },
});

/* -------------------------------------------------------------- SPECIES */
/* size: array of allowed sizes (choice when length > 1).
   grants.skills / grants.originFeat / grants.cantrips are engine hooks. */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const SPECIES = Object.freeze({
  aasimar: {
    es: 'Aasimar', en: 'Aasimar', speed: 9, size: ['Mediano', 'Pequeño'],
    why: 'Sangre celestial: cura con las manos y resiste lo necrótico y lo radiante.',
    traits: [
      { n: 'Visión en la oscuridad 18 m', d: 'Ves con poca luz como si fuera luz brillante, y en la oscuridad como si hubiera poca luz, en blanco y negro.' },
      { n: 'Resistencia celestial', d: 'Resistencia al daño necrótico y al radiante.' },
      { n: 'Manos sanadoras', d: 'Como acción, tocas a una criatura y le curas un número de d4 igual a tu bonificador de competencia. Una vez por descanso largo.' },
      { n: 'Portador de luz', d: 'Conoces el truco Luz (Light). Tu característica de lanzamiento para él es Carisma.' },
      { n: 'Revelación celestial (nivel 3)', d: 'Todavía no la tienes: llega al nivel 3.' },
    ],
    grants: { cantrips: ['Light'] },
  },

  draconido: {
    es: 'Dracónido', en: 'Dragonborn', speed: 9, size: ['Mediano'],
    why: 'Un aliento de dragón varias veces por combate, y resistencia a su tipo de daño.',
    traits: [
      { n: 'Visión en la oscuridad 18 m', d: 'Ves con poca luz como si fuera luz brillante, y en la oscuridad como si hubiera poca luz, en blanco y negro.' },
      { n: 'Arma de aliento', d: 'Al hacer la acción de Atacar puedes sustituir uno de los ataques por un aliento en cono de 4,5 m o línea de 9 m por 1,5 m. Cada criatura afectada hace una salvación de Destreza CD 8 + tu modificador de Constitución + tu bonificador de competencia; falla y recibe 1d10 del tipo de tu ancestro, la mitad si tiene éxito. Usos iguales a tu bonificador de competencia por descanso largo.' },
      { n: 'Vuelo dracónico (nivel 5)', d: 'Todavía no lo tienes: llega al nivel 5.' },
    ],
    lineages: {
      negro:  { es: 'Ancestro negro',  why: 'Ácido',       traits: [{ n: 'Ancestro dracónico: negro',  d: 'Tu aliento hace daño de ácido y tienes resistencia al ácido.' }] },
      azul:   { es: 'Ancestro azul',   why: 'Relámpago',   traits: [{ n: 'Ancestro dracónico: azul',   d: 'Tu aliento hace daño de relámpago y tienes resistencia al relámpago.' }] },
      laton:  { es: 'Ancestro latón',  why: 'Fuego',       traits: [{ n: 'Ancestro dracónico: latón',  d: 'Tu aliento hace daño de fuego y tienes resistencia al fuego.' }] },
      bronce: { es: 'Ancestro bronce', why: 'Relámpago',   traits: [{ n: 'Ancestro dracónico: bronce', d: 'Tu aliento hace daño de relámpago y tienes resistencia al relámpago.' }] },
      cobre:  { es: 'Ancestro cobre',  why: 'Ácido',       traits: [{ n: 'Ancestro dracónico: cobre',  d: 'Tu aliento hace daño de ácido y tienes resistencia al ácido.' }] },
      oro:    { es: 'Ancestro oro',    why: 'Fuego',       traits: [{ n: 'Ancestro dracónico: oro',    d: 'Tu aliento hace daño de fuego y tienes resistencia al fuego.' }] },
      verde:  { es: 'Ancestro verde',  why: 'Veneno',      traits: [{ n: 'Ancestro dracónico: verde',  d: 'Tu aliento hace daño de veneno y tienes resistencia al veneno.' }] },
      rojo:   { es: 'Ancestro rojo',   why: 'Fuego',       traits: [{ n: 'Ancestro dracónico: rojo',   d: 'Tu aliento hace daño de fuego y tienes resistencia al fuego.' }] },
      plata:  { es: 'Ancestro plata',  why: 'Frío',        traits: [{ n: 'Ancestro dracónico: plata',  d: 'Tu aliento hace daño de frío y tienes resistencia al frío.' }] },
      blanco: { es: 'Ancestro blanco', why: 'Frío',        traits: [{ n: 'Ancestro dracónico: blanco', d: 'Tu aliento hace daño de frío y tienes resistencia al frío.' }] },
    },
  },

  enano: {
    es: 'Enano', en: 'Dwarf', speed: 9, size: ['Mediano'],
    why: 'Duro de matar: resistencia a veneno y un punto de golpe extra por nivel.',
    traits: [
      { n: 'Visión en la oscuridad 36 m', d: 'Ves con poca luz como si fuera luz brillante, y en la oscuridad como si hubiera poca luz, en blanco y negro.' },
      { n: 'Resistencia enana', d: 'Resistencia al daño de veneno y ventaja en las salvaciones para evitar el estado envenenado.' },
      { n: 'Dureza enana', d: 'Tus puntos de golpe máximos aumentan en 1 por cada nivel que tengas.' },
      { n: 'Saber de la piedra', d: 'Como acción adicional ganas sentido de vibraciones 18 m durante 10 minutos, mientras estés en contacto con piedra. Usos iguales a tu bonificador de competencia por descanso largo.' },
    ],
    grants: { hpPerLevel: 1 },
  },

  elfo: {
    es: 'Elfo', en: 'Elf', speed: 9, size: ['Mediano'],
    why: 'Difícil de encantar, buenos sentidos, y un truco gratis según el linaje.',
    traits: [
      { n: 'Visión en la oscuridad 18 m', d: 'Ves con poca luz como si fuera luz brillante, y en la oscuridad como si hubiera poca luz, en blanco y negro.' },
      { n: 'Linaje feérico', d: 'Ventaja en las salvaciones para evitar el estado hechizado.' },
      { n: 'Sentidos agudos', d: 'Competencia en una de estas habilidades: Perspicacia, Percepción o Supervivencia.' },
      { n: 'Trance', d: 'No necesitas dormir: un descanso largo te cuesta 4 horas de meditación en vez de 8.' },
    ],
    grants: { skills: 1, skillsFrom: ['perspicacia', 'percepcion', 'supervivencia'] },
    lineages: {
      drow: {
        es: 'Drow', why: 'Visión en la oscuridad 36 m y Luces Danzantes.',
        cantrips: ['Dancing Lights'],
        traits: [{ n: 'Drow', d: 'Tu visión en la oscuridad sube a 36 m y conoces el truco Luces Danzantes (Dancing Lights). A nivel 3 aprendes Fuego Feérico y a nivel 5 Oscuridad.' }],
      },
      alto: {
        es: 'Alto elfo', why: 'Prestidigitación, y la puedes cambiar por otro truco.',
        cantrips: ['Prestidigitation'],
        traits: [{ n: 'Alto elfo', d: 'Conoces el truco Prestidigitación (Prestidigitation) y puedes cambiarlo por otro truco de mago al terminar un descanso largo. A nivel 3 aprendes Detectar Magia y a nivel 5 Paso Brumoso.' }],
      },
      bosque: {
        es: 'Elfo del bosque', why: 'Velocidad 10,5 m y Truco de Druida.',
        speed: 10.5,
        cantrips: ['Druidcraft'],
        traits: [{ n: 'Elfo del bosque', d: 'Tu velocidad es de 10,5 m y conoces el truco Truco de Druida (Druidcraft). A nivel 3 aprendes Zancada Prolongada y a nivel 5 Pasar sin Rastro.' }],
      },
    },
  },

  gnomo: {
    es: 'Gnomo', en: 'Gnome', speed: 9, size: ['Pequeño'],
    why: 'Ventaja en las tres salvaciones mentales: lo más difícil de conseguir a nivel bajo.',
    traits: [
      { n: 'Visión en la oscuridad 18 m', d: 'Ves con poca luz como si fuera luz brillante, y en la oscuridad como si hubiera poca luz, en blanco y negro.' },
      { n: 'Astucia gnómica', d: 'Ventaja en las salvaciones de Inteligencia, Sabiduría y Carisma.' },
    ],
    lineages: {
      bosque: {
        es: 'Gnomo del bosque', why: 'Ilusión Menor y hablar con animales.',
        cantrips: ['Minor Illusion'],
        traits: [{ n: 'Gnomo del bosque', d: 'Conoces el truco Ilusión Menor (Minor Illusion) y puedes lanzar Hablar con los Animales sin gastar espacio, tantas veces como tu bonificador de competencia por descanso largo.' }],
      },
      rocas: {
        es: 'Gnomo de las rocas', why: 'Competencia con herramientas de calderero y cachivaches.',
        traits: [{ n: 'Gnomo de las rocas', d: 'Ganas competencia con herramientas de calderero. Con ellas y 10 po puedes construir en 1 hora un dispositivo mecánico Diminuto que hace un efecto sencillo: un olor, una luz, un sonido o una chispa.' }],
      },
    },
  },

  goliat: {
    es: 'Goliat', en: 'Goliath', speed: 10.5, size: ['Mediano'],
    why: 'Velocidad 10,5 m, carga el doble, y un don de gigante por descanso largo.',
    traits: [
      { n: 'Constitución poderosa', d: 'Cuentas como una talla mayor para tu capacidad de carga, y tienes ventaja en las salvaciones para evitar el estado apresado.' },
      { n: 'Forma grande (nivel 5)', d: 'Todavía no la tienes: llega al nivel 5.' },
    ],
    lineages: {
      nube:     { es: 'Ancestro de nube',     why: 'Teletransporte corto.',       traits: [{ n: 'Salto de la nube', d: 'Como acción adicional te teletransportas hasta 9 m a un espacio que veas. Usos iguales a tu bonificador de competencia por descanso largo.' }] },
      fuego:    { es: 'Ancestro de fuego',    why: 'Daño de fuego extra.',        traits: [{ n: 'Quemadura del fuego', d: 'Cuando aciertas un ataque, puedes hacer 1d10 de daño de fuego extra. Usos iguales a tu bonificador de competencia por descanso largo.' }] },
      escarcha: { es: 'Ancestro de escarcha', why: 'Daño de frío y ralentizar.',  traits: [{ n: 'Escalofrío de la escarcha', d: 'Cuando aciertas un ataque, puedes hacer 1d6 de daño de frío extra y reducir la velocidad del objetivo 3 m hasta el inicio de tu siguiente turno. Usos iguales a tu bonificador de competencia por descanso largo.' }] },
      colina:   { es: 'Ancestro de colina',   why: 'Derribar al acertar.',        traits: [{ n: 'Caída de la colina', d: 'Cuando aciertas un ataque, puedes obligar al objetivo (Grande o menor) a hacer una salvación de Fuerza contra tu CD o queda derribado. Usos iguales a tu bonificador de competencia por descanso largo.' }] },
      piedra:   { es: 'Ancestro de piedra',   why: 'Reducir daño recibido.',      traits: [{ n: 'Aguante de la piedra', d: 'Como reacción al recibir daño, lo reduces en 1d12 + tu modificador de Constitución. Usos iguales a tu bonificador de competencia por descanso largo.' }] },
      tormenta: { es: 'Ancestro de tormenta', why: 'Daño de trueno en área.',     traits: [{ n: 'Trueno de la tormenta', d: 'Como reacción al recibir daño, haces 1d8 de daño de trueno a una criatura a 18 m. Usos iguales a tu bonificador de competencia por descanso largo.' }] },
    },
  },

  humano: {
    es: 'Humano', en: 'Human', speed: 9, size: ['Mediano', 'Pequeño'],
    why: 'La más flexible: una habilidad extra y una segunda dote de origen.',
    traits: [
      { n: 'Ingenioso', d: 'Ganas Inspiración Heroica cada vez que terminas un descanso largo.' },
      { n: 'Hábil', d: 'Competencia en una habilidad a tu elección.' },
      { n: 'Versátil', d: 'Ganas una dote de origen a tu elección, además de la del trasfondo.' },
    ],
    grants: { skills: 1, originFeat: true },
  },

  mediano: {
    es: 'Mediano', en: 'Halfling', speed: 9, size: ['Pequeño'],
    why: 'Vuelve a tirar los 1, difícil de asustar y casi imposible de ver.',
    traits: [
      { n: 'Valiente', d: 'Ventaja en las salvaciones para evitar el estado asustado.' },
      { n: 'Agilidad de mediano', d: 'Puedes atravesar el espacio de cualquier criatura de talla mayor que la tuya.' },
      { n: 'Suerte', d: 'Cuando saques un 1 en el d20 de una prueba de d20, vuelve a tirarlo y usa la segunda tirada.' },
      { n: 'Sigiloso por naturaleza', d: 'Puedes intentar Esconderte aunque solo te oculte una criatura de talla mayor que la tuya.' },
    ],
  },

  orco: {
    es: 'Orco', en: 'Orc', speed: 9, size: ['Mediano'],
    why: 'No cae con el primer golpe letal, y corre gratis varias veces por combate.',
    traits: [
      { n: 'Descarga de adrenalina', d: 'Como acción adicional puedes Correr y ganas puntos de golpe temporales iguales a tu bonificador de competencia. Usos iguales a tu bonificador de competencia, y se recuperan con un descanso corto o largo.' },
      { n: 'Visión en la oscuridad 36 m', d: 'Ves con poca luz como si fuera luz brillante, y en la oscuridad como si hubiera poca luz, en blanco y negro.' },
      { n: 'Aguante implacable', d: 'Cuando bajes a 0 puntos de golpe sin morir del todo, puedes quedarte en 1. Una vez por descanso largo.' },
    ],
  },

  tiflin: {
    es: 'Tiflin', en: 'Tiefling', speed: 9, size: ['Mediano', 'Pequeño'],
    why: 'Dos trucos gratis y resistencia a un tipo de daño, según el legado.',
    traits: [
      { n: 'Visión en la oscuridad 18 m', d: 'Ves con poca luz como si fuera luz brillante, y en la oscuridad como si hubiera poca luz, en blanco y negro.' },
      { n: 'Presencia de otro mundo', d: 'Conoces el truco Taumaturgia (Thaumaturgy). Tu característica de lanzamiento para él es Inteligencia, Sabiduría o Carisma, la que elijas al crear el personaje.' },
    ],
    grants: { cantrips: ['Thaumaturgy'] },
    lineages: {
      abisal: {
        es: 'Legado abisal', why: 'Resistencia a veneno y Rocío Venenoso.',
        cantrips: ['Poison Spray'],
        traits: [{ n: 'Legado abisal', d: 'Resistencia al daño de veneno y conoces el truco Rocío Venenoso (Poison Spray). A nivel 3 aprendes Rayo de Enfermedad y a nivel 5 Rayo Debilitador.' }],
      },
      ctonico: {
        es: 'Legado ctónico', why: 'Resistencia a necrótico y Toque Escalofriante.',
        cantrips: ['Chill Touch'],
        traits: [{ n: 'Legado ctónico', d: 'Resistencia al daño necrótico y conoces el truco Toque Escalofriante (Chill Touch). A nivel 3 aprendes Falsa Vida y a nivel 5 Rayo de Debilitamiento.' }],
      },
      infernal: {
        es: 'Legado infernal', why: 'Resistencia a fuego y Saeta de Fuego.',
        cantrips: ['Fire Bolt'],
        traits: [{ n: 'Legado infernal', d: 'Resistencia al daño de fuego y conoces el truco Saeta de Fuego (Fire Bolt). A nivel 3 aprendes Manos Ardientes y a nivel 5 Oscuridad.' }],
      },
    },
  },
});

/* ------------------------------------------------------------ BACKGROUNDS */
/* abilities: the three scores the background can improve (2024: +2/+1 or +1/+1/+1). */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const BACKGROUNDS = Object.freeze({
  acolito: {
    es: 'Acólito', en: 'Acolyte',
    why: 'Serviste en un templo. Sabes leer, escribir y a quién hay que rezarle.',
    abilities: ['INT', 'SAB', 'CAR'], skills: ['perspicacia', 'religion'],
    tool: { label: 'Útiles de calígrafo' }, feat: 'iniciado',
    equipment: {
      A: { label: 'Equipo del templo', items: ['Útiles de calígrafo', 'Libro de oraciones', 'Símbolo sagrado', '10 hojas de pergamino', 'Túnica'], gp: 8, grants: {} },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  artesano: {
    es: 'Artesano', en: 'Artisan',
    why: 'Un oficio en las manos. Sabes cuánto vale una cosa y quién la hizo mal.',
    abilities: ['FUE', 'DES', 'INT'], skills: ['investigacion', 'persuasion'],
    tool: { label: 'Unas herramientas de artesano a tu elección' }, feat: 'artesano',
    equipment: {
      A: { label: 'Equipo del taller', items: ['Unas herramientas de artesano', '2 bolsas', 'Ropa de viaje'], gp: 32, grants: {} },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  charlatan: {
    es: 'Charlatán', en: 'Charlatan',
    why: 'Vives de que la gente se crea lo que dices. De momento funciona.',
    abilities: ['DES', 'CON', 'CAR'], skills: ['engano', 'manos'],
    tool: { label: 'Kit de falsificación' }, feat: 'instruido',
    equipment: {
      A: { label: 'Equipo del timo', items: ['Kit de falsificación', 'Disfraz', 'Ropa fina'], gp: 15, grants: {} },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  criminal: {
    es: 'Criminal', en: 'Criminal',
    why: 'Cerraduras, tejados y gente a la que no conviene deber dinero.',
    abilities: ['DES', 'CON', 'INT'], skills: ['manos', 'sigilo'],
    tool: { label: 'Herramientas de ladrón' }, feat: 'alerta',
    equipment: {
      A: { label: 'Equipo del oficio', items: ['2 dagas', 'Herramientas de ladrón', 'Palanca', 'Bolsa', 'Ropa de viaje'], gp: 16,
           grants: { weapons: ['daga'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  artista: {
    es: 'Artista', en: 'Entertainer',
    why: 'Sabes sostener a una sala entera con la voz. Sirve más de lo que parece.',
    abilities: ['FUE', 'DES', 'CAR'], skills: ['acrobacias', 'interpretacion'],
    tool: { label: 'Un instrumento musical a tu elección' }, feat: 'musico',
    equipment: {
      A: { label: 'Equipo de escena', items: ['Un instrumento musical', '2 disfraces', 'Espejo', 'Perfume', 'Ropa de viaje'], gp: 11, grants: {} },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  granjero: {
    es: 'Granjero', en: 'Farmer',
    why: 'Trabajo duro, animales y saber cuándo va a cambiar el tiempo.',
    abilities: ['FUE', 'CON', 'SAB'], skills: ['animales', 'naturaleza'],
    tool: { label: 'Herramientas de carpintero' }, feat: 'robusto',
    equipment: {
      A: { label: 'Equipo del campo', items: ['Daga', 'Herramientas de carpintero', 'Botiquín', 'Olla de hierro', 'Pala', 'Ropa de viaje'], gp: 30,
           grants: { weapons: ['daga'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  guardia: {
    es: 'Guardia', en: 'Guard',
    why: 'Turnos de noche en una muralla. Ves venir los problemas.',
    abilities: ['FUE', 'INT', 'SAB'], skills: ['atletismo', 'percepcion'],
    tool: { label: 'Un juego de mesa a tu elección' }, feat: 'alerta',
    equipment: {
      A: { label: 'Equipo de guardia', items: ['Maza', 'Arco corto', '20 flechas', 'Carcaj', 'Un juego de mesa', 'Linterna con capucha', 'Grilletes', 'Ropa de viaje'], gp: 12,
           grants: { weapons: ['maza', 'arco-corto'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  guia: {
    es: 'Guía', en: 'Guide',
    why: 'Te criaste lejos de las ciudades. No te pierdes y no te oyen llegar.',
    abilities: ['DES', 'CON', 'SAB'], skills: ['sigilo', 'supervivencia'],
    tool: { label: 'Herramientas de cartógrafo' }, feat: 'iniciado',
    equipment: {
      A: { label: 'Equipo de campo', items: ['Arco corto', '20 flechas', 'Carcaj', 'Herramientas de cartógrafo', 'Petate', 'Tienda', 'Ropa de viaje'], gp: 3,
           grants: { weapons: ['arco-corto'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  ermitano: {
    es: 'Ermitaño', en: 'Hermit',
    why: 'Años a solas con una pregunta. Curas heridas y no te asusta el silencio.',
    abilities: ['CON', 'SAB', 'CAR'], skills: ['medicina', 'religion'],
    tool: { label: 'Kit de herboristería' }, feat: 'curandero',
    equipment: {
      A: { label: 'Equipo del retiro', items: ['Bastón', 'Kit de herboristería', 'Petate', 'Libro de filosofía', 'Candil', '3 frascos de aceite', 'Ropa de viaje'], gp: 16,
           grants: { weapons: ['baston'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  mercader: {
    es: 'Mercader', en: 'Merchant',
    why: 'Rutas, precios y contactos en tres puertos. El dinero te habla.',
    abilities: ['CON', 'INT', 'CAR'], skills: ['animales', 'persuasion'],
    tool: { label: 'Herramientas de navegante' }, feat: 'afortunado',
    equipment: {
      A: { label: 'Equipo de la ruta', items: ['Herramientas de navegante', 'Bolsa', 'Ropa de viaje'], gp: 22, grants: {} },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  noble: {
    es: 'Noble', en: 'Noble',
    why: 'Un apellido que abre puertas y te cierra otras. Sabes cómo se habla arriba.',
    abilities: ['FUE', 'INT', 'CAR'], skills: ['historia', 'persuasion'],
    tool: { label: 'Un juego de mesa a tu elección' }, feat: 'instruido',
    equipment: {
      A: { label: 'Equipo de la casa', items: ['Un juego de mesa', 'Ropa fina', 'Perfume'], gp: 29, grants: {} },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  erudito: {
    es: 'Erudito', en: 'Sage',
    why: 'Has leído mucho y sabes dónde buscar lo que no has leído.',
    abilities: ['CON', 'INT', 'SAB'], skills: ['arcanos', 'historia'],
    tool: { label: 'Útiles de calígrafo' }, feat: 'iniciado',
    equipment: {
      A: { label: 'Equipo de estudio', items: ['Bastón', 'Útiles de calígrafo', 'Libro de historia', '8 hojas de pergamino', 'Túnica'], gp: 8,
           grants: { weapons: ['baston'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  marinero: {
    es: 'Marinero', en: 'Sailor',
    why: 'Cubiertas, jarcias y peleas de taberna. Encaja solo en esta campaña.',
    abilities: ['FUE', 'DES', 'SAB'], skills: ['acrobacias', 'percepcion'],
    tool: { label: 'Herramientas de navegante' }, feat: 'camorrista',
    equipment: {
      A: { label: 'Equipo de a bordo', items: ['Daga', 'Herramientas de navegante', 'Cuerda de 15 m', 'Ropa de viaje'], gp: 20,
           grants: { weapons: ['daga'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  escriba: {
    es: 'Escriba', en: 'Scribe',
    why: 'Copias documentos y detectas al momento el que está falsificado.',
    abilities: ['DES', 'INT', 'SAB'], skills: ['investigacion', 'percepcion'],
    tool: { label: 'Útiles de calígrafo' }, feat: 'instruido',
    equipment: {
      A: { label: 'Equipo del escritorio', items: ['Útiles de calígrafo', 'Ropa fina', 'Candil', '3 frascos de aceite', '12 hojas de pergamino'], gp: 23, grants: {} },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  soldado: {
    es: 'Soldado', en: 'Soldier',
    why: 'Sabes pelear en formación y llevas la disciplina en el cuerpo.',
    abilities: ['FUE', 'DES', 'CON'], skills: ['atletismo', 'intimidacion'],
    tool: { label: 'Un juego de mesa a tu elección' }, feat: 'atacante',
    equipment: {
      A: { label: 'Equipo de campaña', items: ['Maza', 'Arco corto', '20 flechas', 'Carcaj', 'Un juego de mesa', 'Ropa de viaje'], gp: 14,
           grants: { weapons: ['maza', 'arco-corto'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
  trotamundos: {
    es: 'Trotamundos', en: 'Wayfarer',
    why: 'Criado en la calle. Nadie te ha dado nada y se te nota en el ojo.',
    abilities: ['DES', 'SAB', 'CAR'], skills: ['perspicacia', 'sigilo'],
    tool: { label: 'Herramientas de ladrón' }, feat: 'afortunado',
    equipment: {
      A: { label: 'Equipo de la calle', items: ['2 dagas', 'Herramientas de ladrón', 'Un juego de mesa', 'Petate', 'Bolsa', 'Ropa de viaje'], gp: 16,
           grants: { weapons: ['daga'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },
});

/* ----------------------------------------------------------------- CLASSES */
export const ALL_SKILLS = Object.freeze(SKILLS.map(s => s.key));

/* weaponProf.martial:
     'todas'          every martial weapon
     'sutil-o-ligera' martial weapons with Sutil or Ligera  (Pícaro)
     'ligera'         martial weapons with Ligera           (Monje)
     false            simple weapons only                                */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const CLASSES = Object.freeze({
  barbaro: {
    es: 'Bárbaro', en: 'Barbarian', hitDie: 12,
    why: 'El más duro de la mesa. Furia, un hacha grande y muy pocas decisiones por turno.',
    primary: ['FUE'], saves: ['FUE', 'CON'],
    armor: ['ligeras', 'medias', 'escudos'], weapons: ['simples', 'marciales'],
    weaponProf: { simple: true, martial: 'todas' },
    unarmoredDefense: { ability: 'CON', shield: true },
    skills: { n: 3, from: ['animales', 'atletismo', 'intimidacion', 'naturaleza', 'percepcion', 'supervivencia'] },
    mastery: { n: 2 },
    features: [
      { n: 'Furia', d: 'Como acción adicional entras en furia: ventaja en pruebas y salvaciones de Fuerza, +2 al daño con armas de Fuerza, y resistencia al daño contundente, perforante y cortante. No puedes lanzar ni concentrarte en conjuros. Dura 10 minutos. Dos usos por descanso largo.' },
      { n: 'Defensa sin armadura', d: 'Sin armadura, tu CA es 10 + modificador de Destreza + modificador de Constitución. Puedes usar escudo.' },
      { n: 'Maestría de armas', d: 'Usas la propiedad de maestría de dos tipos de arma con los que tengas competencia. Puedes cambiarlas al terminar un descanso largo.' },
    ],
    equipment: {
      A: { label: 'Hacha grande', items: ['Hacha grande', '4 dagas', 'Paquete de explorador'], gp: 15,
           grants: { weapons: ['hacha-grande', 'daga'] } },
      B: { label: '75 po', items: [], gp: 75, grants: {} },
    },
  },

  bardo: {
    es: 'Bardo', en: 'Bard', hitDie: 8,
    why: 'El que resuelve escenas hablando. Muchas habilidades y conjuros de apoyo.',
    primary: ['CAR'], saves: ['DES', 'CAR'],
    armor: ['ligeras'], weapons: ['simples'],
    weaponProf: { simple: true, martial: false },
    tools: 'Tres instrumentos musicales a tu elección',
    skills: { n: 3, from: ALL_SKILLS },
    casting: { ability: 'CAR', cantrips: 2, prepared: 4, slots1: 2, ritual: true },
    features: [
      { n: 'Inspiración bárdica', d: 'Como acción adicional das un d6 a un aliado a 18 m. Puede sumarlo a una prueba de d20, una tirada de ataque o una salvación, incluso después de tirar pero antes de saber el resultado. Usos iguales a tu modificador de Carisma por descanso largo.' },
      { n: 'Lanzamiento de conjuros', d: 'Lanzas conjuros de bardo con Carisma. Puedes lanzar cualquier conjuro preparado como ritual si tiene la etiqueta Ritual.' },
    ],
    equipment: {
      A: { label: 'De taberna en taberna', items: ['Armadura de cuero', 'Daga', 'Un instrumento musical', 'Paquete de artista'], gp: 19,
           grants: { armor: 'cuero', weapons: ['daga'] } },
      B: { label: '90 po', items: [], gp: 90, grants: {} },
    },
  },

  brujo: {
    es: 'Brujo', en: 'Warlock', hitDie: 8,
    why: 'Pocos espacios de conjuro pero se recuperan en descanso corto. Un pacto con algo.',
    primary: ['CAR'], saves: ['SAB', 'CAR'],
    armor: ['ligeras'], weapons: ['simples'],
    weaponProf: { simple: true, martial: false },
    skills: { n: 2, from: ['arcanos', 'engano', 'historia', 'intimidacion', 'investigacion', 'naturaleza', 'religion'] },
    casting: { ability: 'CAR', cantrips: 2, prepared: 2, slots1: 1, ritual: false,
               note: 'Magia de pacto: tus espacios se recuperan también con un descanso corto.' },
    features: [
      { n: 'Invocaciones sobrenaturales', d: 'Conoces dos invocaciones sobrenaturales a tu elección. Puedes cambiarlas al subir de nivel.' },
      { n: 'Magia de pacto', d: 'Lanzas conjuros de brujo con Carisma. Tienes pocos espacios pero se recuperan al terminar un descanso corto o largo, no solo largo.' },
    ],
    equipment: {
      A: { label: 'Pacto y bastón', items: ['Armadura de cuero', 'Bastón', '2 dagas', 'Foco arcano (orbe)', 'Libro de saber oculto', 'Paquete de erudito'], gp: 15,
           grants: { armor: 'cuero', weapons: ['baston', 'daga'] } },
      B: { label: '100 po', items: [], gp: 100, grants: {} },
    },
  },

  clerigo: {
    es: 'Clérigo', en: 'Cleric', hitDie: 8,
    why: 'Cura, aguanta armadura media y escudo, y tiene conjuro para casi todo.',
    primary: ['SAB'], saves: ['SAB', 'CAR'],
    armor: ['ligeras', 'medias', 'escudos'], weapons: ['simples'],
    weaponProf: { simple: true, martial: false },
    skills: { n: 2, from: ['historia', 'perspicacia', 'medicina', 'persuasion', 'religion'] },
    casting: { ability: 'SAB', cantrips: 3, prepared: 4, slots1: 2, ritual: true },
    features: [
      { n: 'Orden divina', d: 'Elige una: Protector (competencia con armadura pesada y armas marciales) o Taumaturgo (un truco de clérigo más, y sumas tu modificador de Sabiduría a las pruebas de Arcanos y Religión).', choice: 'divineOrder' },
      { n: 'Lanzamiento de conjuros', d: 'Lanzas conjuros de clérigo con Sabiduría, usando un símbolo sagrado como foco. Puedes lanzar como ritual los conjuros preparados con la etiqueta Ritual.' },
    ],
    equipment: {
      A: { label: 'Maza y escudo', items: ['Camisote de mallas', 'Escudo', 'Maza', 'Símbolo sagrado', 'Paquete de sacerdote'], gp: 7,
           grants: { armor: 'camisote', shield: true, weapons: ['maza'] } },
      B: { label: '110 po', items: [], gp: 110, grants: {} },
    },
  },

  druida: {
    es: 'Druida', en: 'Druid', hitDie: 8,
    why: 'La más versátil y la que más opciones pide por turno. Conjuros de naturaleza.',
    primary: ['SAB'], saves: ['INT', 'SAB'],
    armor: ['ligeras', 'escudos (no metálicos)'], weapons: ['simples'],
    weaponProf: { simple: true, martial: false },
    tools: 'Kit de herboristería',
    skills: { n: 2, from: ['arcanos', 'animales', 'perspicacia', 'medicina', 'naturaleza', 'percepcion', 'religion', 'supervivencia'] },
    casting: { ability: 'SAB', cantrips: 2, prepared: 4, slots1: 2, ritual: true },
    features: [
      { n: 'Druídico', d: 'Conoces el druídico, la lengua secreta de los druidas, y con ella puedes dejar mensajes ocultos. Conoces también el truco Sentido de la Naturaleza (Druidcraft).' },
      { n: 'Orden primigenia', d: 'Elige una: Mago (un truco más y sumas tu modificador de Sabiduría a Arcanos y Naturaleza) o Guardián (competencia con armas marciales y con armadura media).', choice: 'primalOrder' },
      { n: 'Lanzamiento de conjuros', d: 'Lanzas conjuros de druida con Sabiduría, usando un foco druídico. Puedes lanzar como ritual los conjuros preparados con la etiqueta Ritual.' },
    ],
    equipment: {
      A: { label: 'Bastón y daga', items: ['Armadura de cuero', 'Escudo', 'Daga', 'Bastón (foco druídico)', 'Kit de herboristería', 'Paquete de explorador'], gp: 9,
           grants: { armor: 'cuero', shield: true, weapons: ['daga', 'baston'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },

  explorador: {
    es: 'Explorador', en: 'Ranger', hitDie: 10,
    why: 'Pega bien a distancia y ya lanza conjuros desde el nivel 1 (novedad de 2024).',
    primary: ['DES', 'SAB'], saves: ['FUE', 'DES'],
    armor: ['ligeras', 'medias', 'escudos'], weapons: ['simples', 'marciales'],
    weaponProf: { simple: true, martial: 'todas' },
    skills: { n: 3, from: ['animales', 'atletismo', 'perspicacia', 'investigacion', 'naturaleza', 'percepcion', 'sigilo', 'supervivencia'] },
    mastery: { n: 2 },
    casting: { ability: 'SAB', cantrips: 0, prepared: 2, slots1: 2, ritual: false },
    features: [
      { n: 'Enemigo predilecto', d: 'Siempre tienes preparado Marca del Cazador (Hunter\'s Mark) y puedes lanzarlo sin gastar espacio de conjuro tantas veces como tu bonificador de competencia por descanso largo.' },
      { n: 'Lanzamiento de conjuros', d: 'Lanzas conjuros de explorador con Sabiduría. En 2024 lanzas ya desde el nivel 1.' },
      { n: 'Maestría de armas', d: 'Usas la propiedad de maestría de dos tipos de arma con los que tengas competencia. Puedes cambiarlas al terminar un descanso largo.' },
    ],
    equipment: {
      A: { label: 'Arco largo', items: ['Cuero tachonado', 'Espada corta', 'Arco largo', '20 flechas', 'Carcaj', 'Foco druídico (ramita de muérdago)', 'Paquete de explorador'], gp: 7,
           grants: { armor: 'tachonado', weapons: ['espada-corta', 'arco-largo'] } },
      B: { label: '150 po', items: [], gp: 150, grants: {} },
    },
  },

  guerrero: {
    es: 'Guerrero', en: 'Fighter', hitDie: 10,
    why: 'El que aguanta al frente. Fácil de jugar y bueno con cualquier arma.',
    primary: ['FUE', 'DES'], saves: ['FUE', 'CON'],
    armor: ['ligeras', 'medias', 'pesadas', 'escudos'], weapons: ['simples', 'marciales'],
    weaponProf: { simple: true, martial: 'todas' },
    skills: { n: 2, from: ['acrobacias', 'animales', 'atletismo', 'historia', 'perspicacia', 'intimidacion', 'persuasion', 'percepcion', 'supervivencia'] },
    mastery: { n: 3 },
    features: [
      { n: 'Estilo de combate', d: 'Ganas una dote de estilo de combate a tu elección.', choice: 'fightingStyle' },
      { n: 'Segundo aliento', d: 'Como acción adicional recuperas 1d10 + tu nivel de guerrero puntos de golpe. Dos usos, y se recuperan con un descanso corto o largo.' },
      { n: 'Maestría de armas', d: 'Usas la propiedad de maestría de tres tipos de arma con los que tengas competencia. Puedes cambiarlas al terminar un descanso largo.' },
    ],
    equipment: {
      A: { label: 'Aguantar al frente', items: ['Cota de malla', 'Escudo', 'Espada larga', '4 dagas', 'Paquete de mazmorreo'], gp: 4,
           grants: { armor: 'malla', shield: true, weapons: ['espada-larga', 'daga'] } },
      B: { label: 'Rápido y a distancia', items: ['Cuero tachonado', 'Espada corta', '3 dagas', 'Arco largo', '20 flechas', 'Carcaj', 'Paquete de mazmorreo'], gp: 11,
           grants: { armor: 'tachonado', weapons: ['espada-corta', 'daga', 'arco-largo'] } },
      C: { label: '155 po', items: [], gp: 155, grants: {} },
    },
  },

  hechicero: {
    es: 'Hechicero', en: 'Sorcerer', hitDie: 6,
    why: 'Magia en la sangre: menos conjuros que el mago pero más trucos y más flexible.',
    primary: ['CAR'], saves: ['CON', 'CAR'],
    armor: [], weapons: ['simples'],
    weaponProf: { simple: true, martial: false },
    skills: { n: 2, from: ['arcanos', 'engano', 'perspicacia', 'intimidacion', 'persuasion', 'religion'] },
    casting: { ability: 'CAR', cantrips: 4, known: 2, slots1: 2, ritual: false },
    features: [
      { n: 'Hechicería innata', d: 'Como acción adicional te envuelves en magia durante 1 minuto: la CD de tus conjuros de hechicero sube 1 y tienes ventaja en las tiradas de ataque de conjuro. Dos usos por descanso largo.' },
      { n: 'Lanzamiento de conjuros', d: 'Lanzas conjuros de hechicero con Carisma. Conoces los conjuros de forma fija, no los preparas cada día.' },
    ],
    equipment: {
      A: { label: 'Cristal y bastón', items: ['Bastón', '2 dagas', 'Foco arcano (cristal)', 'Paquete de mazmorreo'], gp: 28,
           grants: { weapons: ['baston', 'daga'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },

  mago: {
    es: 'Mago', en: 'Wizard', hitDie: 6,
    why: 'La caja de herramientas más grande del juego, y el más frágil en combate.',
    primary: ['INT'], saves: ['INT', 'SAB'],
    armor: [], weapons: ['simples'],
    weaponProf: { simple: true, martial: false },
    skills: { n: 2, from: ['arcanos', 'historia', 'perspicacia', 'investigacion', 'medicina', 'naturaleza', 'religion'] },
    casting: { ability: 'INT', cantrips: 3, prepared: 4, slots1: 2, ritual: true,
               book: 6, note: 'Tu libro de conjuros arranca con 6 conjuros de nivel 1; de ellos preparas 4 cada día.' },
    features: [
      { n: 'Recuperación arcana', d: 'Una vez al día, al terminar un descanso corto, recuperas espacios de conjuro cuya suma de niveles no pase de la mitad de tu nivel de mago redondeando hacia arriba.' },
      { n: 'Adepto ritual', d: 'Puedes lanzar como ritual cualquier conjuro de tu libro que tenga la etiqueta Ritual, sin necesidad de tenerlo preparado.' },
      { n: 'Lanzamiento de conjuros', d: 'Lanzas conjuros de mago con Inteligencia, usando tu libro de conjuros y un foco arcano.' },
    ],
    equipment: {
      A: { label: 'Libro y bastón', items: ['2 dagas', 'Bastón (foco arcano)', 'Túnica', 'Libro de conjuros', 'Paquete de erudito'], gp: 5,
           grants: { weapons: ['daga', 'baston'] } },
      B: { label: '55 po', items: [], gp: 55, grants: {} },
    },
  },

  monje: {
    es: 'Monje', en: 'Monk', hitDie: 8,
    why: 'Rápido y sin armadura: muchos golpes por turno y mucha movilidad.',
    primary: ['DES', 'SAB'], saves: ['FUE', 'DES'],
    armor: [], weapons: ['simples', 'marciales ligeras'],
    weaponProf: { simple: true, martial: 'ligera' },
    unarmoredDefense: { ability: 'SAB', shield: false },
    martialArts: '1d6',
    tools: 'Unas herramientas de artesano o un instrumento musical',
    skills: { n: 2, from: ['acrobacias', 'atletismo', 'historia', 'perspicacia', 'religion', 'sigilo'] },
    features: [
      { n: 'Artes marciales', d: 'Tu golpe sin armas hace 1d6 y puedes usar Destreza en vez de Fuerza con él y con las armas de monje. Cuando haces la acción de Atacar puedes hacer un golpe sin armas extra como acción adicional.' },
      { n: 'Defensa sin armadura', d: 'Sin armadura ni escudo, tu CA es 10 + modificador de Destreza + modificador de Sabiduría.' },
    ],
    equipment: {
      A: { label: 'Bastón y dagas', items: ['Bastón', '5 dagas', 'Unas herramientas de artesano o un instrumento musical', 'Paquete de explorador'], gp: 11,
           grants: { weapons: ['baston', 'daga'] } },
      B: { label: '50 po', items: [], gp: 50, grants: {} },
    },
  },

  paladin: {
    es: 'Paladín', en: 'Paladin', hitDie: 10,
    why: 'Aguanta como un guerrero, cura con las manos y ya lanza conjuros a nivel 1 (novedad de 2024).',
    primary: ['FUE', 'CAR'], saves: ['SAB', 'CAR'],
    armor: ['ligeras', 'medias', 'pesadas', 'escudos'], weapons: ['simples', 'marciales'],
    weaponProf: { simple: true, martial: 'todas' },
    skills: { n: 2, from: ['atletismo', 'perspicacia', 'intimidacion', 'medicina', 'persuasion', 'religion'] },
    mastery: { n: 2 },
    casting: { ability: 'CAR', cantrips: 0, prepared: 2, slots1: 2, ritual: false },
    features: [
      { n: 'Imposición de manos', d: 'Tienes una reserva de curación de 5 puntos por nivel de paladín. Como acción adicional tocas a alguien y gastas los puntos que quieras para curarle, o 5 puntos para curar el estado envenenado.' },
      { n: 'Lanzamiento de conjuros', d: 'Lanzas conjuros de paladín con Carisma, usando un símbolo sagrado. En 2024 lanzas ya desde el nivel 1.' },
      { n: 'Maestría de armas', d: 'Usas la propiedad de maestría de dos tipos de arma con los que tengas competencia. Puedes cambiarlas al terminar un descanso largo.' },
    ],
    equipment: {
      A: { label: 'Malla, espada y martillo', items: ['Cota de malla', 'Escudo', 'Espada larga', 'Martillo de guerra', 'Símbolo sagrado', 'Paquete de sacerdote'], gp: 9,
           grants: { armor: 'malla', shield: true, weapons: ['espada-larga', 'martillo-gue'] } },
      B: { label: '150 po', items: [], gp: 150, grants: {} },
    },
  },

  picaro: {
    es: 'Pícaro', en: 'Rogue', hitDie: 8,
    why: 'El que abre cerraduras y hace daño de golpe. Cuatro habilidades y experticia ya a nivel 1.',
    primary: ['DES'], saves: ['DES', 'INT'],
    armor: ['ligeras'], weapons: ['simples', 'marciales sutiles o ligeras'],
    weaponProf: { simple: true, martial: 'sutil-o-ligera' },
    tools: 'Herramientas de ladrón',
    skills: { n: 4, from: ['acrobacias', 'atletismo', 'engano', 'perspicacia', 'intimidacion', 'investigacion', 'percepcion', 'interpretacion', 'persuasion', 'manos', 'sigilo'] },
    expertise: { n: 2 },
    mastery: { n: 2 },
    features: [
      { n: 'Ataque furtivo', d: 'Una vez por turno, cuando aciertas con un arma sutil o a distancia y tienes ventaja (o hay un aliado del objetivo a 1,5 m de él y tú no tienes desventaja), haces 1d6 de daño extra.' },
      { n: 'Experticia', d: 'Dos de tus habilidades pasan a doblar el bonificador de competencia: en vez de +2 sumas +4.' },
      { n: 'Jerga de ladrones', d: 'Conoces la jerga de ladrones: mensajes ocultos en una conversación normal, además de un sistema de marcas y símbolos.' },
      { n: 'Maestría de armas', d: 'Usas la propiedad de maestría de dos tipos de arma con los que tengas competencia. Puedes cambiarlas al terminar un descanso largo.' },
    ],
    equipment: {
      A: { label: 'Espada corta y arco', items: ['Armadura de cuero', '2 dagas', 'Espada corta', 'Arco corto', '20 flechas', 'Carcaj', 'Herramientas de ladrón', 'Paquete de ladrón'], gp: 8,
           grants: { armor: 'cuero', weapons: ['daga', 'espada-corta', 'arco-corto'] } },
      B: { label: '100 po', items: [], gp: 100, grants: {} },
    },
  },
});

/* Fighting styles are a level-1 Fighter choice; kept here to avoid a lookup. */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const FIGHTING_STYLES = Object.freeze({
  arqueria:    { es: 'Arquería',                      d: '+2 a las tiradas de ataque con armas a distancia.' },
  defensa:     { es: 'Defensa',                       d: '+1 a la CA mientras lleves armadura.' },
  duelo:       { es: 'Duelo',                         d: '+2 al daño cuando atacas con un arma cuerpo a cuerpo de una mano y no llevas otra arma ni escudo… (llevar escudo sí está permitido).' },
  dosarmas:    { es: 'Lucha con dos armas',           d: 'Cuando atacas con dos armas, sumas el modificador de característica al daño del segundo ataque.' },
  dosmanos:    { es: 'Combate con armas a dos manos', d: 'Si tiras 1 o 2 en un dado de daño de un arma a dos manos o versátil usada a dos manos, vuelves a tirarlo.' },
  interceptar: { es: 'Interceptación',                d: 'Como reacción reduces el daño que sufre alguien a 1,5 m de ti en 1d10 + tu bonificador de competencia.' },
  proteccion:  { es: 'Protección',                    d: 'Como reacción, das desventaja a un ataque contra alguien a 1,5 m de ti si llevas escudo.' },
  ciego:       { es: 'Combate ciego',                 d: 'Tienes sentido ciego 3 m: percibes criaturas invisibles a esa distancia si no estás incapacitado.' },
});

/* ------------------------------------------------------------------ SPELLS */
/* Cantrips and level-1 spells only: a level-1 character can reach nothing else.
   Fields: lvl, school, classes, time (casting time), range, comp (components),
   dur (duration), conc (concentration), rit (ritual), sum (2-3 line summary).
   `sum` paraphrases the effect so a caster can play without the book open. */
export const SPELLS = Object.freeze([
  // ---------------------------------------------------------------- trucos
  { es: 'Salpicadura Ácida', en: 'Acid Splash', lvl: 0, school: 'Evocación', classes: ['hechicero', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Elige una criatura, o dos que estén a 1,5 m entre sí. Cada una hace una salvación de Destreza; si falla recibe 1d6 de daño de ácido.' },
  { es: 'Guardia de Filo', en: 'Blade Ward', lvl: 0, school: 'Abjuración', classes: ['bardo', 'brujo', 'hechicero', 'mago'],
    time: 'Acción', range: 'Personal', comp: 'V, G', dur: '1 asalto',
    sum: 'Hasta el final de tu siguiente turno, cualquier ataque de arma contra ti tiene desventaja si el atacante te puede ver.' },
  { es: 'Toque Escalofriante', en: 'Chill Touch', lvl: 0, school: 'Nigromancia', classes: ['brujo', 'hechicero', 'mago'],
    time: 'Acción', range: 'Toque', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro cuerpo a cuerpo: 1d10 de daño necrótico y el objetivo no puede recuperar puntos de golpe hasta el final de tu siguiente turno.' },
  { es: 'Luces Danzantes', en: 'Dancing Lights', lvl: 0, school: 'Ilusión', classes: ['bardo', 'hechicero', 'mago'],
    time: 'Acción', range: '36 m', comp: 'V, G, M (un poco de fósforo)', dur: '1 minuto', conc: true,
    sum: 'Creas hasta cuatro luces del tamaño de una antorcha que flotan y se mueven 18 m con tu acción adicional. Iluminan poco pero bastan para no ir a ciegas.' },
  { es: 'Truco de Druida', en: 'Druidcraft', lvl: 0, school: 'Transmutación', classes: ['druida'],
    time: 'Acción', range: '9 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Efectos menores de naturaleza: predices el tiempo de la próxima hora, haces florecer una semilla, creas un olor o un sonido, o apagas y enciendes una llama pequeña.' },
  { es: 'Descarga Sobrenatural', en: 'Eldritch Blast', lvl: 0, school: 'Evocación', classes: ['brujo'],
    time: 'Acción', range: '36 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Un rayo de energía: ataque de conjuro a distancia por 1d10 de daño de fuerza. Es el ataque básico del brujo y escala con el nivel.' },
  { es: 'Elementalismo', en: 'Elementalism', lvl: 0, school: 'Transmutación', classes: ['druida', 'hechicero', 'mago'],
    time: 'Acción', range: '9 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Un efecto elemental menor: apagas fuegos pequeños, condensas niebla, encharcas o secas un espacio, o levantas una ráfaga que empuja objetos ligeros.' },
  { es: 'Saeta de Fuego', en: 'Fire Bolt', lvl: 0, school: 'Evocación', classes: ['hechicero', 'mago'],
    time: 'Acción', range: '36 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 1d10 de daño de fuego. Los objetos inflamables sin llevar encima prenden.' },
  { es: 'Amistad', en: 'Friends', lvl: 0, school: 'Encantamiento', classes: ['bardo', 'brujo', 'mago'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (un poco de maquillaje)', dur: '1 minuto', conc: true,
    sum: 'Un humanoide que no esté en combate hace una salvación de Sabiduría; si falla, tienes ventaja en las pruebas de Carisma con él. Al acabar sabe que lo has encantado.' },
  { es: 'Guía', en: 'Guidance', lvl: 0, school: 'Divinación', classes: ['clerigo', 'druida'],
    time: 'Acción', range: 'Toque', comp: 'V, G', dur: '1 minuto', conc: true,
    sum: 'Tocas a alguien dispuesto: una vez, antes de que acabe el conjuro, puede sumar 1d4 a una prueba de característica que haga.' },
  { es: 'Luz', en: 'Light', lvl: 0, school: 'Evocación', classes: ['bardo', 'clerigo', 'hechicero', 'mago'],
    time: 'Acción', range: 'Toque', comp: 'V, M (una luciérnaga)', dur: '1 hora',
    sum: 'Un objeto que no sea mayor que Grande emite luz brillante en 6 m y poca luz 6 m más. Si el objetivo no quiere, hace una salvación de Destreza.' },
  { es: 'Mano de Mago', en: 'Mage Hand', lvl: 0, school: 'Conjuración', classes: ['bardo', 'brujo', 'hechicero', 'mago'],
    time: 'Acción', range: '9 m', comp: 'V, G', dur: '1 minuto',
    sum: 'Una mano espectral que manipula objetos, abre puertas sin cerrar y lleva hasta 4,5 kg. No puede atacar ni activar objetos mágicos.' },
  { es: 'Reparar', en: 'Mending', lvl: 0, school: 'Transmutación', classes: ['bardo', 'clerigo', 'druida', 'hechicero', 'mago'],
    time: '1 minuto', range: 'Toque', comp: 'V, G, M (dos imanes)', dur: 'Instantáneo',
    sum: 'Arregla una rotura o un desgarro de un objeto, siempre que no sea mayor de 30 cm en cualquier dimensión. No devuelve propiedades mágicas.' },
  { es: 'Mensaje', en: 'Message', lvl: 0, school: 'Transmutación', classes: ['bardo', 'druida', 'hechicero', 'mago'],
    time: 'Acción', range: '36 m', comp: 'V, G, M (un trozo de alambre de cobre)', dur: '1 asalto',
    sum: 'Susurras un mensaje a una criatura que puedas ver y solo ella lo oye. Puede contestarte en un susurro que solo oyes tú.' },
  { es: 'Ilusión Menor', en: 'Minor Illusion', lvl: 0, school: 'Ilusión', classes: ['bardo', 'brujo', 'hechicero', 'mago'],
    time: 'Acción', range: '9 m', comp: 'G, M (un poco de lana)', dur: '1 minuto',
    sum: 'Creas un sonido o la imagen de un objeto que quepa en un cubo de 1,5 m. Quien lo estudie con Investigación CD igual a la tuya se da cuenta de que es falso.' },
  { es: 'Rocío Venenoso', en: 'Poison Spray', lvl: 0, school: 'Nigromancia', classes: ['brujo', 'druida', 'hechicero', 'mago'],
    time: 'Acción', range: '9 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Una criatura hace una salvación de Constitución; si falla recibe 1d12 de daño de veneno.' },
  { es: 'Prestidigitación', en: 'Prestidigitation', lvl: 0, school: 'Transmutación', classes: ['bardo', 'brujo', 'hechicero', 'mago'],
    time: 'Acción', range: '3 m', comp: 'V, G', dur: 'Hasta 1 hora',
    sum: 'Trucos menores: una llama sin calor, un olor, limpiar o manchar un objeto, enfriar o calentar comida, o una marca que dura 1 hora.' },
  { es: 'Producir Llama', en: 'Produce Flame', lvl: 0, school: 'Conjuración', classes: ['druida'],
    time: 'Acción', range: 'Personal', comp: 'V, G', dur: '10 minutos',
    sum: 'Una llama en tu mano que ilumina 3 m sin quemarte. Como acción puedes lanzarla: ataque de conjuro a distancia 9 m por 1d8 de daño de fuego.' },
  { es: 'Rayo de Escarcha', en: 'Ray of Frost', lvl: 0, school: 'Evocación', classes: ['hechicero', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 1d8 de daño de frío, y la velocidad del objetivo baja 3 m hasta el inicio de tu siguiente turno.' },
  { es: 'Resistencia', en: 'Resistance', lvl: 0, school: 'Abjuración', classes: ['clerigo', 'druida'],
    time: 'Acción', range: 'Toque', comp: 'V, G', dur: '1 minuto', conc: true,
    sum: 'Tocas a alguien dispuesto: una vez, antes de que acabe el conjuro, puede sumar 1d4 a una salvación.' },
  { es: 'Llama Sagrada', en: 'Sacred Flame', lvl: 0, school: 'Evocación', classes: ['clerigo'],
    time: 'Acción', range: '18 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Una criatura que puedas ver hace una salvación de Destreza; si falla recibe 1d8 de daño radiante. Cubrirse no le sirve de nada.' },
  { es: 'Garrote Feérico', en: 'Shillelagh', lvl: 0, school: 'Transmutación', classes: ['druida'],
    time: 'Acción adicional', range: 'Toque', comp: 'V, G, M (muérdago)', dur: '1 minuto',
    sum: 'Un bastón o garrote que lleves pasa a hacer 1d8 de daño de fuerza y usa tu característica de lanzamiento en vez de Fuerza para atacar y dañar.' },
  { es: 'Contacto Electrizante', en: 'Shocking Grasp', lvl: 0, school: 'Evocación', classes: ['hechicero', 'mago'],
    time: 'Acción', range: 'Toque', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro cuerpo a cuerpo con ventaja si el objetivo lleva metal: 1d8 de daño de relámpago y no puede hacer reacciones hasta su siguiente turno.' },
  { es: 'Ráfaga de Hechicería', en: 'Sorcerous Burst', lvl: 0, school: 'Evocación', classes: ['hechicero'],
    time: 'Acción', range: '36 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 1d8 del tipo de daño que elijas entre ácido, frío, fuego, relámpago, veneno, psíquico o trueno. Si sacas un 8, tira otro d8 (hasta tu modificador de lanzamiento de dados).' },
  { es: 'Perdonar a los Moribundos', en: 'Spare the Dying', lvl: 0, school: 'Nigromancia', classes: ['clerigo', 'druida'],
    time: 'Acción adicional', range: '4,5 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Estabilizas a una criatura a 0 puntos de golpe: deja de tirar salvaciones de muerte. No la cura, la deja de morirse.' },
  { es: 'Chispa Estelar', en: 'Starry Wisp', lvl: 0, school: 'Evocación', classes: ['druida'],
    time: 'Acción', range: '18 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 1d8 de daño radiante; además el objetivo emite luz tenue en 3 m hasta el final de tu siguiente turno y no puede beneficiarse de estar invisible.' },
  { es: 'Taumaturgia', en: 'Thaumaturgy', lvl: 0, school: 'Transmutación', classes: ['clerigo'],
    time: 'Acción', range: '9 m', comp: 'V', dur: 'Hasta 1 minuto',
    sum: 'Señales sobrenaturales: tu voz retumba, las llamas cambian de color o parpadean, tiembla el suelo, o una puerta o ventana se abre de golpe.' },
  { es: 'Látigo Espinoso', en: 'Thorn Whip', lvl: 0, school: 'Transmutación', classes: ['druida'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (el tallo de una planta con espinas)', dur: 'Instantáneo',
    sum: 'Ataque de conjuro cuerpo a cuerpo con alcance 9 m: 1d6 de daño perforante y arrastras al objetivo (Grande o menor) 3 m hacia ti.' },
  { es: 'Trueno Súbito', en: 'Thunderclap', lvl: 0, school: 'Evocación', classes: ['bardo', 'druida', 'hechicero', 'mago'],
    time: 'Acción', range: 'Personal (1,5 m)', comp: 'G', dur: 'Instantáneo',
    sum: 'Un estallido audible a 30 m. Cada criatura a 1,5 m de ti (salvo tú) hace una salvación de Constitución; si falla recibe 1d6 de daño de trueno.' },
  { es: 'Tañido de los Muertos', en: 'Toll the Dead', lvl: 0, school: 'Nigromancia', classes: ['clerigo', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Salvación de Sabiduría: si falla, 1d8 de daño necrótico, o 1d12 si al objetivo ya le faltaban puntos de golpe.' },
  { es: 'Golpe Certero', en: 'True Strike', lvl: 0, school: 'Divinación', classes: ['bardo', 'brujo', 'hechicero', 'mago'],
    time: 'Acción', range: 'Personal', comp: 'V, M (un arma con la que tengas competencia)', dur: 'Instantáneo',
    sum: 'Atacas con un arma usando tu característica de lanzamiento en vez de Fuerza o Destreza. Al acertar puedes cambiar el tipo de daño por radiante y a nivel 5 sube el daño.' },
  { es: 'Burla Cruel', en: 'Vicious Mockery', lvl: 0, school: 'Encantamiento', classes: ['bardo'],
    time: 'Acción', range: '18 m', comp: 'V', dur: 'Instantáneo',
    sum: 'Un insulto con magia. Salvación de Sabiduría: si falla, 1d6 de daño psíquico y desventaja en su siguiente tirada de ataque. Tiene que poder oírte.' },
  { es: 'Palabra de Resplandor', en: 'Word of Radiance', lvl: 0, school: 'Evocación', classes: ['clerigo'],
    time: 'Acción', range: 'Personal (1,5 m)', comp: 'V, M (un símbolo sagrado)', dur: 'Instantáneo',
    sum: 'Cada criatura que elijas a 1,5 m de ti hace una salvación de Constitución; si falla recibe 1d6 de daño radiante.' },

  // ------------------------------------------------------------ nivel 1
  { es: 'Alarma', en: 'Alarm', lvl: 1, school: 'Abjuración', classes: ['explorador', 'mago'],
    time: '1 minuto', range: '9 m', comp: 'V, G, M (una campanilla y plata)', dur: '8 horas', rit: true,
    sum: 'Marcas una zona de hasta 6 m de lado. Cuando entra alguien que no hayas designado, oyes una campanilla mental (o audible) aunque estés durmiendo.' },
  { es: 'Amistad Animal', en: 'Animal Friendship', lvl: 1, school: 'Encantamiento', classes: ['bardo', 'druida', 'explorador'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (un bocado de comida)', dur: '24 horas',
    sum: 'Una bestia con Inteligencia 3 o menos hace una salvación de Sabiduría; si falla, te considera amistosa. Si le haces daño, se rompe.' },
  { es: 'Armadura de Agathys', en: 'Armor of Agathys', lvl: 1, school: 'Abjuración', classes: ['brujo'],
    time: 'Acción adicional', range: 'Personal', comp: 'V, G', dur: '1 hora',
    sum: 'Ganas 5 puntos de golpe temporales. Mientras te duren, quien te golpee cuerpo a cuerpo recibe 5 de daño de frío.' },
  { es: 'Brazos de Hadar', en: 'Arms of Hadar', lvl: 1, school: 'Conjuración', classes: ['brujo'],
    time: 'Acción', range: 'Personal (3 m)', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Zarcillos oscuros brotan de ti. Cada criatura a 3 m hace una salvación de Fuerza: 2d6 de daño necrótico si falla (la mitad si acierta) y si falla no puede hacer reacciones.' },
  { es: 'Perdición', en: 'Bane', lvl: 1, school: 'Encantamiento', classes: ['bardo', 'brujo', 'clerigo'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (una gota de sangre)', dur: '1 minuto', conc: true,
    sum: 'Hasta tres criaturas hacen una salvación de Carisma; las que fallan restan 1d4 a sus tiradas de ataque y salvaciones mientras dure.' },
  { es: 'Bendición', en: 'Bless', lvl: 1, school: 'Encantamiento', classes: ['clerigo', 'paladin'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (agua bendita)', dur: '1 minuto', conc: true,
    sum: 'Hasta tres aliados suman 1d4 a sus tiradas de ataque y salvaciones mientras dure. Es uno de los conjuros de apoyo más fuertes a nivel bajo.' },
  { es: 'Manos Ardientes', en: 'Burning Hands', lvl: 1, school: 'Evocación', classes: ['hechicero', 'mago'],
    time: 'Acción', range: 'Personal (cono de 4,5 m)', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Un cono de fuego de 4,5 m. Salvación de Destreza: 3d6 de daño de fuego si falla, la mitad si acierta. Prende lo inflamable que no lleve nadie encima.' },
  { es: 'Hechizar Persona', en: 'Charm Person', lvl: 1, school: 'Encantamiento', classes: ['bardo', 'brujo', 'druida', 'hechicero', 'mago'],
    time: 'Acción', range: '9 m', comp: 'V, G', dur: '1 hora',
    sum: 'Un humanoide hace una salvación de Sabiduría con ventaja si estáis en combate; si falla te considera amistoso hasta que acabe o le hagas daño. Después sabe que lo has hechizado.' },
  { es: 'Orbe Cromático', en: 'Chromatic Orb', lvl: 1, school: 'Evocación', classes: ['hechicero', 'mago'],
    time: 'Acción', range: '27 m', comp: 'V, G, M (un diamante de 50 po)', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 3d8 del tipo que elijas entre ácido, frío, fuego, relámpago, veneno o trueno. Al acertar puede rebotar a otro objetivo.' },
  { es: 'Manchas de Color', en: 'Color Spray', lvl: 1, school: 'Ilusión', classes: ['bardo', 'hechicero', 'mago'],
    time: 'Acción', range: 'Personal (cono de 4,5 m)', comp: 'V, G, M (polvo de colores)', dur: '1 asalto',
    sum: 'Salvación de Constitución para cada criatura del cono; la que falla queda cegada hasta el final de tu siguiente turno.' },
  { es: 'Orden', en: 'Command', lvl: 1, school: 'Encantamiento', classes: ['bardo', 'clerigo', 'paladin'],
    time: 'Acción', range: '18 m', comp: 'V', dur: '1 asalto',
    sum: 'Das una orden de una palabra. Salvación de Sabiduría: si falla la obedece en su siguiente turno. Las clásicas: acércate, suelta, huye, tírate, párate.' },
  { es: 'Duelo Obligado', en: 'Compelled Duel', lvl: 1, school: 'Encantamiento', classes: ['paladin'],
    time: 'Acción adicional', range: '9 m', comp: 'V', dur: '1 minuto', conc: true,
    sum: 'Salvación de Sabiduría: si falla, el objetivo tiene desventaja al atacar a cualquiera que no seas tú y no puede alejarse de ti voluntariamente.' },
  { es: 'Comprender Idiomas', en: 'Comprehend Languages', lvl: 1, school: 'Divinación', classes: ['bardo', 'brujo', 'hechicero', 'mago'],
    time: 'Acción', range: 'Personal', comp: 'V, G, M (un pellizco de hollín y sal)', dur: '1 hora', rit: true,
    sum: 'Entiendes cualquier idioma que oigas y puedes leer cualquier texto escrito si lo tocas. No descifra códigos ni símbolos secretos.' },
  { es: 'Crear o Destruir Agua', en: 'Create or Destroy Water', lvl: 1, school: 'Transmutación', classes: ['clerigo', 'druida'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (una gota de agua o un puñado de arena)', dur: 'Instantáneo',
    sum: 'Creas hasta 40 litros de agua limpia en un recipiente, o haces llover en un cubo de 9 m; o destruyes la misma cantidad de agua o niebla.' },
  { es: 'Curar Heridas', en: 'Cure Wounds', lvl: 1, school: 'Abjuración', classes: ['bardo', 'clerigo', 'druida', 'explorador', 'paladin'],
    time: 'Acción', range: 'Toque', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Tocas a una criatura y le curas 2d8 + tu modificador de lanzamiento. No funciona en autómatas ni muertos vivientes.' },
  { es: 'Detectar el Bien y el Mal', en: 'Detect Evil and Good', lvl: 1, school: 'Divinación', classes: ['clerigo', 'paladin'],
    time: 'Acción', range: 'Personal', comp: 'V, G', dur: '10 minutos', conc: true,
    sum: 'Percibes celestiales, elementales, feéricos, demonios, diablos y muertos vivientes a 9 m, y si hay algo consagrado o profanado. No sabes qué son exactamente.' },
  { es: 'Detectar Magia', en: 'Detect Magic', lvl: 1, school: 'Divinación', classes: ['bardo', 'clerigo', 'druida', 'explorador', 'hechicero', 'mago', 'paladin'],
    time: 'Acción', range: 'Personal', comp: 'V, G', dur: '10 minutos', conc: true, rit: true,
    sum: 'Percibes la presencia de magia a 9 m. Con una acción puedes ver un aura alrededor de lo mágico y saber a qué escuela pertenece.' },
  { es: 'Detectar Venenos y Enfermedades', en: 'Detect Poison and Disease', lvl: 1, school: 'Divinación', classes: ['clerigo', 'druida', 'paladin'],
    time: 'Acción', range: 'Personal', comp: 'V, G, M (una hoja de tejo)', dur: '10 minutos', conc: true, rit: true,
    sum: 'Percibes venenos, criaturas venenosas y enfermedades a 9 m, y de qué tipo son.' },
  { es: 'Disfrazarse', en: 'Disguise Self', lvl: 1, school: 'Ilusión', classes: ['bardo', 'hechicero', 'mago'],
    time: 'Acción', range: 'Personal', comp: 'V, G', dur: '1 hora',
    sum: 'Cambias tu aspecto: cara, voz, ropa. Tu altura no puede variar más de 30 cm. Al tocarte se nota, y quien investigue con CD igual a la tuya lo descubre.' },
  { es: 'Susurros Disonantes', en: 'Dissonant Whispers', lvl: 1, school: 'Encantamiento', classes: ['bardo'],
    time: 'Acción', range: '18 m', comp: 'V', dur: 'Instantáneo',
    sum: 'Salvación de Sabiduría: si falla, 3d6 de daño psíquico y tiene que usar su reacción para alejarse de ti todo lo que pueda. La mitad de daño si acierta.' },
  { es: 'Favor Divino', en: 'Divine Favor', lvl: 1, school: 'Transmutación', classes: ['paladin'],
    time: 'Acción adicional', range: 'Personal', comp: 'V', dur: '1 minuto',
    sum: 'Tus ataques con arma hacen 1d4 de daño radiante extra mientras dure. No requiere concentración.' },
  { es: 'Golpe Enredador', en: 'Ensnaring Strike', lvl: 1, school: 'Conjuración', classes: ['explorador'],
    time: 'Acción adicional', range: 'Personal', comp: 'V', dur: '1 minuto', conc: true,
    sum: 'La próxima vez que aciertes con un arma, brotan espinas: salvación de Fuerza o el objetivo queda apresado y recibe 1d6 de daño perforante al inicio de cada turno.' },
  { es: 'Enmarañar', en: 'Entangle', lvl: 1, school: 'Conjuración', classes: ['druida', 'explorador'],
    time: 'Acción', range: '27 m', comp: 'V, G', dur: '1 minuto', conc: true,
    sum: 'Plantas brotan en un cuadrado de 6 m: terreno difícil, y quien esté dentro hace una salvación de Fuerza o queda apresado. Puede zafarse con una prueba de Fuerza.' },
  { es: 'Retirada Rápida', en: 'Expeditious Retreat', lvl: 1, school: 'Transmutación', classes: ['brujo', 'hechicero', 'mago'],
    time: 'Acción adicional', range: 'Personal', comp: 'V', dur: '10 minutos', conc: true,
    sum: 'Puedes Correr como acción adicional en este turno y en cada turno mientras dure el conjuro.' },
  { es: 'Fuego Feérico', en: 'Faerie Fire', lvl: 1, school: 'Evocación', classes: ['bardo', 'druida'],
    time: 'Acción', range: '18 m', comp: 'V', dur: '1 minuto', conc: true,
    sum: 'Todo en un cubo de 6 m queda perfilado de luz: salvación de Destreza o los ataques contra esa criatura tienen ventaja y no puede beneficiarse de estar invisible.' },
  { es: 'Falsa Vida', en: 'False Life', lvl: 1, school: 'Nigromancia', classes: ['hechicero', 'mago'],
    time: 'Acción adicional', range: 'Personal', comp: 'V, G, M (un poco de alcohol)', dur: 'Instantáneo',
    sum: 'Ganas 2d4 + 4 puntos de golpe temporales.' },
  { es: 'Caída de Pluma', en: 'Feather Fall', lvl: 1, school: 'Transmutación', classes: ['bardo', 'hechicero', 'mago'],
    time: 'Reacción, cuando tú o alguien a 18 m se cae', range: '18 m', comp: 'V, M (una pluma pequeña)', dur: '1 minuto',
    sum: 'Hasta cinco criaturas que caen bajan a 18 m por asalto y no sufren daño por caída. Es una reacción: se lanza en el momento.' },
  { es: 'Encontrar Familiar', en: 'Find Familiar', lvl: 1, school: 'Conjuración', classes: ['mago'],
    time: '1 hora', range: '3 m', comp: 'V, G, M (carbón, incienso y hierbas, 10 po)', dur: 'Instantáneo', rit: true,
    sum: 'Invocas un espíritu con forma de animal pequeño. Ves y oyes a través de él, y puede entregar tus conjuros de toque. Si muere, puedes reinvocarlo.' },
  { es: 'Nube de Niebla', en: 'Fog Cloud', lvl: 1, school: 'Conjuración', classes: ['druida', 'explorador', 'hechicero', 'mago'],
    time: 'Acción', range: '36 m', comp: 'V, G', dur: '1 hora', conc: true,
    sum: 'Una esfera de niebla de 6 m de radio: la zona queda muy oscurecida, así que dentro nadie ve nada. Se dispersa con viento fuerte.' },
  { es: 'Baya Nutritiva', en: 'Goodberry', lvl: 1, school: 'Conjuración', classes: ['druida', 'explorador'],
    time: 'Acción', range: 'Toque', comp: 'V, G, M (una ramita de muérdago)', dur: '24 horas',
    sum: 'Creas 10 bayas. Comer una es una acción adicional, cura 1 punto de golpe y alimenta como una comida entera. En una campaña de escasez, esto pesa mucho.' },
  { es: 'Grasa', en: 'Grease', lvl: 1, school: 'Conjuración', classes: ['hechicero', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G, M (un poco de sebo)', dur: '1 minuto',
    sum: 'Un cuadrado de 3 m se vuelve resbaladizo: terreno difícil, y quien esté o entre hace una salvación de Destreza o cae derribado.' },
  { es: 'Lluvia de Espinas', en: 'Hail of Thorns', lvl: 1, school: 'Conjuración', classes: ['explorador'],
    time: 'Acción adicional', range: 'Personal', comp: 'V', dur: '1 minuto', conc: true,
    sum: 'La próxima vez que aciertes con un arma a distancia, estallan espinas: cada criatura a 1,5 m del objetivo hace una salvación de Destreza por 1d10 de daño perforante.' },
  { es: 'Palabra Curativa', en: 'Healing Word', lvl: 1, school: 'Abjuración', classes: ['bardo', 'clerigo', 'druida'],
    time: 'Acción adicional', range: '18 m', comp: 'V', dur: 'Instantáneo',
    sum: 'Curas 2d4 + tu modificador de lanzamiento a distancia y como acción adicional. Es la forma de levantar a alguien caído sin acercarte.' },
  { es: 'Reprimenda Infernal', en: 'Hellish Rebuke', lvl: 1, school: 'Evocación', classes: ['brujo'],
    time: 'Reacción, cuando te hacen daño', range: '18 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Quien te acaba de dañar se envuelve en llamas: salvación de Destreza por 2d10 de daño de fuego, la mitad si acierta.' },
  { es: 'Heroísmo', en: 'Heroism', lvl: 1, school: 'Encantamiento', classes: ['bardo', 'paladin'],
    time: 'Acción', range: 'Toque', comp: 'V, G', dur: '1 minuto', conc: true,
    sum: 'Un aliado queda inmune al estado asustado y gana puntos de golpe temporales iguales a tu modificador de lanzamiento al inicio de cada uno de sus turnos.' },
  { es: 'Maleficio', en: 'Hex', lvl: 1, school: 'Encantamiento', classes: ['brujo'],
    time: 'Acción adicional', range: '27 m', comp: 'V, G, M (el ojo petrificado de un tritón)', dur: '1 hora', conc: true,
    sum: 'Tus ataques contra el objetivo hacen 1d6 de daño necrótico extra, y tiene desventaja en las pruebas de una característica que elijas. Si muere, puedes pasar el maleficio a otro.' },
  { es: 'Marca del Cazador', en: "Hunter's Mark", lvl: 1, school: 'Divinación', classes: ['explorador'],
    time: 'Acción adicional', range: '27 m', comp: 'V', dur: '1 hora', conc: true,
    sum: 'Tus ataques con arma contra el objetivo hacen 1d6 de daño extra, y tienes ventaja en Percepción y Supervivencia para localizarlo. El explorador lo tiene siempre preparado.' },
  { es: 'Cuchilla de Hielo', en: 'Ice Knife', lvl: 1, school: 'Conjuración', classes: ['druida', 'hechicero', 'mago'],
    time: 'Acción', range: '18 m', comp: 'G, M (una gota de agua)', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 1d10 de daño perforante; acierte o no, estalla y cada criatura a 1,5 m hace una salvación de Destreza por 2d6 de daño de frío.' },
  { es: 'Identificar', en: 'Identify', lvl: 1, school: 'Divinación', classes: ['bardo', 'mago'],
    time: '1 minuto', range: 'Toque', comp: 'V, G, M (una perla de 100 po y una pluma de búho)', dur: 'Instantáneo', rit: true,
    sum: 'Averiguas las propiedades de un objeto mágico, si necesita vinculación y qué conjuros lo afectan. Como ritual no gasta espacio, solo 10 minutos.' },
  { es: 'Escritura Ilusoria', en: 'Illusory Script', lvl: 1, school: 'Ilusión', classes: ['bardo', 'brujo', 'mago'],
    time: '1 minuto', range: 'Toque', comp: 'G, M (tinta de plomo de 10 po)', dur: '10 días', rit: true,
    sum: 'Escribes en un pergamino: quien no hayas designado ve otro texto o garabatos sin sentido. Los designados leen el mensaje real.' },
  { es: 'Infligir Heridas', en: 'Inflict Wounds', lvl: 1, school: 'Nigromancia', classes: ['clerigo'],
    time: 'Acción', range: '9 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 2d10 de daño necrótico.' },
  { es: 'Salto', en: 'Jump', lvl: 1, school: 'Transmutación', classes: ['druida', 'explorador', 'hechicero', 'mago'],
    time: 'Acción adicional', range: 'Toque', comp: 'V, G, M (la pata trasera de un saltamontes)', dur: '1 minuto',
    sum: 'La distancia de salto del objetivo se multiplica por tres mientras dure.' },
  { es: 'Armadura de Mago', en: 'Mage Armor', lvl: 1, school: 'Abjuración', classes: ['hechicero', 'mago'],
    time: 'Acción', range: 'Toque', comp: 'V, G, M (un trozo de cuero curtido)', dur: '8 horas',
    sum: 'Una criatura sin armadura pasa a tener CA 13 + su modificador de Destreza. Para un mago o un hechicero es la diferencia entre 12 y 15 de CA.' },
  { es: 'Misil Mágico', en: 'Magic Missile', lvl: 1, school: 'Evocación', classes: ['hechicero', 'mago'],
    time: 'Acción', range: '36 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Tres dardos que no fallan nunca: 1d4 + 1 de daño de fuerza cada uno, repartidos entre los objetivos que quieras. Sin tirada de ataque.' },
  { es: 'Protección contra el Bien y el Mal', en: 'Protection from Evil and Good', lvl: 1, school: 'Abjuración', classes: ['brujo', 'clerigo', 'druida', 'mago', 'paladin'],
    time: 'Acción', range: 'Toque', comp: 'V, G, M (agua bendita o polvo de plata)', dur: '10 minutos', conc: true,
    sum: 'Contra celestiales, elementales, feéricos, demonios, diablos y muertos vivientes: sus ataques contra el objetivo tienen desventaja y no pueden hechizarlo, asustarlo ni poseerlo.' },
  { es: 'Purificar Comida y Bebida', en: 'Purify Food and Drink', lvl: 1, school: 'Transmutación', classes: ['clerigo', 'druida', 'paladin'],
    time: 'Acción', range: '3 m', comp: 'V, G', dur: 'Instantáneo', rit: true,
    sum: 'Toda la comida y la bebida en una esfera de 1,5 m queda libre de venenos y enfermedades. En una campaña donde el agua escasea, esto vale más que un conjuro de daño.' },
  { es: 'Rayo de Enfermedad', en: 'Ray of Sickness', lvl: 1, school: 'Nigromancia', classes: ['hechicero', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Ataque de conjuro a distancia por 2d8 de daño de veneno; al acertar, salvación de Constitución o el objetivo queda envenenado hasta el final de tu siguiente turno.' },
  { es: 'Santuario', en: 'Sanctuary', lvl: 1, school: 'Abjuración', classes: ['clerigo'],
    time: 'Acción adicional', range: '9 m', comp: 'V, G, M (un espejito de plata)', dur: '1 minuto',
    sum: 'Quien quiera atacar al protegido hace una salvación de Sabiduría; si falla tiene que elegir otro objetivo o perder la acción. Se rompe si el protegido ataca.' },
  { es: 'Golpe Abrasador', en: 'Searing Smite', lvl: 1, school: 'Evocación', classes: ['paladin'],
    time: 'Acción adicional', range: 'Personal', comp: 'V', dur: '1 minuto', conc: true,
    sum: 'Tu próximo golpe con arma hace 1d6 de daño de fuego extra y el objetivo arde: 1d6 al inicio de cada uno de sus turnos hasta que pase una salvación de Constitución.' },
  { es: 'Escudo', en: 'Shield', lvl: 1, school: 'Abjuración', classes: ['hechicero', 'mago'],
    time: 'Reacción, cuando te golpean o te alcanza Misil Mágico', range: 'Personal', comp: 'V, G', dur: '1 asalto',
    sum: '+5 a la CA hasta el inicio de tu siguiente turno, aplicable contra el ataque que lo provocó, y no recibes daño de Misil Mágico.' },
  { es: 'Escudo de Fe', en: 'Shield of Faith', lvl: 1, school: 'Abjuración', classes: ['clerigo', 'paladin'],
    time: 'Acción adicional', range: '18 m', comp: 'V, G, M (un pergamino con una oración)', dur: '10 minutos', conc: true,
    sum: 'Un aliado gana +2 a la CA mientras dure.' },
  { es: 'Imagen Silenciosa', en: 'Silent Image', lvl: 1, school: 'Ilusión', classes: ['bardo', 'hechicero', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G, M (un poco de lana)', dur: '10 minutos', conc: true,
    sum: 'Una imagen visual de hasta 4,5 m de lado que puedes mover con tu acción. No hace ruido ni olor: quien la investigue con CD igual a la tuya la atraviesa con la vista.' },
  { es: 'Dormir', en: 'Sleep', lvl: 1, school: 'Encantamiento', classes: ['bardo', 'hechicero', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G, M (arena fina y pétalos de rosa)', dur: '1 minuto', conc: true,
    sum: 'Cada criatura en una esfera de 1,5 m hace una salvación de Sabiduría; la que falla queda incapacitada y cae dormida. Despierta si sufre daño o alguien la sacude.' },
  { es: 'Hablar con los Animales', en: 'Speak with Animals', lvl: 1, school: 'Divinación', classes: ['bardo', 'druida', 'explorador'],
    time: 'Acción', range: 'Personal', comp: 'V, G', dur: '10 minutos', rit: true,
    sum: 'Puedes hablar con las bestias. Entienden poco y saben menos, pero un caballo o una gaviota han visto cosas que tú no.' },
  { es: 'Risa Horrible de Tasha', en: "Tasha's Hideous Laughter", lvl: 1, school: 'Encantamiento', classes: ['bardo', 'mago'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (tartas diminutas y una pluma)', dur: '1 minuto', conc: true,
    sum: 'Salvación de Sabiduría: si falla, el objetivo cae al suelo incapacitado de risa. Repite la salvación cada turno y cuando sufre daño.' },
  { es: 'Disco Flotante de Tenser', en: "Tenser's Floating Disk", lvl: 1, school: 'Conjuración', classes: ['mago'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (una gota de mercurio)', dur: '1 hora', rit: true,
    sum: 'Un disco de fuerza de 1 m que flota y carga hasta 250 kg. Te sigue a 6 m. Sirve para sacar el botín, o a un compañero inconsciente.' },
  { es: 'Golpe Tronante', en: 'Thunderous Smite', lvl: 1, school: 'Evocación', classes: ['paladin'],
    time: 'Acción adicional', range: 'Personal', comp: 'V', dur: '1 minuto', conc: true,
    sum: 'Tu próximo golpe con arma hace 2d6 de daño de trueno extra y el objetivo hace una salvación de Fuerza o es empujado 3 m y cae derribado.' },
  { es: 'Onda Trueno', en: 'Thunderwave', lvl: 1, school: 'Evocación', classes: ['bardo', 'druida', 'hechicero', 'mago'],
    time: 'Acción', range: 'Personal (cubo de 4,5 m)', comp: 'V, G', dur: 'Instantáneo',
    sum: 'Salvación de Constitución para todo lo que esté en el cubo: 2d8 de daño de trueno y empujón de 3 m si falla, la mitad de daño y sin empujón si acierta.' },
  { es: 'Sirviente Invisible', en: 'Unseen Servant', lvl: 1, school: 'Conjuración', classes: ['bardo', 'brujo', 'mago'],
    time: 'Acción', range: '18 m', comp: 'V, G, M (un trozo de cuerda y un poco de madera)', dur: '1 hora', rit: true,
    sum: 'Una fuerza invisible que obedece órdenes sencillas: llevar cosas, limpiar, abrir puertas, servir la mesa. Fuerza 2, no ataca.' },
  { es: 'Rayo de Bruja', en: 'Witch Bolt', lvl: 1, school: 'Evocación', classes: ['brujo', 'hechicero', 'mago'],
    time: 'Acción', range: '9 m', comp: 'V, G, M (una ramita de un árbol partido por un rayo)', dur: '1 minuto', conc: true,
    sum: 'Ataque de conjuro a distancia por 2d12 de daño de relámpago; el arco se mantiene y en cada turno siguiente puedes gastar tu acción para hacer 1d12 más.' },
  { es: 'Golpe Iracundo', en: 'Wrathful Smite', lvl: 1, school: 'Nigromancia', classes: ['paladin'],
    time: 'Acción adicional', range: 'Personal', comp: 'V', dur: '1 minuto', conc: true,
    sum: 'Tu próximo golpe con arma hace 1d6 de daño psíquico extra y el objetivo hace una salvación de Sabiduría o queda asustado de ti.' },
  { es: 'Rayo Guía', en: 'Guiding Bolt', lvl: 1, school: 'Evocación', classes: ['clerigo'],
    time: 'Acción', range: '36 m', comp: 'V, G', dur: '1 asalto',
    sum: 'Ataque de conjuro a distancia por 4d6 de daño radiante; al acertar, el siguiente ataque contra ese objetivo antes del final de tu próximo turno tiene ventaja.' },
  { es: 'Zancada Prolongada', en: 'Longstrider', lvl: 1, school: 'Transmutación', classes: ['bardo', 'druida', 'explorador', 'mago'],
    time: 'Acción', range: 'Toque', comp: 'V, G, M (un pellizco de tierra)', dur: '1 hora',
    sum: 'La velocidad del objetivo aumenta 3 m mientras dure.' },
]);

/* Magic Initiate lets you take from one of three spell lists. */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const MAGIC_INITIATE_LISTS = Object.freeze({
  clerigo: { es: 'Clérigo', ability: 'SAB' },
  druida:  { es: 'Druida',  ability: 'SAB' },
  mago:    { es: 'Mago',    ability: 'INT' },
});

/* Level-1 choices that widen proficiency, so they belong next to the classes. */
/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const DIVINE_ORDERS = Object.freeze({
  protector:  { es: 'Protector',  why: 'Armadura pesada y armas marciales. Para ir al frente.',
                d: 'Ganas competencia con armadura pesada y con armas marciales.' },
  taumaturgo: { es: 'Taumaturgo', why: 'Un truco más y mejor en Arcanos y Religión.',
                d: 'Conoces un truco de clérigo más y sumas tu modificador de Sabiduría a las pruebas de Arcanos y Religión.' },
});

/** Looked up by a key that only exists at runtime (a character's own
    choice), so it is typed as a table rather than as its literal shape.
    @type {Record<string, any>} */
export const PRIMAL_ORDERS = Object.freeze({
  mago:     { es: 'Mago',     why: 'Un truco más y mejor en Arcanos y Naturaleza.',
              d: 'Conoces un truco de druida más y sumas tu modificador de Sabiduría a las pruebas de Arcanos y Naturaleza.' },
  guardian: { es: 'Guardián', why: 'Armas marciales y armadura media. Para aguantar.',
              d: 'Ganas competencia con armas marciales y con armadura media.' },
});

/* ================================================================= QUIZ
   Fourteen situations. Every answer spreads weight across five channels:
     bg   background scores          ab   ability priority scores
     sk   skill affinity scores      kit  equipment style
     tone personality tags, used to suggest story text in the last step
   Nothing here decides anything on its own: the engine adds the weights up
   and the player can override every result afterwards.
========================================================================= */
export const POINT_BUY_COST = Object.freeze({ 8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9 });
export const POINT_BUY_TOTAL = 27;
