/* The modal shell — header, scrolling body, action bar — kept apart from
   modals.js so a dialog can borrow it without importing that module's
   pickers (which reach the tab modules, and through them app.js). */

import { html } from './html.js';
import { update } from './store.js';

export const closeModal = () => update(s => { s.ui.modal = null; });

/** `onSubmit` makes the shell itself the `<form>`, so a wizard's Guardar can
    sit in the action bar and still submit (and still trip `required`) while
    the header, the scrolling body and that bar stay the frame's own three
    children — which is what the `.modal > *` padding rules key off. Every
    other button inside then needs an explicit `type="button"`. */
export function ModalFrame({ title, children, acts, onSubmit }) {
  const Shell = onSubmit ? 'form' : 'div';
  return html`<div class="scrim" onClick=${e => { if (e.target === e.currentTarget) closeModal(); }}>
    <${Shell} class="modal" role="dialog" aria-modal="true" aria-label=${title}
      onSubmit=${onSubmit && (e => { e.preventDefault(); onSubmit(e.target); })}>
      <h2>${title}<button type="button" class="ghost" aria-label="Cerrar" onClick=${closeModal}>✕</button></h2>
      <div class="body">${children}</div>
      <div class="acts">${acts}</div>
    <//></div>`;
}
