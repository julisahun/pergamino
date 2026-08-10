/* Juego — one tab for everything that is on the television: which place the
   players are looking at, and — when it comes to that — the fight standing
   on it. Three branches:

     nothing live   ScenePanel alone, with a pointer at the scene picker
     not fighting   Jugadores | MidBoard | PNJ, plain rows either side
     fighting       Jugadores | MidBoard | PNJ, full cards for whoever is in
                    this fight, tick-rows for whoever else is loaded */

import { html } from './html.js';
import { state, commit, update, updateSession, flash, audioPrefs, saveAudioPrefs,
         syncBoard, urlFor, aspectOf, saveBinary } from './store.js';
import { screens } from './app.js';
import { CbCard, PickBar } from './cards.js';
import { Field, initialsOf } from './field.js';
import { openMusterPicker, openNpcPicker, openPlayerPicker, openScenePicker } from './modals.js';
import { sceneById } from './escenas.js';
import { signed } from '../rules/engine.js';
import { partyHandles, npcHandle, handleFor, currentHP, npcById } from '../shared/handles.js';
import { inOrder, advance, endCombat, skippable } from '../shared/combat.js';
import { goLive, deriveRows, missingAssets } from '../shared/scenes.js';
import { normaliseReveal } from '../shared/session.js';
import { portraitSrc, TOKEN_COLOURS } from '../shared/board.js';
import { metres } from '../shared/util.js';

/* ------------------------------------------------------------- go live */

export function goLiveScene(scene) {
  commit(scene ? `poner ${scene.name}` : 'quitar la escena', s => {
    /* field.map/field.audio keep the campaign-relative paths (that is what
       session.json persists and what the board push resolves for the TV);
       only the aspect measurement needs a URL an <img> can actually load. */
    goLive(s.session, scene, { aspectOf: (p, fb) => aspectOf(p ? urlFor(p) : p, fb), urlFor: p => p });
    s.ui.tab = 'juego';
  });
  flash(scene ? `${scene.name} está en el tablero.` : 'Tablero sin escena.');
}

/* -------------------------------------------------------- dropped maps
   An image dropped anywhere becomes the live map: downscaled to ≤1920px
   JPEG and written to assets/maps/ as a real file — the localStorage-stamp
   detour the file:// app needed is gone. */

export function readMapImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(1920, img.naturalWidth);
      const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(blob => {
        if (!blob) { flash('No pude convertir esa imagen.'); return; }
        const rel = 'assets/maps/' + Date.now() + '.jpg';
        saveBinary(rel, blob);        // registers the object URL at once
        updateSession(s => {
          const f = s.session.field;
          f.map = { src: rel, stamp: null };
          f.rows = deriveRows(f.cols, w / h);
          /* You dropped a map to use it, so the board is live. And it is no
             longer the scene it was. */
          f.live = true;
          f.sceneId = null;
          s.ui.showTV = true;
        });
        flash(`Mapa puesto · ${w}×${h}, ${Math.round(blob.size / 1024)} KB — guardado en ${rel}.`);
      }, 'image/jpeg', 0.82);
    };
    img.onerror = () => flash('No pude leer esa imagen.');
    img.src = String(reader.result);
  };
  reader.onerror = () => flash('No se pudo leer el archivo.');
  reader.readAsDataURL(file);
}

