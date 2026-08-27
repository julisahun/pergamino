/* Sound comes out of this window because this is what is plugged into the
   television. Two layers, music and ambience, each mixed by the scene and
   scaled by the admin's master and this device's own local volume.

   Each layer is *two* <audio> elements that swap roles, so a scene change is
   a real crossfade rather than a cut or a dip to silence. Volume is stepped
   by a single ticker instead of a timer per fade: fades overlap by
   definition here, and one interval that walks four elements toward four
   targets cannot leave a stray timer running against a fifth. */

const FADE_MS = 900;
const TICK_MS = 50;
const STEP = TICK_MS / FADE_MS;

/** Pure fade arithmetic, split out so node --test can chew on it: one tick's
    worth of movement from `volume` toward `target`. */
/** @param {number} volume @param {number} target */
export function nextVolume(volume, target) {
  if (Math.abs(volume - target) <= STEP) return target;
  return Math.min(1, Math.max(0, volume + (target > volume ? STEP : -STEP)));
}

/* This device's own volume — a property of the room, kept on the TV itself
   so a tablet on the porch and the living-room television each remember
   their own. Multiplies with the admin's master from the payload. */
const LOCAL_KEY = 'dnd-dm-tv-audio';

export function loadLocalVolume() {
  try {
    const v = Number(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')?.volume);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch { return 1; }
}

/** @param {number} v */
export function saveLocalVolume(v) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ volume: v })); } catch { /* private mode */ }
}

let localVolume = loadLocalVolume();
export const getLocalVolume = () => localVolume;
/** @param {number} v */
export function setLocalVolume(v) {
  localVolume = Math.min(1, Math.max(0, v));
  saveLocalVolume(localVolume);
  if (lastSpec) applyAudio(lastSpec);      // retarget the ticker right away
}

const newLayer = () => {
  const el = [new Audio(), new Audio()];
  for (const a of el) { a.preload = 'auto'; a.loop = true; a.volume = 0; }
  return { el, cur: 0, src: /** @type {string|null} */ (null), want: [0, 0] };
};

/** @type {Record<string, ReturnType<typeof newLayer>>} */
const layers = { music: newLayer(), ambience: newLayer() };
/** @type {any} */
let lastSpec = null;

/* The browser rejects play() with NotAllowedError until this window has been
   touched. That is not an error worth logging — it is a thing to ask for. */
let blocked = false;

/* Only NotAllowedError asks for a tap. A file that is missing or that this
   browser cannot decode rejects too, and pleading with the room to touch the
   screen would not fix it — the admin window already names a missing asset. */
/** @param {HTMLAudioElement} a */
function start(a) {
  const p = a.play();
  if (p && p.catch) p.catch(err => { if (err && err.name === 'NotAllowedError') gate(true); });
}

/** @param {boolean} on */
function gate(on) {
  if (on === blocked) return;
  blocked = on;
  const pill = document.getElementById('sound');
  if (pill) pill.hidden = !on;
}

/** The whole audio state, recomputed from one payload. Idempotent: a payload
    that says the same thing must do nothing at all, or the music would
    restart on every push. */
/** @param {{music: any, ambience: any, master: number}|null} spec */
export function applyAudio(spec) {
  lastSpec = spec;
  /* Number(undefined) is NaN and `NaN ?? 1` is still NaN — ?? only catches
     null and undefined. A NaN would reach an <audio>'s volume setter, which
     throws. */
  const m = Number(spec ? spec.master : 0);
  const master = (!spec ? 0 : (Number.isFinite(m) ? Math.min(1, Math.max(0, m)) : 1)) * localVolume;
  for (const name of /** @type {const} */ (['music', 'ambience'])) {
    const l = layers[name];
    const want = spec ? spec[name] : null;
    const src = want && want.src ? String(want.src) : null;
    const vol = src ? Math.min(1, Math.max(0, Number(want.volume) || 0)) * master : 0;

    if (src === l.src) { l.want[l.cur] = vol; continue; }

    /* A different piece: the one playing fades out where it stands and the
       new one comes up on the other element, both at once. */
    l.want[l.cur] = 0;
    l.src = src;
    if (!src) continue;
    l.cur = 1 - l.cur;
    const a = l.el[l.cur];
    a.loop = want.loop !== false;
    a.src = src;
    a.volume = 0;
    l.want[l.cur] = vol;
    start(a);
  }
}

setInterval(() => {
  for (const name of /** @type {const} */ (['music', 'ambience'])) {
    const l = layers[name];
    l.el.forEach((a, i) => {
      a.volume = nextVolume(a.volume, l.want[i]);
      /* Silence is a pause, not a muted element left spinning. The restart
         is checked every tick, so an element that is meant to be audible and
         somehow is not comes back on its own — but never one that already
         failed to load, or this would retry a missing file twenty times a
         second for the rest of the evening. */
      if (l.want[i] === 0 && a.volume === 0) { if (!a.paused) a.pause(); return; }
      if (a.paused && !blocked && !a.error && a.src) start(a);
    });
  }
}, TICK_MS);

/* Any touch anywhere counts, which is why the pill is a hint and not the
   only target. Capture, so a drag on a token does not swallow the one
   gesture we need. */
function unlock() {
  if (!blocked) return;
  gate(false);
  for (const name of ['music', 'ambience']) {
    const l = layers[name];
    if (l.src && l.want[l.cur] > 0) start(l.el[l.cur]);
  }
}
document.addEventListener('pointerdown', unlock, true);
document.addEventListener('keydown', unlock, true);
