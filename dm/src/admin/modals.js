/* The Juego modals: who walks into a fight (musterPicker), one initiative at
   a time (initWizard), loading npcs outside a fight (npcPicker), late
   players (playerPicker), and swapping the scene (scenePicker). Each is a
   component closing over a draft object that survives re-renders; opening
   one stores the component in ui.modal. */

import { html } from './html.js';
import { state, update, commit, flash } from './store.js';
import { signed } from '../rules/engine.js';
import { partyHandles, npcHandle, handleFor, currentHP } from '../shared/handles.js';
import { normaliseReveal } from '../shared/session.js';
import { loadNpc, startCombat } from '../shared/combat.js';
import { matchesFilter } from '../shared/util.js';
import { SceneCard } from './escenas.js';
import { goLiveScene } from './juego.js';
import { qrToCanvas } from '../shared/qr.js';

const close = () => update(s => { s.ui.modal = null; });

export function ModalFrame({ title, children, acts }) {
  return html`<div class="scrim" onClick=${e => { if (e.target === e.currentTarget) close(); }}>
    <div class="modal" role="dialog" aria-modal="true" aria-label=${title}>
      <h2>${title}<button class="ghost" aria-label="Cerrar" onClick=${close}>✕</button></h2>
      <div class="body">${children}</div>
      <div class="acts">${acts}</div>
    </div></div>`;
}

/* -------------------------------------------------------- connect the TV
   The television is any browser on the wifi. The address only lived in a
   hover tooltip before; a tablet or a phone joins by scanning, a smart TV
   by reading the address off the DM's screen. */

export function openConnectModal() {
  update(s => { s.ui.modal = () => ConnectModal(); });
}

function ConnectModal() {
  const room = state.room || '';
  const url = `${state.lanUrl || location.origin}/tv?room=${room}`;
  return html`<${ModalFrame} title="Conectar la tele" acts=${html`
      <button class="ghost" onClick=${close}>Cerrar</button>
      <button class="primary" onClick=${() => { window.open(`/tv?room=${room}`, 'tablero'); close(); }}>Abrir aquí ↗</button>`}>
    <p>Cualquier aparato vale de tablero: escanea el código con su cámara —
      o abre <b>${(state.lanUrl || location.origin) + '/tv'}</b> en su
      navegador y teclea el código de esta mesa.</p>
    <p style="text-align:center;font-size:1.6rem;letter-spacing:.35em;margin:.4rem 0"><b>${room}</b></p>
    <div class="connect">
      <canvas ref=${el => { if (el) qrToCanvas(el, url); }}></canvas>
      <p class="url">${url}</p>
    </div>
  </>`;
}

/* ------------------------------------------------------------ npcPicker */

export function openNpcPicker() {
  const counts = new Map();
  update(s => { s.ui.modal = () => NpcPicker(counts); });
}

function stepCount(counts, id, how) {
  const now = counts.get(id) || 0;
  const next = how === 'toggle' ? (now ? 0 : 1) : Math.min(20, Math.max(0, now + how));
  if (next) counts.set(id, next); else counts.delete(id);
  update();
  return next;
}

