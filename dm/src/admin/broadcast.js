/* The admin's side of the bus: build the projection, hand it over, answer a
   television that turns up late, and take back the one thing that flows the
   other way.

   `field.paused` is the single gate. Paused means the television keeps the
   last picture it was given — arrange the ambush off-screen, then let it
   through. It is not a mode and it is never called "en vivo": the header says
   «en pausa», the mirror shows what is actually up there, and both read from
   the same projection. */

/** @import { Projection } from '../shared/types.js' */
import { Bus } from '../shared/bus.js';
import { buildProjection } from '../shared/projection.js';
import { state, update, tweak, audioPrefs, flash } from './store.js';
import { applyMove } from '../shared/combat.js';

let seq = 0;

/** The last thing the television was handed. The admin mirror renders THIS,
    not a fresh build, so what the DM sees is what was actually sent — pause
    included. @type {Projection|null} */
let sent = null;
export const sentProjection = () => sent;

/** What the DM's own screen draws: the same payload, with hidden npcs kept and
    marked. Rebuilt each render, never sent anywhere. */
export const dmProjection = () =>
  buildProjection(state.session,
    { audience: 'dm', master: audioPrefs.muted ? 0 : audioPrefs.master, seq: seq });

/** What the DM's mirror should draw: while the television is paused it holds
    an older picture, and the mirror's whole job is to show what is up there —
    so it shows exactly that, players' payload and all. Arranging happens on
    the DM's own board, not here. */
export const mirrorProjection = () =>
  (state.session.field.paused ? sent : dmProjection());

const bus = new Bus({
  hello: () => pushState(),
  move: (/** @type {import('../shared/bus.js').MoveMsg} */ msg) => {
    /* Positions are the only thing that ever flows back. Not an undo step, in
       either direction: ⟲ after somebody walks across the room should undo the
       damage before it, not the walking. */
    tweak(s => { applyMove(s.session, msg.ref, msg.x, msg.y); });
  },
  trouble: (/** @type {import('../shared/bus.js').TroubleMsg} */ msg) => {
    update(s => { s.tvTrouble = msg.what; });
    flash('La tele avisa: ' + msg.what);
  },
});

/**
 * Hand the television the current state. Called after every session mutation
 * and whenever a television says hello.
 *
 * The handle travels with it: the television reads pictures and sound out of
 * the campaign folder itself, so nothing is copied, uploaded or cached
 * anywhere, and a map is on screen the moment it is on disk.
 */
export function pushState() {
  if (!state.root) return;
  if (state.session.field.paused && sent) return;   // the one gate
  sent = buildProjection(state.session,
    { audience: 'tv', master: audioPrefs.muted ? 0 : audioPrefs.master, seq: ++seq });
  bus.send({
    kind: 'state',
    projection: sent,
    root: state.root,
    rootName: state.rootName,
  });
}

/** Opening the television window. Named, so pressing it again refocuses the
    window that is already open rather than opening a second one. */
export function openTV() {
  const w = window.open('/tv', 'dnd-dm-tv');
  if (!w) {
    flash('El navegador ha bloqueado la ventana del tablero.');
    return;
  }
  w.focus();
  /* It will say hello when it is ready; this is only for the case where it was
     already open and merely refocused. */
  setTimeout(pushState, 300);
}
