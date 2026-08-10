/* Escenas — the library and its full-screen editor. The library is prep,
   but it carries the one play action too: "Al tablero" on every card puts
   the scene on the television and lands you in Juego — between scenes the
   DM is *here*, and a detour through Juego's picker asked them to find the
   scene twice. Juego's own picker still exists and reuses SceneCard.
   (Preparar — the old staged-scene flow — was cut in the rebuild: one
   action, "Al tablero", is all there is.)

   Every scene lives in its own scenarios/<slug>.json; Guardar autosaves it
   there, Quitar moves the file to trash/. */

import { html } from './html.js';
import { state, update, flash, saveEntity, aspectOf, urlFor } from './store.js';
import { deleteFile } from './api.js';
import { screens } from './app.js';
import { ModalFrame, closeModal } from './frame.js';
import { Field, initialsOf } from './field.js';
import { goLiveScene } from './juego.js';
import { ObjectCountRows } from './objetos.js';
import { blankScene, normaliseScene, deriveRows, sceneGridSize, missingAssets } from '../shared/scenes.js';
import { heldObjects } from '../shared/objects.js';
import { matchesFilter, slugify } from '../shared/util.js';

export const sceneById = id => state.scenes.find(s => s.id === id) || null;

/** The scene file's portable shape: the envelope, without the runtime `file`
    key — where it lives on disk IS that information. */
export function sceneFilePayload(scene) {
  const { file, ...portable } = scene;
  return { kind: 'dnd-dm-scene', version: 1, scene: portable };
}

