# Pantalla de DM

Consola de dirección para campañas de D&D. La **consola** en el portátil del
DM, la **pantalla de mesa** en la tele, la **ficha** de cada jugador en su
móvil, y un servidor pequeño que guarda la party y el estado de la mesa.

| Pantalla | Ruta | Qué ve |
|---|---|---|
| Consola | `/` | Todo: fichas de PNJ, notas secretas, PNJ ocultos, preparación |
| Mesa | `/tv` | Sólo lo revelado: arte de escena, tablero, marcador, documentos |
| Ficha | `/pj#<enlace>` | Un PJ: su hoja entera y su estado, y de los demás lo mismo que ve la tele |

**La preparación no sale de tu ordenador.** La consola abre tu carpeta con la
File System Access API y la lee desde el navegador: notas, escenas, arte,
PNJ. Al servidor sólo llega lo que el reductor necesita — los bloques de
estadísticas, las reglas de los objetos, los repartos de las escenas — y
nunca la prosa. Lo que sí vive en el servidor son **los personajes** (la ficha
`-fc5.xml` que sube cada jugador desde el enlace) y **el estado vivo** de la
mesa: puntos de golpe, espacios, oro, quién lleva qué. Así un número existe en
un sitio, y no en la carpeta del DM, en el móvil del jugador y en un
`session.json` a la vez.

Eso tiene un precio: **hace falta Chrome, Edge u otro navegador Chromium.**
Firefox y Safari no implementan esa API todavía, y la app lo dice en vez de
fallar de forma rara.

## Arrancar

```bash
npm install
npm run dev          # el servidor (token `dev`, data/dev.sqlite) y Vite en :5173
```

Abre la consola, pulsa **Abrir carpeta de campaña** y elige tu mundo
(`talasia/`) o una campaña suelta (`marea-baja/`). La primera vez la consola
pide el **token del DM** (el `DM_TOKEN` del servidor; en desarrollo, `dev`) y
ofrece **Registrar la campaña**: el servidor le da un identificador, que se
guarda en `.pergamino/campaign.json` dentro de la carpeta. Desde ahí, **Abrir
pantalla de mesa** para la segunda ventana, y en **Party** el enlace que se
reparte a los jugadores.

El navegador recuerda la carpeta entre recargas, pero el permiso caduca: al
volver, la consola ofrece **Reabrir** y basta un clic para recuperarlo.

En producción es un solo proceso de Node — las páginas y la API — con su
configuración en un `.env` (ver `deploy/env.example`):

```bash
npm run build        # las páginas en dist/ y el servidor en server/dist/index.mjs
npm start            # http://127.0.0.1:8085  ($DM_PORT)
```

### Qué carpeta vale

La carpeta que elijas se detecta por su forma:

| Contiene | Es | Qué implica |
|---|---|---|
| `campaigns/` | un **mundo** (`talasia/`) | varias campañas, y el índice de notas abarca todo el mundo, así que la lore de `mundo/` se alcanza desde una nota de campaña |
| `scenarios/` o `story/` | una **campaña suelta** | una sola campaña; las notas se direccionan desde su propia carpeta |

## La regla que lo sostiene

`runs/README.md` del vault dice:

> **La preparación no se toca durante el juego; una partida sólo acumula.**
> Nada de `runs/` edita `story/`, `pnj/`, `objects/` ni `scenarios/`.

Antes eso era una comparación de rutas (`assertWritable`). Ahora es la **forma
de los tipos**. Los cargadores reciben un `VaultDir`, que no tiene `write`, y
un handle no puede nombrar a su padre — así que escribir fuera de una partida
no es algo que se rechace en tiempo de ejecución: es un error de compilación.
Sólo tres descensos resuelven un `WritableVaultDir`:

- `runs/<mesa>/` — la bitácora y el `estado.md` al cerrar sesión
- `scenarios/` desde **Preparación**, cerrada mientras haya partida en marcha
- `.pergamino/` — la carpeta propia de la app, con el identificador de la
  campaña; se escribe una vez al registrarla

`shared/vault/scope.test.ts` lo comprueba sobre un vault en memoria que anota
qué handles se pidieron con permiso de escritura y dónde cayó cada escritura.

Y como esa regla sólo cubre *dónde* se escribe, no *en qué vault*, las pruebas
abren el vault real de sólo lectura (`test/fixture.ts`): el handle lanza antes
de tocar un byte, en vez de que una comprobación lo atrape.

