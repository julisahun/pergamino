/**
 * Every spell the app can offer, lifted from the creator by
 * `scripts/extract-spells.mjs`. Do not edit by hand: edit the creator's own
 * table and run the script again.
 *
 * The creator is a level-1 builder, so this is cantrips and level-1 spells.
 * A level-up that wants to offer something higher will find nothing here and
 * say so, which is the honest answer until the table grows.
 *
 * Rules content paraphrased from the SRD 5.2 (CC-BY-4.0, © Wizards of the
 * Coast), like everything else in this repo that touches the rules.
 */

/** A spell as the picker needs it. Fields follow the creator's own table. */
export interface RuleSpell {
  /** The name as the table writes it, which is what goes on screen. */
  es: string
  /** The English name, for looking it up in a book. */
  en: string
  /** `0` is a cantrip. */
  lvl: number
  school: string
  /** Class slugs: bardo, brujo, clerigo, druida, explorador, hechicero, mago, paladin. */
  classes: string[]
  time: string
  range: string
  comp: string
  dur: string
  /** The prose shown under the name — the DM's own words, not the SRD's. */
  sum: string
  conc?: boolean
  rit?: boolean
}

export const SPELLS: readonly RuleSpell[] = [
  {
    "es": "Salpicadura Ácida",
    "en": "Acid Splash",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Elige una criatura, o dos que estén a 1,5 m entre sí. Cada una hace una salvación de Destreza; si falla recibe 1d6 de daño de ácido."
  },
  {
    "es": "Guardia de Filo",
    "en": "Blade Ward",
    "lvl": 0,
    "school": "Abjuración",
    "classes": [
      "bardo",
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G",
    "dur": "1 asalto",
    "sum": "Hasta el final de tu siguiente turno, cualquier ataque de arma contra ti tiene desventaja si el atacante te puede ver."
  },
  {
    "es": "Toque Escalofriante",
    "en": "Chill Touch",
    "lvl": 0,
    "school": "Nigromancia",
    "classes": [
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro cuerpo a cuerpo: 1d10 de daño necrótico y el objetivo no puede recuperar puntos de golpe hasta el final de tu siguiente turno."
  },
  {
    "es": "Luces Danzantes",
    "en": "Dancing Lights",
    "lvl": 0,
    "school": "Ilusión",
    "classes": [
      "bardo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G, M (un poco de fósforo)",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Creas hasta cuatro luces del tamaño de una antorcha que flotan y se mueven 18 m con tu acción adicional. Iluminan poco pero bastan para no ir a ciegas."
  },
  {
    "es": "Truco de Druida",
    "en": "Druidcraft",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "druida"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Efectos menores de naturaleza: predices el tiempo de la próxima hora, haces florecer una semilla, creas un olor o un sonido, o apagas y enciendes una llama pequeña."
  },
  {
    "es": "Descarga Sobrenatural",
    "en": "Eldritch Blast",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "brujo"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Un rayo de energía: ataque de conjuro a distancia por 1d10 de daño de fuerza. Es el ataque básico del brujo y escala con el nivel."
  },
  {
    "es": "Elementalismo",
    "en": "Elementalism",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Un efecto elemental menor: apagas fuegos pequeños, condensas niebla, encharcas o secas un espacio, o levantas una ráfaga que empuja objetos ligeros."
  },
  {
    "es": "Saeta de Fuego",
    "en": "Fire Bolt",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 1d10 de daño de fuego. Los objetos inflamables sin llevar encima prenden."
  },
  {
    "es": "Amistad",
    "en": "Friends",
    "lvl": 0,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "brujo",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (un poco de maquillaje)",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Un humanoide que no esté en combate hace una salvación de Sabiduría; si falla, tienes ventaja en las pruebas de Carisma con él. Al acabar sabe que lo has encantado."
  },
  {
    "es": "Guía",
    "en": "Guidance",
    "lvl": 0,
    "school": "Divinación",
    "classes": [
      "clerigo",
      "druida"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Tocas a alguien dispuesto: una vez, antes de que acabe el conjuro, puede sumar 1d4 a una prueba de característica que haga."
  },
  {
    "es": "Luz",
    "en": "Light",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "bardo",
      "clerigo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, M (una luciérnaga)",
    "dur": "1 hora",
    "sum": "Un objeto que no sea mayor que Grande emite luz brillante en 6 m y poca luz 6 m más. Si el objetivo no quiere, hace una salvación de Destreza."
  },
  {
    "es": "Mano de Mago",
    "en": "Mage Hand",
    "lvl": 0,
    "school": "Conjuración",
    "classes": [
      "bardo",
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G",
    "dur": "1 minuto",
    "sum": "Una mano espectral que manipula objetos, abre puertas sin cerrar y lleva hasta 4,5 kg. No puede atacar ni activar objetos mágicos."
  },
  {
    "es": "Reparar",
    "en": "Mending",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "bardo",
      "clerigo",
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "1 minuto",
    "range": "Toque",
    "comp": "V, G, M (dos imanes)",
    "dur": "Instantáneo",
    "sum": "Arregla una rotura o un desgarro de un objeto, siempre que no sea mayor de 30 cm en cualquier dimensión. No devuelve propiedades mágicas."
  },
  {
    "es": "Mensaje",
    "en": "Message",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "bardo",
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G, M (un trozo de alambre de cobre)",
    "dur": "1 asalto",
    "sum": "Susurras un mensaje a una criatura que puedas ver y solo ella lo oye. Puede contestarte en un susurro que solo oyes tú."
  },
  {
    "es": "Ilusión Menor",
    "en": "Minor Illusion",
    "lvl": 0,
    "school": "Ilusión",
    "classes": [
      "bardo",
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "G, M (un poco de lana)",
    "dur": "1 minuto",
    "sum": "Creas un sonido o la imagen de un objeto que quepa en un cubo de 1,5 m. Quien lo estudie con Investigación CD igual a la tuya se da cuenta de que es falso."
  },
  {
    "es": "Rocío Venenoso",
    "en": "Poison Spray",
    "lvl": 0,
    "school": "Nigromancia",
    "classes": [
      "brujo",
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Una criatura hace una salvación de Constitución; si falla recibe 1d12 de daño de veneno."
  },
  {
    "es": "Prestidigitación",
    "en": "Prestidigitation",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "bardo",
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "3 m",
    "comp": "V, G",
    "dur": "Hasta 1 hora",
    "sum": "Trucos menores: una llama sin calor, un olor, limpiar o manchar un objeto, enfriar o calentar comida, o una marca que dura 1 hora."
  },
  {
    "es": "Producir Llama",
    "en": "Produce Flame",
    "lvl": 0,
    "school": "Conjuración",
    "classes": [
      "druida"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G",
    "dur": "10 minutos",
    "sum": "Una llama en tu mano que ilumina 3 m sin quemarte. Como acción puedes lanzarla: ataque de conjuro a distancia 9 m por 1d8 de daño de fuego."
  },
  {
    "es": "Rayo de Escarcha",
    "en": "Ray of Frost",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 1d8 de daño de frío, y la velocidad del objetivo baja 3 m hasta el inicio de tu siguiente turno."
  },
  {
    "es": "Resistencia",
    "en": "Resistance",
    "lvl": 0,
    "school": "Abjuración",
    "classes": [
      "clerigo",
      "druida"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Tocas a alguien dispuesto: una vez, antes de que acabe el conjuro, puede sumar 1d4 a una salvación."
  },
  {
    "es": "Llama Sagrada",
    "en": "Sacred Flame",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "clerigo"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Una criatura que puedas ver hace una salvación de Destreza; si falla recibe 1d8 de daño radiante. Cubrirse no le sirve de nada."
  },
  {
    "es": "Garrote Feérico",
    "en": "Shillelagh",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "druida"
    ],
    "time": "Acción adicional",
    "range": "Toque",
    "comp": "V, G, M (muérdago)",
    "dur": "1 minuto",
    "sum": "Un bastón o garrote que lleves pasa a hacer 1d8 de daño de fuerza y usa tu característica de lanzamiento en vez de Fuerza para atacar y dañar."
  },
  {
    "es": "Contacto Electrizante",
    "en": "Shocking Grasp",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro cuerpo a cuerpo con ventaja si el objetivo lleva metal: 1d8 de daño de relámpago y no puede hacer reacciones hasta su siguiente turno."
  },
  {
    "es": "Ráfaga de Hechicería",
    "en": "Sorcerous Burst",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "hechicero"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 1d8 del tipo de daño que elijas entre ácido, frío, fuego, relámpago, veneno, psíquico o trueno. Si sacas un 8, tira otro d8 (hasta tu modificador de lanzamiento de dados)."
  },
  {
    "es": "Perdonar a los Moribundos",
    "en": "Spare the Dying",
    "lvl": 0,
    "school": "Nigromancia",
    "classes": [
      "clerigo",
      "druida"
    ],
    "time": "Acción adicional",
    "range": "4,5 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Estabilizas a una criatura a 0 puntos de golpe: deja de tirar salvaciones de muerte. No la cura, la deja de morirse."
  },
  {
    "es": "Chispa Estelar",
    "en": "Starry Wisp",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "druida"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 1d8 de daño radiante; además el objetivo emite luz tenue en 3 m hasta el final de tu siguiente turno y no puede beneficiarse de estar invisible."
  },
  {
    "es": "Taumaturgia",
    "en": "Thaumaturgy",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "clerigo"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V",
    "dur": "Hasta 1 minuto",
    "sum": "Señales sobrenaturales: tu voz retumba, las llamas cambian de color o parpadean, tiembla el suelo, o una puerta o ventana se abre de golpe."
  },
  {
    "es": "Látigo Espinoso",
    "en": "Thorn Whip",
    "lvl": 0,
    "school": "Transmutación",
    "classes": [
      "druida"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (el tallo de una planta con espinas)",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro cuerpo a cuerpo con alcance 9 m: 1d6 de daño perforante y arrastras al objetivo (Grande o menor) 3 m hacia ti."
  },
  {
    "es": "Trueno Súbito",
    "en": "Thunderclap",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "bardo",
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal (1,5 m)",
    "comp": "G",
    "dur": "Instantáneo",
    "sum": "Un estallido audible a 30 m. Cada criatura a 1,5 m de ti (salvo tú) hace una salvación de Constitución; si falla recibe 1d6 de daño de trueno."
  },
  {
    "es": "Tañido de los Muertos",
    "en": "Toll the Dead",
    "lvl": 0,
    "school": "Nigromancia",
    "classes": [
      "clerigo",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Salvación de Sabiduría: si falla, 1d8 de daño necrótico, o 1d12 si al objetivo ya le faltaban puntos de golpe."
  },
  {
    "es": "Golpe Certero",
    "en": "True Strike",
    "lvl": 0,
    "school": "Divinación",
    "classes": [
      "bardo",
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, M (un arma con la que tengas competencia)",
    "dur": "Instantáneo",
    "sum": "Atacas con un arma usando tu característica de lanzamiento en vez de Fuerza o Destreza. Al acertar puedes cambiar el tipo de daño por radiante y a nivel 5 sube el daño."
  },
  {
    "es": "Burla Cruel",
    "en": "Vicious Mockery",
    "lvl": 0,
    "school": "Encantamiento",
    "classes": [
      "bardo"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V",
    "dur": "Instantáneo",
    "sum": "Un insulto con magia. Salvación de Sabiduría: si falla, 1d6 de daño psíquico y desventaja en su siguiente tirada de ataque. Tiene que poder oírte."
  },
  {
    "es": "Palabra de Resplandor",
    "en": "Word of Radiance",
    "lvl": 0,
    "school": "Evocación",
    "classes": [
      "clerigo"
    ],
    "time": "Acción",
    "range": "Personal (1,5 m)",
    "comp": "V, M (un símbolo sagrado)",
    "dur": "Instantáneo",
    "sum": "Cada criatura que elijas a 1,5 m de ti hace una salvación de Constitución; si falla recibe 1d6 de daño radiante."
  },
  {
    "es": "Alarma",
    "en": "Alarm",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "explorador",
      "mago"
    ],
    "time": "1 minuto",
    "range": "9 m",
    "comp": "V, G, M (una campanilla y plata)",
    "dur": "8 horas",
    "rit": true,
    "sum": "Marcas una zona de hasta 6 m de lado. Cuando entra alguien que no hayas designado, oyes una campanilla mental (o audible) aunque estés durmiendo."
  },
  {
    "es": "Amistad Animal",
    "en": "Animal Friendship",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "druida",
      "explorador"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (un bocado de comida)",
    "dur": "24 horas",
    "sum": "Una bestia con Inteligencia 3 o menos hace una salvación de Sabiduría; si falla, te considera amistosa. Si le haces daño, se rompe."
  },
  {
    "es": "Armadura de Agathys",
    "en": "Armor of Agathys",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "brujo"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V, G",
    "dur": "1 hora",
    "sum": "Ganas 5 puntos de golpe temporales. Mientras te duren, quien te golpee cuerpo a cuerpo recibe 5 de daño de frío."
  },
  {
    "es": "Brazos de Hadar",
    "en": "Arms of Hadar",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "brujo"
    ],
    "time": "Acción",
    "range": "Personal (3 m)",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Zarcillos oscuros brotan de ti. Cada criatura a 3 m hace una salvación de Fuerza: 2d6 de daño necrótico si falla (la mitad si acierta) y si falla no puede hacer reacciones."
  },
  {
    "es": "Perdición",
    "en": "Bane",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "brujo",
      "clerigo"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (una gota de sangre)",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Hasta tres criaturas hacen una salvación de Carisma; las que fallan restan 1d4 a sus tiradas de ataque y salvaciones mientras dure."
  },
  {
    "es": "Bendición",
    "en": "Bless",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "clerigo",
      "paladin"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (agua bendita)",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Hasta tres aliados suman 1d4 a sus tiradas de ataque y salvaciones mientras dure. Es uno de los conjuros de apoyo más fuertes a nivel bajo."
  },
  {
    "es": "Manos Ardientes",
    "en": "Burning Hands",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal (cono de 4,5 m)",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Un cono de fuego de 4,5 m. Salvación de Destreza: 3d6 de daño de fuego si falla, la mitad si acierta. Prende lo inflamable que no lleve nadie encima."
  },
  {
    "es": "Hechizar Persona",
    "en": "Charm Person",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "brujo",
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G",
    "dur": "1 hora",
    "sum": "Un humanoide hace una salvación de Sabiduría con ventaja si estáis en combate; si falla te considera amistoso hasta que acabe o le hagas daño. Después sabe que lo has hechizado."
  },
  {
    "es": "Orbe Cromático",
    "en": "Chromatic Orb",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "27 m",
    "comp": "V, G, M (un diamante de 50 po)",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 3d8 del tipo que elijas entre ácido, frío, fuego, relámpago, veneno o trueno. Al acertar puede rebotar a otro objetivo."
  },
  {
    "es": "Manchas de Color",
    "en": "Color Spray",
    "lvl": 1,
    "school": "Ilusión",
    "classes": [
      "bardo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal (cono de 4,5 m)",
    "comp": "V, G, M (polvo de colores)",
    "dur": "1 asalto",
    "sum": "Salvación de Constitución para cada criatura del cono; la que falla queda cegada hasta el final de tu siguiente turno."
  },
  {
    "es": "Orden",
    "en": "Command",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "clerigo",
      "paladin"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V",
    "dur": "1 asalto",
    "sum": "Das una orden de una palabra. Salvación de Sabiduría: si falla la obedece en su siguiente turno. Las clásicas: acércate, suelta, huye, tírate, párate."
  },
  {
    "es": "Duelo Obligado",
    "en": "Compelled Duel",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "paladin"
    ],
    "time": "Acción adicional",
    "range": "9 m",
    "comp": "V",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Salvación de Sabiduría: si falla, el objetivo tiene desventaja al atacar a cualquiera que no seas tú y no puede alejarse de ti voluntariamente."
  },
  {
    "es": "Comprender Idiomas",
    "en": "Comprehend Languages",
    "lvl": 1,
    "school": "Divinación",
    "classes": [
      "bardo",
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G, M (un pellizco de hollín y sal)",
    "dur": "1 hora",
    "rit": true,
    "sum": "Entiendes cualquier idioma que oigas y puedes leer cualquier texto escrito si lo tocas. No descifra códigos ni símbolos secretos."
  },
  {
    "es": "Crear o Destruir Agua",
    "en": "Create or Destroy Water",
    "lvl": 1,
    "school": "Transmutación",
    "classes": [
      "clerigo",
      "druida"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (una gota de agua o un puñado de arena)",
    "dur": "Instantáneo",
    "sum": "Creas hasta 40 litros de agua limpia en un recipiente, o haces llover en un cubo de 9 m; o destruyes la misma cantidad de agua o niebla."
  },
  {
    "es": "Curar Heridas",
    "en": "Cure Wounds",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "bardo",
      "clerigo",
      "druida",
      "explorador",
      "paladin"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Tocas a una criatura y le curas 2d8 + tu modificador de lanzamiento. No funciona en autómatas ni muertos vivientes."
  },
  {
    "es": "Detectar el Bien y el Mal",
    "en": "Detect Evil and Good",
    "lvl": 1,
    "school": "Divinación",
    "classes": [
      "clerigo",
      "paladin"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G",
    "dur": "10 minutos",
    "conc": true,
    "sum": "Percibes celestiales, elementales, feéricos, demonios, diablos y muertos vivientes a 9 m, y si hay algo consagrado o profanado. No sabes qué son exactamente."
  },
  {
    "es": "Detectar Magia",
    "en": "Detect Magic",
    "lvl": 1,
    "school": "Divinación",
    "classes": [
      "bardo",
      "clerigo",
      "druida",
      "explorador",
      "hechicero",
      "mago",
      "paladin"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G",
    "dur": "10 minutos",
    "conc": true,
    "rit": true,
    "sum": "Percibes la presencia de magia a 9 m. Con una acción puedes ver un aura alrededor de lo mágico y saber a qué escuela pertenece."
  },
  {
    "es": "Detectar Venenos y Enfermedades",
    "en": "Detect Poison and Disease",
    "lvl": 1,
    "school": "Divinación",
    "classes": [
      "clerigo",
      "druida",
      "paladin"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G, M (una hoja de tejo)",
    "dur": "10 minutos",
    "conc": true,
    "rit": true,
    "sum": "Percibes venenos, criaturas venenosas y enfermedades a 9 m, y de qué tipo son."
  },
  {
    "es": "Disfrazarse",
    "en": "Disguise Self",
    "lvl": 1,
    "school": "Ilusión",
    "classes": [
      "bardo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G",
    "dur": "1 hora",
    "sum": "Cambias tu aspecto: cara, voz, ropa. Tu altura no puede variar más de 30 cm. Al tocarte se nota, y quien investigue con CD igual a la tuya lo descubre."
  },
  {
    "es": "Susurros Disonantes",
    "en": "Dissonant Whispers",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V",
    "dur": "Instantáneo",
    "sum": "Salvación de Sabiduría: si falla, 3d6 de daño psíquico y tiene que usar su reacción para alejarse de ti todo lo que pueda. La mitad de daño si acierta."
  },
  {
    "es": "Favor Divino",
    "en": "Divine Favor",
    "lvl": 1,
    "school": "Transmutación",
    "classes": [
      "paladin"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V",
    "dur": "1 minuto",
    "sum": "Tus ataques con arma hacen 1d4 de daño radiante extra mientras dure. No requiere concentración."
  },
  {
    "es": "Golpe Enredador",
    "en": "Ensnaring Strike",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "explorador"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V",
    "dur": "1 minuto",
    "conc": true,
    "sum": "La próxima vez que aciertes con un arma, brotan espinas: salvación de Fuerza o el objetivo queda apresado y recibe 1d6 de daño perforante al inicio de cada turno."
  },
  {
    "es": "Enmarañar",
    "en": "Entangle",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "druida",
      "explorador"
    ],
    "time": "Acción",
    "range": "27 m",
    "comp": "V, G",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Plantas brotan en un cuadrado de 6 m: terreno difícil, y quien esté dentro hace una salvación de Fuerza o queda apresado. Puede zafarse con una prueba de Fuerza."
  },
  {
    "es": "Retirada Rápida",
    "en": "Expeditious Retreat",
    "lvl": 1,
    "school": "Transmutación",
    "classes": [
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V",
    "dur": "10 minutos",
    "conc": true,
    "sum": "Puedes Correr como acción adicional en este turno y en cada turno mientras dure el conjuro."
  },
  {
    "es": "Fuego Feérico",
    "en": "Faerie Fire",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "bardo",
      "druida"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Todo en un cubo de 6 m queda perfilado de luz: salvación de Destreza o los ataques contra esa criatura tienen ventaja y no puede beneficiarse de estar invisible."
  },
  {
    "es": "Falsa Vida",
    "en": "False Life",
    "lvl": 1,
    "school": "Nigromancia",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V, G, M (un poco de alcohol)",
    "dur": "Instantáneo",
    "sum": "Ganas 2d4 + 4 puntos de golpe temporales."
  },
  {
    "es": "Caída de Pluma",
    "en": "Feather Fall",
    "lvl": 1,
    "school": "Transmutación",
    "classes": [
      "bardo",
      "hechicero",
      "mago"
    ],
    "time": "Reacción, cuando tú o alguien a 18 m se cae",
    "range": "18 m",
    "comp": "V, M (una pluma pequeña)",
    "dur": "1 minuto",
    "sum": "Hasta cinco criaturas que caen bajan a 18 m por asalto y no sufren daño por caída. Es una reacción: se lanza en el momento."
  },
  {
    "es": "Encontrar Familiar",
    "en": "Find Familiar",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "mago"
    ],
    "time": "1 hora",
    "range": "3 m",
    "comp": "V, G, M (carbón, incienso y hierbas, 10 po)",
    "dur": "Instantáneo",
    "rit": true,
    "sum": "Invocas un espíritu con forma de animal pequeño. Ves y oyes a través de él, y puede entregar tus conjuros de toque. Si muere, puedes reinvocarlo."
  },
  {
    "es": "Nube de Niebla",
    "en": "Fog Cloud",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "druida",
      "explorador",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G",
    "dur": "1 hora",
    "conc": true,
    "sum": "Una esfera de niebla de 6 m de radio: la zona queda muy oscurecida, así que dentro nadie ve nada. Se dispersa con viento fuerte."
  },
  {
    "es": "Baya Nutritiva",
    "en": "Goodberry",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "druida",
      "explorador"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G, M (una ramita de muérdago)",
    "dur": "24 horas",
    "sum": "Creas 10 bayas. Comer una es una acción adicional, cura 1 punto de golpe y alimenta como una comida entera. En una campaña de escasez, esto pesa mucho."
  },
  {
    "es": "Grasa",
    "en": "Grease",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G, M (un poco de sebo)",
    "dur": "1 minuto",
    "sum": "Un cuadrado de 3 m se vuelve resbaladizo: terreno difícil, y quien esté o entre hace una salvación de Destreza o cae derribado."
  },
  {
    "es": "Lluvia de Espinas",
    "en": "Hail of Thorns",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "explorador"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V",
    "dur": "1 minuto",
    "conc": true,
    "sum": "La próxima vez que aciertes con un arma a distancia, estallan espinas: cada criatura a 1,5 m del objetivo hace una salvación de Destreza por 1d10 de daño perforante."
  },
  {
    "es": "Palabra Curativa",
    "en": "Healing Word",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "bardo",
      "clerigo",
      "druida"
    ],
    "time": "Acción adicional",
    "range": "18 m",
    "comp": "V",
    "dur": "Instantáneo",
    "sum": "Curas 2d4 + tu modificador de lanzamiento a distancia y como acción adicional. Es la forma de levantar a alguien caído sin acercarte."
  },
  {
    "es": "Reprimenda Infernal",
    "en": "Hellish Rebuke",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "brujo"
    ],
    "time": "Reacción, cuando te hacen daño",
    "range": "18 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Quien te acaba de dañar se envuelve en llamas: salvación de Destreza por 2d10 de daño de fuego, la mitad si acierta."
  },
  {
    "es": "Heroísmo",
    "en": "Heroism",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "paladin"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Un aliado queda inmune al estado asustado y gana puntos de golpe temporales iguales a tu modificador de lanzamiento al inicio de cada uno de sus turnos."
  },
  {
    "es": "Maleficio",
    "en": "Hex",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "brujo"
    ],
    "time": "Acción adicional",
    "range": "27 m",
    "comp": "V, G, M (el ojo petrificado de un tritón)",
    "dur": "1 hora",
    "conc": true,
    "sum": "Tus ataques contra el objetivo hacen 1d6 de daño necrótico extra, y tiene desventaja en las pruebas de una característica que elijas. Si muere, puedes pasar el maleficio a otro."
  },
  {
    "es": "Marca del Cazador",
    "en": "Hunter's Mark",
    "lvl": 1,
    "school": "Divinación",
    "classes": [
      "explorador"
    ],
    "time": "Acción adicional",
    "range": "27 m",
    "comp": "V",
    "dur": "1 hora",
    "conc": true,
    "sum": "Tus ataques con arma contra el objetivo hacen 1d6 de daño extra, y tienes ventaja en Percepción y Supervivencia para localizarlo. El explorador lo tiene siempre preparado."
  },
  {
    "es": "Cuchilla de Hielo",
    "en": "Ice Knife",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "G, M (una gota de agua)",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 1d10 de daño perforante; acierte o no, estalla y cada criatura a 1,5 m hace una salvación de Destreza por 2d6 de daño de frío."
  },
  {
    "es": "Identificar",
    "en": "Identify",
    "lvl": 1,
    "school": "Divinación",
    "classes": [
      "bardo",
      "mago"
    ],
    "time": "1 minuto",
    "range": "Toque",
    "comp": "V, G, M (una perla de 100 po y una pluma de búho)",
    "dur": "Instantáneo",
    "rit": true,
    "sum": "Averiguas las propiedades de un objeto mágico, si necesita vinculación y qué conjuros lo afectan. Como ritual no gasta espacio, solo 10 minutos."
  },
  {
    "es": "Escritura Ilusoria",
    "en": "Illusory Script",
    "lvl": 1,
    "school": "Ilusión",
    "classes": [
      "bardo",
      "brujo",
      "mago"
    ],
    "time": "1 minuto",
    "range": "Toque",
    "comp": "G, M (tinta de plomo de 10 po)",
    "dur": "10 días",
    "rit": true,
    "sum": "Escribes en un pergamino: quien no hayas designado ve otro texto o garabatos sin sentido. Los designados leen el mensaje real."
  },
  {
    "es": "Infligir Heridas",
    "en": "Inflict Wounds",
    "lvl": 1,
    "school": "Nigromancia",
    "classes": [
      "clerigo"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 2d10 de daño necrótico."
  },
  {
    "es": "Salto",
    "en": "Jump",
    "lvl": 1,
    "school": "Transmutación",
    "classes": [
      "druida",
      "explorador",
      "hechicero",
      "mago"
    ],
    "time": "Acción adicional",
    "range": "Toque",
    "comp": "V, G, M (la pata trasera de un saltamontes)",
    "dur": "1 minuto",
    "sum": "La distancia de salto del objetivo se multiplica por tres mientras dure."
  },
  {
    "es": "Armadura de Mago",
    "en": "Mage Armor",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G, M (un trozo de cuero curtido)",
    "dur": "8 horas",
    "sum": "Una criatura sin armadura pasa a tener CA 13 + su modificador de Destreza. Para un mago o un hechicero es la diferencia entre 12 y 15 de CA."
  },
  {
    "es": "Misil Mágico",
    "en": "Magic Missile",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Tres dardos que no fallan nunca: 1d4 + 1 de daño de fuerza cada uno, repartidos entre los objetivos que quieras. Sin tirada de ataque."
  },
  {
    "es": "Protección contra el Bien y el Mal",
    "en": "Protection from Evil and Good",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "brujo",
      "clerigo",
      "druida",
      "mago",
      "paladin"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G, M (agua bendita o polvo de plata)",
    "dur": "10 minutos",
    "conc": true,
    "sum": "Contra celestiales, elementales, feéricos, demonios, diablos y muertos vivientes: sus ataques contra el objetivo tienen desventaja y no pueden hechizarlo, asustarlo ni poseerlo."
  },
  {
    "es": "Purificar Comida y Bebida",
    "en": "Purify Food and Drink",
    "lvl": 1,
    "school": "Transmutación",
    "classes": [
      "clerigo",
      "druida",
      "paladin"
    ],
    "time": "Acción",
    "range": "3 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "rit": true,
    "sum": "Toda la comida y la bebida en una esfera de 1,5 m queda libre de venenos y enfermedades. En una campaña donde el agua escasea, esto vale más que un conjuro de daño."
  },
  {
    "es": "Rayo de Enfermedad",
    "en": "Ray of Sickness",
    "lvl": 1,
    "school": "Nigromancia",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Ataque de conjuro a distancia por 2d8 de daño de veneno; al acertar, salvación de Constitución o el objetivo queda envenenado hasta el final de tu siguiente turno."
  },
  {
    "es": "Santuario",
    "en": "Sanctuary",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "clerigo"
    ],
    "time": "Acción adicional",
    "range": "9 m",
    "comp": "V, G, M (un espejito de plata)",
    "dur": "1 minuto",
    "sum": "Quien quiera atacar al protegido hace una salvación de Sabiduría; si falla tiene que elegir otro objetivo o perder la acción. Se rompe si el protegido ataca."
  },
  {
    "es": "Golpe Abrasador",
    "en": "Searing Smite",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "paladin"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Tu próximo golpe con arma hace 1d6 de daño de fuego extra y el objetivo arde: 1d6 al inicio de cada uno de sus turnos hasta que pase una salvación de Constitución."
  },
  {
    "es": "Escudo",
    "en": "Shield",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "hechicero",
      "mago"
    ],
    "time": "Reacción, cuando te golpean o te alcanza Misil Mágico",
    "range": "Personal",
    "comp": "V, G",
    "dur": "1 asalto",
    "sum": "+5 a la CA hasta el inicio de tu siguiente turno, aplicable contra el ataque que lo provocó, y no recibes daño de Misil Mágico."
  },
  {
    "es": "Escudo de Fe",
    "en": "Shield of Faith",
    "lvl": 1,
    "school": "Abjuración",
    "classes": [
      "clerigo",
      "paladin"
    ],
    "time": "Acción adicional",
    "range": "18 m",
    "comp": "V, G, M (un pergamino con una oración)",
    "dur": "10 minutos",
    "conc": true,
    "sum": "Un aliado gana +2 a la CA mientras dure."
  },
  {
    "es": "Imagen Silenciosa",
    "en": "Silent Image",
    "lvl": 1,
    "school": "Ilusión",
    "classes": [
      "bardo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G, M (un poco de lana)",
    "dur": "10 minutos",
    "conc": true,
    "sum": "Una imagen visual de hasta 4,5 m de lado que puedes mover con tu acción. No hace ruido ni olor: quien la investigue con CD igual a la tuya la atraviesa con la vista."
  },
  {
    "es": "Dormir",
    "en": "Sleep",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G, M (arena fina y pétalos de rosa)",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Cada criatura en una esfera de 1,5 m hace una salvación de Sabiduría; la que falla queda incapacitada y cae dormida. Despierta si sufre daño o alguien la sacude."
  },
  {
    "es": "Hablar con los Animales",
    "en": "Speak with Animals",
    "lvl": 1,
    "school": "Divinación",
    "classes": [
      "bardo",
      "druida",
      "explorador"
    ],
    "time": "Acción",
    "range": "Personal",
    "comp": "V, G",
    "dur": "10 minutos",
    "rit": true,
    "sum": "Puedes hablar con las bestias. Entienden poco y saben menos, pero un caballo o una gaviota han visto cosas que tú no."
  },
  {
    "es": "Risa Horrible de Tasha",
    "en": "Tasha's Hideous Laughter",
    "lvl": 1,
    "school": "Encantamiento",
    "classes": [
      "bardo",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (tartas diminutas y una pluma)",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Salvación de Sabiduría: si falla, el objetivo cae al suelo incapacitado de risa. Repite la salvación cada turno y cuando sufre daño."
  },
  {
    "es": "Disco Flotante de Tenser",
    "en": "Tenser's Floating Disk",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (una gota de mercurio)",
    "dur": "1 hora",
    "rit": true,
    "sum": "Un disco de fuerza de 1 m que flota y carga hasta 250 kg. Te sigue a 6 m. Sirve para sacar el botín, o a un compañero inconsciente."
  },
  {
    "es": "Golpe Tronante",
    "en": "Thunderous Smite",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "paladin"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Tu próximo golpe con arma hace 2d6 de daño de trueno extra y el objetivo hace una salvación de Fuerza o es empujado 3 m y cae derribado."
  },
  {
    "es": "Onda Trueno",
    "en": "Thunderwave",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "bardo",
      "druida",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "Personal (cubo de 4,5 m)",
    "comp": "V, G",
    "dur": "Instantáneo",
    "sum": "Salvación de Constitución para todo lo que esté en el cubo: 2d8 de daño de trueno y empujón de 3 m si falla, la mitad de daño y sin empujón si acierta."
  },
  {
    "es": "Sirviente Invisible",
    "en": "Unseen Servant",
    "lvl": 1,
    "school": "Conjuración",
    "classes": [
      "bardo",
      "brujo",
      "mago"
    ],
    "time": "Acción",
    "range": "18 m",
    "comp": "V, G, M (un trozo de cuerda y un poco de madera)",
    "dur": "1 hora",
    "rit": true,
    "sum": "Una fuerza invisible que obedece órdenes sencillas: llevar cosas, limpiar, abrir puertas, servir la mesa. Fuerza 2, no ataca."
  },
  {
    "es": "Rayo de Bruja",
    "en": "Witch Bolt",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "brujo",
      "hechicero",
      "mago"
    ],
    "time": "Acción",
    "range": "9 m",
    "comp": "V, G, M (una ramita de un árbol partido por un rayo)",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Ataque de conjuro a distancia por 2d12 de daño de relámpago; el arco se mantiene y en cada turno siguiente puedes gastar tu acción para hacer 1d12 más."
  },
  {
    "es": "Golpe Iracundo",
    "en": "Wrathful Smite",
    "lvl": 1,
    "school": "Nigromancia",
    "classes": [
      "paladin"
    ],
    "time": "Acción adicional",
    "range": "Personal",
    "comp": "V",
    "dur": "1 minuto",
    "conc": true,
    "sum": "Tu próximo golpe con arma hace 1d6 de daño psíquico extra y el objetivo hace una salvación de Sabiduría o queda asustado de ti."
  },
  {
    "es": "Rayo Guía",
    "en": "Guiding Bolt",
    "lvl": 1,
    "school": "Evocación",
    "classes": [
      "clerigo"
    ],
    "time": "Acción",
    "range": "36 m",
    "comp": "V, G",
    "dur": "1 asalto",
    "sum": "Ataque de conjuro a distancia por 4d6 de daño radiante; al acertar, el siguiente ataque contra ese objetivo antes del final de tu próximo turno tiene ventaja."
  },
  {
    "es": "Zancada Prolongada",
    "en": "Longstrider",
    "lvl": 1,
    "school": "Transmutación",
    "classes": [
      "bardo",
      "druida",
      "explorador",
      "mago"
    ],
    "time": "Acción",
    "range": "Toque",
    "comp": "V, G, M (un pellizco de tierra)",
    "dur": "1 hora",
    "sum": "La velocidad del objetivo aumenta 3 m mientras dure."
  }
]

/** The spells one class may pick at or below a level. Empty when unknown. */
export const spellsFor = (className: string, maxLevel: number): RuleSpell[] =>
  SPELLS.filter((s) => s.classes.includes(className) && s.lvl <= maxLevel)

/** Which class slugs this table knows anything about. */
export const SPELL_CLASSES: readonly string[] = ["bardo","brujo","clerigo","druida","explorador","hechicero","mago","paladin"]
