/* The frame every screen lives in: the gate (until a campaign is picked),
   the sticky top bar (title + campaign + board status + underline tabs),
   and the screen switch. Screens themselves live in their own modules and
   register here. */

import { html } from './html.js';
import { state, update, updateSession, undo, undoDepth, undoLabel } from './store.js';
import { openFolder, reopenLast, leaveCampaign } from './main.js';

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

function TopBar() {
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
      <div class="actions">
        ${undoDepth() ? html`<button class="ghost" title=${'Deshacer: ' + undoLabel()}
          onClick=${() => undo()}>⟲</button>` : null}
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
          onClick=${() => openConnectModal()}>▦</button>
      </div>
    </div>
    <nav class="tabs" aria-label="Secciones">
      ${NAV.map(([key, label]) => html`<button key=${key}
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
  if (!state.root) return html`${Gate()}${Flash()}`;
  const Screen = screens[state.ui.tab];
  const [title] = TAB_TITLES[state.ui.tab] || TAB_TITLES.juego;
  return html`<div class="shell">
    <${TopBar} />
    <div class="content">
      ${state.admins > 1 ? html`<div class="pausedbar warn">⚠ Hay ${state.admins} ventanas de administración
        abiertas a la vez — la última que toque algo gana. Cierra una.</div>` : null}
      ${state.session.field.paused ? html`<div class="pausedbar">⏸ La mesa está congelada donde la
        dejaste — nada de lo que cambies aquí llega hasta que pulses <b>Enviar al tablero</b>.</div>` : null}
      ${ScreenHead()}
      ${state.ui.showTV && screens.tvPanel ? screens.tvPanel() : null}
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
