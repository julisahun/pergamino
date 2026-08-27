/* Juego — the table itself: what the television is showing, the fight if there
   is one, and the board the DM arranges it on.

   Three panels, in the order they matter during play. The mirror at the top is
   what the players are looking at; the board at the bottom is what the DM is
   moving. They are the same component and the same payload, asked for with two
   different audiences — never two renderers that resemble each other. */

import { html, h } from '../html.js';
import { state, commit, tweak, update, urlFor } from './store.js';
import { MODES, modeLabel } from '../shared/field.js';
import { Tablero } from '../shared/view/tablero.js';
import { mirrorProjection, dmProjection, openTV } from './broadcast.js';
import { Fight, Muster, Initiative } from './combate.js';
import { applyMove } from '../shared/combat.js';
import { deriveRows } from '../shared/field.js';
import { saveBinary, wrote, flash } from './store.js';
import { layerPath, layersOf } from '../shared/runs.js';

/* ------------------------------------------------------------------ tele
   The one control that decides what the players are looking at, with a mirror
   of the payload the television actually holds beside it. They sit together on
   purpose: a control whose effect you cannot see is how the old app grew four
   invisible board states nobody could name. */

export function Tele() {
  const f = state.session.field;
  return html`<section class="tele">
    <div class="tele-head">
      <h2 class="dsp">La tele</h2>
      <span class="tele-state">
        <b>${modeLabel(f.mode)}</b>
        ${f.hud ? ' · con fichas' : ''}
        ${f.paused ? ' · en pausa' : ''}
      </span>
      <button onClick=${openTV} title="Abre (o trae al frente) la ventana del tablero">
        Tablero ↗
      </button>
    </div>

    <div class="modes" role="group" aria-label="Qué muestra la tele">
      ${MODES.map(m => html`<button
        key=${m.key}
        class=${'mode' + (f.mode === m.key ? ' on' : '')}
        aria-pressed=${f.mode === m.key ? 'true' : 'false'}
        title=${m.hint}
        onClick=${() => setMode(m.key)}>${m.es}</button>`)}
    </div>

    <label class="check">
      <input type="checkbox" checked=${f.hud}
        onChange=${() => commit(f.hud ? 'quitar las fichas de la tele' : 'poner las fichas en la tele',
          s => { s.session.field.hud = !s.session.field.hud; })} />
      Fichas de los personajes y turnos en pantalla
    </label>

    <label class="check">
      <input type="checkbox" checked=${f.paused}
        onChange=${() => tweak(s => { s.session.field.paused = !s.session.field.paused; })} />
      En pausa — la tele conserva lo último que le llegó
    </label>

    <div class="mirror" aria-label="Lo que hay en la tele">
      ${h(Tablero, { p: mirrorProjection(), urlFor })}
    </div>
    ${state.tvTrouble && html`<p class="warn">${state.tvTrouble}</p>`}
  </section>`;
}

/** Changing what the television shows is a deliberate act with a name, so it
    is an undo step like any other. It writes `mode` and nothing else: it does
    not clear the scene, does not move you to another tab, and decides nothing
    about the fight. @param {import('../shared/types.js').FieldMode} mode */
function setMode(mode) {
  if (state.session.field.mode === mode) return;
  commit(`poner la tele en ${modeLabel(mode).toLowerCase()}`,
    s => { s.session.field.mode = mode; });
}

/* ----------------------------------------------------------- dropped maps
   An image dropped on the board becomes the picture: downscaled to 1920px and
   written into assets/maps/ as a real file.

   It asks which layer, like every other write — even mid-combat, even in a
   hurry. A map dropped during a fight is exactly the write most likely to be
   the wrong one to share with every other mesa, so it is the one least worth
   guessing about. And it does NOT change the mode: you dropped a picture, you
   did not ask to put it on the players' screen. */