addEventListener('drop', e => {
  const img = [...(e.dataTransfer?.files || [])].find(f => /^image\//.test(f.type));
  if (img) readMapImage(img);
});

/* ---------------------------------------------------------- scene strip */

function AudioMini({ audio }) {
  if (!audio) return null;
  const pct = Math.round(audioPrefs.master * 100);
  return html`<div class="audiomini">
    <button class=${'small ghost' + (audioPrefs.muted ? ' on' : '')}
      title=${audioPrefs.muted ? 'Quitar el silencio' : 'Silenciar el tablero'}
      onClick=${() => { audioPrefs.muted = !audioPrefs.muted; saveAudioPrefs(); syncBoard(); update(); }}>${
      audioPrefs.muted ? '🔇' : '🔊'}</button>
    <input type="range" min="0" max="1" step="0.01" value=${audioPrefs.master}
      disabled=${audioPrefs.muted} aria-label="Volumen"
      onChange=${e => { audioPrefs.master = Number(e.target.value); saveAudioPrefs(); syncBoard(); update(); }} />
    <b>${pct}%</b>
  </div>`;
}

function SceneRow() {
  const f = state.session.field;
  const s = sceneById(f.sceneId);
  const gone = s ? missingAssets(s, state.assets) : [];
  return html`<div class="row">
      <div>
        <b>${s ? s.name : 'Sin escena'}</b>
        <div class="st">${f.grid ? 'con cuadrícula' : 'a pantalla completa'}${f.map ? '' : ' · sin imagen'}</div>
        ${gone.length ? html`<div class="gone">No encuentro ${gone.join(', ')}</div>` : null}
      </div>
      <div class="acts">
        <button class="small ghost"
          title="Cuadrícula y fichas, o el arte a pantalla completa — no cambia nada de la escena"
          onClick=${() => commit(f.grid ? 'quitar la cuadrícula' : 'poner la cuadrícula', st => {
            st.session.field.grid = !st.session.field.grid;
          })}>${f.grid ? '▦ con cuadrícula' : '▣ a pantalla completa'}</button>
        <button class="small ghost" onClick=${openScenePicker}>${s ? 'Cambiar escena' : 'Fijar escena'}</button>
        ${s ? html`<button class="small ghost" title="Vuelve a la cuadrícula, sin ninguna escena"
          onClick=${() => goLiveScene(null)}>Quitar</button>` : null}
      </div>
    </div>
    <${AudioMini} audio=${f.audio} />
    ${s && s.note ? html`<p class="nt">${s.note}</p>` : null}`;
}

/** The live scene, hero picture and all: for the muster and nothing-live,
    where nothing else on the tab shows the art. */
function SceneBar() {
  const f = state.session.field;
  const s = sceneById(f.sceneId);
  const src = urlFor(f.map?.src || null);
  const gone = s ? missingAssets(s, state.assets) : [];
  return html`<div class="scenebar">
    <div class="hero" style=${src && !gone.length ? `background-image:url("${src}")` : null}></div>
    <${SceneRow} />
  </div>`;
}

/** The same controls, no picture: mid-fight the MidBoard is already showing
    the art between the two sides. */
const SceneControls = () => html`<div class="scenebar compact"><${SceneRow} /></div>`;

function SceneEmptyPanel() {
  const f = state.session.field;
  return html`<div class="drop scenepanel-empty" onClick=${e => {
      if (e.target.closest('button')) return;
      openScenePicker();
    }}>
    <b>Ninguna escena en la mesa</b>
    <button class="primary" onClick=${openScenePicker}>Fijar escena</button>
    <p class="muted" style="font-size:.85rem;margin:.8rem 0 0">
      Elige una en <button class="link" onClick=${openScenePicker}>Escenas</button>.${
      f.live ? '' : html` O empieza sin ninguna:${' '}
        <button class="link" onClick=${() => goLiveScene(null)}>sin escena · solo cuadrícula</button>.`}</p>
  </div>`;
}

const ScenePanel = () => state.session.field.sceneId ? html`<${SceneBar} />` : html`<${SceneEmptyPanel} />`;

/* -------------------------------------------------------------- TvPanel */

function pickMapFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => { const f = input.files && input.files[0]; if (f) readMapImage(f); };
  input.click();
}