function NpcPicker(counts) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const commitAdd = () => {
    if (!total) return;
    commit(`cargar ${total} PNJ`, s => {
      for (const [id, n] of counts) {
        const b = s.session.bestiary.find(x => x.id === id);
        if (b) loadNpc(s.session, b, n);
      }
      s.ui.modal = null;
    });
    flash(`${total} PNJ en la mesa.`);
  };
  return html`<${ModalFrame} title="Cargar PNJ" acts=${html`
      <span class="count">${total ? `${total} PNJ` : 'Nada elegido todavía'}</span>
      <button class="ghost" onClick=${close}>Cancelar</button>
      <button class="primary" disabled=${!total} onClick=${commitAdd}>Cargar</button>`}>
    ${state.session.bestiary.length
      ? state.session.bestiary.map(b => {
          const n = counts.get(b.id) || 0;
          return html`<div class=${'pickrow' + (n ? ' on' : '')} key=${b.id}>
            <button class=${'tick' + (n ? ' on' : '')} aria-pressed=${!!n} aria-label=${b.name}
              onClick=${() => stepCount(counts, b.id, 'toggle')}>${n ? '✓' : ''}</button>
            <button class="nm" onClick=${() => stepCount(counts, b.id, 'toggle')}><b>${b.name}</b>${
              b.tag ? html` <span class="muted" style="font-size:.78rem">· ${b.tag}</span>` : null}</button>
            <span class="st">CA ${b.ac} · ${b.hpMax} PG · iniciativa ${signed(b.initMod)}</span>
            <span class="stepper">
              <button class="ghost" aria-label="Uno menos" onClick=${() => stepCount(counts, b.id, -1)}>−</button>
              <b>${n}</b>
              <button class="ghost" aria-label="Uno más" onClick=${() => stepCount(counts, b.id, 1)}>+</button>
            </span>
          </div>`;
        })
      : html`<p class="muted">No hay PNJ todavía. Se escriben en${' '}
          <button class="link" onClick=${() => update(s => { s.ui.tab = 'monstruos'; s.ui.modal = null; })}>PNJ</button>.</p>`}
  </>`;
}

/* --------------------------------------------------------- playerPicker */

export function openPlayerPicker() {
  const refs = new Set();
  update(s => { s.ui.modal = () => PlayerPicker(refs); });
}

function PlayerPicker(refs) {
  const out = partyHandles(state.session)
    .filter(cb => !state.session.encounter.members.includes(cb.ref)
               && !state.session.field.benched.includes(cb.ref));
  const commitAdd = () => {
    if (!refs.size) return;
    commit(`meter a ${refs.size} en el combate`, s => {
      for (const ref of refs) {
        if (!s.session.encounter.members.includes(ref)) s.session.encounter.members.push(ref);
      }
      s.ui.modal = null;
    });
  };
  return html`<${ModalFrame} title="Meter jugadores" acts=${html`
      <span class="count">${refs.size
        ? `${refs.size} jugador${refs.size === 1 ? '' : 'es'}` : 'Nadie elegido todavía'}</span>
      <button class="ghost" onClick=${close}>Cancelar</button>
      <button class="primary" disabled=${!refs.size} onClick=${commitAdd}>Meter</button>`}>
    ${out.length ? out.map(cb => {
        const on = refs.has(cb.ref);
        const toggle = () => { on ? refs.delete(cb.ref) : refs.add(cb.ref); update(); };
        return html`<div class=${'pickrow' + (on ? ' on' : '')} key=${cb.ref}>
          <button class=${'tick' + (on ? ' on' : '')} aria-pressed=${on} aria-label=${cb.name}
            onClick=${toggle}>${on ? '✓' : ''}</button>
          <button class="nm" onClick=${toggle}><b>${cb.name}</b></button>
          <span class="st">CA ${cb.ac} · ${currentHP(cb)}/${cb.hpMax} PG · iniciativa ${signed(cb.initMod)}</span>
        </div>`;
      })
      : html`<p class="muted">Toda la mesa está ya en el combate.</p>`}
  </>`;
}

/* ---------------------------------------------------------- scenePicker */

export function openScenePicker() {
  update(s => { s.ui.modal = () => ScenePicker(); });
}

function ScenePicker() {
  return html`<${ModalFrame} title="Cambiar escena" acts=${html`
      <span class="spacer" style="flex:1"></span>
      <button class="ghost" onClick=${() => { goLiveScene(null); close(); }}>Sin escena</button>
      <button class="ghost" onClick=${close}>Cerrar</button>`}>
    ${state.scenes.length
      ? html`<div class="scenegrid">${state.scenes.map(s =>
          html`<${SceneCard} scene=${s} key=${s.id}
            onGoLive=${scene => { goLiveScene(scene); close(); }} />`)}</div>`
      : html`<p class="muted">No hay escenas todavía. Se crean en la pestaña <b>Escenas</b>,
          o dejando un <code>.json</code> en <code>scenarios/</code>.</p>`}
  </>`;
}

