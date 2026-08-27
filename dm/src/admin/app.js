/* The root component and the way in: folder, then mesa, then the table.

   Three screens, and which one is up is a plain fact about what has been
   granted so far — not a mode:

     no folder         the gate: open one, or reopen the last
     folder, no mesa   the mesa picker (only when the campaign has runs/)
     folder + mesa     the app, in tabs

   THE TAB IS WRITTEN BY A TAB CLICK AND BY BOOT. Not by an import, not by
   putting something on the television, not by a scene going live. That is
   invariant 2, and the old app broke it from eleven places. */

/** @import { Run } from '../shared/types.js' */

import { html } from '../html.js';
import { state, update, undo, undoDepth, undoLabel } from './store.js';
import { openFolder, reopenLast, chooseRun, switchRun, leaveCampaign, newRun } from './campaign.js';
import { PREP_RUN, runFrom } from '../shared/runs.js';
import { Juego } from './juego.js';
import { Jugadores, absorbFile } from './jugadores.js';
import { PNJ } from './pnj.js';
import { Objetos } from './objetos.js';
import { Escenas } from './escenas.js';
import { Historia } from './historia.js';
import { LayerModal } from './layers.js';

const supported = () => 'showDirectoryPicker' in window;

/* ----------------------------------------------------------------- tabs
   One list, in the order they are shown. `table: true` means the tab is about
   a mesa — preparation-only mode has no table, so those tabs are not there at
   all, rather than being there and empty. */

/** @type {{key: string, es: string, table: boolean, view: () => any}[]} */
export const TABS = [
  { key: 'juego', es: 'Juego', table: true, view: Juego },
  { key: 'jugadores', es: 'Jugadores', table: true, view: Jugadores },
  { key: 'pnj', es: 'PNJ', table: false, view: PNJ },
  { key: 'objetos', es: 'Objetos', table: false, view: Objetos },
  { key: 'escenas', es: 'Escenas', table: false, view: Escenas },
  { key: 'historia', es: 'Historia', table: false, view: Historia },
];

/** @param {Run} run */
export const tabsFor = run => TABS.filter(t => !run.prep || !t.table);

/** Which tab boot lands on — the only place other than a tab click that ever
    writes it. @param {Run} run */
export const firstTab = run => (tabsFor(run)[0]?.key ?? 'juego');

/* ---------------------------------------------------------------- gates */

function Gate() {
  return html`<div class="gate">
    <h1 class="dsp">Mesa del DM</h1>
    ${!supported()
      ? html`<p>Este navegador no puede abrir una carpeta de campaña.
          Hace falta Chrome o Edge, y una página segura (https, o localhost).</p>`
      : html`
        <p>Ninguna campaña abierta.</p>
        <div class="row">
          <button class="primary" onClick=${openFolder}>Abrir carpeta…</button>
          ${state.rememberedName && html`
            <button onClick=${reopenLast}>Reabrir ${state.rememberedName}</button>`}
        </div>
        <p class="fine">
          La carpeta de campaña es la base de datos: esta ventana la lee y la
          escribe directamente, y nada de lo que contiene pasa por un servidor.
          Una carpeta vacía se convierte en una campaña nueva.
        </p>`}
  </div>`;
}

function MesaPicker() {
  return html`<div class="gate">
    <h1 class="dsp">${state.rememberedName}</h1>
    <p>¿Qué mesa se sienta?</p>
    <div class="mesas">
      ${state.runs.map(r => html`
        <button class="mesa" key=${r.slug} onClick=${() => chooseRun(runFrom(r))}>
          <b class="dsp">${r.label}</b>
          <span class="fine">
            ${r.players} ${r.players === 1 ? 'ficha' : 'fichas'}
            ${r.played ? ' · ya ha jugado' : ' · sin estrenar'}
          </span>
        </button>`)}
      <button class="mesa prep" onClick=${() => chooseRun(PREP_RUN)}>
        <b class="dsp">Sólo preparación</b>
        <span class="fine">
          Sin mesa: no hay partida, ni fichas, ni tablero. Se edita lo que
          comparten todas las mesas, y es desde donde se borra.
        </span>
      </button>
      <${NewMesa} />
    </div>
    <p><button class="link" onClick=${leaveCampaign}>Elegir otra carpeta</button></p>
  </div>`;
}

/** Making a mesa is making a folder — plus the notes that give a table
    somewhere to write. A campaign grows its second layer here, which is also
    where it starts being asked where a save goes. */
function NewMesa() {
  if (!state.ui.newMesa) {
    return html`<button class="mesa add"
      onClick=${() => update(s => { s.ui.newMesa = ''; })}>+ Mesa nueva</button>`;
  }
  const go = () => {
    const label = state.ui.newMesa || '';
    update(s => { s.ui.newMesa = null; });
    newRun(label, label);
  };
  return html`<div class="mesa add open">
    <label class="f">
      <span>¿Cómo se llama la mesa?</span>
      <input autofocus defaultValue=${state.ui.newMesa}
        placeholder="Guils"
        onInput=${(/** @type {Event} */ e) => {
          state.ui.newMesa = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        }}
        onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') go(); }} />
    </label>
    <div class="row">
      <button class="link" onClick=${() => update(s => { s.ui.newMesa = null; })}>Cancelar</button>
      <button class="primary" onClick=${go}>Crear</button>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- table */

function Table() {
  const run = state.run;
  const tabs = tabsFor(run);
  const active = tabs.find(t => t.key === state.ui.tab) ?? tabs[0];
  return html`<div class="app">
    <header class="top">
      <button class="link" onClick=${leaveCampaign} title="Cerrar la carpeta">
        ${state.rootName}
      </button>
      ${run.label && html`<span class="mesa-tag">${run.label}</span>`}
      ${(state.runs.length > 0 || run.path) &&
        html`<button class="link" onClick=${switchRun}>Cambiar mesa</button>`}
      ${undoDepth() > 0 && html`<button class="undo" onClick=${undo}
        title=${'Deshacer: ' + undoLabel()}>⟲ ${undoLabel()}</button>`}
    </header>

    <nav class="tabs">
      ${tabs.map(t => html`<button
        key=${t.key}
        class=${'tab-btn' + (active?.key === t.key ? ' on' : '')}
        aria-current=${active?.key === t.key ? 'true' : null}
        onClick=${() => update(s => {
          /* One of the two places in this app that writes the tab. */
          s.ui.tab = t.key;
          s.ui.condFor = null;
          s.ui.modal = null;
        })}>${t.es}</button>`)}
    </nav>

    <main>${active ? active.view() : null}</main>
  </div>`;
}

export function App() {
  if (!state.booted) return html`<div class="gate"><p>…</p></div>`;
  if (state.pendingRoot) return html`<${MesaPicker} />`;
  const screen = state.root ? html`<${Table} />` : html`<${Gate} />`;
  return html`<div class="shell"
    onDragOver=${(/** @type {DragEvent} */ e) => { if (state.root) e.preventDefault(); }}
    onDrop=${onDrop}>
    ${screen}
    ${state.ui.pendingSave && html`<${LayerModal} />`}
    ${state.flash && html`<div class="flash" role="status">${state.flash}</div>`}
  </div>`;
}

/** A sheet dropped anywhere on the window joins the party. Nothing else moves:
    no tab change, no navigation. You dropped a file; you did not ask to be
    taken somewhere. @param {DragEvent} e */
function onDrop(e) {
  if (!state.root || state.run.prep) return;
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  for (const f of files) if (f.name.endsWith('.json')) absorbFile(f);
}