## El servidor

`server/` es Node con SQLite, y corre **el mismo reductor** que la consola
corría antes en la pestaña y que las pruebas siguen conduciendo. Es el dueño
de dos cosas: los personajes — la ficha que subió cada jugador y su estado
vivo — y la sesión, con un número de revisión que crece con cada acción. La
consola y los móviles le mandan acciones por WebSocket y reciben el estado
entero de vuelta, cada uno en la forma que le toca: a la consola todo, a un
móvil la proyección de su personaje.

Dos credenciales y ninguna cuenta: el **token del DM** (`DM_TOKEN` en el
`.env`; sin él el servidor no arranca) para todo lo que hay bajo `/api/dm/`, y
el **enlace de la campaña**, que da acceso al selector de personajes y a la
ficha propia, y permite crear o sustituir un personaje a quien lo tenga. Se
puede regenerar desde la consola.

Lo que **no** llega al servidor: `story/`, las notas, la prosa de un PNJ, la
descripción de un objeto, la nota de lectura de una escena, ninguna carpeta.
`app/src/state/publish.ts` es donde se recorta antes de que salga un byte.

## Las pantallas

La pantalla de mesa **no tiene handle de carpeta**. No puede leer el vault ni
en principio — una garantía más fuerte que la del servidor anterior, que al
menos tenía una ruta `/vault/*`.

Lo que cruza el `BroadcastChannel` es:

- el `TableView` que produce `projectTable`, ya sin fichas de PNJ, notas del DM
  ni combatientes sin revelar (un PNJ oculto **no está** en el objeto, no está
  escondido dentro de él);
- los blobs de los assets que esa vista nombra, y sólo cuando la mesa los pide.
  Los retratos dejan de viajar en base64 dentro del estado.

`app/src/transport/` define la interfaz; `BroadcastChannelTransport` es la
única implementación hoy. Un relé para una tele en otra habitación rellenaría
los mismos cuatro métodos sin tocar ningún panel.

La **ficha** (`/pj#<enlace>`) es la segunda frontera, con la misma disciplina.
`projectPlayer` da a un móvil su personaje entero — hoja, estado, objetos que
lleva — y de los demás exactamente la lista de combatientes de la tele,
partida en `party` y `foes`: los PG de otro PJ siguen la regla de revelado de la
pantalla de la sala, y un PNJ sin revelar no está. La nota del DM sobre el
personaje no cruza. Lo que un jugador puede *hacer* es la lista de
`shared/session/allow.ts`: su propia vida — PG, temporales, estados, espacios,
oro, inventario, cargas de lo que lleva — y nada de la mesa.

## Qué hace

Cinco pantallas para jugar y dos detrás del menú `⋯` para abrir y cerrar.

**Mesa** — lo que hay en la pantalla ahora mismo, y quién va después.

- Escena o tablero: el mismo sitio, un interruptor. `field.mode` ya modelaba
  las dos como una sola cosa.
- El escenario de la consola **es** la tele, en los dos modos: el mismo arte
  con el mismo fundido, o el tablero con las fichas bajo la mano. La escena se
  elige en `Escenas ▾`, en la barra, en vez de gastar la pantalla en una
  rejilla de miniaturas. El arte se ve **entero** en las dos ventanas y en los
  dos modos: encaja en el hueco que ocupa el tablero en vez de rellenarlo
  recortando, así que cambiar de escena a tablero no cambia de tamaño la
  imagen y la tele no se come el borde de un mapa cuadrado.
- Escena: arte a pantalla completa con fundido, ambiente sonoro y documentos
  (imágenes y PDF).
- Tablero: rejilla sobre el mapa, fichas arrastrables y medición en metros
  (1 casilla = 1,5 m, la diagonal cuenta como recta). Dos herramientas y nada
  más. La medida vive en la ventana del DM mientras arrastras y no llega a la
  tele: no es estado de la partida, es una pregunta.
- La rejilla la fija la escena. `scenarios/*.json` puede traer su `grid`, y al
  poner la escena en pantalla pasa a ser **la** rejilla — no un número que la
  proyección le cambiaba a la tele por su cuenta.
- La iniciativa va al lado, no en otra pestaña: ronda, turno, PG, daño y
  revelado por PNJ (oculto / barra / PG exactos) sin apartar el tablero. Pulsa
  un nombre y su ficha entra sobre la barra lateral.
