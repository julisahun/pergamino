/* Objetos — the catalog of things a creature can be carrying.

   An object is a name, a description, up to five numeric modifiers, and
   free-text effect lines. The five are the only numbers this app computes;
   everything else an item does is a line the DM reads and applies. That is a
   deliberate ceiling: "+1 to attack rolls" is shown, not calculated, because
   the alternative is a rules engine with an opinion about every item ever
   written.

   Holders keep ids. Duplicates stack. */

/** @import { ItemDef } from '../shared/types.js' */

import { html } from '../html.js';
import { state, commit, update } from './store.js';
import { normaliseObject, MOD_KEYS, modSummary } from '../shared/objects.js';
import { saveEntityFile, deleteEntityFile, layerBadge, moveAction } from './entities.js';
import { moveLayer } from './layers.js';
import { matchesFilter } from '../shared/util.js';
import { newId } from '../rules/character.js';
import { partyHandles } from '../shared/handles.js';

export function Objetos() {
  const filter = state.ui.filters.objetos;
  const shown = state.session.objects
    .filter(o => matchesFilter(`${o.name} ${o.description} ${o.effects.join(' ')}`, filter))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return html`<section class="tab">
    <div class="bar">
      <h2 class="dsp">Objetos <small>${state.session.objects.length}</small></h2>
      ${state.session.objects.length > 3 && html`<input class="filter" type="search"
        placeholder="Buscar…" defaultValue=${filter}
        onInput=${(/** @type {Event} */ e) => update(s => {
          s.ui.filters.objetos = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        })} />`}
      <button class="primary" onClick=${() => openEditor(null)}>+ Nuevo objeto</button>
    </div>

    ${!state.session.objects.length && html`<p class="empty">
      El catálogo está vacío. Un objeto puede sumar CA, PG máximos, iniciativa,
      velocidad o percepción pasiva; lo demás son líneas que lee el director.
    </p>`}

    <div class="items">
      ${shown.map(o => html`<article class="item-card" key=${o.id}>
        <div class="who">
          <b class="dsp">${o.name}</b>
          ${layerBadge(o.file) && html`<span class="mesa-tag">${layerBadge(o.file)}</span>`}
          ${modSummary(o.mods) && html`<span class="fine">${modSummary(o.mods)}</span>`}
          ${o.description && html`<p class="note-line">${o.description}</p>`}
          ${o.effects.map(e => html`<p class="effect" key=${e}>${e}</p>`)}
        </div>
        <div class="acts">
          <${GiveTo} obj=${o} />
          <button class="link" onClick=${() => openEditor(o)}>editar</button>
          ${(() => {
            const move = moveAction(o);
            return move && html`<button class="link" title=${move.title}
              onClick=${() => moveLayer('objects', o, o, move.to, rel => {
                commit(`mover ${o.name}`, s => {
                  const at = s.session.objects.findIndex(x => x.id === o.id);
                  if (at >= 0) s.session.objects[at] = { ...o, file: rel };
                });
              })}>${move.label}</button>`;
          })()}
        </div>
      </article>`)}
    </div>

    ${state.ui.modal === 'object' && html`<${ObjectEditor} />`}
  </section>`;
}

/** Handing one over. A holder keeps ids, so giving the same ring twice is two
    rings. @param {{obj: ItemDef}} props */
function GiveTo({ obj }) {
  const party = partyHandles(state.session);
  const npcs = state.session.npcs;
  return html`<select class="give" onChange=${(/** @type {Event} */ e) => {
    const sel = /** @type {HTMLSelectElement} */ (e.currentTarget);
    const ref = sel.value;
    sel.value = '';
    if (!ref) return;
    commit(`dar ${obj.name}`, s => {
      const [kind, id] = ref.split(':');
      const holder = kind === 'pc' ? s.session.play[id] : s.session.npcs.find(n => n.id === id);
      if (holder) holder.objects = [...holder.objects, obj.id];
    });
  }}>
    <option value="">dar a…</option>
    ${party.map(cb => html`<option value=${cb.ref} key=${cb.ref}>${cb.name}</option>`)}
    ${npcs.map(n => html`<option value=${'npc:' + n.id} key=${n.id}>${n.name}</option>`)}
  </select>`;
}

/* ---------------------------------------------------------------- editor */

/** @param {ItemDef|null} obj */
function openEditor(obj) {
  update(s => {
    s.ui.modal = 'object';
    s.ui.objectDraft = obj
      ? structuredClone(obj)
      : normaliseObject({ id: newId(), name: '' });
  });
}

const close = () => update(s => { s.ui.modal = null; s.ui.objectDraft = null; });

function ObjectEditor() {
  const d = state.ui.objectDraft;
  if (!d) return null;
  const set = (/** @type {(o: any) => void} */ fn) => update(s => { fn(s.ui.objectDraft); });

  return html`<div class="scrim" onClick=${close}>
    <div class="modal" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
      <h3 class="dsp">${d.file ? 'Editar objeto' : 'Nuevo objeto'}</h3>
      <label class="f">
        <span>Nombre</span>
        <input defaultValue=${d.name} onChange=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
          set(o => { o.name = v; });
        }} />
      </label>
      <label class="f">
        <span>Descripción</span>
        <textarea rows="2" defaultValue=${d.description} onChange=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLTextAreaElement} */ (e.currentTarget).value;
          set(o => { o.description = v; });
        }}></textarea>
      </label>

      <h4>Lo que suma <small class="fine">las cinco cosas que la app calcula</small></h4>
      <div class="grid2">
        ${MOD_KEYS.map(([key, label]) => html`<label class="f" key=${key}>
          <span>${label}</span>
          <input type="number" defaultValue=${d.mods[key] ?? ''}
            onChange=${(/** @type {Event} */ e) => {
              const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
              set(o => { if (v) o.mods[key] = v; else delete o.mods[key]; });
            }} />
        </label>`)}
      </div>

      <h4>Efectos <small class="fine">una línea cada uno; se muestran, no se calculan</small></h4>
      ${d.effects.map((/** @type {string} */ eff, /** @type {number} */ i) => html`
        <div class="ability" key=${i}>
          <input defaultValue=${eff} onChange=${(/** @type {Event} */ e) => {
            const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
            set(o => { o.effects[i] = v; });
          }} />
          <button class="link" onClick=${() => set(o => { o.effects.splice(i, 1); })}>quitar</button>
        </div>`)}
      <button onClick=${() => set(o => { o.effects.push(''); })}>+ efecto</button>

      <div class="modal-foot">
        ${d.file && html`<button class="link danger" onClick=${async () => {
          if (await deleteEntityFile(d)) {
            commit(`borrar ${d.name}`, s => {
              s.session.objects = s.session.objects.filter(o => o.id !== d.id);
            });
            close();
          }
        }}>Borrar</button>`}
        <button class="link" onClick=${close}>Cancelar</button>
        <button class="primary" onClick=${save}>Guardar</button>
      </div>
    </div>
  </div>`;
}

function save() {
  const draft = state.ui.objectDraft;
  if (!draft) return;
  const obj = normaliseObject(draft);
  saveEntityFile('objects', obj, obj, rel => {
    commit(`guardar ${obj.name}`, s => {
      obj.file = rel;
      const at = s.session.objects.findIndex(o => o.id === obj.id);
      if (at >= 0) s.session.objects[at] = obj;
      else s.session.objects.push(obj);
    });
  });
  close();
}
