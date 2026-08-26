/* The frame every screen lives in: the gate (until a campaign is picked),
   the sticky top bar (title + campaign + board status + underline tabs),
   and the screen switch. Screens themselves live in their own modules and
   register here. */

import { html } from './html.js';
import { state, update, updateSession, undo, undoDepth, undoLabel } from './store.js';
import { openFolder, reopenLast, leaveCampaign, chooseRun, switchRun } from './main.js';
import { PREP_RUN } from '../shared/runs.js';

/* Dynamic on purpose: modals.js reaches back into the tab modules, and a
   static import here would close a cycle through this file before `screens`
   exists. The module is long since cached when the button is pressed. */
const openConnectModal = () => import('./modals.js').then(m => m.openConnectModal());

/* Filled in by the tab modules as they land; a missing screen renders a
   stub so the shell is testable before the tabs exist. */
export const screens = {};

const stub = title => html`<main><section class="panel">
  <h2>${title}</h2><p class="muted">En construcción.</p></section></main>`;

/* ------------------------------------------------------------------ gate */

function Gate() {
  if (!('showDirectoryPicker' in window)) {
    return html`<main class="gate"><section class="panel gatecard">
      <h1>Mesa del DM</h1>
      <p class="muted">Este navegador no sabe abrir carpetas del disco
        (hace falta la File System Access API). Abre la mesa en
        <b>Chrome</b> o <b>Edge</b>.</p>
    </section></main>`;
  }
  return html`<main class="gate"><section class="panel gatecard">
    <h1>Mesa del DM</h1>
    <p class="muted">Antes de nada — ¿qué campaña vamos a jugar?</p>
    <div class="quickadd" style="margin-top:1rem;flex-wrap:wrap">
      ${state.rememberedName ? html`<button class="primary"
        onClick=${() => reopenLast()}>Reabrir ${state.rememberedName}</button>` : null}
      <button class=${state.rememberedName ? 'ghost' : 'primary'}
        onClick=${() => openFolder()}>Abrir carpeta…</button>
    </div>
    <p class="muted" style="font-size:.85rem;margin-top:1rem">
      Una campaña es una carpeta con${' '}
      <code>scenarios/</code>,${' '}<code>assets/</code>,${' '}
      <code>story/</code>,${' '}<code>players/</code>,${' '}
      <code>monsters/</code>${' '}y${' '}<code>objects/</code> —
      elige una vacía y se crean solas.
      Todo lo que cambies aquí se guarda solo, directamente en esos
      archivos — no hay botón de guardar, y nada sale de tu máquina.</p>
  </section></main>`;
}

/* ------------------------------------------------------------- mesa gate
   A campaign with a runs/ folder is played by a *table*: the preparation is
   shared, and each mesa keeps its own party, its own session and its own
   relay room. Which one are we sitting at? (A campaign without runs/ never
   sees this — it has one implicit run and opens straight through.) */

function RunGate() {
  const runs = state.runs;
  return html`<main class="gate"><section class="panel gatecard">
    <h1>${state.rememberedName}</h1>
    <p class="muted">Esta campaña la juegan varias mesas.
      ¿En cuál nos sentamos?</p>
    <div class="runlist">
      ${runs.map(r => html`<button key=${r.slug} class="runpick"
        onClick=${() => chooseRun(r)}>
        <b>${r.label}</b>
        <span class="muted">${r.players
          ? `${r.players} ficha${r.players === 1 ? '' : 's'}`
          : 'sin fichas'}${r.played ? ' · empezada' : ' · sin empezar'}</span>
      </button>`)}
    </div>
    <div class="quickadd" style="margin-top:1rem;flex-wrap:wrap">
      <button class="ghost" onClick=${() => chooseRun(PREP_RUN)}
        title="La campaña sin mesa: escenas, PNJ, objetos y notas. Sin tablero.">
        Sólo preparación</button>
      <button class="ghost" onClick=${() => leaveCampaign()}>Otra carpeta…</button>
    </div>
    <p class="muted" style="font-size:.85rem;margin-top:1rem">
      Cada mesa es una carpeta en <code>runs/</code> con su${' '}
      <code>players/</code> y su <code>session.json</code>; la preparación
      —${' '}<code>story/</code>, <code>scenarios/</code>,${' '}
      <code>monsters/</code>, <code>objects/</code> — la comparten todas.
      Para estrenar una mesa, crea su carpeta.</p>
  </section></main>`;
}

/* ------------------------------------------------------------------ rail */

const TAB_TITLES = {
  juego: ['Juego', 'la mesa, ahora mismo'],
  jugadores: ['Jugadores', 'el grupo, fuera de combate'],
  monstruos: ['PNJ', 'cualquiera que no esté sentado a la mesa'],
  objetos: ['Objetos', 'lo que llevan encima, y lo que hace'],
  escenas: ['Escenas', 'preparación, no partida'],
  story: ['Historia', 'notas de la campaña'],
};

const NAV = [
  ['juego', 'Juego'],
  ['jugadores', 'Jugadores'],
  ['monstruos', 'PNJ'],
  ['objetos', 'Objetos'],
  ['escenas', 'Escenas'],
  ['story', 'Historia'],
];

/* Preparation-only mode has no mesa: no party, no session, no tablero — so
   the two tabs that are nothing but the live table are not there either. */
const TABLE_TABS = new Set(['juego', 'jugadores']);
const navFor = prep => (prep ? NAV.filter(([k]) => !TABLE_TABS.has(k)) : NAV);

