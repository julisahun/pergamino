/* The fight: mustering it, rolling for it, and running it.

   Two modals and a strip. The muster picker is where the DM decides who is IN
   this fight — nobody is ticked by default, because "everyone who is loaded"
   is not the same question and the app should not answer it for you. The
   initiative wizard collects one number per name; a blank box means "has not
   rolled yet", which the order keeps room for rather than treating as absent.

   The numbers the wizard collects outlive the modal: closing it four names in
   by accident must not mean asking the table again. */

/** @import { Ref } from '../shared/types.js' */

import { html } from '../html.js';
import { state, commit, update, flash } from './store.js';
import { partyHandles, handleFor, currentHP } from '../shared/handles.js';
import { inOrder, startCombat, endCombat, advance, loadNpc, removeNpc,
         allRolled, skippable } from '../shared/combat.js';
import { Card } from './cards.js';

/* ------------------------------------------------------------- the muster */

export function openMuster() {
  update(s => {
    s.ui.modal = 'muster';
    /* Nobody ticked: who fights is a decision, and the app has no opinion. */
    s.ui.muster = new Set();
    s.ui.rolled = s.ui.rolled ?? new Map();
  });
}

export function Muster() {
  const party = partyHandles(state.session).filter(cb =>
    !state.session.field.benched.includes(cb.ref));
  /** @type {any[]} */
  const npcs = state.session.npcs
    .map(n => handleFor(state.session, 'npc:' + n.id)).filter(Boolean);
  const picked = state.ui.muster;

  const row = (/** @type {any} */ cb) => {
    const on = picked.has(cb.ref);
    const reveal = cb.kind === 'npc' ? state.session.field.reveal[cb.id] : null;
    return html`<label class=${'muster-row' + (on ? ' on' : '')} key=${cb.ref}>
      <input type="checkbox" checked=${on} onChange=${() => update(s => {
        if (s.ui.muster.has(cb.ref)) s.ui.muster.delete(cb.ref);
        else s.ui.muster.add(cb.ref);
      })} />
      <span class="nm">${cb.name}</span>
      <span class="fine">${cb.sub}</span>
      ${cb.kind === 'npc' && html`
        <button class=${'eye' + (reveal?.on ? ' on' : '')} type="button"
          title=${reveal?.on
            ? 'Los jugadores lo ven — toca para esconderlo'
            : 'Escondido: no viaja al tablero en absoluto'}
          onClick=${(/** @type {Event} */ e) => {
            e.preventDefault();
            commit(`${reveal?.on ? 'esconder' : 'mostrar'} ${cb.name}`, s => {
              const r = s.session.field.reveal[cb.id] || { on: false, hp: 'coarse' };
              s.session.field.reveal[cb.id] = { ...r, on: !r.on };
            });
          }}>${reveal?.on ? '👁' : '🙈'}</button>
        <select value=${reveal?.hp ?? 'coarse'} title="Cuánto saben los jugadores de sus PG"
          onClick=${(/** @type {Event} */ e) => e.stopPropagation()}
          onChange=${(/** @type {Event} */ e) => {
            const v = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
            commit(`PG de ${cb.name} en la tele`, s => {
              const r = s.session.field.reveal[cb.id] || { on: false, hp: 'coarse' };
              s.session.field.reveal[cb.id] = { ...r, hp: /** @type {any} */ (v) };
            });
          }}>
          <option value="none">sin PG</option>
          <option value="coarse">por palabras</option>
          <option value="exact">exactos</option>
        </select>
        <button class="link" type="button" title="Quitar del todo — un PNJ no tiene banquillo"
          onClick=${(/** @type {Event} */ e) => {
            e.preventDefault();
            commit(`quitar ${cb.name}`, s => removeNpc(s.session, cb.ref));
          }}>quitar</button>`}
    </label>`;
  };

  return html`<div class="modal-body muster">
    <h3 class="dsp">¿Quién entra en el combate?</h3>
    <p class="fine">
      Nadie está marcado: entrar en un combate es una decisión, y estar cargado
      en la mesa no lo es. Lo que no marques sigue donde está.
    </p>

    <h4>Personajes</h4>
    ${party.map(row)}

    <h4>PNJ cargados <small class="fine">${npcs.length}</small></h4>
    ${npcs.length ? npcs.map(row) : html`<p class="fine">
      Ninguno. Se cargan desde PNJ (etapa 5) o desde una escena.
    </p>`}

    <div class="modal-foot">
      <button class="link" onClick=${() => update(s => { s.ui.modal = null; })}>Cancelar</button>
      <button class="primary" disabled=${picked.size === 0}
        onClick=${() => update(s => { s.ui.modal = 'init'; })}>
        Tirar iniciativa (${picked.size})
      </button>
    </div>
  </div>`;
}

