/* Objetos — the item catalog. Templates in the same sense the bestiary is:
   every object lives in its own objects/<slug>.json, holders keep only ids,
   and editing an object here changes it in every hand that carries it.
   Deleting one moves the file to trash/ and takes it out of those hands. */

import { html } from './html.js';
import { state, update, commit, flash, saveEntity, syncBoard } from './store.js';
import { deleteFile } from './api.js';
import { screens } from './app.js';
import { ModalFrame, closeModal } from './frame.js';
import { newId } from '../rules/character.js';
import { MOD_KEYS, normaliseObject, absorbObject, modSummary } from '../shared/objects.js';
import { handleFor } from '../shared/handles.js';
import { matchesFilter, slugify } from '../shared/util.js';

/* ------------------------------------------------------------ the wizard */

function openObjectWizard(objectId) {
  const editing = objectId && state.session.objects.find(o => o.id === objectId);
  const draft = {
    objectId: objectId || null,
    mods: editing ? Object.entries(editing.mods).map(([key, value]) => ({ id: newId(), key, value })) : [],
    effects: editing ? editing.effects.map(text => ({ id: newId(), text })) : [],
  };
  update(s => { s.ui.modal = () => ObjectWizard(draft); });
}

function ObjectWizard(draft) {
  const editing = draft.objectId && state.session.objects.find(o => o.id === draft.objectId);
  const o = editing || {};

  const saveObject = form => {
    const data = new FormData(form);
    const mods = {};
    for (const row of draft.mods) {
      const v = Number(row.value);
      if (Number.isFinite(v)) mods[row.key] = (mods[row.key] || 0) + v;   // two CA rows sum
    }
    const entry = normaliseObject({
      id: editing ? editing.id : newId(),
      name: data.get('name'),
      description: data.get('description'),
      mods,
      effects: draft.effects.map(e => e.text),
      /* Editing keeps whatever path the entry came from; a new one gets a
         fresh slug under objects/. */
      file: editing?.file || null,
    });
    if (!entry.file) entry.file = 'objects/' + slugify(entry.name) + '.json';
    update(s => {
      absorbObject(s.session.objects, entry);
      s.ui.modal = null;
    });
    /* The catalog is not session state, so commit() never runs for an edit —
       but a held object's numbers just changed on every card and on the TV.
       Push by hand. */
    syncBoard();
    saveEntity(entry.file, entry);
    flash(`${entry.name} guardado.`);
  };

  return html`<div class="scrim" onClick=${e => {
      if (e.target === e.currentTarget) closeModal();
    }}>
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${editing ? 'Editar objeto' : 'Nuevo objeto'}</h3>
      <form class="mform" onSubmit=${e => { e.preventDefault(); saveObject(e.target); }}>
        <label class="wide">Nombre
          <input name="name" required placeholder="Anillo de protección" autocomplete="off"
            defaultValue=${o.name || ''} /></label>
        <label class="wide">Descripción — qué es, de dónde salió, qué aspecto tiene
          <textarea name="description" rows="2"
            placeholder="Un aro de plata deslustrada con runas casi borradas">${o.description || ''}</textarea></label>
        <div class="wide abilities">
          <label>Modificadores — se suman a los números de quien lo lleve</label>
          ${draft.mods.map((row, i) => html`<div class="modrow" key=${row.id}>
            <select aria-label="Propiedad" onChange=${e => { row.key = e.target.value; }}>
              ${MOD_KEYS.map(([k, es]) => html`<option value=${k} selected=${row.key === k}>${es}</option>`)}
            </select>
            <input type="number" step="1" placeholder="+1" aria-label="Cuánto"
              defaultValue=${row.value} onChange=${e => { row.value = e.target.value; }} />
            <button type="button" class="small ghost"
              onClick=${() => { draft.mods.splice(i, 1); update(); }}>Quitar</button>
          </div>`)}
          <button type="button" class="small ghost"
            onClick=${() => { draft.mods.push({ id: newId(), key: 'ac', value: 1 }); update(); }}>+ Añadir modificador</button>
        </div>
        <div class="wide abilities">
          <label>Efectos — texto que se muestra en la carta, no se calcula</label>
          ${draft.effects.map((row, i) => html`<div class="fxrow" key=${row.id}>
            <input placeholder="Ventaja en tiradas de sigilo" autocomplete="off"
              defaultValue=${row.text} onChange=${e => { row.text = e.target.value; }} />
            <button type="button" class="small ghost"
              onClick=${() => { draft.effects.splice(i, 1); update(); }}>Quitar</button>
          </div>`)}
          <button type="button" class="small ghost"
            onClick=${() => { draft.effects.push({ id: newId(), text: '' }); update(); }}>+ Añadir efecto</button>
        </div>
        <div class="acts">
          <button type="button" class="ghost" onClick=${closeModal}>Cancelar</button>
          <button class="primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>`;
}

