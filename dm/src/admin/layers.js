/* Which layer a save goes to — asked, every time, when there is a choice.

   With two layers, «Guardado» on its own is the sentence that made the old app
   confusing: half of it wrote run-local and half wrote shared, from the same
   screen, with nothing on screen saying which. So:

     · a campaign with one layer (flat, or preparation-only) never asks;
     · a campaign with two asks on EVERY write — new entities and edits alike,
       a map dropped mid-combat included;
     · and the flash afterwards names the file and the layer out loud.

   Saving «a la campaña» something this mesa has its own copy of PROMOTES it:
   the shared file is written and the run-local one is trashed. Leaving both
   would mean the copy you just made keeps shadowing the one you just saved,
   which is a trap rather than a feature. */

/** @import { Layer } from '../shared/types.js' */

import { html } from '../html.js';
import { state, update, saveEntity, wrote, flash } from './store.js';
import { deleteFile } from './disk.js';
import { layerPath, layerOf, layersOf, isMine, LAYER_WORDS } from '../shared/runs.js';
import { slugify } from '../shared/util.js';

/** A save waiting for its answer. `put` is for the writes that are not JSON —
    a dropped map — where the caller already knows how to write the bytes and
    only the layer is in question.
    @typedef {{folder: string, entity: {id: string, name: string, file?: string},
               payload: unknown, then?: ((rel: string) => void)|null,
               blob?: Blob, put?: (layer: Layer) => void}} PendingSave */

/**
 * Save an entity, asking which layer when there is a question to ask.
 * @param {string} folder 'monsters' | 'objects' | 'scenarios'
 * @param {{id: string, name: string, file?: string}} entity
 * @param {unknown} payload what actually goes in the file
 * @param {(rel: string) => void} [then] runs with the path it landed in
 */
export function saveAsking(folder, entity, payload, then) {
  if (layersOf(state.run).length < 2) {
    /* One layer: there is nothing to ask, and a modal that always has the same
       answer is a modal nobody reads. */
    commitSave(folder, entity, payload, 'campaign', then);
    return;
  }
  update(s => { s.ui.pendingSave = { folder, entity, payload, then }; });
}

/** @param {string} folder @param {{id: string, name: string, file?: string}} entity
    @param {unknown} payload @param {Layer} layer @param {(rel: string) => void} [then] */
async function commitSave(folder, entity, payload, layer, then) {
  const rel = layerPath(state.run, layer, `${folder}/${slugify(entity.name)}.json`);
  /* An entity that already lives in this layer keeps the path it arrived on:
     renaming a monster must not leave two files behind. */
  const target = entity.file && layerOf(state.run, entity.file) === layer ? entity.file : rel;

  /* Promoting: the run-local copy would otherwise go on shadowing the campaign
     file that was just written. */
  let promoted = null;
  if (layer === 'campaign' && entity.file && layerOf(state.run, entity.file) === 'run') {
    try {
      const { trashedTo } = await deleteFile(/** @type {any} */ (state.root), entity.file);
      promoted = trashedTo;
    } catch { /* already gone — nothing to promote away from */ }
  }

  saveEntity(target, payload);
  then?.(target);
  if (promoted) {
    flash(`${entity.name} guardado en ${target} — ${LAYER_WORDS.campaign.said}; `
      + `la copia de esta mesa se ha movido a ${promoted}.`);
  } else {
    wrote(entity.name, target);
  }
}

/** The two-button question. Deliberately not a dropdown with a remembered
    default: the whole point is that the answer is visible every time. */
export function LayerModal() {
  const p = state.ui.pendingSave;
  if (!p) return null;
  const shadowing = p.entity.file && layerOf(state.run, p.entity.file) === 'run';

  const pick = (/** @type {Layer} */ layer) => {
    update(s => { s.ui.pendingSave = null; });
    if (p.put) p.put(layer);
    else commitSave(p.folder, p.entity, p.payload, layer, p.then ?? undefined);
  };

  return html`<div class="scrim" onClick=${() => update(s => { s.ui.pendingSave = null; })}>
    <div class="modal narrow" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
      <h3 class="dsp">¿Dónde guardo ${p.entity.name || 'esto'}?</h3>
      <p class="fine">
        La campaña la comparten todas las mesas. Lo que guardes sólo aquí tapa
        la versión de la campaña mientras juegue esta mesa, y no la toca.
      </p>
      <div class="layer-choice">
        <button class="primary" onClick=${() => pick('campaign')}>
          <b>A la campaña</b>
          <span class="fine">
            ${targetPath(p, 'campaign')}
            ${shadowing ? ' · y se quita la copia de esta mesa' : ''}
          </span>
        </button>
        <button onClick=${() => pick('run')}>
          <b>Sólo a esta mesa</b>
          <span class="fine">${targetPath(p, 'run')}</span>
        </button>
      </div>
      <p><button class="link"
        onClick=${() => update(s => { s.ui.pendingSave = null; })}>Cancelar</button></p>
    </div>
  </div>`;
}

/** What the button says it will write. A dropped map already knows its own
    name; an entity is named after itself.
    @param {PendingSave} p @param {Layer} layer */
const targetPath = (p, layer) => (p.put
  ? layerPath(state.run, layer, `${p.folder}/…jpg`)
  : layerPath(state.run, layer, `${p.folder}/${slugify(p.entity.name)}.json`));

/* -------------------------------------------------------------- deleting
   From inside a mesa you may delete that mesa's own files. The campaign's
   preparation is deleted from preparation-only mode, where there is no table
   to be halfway through — which is also the only place the DM is thinking
   about the campaign rather than about tonight. */

/** @param {{name: string, file?: string}} entity */
export function canDelete(entity) {
  if (!entity.file) return { ok: false, why: 'todavía no está en ningún archivo.' };
  const layer = layerOf(state.run, entity.file);
  if (state.run.prep) {
    /* Preparation-only mode is where the shared campaign is edited, and the
       only place it can be deleted from — there is no table halfway through
       to break. Another mesa's files are not its business. */
    return layer === 'campaign'
      ? { ok: true, why: '' }
      : { ok: false, why: 'es de una mesa, y aquí no hay ninguna abierta.' };
  }
  if (!state.run.path) return { ok: true, why: '' };   // flat: one layer, no question
  return layer === 'run' && isMine(state.run, entity.file)
    ? { ok: true, why: '' }
    : { ok: false, why: 'es de la campaña: se borra desde «Sólo preparación».' };
}

/** Move an entity the other way: a copy for this mesa, or a promotion to the
    campaign. Both are ordinary saves with the layer already decided.
    @param {string} folder @param {{id: string, name: string, file?: string}} entity
    @param {unknown} payload @param {Layer} to @param {(rel: string) => void} [then] */
export const moveLayer = (folder, entity, payload, to, then) =>
  commitSave(folder, entity, payload, to, then);