export function TvPanel() {
  const f = state.session.field;
  const src = urlFor(f.map?.src || null);
  const a = f.audio;
  const layers = !a ? '' : [
    a.music ? `música ${Math.round(a.music.volume * 100)}%` : '',
    a.ambience ? `ambiente ${Math.round(a.ambience.volume * 100)}%` : '',
  ].filter(Boolean).join(' · ');
  return html`<div class="tvpanel">
    <div class="fieldbar">
      ${f.grid ? html`<label>Columnas <input type="number" min="4" max="60" value=${f.cols}
        onChange=${e => updateSession(s => {
          const cols = Math.min(60, Math.max(4, Number(e.target.value) || 24));
          const field = s.session.field;
          field.cols = cols;
          const aspect = aspectOf(urlFor(field.map?.src || null), cols / field.rows);
          field.rows = deriveRows(cols, aspect);
        })} /></label>
      <span class="muted" style="font-size:.78rem">${f.rows} filas · ${metres(f.cols * 1.5)} × ${metres(f.rows * 1.5)} m</span>` : null}
      <span class="spacer"></span>
      <button class="small ghost" onClick=${pickMapFile}>${f.map ? 'Cambiar mapa' : 'Poner un mapa'}</button>
      ${f.map ? html`<button class="small ghost" onClick=${() => updateSession(s => {
        s.session.field.map = null;
      })}>Quitar</button>` : null}
      <button class="small ghost" aria-label="Cerrar este panel"
        title="Cerrar — vuelve a aparecer al soltar un mapa"
        onClick=${() => update(s => { s.ui.showTV = false; })}>✕</button>
    </div>
    ${f.map && src
      ? html`<div class="fieldbar maptune"><img class="mapthumb" src=${src} alt="" /></div>`
      : html`<p class="muted tvhint">Suelta una imagen (<code>.png</code>, <code>.jpg</code>) en cualquier
          parte para usarla de mapa. Se reduce a 1920 px de ancho y se guarda en <code>assets/maps/</code>.</p>`}
    <div class="fieldbar">
      <button class=${'small ghost' + (audioPrefs.muted ? ' on' : '')}
        title=${audioPrefs.muted ? 'Quitar el silencio' : 'Silenciar el tablero'}
        onClick=${() => { audioPrefs.muted = !audioPrefs.muted; saveAudioPrefs(); syncBoard(); update(); }}>${
        audioPrefs.muted ? '🔇' : '🔊'}</button>
      <label style="flex:1 1 12rem;min-width:0">Volumen
        <input type="range" min="0" max="1" step="0.01" value=${audioPrefs.master} disabled=${audioPrefs.muted}
          onChange=${e => { audioPrefs.master = Number(e.target.value); saveAudioPrefs(); syncBoard(); update(); }} />
        <b>${Math.round(audioPrefs.master * 100)}%</b></label>
      <span class="muted" style="font-size:.78rem">${
        !f.live ? 'Nada en el tablero'
        : !f.sceneId ? 'Sin escena, sin sonido'
        : a ? layers : 'Esta escena no trae sonido'}</span>
    </div>
    <p class="muted tvhint">El sonido sale por el tablero, no por aquí. La primera vez hay que
      <b>tocar una vez en la ventana del tablero</b>: el navegador no deja sonar nada hasta que
      alguien la ha tocado. Ella misma lo pide si hace falta.</p>
    <p class="muted tvhint">El tablero también funciona en cualquier aparato de este wifi:${' '}
      <b>${(state.lanUrl || '') + '/tv'}</b> en el navegador de la tele o de una tablet —
      el código de esta mesa es <b>${state.room || '—'}</b>.</p>
    <p class="muted tvhint">Las fichas se colocan solas. Se arrastran en el tablero, no aquí.</p>
  </div>`;
}

screens.tvPanel = TvPanel;

/* ------------------------------------------------------------- MidBoard */

