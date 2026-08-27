/* The television's renderer — and the admin's mirror, because they are the
   same component drawing the same object.

   Invariant 4 in code: the admin does not own a second view that resembles the
   television. It renders this, with the projection it just built for audience
   'dm'. If the two ever disagree it is because the payload differs, which is a
   thing you can print, rather than because two renderers drifted.

   Sizes are container units (cqh/cqw), not viewport units, so the same
   component is right at 55 inches and in a 20rem panel with no second
   stylesheet and nothing to configure. Whoever mounts it owns a
   `container-type: size` box. */

/** @import { Projection } from '../types.js' */

import { html } from '../../html.js';
import { modeLabel } from '../field.js';

/* ---------------------------------------------------------------- drag
   One code path for mouse and touch (pointer events), used by both windows:
   the DM drags on the admin's board, and anyone can drag on the television —
   the position is the one thing that flows back the other way.

   A tap that moves less than four pixels SELECTS instead, which lights the
   creature's reach. That threshold is what makes a board usable with a finger:
   without it, every tap is a one-pixel drag. */

const TAP = 4;
/** @type {{ref: string, el: HTMLElement, x: number, y: number, moved: boolean}|null} */
let drag = null;

/** The square under a pointer, in field coordinates. The field's own border is
    subtracted first: getBoundingClientRect() measures the border box, while
    the squares are laid out inside the padding box, and mixing the two puts
    every drop one square off near the edges. */
function squareAt(/** @type {Element} */ field, /** @type {number} */ clientX,
                  /** @type {number} */ clientY, /** @type {number} */ cols,
                  /** @type {number} */ rows) {
  const r = field.getBoundingClientRect();
  const cs = getComputedStyle(field);
  const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
  const br = parseFloat(cs.borderRightWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
  const w = r.width - bl - br, h = r.height - bt - bb;
  const x = Math.floor(((clientX - r.left - bl) / w) * cols);
  const y = Math.floor(((clientY - r.top - bt) / h) * rows);
  return {
    x: Math.max(0, Math.min(cols - 1, x)),
    y: Math.max(0, Math.min(rows - 1, y)),
  };
}

/** @param {PointerEvent} e @param {any} t @param {any} api @param {Projection} p */
function startDrag(e, t, api, p) {
  if (!api?.onMove) return;
  const el = /** @type {HTMLElement} */ (e.currentTarget);
  const field = el.closest('.field');
  if (!field) return;
  drag = { ref: t.id, el, x: e.clientX, y: e.clientY, moved: false };
  /* Throws on synthetic pointers and on some television browsers — the drag
     works without it, so it is a nicety, not a requirement. */
  try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }

  const move = (/** @type {PointerEvent} */ ev) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(ev.clientX - drag.x) < TAP
        && Math.abs(ev.clientY - drag.y) < TAP) return;
    drag.moved = true;
    const at = squareAt(field, ev.clientX, ev.clientY, p.cols, p.rows);
    api.onMove(t.id, at.x, at.y);
  };
  const up = (/** @type {PointerEvent} */ ev) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    if (drag && !drag.moved) api.onSelect?.(api.selected === t.id ? null : t.id);
    drag = null;
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

/** @param {{p: Projection|null, urlFor: (path: string) => string|null,
             api?: {onMove?: (ref: string, x: number, y: number) => void,
                    onSelect?: (ref: string|null) => void, selected?: string|null}}} props */
export function Tablero({ p, urlFor, api }) {
  if (!p) {
    return html`<div class="tb waiting">
      <b class="dsp">Tablero</b>
      <span>Esperando a la pantalla del director.</span>
    </div>`;
  }

  if (p.mode === 'nada') {
    /* The players' screen when the DM is showing nothing. Quiet on purpose —
       an empty parchment reads as "between scenes", not as "broken". */
    return html`<div class="tb nada"><span class="orn">❦</span></div>`;
  }

  const src = p.map ? urlFor(p.map.src) : null;
  const missing = !!p.map && !src;

  const stage = p.mode === 'escena'
    ? html`<${Art} src=${src} missing=${missing} />`
    : html`<${Field} p=${p} src=${src} api=${api} />`;

  return html`<div class="tb ${p.mode}">
    ${p.banner && html`<${Banner} b=${p.banner} />`}
    <div class="mid">
      ${p.hud && html`<${Roster} party=${p.party} npcs=${p.npcs} urlFor=${urlFor} />`}
      <div class="stage">${stage}</div>
      ${p.hud && html`<${Order} order=${p.order} urlFor=${urlFor} />`}
    </div>
  </div>`;
}

/** @param {{src: string|null, missing: boolean}} props */
function Art({ src, missing }) {
  if (src) return html`<div class="art" style=${{ backgroundImage: `url("${src}")` }}></div>`;
  return html`<div class="art none">
    <b class="dsp">Sin imagen</b>
    <span>${missing ? 'No se encuentra el archivo.' : 'Esta escena no tiene fondo.'}</span>
  </div>`;
}

