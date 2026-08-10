/* Tablero boot: work out which ROOM (table) this screen belongs to, join
   its SSE channel, render every board that arrives, send moved tokens back.
   EventSource reconnects on its own and the server replays the room's
   latest board in its `hello`, so a television that dropped off the wifi
   catches up the moment it is back.

   The room arrives as ?room= (the QR / "Tablero ↗" path), or from this
   device's own memory, or is typed once into the code screen — 6 chars,
   read off the DM's connect modal. */

import { applyAudio, setLocalVolume, getLocalVolume } from './audio.js';
import { render, setBoard, getBoard, isDragging, wireDrag } from './board-view.js';

const CLIENT_ID = 'tv-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ROOM_KEY = 'dnd-dm-tv-room';
const ROOM_RE = /^[A-HJ-NP-Z2-9]{6}$/;

let room = null;

const normaliseCode = raw =>
  String(raw || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);

function resolveRoom() {
  const fromUrl = normaliseCode(new URLSearchParams(location.search).get('room'));
  if (ROOM_RE.test(fromUrl)) {
    try { localStorage.setItem(ROOM_KEY, fromUrl); } catch { /* private mode */ }
    return fromUrl;
  }
  try {
    const stored = normaliseCode(localStorage.getItem(ROOM_KEY));
    if (ROOM_RE.test(stored)) return stored;
  } catch { /* private mode */ }
  return null;
}

function accept(board) {
  if (!board) return;
  setBoard(board);
  applyAudio(board.audio || null);   // before the render, and never *by* it
  if (!isDragging()) render();
}

let es = null;
let linkTimer = null;

function connect() {
  if (es) es.close();
  es = new EventSource(`/api/events?role=tv&client=${CLIENT_ID}&room=${room}`);
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

function join(code) {
  room = code;
  try { localStorage.setItem(ROOM_KEY, code); } catch { /* private mode */ }
  setBoard(null);                    // a stale table's board must not linger
  applyAudio(null);                  // nor its music
  render();
  connect();
}

/** Positions are the only thing this file ever writes. */
export function sendMove(ref, x, y) {
  fetch('/api/move', {
    method: 'POST',
    body: JSON.stringify({ origin: CLIENT_ID, room, ref, x, y, done: true }),
  }).catch(() => { /* the admin re-broadcasts; a lost move is a re-drag */ });
}

/* --------------------------------------------------------- code screen */

const roomEl = document.getElementById('room');
const codeBox = document.getElementById('roomcode');

function showRoomEntry() {
  roomEl.hidden = false;
  codeBox.value = room || '';
  codeBox.focus();
  codeBox.select();
}

codeBox.addEventListener('input', () => { codeBox.value = normaliseCode(codeBox.value); });

document.getElementById('roomform').addEventListener('submit', e => {
  e.preventDefault();
  const code = normaliseCode(codeBox.value);
  if (!ROOM_RE.test(code)) return;   // not 6 chars yet — stay put
  roomEl.hidden = true;
  join(code);
});

/* This device's own volume, from a TV remote's arrow keys or a keyboard —
   the admin's master still applies on top. A transient OSD confirms it.
   M reopens the code screen to switch tables; Escape backs out of it. */
let osdTimer = null;
document.addEventListener('keydown', e => {
  if (e.target === codeBox) {
    if (e.key === 'Escape' && room) roomEl.hidden = true;
    return;
  }
  if (e.key === 'm' || e.key === 'M') { showRoomEntry(); return; }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  setLocalVolume(getLocalVolume() + (e.key === 'ArrowUp' ? .05 : -.05));
  const link = document.getElementById('link');
  link.textContent = `volumen de esta pantalla: ${Math.round(getLocalVolume() * 100)}%`;
  link.hidden = false;
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => { link.hidden = true; link.textContent = 'reconectando…'; }, 1500);
});

/* ----------------------------------------------------------------- boot */

wireDrag(sendMove);
render();
const remembered = resolveRoom();
if (remembered) join(remembered);
else showRoomEntry();
