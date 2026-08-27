/* Saving and deleting an entity — a monster, an object, a scene.

   Everything that writes one of those goes through here, so there is exactly
   one place that decides WHICH FILE it lands in — and with two layers, that
   decision is the DM's rather than the app's. See layers.js for the question
   and for what promoting does; `wrote()` names the file and the layer out loud
   either way, which is invariant 6. */

/** @import { Layer } from '../shared/types.js' */

import { state, flash } from './store.js';
import { deleteFile } from './disk.js';
import { layerPath, layerOf, layersOf } from '../shared/runs.js';
import { slugify } from '../shared/util.js';
import { saveAsking, canDelete } from './layers.js';

/** Where an entity of this kind and name lives, in this layer.
    @param {string} folder @param {string} name @param {Layer} layer */
export const pathFor = (folder, name, layer) =>
  layerPath(state.run, layer, `${folder}/${slugify(name)}.json`);

/**
 * Write one entity, asking which layer when the campaign has two. `then` runs
 * with the path it actually landed in — which is why a caller cannot assume
 * one: the answer arrives after a person has answered it.
 * @param {string} folder 'monsters' | 'objects' | 'scenarios'
 * @param {{id: string, name: string, file?: string}} entity
 * @param {unknown} payload what actually goes in the file
 * @param {(rel: string) => void} [then]
 */
export function saveEntityFile(folder, entity, payload, then) {
  saveAsking(folder, entity, payload, then);
}

/**
 * Trash one entity's file. Deletes are moves into `trash/`, never unlinks, so
 * a mistake at the table is a file to drag back rather than a night's work
 * gone.
 * @param {{name: string, file?: string}} entity
 */
export async function deleteEntityFile(entity) {
  if (!state.root || !entity.file) return false;
  const may = canDelete(entity);
  if (!may.ok) {
    flash(`No se puede borrar ${entity.name}: ${may.why}`);
    return false;
  }
  try {
    const { trashedTo } = await deleteFile(state.root, entity.file);
    flash(`${entity.name} movido a ${trashedTo}.`);
    return true;
  } catch (e) {
    flash(`No se pudo borrar ${entity.file}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/** Whether this campaign has a layer question to ask at all. */
export const twoLayers = () => layersOf(state.run).length > 1;

/** The words for where a file lives, for a badge on a card. @param {string} [file] */
export const layerBadge = file =>
  (!file || !twoLayers() ? null : layerOf(state.run, file) === 'run' ? 'esta mesa' : 'campaña');

/** The one move that makes sense for where this entity currently is: something
    shared can be copied down to this mesa, and something this mesa owns can be
    promoted up. Null when there is nowhere to move it — one layer, or no file.
    @param {{file?: string}} entity */
export function moveAction(entity) {
  if (!twoLayers() || !entity.file) return null;
  return layerOf(state.run, entity.file) === 'run'
    ? { to: /** @type {Layer} */ ('campaign'), label: 'mover a la campaña',
        title: 'Deja de ser sólo de esta mesa: pasa a compartirse, y la copia local se retira.' }
    : { to: /** @type {Layer} */ ('run'), label: 'copiar a esta mesa',
        title: 'Una copia sólo para esta mesa. La de la campaña se queda como está, tapada mientras juegue.' };
}