- **Estar en la mesa es tener ficha**, y son la misma cosa: la barra lista a
  quien está en el tablero, ni más ni menos. `+ Añadir` abre una lista con la
  party, los PNJ que ya están y los de la campaña — quien entra ahí sale en
  las dos — y el `⊗` junto a la cara saca a esa persona de la barra, del
  tablero, del combate y de la tele de una vez: la pantalla de mesa lista a
  quien tiene ficha y está revelado, no a quien está en la sesión. La ficha
  se queda, con sus PG, para volver a sentarla. Para que los jugadores no vean a alguien
  que sí está, está el revelado de siempre (◉ / ○); no hace falta un tercer
  estado de «presente pero sin ficha», que es lo que había.
- **Iniciar combate pregunta.** Antes metía a todo el mundo y tiraba d20 por
  los PNJ; ahora abre una hoja con los de la mesa, todos marcados, y desmarcas
  a quien mire desde la barrera. Las casillas de iniciativa **empiezan
  vacías**: las escribes tú, ⏎ baja a la siguiente, y el dado de cada fila sólo
  tira si lo pulsas. La app ya no tira nada por su cuenta.
- **La barra de acción**, debajo de la fila de quien va. Trae lo que esa
  criatura sabe hacer *leído de su nota*: `pnj/bandido.md` dice «+3 al ataque,
  1d6+1 de daño cortante» y ahí sale «Cimitarra +3 · 1d6+1». Para la party lo
  mismo, desde el `-fc5.xml`: las armas y los conjuros que sí tienen números
  — ataque de conjuro, salvación con CD, o curación.
  - Eliges la acción y **el tablero se arma**: cada ficha que pulses entra en
    la acción con un anillo rojo, y pulsarla otra vez la saca. Un cono son
    tres clics y una sola tirada de daño.
  - Cada casilla tiene su dado al lado, como en «Iniciar combate»: **lo tiras
    tú o lo tira el botón**, y lo que escribas manda. Un 20 dobla los dados y
    lo dice; un 1 falla.
  - Lo que sale es una **previsualización** — «Impacta · 18 vs CA 12 · 5 → 4
    PG» — y no toca nada hasta que le das a **Aplicar**. El veredicto es una
    sugerencia: el `⇄` lo cambia, porque el Escudo que se acaba de lanzar no
    está en ninguna hoja.
  - Un conjuro **gasta su espacio** al aplicarlo, y lo dice en la bitácora.
    Puedes desmarcarlo (rituales, la tirada gratis de *Iniciado en la magia*).
  - La bitácora se queda con **todo, fallos incluidos**: leída después, una
    pelea es sobre todo gente que no acierta.
  - Lo que la nota no escribe en números — «El agua lo cierra todo», Misil
    Mágico — **no sale en la lista**. Sigue en Rasgos, y se lleva a mano.
- La nota de lectura de la escena queda fijada abajo.
- **Congelar la mesa**: la pantalla de los jugadores se queda con el último
  fotograma mientras preparas lo siguiente — colocar fichas, cargar un reparto,
  cambiar de escena — así que no ven un telón anunciando que pasa algo, sino una
  escena normal. La consola avisa con una banda roja de qué siguen viendo, para
  que no se te olvide descongelar.

**Party** — la party y lo que lleva encima.

- El **enlace para los jugadores**, con «Copiar» y «Nuevo enlace», y «Añadir
  personaje» para subir una ficha `-fc5.xml` en nombre de alguien. Cada
  tarjeta puede **sustituir la ficha** (una subida de nivel: el estado vivo se
  conserva) o **quitar al personaje de la campaña**.
- PG, CA, oro, espacios de conjuro, equipo y descansos.
- Las seis características con su modificador, y las tiradas que dependen de
  la hoja: iniciativa, competencia y percepción pasiva. Todo sale del
  `-fc5.xml`; el modificador es aritmética sobre una puntuación dada, no una
  regla recalculada.
- Los números mandan desde la línea que la propia hoja declara autoritativa
  («si algún número de la app no coincide con los de arriba, mandan los de
  arriba»), así que la iniciativa de quien tiene *Alerta* sale bien y la CA es
  la final, no la base de la armadura.
- Los objetos viven en quien los lleva: dar, quitar y gastar cargas desde su
  propia tarjeta. Una carga se gasta pulsándola, igual que un espacio de
  conjuro — y volver a pulsar una apagada la devuelve. La descripción de
  `objects/*.md` se abre con `ⓘ` en vez de estar siempre desplegada.
