/* Boot for the admin window: mount the app, subscribe the render, and try the
   folder this device had open last.

   This is the only entry point, and it is deliberately thin. Nothing here
   decides what you are looking at: which screen shows is a fact about what has
   been granted (app.js), and which tab shows is written by a tab click and by
   boot, and by nothing else — invariant 2. */

import { h, render } from '../html.js';
import { App } from './app.js';
import { state, subscribe, update, onAfterMutation } from './store.js';
import { boot, pollChanges } from './campaign.js';
import { pushState } from './broadcast.js';

/* Every session change reaches the television through this one wire — set
   here rather than imported inside the store, which would put a cycle between
   the two modules everything else depends on. */
onAfterMutation(pushState);

const mount = /** @type {HTMLElement} */ (document.getElementById('app'));
subscribe(() => render(h(App, null), mount));

/* A tab that comes back to the front has been away: look at the disk before
   the DM does. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pollChanges();
});

await boot().catch(() => {});
update(s => { s.booted = true; });