/* --------------------------------------------------------- the initiative */

export function Initiative() {
  const refs = [...state.ui.muster];
  const rolled = state.ui.rolled;
  /** @type {import('../shared/handles.js').Handle[]} */
  const cbs = /** @type {any} */ (refs.map(r => handleFor(state.session, r)).filter(Boolean));

  return html`<div class="modal-body init">
    <h3 class="dsp">Iniciativa</h3>
    <p class="fine">
      Un número por nombre, el que se ha leído en la mesa. En blanco significa
      «todavía no ha tirado», que no es lo mismo que estar fuera.
    </p>
    ${cbs.map((cb, i) => html`<label class="init-row" key=${cb.ref}>
      <span class="nm">${cb.name}</span>
      <span class="fine">${(cb.initMod ?? 0) >= 0 ? '+' : ''}${cb.initMod ?? 0}</span>
      <input type="number" inputmode="numeric" defaultValue=${rolled.get(cb.ref) ?? ''}
        autofocus=${i === 0}
        onInput=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
          /* Kept outside the session on purpose: nothing has started yet, and
             the numbers must survive the modal being closed by accident. */
          if (v.trim() === '') rolled.delete(cb.ref);
          else rolled.set(cb.ref, Number(v));
        }}
        onKeyDown=${(/** @type {KeyboardEvent} */ e) => {
          if (e.key !== 'Enter') return;
          const inputs = [...document.querySelectorAll('.init-row input')];
          const at = inputs.indexOf(/** @type {any} */ (e.currentTarget));
          /** @type {HTMLInputElement|undefined} */ (inputs[at + 1])?.focus();
        }} />
    </label>`)}
    <div class="modal-foot">
      <button class="link" onClick=${() => update(s => { s.ui.modal = 'muster'; })}>Atrás</button>
      <button class="primary" onClick=${() => begin(refs)}>Empezar el combate</button>
    </div>
  </div>`;
}

/** @param {string[]} refs */
function begin(refs) {
  commit('empezar el combate', s => {
    startCombat(s.session, refs, [...s.ui.rolled]);
  });
  update(s => { s.ui.modal = null; });
  if (!allRolled(state.session)) flash('Alguien no ha tirado todavía; puedes escribirlo luego.');
}

/* ---------------------------------------------------------------- the fight */

export function Fight() {
  const e = state.session.encounter;
  if (!e.on) {
    return html`<section class="fight">
      <h2 class="dsp">Combate</h2>
      <p class="fine">Sin combate.</p>
      <button class="primary" onClick=${openMuster}>Empezar combate</button>
    </section>`;
  }

  const order = inOrder(state.session);
  return html`<section class="fight on">
    <div class="bar">
      <h2 class="dsp">Ronda ${e.round}</h2>
      <button onClick=${() => commit('turno anterior', s => advance(s.session, -1))}>← turno</button>
      <button class="primary" onClick=${() => commit('siguiente turno', s => advance(s.session, 1))}>
        turno →
      </button>
      <button class="link" onClick=${() => commit('terminar el combate', s => endCombat(s.session))}
        title="Sólo la ronda, los turnos y quién estaba dentro. Nadie desaparece ni se cura.">
        Terminar
      </button>
    </div>

    <ol class="order">
      ${order.map(o => {
        const cb = /** @type {any} */ (o.cb);
        const hidden = cb.kind === 'npc' && !state.session.field.reveal[cb.id]?.on;
        return html`<li key=${o.ref}
          class=${(o.ref === e.activeRef ? 'active ' : '') + (skippable(cb) ? 'down ' : '')
                  + (hidden ? 'hidden' : '')}>
          <button class="link" onClick=${() => commit(`turno de ${cb.name}`, s => {
            s.session.encounter.activeRef = /** @type {Ref} */ (o.ref);
          })}>
            <b>${o.init ?? '—'}</b> ${cb.name}
            ${hidden && html`<span class="fine" title="No viaja al tablero">escondido</span>`}
          </button>
          <input class="init-edit" type="number" defaultValue=${o.init ?? ''}
            title="La iniciativa, si cambia"
            onChange=${(/** @type {Event} */ ev) => {
              const v = /** @type {HTMLInputElement} */ (ev.currentTarget).value;
              commit(`iniciativa de ${cb.name}`, s => {
                if (v.trim() === '') delete s.session.encounter.init[o.ref];
                else s.session.encounter.init[o.ref] = Number(v);
              });
            }} />
        </li>`;
      })}
    </ol>

    <div class="cards">
      ${order.map(o => html`<div class="slot" key=${o.ref}>
        <${Card} cb=${o.cb} open=${state.ui.openRows.has(o.ref)} />
      </div>`)}
    </div>
  </section>`;
}

export { currentHP };