function MidBoard() {
  const f = state.session.field;
  const e = state.session.encounter;
  const src = urlFor(f.map?.src || null);

  const seated = Object.entries(f.tokens)
    .map(([ref, at]) => ({ ref, at, cb: handleFor(state.session, ref) }))
    .filter(o => o.cb);

  if (state.ui.selectedToken && !seated.some(o => o.ref === state.ui.selectedToken)) {
    state.ui.selectedToken = null;
  }
  const sel = seated.find(o => o.ref === state.ui.selectedToken);

  const colourOf = ref => ref.startsWith('pc:')
    ? TOKEN_COLOURS[state.session.party.findIndex(c => 'pc:' + c.id === ref) % TOKEN_COLOURS.length]
    : null;

  const tokens = seated.map(o => {
    const npc = o.cb.kind === 'npc';
    const hidden = npc && !normaliseReveal(f.reveal[o.cb.id]).on;
    /* A loaded npc not yet in any fight shows no hp at all — it is scenery
       until something makes it a combatant. A player always shows theirs. */
    const tracked = !npc || e.members.includes(o.ref);
    const hp = tracked ? currentHP(o.cb) : null, max = tracked ? Math.max(0, o.cb.hpMax || 0) : null;
    const lit = o.ref === e.activeRef || o.ref === state.ui.selectedToken;
    return {
      key: o.ref, x: o.at.x, y: o.at.y,
      name: o.cb.name, initials: initialsOf(o.cb.name),
      portraitUrl: portraitSrc(o.cb.portrait, urlFor),
      colour: colourOf(o.ref),
      active: o.ref === e.activeRef,
      selected: o.ref === state.ui.selectedToken,
      out: tracked && max > 0 && hp <= 0,
      hidden,
      label: lit ? o.cb.name : null,
      title: o.cb.name + (tracked ? ` · ${hp}/${max} PG` : '') + (hidden ? ' · oculto en el tablero' : ''),
    };
  });

  /* Chebyshev distance — 5e 2024 counts a diagonal as one square — means the
     whole reach is a rectangle, clamped to the field's own edges. Shown
     regardless of combat. */
  const reachN = sel && sel.cb.speed != null ? Math.round(sel.cb.speed / 1.5) : null;
  const reach = reachN == null ? null : {
    x0: Math.max(0, sel.at.x - reachN), x1: Math.min(f.cols - 1, sel.at.x + reachN),
    y0: Math.max(0, sel.at.y - reachN), y1: Math.min(f.rows - 1, sel.at.y + reachN),
  };

  return html`<div class="midboard">
    <h3 class="sideh">Tablero <span class="n">${metres(f.cols * 1.5)} × ${metres(f.rows * 1.5)} m</span></h3>
    <${Field} cols=${f.cols} rows=${f.rows} mapUrl=${src} showGrid=${f.grid}
      tokens=${f.grid ? tokens : []} reach=${reach}
      onTap=${ref => update(s => {
        s.ui.selectedToken = s.ui.selectedToken === ref ? null : ref;
      })}
      onMove=${(ref, x, y) => updateSession(s => {
        const at = s.session.field.tokens[ref];
        if (at) { at.x = x; at.y = y; }
      })} />
    <p class="tip">${!f.grid
      ? 'A pantalla completa: sin cuadrícula ni fichas que mover.'
      : sel
      ? html`<b>${sel.cb.name}</b>${reachN != null
          ? ` · ${reachN} cuadros (${metres(sel.cb.speed)} m) de movimiento`
          : ' · sin velocidad en la ficha'}`
      : 'Arrastra una ficha para moverla, tócala para ver lo que alcanza. Un círculo de trazos es alguien que el tablero no enseña.'}</p>
    <${SceneControls} />
  </div>`;
}

/* ----------------------------------------------------------- the rows */

function removeNpc(id) {
  const n = npcById(state.session, id);
  commit(`quitar ${n?.name || 'un PNJ'}`, s => {
    const e = s.session.encounter;
    s.session.npcs = s.session.npcs.filter(x => x.id !== id);
    e.members = e.members.filter(r => r !== 'npc:' + id);
    delete e.init['npc:' + id];
    delete s.session.field.tokens['npc:' + id];
    delete s.session.field.reveal[id];
    if (e.activeRef === 'npc:' + id) e.activeRef = null;
    if (s.ui.selectedToken === 'npc:' + id) s.ui.selectedToken = null;
  });
}

const toggleMusterOpen = ref => update(s => {
  s.ui.musterOpen.has(ref) ? s.ui.musterOpen.delete(ref) : s.ui.musterOpen.add(ref);
});

/** One row, players and monsters alike: a name that opens the whole card
    underneath it. Nothing here is a fight membership control — that question
    moved into the muster picker. */
function RosterRow({ cb }) {
  const open = state.ui.musterOpen.has(cb.ref);
  return html`<div class=${'mrow plain' + (open ? ' open' : '')} key=${cb.ref}>
    <button class="nm" aria-expanded=${open} onClick=${() => toggleMusterOpen(cb.ref)}><b>${cb.name}</b></button>
    <span class="st">CA ${cb.ac} · ${currentHP(cb)}/${cb.hpMax} PG · inic. ${signed(cb.initMod)}</span>
    <button class="caret ghost" aria-label=${(open ? 'Cerrar' : 'Abrir') + ' la ficha de ' + cb.name}
      onClick=${() => toggleMusterOpen(cb.ref)}>${open ? '▾' : '▸'}</button>
    ${cb.kind === 'npc' ? html`<button class="small ghost" aria-label=${'Quitar ' + cb.name + ' de la mesa'}
      onClick=${() => removeNpc(cb.id)}>✕</button>` : null}
    ${open ? html`<div class="open-card"><${CbCard} cb=${cb} opts=${{ bare: true }} /></div>` : null}
  </div>`;
}

