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

  // el formato de una campaña
  formato: 'Cómo se prepara una campaña',
  formatoTitulo: 'El formato de una campaña',
  formatoSub: 'Una carpeta de notas de Obsidian, no una base de datos.',
  formatoQueEs:
    'Cada PNJ y cada objeto es una nota con su ficha en el front matter y su ' +
    'prosa debajo; cada escena, un json con su arte, su rejilla y su reparto; ' +
    'cada PJ, una carpeta con su nota y su hoja.',
  formatoPnj: 'gente y bichos: CA, PG, iniciativa, rasgos y retrato',
  formatoObjetos: 'objetos: cargas, efectos y descripción',
  formatoEscenas: 'escenas: arte, sonido, rejilla, reparto y nota de lectura',
  formatoPlayers: 'la party: una carpeta por PJ, con su nota y su -fc5.xml',
  formatoStory: 'las notas de la campaña, con [[enlaces]] y #etiquetas',
  formatoAssets: 'arte, documentos y ambiente',
  formatoRuns: 'una carpeta por mesa: lo único que la app escribe',
  formatoLlm:
    'instructions.md es el formato entero, escrito para dárselo a un LLM. ' +
    'Dáselo junto con tu material — una aventura publicada, tus apuntes, una ' +
    'campaña en otro formato — y te lo convierte en una carpeta que esta ' +
    'pantalla abre.',
  formatoReglas:
    'Le dice que no toque lo que ya tienes (escribe una carpeta nueva) y que ' +
    'pregunte en vez de inventarse un número.',
  formatoDescargar: 'Descargar instructions.md',

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
  laMesaVe: 'La mesa ve',
  nombreTapado: 'Nombre tapado',
  nombreALaVista: 'La mesa ve su nombre',
  revelarNombre: 'Revelar el nombre a la mesa',
  taparNombre: 'Volver a taparle el nombre',
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

  // acciones: elegir qué se hace y contra quién, y ver el resultado antes
  // de aplicarlo
  sinAcciones: 'Nada con números en su ficha — se lleva a mano.',
  objetivos: 'Objetivos',
  elegirEnTablero: 'Elige en el tablero',
  elegirObjetivo: 'Elige a quién',
  tirar: 'Tirar',
  salvacion: 'Salv',
  curacion: 'Curación',
  impacta: 'Impacta',
  falla: 'Falla',
  critico: '¡Crítico!',
  pifia: 'Pifia',
  salva: 'Salva',
  noSalva: 'No salva',
  sinDano: 'sin daño',
  mitad: 'mitad',
  aplicar: 'Aplicar',
  gastar: 'Gastar',
  espacioNivel: 'espacio de nivel',
  quedan: 'quedan',
  sinCa: 'sin CA — decides tú',

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
  cdConjuros: 'CD conjuros',
  ataqueConjuros: 'Ataque conjuros',
  conjurosPor: 'Conjuros por',
  habilidades: 'Habilidades',
  tiradasSalvacion: 'Salvaciones',
  verFicha: 'Ver la ficha entera',
  fichaDe: 'Ficha de',
  puntuaciones: 'Características',
  segunLaFicha: 'según la ficha',
  soloCaracteristica: 'sólo característica',
  habilidadesSinDeclarar:
    'La ficha no declara habilidades, así que estas son sólo el modificador de ' +
    'característica: a quien tenga competencia o experticia le falta el bono. ' +
    'Para verlas exactas, que la ficha escriba una línea «Habilidades: …».',

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

  // servidor
  servidor: 'Servidor',
  sinServidor: 'No hay servidor',
  sinServidorAyuda:
    'La consola necesita el servidor de la campaña: es donde viven los personajes ' +
    'y el estado de la mesa. Arráncalo y vuelve a intentarlo.',
  reintentar: 'Reintentar',
  tokenDm: 'Token del DM',
  tokenDmAyuda:
    'El token está en el .env del servidor. Se guarda en este navegador y no se vuelve a pedir.',
  guardarToken: 'Guardar y continuar',
  cambiarToken: 'Cambiar token del servidor',
  sinAutorizar: 'El servidor no acepta ese token.',
  sinConexion: 'Sin conexión con el servidor',
  reconectando: 'Reconectando…',
  registrarCampana: 'Registrar la campaña en el servidor',
  registrarCampanaAyuda:
    'La primera vez, la campaña se da de alta en el servidor y su identificador se guarda en ' +
    '.pergamino/campaign.json dentro de la carpeta. Los personajes de la party viven allí, ' +
    'no en la carpeta: cada jugador sube su ficha desde el enlace.',
  registrando: 'Registrando…',
  enlaceJugadores: 'Enlace para los jugadores',
  enlaceJugadoresAyuda:
    'Quien lo abra elige quién es, o crea su personaje subiendo su ficha -fc5.xml.',
  copiarEnlace: 'Copiar',
  enlaceCopiado: 'Copiado',
  regenerarEnlace: 'Nuevo enlace',
  regenerarEnlaceAviso: 'El enlace anterior deja de valer; hay que repartir el nuevo.',
  anadirPersonaje: 'Añadir personaje',
  fichaFc5: 'Ficha (-fc5.xml)',
  nombreJugador: 'Jugador',
  subir: 'Subir',
  subiendo: 'Subiendo…',
  sustituirFicha: 'Sustituir ficha',
  quitarDeLaCampana: 'Quitar de la campaña',
  confirmarQuitar: '¿Quitar a este personaje de la campaña? Se pierde su estado en la mesa.',
  sinPersonajes: 'Todavía no hay personajes: reparte el enlace, o sube una ficha aquí.',
  nuevaSesion: 'Nueva sesión',
  nuevaSesionAyuda: 'Archiva el estado actual y vuelve a sentar a la party con todo al máximo.',
  fichaNoValida: 'Eso no es una ficha de Fight Club 5.',
  rechazado: 'El servidor no ha aplicado la acción',

  // la ficha del jugador
  ficha: 'Ficha',
  quienEres: '¿Quién eres?',
  quienEresAyuda: 'Elige tu personaje. Si todavía no está, créalo con tu ficha -fc5.xml.',
  crearPersonaje: 'Crear personaje',
  crearPersonajeAyuda: 'Sube la ficha -fc5.xml que te dio el DM, o la que exporta Fight Club 5. Los números salen de ahí: aquí no se calcula nada.',
  tuNombre: 'Tu nombre',
  crear: 'Crear',
  cambiarPersonaje: 'Cambiar de personaje',
  sinEnlace: 'Este enlace no lleva a ninguna campaña.',
  sinEnlaceAyuda: 'Pide al DM el enlace de la campaña y ábrelo tal cual.',
  enlaceCaducado: 'El enlace ha caducado: pide al DM el nuevo.',
  cargando: 'Cargando…',
  tuTurno: '¡Tu turno!',
  turnoDeOtro: 'Turno de',
  combate: 'Combate',
  caracteristicas: 'Características',
  conjuros: 'Conjuros',
  rasgosTab: 'Rasgos',
  equipoTab: 'Equipo',
  ataque: 'Ataque',
  mitadSiAcierta: 'la mitad si acierta',
  competente: 'competente',
  experticia: 'experticia',
  derivado: 'sumado de la hoja: característica más competencia',
  trucos: 'Trucos',
  nivelN: 'Nivel',
  ritual: 'ritual',
  componentes: 'Componentes',
  tiempo: 'Tiempo',
  alcance: 'Alcance',
  duracion: 'Duración',
  sinConjuros: 'Esta ficha no tiene conjuros.',
  sinRasgos: 'Esta ficha no tiene rasgos.',
  sinEquipo: 'Esta ficha no lista equipo.',
  monedas: 'Monedas en la hoja',
  inventario: 'Inventario',
  llevas: 'Llevas',
  cargas: 'Cargas',
  cantidad: 'Cantidad',
  salvacionesMuerte: 'Salvaciones de muerte',
  exito: 'Éxito',
  fallo: 'Fallo',
  estados: 'Estados',
  sinEstados: 'Sin estados',
  enemigos: 'Enemigos',
  nadieEnMesa: 'Nadie en la mesa todavía.',
  ajustes: 'Ajustes',
  jugadorLabel: 'Jugador',
  sinPersonajesAun: 'Todavía no hay nadie en la party.',
  llevado: 'llevado',
  peso: 'Peso',
  velocidadLabel: 'Velocidad',
} as const
