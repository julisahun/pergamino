/* The television.

   It draws one object and sends back one fact. It has no session, no rules and
   no campaign: what is not in the projection was never revealed, so devtools
   here teach a player nothing.

   Pictures and sound it reads for itself, out of the campaign folder handle
   the admin window posts along with the state. That handle is the whole reason
   there is no server in this app: bytes never leave the browser, and there is
   nowhere for them to leave to.

   When that reading fails — a permission this window does not have, a file
   that moved — it does NOT quietly do without. It says so, on this screen and
   over the bus, because a television that silently shows no map is the exact
   failure the DM cannot see from the other window. */

/** @import { Projection } from '../shared/types.js' */

import { h, render, html } from '../html.js';
import { Bus } from '../shared/bus.js';
import { Tablero } from '../shared/view/tablero.js';
import { readBlob } from '../shared/files.js';
import { applyAudio, getLocalVolume, setLocalVolume } from './audio.js';

/** @type {Projection|null} */
let projection = null;
/** @type {FileSystemDirectoryHandle|null} */
let root = null;
/** @type {string|null} */
let trouble = null;
/** The token whose reach is lit on THIS screen. A selection is a local thing:
    what one person points at is not board state and never travels. */
/** @type {string|null} */
let selected = null;

/* path -> object URL, built on demand out of the folder the admin handed us.
   Object URLs over local files are lazy: making one reads no bytes. */
/** @type {Map<string, string>} */
const urls = new Map();
/** @type {Set<string>} */
const pending = new Set();

const mount = /** @type {HTMLElement} */ (document.getElementById('tv'));

function draw() {
  render(h(Screen, null), mount);
}

function Screen() {
  return html`
    ${h(Tablero, { p: projection, urlFor, api })}
    ${trouble && html`<div class="trouble" role="status">${trouble}</div>`}`;
}

/* Dragging a token is the ONE thing that flows from here back to the admin.
   The move is applied optimistically so the token follows the finger, and the
   admin's next state message is the authority — it clamps, it saves, and it
   tells every other window. */
const api = {
  get selected() { return selected; },
  onSelect: (/** @type {string|null} */ ref) => { selected = ref; draw(); },
  onMove: (/** @type {string} */ ref, /** @type {number} */ x, /** @type {number} */ y) => {
    const t = projection?.tokens.find(tok => tok.id === ref);
    if (!t || (t.x === x && t.y === y)) return;
    t.x = x; t.y = y;
    draw();
    bus.send({ kind: 'move', ref: /** @type {any} */ (ref), x, y });
  },
};

/** A campaign-relative path as something an <img> can load. Returns null the
    first time and starts the read; the re-render when it lands picks it up.
    Inline portrait bytes (a data: URI) are already loadable and pass through.
    @param {string} path */
function urlFor(path) {
  if (!path) return null;
  if (path.startsWith('data:') || path.startsWith('blob:')) return path;
  const hit = urls.get(path);
  if (hit) return hit;
  if (!root || pending.has(path)) return null;
  pending.add(path);
  readBlob(root, path)
    .then(blob => { urls.set(path, URL.createObjectURL(blob)); draw(); })
    .catch(err => {
      /* Said out loud, once per reason. A television showing no map without
         telling anybody is worse than one showing a complaint. */
      const what = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
        ? 'Esta ventana no tiene permiso para leer la carpeta de la campaña.'
        : `No se puede leer ${path}.`;
      if (trouble !== what) {
        trouble = what;
        bus.send({ kind: 'trouble', what });
        draw();
      }
    })
    .finally(() => pending.delete(path));
  return null;
}

const bus = new Bus({
  state: (/** @type {import('../shared/bus.js').StateMsg} */ msg) => {
    projection = msg.projection;
    if (msg.root !== root) {
      /* A different campaign (or the first one): every URL we hold points into
         the old folder. */
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      root = msg.root;
      trouble = null;
    }
    draw();
    /* Sound comes out of THIS window, because this is the one plugged into the
       television. The paths are resolved here like every other asset. */
    applyAudio(projection?.audio
      ? {
          master: projection.audio.master,
          music: layerFor(projection.audio.music),
          ambience: layerFor(projection.audio.ambience),
        }
      : null);
  },
});

/** A sound layer with its path resolved to something this window can play, or
    null while the bytes are still being opened — the next draw retries.
    @param {{src: string, volume: number, loop: boolean}|null} l */
function layerFor(l) {
  if (!l) return null;
  const url = urlFor(l.src);
  return url ? { ...l, src: url } : null;
}

/* This device's own volume, on top of the admin's master: the arrow keys, and
   nothing on screen. A television is not a thing anybody wants a slider on. */
addEventListener('keydown', e => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  setLocalVolume(getLocalVolume() + (e.key === 'ArrowUp' ? .1 : -.1));
  draw();
});

/* A BroadcastChannel only reaches channels that already exist, so the window
   that arrives second has to ask. Asking repeatedly (until an answer comes)
   is also what covers the admin window being opened after this one. */
function askForState() {
  if (projection) return;
  bus.send({ kind: 'hello' });
  setTimeout(askForState, 1500);
}

draw();
askForState();
