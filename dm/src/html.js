/* The one place preact and htm meet. Every component module imports `html`
   from here, so the vendor paths live in exactly one file.

   THE ONE RULE OF htm: void elements are NOT auto-closed. An `<input>`
   written without the trailing slash makes whatever follows it a *child of
   the input* and corrupts the vnode tree — the symptom is an insertBefore
   TypeError on the SECOND render, far from the template that caused it.
   Always `<input />`, `<img />`, `<br />`, `<hr />`; lint.test.js fails the
   moment one slips through. */

// @ts-ignore — vendored, minified, and shipped without type declarations.
import { h, render, Fragment, Component } from '../vendor/preact.mjs';
// @ts-ignore — same.
import htm from '../vendor/htm.mjs';

export const html = htm.bind(h);
export { h, render, Fragment, Component };