/** The grid. Its shape comes from the projection's own cols/rows, so a token's
    square is square by construction rather than by arithmetic at every use.
    @param {{p: Projection, src: string|null, api?: any}} props */
function Field({ p, src, api }) {
  const selected = api?.selected ? p.tokens.find(t => t.id === api.selected) : null;
  const style = {
    aspectRatio: `${p.cols} / ${p.rows}`,
    backgroundImage: src ? `url("${src}")` : undefined,
    '--cols': String(p.cols),
    '--rows': String(p.rows),
  };
  return html`<div class="field" style=${style}>
    <div class="lines"></div>
    ${selected && selected.reach != null && html`<div class="reach" style=${{
      /* Chebyshev reach IS a square, so it is one box rather than a hundred
         highlighted cells: the diagonal costs what the straight line costs. */
      '--x': String(Math.max(0, selected.x - selected.reach)),
      '--y': String(Math.max(0, selected.y - selected.reach)),
      '--w': String(Math.min(p.cols, selected.x + selected.reach + 1)
                    - Math.max(0, selected.x - selected.reach)),
      '--h': String(Math.min(p.rows, selected.y + selected.reach + 1)
                    - Math.max(0, selected.y - selected.reach)),
    }}></div>`}
    ${p.tokens.map(t => html`<div
      class="token ${t.kind} ${t.active ? 'active' : ''} ${t.hidden ? 'hidden' : ''} ${
        api?.selected === t.id ? 'sel' : ''}"
      key=${t.id}
      onPointerDown=${(/** @type {PointerEvent} */ e) => startDrag(e, t, api, p)}
      style=${{ '--x': String(t.x), '--y': String(t.y),
                '--ink': t.colour || 'var(--ink-soft)' }}>
      <span class="name">${t.name}</span>
      ${t.hp && html`<span class="thp">${t.hp.mode === 'exact'
        ? `${t.hp.cur}/${t.hp.max}` : t.hp.word}</span>`}
      ${t.conditions.length > 0 && html`<span class="tcond" title=${t.conditions.join(', ')}>
        ${t.conditions.length}
      </span>`}
    </div>`)}
  </div>`;
}

/** @param {{b: {round: number, active: string|null}}} props */
function Banner({ b }) {
  return html`<div class="banner">
    <span class="round dsp">Ronda <b>${b.round}</b></span>
    ${b.active && html`<span class="who dsp"><small>turno de</small>${b.active}</span>`}
  </div>`;
}

/** @param {{party: Projection['party'], npcs: Projection['npcs'],
             urlFor: (p: string) => string|null}} props */
function Roster({ party, npcs, urlFor }) {
  return html`<div class="pane roster">
    ${party.map(c => html`<div class="who" key=${c.name}>
      ${c.portrait && html`<img class="face" src=${urlFor(c.portrait) || c.portrait} alt="" />`}
      <span class="nm" style=${{ '--ink': c.colour }}>${c.name}</span>
      <span class="hp">${c.hp}<small>/${c.hpMax}</small>${c.temp ? html`<em>+${c.temp}</em>` : null}</span>
      ${c.state && html`<span class="state">${c.state}</span>`}
    </div>`)}
    ${npcs.map(n => html`<div class="who npc ${n.hidden ? 'hidden' : ''}" key=${n.name}>
      ${n.portrait && html`<img class="face" src=${urlFor(n.portrait) || n.portrait} alt="" />`}
      <span class="nm">${n.name}</span>
      ${n.hp && html`<span class="hp">
        ${n.hp.mode === 'exact' ? `${n.hp.cur}/${n.hp.max}` : n.hp.word}</span>`}
    </div>`)}
  </div>`;
}

/** @param {{order: Projection['order'], urlFor: (p: string) => string|null}} props */
function Order({ order, urlFor }) {
  if (!order.length) return html`<div class="pane orderpane"></div>`;
  return html`<div class="pane orderpane">
    ${order.map((o, i) => html`<div
      class="turn ${o.active ? 'active' : ''} ${o.down ? 'down' : ''} ${o.hidden ? 'hidden' : ''}"
      key=${o.name + i}>
      ${o.portrait && html`<img class="face" src=${urlFor(o.portrait) || o.portrait} alt="" />`}
      <span class="nm">${o.name}</span>
    </div>`)}
  </div>`;
}

/** What the DM's own screen says the television is doing, in the television's
    own words. Not a second vocabulary: it reads `mode` and `hud` off the very
    payload the other window received. @param {{p: Projection|null, paused: boolean}} props */
export function TeleState({ p, paused }) {
  if (!p) return html`<span class="tele-state">Sin proyección</span>`;
  return html`<span class="tele-state">
    <b>${modeLabel(p.mode)}</b>${p.hud ? ' · con fichas' : ''}${paused ? ' · en pausa' : ''}
  </span>`;
}