- Repartir es lo secundario aquí: el catálogo entero está en **Objetos**.

**PNJ** — el reparto de la campaña, con su ficha.

- Todos los `pnj/*.md`, agrupados por su `tag` y con buscador que entra también
  en los rasgos y en la nota.
- CA, PG, velocidad, iniciativa y rasgos sin tener que sentar a nadie en el
  tablero primero, que era la única forma de verlos.
- Quien no tiene PG en su nota sale igualmente, marcado **sólo trato**: es
  alguien con quien se habla, y la pantalla lo dice en vez de ofrecerlo para
  un combate donde no cabe.
- Lo único que escribe es la *sesión*: añadir N copias a la mesa. La
  preparación no se toca.

**Objetos** — todo lo que existe en la campaña, no sólo lo que alguien lleva.

- Una balda de fichas pequeñas: nombre, quién lo lleva y cargas restantes, que
  es lo que se busca de un vistazo. Pulsa una y la hoja trae la descripción,
  los efectos y la nota — la misma hoja que abre Party.
- Incluye los que no tiene nadie y los ya destruidos, que antes se caían de
  todas las listas.
- Es el sitio donde se reparte, desde la hoja: dar a cualquiera de la mesa,
  quitar, gastar una carga o recargar.

**Notas** — `story/` y `mundo/` con `[[wikilinks]]` navegables, backlinks,
filtro por `#etiqueta` y búsqueda.

**⋯ · Cerrar sesión** — genera la nota de `bitacora/` desde la plantilla de la
mesa y propone las desviaciones para `estado.md`, con vista previa antes de
escribir.

> Si Obsidian tiene la bóveda abierta sobre los mismos ficheros, cierra los
> que se van a escribir antes de darle. La app lo avisa en esa pantalla.

**⋯ · Preparación** — el reparto de PNJ de cada escena.

## Cómo lee el vault

Nada de la preparación hay que cambiarlo. La app adopta los formatos que ya
existen:

| Fichero | Qué saca |
|---|---|
| `scenarios/*.json` | escena, arte, rejilla, nota de lectura, reparto |
| `pnj/*.md` | CA, PG, iniciativa, rasgos, retrato y `alias` en el front matter; la nota, debajo. Un rasgo que escriba daño («+3 al ataque, 1d6+1 de daño») sale además como acción |
| `objects/*.md` | `mods.ac`, `usos` y efectos en el front matter; la nota, debajo |
| `story/**.md`, `mundo/**.md` | las notas |
| `.pergamino/campaign.json` | el identificador con que el servidor conoce la campaña |

Los personajes **no** se leen de la carpeta: son filas del servidor, hechas de
la ficha `-fc5.xml` que sube cada jugador — PG máximos, iniciativa, espacios,
armas, conjuros, rasgos, equipo y competencias, todo **calculado** por quien la
generó. Una carpeta `players/` que siga ahí es material (trasfondos, guías, el
json del creador), alcanzable como notas y nunca leído como party.

Un PNJ y un objeto son **notas de Obsidian**: la ficha va en el front matter y
la prosa debajo, en un solo fichero. Antes eran dos — `monsters/galo.json` y
`story/gente/galo.md` — que decían lo mismo con distintas palabras y había que
mantener a mano. Un PNJ sin `hpMax` es alguien con quien sólo se habla: sale en
las notas, pero no se sienta en el tablero.

### `alias`: el nombre que oye la mesa

```yaml
id: tulio
alias: Soldado ahogado
```

Un enemigo con nombre propio es un cabo de la historia, y leerlo en la pantalla
lo regala antes de tiempo. Con `alias`, la pantalla de mesa dice *Soldado
ahogado* y la consola sigue diciendo *Tulio* — que es lo que hace falta para
saber cuál de los tres lleva la medalla y los 16 PG. La ficha de la consola
avisa con **«La mesa ve: …»**, y el botón `A` de su fila en el raíl destapa el
nombre cuando toca (`N`, y otra vez `A` para volver a taparlo). Es una decisión
de partida, así que se guarda en `field.reveal` del `session.json`, no en la
nota: la nota sólo dice cuál es la máscara.