/** @param {File} file */
export function readMapImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(1920, img.naturalWidth);
      const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d')?.drawImage(img, 0, 0, w, h);
      cv.toBlob(blob => {
        if (!blob) { flash('No pude convertir esa imagen.'); return; }
        const rel = `assets/maps/${Date.now()}.jpg`;
        const put = (/** @type {'campaign'|'run'} */ layer) => {
          const path = layerPath(state.run, layer, rel);
          saveBinary(path, blob);
          tweak(s => {
            const f = s.session.field;
            f.map = { src: path };
            f.rows = deriveRows(f.cols, w / h);
            /* The scene it came from is no longer what is up there, and the
               field says so — but the MODE is still the DM's. */
            f.sceneId = null;
          });
          wrote('El mapa', path);
        };
        if (layersOf(state.run).length < 2) { put('campaign'); return; }
        update(s => {
          s.ui.pendingSave = {
            folder: 'assets/maps', entity: { id: rel, name: 'El mapa' },
            payload: null, then: null, blob, put,
          };
        });
      }, 'image/jpeg', .82);
    };
    img.onerror = () => flash('No pude leer esa imagen.');
    img.src = String(reader.result);
  };
  reader.onerror = () => flash('No se pudo leer el archivo.');
  reader.readAsDataURL(file);
}

/* ---------------------------------------------------------------- board
   The DM's own board: the same component the television draws, asked for with
   audience 'dm' so hidden creatures are there to be dragged. The mirror above
   shows what the players see; this is what the DM arranges. */

function Board() {
  const f = state.session.field;
  return html`<section class="board-panel">
    <div class="bar">
      <h2 class="dsp">Tablero</h2>
      <label class="size">
        <span class="fine">columnas</span>
        <input type="number" min="4" max="60" defaultValue=${f.cols}
          onChange=${(/** @type {Event} */ e) => {
            const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
            /* Not an undo step: resizing the grid is arranging furniture, and
               ⟲ should still undo the last thing that happened to a creature. */
            tweak(s => { s.session.field.cols = Math.min(60, Math.max(4, v || 24)); });
          }} />
      </label>
      <label class="size">
        <span class="fine">filas</span>
        <input type="number" min="4" max="40" defaultValue=${f.rows}
          onChange=${(/** @type {Event} */ e) => {
            const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
            tweak(s => { s.session.field.rows = Math.min(40, Math.max(4, v || 14)); });
          }} />
      </label>
    </div>
    <div class="board" aria-label="El tablero del director"
      onDragOver=${(/** @type {DragEvent} */ e) => e.preventDefault()}
      onDrop=${(/** @type {DragEvent} */ e) => {
        const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        readMapImage(file);
      }}>
      ${h(Tablero, {
        p: { ...dmProjection(), mode: 'tablero' },
        urlFor,
        api: {
          selected: state.ui.selectedToken,
          onSelect: (/** @type {string|null} */ ref) =>
            update(s => { s.ui.selectedToken = ref; }),
          /* A drag is not an undo step, in either window: ⟲ after moving a
             token should undo the damage before it, not the walking. */
          onMove: (/** @type {string} */ ref, /** @type {number} */ x, /** @type {number} */ y) =>
            tweak(s => { applyMove(s.session, ref, x, y); }),
        },
      })}
    </div>
    <p class="fine">
      Arrastra para mover; un toque enciende el alcance. Lo escondido se ve
      aquí, marcado — en la tele no existe. Suelta una imagen encima para
      usarla de mapa.
    </p>
  </section>`;
}

export function Juego() {
  return html`<section class="tab">
    <${Tele} />
    <${Fight} />
    <${Board} />
    ${state.ui.modal === 'muster' && html`<${Modal}><${Muster} /></${Modal}>`}
    ${state.ui.modal === 'init' && html`<${Modal}><${Initiative} /></${Modal}>`}
  </section>`;
}

/** One frame for every modal: a scrim that closes on click, and a box that
    does not. @param {{children: any}} props */
function Modal({ children }) {
  return html`<div class="scrim" onClick=${() => update(s => { s.ui.modal = null; })}>
    <div class="modal" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
      ${children}
    </div>
  </div>`;
}
