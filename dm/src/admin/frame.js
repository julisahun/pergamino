/* The modal shell — header, scrolling body, action bar — kept apart from
   modals.js so a dialog can borrow it without importing that module's
   pickers (which reach the tab modules, and through them app.js). */

import { html } from './html.js';
import { update } from './store.js';

export const closeModal = () => update(s => { s.ui.modal = null; });

export function ModalFrame({ title, children, acts }) {
  return html`<div class="scrim" onClick=${e => { if (e.target === e.currentTarget) closeModal(); }}>
    <div class="modal" role="dialog" aria-modal="true" aria-label=${title}>
      <h2>${title}<button class="ghost" aria-label="Cerrar" onClick=${closeModal}>✕</button></h2>
      <div class="body">${children}</div>
      <div class="acts">${acts}</div>
    </div></div>`;
}