/* ------------------------------------------------- who carries what
   Assignments live on the holder (play.objects for a player, the instance
   itself for an npc) and every change to them is a play mutation: an undo
   step, a session save, a board push. */

/** A numeric hp left above a maximum that just dropped would absorb damage
    invisibly — clamp on every unassign. `hp: null` is untouched: full stays
    full at whatever the maximum now is. */
function clampHP(session, ref) {
  const cb = handleFor(session, ref);
  if (cb && cb.play.hp != null) cb.play.hp = Math.min(cb.play.hp, Math.max(0, cb.hpMax || 0));
}

export function openObjectPicker(ref) {
  const cb = handleFor(state.session, ref);
  if (!cb) return;
  const counts = new Map();
  for (const id of cb.play.objects || []) counts.set(id, (counts.get(id) || 0) + 1);
  update(s => { s.ui.modal = () => ObjectPicker(ref, counts); });
}

function stepCount(counts, id, how) {
  const now = counts.get(id) || 0;
  const next = how === 'toggle' ? (now ? 0 : 1) : Math.min(20, Math.max(0, now + how));
  if (next) counts.set(id, next); else counts.delete(id);
  update();
}

function ObjectPicker(ref, counts) {
  const cb = handleFor(state.session, ref);
  if (!cb) return null;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const confirmPick = () => {
    commit(`objetos de ${cb.name}`, s => {
      const fresh = handleFor(s.session, ref);
      if (!fresh) return;
      const ids = [];
      for (const o of s.session.objects) {
        for (let i = counts.get(o.id) || 0; i > 0; i--) ids.push(o.id);
      }
      fresh.play.objects = ids;
      clampHP(s.session, ref);
      s.ui.modal = null;
    });
  };
  return html`<${ModalFrame} title=${'Objetos de ' + cb.name} acts=${html`
      <span class="count">${total ? `${total} objeto${total === 1 ? '' : 's'}` : 'Nada encima'}</span>
      <button class="ghost" onClick=${closeModal}>Cancelar</button>
      <button class="primary" onClick=${confirmPick}>Guardar</button>`}>
    ${state.session.objects.length
      ? state.session.objects.map(o => {
          const n = counts.get(o.id) || 0;
          const line = [modSummary(o.mods), o.effects.join(' · ')].filter(Boolean).join(' · ');
          return html`<div class=${'pickrow' + (n ? ' on' : '')} key=${o.id}>
            <button class=${'tick' + (n ? ' on' : '')} aria-pressed=${!!n} aria-label=${o.name}
              onClick=${() => stepCount(counts, o.id, 'toggle')}>${n ? '✓' : ''}</button>
            <button class="nm" onClick=${() => stepCount(counts, o.id, 'toggle')}><b>${o.name}</b></button>
            <span class="st">${line || '—'}</span>
            <span class="stepper">
              <button class="ghost" aria-label="Uno menos" onClick=${() => stepCount(counts, o.id, -1)}>−</button>
              <b>${n}</b>
              <button class="ghost" aria-label="Uno más" onClick=${() => stepCount(counts, o.id, 1)}>+</button>
            </span>
          </div>`;
        })
      : html`<p class="muted">No hay objetos todavía. Se crean en la pestaña${' '}
          <button class="link" onClick=${() => update(s => { s.ui.tab = 'objetos'; s.ui.modal = null; })}>Objetos</button>.</p>`}
  </>`;
}