export function exportScene(scene) {
  const blob = new Blob([JSON.stringify(sceneFilePayload(scene), null, 2)],
                        { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (slugify(scene.name)) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ------------------------------------------------------------ the card */

/** `configOnly` is Escenas's own view: edit/export/delete. Without it (the
    Juego picker) the card also carries Al tablero — `onGoLive` supplies it. */
export function SceneCard({ scene, configOnly, onGoLive }) {
  const src = scene.art?.src ? urlFor(scene.art.src) : null;
  const gone = missingAssets(scene, state.assets);
  const live = state.session.field.live && state.session.field.sceneId === scene.id;
  return html`<article class=${'scenecard' + (live ? ' on' : '')} key=${scene.id}>
    ${src && !gone.length
      ? html`<div class="thumb" style=${`background-image:url("${src}")`}>
          ${live ? html`<span class="badge">en el tablero</span>` : null}</div>`
      : html`<div class="thumb none">${gone.length ? 'falta el archivo' : 'sin imagen'}
          ${live ? html`<span class="badge">en el tablero</span>` : null}</div>`}
    <div class="meta">
      <b>${scene.name}</b>
      ${gone.length ? html`<span class="gone">No encuentro ${gone.join(', ')}</span>` : null}
    </div>
    <div class="acts">
      ${onGoLive ? html`<button class="small primary" onClick=${() => onGoLive(scene)}>Al tablero</button>` : null}
      <button class="small ghost" onClick=${() => openEditor(scene.id)}>Editar</button>
      <button class="small ghost" onClick=${() => exportScene(scene)}>Exportar</button>
      ${configOnly ? html`<button class="small ghost" onClick=${() => removeScene(scene)}>Quitar</button>` : null}
    </div>
  </article>`;
}

function removeScene(scene) {
  update(s => { s.scenes = s.scenes.filter(x => x.id !== scene.id); });
  if (scene.file) {
    deleteFile(state.root, scene.file)
      .then(r => flash(`${scene.name} quitada — el archivo queda en ${r.trashedTo}.`))
      .catch(e => flash('No se pudo quitar el archivo: ' + e.message));
  }
}

/* ----------------------------------------------------------- the editor */

export function openEditor(sceneId) {
  const existing = sceneId && sceneById(sceneId);
  update(s => {
    s.ui.editingSceneId = sceneId || 'new';
    s.ui.editorDraft = existing ? normaliseScene(structuredClone(existing)) : blankScene();
    if (existing) s.ui.editorDraft.file = existing.file;
  });
}

const closeEditor = () => update(s => { s.ui.editingSceneId = null; s.ui.editorDraft = null; });

function saveDraft() {
  const d = normaliseScene(state.ui.editorDraft);
  d.file = state.ui.editorDraft.file || ('scenarios/' + slugify(d.name) + '.json');
  update(s => {
    const at = s.scenes.findIndex(x => x.id === d.id);
    if (at >= 0) s.scenes[at] = d; else s.scenes.push(d);
    s.ui.editingSceneId = null;
    s.ui.editorDraft = null;
  });
  saveEntity(d.file, sceneFilePayload(d));
  flash(`${d.name} guardada.`);
}

/* --------------------------------------------- what a roster entry carries

   The same counts-Map picker Juego's cards use, but it confirms into the
   editor draft — prep, not play: no commit, no clampHP, nothing on the
   board until the scene actually goes live. */

function openRosterObjects(i) {
  const r = state.ui.editorDraft?.roster[i];
  if (!r) return;
  const counts = new Map();
  for (const id of r.objects || []) counts.set(id, (counts.get(id) || 0) + 1);
  update(s => { s.ui.modal = () => RosterObjectPicker(i, counts); });
}

function RosterObjectPicker(i, counts) {
  const r = state.ui.editorDraft?.roster[i];
  if (!r) return null;
  const b = state.session.bestiary.find(x => x.id === r.beastId);
  const total = [...counts.values()].reduce((a, n) => a + n, 0);
  const confirmPick = () => update(s => {
    const entry = s.ui.editorDraft?.roster[i];
    if (entry) {
      const ids = [];
      for (const o of s.session.objects) {
        for (let n = counts.get(o.id) || 0; n > 0; n--) ids.push(o.id);
      }
      entry.objects = ids;
    }
    s.ui.modal = null;
  });
  return html`<${ModalFrame} title=${'Objetos de ' + (b?.name || 'ese PNJ')} acts=${html`
      <span class="count">${total ? `${total} objeto${total === 1 ? '' : 's'}` : 'Nada encima'}</span>
      <button class="ghost" onClick=${closeModal}>Cancelar</button>
      <button class="primary" onClick=${confirmPick}>Guardar</button>`}>
    <${ObjectCountRows} counts=${counts} />
  </>`;
}

/** The nearest free square to the top-left among this scene's own roster, so
    adding "Goblin" three times lands three of them on three squares. */
function freeRosterSquare(roster, size) {
  const taken = new Set(roster.map(r => r.x + ',' + r.y));
  for (let y = 0; y < size.rows; y++) {
    for (let x = 0; x < size.cols; x++) if (!taken.has(x + ',' + y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

function RosterBoard({ d }) {
  const size = sceneGridSize(d, state.session.field, aspectOf, urlFor);
  const src = d.art?.src ? urlFor(d.art.src) : null;
  const tokens = d.roster
    .map((r, i) => ({ r, i, beast: state.session.bestiary.find(b => b.id === r.beastId) }))
    .filter(o => o.beast)
    .map(o => ({ key: String(o.i), x: o.r.x, y: o.r.y,
                 name: o.beast.name, initials: initialsOf(o.beast.name), title: o.beast.name }));
  return html`<${Field} roster cols=${size.cols} rows=${size.rows} mapUrl=${src}
    tokens=${tokens}
    onMove=${(key, x, y) => update(() => {
      const r = state.ui.editorDraft.roster[Number(key)];
      if (r) { r.x = x; r.y = y; }
    })} />`;
}

function Editor() {
  const d = state.ui.editorDraft;
  const isNew = !sceneById(d.id);
  const images = state.assets.filter(p => /\.(jpe?g|png|webp)$/i.test(p));
  const sounds = state.assets.filter(p => /\.(mp3|ogg|wav|m4a)$/i.test(p));
  const size = sceneGridSize(d, state.session.field, aspectOf, urlFor);

  const setAudio = (key, patch) => update(() => {
    const a = d.audio || (d.audio = { music: null, ambience: null });
    if (patch === null) {
      a[key] = null;
      if (!a.music && !a.ambience) d.audio = null;
    } else {
      a[key] = { src: '', volume: .5, loop: true, ...(a[key] || {}), ...patch };
    }
  });

  const audioPick = (key, label) => {
    const layer = d.audio?.[key];
    return html`<label>${label}
      <select onChange=${e => e.target.value ? setAudio(key, { src: e.target.value }) : setAudio(key, null)}>
        <option value="">— ninguno —</option>
        ${sounds.map(p => html`<option value=${p} selected=${layer?.src === p} key=${p}>${p}</option>`)}
      </select></label>
      ${layer ? html`<label>Volumen
        <input type="range" min="0" max="1" step="0.01" value=${layer.volume}
          onInput=${e => setAudio(key, { volume: Number(e.target.value) })} />
        <b>${Math.round(layer.volume * 100)}%</b></label>` : null}`;
  };

  return html`<main><section class="panel wide">
    <div class="quickadd">
      <button class="primary" onClick=${saveDraft}>Guardar</button>
      <button class="ghost" onClick=${() => exportScene(normaliseScene(d))}>Exportar</button>
      <button class="ghost" onClick=${closeEditor}>Volver</button>
    </div>
    <div class="escfields">
      <label>Nombre <input type="text" value=${d.name}
        onInput=${e => update(() => { d.name = e.target.value; })} /></label>
      <label>Nota <textarea defaultValue=${d.note}
        onChange=${e => update(() => { d.note = e.target.value; })}></textarea></label>

      <h3>Arte</h3>
      <label>Imagen
        <select onChange=${e => update(() => {
          d.art = e.target.value ? { src: e.target.value, stamp: null } : null;
        })}>
          <option value="">— ninguna —</option>
          ${images.map(p => html`<option value=${p} selected=${d.art?.src === p} key=${p}>${p}</option>`)}
        </select></label>

      <h3>Cuadrícula <span class="n">${d.grid ? `${size.cols} × ${size.rows}` : 'de la mesa'}</span></h3>
      <p class="tip">El tamaño del tablero para esta escena en concreto — vacío, y usa el que ya
        tenga la mesa en ese momento. Solo se elige el número de columnas: las filas salen solas
        de la proporción real de la imagen, para que los cuadros salgan siempre cuadrados.</p>
      <div class="row">
        <label>Columnas <input type="number" min="4" max="60" value=${d.grid?.cols ?? ''}
          onChange=${e => update(() => {
            const v = e.target.value.trim();
            d.grid = v && Number.isFinite(Number(v))
              ? { cols: Math.min(60, Math.max(4, Math.round(Number(v)))) } : null;
          })} /></label>
      </div>

      <h3>Sonido</h3>
      ${audioPick('music', 'Música')}
      ${audioPick('ambience', 'Ambiente')}

      <h3>Reparto <span class="n">${d.roster.length}</span></h3>
      <p class="tip">Quién espera en esta escena, y en qué cuadro — se sienta solo,
        con el mapa de esta escena, la primera vez que sale a la mesa. Arrastra
        una ficha para cambiarla de sitio, y «Objetos» decide qué lleva cada uno
        encima al aparecer.</p>
      ${state.session.bestiary.length ? html`<${RosterBoard} d=${d} />` : null}
      ${state.session.bestiary.length
        ? html`<div class="rosterpick">${state.session.bestiary.map(b => html`<div class="rprow" key=${b.id}>
            <b>${b.name}</b>${b.tag ? html`<span class="muted"> · ${b.tag}</span>` : null}
            <button class="small ghost" onClick=${() => update(() => {
              d.roster.push({ beastId: b.id, ...freeRosterSquare(d.roster, size), objects: [] });
            })}>+ Añadir</button>
          </div>`)}</div>`
        : html`<p class="muted">No hay PNJ todavía. Se escriben en${' '}
            <button class="link" onClick=${() => update(s => { s.ui.tab = 'monstruos'; })}>PNJ</button>.</p>`}
      ${d.roster.length ? html`<ul class="rosterlist">${d.roster.map((r, i) => {
          const b = state.session.bestiary.find(x => x.id === r.beastId);
          const held = heldObjects(state.session.objects, r.objects);
          return html`<li key=${i}>${b ? b.name : '(ese PNJ ya no existe)'}
            ${held.length ? html`<span class="muted"> · ${held
              .map(h => h.count > 1 ? `${h.obj.name} ×${h.count}` : h.obj.name).join(', ')}</span>` : null}
            <button class="small ghost" onClick=${() => openRosterObjects(i)}>Objetos</button>
            <button class="small ghost" aria-label="Quitar del reparto"
              onClick=${() => update(() => { d.roster.splice(i, 1); })}>✕</button></li>`;
        })}</ul>` : null}
    </div>
  </section></main>`;
}

/* ----------------------------------------------------------- the library */

function Library() {
  const n = state.scenes.length;
  const filter = state.ui.filters.escenas;
  const shown = n ? state.scenes.filter(s => matchesFilter(s.name, filter)) : [];
  return html`<main><section class="panel wide">
    <div class="quickadd">
      <button class="primary" onClick=${() => openEditor(null)}>Nueva escena</button>
    </div>
    ${n ? html`
      <div class="filterbar"><input type="text" placeholder="Buscar escena…"
        value=${filter} onInput=${e => update(s => { s.ui.filters.escenas = e.target.value; })} /></div>
      ${shown.length
        ? html`<div class="scenegrid">${shown.map(s => html`<${SceneCard} scene=${s} configOnly
            onGoLive=${goLiveScene} key=${s.id} />`)}</div>`
        : html`<p class="muted">Ninguna escena coincide con “${filter}”.</p>`}`
      : html`<div class="drop" onClick=${() => openEditor(null)}>
          <b>Ninguna escena todavía</b>
          Una escena es un fondo y una cuadrícula: un sitio donde estar, o un campo
          donde pelear. Se guardan de una en una en <code>scenarios/</code>, y las
          imágenes en <code>assets/</code>.
          <p class="muted" style="font-size:.85rem;margin:.8rem 0 0">
            Deja un <code>.json</code> en esa carpeta y aparece solo, o${' '}
            <button class="link">crea una desde cero</button> en el editor.</p>
        </div>`}
  </section></main>`;
}

function Escenas() {
  return state.ui.editingSceneId ? html`<${Editor} />` : html`<${Library} />`;
}

screens.escenas = Escenas;
