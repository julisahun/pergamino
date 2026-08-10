/* The renderer: one function that draws whatever board it was last handed.
   Ported from the legacy tablero, with the map already a plain URL in the
   payload — no storage stamps, nothing to read back out of anything. */

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let board = null;
let selected = null;

export function setBoard(b) {
  board = b;   // null = no table joined yet, or the table was just switched
  if (selected && !board?.tokens.some(t => t.id === selected)) selected = null;
}
export const getBoard = () => board;

/* ----------------------------------------------------------------- render */

export function render() {
  const tv = document.getElementById('tv');
  if (!board || board.mode === 'idle') {
    tv.innerHTML = `<div class="waiting">
      <b>Tablero</b>
      <span>${board ? 'Nada en el tablero todavía.' : 'Esperando a la pantalla del director.'}</span>
    </div>`;
    return;
  }

  const mapSrc = board.map && board.map.src ? board.map.src : null;

  if (board.mode === 'scene') {
    if (!board.banner && !board.order.length && !board.party.length && !board.npcs.length) {
      tv.innerHTML = mapSrc
        ? `<div class="scene" style="background-image:url(&quot;${esc(mapSrc)}&quot;)"></div>`
        : `<div class="scene none"><b>Sin imagen</b><span>Esta escena no tiene fondo.</span></div>`;
      return;
    }
    const art = mapSrc
      ? `<div class="scene-inline" style="background-image:url(&quot;${esc(mapSrc)}&quot;)"></div>`
      : `<div class="scene-inline none"><b>Sin imagen</b><span>Esta escena no tiene fondo.</span></div>`;
    tv.innerHTML = banner() + `<div class="mid">
        ${hud()}
        <div class="stage">${art}</div>
        ${orderPane()}
      </div>`;
    return;
  }

  tv.innerHTML = banner() + `<div class="mid">
      ${hud()}
      <div class="stage">${fieldHTML(mapSrc)}</div>
      ${orderPane()}
    </div>`;
  fit();
}

function banner() {
  const b = board.banner;
  if (!b) return `<div class="banner"><span class="idle">Sin combate</span></div>`;
  return `<div class="banner">
    <span class="round">Ronda <b>${b.round}</b></span>
    ${b.active ? `<span class="who"><small>turno de</small>${esc(b.active)}</span>`
      : '<span class="idle">Aún nadie ha empezado la ronda.</span>'}
  </div>`;
}

const initials = name => esc(String(name).split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase());

function orderPane() {
  if (!board.order.length) return '';
  return `<aside class="orderpane"><h2>Orden</h2>
    ${board.order.map(o => `<div class="orow${o.active ? ' active' : ''}${o.down ? ' down' : ''}">
      ${o.portrait ? `<img class="oport" src="${esc(o.portrait)}" alt="" />`
        : `<span class="oini">${initials(o.name)}</span>`}
      <span>${esc(o.name)}</span></div>`).join('')}
  </aside>`;
}

function partyRows() {
  return board.party.map(p => {
    const max = Math.max(0, p.hpMax || 0);
    const hp = Math.max(0, Math.min(max, p.hp));
    const pct = max ? Math.round(hp / max * 100) : 0;
    const tpct = max ? Math.min(100 - pct, Math.round((p.temp || 0) / max * 100)) : 0;
    const cls = hp <= 0 ? 'out' : hp * 2 <= max ? 'low' : '';
    return `<div class="pcell ${cls}" style="--tint:${esc(p.colour)}">
      ${p.portrait ? `<img class="port" src="${esc(p.portrait)}" alt="" />`
        : `<span class="ini">${initials(p.name)}</span>`}
      <span class="info">
        <span class="nm">${esc(p.name)}</span>
        <span class="bar"><i style="width:${pct}%"></i>${tpct ? `<u style="width:${tpct}%;background:var(--gold);flex:none"></u>` : ''}</span>
        <span class="num"><b>${hp}</b>/${max}${p.temp ? ` <span class="tmp">+${p.temp}</span>` : ''}</span>
      </span>
    </div>`;
  }).join('');
}

/** The same cell, for npcs. Only combat puts a bar on a row: an npc with no
    `hp` here is loaded and visible, nothing more — the same "scenery until a
    fight says otherwise" rule its token gets. */