Como una máscara buena es la que no se distingue de las de al lado, los nombres
chocan. Gana el nombre de verdad — quien no lleva máscara se llama en las dos
pantallas exactamente igual — y los tapados cogen el siguiente número libre:
*Soldado ahogado*, *Soldado ahogado 1* y Tulio como *Soldado ahogado 2*. La
bitácora es de la consola, así que ahí sigue apuntando lo que hizo Tulio.

Los PG de los PJ salen del `-fc5.xml` que sube el jugador — el que genera
`pregenerados/fightclub.py`, o el que exporta Fight Club 5 —, no de recalcular
las reglas: así la Dureza Enana de El yunque (11 PG, no 10) sale bien sola. Lo
único que la app suma es una habilidad que la hoja marca como competente pero
no cita con número: característica más el bonificador de competencia que la
propia hoja declara, y la fila lo dice (`derived`). La línea de la hoja, cuando
la hay, manda.

### Ya no hay `session.json`

El estado vivo está en el servidor, con un número de revisión por acción, y
la carpeta de la mesa no guarda ninguno. `runs/<mesa>/` conserva la bitácora,
el `estado.md` y la plantilla; un `session.json` viejo se puede borrar. «Nueva
sesión» archiva el estado en el servidor y vuelve a sentar a la party.

## Dos cosas que el esquema del vault mezclaba

- **La nota de preparación se perdía.** La nota del DM sobre un PNJ y la nota
  viva de esa copia concreta son campos distintos que el esquema viejo colapsaba
  en uno, así que instanciar un monstruo borraba su nota. Aquí `note` es la viva
  y la de preparación se resuelve por `file` — que ahora es la ruta de la nota,
  así que la ficha lleva a la nota entera con un clic.
- **Las cargas no son del portador.** La Lágrima de Milia tiene «cinco usos en
  total, acumulados a lo largo de toda la aventura», así que viven en
  `session.objects`, no en quien la lleve: pasarla de mano no la recarga.

## Desarrollo

```bash
npm test             # 324 aquí, 192 donde no está el vault de Juli
npm run typecheck
npm run build
```

Las pruebas se parten según lo que tenga la máquina:

- Lo que se apoya en **`MemoryVault`** (`test/memory.ts`) o en una SQLite en
  memoria (`server/src/*.test.ts`) corre en cualquier sitio: el guardián del
  alcance de escritura, las funciones asíncronas, y el servidor entero —
  sesión, rutas y socket. Eso es lo que corre en CI.
- **El vault real de Juli** (`../dnd/talasia`), abierto de sólo lectura. Es lo
  que comprueba que mover los módulos puros a `shared/` no cambió nada, y es
  privado: no está en ningún runner. Por eso esas pruebas se llaman
  `*.vault.test.ts` y `vitest.config.ts` las deja fuera cuando el vault no
  está, diciéndolo en voz alta en vez de fallar entero.

Las rutas se pueden mover con `VAULT_ROOT`, `WORLD` y `CAMPAIGN`;
`test/roots.ts` prueba las ubicaciones habituales.

### Los scripts

Conducen la app con un navegador y dejan capturas en `/tmp/dmshots`:

```bash
npm run dev &
node scripts/e2e.mjs              # todos, en orden
node scripts/tour.mjs             # una captura por pantalla
node scripts/e2e-mesa.mjs         # escenas, documentos, tablero, y las dos ventanas
node scripts/e2e-party.mjs        # objetos, ficha del objeto, descansos
node scripts/e2e-catalogo.mjs     # los catálogos de PNJ y de objetos
node scripts/e2e-notas.mjs        # índice, enlaces muertos, búsqueda
node scripts/e2e-congelar.mjs     # la mesa congelada frente a la consola
node scripts/e2e-preparacion.mjs  # el reparto de una escena, y el bloqueo
node scripts/e2e-pj.mjs           # un móvil y la consola sobre la misma campaña
```

Abren la app con `?fixture=example`, que monta `app/src/fixtures/example.json`
en memoria: el selector nativo de carpetas no se puede conducir desde un
script, y así no hay ningún vault que proteger. La campaña de demostración se
registra en el servidor de desarrollo con un identificador fijo, que se borra y
se vuelve a crear en cada arranque — y `e2e.mjs` levanta un servidor en memoria
si no hay ninguno escuchando. Ese fixture es **sólo de
desarrollo** — el `build` de producción no lo lleva. Es además la única copia
de la campaña de demostración que queda en el repo, así que trátalo como
contenido y no como salida de build. Se regenera apuntándolo a una carpeta:

