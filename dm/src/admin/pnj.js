/* PNJ — the bestiary: templates, not instances.

   An entry here is a card at a table, not a statblock: name, what kind of
   thing it is, armour class, hit points, an initiative modifier, a speed, a
   note the DM reads aloud, and the two or three abilities that actually come
   up. Everything else lives in the DM's own book.

   Loading one onto the table makes INSTANCES — `Goblin ×3` becomes three
   creatures with their own hit points — and that is a different act from
   putting them in a fight, which is a different act again from letting the
   players know they are there. */

/** @import { Beast } from '../shared/types.js' */

import { html } from '../html.js';
import { state, commit, update, urlFor, flash } from './store.js';
import { normaliseBeast } from '../shared/beasts.js';
import { loadNpc } from '../shared/combat.js';
import { saveEntityFile, deleteEntityFile, layerBadge, moveAction } from './entities.js';
import { moveLayer } from './layers.js';
import { matchesFilter, metres } from '../shared/util.js';
import { newId } from '../rules/character.js';

export function PNJ() {
  const filter = state.ui.filters.monstruos;
  /* By name, not by filename: what order the disk hands them back in is not
     something the DM should have to know about. */
  const shown = state.session.bestiary
    .filter(b => matchesFilter(`${b.name} ${b.tag} ${b.note}`, filter))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return html`<section class="tab">
    <div class="bar">
      <h2 class="dsp">PNJ <small>${state.session.bestiary.length}</small></h2>
      ${state.session.bestiary.length > 3 && html`<input class="filter" type="search"
        placeholder="Buscar…" defaultValue=${filter}
        onInput=${(/** @type {Event} */ e) => update(s => {
          s.ui.filters.monstruos = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        })} />`}
      <button class="primary" onClick=${() => openEditor(null)}>+ Nuevo PNJ</button>
    </div>

    ${!state.session.bestiary.length && html`<p class="empty">
      Ninguno todavía. Un PNJ es una ficha de mesa: nombre, CA, PG, un modificador
      de iniciativa y lo que haga falta leer en voz alta.
    </p>`}

    <div class="beasts">
      ${shown.map(b => html`<article class="beast" key=${b.id}>
        ${b.portrait && html`<img class="face" src=${urlFor(b.portrait.src || b.portrait.stamp) || ''} alt="" />`}
        <div class="who">
          <b class="dsp">${b.name}</b>
          ${b.tag && html`<span class="tag-lite">${b.tag}</span>`}
          ${layerBadge(b.file) && html`<span class="mesa-tag">${layerBadge(b.file)}</span>`}
          <span class="fine">CA ${b.ac} · ${b.hpMax} PG · ini ${b.initMod >= 0 ? '+' : ''}${b.initMod}
            ${b.speed != null ? ` · ${metres(b.speed)} m` : ''}</span>
          ${b.note && html`<p class="note-line">${b.note}</p>`}
        </div>
        <div class="acts">
          <${Loader} beast=${b} />
          <button class="link" onClick=${() => openEditor(b)}>editar</button>
          ${(() => {
            const move = moveAction(b);
            return move && html`<button class="link" title=${move.title}
              onClick=${() => moveLayer('monsters', b, b, move.to, rel => {
                commit(`mover ${b.name}`, s => {
                  const at = s.session.bestiary.findIndex(x => x.id === b.id);
                  if (at >= 0) s.session.bestiary[at] = { ...b, file: rel };
                });
              })}>${move.label}</button>`;
          })()}
        </div>
      </article>`)}
    </div>

    ${state.ui.modal === 'beast' && html`<${BeastEditor} />`}
  </section>`;
}

/** How many of this one to put on the table. Loading is not fighting: they
    arrive at the table, hidden, and the muster picker is where they join a
    fight. @param {{beast: Beast}} props */
function Loader({ beast }) {
  return html`<label class="loader">
    <input type="number" min="1" max="20" defaultValue="1" title="Cuántos" />
    <button onClick=${(/** @type {Event} */ e) => {
      const box = /** @type {HTMLInputElement} */ (
        /** @type {HTMLElement} */ (e.currentTarget).previousElementSibling);
      const n = Math.max(1, Math.min(20, Number(box.value) || 1));
      commit(`cargar ${n} × ${beast.name}`, s => { loadNpc(s.session, beast, n); });
      flash(`${n} × ${beast.name} en la mesa, escondidos. Entran en combate desde «Empezar combate».`);
    }}>a la mesa</button>
  </label>`;
}

/* ---------------------------------------------------------------- editor */