function npcRows() {
  return board.npcs.map(n => {
    if (!n.hp) return `<div class="pcell">
      ${n.portrait ? `<img class="port" src="${esc(n.portrait)}" alt="" />`
        : `<span class="ini">${initials(n.name)}</span>`}
      <span class="info"><span class="nm">${esc(n.name)}</span></span>
    </div>`;
    const pct = Math.round(Math.max(0, Math.min(1, n.hp.pct)) * 100);
    const cls = n.hp.pct <= 0 ? 'out' : n.hp.pct <= .5 ? 'low' : '';
    return `<div class="pcell ${cls}">
      ${n.portrait ? `<img class="port" src="${esc(n.portrait)}" alt="" />`
        : `<span class="ini">${initials(n.name)}</span>`}
      <span class="info">
        <span class="nm">${esc(n.name)}</span>
        ${n.hp.mode === 'exact' ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}
        <span class="num">${n.hp.mode === 'exact' ? `<b>${n.hp.cur}</b>/${n.hp.max}` : esc(n.hp.word)}</span>
      </span>
    </div>`;
  }).join('');
}

function hud() {
  const party = board.party.length ? `<div class="rgroup"><h2>Grupo</h2>${partyRows()}</div>` : '';
  const npcs = board.npcs.length ? `<div class="rgroup"><h2>PNJ</h2>${npcRows()}</div>` : '';
  return party || npcs ? `<aside class="roster">${party}${npcs}</aside>` : '';
}

function fieldHTML(mapSrc) {
  const sel = selected ? board.tokens.find(t => t.id === selected) : null;
  const reach = sel && sel.reach != null ? sel.reach : null;

  const cells = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      const lit = sel && reach != null && !(x === sel.x && y === sel.y) &&
        Math.max(Math.abs(x - sel.x), Math.abs(y - sel.y)) <= reach;
      cells.push(`<div class="cell${lit ? ' lit' : ''}" data-cell="${x},${y}"></div>`);
    }
  }

  const at = {};
  for (const t of board.tokens) (at[t.x + ',' + t.y] ||= []).push(t.id);

  return `<div class="field" data-field-grid style="--cols:${board.cols};--rows:${board.rows}">
    ${mapSrc ? `<img class="mapimg" src="${esc(mapSrc)}" alt="" />` : ''}
    <div class="cells" style="grid-template-columns:repeat(${board.cols},1fr)">${cells.join('')}</div>
    ${board.tokens.map(t => {
      const share = at[t.x + ',' + t.y];
      return tokenHTML(t, share.indexOf(t.id), share.length);
    }).join('')}
  </div>`;
}

/** The same token the admin window draws, from the same fields. */
function tokenHTML(t, i, n) {
  const fan = n > 1
    ? `left:calc((${t.x} + ${.5 + (i % 2 ? .22 : -.22)}) * var(--sq));
       top:calc((${t.y} + ${.5 + (i > 1 ? .22 : -.22)}) * var(--sqy));
       width:calc(var(--sq) * .52);height:calc(var(--sqy) * .52)`
    : `left:calc((${t.x} + .5) * var(--sq));top:calc((${t.y} + .5) * var(--sqy))`;
  const pct = t.hp ? Math.max(0, Math.min(1, t.hp.pct)) : 1;

  return `<div class="token ${t.kind}${t.active ? ' active' : ''}${t.id === selected ? ' selected' : ''}${
      t.hp && t.hp.pct <= 0 ? ' out' : ''}"
      data-token="${esc(t.id)}" style="${fan};${t.colour ? `--tint:${t.colour}` : ''}"
      title="${esc(t.name)}">
    ${t.portrait ? `<img class="pimg" src="${esc(t.portrait)}" alt="" />` : `<span class="ini">${initials(t.name)}</span>`}
    ${t.hp && t.hp.mode === 'exact' ? `<span class="ring" style="--pct:${(pct * 100).toFixed(1)}%"></span>` : ''}
    <span class="lbl">${esc(t.name)}${t.hp && t.hp.mode === 'exact'
      ? ` <b>${t.hp.cur}/${t.hp.max}</b>` : t.hp ? ` <b>${esc(t.hp.word)}</b>` : ''}</span>
    ${t.conditions.length ? `<span class="cnd">${t.conditions.map(c =>
      `<i title="${esc(c)}">${esc(c.slice(0, 2))}</i>`).join('')}</span>` : ''}
  </div>`;
}

