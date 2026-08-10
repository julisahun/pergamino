/* Tablero boot: subscribe to the SSE channel, render every board that
   arrives, send moved tokens back. EventSource reconnects on its own and
   the server replays the latest board in its `hello`, so a television that
   dropped off the wifi catches up the moment it is back. */

import { applyAudio, setLocalVolume, getLocalVolume } from './audio.js';
import { render, setBoard, getBoard, isDragging, wireDrag } from './board-view.js';

const CLIENT_ID = 'tv-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

function accept(board) {
  if (!board) return;
  setBoard(board);
  applyAudio(board.audio || null);   // before the render, and never *by* it
  if (!isDragging()) render();
}

let linkTimer = null;
function connect() {
  const es = new EventSource(`/api/events?role=tv&client=${CLIENT_ID}`);
  const link = document.getElementById('link');
  es.addEventListener('hello', e => {
    link.hidden = true;
    try { accept(JSON.parse(e.data).board); } catch { /* malformed hello */ }
  });
  es.addEventListener('board', e => {
    let data;
    try { data = JSON.parse(e.data); } catch { return; }
    if (data.origin === CLIENT_ID) return;
    accept(data.board);
  });
  /* A dead admin or a wifi blip: EventSource retries by itself; the pill
     only shows when the outage is long enough to matter at the table. */
  es.onerror = () => {
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => { link.hidden = es.readyState === es.OPEN; }, 3000);
  };
  es.onopen = () => { clearTimeout(linkTimer); link.hidden = true; };
}

/** Positions are the only thing this file ever writes. */
export function sendMove(ref, x, y) {
  fetch('/api/move', {
    method: 'POST',
    body: JSON.stringify({ origin: CLIENT_ID, ref, x, y, done: true }),
  }).catch(() => { /* the admin re-broadcasts; a lost move is a re-drag */ });
}

/* This device's own volume, from a TV remote's arrow keys or a keyboard —
   the admin's master still applies on top. A transient OSD confirms it. */
let osdTimer = null;
document.addEventListener('keydown', e => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  setLocalVolume(getLocalVolume() + (e.key === 'ArrowUp' ? .05 : -.05));
  const link = document.getElementById('link');
  link.textContent = `volumen de esta pantalla: ${Math.round(getLocalVolume() * 100)}%`;
  link.hidden = false;
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => { link.hidden = true; link.textContent = 'reconectando…'; }, 1500);
});

wireDrag(sendMove);
render();
connect();