/** An npc loaded but not in the fight currently running — the tick seats it
    in the turn order, unrolled, exactly as a late player arrives. */
function SidelinedRow({ cb }) {
  const open = state.ui.musterOpen.has(cb.ref);
  return html`<div class=${'mrow' + (open ? ' open' : '')} key=${cb.ref}>
    <button class="tick" aria-label=${'Meter a ' + cb.name + ' en este combate'}
      onClick=${() => commit(`meter a ${cb.name} en el combate`, s => {
        if (!s.session.encounter.members.includes(cb.ref)) s.session.encounter.members.push(cb.ref);
      })}>+</button>
    <button class="nm" aria-expanded=${open} onClick=${() => toggleMusterOpen(cb.ref)}><b>${cb.name}</b></button>
    <span class="st">CA ${cb.ac} · ${currentHP(cb)}/${cb.hpMax} PG · inic. ${signed(cb.initMod)}</span>
    <button class="caret ghost" aria-label=${(open ? 'Cerrar' : 'Abrir') + ' la ficha de ' + cb.name}
      onClick=${() => toggleMusterOpen(cb.ref)}>${open ? '▾' : '▸'}</button>
    <button class="small ghost" aria-label=${'Quitar ' + cb.name + ' de la mesa'}
      onClick=${() => removeNpc(cb.id)}>✕</button>
    ${open ? html`<div class="open-card"><${CbCard} cb=${cb} opts=${{ bare: true }} /></div>` : null}
  </div>`;
}

/** The + in a column heading. Disabled with a reason rather than hidden. */
function AddPlus({ what }) {
  const empty = what === 'monstruo'
    ? !state.session.bestiary.length
    : !partyHandles(state.session).some(cb => !state.session.encounter.members.includes(cb.ref));
  const why = what === 'monstruo'
    ? (empty ? 'No hay PNJ todavía' : 'Añadir PNJ')
    : (empty ? 'Ya está toda la mesa en el combate' : 'Meter a alguien de la mesa');
  return html`<button class="small plus" disabled=${empty} title=${why} aria-label=${why}
    onClick=${what === 'monstruo' ? openNpcPicker : openPlayerPicker}>+</button>`;
}

/* ------------------------------------------------------------- screens */

function NothingLive() {
  return html`<main><section class="panel">
    <${ScenePanel} />
  </section></main>
  <${PickBar} />`;
}

function Muster() {
  const party = partyHandles(state.session).filter(cb => !state.session.field.benched.includes(cb.ref));
  const monsters = state.session.npcs.map(n => npcHandle(n, state.session.objects));

  const side = (title, cls, rows, empty, plus) => html`<div class=${'side ' + cls}>
    <h3 class=${'sideh ' + cls}>${title} <span class="n">${rows.length}</span>${plus || null}</h3>
    ${rows.length
      ? html`<div class="picklist">${rows.map(cb => html`<${RosterRow} cb=${cb} key=${cb.ref} />`)}</div>`
      : empty}
  </div>`;

  return html`<main><section class="panel wide">
    <div class="sides">
      ${side('Jugadores', 'pcs', party,
        html`<p class="muted">No hay fichas. Impórtalas en${' '}
          <button class="link" onClick=${() => update(s => { s.ui.tab = 'jugadores'; })}>Jugadores</button>.</p>`)}
      <${MidBoard} />
      ${side('PNJ', 'npcs', monsters,
        html`<p class="muted">Nadie cargado todavía. Tráelos de${' '}
          <button class="link" onClick=${() => update(s => { s.ui.tab = 'monstruos'; })}>PNJ</button>.</p>`,
        html`<${AddPlus} what="monstruo" />`)}
    </div>
    <div class="startbar">
      <button class="primary big" onClick=${openMusterPicker}>Empezar combate</button>
      <span class="muted">Elegirás quién entra, y si algún PNJ entra oculto, en la ventana que se abre.</span>
    </div>
  </section></main>
  <${PickBar} />`;
}

