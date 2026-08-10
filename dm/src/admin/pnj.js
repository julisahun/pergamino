/* PNJ — the bestiary. Templates, not instances: this is the only place a
   creature is written down, and every entry lives in its own
   monsters/<slug>.json. Deleting one moves the file to trash/. */

import { html } from './html.js';
import { state, update, flash, saveEntity } from './store.js';
import { deleteFile } from './api.js';
import { screens } from './app.js';
import { Portrait } from './cards.js';
import { ModalFrame, closeModal } from './frame.js';
import { signed } from '../rules/engine.js';
import { newId } from '../rules/character.js';
import { normaliseBeast, absorbBeast } from '../shared/beasts.js';
import { metres, matchesFilter, slugify } from '../shared/util.js';

/* ------------------------------------------------------------ the wizard */

function openBeastWizard(beastId) {
  const editing = beastId && state.session.bestiary.find(b => b.id === beastId);
  const draft = {
    beastId: beastId || null,
    portrait: editing ? editing.portrait : null,
    abilities: editing ? editing.abilities.map(a => ({ ...a })) : [],
  };
  update(s => { s.ui.modal = () => BeastWizard(draft); });
}

function BeastWizard(draft) {
  const editing = draft.beastId && state.session.bestiary.find(b => b.id === draft.beastId);
  const b = editing || {};
  const tags = [...new Set(state.session.bestiary.map(x => x.tag).filter(Boolean))].sort();

  const saveBeast = form => {
    const data = new FormData(form);
    const entry = normaliseBeast({
      id: editing ? editing.id : newId(),
      name: data.get('name'), tag: data.get('tag'),
      ac: data.get('ac'), hpMax: data.get('hpMax'), initMod: data.get('initMod'),
      note: data.get('note'),
      portrait: draft.portrait,
      abilities: draft.abilities,
      /* Editing keeps whatever path the entry came from; a new one gets a
         fresh slug under monsters/. */
      file: editing?.file || null,
    });
    if (!entry.file) entry.file = 'monsters/' + slugify(entry.name) + '.json';
    update(s => {
      absorbBeast(s.session.bestiary, entry);
      s.ui.modal = null;
    });
    saveEntity(entry.file, entry);
    flash(`${entry.name} guardado.`);
  };

  return html`<${ModalFrame} title=${editing ? 'Editar PNJ' : 'Nuevo PNJ'}
    onSubmit=${saveBeast} acts=${html`
      <button type="button" class="ghost" onClick=${closeModal}>Cancelar</button>
      <button class="primary">Guardar</button>`}>
    <div class="mform">
      <div class="wide" style="display:flex;justify-content:center">
        <${Portrait} name=${b.name || 'Nuevo PNJ'} portrait=${draft.portrait} big
          onPick=${stamp => { draft.portrait = { src: null, stamp }; update(); }} /></div>
      <label class="wide">Nombre
        <input name="name" required placeholder="Goblin" autocomplete="off" defaultValue=${b.name || ''} /></label>
      <label class="wide">Tipo — para agrupar y filtrar: monstruo, aldeano, aliado…
        <input name="tag" list="npctags" placeholder="monstruo" autocomplete="off" defaultValue=${b.tag || ''} /></label>
      <datalist id="npctags">${tags.map(t => html`<option value=${t} key=${t} />`)}</datalist>
      <label>CA <input name="ac" type="number" inputmode="numeric" defaultValue=${b.ac ?? 12} /></label>
      <label>PG <input name="hpMax" type="number" inputmode="numeric" defaultValue=${b.hpMax ?? 7} /></label>
      <label>Mod. inic. <input name="initMod" type="number" inputmode="numeric" defaultValue=${b.initMod ?? 0} /></label>
      <label class="wide">Notas — resistencias, comportamiento, lo que quieras tener delante
        <textarea name="note" rows="3"
          placeholder="Resistente al fuego · Huye por debajo de la mitad de PG">${b.note || ''}</textarea></label>
      <div class="wide abilities">
        <label>Habilidades y ataques</label>
        ${draft.abilities.map((a, i) => html`<div class="abrow" key=${a.id || i}>
          <input placeholder="Mordisco" autocomplete="off" defaultValue=${a.name}
            onChange=${e => { a.name = e.target.value; }} />
          <textarea rows="2" defaultValue=${a.desc}
            placeholder="Ataque de arma cuerpo a cuerpo: +4, alcance 1,5 m, un objetivo. Impacto: 1d6+2 perforante."
            onChange=${e => { a.desc = e.target.value; }}></textarea>
          <button type="button" class="small ghost"
            onClick=${() => { draft.abilities.splice(i, 1); update(); }}>Quitar</button>
        </div>`)}
        <button type="button" class="small ghost"
          onClick=${() => { draft.abilities.push({ id: newId(), name: '', desc: '' }); update(); }}>+ Añadir habilidad</button>
      </div>
    </div>
  </>`;
}

/* -------------------------------------------------------------- screen */

function deleteBeast(b) {
  update(s => { s.session.bestiary = s.session.bestiary.filter(x => x.id !== b.id); });
  if (b.file) {
    deleteFile(state.root, b.file)
      .then(r => flash(`${b.name} borrado — el archivo queda en ${r.trashedTo}.`))
      .catch(e => flash('No se pudo borrar el archivo: ' + e.message));
  } else {
    flash(`${b.name} borrado.`);
  }
}

function Pnj() {
  const n = state.session.bestiary.length;
  const filter = state.ui.filters.monstruos;
  const shown = n ? state.session.bestiary.filter(b => matchesFilter(`${b.name} ${b.tag || ''}`, filter)) : [];
  return html`<main><section class="panel wide">
    <div class="quickadd">
      <button class="primary" onClick=${() => openBeastWizard(null)}>+ Nuevo PNJ</button>
    </div>
    ${n ? html`
      <div class="filterbar"><input type="text" placeholder="Buscar por nombre o tipo…"
        value=${filter} onInput=${e => update(s => { s.ui.filters.monstruos = e.target.value; })} /></div>
      ${shown.length
        ? html`<div class="board">${shown.map(b => html`<div class="beast" key=${b.id}>
            <div class="bwho">
              <${Portrait} name=${b.name} portrait=${b.portrait} />
              <div><b>${b.name}</b>${b.tag ? html` <span class="tag">${b.tag}</span>` : null}
                <div class="st">CA ${b.ac} · ${b.hpMax} PG · iniciativa ${signed(b.initMod)}${
                  b.speed != null ? ` · ${metres(b.speed)} m` : ''}</div></div>
            </div>
            <div class="acts">
              <button class="small ghost" onClick=${() => openBeastWizard(b.id)}>Editar</button>
              <button class="small ghost" onClick=${() => deleteBeast(b)}>Borrar</button>
            </div>
            ${b.abilities.length ? html`<div class="nt"><b>${b.abilities.map(a => a.name).join(' · ')}</b></div>` : null}
            ${b.note ? html`<div class="nt">${b.note}</div>` : null}
          </div>`)}</div>`
        : html`<p class="muted">Ningún PNJ coincide con “${filter}”.</p>`}`
      : html`<div class="drop" onClick=${() => openBeastWizard(null)}>
          <b>Nada guardado todavía</b>
          Escribe aquí a quien vayas a usar — monstruos, aldeanos, aliados — y entrarán en
          cualquier combate de un toque. También puedes <button class="link">crear el primero</button>.
        </div>`}
  </section></main>`;
}

screens.monstruos = Pnj;