function TopBar() {
  const prep = state.run.prep;
  const paused = state.session.field.paused;
  const tvUrl = `${state.lanUrl || ''}/tv?room=${state.room || ''}`;
  const counts = {
    juego: state.session.encounter.on ? state.session.encounter.members.length : 0,
    jugadores: state.session.party.length,
    monstruos: state.session.bestiary.length,
    objetos: state.session.objects.length,
    escenas: state.scenes.length,
    story: state.story.notes.length,
  };
  const go = key => update(s => {
    s.ui.tab = key; s.ui.condFor = null; s.ui.modal = null; s.ui.selectedToken = null;
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  return html`<header class="top">
    <div class="bar">
      <span class="app dsp">Mesa del DM</span>
      <button class="camp" title="Volver a la puerta para abrir otra carpeta"
        onClick=${() => leaveCampaign()}>${state.rootName} <span class="sw">⇄</span></button>
      ${state.run.slug ? html`<button class=${'camp mesa' + (prep ? ' prep' : '')}
        title=${prep
          ? 'Estás en la preparación de la campaña, sin mesa — pulsa para sentarte a una'
          : 'La mesa que está jugando — pulsa para cambiar de mesa'}
        onClick=${() => switchRun()}>${prep ? 'Preparación' : state.run.label}${' '}
        <span class="sw">⇄</span></button>` : null}
      <div class="actions">
        ${undoDepth() ? html`<button class="ghost" title=${'Deshacer: ' + undoLabel()}
          onClick=${() => undo()}>⟲</button>` : null}
        ${prep ? null : html`
        <span class=${'bstate' + (paused ? ' paused' : '')}
          title=${paused
            ? 'La mesa está congelada donde la dejaste; nada llega hasta que lo envíes'
            : 'Lo que cambias llega a la mesa al momento'}>
          <span class="dot"></span><span class="lbl">${paused ? 'En pausa' : 'En vivo'}</span></span>
        <button class=${paused ? 'primary' : 'ghost'}
          title=${paused
            ? 'Envía a la mesa todo lo que has cambiado desde que se pausó'
            : 'La mesa deja de enterarse de lo que cambias, hasta que lo envíes tú'}
          onClick=${() => updateSession(s => { s.session.field.paused = !paused; })}>
          ${paused ? '▶ Enviar al tablero' : '⏸ Pausar'}</button>
        <button class="ghost" title=${'También vale cualquier aparato del wifi: ' + tvUrl}
          onClick=${() => window.open(`/tv?room=${state.room || ''}`, 'tablero')}>Tablero ↗</button>
        <button class="ghost" title="Conectar otro aparato — dirección y código QR"
          onClick=${() => openConnectModal()}>▦</button>`}
      </div>
    </div>
    <nav class="tabs" aria-label="Secciones">
      ${navFor(prep).map(([key, label]) => html`<button key=${key}
        aria-current=${state.ui.tab === key ? 'true' : null}
        onClick=${() => go(key)}>
        ${label}${counts[key] ? html`<span class="n">${counts[key]}</span>` : null}
      </button>`)}
    </nav>
  </header>`;
}

function ScreenHead() {
  const [title, sub] = TAB_TITLES[state.ui.tab] || TAB_TITLES.juego;
  return html`<header class="screenhead">
    <h1 class="dsp">${title}</h1>
    <span class="sub">${sub}</span>
  </header>`;
}

/* ------------------------------------------------------------------- app */

export function App() {
  if (!state.booted) return html`<main class="gate"><section class="panel">
    <p class="muted">Abriendo…</p></section></main>`;
  if (state.pendingRoot) return html`${RunGate()}${Flash()}`;
  if (!state.root) return html`${Gate()}${Flash()}`;
  /* A tab that only exists at a table cannot be the open one in preparation
     mode — a remembered ui.tab from the last table would render a screen
     with no session behind it. */
  const tab = state.run.prep && TABLE_TABS.has(state.ui.tab) ? 'escenas' : state.ui.tab;
  const Screen = screens[tab];
  const [title] = TAB_TITLES[tab] || TAB_TITLES.juego;
  return html`<div class="shell">
    <${TopBar} />
    <div class="content">
      ${state.admins > 1 ? html`<div class="pausedbar warn">⚠ Hay ${state.admins} ventanas de administración
        abiertas a la vez — la última que toque algo gana. Cierra una.</div>` : null}
      ${state.run.prep ? html`<div class="pausedbar">✎ Preparación de la campaña — ninguna
        mesa está sentada, así que no hay tablero ni grupo. Lo que cambies aquí lo verán
        todas las mesas.</div>` : null}
      ${!state.run.prep && state.session.field.paused ? html`<div class="pausedbar">⏸ La mesa está congelada donde la
        dejaste — nada de lo que cambies aquí llega hasta que pulses <b>Enviar al tablero</b>.</div>` : null}
      ${ScreenHead()}
      ${!state.run.prep && state.ui.showTV && screens.tvPanel ? screens.tvPanel() : null}
      ${Screen ? Screen() : stub(title)}
    </div>
    ${state.ui.modal ? state.ui.modal() : null}
    ${Flash()}
  </div>`;
}

function Flash() {
  /* htm text children are escaped by preact itself — no esc() here, that
     would show the entities. */
  return state.flash ? html`<div class="flash" role="status">${state.flash}</div>` : null;
}
