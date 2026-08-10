/* The small board — the admin's view of the same field the television
   draws. One component for the live table (backed by session.field.tokens)
   and the scene editor's Reparto board (backed by the draft's roster):
   same geometry, same drag feel, different onMove.

   Pointer events rather than HTML5 drag-and-drop: one path for mouse and
   touch, no drag ghost, and no re-render in the middle of the gesture — the
   token moves with a transform while the hand is down and is only committed
   on release, so a drag costs one render rather than sixty. A tap that does
   not travel (under 4px) is a selection, not a move. */

import { html, Component } from './html.js';

/** Which square a point is over. The containing block of an absolutely
    positioned child is the *padding* box, so the border comes off both the
    origin and the length — a 1px border is a tenth of a square at this size
    and the drop lands next door without it. */
function cellAt(grid, cols, rows, clientX, clientY) {
  const r = grid.getBoundingClientRect();
  const b = parseFloat(getComputedStyle(grid).borderLeftWidth) || 0;
  const w = (r.width - 2 * b) / cols, h = (r.height - 2 * b) / rows;
  const x = Math.floor((clientX - r.left - b) / w), y = Math.floor((clientY - r.top - b) / h);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
  return { x, y };
}

/* Two goblins in one square is a normal Tuesday, so a shared square fans its
   tokens instead of hiding all but the last one drawn. */
function place(t, share) {
  const i = share.indexOf(t.key), n = share.length;
  return n > 1
    ? `left:calc((${t.x} + ${.5 + (i % 2 ? .22 : -.22)}) * var(--sq));`
      + `top:calc((${t.y} + ${.5 + (i > 1 ? .22 : -.22)}) * var(--sqy));`
      + `width:calc(var(--sq) * .5);height:calc(var(--sqy) * .5)`
    : `left:calc((${t.x} + .5) * var(--sq));top:calc((${t.y} + .5) * var(--sqy))`;
}

/**
 * props:
 *   cols, rows        grid size
 *   mapUrl            background art URL or null
 *   showGrid          false = full-bleed art, no tokens
 *   tokens            [{ key, x, y, name, initials, portraitUrl, colour,
 *                        active, selected, out, hidden, label, title }]
 *   reach             { x0, y0, x1, y1 } | null — the lit rectangle
 *   onMove(key, x, y) drop committed
 *   onTap(key)        tap without travel (omit for the roster board)
 *   roster            true = the editor's board (marks the container class)
 */
export class Field extends Component {
  down = e => {
    const tok = e.target.closest('[data-token]');
    const grid = this.base;
    if (!tok || !grid) return;
    e.preventDefault();
    try { tok.setPointerCapture(e.pointerId); } catch { /* synthetic or odd browser */ }
    this.drag = { key: tok.getAttribute('data-token'), el: tok,
                  x0: e.clientX, y0: e.clientY, moved: false };
    tok.classList.add('grabbed');
  };

  move = e => {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    d.el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const cell = cellAt(this.base, this.props.cols, this.props.rows, e.clientX, e.clientY);
    const mark = this.base.querySelector('.target');
    if (!mark) return;
    mark.hidden = !cell || !d.moved;
    if (cell) mark.style.cssText =
      `left:calc(${cell.x} * var(--sq));top:calc(${cell.y} * var(--sqy));`
      + 'width:var(--sq);height:var(--sqy)';
  };

  up = e => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.el.classList.remove('grabbed');
    d.el.style.transform = '';
    const mark = this.base.querySelector('.target');
    if (mark) mark.hidden = true;
    if (!d.moved) {
      if (this.props.onTap) this.props.onTap(d.key);
      return;
    }
    const cell = cellAt(this.base, this.props.cols, this.props.rows, e.clientX, e.clientY);
    if (cell && this.props.onMove) this.props.onMove(d.key, cell.x, cell.y);
  };

  render({ cols, rows, mapUrl, showGrid = true, tokens = [], reach = null, roster = false }) {
    const at = {};
    for (const t of tokens) (at[t.x + ',' + t.y] ||= []).push(t.key);

    const token = t => html`<div key=${t.key} data-token=${t.key}
        class=${'token' + (t.active ? ' active' : '') + (t.selected ? ' selected' : '')
          + (t.out ? ' out' : '') + (t.hidden ? ' hidden' : '')}
        style=${place(t, at[t.x + ',' + t.y]) + (t.colour ? `;--tint:${t.colour}` : '')}
        title=${t.title || t.name}>
      ${t.portraitUrl ? html`<img class="pimg" src=${t.portraitUrl} alt="" />`
        : html`<span class="ini">${t.initials}</span>`}
      ${t.label ? html`<span class="lbl">${t.label}</span>` : null}</div>`;

    /* No forced aspect-ratio when there is an image: the <img> sizes the
       container by being in flow, at its own natural proportions, so the
       grid overlaid on it can never span past where the picture actually
       is. Only a grid with nothing to show needs telling what shape to be. */
    return html`<div class=${'minifield' + (roster ? ' roster' : '')}
        style=${`--sq:calc(100% / ${cols});--sqy:calc(100% / ${rows})`
          + (mapUrl ? '' : `;aspect-ratio:${cols} / ${rows}`)}
        onPointerDown=${this.down} onPointerMove=${this.move}
        onPointerUp=${this.up} onPointerCancel=${this.up}>
      ${mapUrl ? html`<img class="mapimg" src=${mapUrl} alt="" />` : null}
      ${showGrid ? html`
        <div class="grid" style=${`background-size:calc(100% / ${cols}) calc(100% / ${rows})`}></div>
        ${reach ? html`<div class="reach" style=${`left:calc(${reach.x0} * var(--sq));top:calc(${reach.y0} * var(--sqy));`
          + `width:calc(${reach.x1 - reach.x0 + 1} * var(--sq));height:calc(${reach.y1 - reach.y0 + 1} * var(--sqy))`}></div>` : null}
        <div class="target" hidden></div>
        ${tokens.map(token)}` : null}
    </div>`;
  }
}

export const initialsOf = name => String(name || '').trim().split(/\s+/).slice(0, 2)
  .map(w => w[0] || '').join('').toUpperCase();
