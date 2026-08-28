# Pantalla de DM

Consola de dirección para campañas de D&D. Dos ventanas en la misma máquina:
la **consola** en el portátil del DM y la **pantalla de mesa** en la tele.

| Ventana | Ruta | Qué ve |
|---|---|---|
| Consola | `/` | Todo: fichas de PNJ, notas secretas, PNJ ocultos, preparación |
| Mesa | `/tv` | Sólo lo revelado: arte de escena, tablero, marcador, documentos |

**Los ficheros no salen de tu ordenador.** La consola abre tu carpeta con la
File System Access API y la lee y la escribe desde el navegador. El servidor
sólo sirve las dos páginas: no hay ninguna ruta que lea ni escriba un fichero
de campaña, y ninguna que reciba uno. Por eso se puede alojar en público sin
publicar la campaña de nadie.

Eso tiene un precio: **hace falta Chrome, Edge u otro navegador Chromium.**
Firefox y Safari no implementan esa API todavía, y la app lo dice en vez de
fallar de forma rara.

## Arrancar

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Abre la consola, pulsa **Abrir carpeta de campaña** y elige tu mundo
(`talasia/`) o una campaña suelta (`marea-baja/`). Desde ahí, **Abrir
pantalla de mesa** para la segunda ventana; arrástrala a la tele.

El navegador recuerda la carpeta entre recargas, pero el permiso caduca: al
volver, la consola ofrece **Reabrir** y basta un clic para recuperarlo.

En producción son ficheros estáticos servidos por `server.py`:

```bash
npm run build
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
Sólo dos descensos resuelven un `WritableVaultDir`:

- `runs/<mesa>/` mientras se juega
- `scenarios/` desde **Preparación**, cerrada mientras haya partida en marcha

`shared/vault/scope.test.ts` lo comprueba sobre un vault en memoria que anota
qué handles se pidieron con permiso de escritura y dónde cayó cada escritura.

Y como esa regla sólo cubre *dónde* se escribe, no *en qué vault*, las pruebas
abren el vault real de sólo lectura (`test/fixture.ts`): el handle lanza antes
de tocar un byte, en vez de que una comprobación lo atrape.
`shared/vault/readonly.vault.test.ts` conduce el store a propósito y comprueba que
`session.json` no cambia.

## Las dos ventanas

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

## Qué hace

Cinco pantallas para jugar y dos detrás del menú `⋯` para abrir y cerrar.

**Mesa** — lo que hay en la pantalla ahora mismo, y quién va después.

- Escena o tablero: el mismo sitio, un interruptor. `field.mode` ya modelaba
  las dos como una sola cosa.
- El escenario de la consola **es** la tele, en los dos modos: el mismo arte
  con el mismo fundido, o el tablero con las fichas bajo la mano. La escena se
  elige en `Escenas ▾`, en la barra, en vez de gastar la pantalla en una
  rejilla de miniaturas. La consola encaja el arte entero en el mismo hueco
  que ocupa el tablero, así que cambiar de modo no cambia de tamaño la imagen;
  la tele sí la recorta a pantalla completa, que para eso es una tele.
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
- **Quién está en el tablero** es cosa tuya, ficha a ficha. `+ Añadir` abre una
  lista con la party, los PNJ que ya están en la mesa y los de la campaña
  (estos entran en la mesa al añadirlos), y cada fila de la barra lleva un `⊗`
  que quita esa ficha del tablero sin sacar a nadie del combate ni de la mesa.
- **Iniciar combate pregunta.** Antes metía a todo el mundo y tiraba d20 por
  los PNJ; ahora abre una hoja con todos, marcados los que están en el tablero
  — el PNJ que aún no ha saltado sale listado y sin marcar, a un clic de
  entrar. Las casillas de iniciativa **empiezan vacías**: las escribes tú,
  ⏎ baja a la siguiente, y el dado de cada fila sólo tira si lo pulsas. La app
  ya no tira nada por su cuenta.
- La nota de lectura de la escena queda fijada abajo.
- **Congelar la mesa**: la pantalla de los jugadores se queda con el último
  fotograma mientras preparas lo siguiente — colocar fichas, cargar un reparto,
  cambiar de escena — así que no ven un telón anunciando que pasa algo, sino una
  escena normal. La consola avisa con una banda roja de qué siguen viendo, para
  que no se te olvide descongelar.

**Party** — la party y lo que lleva encima.

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
| `pnj/*.md` | CA, PG, iniciativa, rasgos y retrato en el front matter; la nota, debajo |
| `objects/*.md` | `mods.ac`, `usos` y efectos en el front matter; la nota, debajo |
| `players/*.md` | la party compartida de la campaña: nombre, retrato y quién es |
| `runs/<mesa>/players/*.md` | la party de esa mesa, que **tapa** la anterior por id |
| `players/*-fc5.xml` | PG máximos, iniciativa y espacios **calculados** |
| `story/**.md`, `mundo/**.md` | las notas |
| `runs/<mesa>/session.json` | el estado vivo |

Un PNJ y un objeto son **notas de Obsidian**: la ficha va en el front matter y
la prosa debajo, en un solo fichero. Antes eran dos — `monsters/galo.json` y
`story/gente/galo.md` — que decían lo mismo con distintas palabras y había que
mantener a mano. Un PNJ sin `hpMax` es alguien con quien sólo se habla: sale en
las notas, pero no se sienta en el tablero.

Los PG de los PJ salen del `-fc5.xml` que genera `pregenerados/fightclub.py`, no
de recalcular las reglas: así la Dureza Enana de El yunque (11 PG, no 10) sale
bien sola.

Las dos capas de `players/`: la campaña comparte una party y cada mesa puede
tener la suya, que tapa la de arriba por id. El vault de Juli usa sólo la capa
de mesa; la campaña de demostración usaba sólo la de campaña, que es como se
descubrió que faltaba.

### `session.json`: v2/v3/v4 → v5

Se adopta el esquema del vault tal cual y se amplía. Al abrir una mesa se migra
en memoria y, la primera vez que se reescribe, se deja el original al lado como
`session.json.bak`.

`field.paused` cambia de significado: en el esquema viejo bajaba un telón; aquí
congela la sincronización y la pantalla de mesa mantiene su último fotograma.

Lo que añade v4:

- `field.handout` — documento en pantalla
- `objects` — cargas por objeto, no por portador
- `log` — el registro que alimenta la bitácora
- `field.reveal` pasa a indexarse por `Ref` (`npc:<id>`), como `field.tokens`

Y v5: cada PNJ sentado apuntaba a `monsters/<id>.json`; ahora apunta a su nota,
`pnj/<id>.md`, que es la misma ruta con la que esa nota está en el índice.

`field.fog` y `field.templates` eran de v4 y ya no se leen: las herramientas
que los escribían no están. Un fichero viejo los conserva hasta la siguiente
escritura, y el `.bak` conserva el original de todas formas.

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
npm test             # 172 aquí, 41 donde no está el vault de Juli
npm run typecheck
npm run build
```

Las pruebas se parten según lo que tenga la máquina:

- Lo que se apoya en **`MemoryVault`** (`test/memory.ts`) corre en cualquier
  sitio: el guardián del alcance de escritura y las trece funciones asíncronas.
  Eso es lo que corre en CI.
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
```

Abren la app con `?fixture=example`, que monta `app/src/fixtures/example.json`
en memoria: el selector nativo de carpetas no se puede conducir desde un
script, y así no hay ningún vault que proteger. Ese fixture es **sólo de
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
  vault/
    source.ts            VaultDir / WritableVaultDir — la costura
    binding.ts           CampaignVault: forma, campañas, mesas, los dos descensos
    memory.ts            vault en memoria (pruebas, e2e, fixture)
    node.ts              vault sobre node:fs (sólo pruebas)
    campaign.ts          escenas, monstruos, objetos, personajes
    session.ts           carga, migración y persistencia de session.json
    sheet.ts             PG, iniciativa y espacios desde el -fc5.xml
    notes.ts             índice de notas, wikilinks, backlinks, etiquetas
    render.ts            markdown → HTML con wikilinks navegables
    writeback.ts         bitácora y estado.md
  session/
    store.ts             estado autoritativo, difusión y persistencia
    reducer.ts           transiciones puras
    project.ts           estado → vista del DM / vista de la mesa
    portraits.ts         retratos por fichero de monstruo

app/
  index.html             la consola          →  /
  tv.html                la pantalla de mesa →  /tv
  src/
    vault/fsa.ts         VaultDir sobre FileSystemDirectoryHandle
    vault/open.ts        selector, permisos, handle en IndexedDB
    transport/           la interfaz y BroadcastChannelTransport
    assets/              key → objectURL, y las dos fuentes de bytes
    dm/                  Mesa · Party · PNJ · Objetos · Notas
                         (+ Sesión y Preparación en ⋯)
    table/               la pantalla de mesa
    board/               tablero compartido por las dos ventanas
    fixtures/            la campaña de demostración (sólo desarrollo)
    strings/es.ts        todos los textos

server.py                host estático: dos páginas, assets, /api/ping
test/                    fixtures de las pruebas
scripts/                 los drivers de Playwright

scripts/migrate-pnj.mjs  fusiona el formato viejo (json + nota aparte) en éste
check-campaign.js        linter del formato anterior — ver lint/README.md
lint/                    lo que ese linter necesita — no es código de la app
```

En el repo no hay contenido de campaña: las campañas son carpetas que el DM
elige al abrir la app.

Los textos visibles están en castellano y en un solo fichero; el código, los
identificadores y los nombres de fichero, en inglés.

`engines.node` es sólo para desarrollo: la Pi no ejecuta Node, sólo
`server.py`.
