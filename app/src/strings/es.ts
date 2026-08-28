/** Every user-visible string. Identifiers and code stay in English. */
export const es = {
  app: 'Pantalla de DM',
  consola: 'Consola',
  mesa: 'Mesa',
  mesaQueJuega: 'Mesa que juega',
  pantalla: 'Pantalla de mesa',
  abrirMesa: 'Abrir pantalla de mesa',
  conectando: 'Conectando…',
  conectado: 'Conectado',
  desconectado: 'Sin conexión',
  soloLectura: 'Solo lectura',
  esperandoConsola: 'Esperando a la consola…',

  // abrir la carpeta
  abrirCarpeta: 'Abrir carpeta de campaña',
  reabrir: 'Reabrir',
  cerrarCarpeta: 'Cerrar carpeta',
  cambiarCarpeta: 'Cambiar de carpeta',
  campana: 'Campaña',
  abriendo: 'Abriendo…',
  bienvenida: 'Elige la carpeta de tu mundo o de tu campaña.',
  bienvenidaAyuda:
    'Los ficheros no salen de tu ordenador: esta pantalla los lee y los escribe ' +
    'directamente desde el navegador, y no hay servidor que los toque.',
  bienvenidaForma:
    'Vale una carpeta de mundo (la que tiene campaigns/ dentro) o una campaña ' +
    'suelta (la que tiene scenarios/ y story/).',
  reabrirAyuda:
    'El navegador recuerda la carpeta, pero necesita que le des permiso otra vez.',
  navegadorNoSoportado: 'Este navegador no puede abrir carpetas',
  navegadorAyuda:
    'La pantalla de DM lee tus ficheros con la File System Access API, que hoy ' +
    'sólo tienen Chrome, Edge y otros navegadores Chromium. Firefox y Safari ' +
    'todavía no la implementan.',
  avisoObsidian:
    'Si Obsidian tiene esta bóveda abierta, cierra los ficheros que se van a ' +
    'escribir antes de darle: la escritura puede fallar o quedarse a medias.',
  errorEscritura: 'No se pudo guardar',
  errorEscrituraAyuda:
    'Puede que Obsidian tenga el fichero abierto, o que el permiso de la carpeta ' +
    'haya caducado. Vuelve a abrirla y se reintentará en el próximo cambio.',

  // pestañas
  party: 'Party',
  objetos: 'Objetos',
  notas: 'Notas',
  preparacion: 'Preparación',
  masOpciones: 'Más',

  // escena
  sinEscena: 'Sin escena',
  escenas: 'Escenas',
  sinEscenas: 'Esta campaña no tiene escenas.',
  ocultarEscena: 'Quitar de la pantalla',
  enPantalla: 'En pantalla',
  documentoEnPantalla: 'Documento sobre la escena',
  paraLeer: 'Para leer',
  sinNota: 'Esta escena no tiene nota.',
  modoEscena: 'Escena',
  modoTablero: 'Tablero',
  hud: 'Marcador',
  enDirecto: 'Mesa en directo',
  congelada: 'Mesa congelada',
  congelar: 'Congelar la mesa',
  descongelar: 'Volver a directo',
  congelarAyuda:
    'Congela la pantalla de mesa: los jugadores siguen viendo lo último mientras preparas lo siguiente.',
  congeladaEn: 'Los jugadores siguen viendo',
  hudOn: 'Marcador visible',
  hudOff: 'Marcador oculto',

  // audio
  audio: 'Ambiente',
  sinAudio: 'Sin ambiente',
  reproducir: 'Reproducir',
  pausar: 'Pausar',
  volumen: 'Volumen',
  quitarAudio: 'Quitar ambiente',

  // documentos
  documentos: 'Documentos',
  quitarDocumento: 'Quitar documento',

  // combate / revelado
  visible: 'Visible',
  oculto: 'Oculto',
  ronda: 'Ronda',
  turnoDe: 'Turno de',
  revelarTodos: 'Revelar todos',
  ocultarTodos: 'Ocultar todos',
  pnjs: 'PNJ',

  // combate
  iniciarCombate: 'Iniciar combate',
  terminarCombate: 'Terminar combate',
  siguienteTurno: 'Siguiente',
  turnoAnterior: 'Anterior',
  iniciativa: 'Ini',
  ca: 'CA',
  pg: 'PG',
  temporales: 'Temporales',
  dano: 'Daño',
  curar: 'Curar',
  alMaximo: 'Al máximo',
  agotamiento: 'Agotamiento',
  salvaciones: 'Salvaciones de muerte',
  exitos: 'Éxitos',
  fallos: 'Fallos',
  reiniciar: 'Reiniciar',
  condiciones: 'Condiciones',
  notaDm: 'Nota del DM',
  notaPreparacion: 'Nota de preparación',
  rasgos: 'Rasgos',
  anadir: 'Añadir',

  // el tablero: quién está y quién entra
  anadirALaMesa: 'Añadir a la mesa',
  anadirALaMesaAyuda:
    'Quien entre aquí sale en la barra y en el tablero. Para que los ' +
    'jugadores no lo vean, déjalo oculto con ◉ / ○.',
  buscarCombatiente: 'Buscar…',
  yaEnLaMesa: 'Ya en la mesa',
  pnjDeLaCampana: 'PNJ de la campaña',
  cuantos: 'Cuántos',
  listo: 'Listo',
  quitarDeLaMesa: 'Quitar de la mesa',
  vaciarLaMesa: 'Vaciar la mesa',
  todosEnLaMesa: 'Ya está todo el mundo en la mesa.',

  // preparar el combate
  quienCombate: '¿Quién entra en el combate?',
  quienCombateAyuda:
    'Están todos los de la mesa, marcados. Desmarca a quien mire desde la ' +
    'barrera, y escribe la iniciativa de cada uno — nadie tira por ti.',
  empezar: 'Empezar',
  cancelar: 'Cancelar',
  todos: 'Todos',
  ninguno: 'Ninguno',
  tirarPorLosPnj: 'Tirar por los PNJ',
  faltaIniciativa: 'Sin iniciativa van los últimos.',
  quitar: 'Quitar',
  fueraDeCombate: 'Fuera',
  muerto: 'Muerto',
  seleccionaFicha: 'Selecciona un combatiente para ver su ficha.',
  velocidad: 'Velocidad',

  // tablero
  tablero: 'Tablero',
  mover: 'Mover fichas',
  medir: 'Medir distancia',
  colocarFichas: 'Colocar fichas',
  rejilla: 'Rejilla',

  // fichas y objetos
  descansoCorto: 'Descanso corto',
  descansoLargo: 'Descanso largo',
  // ficha
  tiradas: 'Tiradas',
  iniciativaLarga: 'Iniciativa',
  competencia: 'Competencia',
  percepcionPasiva: 'Percepción pasiva',
  porObjetos: 'por objetos',

  oro: 'Oro',
  equipo: 'Equipo',
  espacios: 'Espacios de conjuro',
  nivel: 'Nivel',
  dar: 'Dar a…',
  usos: 'usos',
  destruido: 'Destruido',
  recargar: 'Recargar',
  saquear: 'Saquear',
  saquearA: 'Saquear a',
  sigueVivo: 'Sigue en pie',
  sinCombatientes: 'Nadie en la mesa todavía.',
  efectos: 'Efectos',
  sinObjetos: 'No lleva nada.',
  confirmarLargo: '¿Descanso largo? Restaura PG y espacios de toda la party.',

  // notas
  buscar: 'Buscar en las notas…',
  resultado: 'resultado',
  resultados: 'resultados',
  eligeNota: 'Elige una nota.',
  enlazanAqui: 'Enlazan aquí',
  sinEnlaces: 'Ninguna nota enlaza aquí.',
  verNota: 'Ver nota',

  // cierre de sesión
  cerrarSesion: 'Cerrar sesión',
  bitacora: 'Bitácora',
  nombreFichero: 'Fichero',
  desviaciones: 'Cambios en el estado del mundo',
  sinDesviaciones: 'Nada que anotar en el estado.',
  vistaPrevia: 'Cómo quedará estado.md',
  escribir: 'Escribir en el vault',
  escrito: 'Escrito',
  registro: 'Registro de la sesión',
  sinRegistro: 'Todavía no ha pasado nada en esta sesión.',
  fecha: 'Fecha',
  avisoEscritura: 'Se escriben dos ficheros dentro de runs/. Nada de la preparación se toca.',

  // preparación
  rosters: 'Reparto de las escenas',
  rosterAyuda:
    'Qué PNJ carga cada escena, y cuántas copias. Se guarda en scenarios/*.json — es preparación, no partida.',
  bloqueado: 'Hay una partida en marcha',
  bloqueadoAyuda:
    'La preparación no se toca durante el juego. Quita la escena de la pantalla y termina el combate para poder editar el reparto.',
  anadirFila: 'Añadir PNJ',
  guardar: 'Guardar',
  guardado: 'Guardado',
  sinReparto: 'Sin reparto',
  cargarReparto: 'Cargar en la sesión',

  // mesa
  volver: 'Volver',
  lleva: 'Lleva',
  darObjeto: 'Dar objeto',
  verDetalle: 'Ver descripción',
  cerrar: 'Cerrar',
  nadieLoLleva: 'Nadie lo lleva',

  // catálogos de PNJ y objetos
  buscarPnj: 'Buscar PNJ…',
  buscarObjeto: 'Buscar objeto…',
  sinEtiqueta: 'Sin etiqueta',
  soloTrato: 'Sólo trato',
  soloTratoAyuda:
    'Su nota no tiene puntos de golpe, así que es alguien con quien se habla: ' +
    'no se puede sentar en el tablero ni cargar en el reparto de una escena.',
  copias: 'Copias',
  anadirALaSesion: 'Añadir a la sesión',
  yaEnLaSesion: 'ya en la mesa',
  eligePnj: 'Elige un PNJ.',
  sinPnj: 'Esta campaña no tiene PNJ.',
  sinObjetosCampana: 'Esta campaña no tiene objetos.',
  sinResultados: 'Nada coincide con la búsqueda.',
  soloSinRepartir: 'Sólo sin repartir',
  quitarA: 'Quitar a',
  catalogoAyuda: 'Sólo lectura: esto es la preparación, tal como está en las notas.',
} as const
