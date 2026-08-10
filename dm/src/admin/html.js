/* The one place preact + htm meet. Every component module imports `html`
   from here, so the vendor paths live in exactly one file.

   THE ONE RULE OF htm: void elements are NOT auto-closed. An input tag
   written without the trailing slash makes whatever follows it a *child of
   the input* and corrupts the vnode tree (the symptom is an insertBefore
   TypeError on the second render). Always `<input />`, `<img />`, `<br />`,
   `<hr />` — lint.test.js fails the moment one slips through. */

import { h, render, Fragment, Component } from '../../vendor/preact.mjs';
import htm from '../../vendor/htm.mjs';

export const html = htm.bind(h);
export { h, render, Fragment, Component };