/* --------------------------------------------------------- musterPicker
   Empezar combate opens this instead of starting anything: who walks into a
   fight is asked here, every time. Both sides are the same two questions —
   is this one in, and (npc only) does the table see it yet. */

export function openMusterPicker() {
  const draft = { refs: new Set(), hidden: new Set(), counts: new Map(), filter: '' };
  update(s => { s.ui.modal = () => MusterPicker(draft); });
}

function MusterPicker(draft) {
  const q = draft.filter;
  /* A row you already ticked never disappears under its own search. */
  const matches = cb => matchesFilter(cb.name, q) || draft.refs.has(cb.ref);

  const party = partyHandles(state.session).filter(matches);
  const onScene = party.filter(cb => !state.session.field.benched.includes(cb.ref));
  const offScene = party.filter(cb => state.session.field.benched.includes(cb.ref));
  const npcs = state.session.npcs.map(npcHandle).filter(matches);
  const unloaded = state.session.bestiary.filter(b =>
    matchesFilter(`${b.name} ${b.tag || ''}`, q) || draft.counts.get(b.id));

  const anyChosen = draft.refs.size || [...draft.counts.values()].some(n => n > 0);
  const noMatches = q.trim() && !party.length && !npcs.length && !unloaded.length;

  const pick = ref => {
    if (draft.refs.has(ref)) { draft.refs.delete(ref); draft.hidden.delete(ref); }
    else draft.refs.add(ref);
    update();
  };
  const hide = ref => { draft.hidden.has(ref) ? draft.hidden.delete(ref) : draft.hidden.add(ref); update(); };
  const beastStep = (id, how) => {
    const next = stepCount(draft.counts, id, how);
    if (!next) draft.hidden.delete('bestiary:' + id);
  };

  /* Visible unless the DM says otherwise: hiding one — an ambush, a lurker —
     is the one extra tap, not the default everybody has to remember to undo. */
  const hideToggle = ref => html`<button type="button" class="small ghost"
    aria-pressed=${draft.hidden.has(ref)}
    title=${draft.hidden.has(ref) ? 'Entra oculto — no se revela a los jugadores' : 'Entra visible para los jugadores'}
    onClick=${() => hide(ref)}>${draft.hidden.has(ref) ? '🙈 Oculto' : '👁 Visible'}</button>`;

  const pcRow = cb => {
    const on = draft.refs.has(cb.ref);
    const benched = state.session.field.benched.includes(cb.ref);
    return html`<div class=${'pickrow' + (on ? ' on' : '')} key=${cb.ref}>
      <button class=${'tick' + (on ? ' on' : '')} aria-pressed=${on} aria-label=${cb.name}
        onClick=${() => pick(cb.ref)}>${on ? '✓' : ''}</button>
      <button class="nm" onClick=${() => pick(cb.ref)}><b>${cb.name}</b></button>
      <span class="st withtoggle">
        <span>CA ${cb.ac} · ${currentHP(cb)}/${cb.hpMax} PG · inic. ${signed(cb.initMod)}</span>
        <button type="button" class="small ghost"
          title=${benched ? 'Volver a la mesa' : 'Quitar de la mesa'}
          onClick=${() => commit(`banquillo: ${cb.name}`, s => {
            const b = s.session.field.benched;
            if (benched) s.session.field.benched = b.filter(r => r !== cb.ref);
            else { b.push(cb.ref); delete s.session.field.tokens[cb.ref]; }
          })}>${benched ? '↩ Volver' : '✕ Quitar'}</button>
      </span>
    </div>`;
  };

  const npcRow = cb => {
    const on = draft.refs.has(cb.ref);
    return html`<div class=${'pickrow' + (on ? ' on' : '')} key=${cb.ref}>
      <button class=${'tick' + (on ? ' on' : '')} aria-pressed=${on} aria-label=${cb.name}
        onClick=${() => pick(cb.ref)}>${on ? '✓' : ''}</button>
      <button class="nm" onClick=${() => pick(cb.ref)}><b>${cb.name}</b></button>
      <span class="st withtoggle">
        <span>CA ${cb.ac} · ${cb.hpMax} PG</span>
        ${hideToggle(cb.ref)}
      </span>
    </div>`;
  };

  const beastRow = b => {
    const n = draft.counts.get(b.id) || 0;
    return html`<div class=${'pickrow' + (n ? ' on' : '')} key=${b.id}>
      <button class=${'tick' + (n ? ' on' : '')} aria-pressed=${!!n} aria-label=${b.name}
        onClick=${() => beastStep(b.id, 'toggle')}>${n ? '✓' : ''}</button>
      <button class="nm" onClick=${() => beastStep(b.id, 'toggle')}><b>${b.name}</b>${
        b.tag ? html` <span class="muted" style="font-size:.78rem">· ${b.tag}</span>` : null}</button>
      <span class="st withtoggle">
        <span class="stepper">
          <button class="ghost" aria-label="Uno menos" onClick=${() => beastStep(b.id, -1)}>−</button>
          <b>${n}</b>
          <button class="ghost" aria-label="Uno más" onClick=${() => beastStep(b.id, 1)}>+</button>
        </span>
        ${hideToggle('bestiary:' + b.id)}
      </span>
    </div>`;
  };

  /* The picker's own commit: spawn whatever was still just a count, fold
     every hide flag into field.reveal — the same switch the ◉/○ toggle on a
     card uses — then hand the whole roster to the initiative wizard. */
  const confirm = () => {
    if (!anyChosen) return;
    const refs = new Set(draft.refs);
    commit('elegir el combate', s => {
      for (const [id, n] of draft.counts) {
        if (!n) continue;
        const b = s.session.bestiary.find(x => x.id === id);
        if (!b) continue;
        const hiddenBatch = draft.hidden.has('bestiary:' + id);
        for (const ref of loadNpc(s.session, b, n)) {
          refs.add(ref);
          if (hiddenBatch) draft.hidden.add(ref);
        }
      }
      for (const ref of refs) {
        if (!ref.startsWith('npc:')) continue;
        const id = ref.slice(4);
        const r = s.session.field.reveal[id] = normaliseReveal(s.session.field.reveal[id]);
        r.on = !draft.hidden.has(ref);
      }
    });
    openInitWizard([...refs]);
  };

  return html`<${ModalFrame} title="Elegir quién entra en combate" acts=${html`
      <span class="count">${anyChosen ? 'Elegido para esta lucha' : 'Nadie elegido todavía'}</span>
      <button class="ghost" onClick=${close}>Cancelar</button>
      <button class="primary" disabled=${!anyChosen} onClick=${confirm}>Elegir iniciativas</button>`}>
    <div class="filterbar">
      <input type="text" placeholder="Buscar por nombre…" value=${q}
        onInput=${e => { draft.filter = e.target.value; update(); }} />
    </div>
    ${noMatches ? html`<p class="muted">Nada llamado «${q.trim()}».</p>` : html`<div class="musterpick">
      <div class="pickcol">
        <h3>Jugadores</h3>
        ${party.length ? null : html`<p class="muted">${q.trim() ? 'Ninguno coincide.' : 'No hay fichas.'}</p>`}
        ${onScene.map(pcRow)}
        ${offScene.length ? html`<p class="muted" style="font-size:.78rem;margin:.5rem 0 .1rem">Fuera de la mesa</p>
          ${offScene.map(pcRow)}` : null}
      </div>
      <div class="pickcol">
        <h3>PNJ</h3>
        ${npcs.length ? npcs.map(npcRow)
          : !unloaded.length && !q.trim() ? html`<p class="muted">Nadie cargado todavía.</p>` : null}
        ${unloaded.length ? html`<p class="muted" style="font-size:.78rem;margin:.5rem 0 .1rem">Sin cargar todavía</p>
          ${unloaded.map(beastRow)}`
          : (npcs.length || q.trim() ? null : html`<p class="muted">Escríbelos primero en${' '}
              <button class="link" onClick=${() => update(s => { s.ui.tab = 'monstruos'; s.ui.modal = null; })}>PNJ</button>.</p>`)}
      </div>
    </div>`}
  </>`;
}