```bash
node scripts/build-fixture.mjs ruta/a/una/campaña
```

`e2e-mesa.mjs` comprueba además lo que hace seguro alojar esto: la ventana de
mesa **no hace ninguna petición de red por contenido de campaña**.

### La comprobación que ya no es un script

`acceptance-writes.mjs` jugaba una sesión contra una copia del vault y
comprobaba por hash que nada fuera de `runs/<mesa>/` había cambiado. Sin
servidor no hay nada que conducir desde fuera, así que esa garantía vive ahora
en `scope.test.ts` — y, contra el vault de verdad, se hace a mano:

```bash
# juega un rato con la carpeta real abierta, cierra la sesión, y:
git -C ~/Documents/juli/dnd status
# sólo pueden aparecer ficheros bajo runs/<mesa>/
```

## Estructura

```
shared/                  todo el núcleo: lo comparten el navegador y las pruebas
  pathish.ts             el trozo de node:path que hacía falta, en POSIX
  types.ts, actions.ts   tipos y acciones
  grid.ts, conditions.ts geometría y estados
  combat/
    dice.ts              1d6+1: leer, tirar, doblar en un crítico
    attacks.ts           qué sabe hacer cada uno, leído de su propia prosa
    resolve.ts           de lo que hay en las casillas a lo que ha pasado
  vault/
    source.ts            VaultDir / WritableVaultDir — la costura
    binding.ts           CampaignVault: forma, campañas, mesas, los dos descensos
    memory.ts            vault en memoria (pruebas, e2e, fixture)
    node.ts              vault sobre node:fs (sólo pruebas)
    campaign.ts          escenas, monstruos, objetos, personajes
    session.ts           carga, migración y persistencia de session.json
    sheet.ts             PG, iniciativa, espacios, armas y conjuros del -fc5.xml
    notes.ts             índice de notas, wikilinks, backlinks, etiquetas
    render.ts            markdown → HTML con wikilinks navegables
    writeback.ts         bitácora y estado.md
  session/
    reducer.ts           transiciones puras — corren en el servidor
    project.ts           estado → vista del DM / vista de la mesa
    player.ts            estado → la vista de un jugador
    allow.ts             lo que un jugador puede hacer
    projection.ts        el contexto de una proyección y el fotograma congelado
    seat.ts              sentar a la party
    portraits.ts         retratos por fichero de monstruo
  protocol.ts            todo lo que cruza el cable

app/
  index.html             la consola          →  /
  tv.html                la pantalla de mesa →  /tv
  src/
    vault/fsa.ts         VaultDir sobre FileSystemDirectoryHandle
    vault/open.ts        selector, permisos, handle en IndexedDB
    net/                 el cliente REST y el socket que se reconecta
    state/remoteStore.ts el estado tal como lo manda el servidor
    state/publish.ts     lo que la carpeta publica, y lo que recorta
    transport/           la interfaz y BroadcastChannelTransport
    assets/              key → objectURL, y las dos fuentes de bytes
    dm/                  Mesa · Party · PNJ · Objetos · Notas
                         (+ Sesión y Preparación en ⋯)
    table/               la pantalla de mesa
    board/               tablero compartido por las dos ventanas
    fixtures/            la campaña de demostración (sólo desarrollo)
    strings/es.ts        todos los textos

server/                  Node + SQLite: personajes, estado vivo, las páginas
  src/campaign.ts        una campaña viva: reduce, guarda, difunde
  src/http.ts, ws.ts     la API y el socket
  src/static.ts          el host estático que era server.py
  build.mjs              esbuild → server/dist/index.mjs, un fichero para la Pi
deploy/                  la unidad de systemd y el .env de ejemplo
test/                    fixtures de las pruebas
scripts/                 los drivers de Playwright y dev.mjs

scripts/migrate-pnj.mjs  fusiona el formato viejo (json + nota aparte) en éste
check-campaign.js        linter del formato anterior — ver lint/README.md
lint/                    lo que ese linter necesita — no es código de la app
```

En el repo no hay contenido de campaña: las campañas son carpetas que el DM
elige al abrir la app.

Los textos visibles están en castellano y en un solo fichero; el código, los
identificadores y los nombres de fichero, en inglés.

La Pi ejecuta Node: un solo fichero, `server/dist/index.mjs`, sin
`node_modules`, bajo `dm-app.service`.
