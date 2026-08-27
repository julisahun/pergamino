/* Escenas — preparation: a picture, two sound layers, a board size, who is
   standing on it, and a note to yourself.

   A scene is not play. Putting one on the table copies its picture and its
   sound into the field and seats its roster; the scene itself never changes,
   so the same ambush can be run twice, and throwing a session away never costs
   a night's preparation.

   What a scene deliberately does NOT decide is what the television is showing.
   That is one stated control in Juego. A scene supplies the picture; the DM
   decides whether the players are looking at a picture at all. */

/** @import { Scene } from '../shared/types.js' */

import { html } from '../html.js';
import { state, commit, update, urlFor, aspectOf } from './store.js';
import { normaliseScene, blankScene, putOnTable, missingAssets,
         sceneGridSize } from '../shared/scenes.js';
import { saveEntityFile, deleteEntityFile, layerBadge, moveAction } from './entities.js';
import { moveLayer } from './layers.js';
import { matchesFilter } from '../shared/util.js';

export function Escenas() {
  if (state.ui.sceneDraft) return html`<${Editor} />`;

  const filter = state.ui.filters.escenas;
  const shown = state.scenes
    .filter(s => matchesFilter(`${s.name} ${s.note}`, filter))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const liveId = state.session.field.sceneId;

  return html`<section class="tab">
    <div class="bar">
      <h2 class="dsp">Escenas <small>${state.scenes.length}</small></h2>
      ${state.scenes.length > 3 && html`<input class="filter" type="search"
        placeholder="Buscar…" defaultValue=${filter}
        onInput=${(/** @type {Event} */ e) => update(s => {
          s.ui.filters.escenas = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        })} />`}
      <button class="primary" onClick=${() => update(s => { s.ui.sceneDraft = blankScene(); })}>
        + Nueva escena
      </button>
    </div>

    ${!state.scenes.length && html`<p class="empty">
      Ninguna. Una escena es preparación: un fondo, sonido, una cuadrícula y
      quién está encima.
    </p>`}

    <div class="scenes">
      ${shown.map(sc => {
        const missing = missingAssets(sc, state.assetPaths);
        return html`<article class=${'scene' + (sc.id === liveId ? ' live' : '')} key=${sc.id}>
          <div class="thumb" style=${sc.art && urlFor(sc.art.src)
            ? { backgroundImage: `url("${urlFor(sc.art.src)}")` } : undefined}>
            ${!(sc.art && urlFor(sc.art.src)) && html`<span class="fine">sin imagen</span>`}
          </div>
          <div class="who">
            <b class="dsp">${sc.name}</b>
            ${sc.id === liveId && html`<span class="mesa-tag">en la mesa</span>`}
            ${layerBadge(sc.file) && html`<span class="mesa-tag">${layerBadge(sc.file)}</span>`}
            <span class="fine">
              ${sc.roster.length} ${sc.roster.length === 1 ? 'figura' : 'figuras'}
              ${sc.cols ? ` · ${sc.cols} columnas` : ''}
              ${sc.audio?.music ? ' · música' : ''}${sc.audio?.ambience ? ' · ambiente' : ''}
            </span>
            ${missing.length > 0 && html`<p class="warn">Falta: ${missing.join(', ')}</p>`}
            ${sc.note && html`<p class="note-line">${sc.note}</p>`}
          </div>
          <div class="acts">
            <button class="primary" onClick=${() => toTable(sc)}>A la mesa</button>
            <button class="link" onClick=${() => update(s => {
              s.ui.sceneDraft = structuredClone(sc);
            })}>editar</button>
            ${(() => {
              const move = moveAction(sc);
              return move && html`<button class="link" title=${move.title}
                onClick=${() => moveLayer('scenarios', sc, scenePayload(sc), move.to, rel => {
                  update(s => {
                    const at = s.scenes.findIndex(x => x.id === sc.id);
                    if (at >= 0) s.scenes[at] = { ...sc, file: rel };
                  });
                })}>${move.label}</button>`;
            })()}
          </div>
        </article>`;
      })}
    </div>

    ${liveId && html`<p><button class="link" onClick=${() => toTable(null)}>
      Sin escena — quitar imagen y sonido
    </button></p>`}
  </section>`;
}

/** The one scene action there is. It writes the field: the picture, the sound,
    the board size and the roster. It does not change the mode, does not touch
    the fight, and does not move you to another tab.
    @param {Scene|null} sc */
function toTable(sc) {
  commit(sc ? `poner ${sc.name} en la mesa` : 'quitar la escena', s => {
    putOnTable(s.session, sc, { aspectOf, urlFor });
  });
}

/* ---------------------------------------------------------------- editor */