/* ----------------------------------------------------------- initWizard
   At the table the numbers arrive one at a time, going round: a name is
   said, a number is said, the next player speaks. So the wizard asks the
   same way. `state.ui.rolled` outlives the modal — closing it by accident
   four names in should not mean asking the table again; endCombat() is what
   forgets the numbers. */

/** The queue: the players in table order, then the npcs in add order. */
function initQueue(refs) {
  const order = [
    ...partyHandles(state.session).map(cb => cb.ref),
    ...state.session.npcs.map(n => 'npc:' + n.id),
  ];
  return [...new Set(order)].filter(r => refs.includes(r) && handleFor(state.session, r));
}

export function openInitWizard(refs) {
  const queue = initQueue(refs);
  for (const ref of [...state.ui.rolled.keys()]) if (!queue.includes(ref)) state.ui.rolled.delete(ref);
  const draft = { queue, at: 0 };
  update(s => { s.ui.modal = () => InitWizard(draft); });
}

function InitWizard(draft) {
  const q = draft.queue;
  const vals = state.ui.rolled;
  const ref = q[draft.at];
  const cb = handleFor(state.session, ref);
  const last = draft.at >= q.length - 1;
  const val = vals.has(ref) ? vals.get(ref) : '';
  const done = q.filter(r => vals.has(r)).length;

  /* A number is committed when you leave the step, never on the keystroke —
     re-rendering under a caret is how a digit gets lost. */
  const commitBox = () => {
    const box = document.querySelector('.modal input[name="init"]');
    if (!box) return;
    const raw = box.value.trim();
    if (raw === '' || !Number.isFinite(Number(raw))) vals.delete(ref);
    else vals.set(ref, Number(raw));
  };
  const step = to => {
    commitBox();
    draft.at = Math.min(q.length - 1, Math.max(0, to));
    update();
    const box = document.querySelector('.modal input[name="init"]');
    if (box) { box.focus(); box.select(); }
  };
  const start = () => {
    commitBox();
    commit('empezar el combate', s => {
      startCombat(s.session, [...q], vals);
      s.ui.modal = null;
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return html`<${ModalFrame} title="Iniciativas" acts=${html`
      <span class="count">${done} de ${q.length} ${done === 1 ? 'apuntada' : 'apuntadas'}</span>
      <button class="ghost" disabled=${!draft.at} onClick=${() => step(draft.at - 1)}>← Atrás</button>
      ${last
        ? html`<button class="primary" onClick=${start}>Empezar combate</button>`
        : html`<button class="ghost small" onClick=${start}>Empezar ya</button>
          <button class="primary" onClick=${() => step(draft.at + 1)}>Siguiente →</button>`}`}>
    <div class="initstep">
      <span class="sub">${draft.at + 1} de ${q.length}</span>
      <b class="nm">${cb.name}</b>
      <span class="sub">${cb.kind === 'pc' ? 'jugador' : 'PNJ'} · modificador ${signed(cb.initMod || 0)}</span>
      <input name="init" type="number" inputmode="numeric" defaultValue=${val} placeholder="—"
        key=${ref} aria-label=${'Iniciativa de ' + cb.name}
        onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); last ? start() : step(draft.at + 1); } }} />
      <p class="hint">Escribe el total que ha sacado y pulsa Intro.
        Déjalo en blanco si todavía no ha tirado.</p>
    </div>
    <ol class="initqueue">${q.map((r, i) => {
      const h = handleFor(state.session, r);
      return html`<li class=${h.kind + (i === draft.at ? ' now' : '')} key=${r}>
        <button onClick=${() => step(i)}>${vals.has(r) ? html`<b>${vals.get(r)}</b> ` : null}${h.name}</button></li>`;
    })}</ol>
  </>`;
}