function Fight() {
  const e = state.session.encounter;
  const list = inOrder(state.session);
  const active = list.find(o => o.ref === e.activeRef);
  const pcs = list.filter(o => o.cb.kind === 'pc');
  const npcs = list.filter(o => o.cb.kind === 'npc');
  const sidelined = state.session.npcs.map(n => npcHandle(n, state.session.objects))
    .filter(cb => !e.members.includes(cb.ref));
  const pending = list.filter(o => o.init == null).length;

  const setInit = (ref, raw) => commit('editar una iniciativa', s => {
    const v = String(raw).trim();
    if (v === '' || !Number.isFinite(Number(v))) delete s.session.encounter.init[ref];
    else s.session.encounter.init[ref] = Number(v);
  });

  const column = (title, cls, rows, what, empty) => html`<div class=${'side ' + cls}>
    <h3 class=${'sideh ' + cls}>${title} <span class="n">${rows.filter(o => !skippable(o.cb)).length}</span>
      <${AddPlus} what=${what} /></h3>
    ${rows.length ? rows.map(o => html`<${CbCard} cb=${o.cb} key=${o.ref}
        opts=${{ init: o.init, editInit: true, compact: true, active: o.ref === e.activeRef,
                 onInit: v => setInit(o.ref, v) }} />`)
      : html`<p class="muted">${empty}</p>`}
    ${cls === 'npcs' && sidelined.length ? html`<div class="picklist" style="margin-top:.6rem">
      <p class="muted" style="font-size:.78rem;margin:0 0 .1rem">Cargados, fuera de este combate</p>
      ${sidelined.map(cb => html`<${SidelinedRow} cb=${cb} key=${cb.ref} />`)}
    </div>` : null}
  </div>`;

  const turn = dir => commit('cambio de turno', s => advance(s.session, dir));

  return html`<main><section class="panel wide">
    <div class="turnbar">
      <span class="round">Ronda <b>${e.round}</b></span>
      <span class="spacer"></span>
      <button class="small" onClick=${() => turn(-1)}>← Anterior</button>
      <button class="small primary" onClick=${() => turn(1)}>Siguiente →</button>
      <span class="now">${active
        ? html`Turno de <b>${active.cb.name}</b>${active.init != null ? ` · iniciativa ${active.init}` : ''}`
        : pending
          ? html`Faltan <b>${pending}</b> iniciativa${pending === 1 ? '' : 's'}. Puedes empezar igualmente.`
          : html`Pulsa <b>Siguiente</b> para empezar la ronda.`}</span>
      ${list.length ? html`<ol class="orderstrip">${list.map(o =>
        html`<li key=${o.ref} class=${(o.ref === e.activeRef ? 'now' : '') + (skippable(o.cb) ? ' out' : '') + ' ' + o.cb.kind}>
          <b>${o.init ?? '—'}</b> ${o.cb.name}</li>`)}</ol>` : null}
    </div>

    <div class="sides">
      ${column('Jugadores', 'pcs', pcs, 'jugador', 'Nadie de la mesa está en este combate.')}
      <${MidBoard} />
      ${column('PNJ', 'npcs', npcs, 'monstruo', 'No hay PNJ.')}
    </div>

    <div class="endbar">
      <button class="danger big" onClick=${() => {
        commit('terminar el combate', s => {
          endCombat(s.session);
          s.ui.rolled.clear();       // the next fight asks the table again
        });
      }}>Terminar combate</button>
      <span class="muted">Se va la ronda, el turno y las iniciativas. Los PNJ se quedan en la mesa
        exactamente donde están, y los PG, los estados y las notas de todos no se tocan.</span>
    </div>
  </section></main>
  <${PickBar} />`;
}

function Juego() {
  if (state.session.encounter.on) return html`<${Fight} />`;
  if (!state.session.field.live) return html`<${NothingLive} />`;
  return html`<${Muster} />`;
}

screens.juego = Juego;