/** The card's «Quitar» — drop ONE copy, keep the rest. */
export function removeObjectFrom(ref, objectId) {
  const obj = state.session.objects.find(o => o.id === objectId);
  const cb = handleFor(state.session, ref);
  if (!cb) return;
  commit(`quitar ${obj?.name || 'un objeto'} a ${cb.name}`, s => {
    const fresh = handleFor(s.session, ref);
    if (!fresh) return;
    const at = (fresh.play.objects || []).indexOf(objectId);
    if (at >= 0) fresh.play.objects.splice(at, 1);
    clampHP(s.session, ref);
  });
}

/* -------------------------------------------------------------- screen */

function holdersOf(o) {
  let n = 0;
  for (const p of Object.values(state.session.play)) n += (p.objects || []).filter(id => id === o.id).length;
  for (const x of state.session.npcs) n += (x.objects || []).filter(id => id === o.id).length;
  return n;
}

function deleteObject(o) {
  /* Unlike a bestiary delete, this one is a commit: stripping the object out
     of every hand is a play mutation — hit points can drop with the maximum,
     the TV has to hear about it, and it deserves an undo step. (Undo brings
     the catalog entry back in memory, not the file — same bestiary caveat.) */
  commit(`borrar objeto ${o.name}`, s => {
    s.session.objects = s.session.objects.filter(x => x.id !== o.id);
    for (const c of s.session.party) {
      const p = s.session.play[c.id];
      if (!p || !(p.objects || []).includes(o.id)) continue;
      p.objects = p.objects.filter(id => id !== o.id);
      clampHP(s.session, 'pc:' + c.id);
    }
    for (const x of s.session.npcs) {
      if (!(x.objects || []).includes(o.id)) continue;
      x.objects = x.objects.filter(id => id !== o.id);
      clampHP(s.session, 'npc:' + x.id);
    }
  });
  if (o.file) {
    deleteFile(state.root, o.file)
      .then(r => flash(`${o.name} borrado — el archivo queda en ${r.trashedTo}.`))
      .catch(e => flash('No se pudo borrar el archivo: ' + e.message));
  } else {
    flash(`${o.name} borrado.`);
  }
}

function Objetos() {
  const n = state.session.objects.length;
  const filter = state.ui.filters.objetos;
  const shown = n ? state.session.objects.filter(o => matchesFilter(o.name, filter)) : [];
  return html`<main><section class="panel wide">
    <div class="quickadd">
      <button class="primary" onClick=${() => openObjectWizard(null)}>+ Nuevo objeto</button>
    </div>
    ${n ? html`
      <div class="filterbar"><input type="text" placeholder="Buscar por nombre…"
        value=${filter} onInput=${e => update(s => { s.ui.filters.objetos = e.target.value; })} /></div>
      ${shown.length
        ? html`<div class="board">${shown.map(o => {
            const held = holdersOf(o);
            const sum = modSummary(o.mods);
            return html`<div class="beast" key=${o.id}>
              <div class="bwho"><div>
                <b>${o.name}</b>${held ? html` <span class="tag">×${held} en juego</span>` : null}
                <div class="st">${sum || 'sin modificadores'}</div>
              </div></div>
              <div class="acts">
                <button class="small ghost" onClick=${() => openObjectWizard(o.id)}>Editar</button>
                <button class="small ghost" onClick=${() => deleteObject(o)}>Borrar</button>
              </div>
              ${o.effects.length ? html`<div class="nt">✦ ${o.effects.join(' · ')}</div>` : null}
              ${o.description ? html`<div class="nt">${o.description}</div>` : null}
            </div>`;
          })}</div>`
        : html`<p class="muted">Ningún objeto coincide con “${filter}”.</p>`}`
      : html`<div class="drop" onClick=${() => openObjectWizard(null)}>
          <b>Nada guardado todavía</b>
          Un objeto es un nombre y lo que hace: +1 a la CA, +2 PG, un efecto escrito.
          Dáselo a un jugador o a un PNJ desde su carta y sus números cambian solos.
          También puedes <button class="link">crear el primero</button>.
        </div>`}
  </section></main>`;
}

screens.objetos = Objetos;