/* The board is sized in script rather than with aspect-ratio, because it has
   to fit *both* the width and the height left over by the banner and the
   panes flanking the stage — and CSS cannot express "whichever binds first"
   without a second wrapper per axis. The *shape* it fits to is the map
   image's own, when there is one and it has decoded — not cols/rows. */
function fit() {
  const stage = document.querySelector('.stage');
  const el = document.querySelector('.field');
  if (!stage || !el || !board) return;
  const img = el.querySelector('img.mapimg');
  const ratioW = img && img.naturalWidth ? img.naturalWidth : board.cols;
  const ratioH = img && img.naturalHeight ? img.naturalHeight : board.rows;
  const r = stage.getBoundingClientRect();
  const s = Math.min(r.width / ratioW, r.height / ratioH);
  el.style.width = Math.floor(s * ratioW) + 'px';
  el.style.height = Math.floor(s * ratioH) + 'px';
}

window.addEventListener('resize', fit);
/* `load` does not bubble, so a delegated listener catches it on the way
   down — a fresh <img> is built on every render(), and re-fits itself the
   moment it actually knows its own shape. */
document.addEventListener('load', ev => {
  if (ev.target.matches && ev.target.matches('img.mapimg')) fit();
}, true);

/* ------------------------------------------------------------------ drag
   The DM drags on this screen too — it is their second monitor, not a
   public terminal. A board that arrives mid-gesture is stashed by main.js
   (isDragging) so the token is never re-rendered out from under the hand. */

let drag = null;
export const isDragging = () => !!drag;

export function wireDrag(sendMove) {
  document.addEventListener('pointerdown', ev => {
    const tok = ev.target.closest('[data-token]');
    const grid = tok && tok.closest('[data-field-grid]');
    if (!tok || !grid) return;
    ev.preventDefault();
    /* Some televisions' browsers (and synthetic pointers) refuse capture;
       the drag still works, it just loses the pointer at the screen edge. */
    try { tok.setPointerCapture(ev.pointerId); } catch { /* best effort */ }
    drag = { id: tok.getAttribute('data-token'), el: tok, grid,
             x0: ev.clientX, y0: ev.clientY, moved: false };
    tok.classList.add('grabbed');
  });

  document.addEventListener('pointermove', ev => {
    if (!drag) return;
    const dx = ev.clientX - drag.x0, dy = ev.clientY - drag.y0;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    drag.el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const cell = cellAt(drag.grid, ev.clientX, ev.clientY);
    drag.grid.querySelectorAll('.cell.target').forEach(c => c.classList.remove('target'));
    if (cell) {
      const el = drag.grid.querySelector(`[data-cell="${cell.x},${cell.y}"]`);
      if (el) el.classList.add('target');
    }
  });

  document.addEventListener('pointerup', ev => {
    if (!drag) return;
    const d = drag; drag = null;
    d.el.classList.remove('grabbed');
    d.el.style.transform = '';
    if (!d.moved) { selected = selected === d.id ? null : d.id; render(); return; }

    const cell = cellAt(d.grid, ev.clientX, ev.clientY);
    const tok = board.tokens.find(t => t.id === d.id);
    if (cell && tok && (tok.x !== cell.x || tok.y !== cell.y)) {
      /* Optimistic: draw it where it landed now; the admin folds the move
         into the session and re-broadcasts the authoritative board. */
      tok.x = cell.x; tok.y = cell.y;
      sendMove(d.id, cell.x, cell.y);
    }
    render();
  });
}

function cellAt(grid, clientX, clientY) {
  const r = grid.getBoundingClientRect();
  const x = Math.floor((clientX - r.left) / (r.width / board.cols));
  const y = Math.floor((clientY - r.top) / (r.height / board.rows));
  if (x < 0 || y < 0 || x >= board.cols || y >= board.rows) return null;
  return { x, y };
}