function Editor() {
  const d = state.ui.sceneDraft;
  const set = (/** @type {(sc: any) => void} */ fn) => update(s => { fn(s.ui.sceneDraft); });
  const images = state.assetPaths.filter(p => /\.(jpe?g|png|webp|gif|avif)$/i.test(p));
  const sounds = state.assetPaths.filter(p => /\.(mp3|ogg|m4a|wav|flac)$/i.test(p));
  const size = sceneGridSize(d, state.session.field, aspectOf, urlFor);

  return html`<section class="tab editor">
    <div class="bar">
      <h2 class="dsp">${d.file ? 'Editar escena' : 'Nueva escena'}</h2>
      <button class="link" onClick=${() => update(s => { s.ui.sceneDraft = null; })}>
        Cancelar
      </button>
      <button class="primary" onClick=${save}>Guardar</button>
    </div>

    <label class="f">
      <span>Nombre</span>
      <input defaultValue=${d.name} onChange=${(/** @type {Event} */ e) => {
        const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        set(sc => { sc.name = v; });
      }} />
    </label>

    <div class="grid2">
      <label class="f">
        <span>Imagen</span>
        <select value=${d.art?.src ?? ''} onChange=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
          set(sc => { sc.art = v ? { src: v } : null; });
        }}>
          <option value="">— ninguna —</option>
          ${images.map(p => html`<option value=${p} key=${p}>${p}</option>`)}
        </select>
      </label>
      <label class="f">
        <span>Columnas <small class="fine">las filas salen de la imagen: ${size.rows}</small></span>
        <input type="number" min="4" max="60" defaultValue=${d.cols ?? ''}
          placeholder=${String(state.session.field.cols)}
          onChange=${(/** @type {Event} */ e) => {
            const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
            set(sc => { sc.cols = v.trim() ? Math.min(60, Math.max(4, Number(v))) : null; });
          }} />
      </label>
    </div>

    ${['music', 'ambience'].map(layer => html`<div class="grid2" key=${layer}>
      <label class="f">
        <span>${layer === 'music' ? 'Música' : 'Ambiente'}</span>
        <select value=${d.audio?.[layer]?.src ?? ''} onChange=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
          set(sc => {
            sc.audio = sc.audio || { music: null, ambience: null };
            sc.audio[layer] = v ? { src: v, volume: sc.audio[layer]?.volume ?? .5, loop: true } : null;
            if (!sc.audio.music && !sc.audio.ambience) sc.audio = null;
          });
        }}>
          <option value="">— nada —</option>
          ${sounds.map(p => html`<option value=${p} key=${p}>${p}</option>`)}
        </select>
      </label>
      <label class="f">
        <span>Volumen <small class="fine">${Math.round((d.audio?.[layer]?.volume ?? .5) * 100)}%</small></span>
        <input type="range" min="0" max="1" step="0.05"
          defaultValue=${String(d.audio?.[layer]?.volume ?? .5)}
          disabled=${!d.audio?.[layer]}
          onInput=${(/** @type {Event} */ e) => {
            const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
            set(sc => { if (sc.audio?.[layer]) sc.audio[layer].volume = v; });
          }} />
      </label>
    </div>`)}

    <h4>Reparto <small class="fine">quién está puesto cuando la escena llega a la mesa</small></h4>
    ${d.roster.map((/** @type {any} */ r, /** @type {number} */ i) => html`
      <div class="ability" key=${i}>
        <select value=${r.beastId} onChange=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
          set(sc => { sc.roster[i].beastId = v; });
        }}>
          ${state.session.bestiary.map(b => html`<option value=${b.id} key=${b.id}>${b.name}</option>`)}
        </select>
        <input type="number" defaultValue=${r.x} title="columna"
          onChange=${(/** @type {Event} */ e) => {
            const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
            set(sc => { sc.roster[i].x = Math.max(0, v); });
          }} />
        <input type="number" defaultValue=${r.y} title="fila"
          onChange=${(/** @type {Event} */ e) => {
            const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
            set(sc => { sc.roster[i].y = Math.max(0, v); });
          }} />
        <button class="link" onClick=${() => set(sc => { sc.roster.splice(i, 1); })}>quitar</button>
      </div>`)}
    ${state.session.bestiary.length
      ? html`<button onClick=${() => set(sc => {
          sc.roster.push({ beastId: state.session.bestiary[0].id, x: 0, y: 0, objects: [] });
        })}>+ figura</button>`
      : html`<p class="fine">No hay PNJ en la campaña todavía.</p>`}

    <label class="f">
      <span>Nota</span>
      <textarea rows="3" defaultValue=${d.note} onChange=${(/** @type {Event} */ e) => {
        const v = /** @type {HTMLTextAreaElement} */ (e.currentTarget).value;
        set(sc => { sc.note = v; });
      }}></textarea>
    </label>

    ${d.file && html`<p><button class="link danger" onClick=${async () => {
      if (await deleteEntityFile(d)) {
        update(s => {
          s.scenes = s.scenes.filter(x => x.id !== d.id);
          s.ui.sceneDraft = null;
        });
      }
    }}>Borrar escena</button></p>`}
  </section>`;
}

/** The envelope is written even though a bare object reads: a file that says
    what it is stays readable by a person a year from now.
    @param {Scene} scene */
const scenePayload = scene => ({
  kind: 'dnd-dm-scene', version: 1,
  scene: { id: scene.id, name: scene.name, art: scene.art, audio: scene.audio,
           roster: scene.roster, grid: scene.cols ? { cols: scene.cols } : null,
           note: scene.note },
});

function save() {
  const draft = state.ui.sceneDraft;
  if (!draft) return;
  const scene = normaliseScene(draft);
  saveEntityFile('scenarios', scene, scenePayload(scene), rel => {
    scene.file = rel;
    update(s => {
      const at = s.scenes.findIndex(x => x.id === scene.id);
      if (at >= 0) s.scenes[at] = scene;
      else s.scenes.push(scene);
    });
  });
  update(s => { s.ui.sceneDraft = null; });
}