/** @param {Beast|null} beast */
function openEditor(beast) {
  update(s => {
    s.ui.modal = 'beast';
    s.ui.beastDraft = beast
      ? structuredClone(beast)
      : normaliseBeast({ id: newId(), name: '', ac: 10, hpMax: 1, initMod: 0, speed: 9 });
  });
}

function BeastEditor() {
  const d = state.ui.beastDraft;
  if (!d) return null;
  const set = (/** @type {(b: any) => void} */ fn) => update(s => { fn(s.ui.beastDraft); });
  const field = (/** @type {string} */ label, /** @type {string} */ key,
                 /** @type {string} */ type = 'text', /** @type {any} */ extra = {}) =>
    html`<label class="f">
    <span>${label}</span>
    <input type=${type} defaultValue=${d[key] ?? ''} ...${extra}
      onChange=${(/** @type {Event} */ e) => {
        const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        set(b => { b[key] = type === 'number' ? Number(v) : v; });
      }} />
  </label>`;

  return html`<div class="scrim" onClick=${close}>
    <div class="modal" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
      <h3 class="dsp">${d.file ? 'Editar PNJ' : 'Nuevo PNJ'}</h3>
      <div class="grid2">
        ${field('Nombre', 'name')}
        ${field('Tipo', 'tag')}
        ${field('CA', 'ac', 'number')}
        ${field('PG', 'hpMax', 'number')}
        ${field('Mod. iniciativa', 'initMod', 'number')}
        ${field('Velocidad (m)', 'speed', 'number')}
      </div>
      <label class="f">
        <span>Nota — lo que se lee en voz alta</span>
        <textarea rows="3" defaultValue=${d.note}
          onChange=${(/** @type {Event} */ e) => {
            const v = /** @type {HTMLTextAreaElement} */ (e.currentTarget).value;
            set(b => { b.note = v; });
          }}></textarea>
      </label>

      <h4>Habilidades</h4>
      ${d.abilities.map((/** @type {any} */ a, /** @type {number} */ i) => html`
        <div class="ability" key=${a.id}>
          <input defaultValue=${a.name} placeholder="Nombre"
            onChange=${(/** @type {Event} */ e) => {
              const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
              set(b => { b.abilities[i].name = v; });
            }} />
          <input defaultValue=${a.desc} placeholder="+4 al ataque, 1d6+2 perforante"
            onChange=${(/** @type {Event} */ e) => {
              const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
              set(b => { b.abilities[i].desc = v; });
            }} />
          <button class="link" onClick=${() => set(b => { b.abilities.splice(i, 1); })}>quitar</button>
        </div>`)}
      <button onClick=${() => set(b => {
        b.abilities.push({ id: newId(), name: '', desc: '' });
      })}>+ habilidad</button>

      <${Portrait} draft=${d} set=${set} />

      <div class="modal-foot">
        ${d.file && html`<button class="link danger" onClick=${async () => {
          if (await deleteEntityFile(d)) {
            commit(`borrar ${d.name}`, s => {
              s.session.bestiary = s.session.bestiary.filter(b => b.id !== d.id);
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

const close = () => update(s => { s.ui.modal = null; s.ui.beastDraft = null; });

function save() {
  const draft = state.ui.beastDraft;
  if (!draft) return;
  const beast = normaliseBeast(draft);
  saveEntityFile('monsters', beast, beast, rel => {
    commit(`guardar ${beast.name}`, s => {
      beast.file = rel;
      const at = s.session.bestiary.findIndex(b => b.id === beast.id);
      if (at >= 0) s.session.bestiary[at] = beast;
      else s.session.bestiary.push(beast);
    });
  });
  close();
}

/** A portrait, downscaled to 512px and stored inline in the entry's own file:
    a monster is then one file that travels, with its face in it.
    @param {{draft: any, set: (fn: (b: any) => void) => void}} props */
function Portrait({ draft, set }) {
  return html`<label class="f">
    <span>Retrato</span>
    <div class="portrait-row">
      ${draft.portrait && html`<img class="face big"
        src=${urlFor(draft.portrait.src || draft.portrait.stamp) || ''} alt="" />`}
      <input type="file" accept="image/*" onChange=${async (/** @type {Event} */ e) => {
        const file = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0];
        if (!file) return;
        const stamp = await downscale(file, 512);
        set(b => { b.portrait = { src: null, stamp }; });
      }} />
      ${draft.portrait && html`<button class="link"
        onClick=${() => set(b => { b.portrait = null; })}>quitar</button>`}
    </div>
  </label>`;
}

/** @param {File} file @param {number} max */
function downscale(file, max) {
  return new Promise((/** @type {(s: string) => void} */ resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d')?.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', .82));
    };
    img.onerror = () => reject(new Error('no se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}
