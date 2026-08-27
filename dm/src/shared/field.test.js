import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankField, normaliseField, modeFromLegacy, deriveRows, modeLabel,
         normaliseArt, normaliseAudio, normaliseReveal, MODES } from './field.js';

test('a blank field shows nothing, with no strips and no pause', () => {
  const f = blankField();
  assert.equal(f.mode, 'nada');
  assert.equal(f.hud, false);
  assert.equal(f.paused, false);
  assert.deepEqual([f.cols, f.rows], [24, 14]);
});

test('the vocabulary is exactly three modes', () => {
  assert.deepEqual(MODES.map(m => m.key), ['nada', 'escena', 'tablero']);
  assert.equal(modeLabel('tablero'), 'Tablero');
});

test('the old two booleans translate into one mode', () => {
  assert.equal(modeFromLegacy({ live: false, grid: true }), 'nada');
  assert.equal(modeFromLegacy({ live: false, grid: false }), 'nada');
  assert.equal(modeFromLegacy({ live: true, grid: true }), 'tablero');
  assert.equal(modeFromLegacy({ live: true, grid: false }), 'escena');
  /* A save from before scenes existed had neither flag and was always a live
     battlemap — that is all the board could be. */
  assert.equal(modeFromLegacy({}), 'tablero');
});

test('a table nobody has set up shows nothing at all', () => {
  /* Not the legacy default: with no mode and no live/grid there is nothing to
     migrate, and a fresh campaign must not open onto a grid nobody asked for. */
  assert.equal(normaliseField({}).mode, 'nada');
  assert.equal(normaliseField(undefined).mode, 'nada');
  assert.equal(normaliseField({ cols: 30, rows: 20 }).mode, 'nada');
  assert.equal(normaliseField({}).hud, false);
});

test('a stored mode wins over any legacy flags left in the file', () => {
  assert.equal(normaliseField({ mode: 'escena', live: false, grid: true }).mode, 'escena');
  assert.equal(normaliseField({ mode: 'ruidoso', live: true, grid: true }).mode, 'tablero');
});

test('migrating decides the strips once, and never again', () => {
  assert.equal(normaliseField({ live: true, grid: true }).hud, true);
  assert.equal(normaliseField({ live: true, grid: false }).hud, false);
  assert.equal(normaliseField({ live: false, grid: false }).hud, false);
  /* Once stated it is the DM's switch: a scene WITH strips survives a reload. */
  assert.equal(normaliseField({ mode: 'escena', hud: true }).hud, true);
  assert.equal(normaliseField({ mode: 'tablero', hud: false }).hud, false);
});

test('pause persists across a reload and is not any of the modes', () => {
  assert.equal(normaliseField({ mode: 'tablero', paused: true }).paused, true);
  assert.equal(normaliseField({ mode: 'tablero', paused: true }).mode, 'tablero');
});

test('grid size clamps, and tokens clamp into it', () => {
  const f = normaliseField({ cols: 999, rows: 0, tokens: { 'pc:a': { x: 500, y: -3 } } });
  assert.deepEqual([f.cols, f.rows], [60, 4]);
  assert.deepEqual(f.tokens['pc:a'], { x: 59, y: 0 });
  assert.deepEqual(normaliseField({ tokens: { 'pc:a': { x: 'x', y: 1 } } }).tokens, {});
  /* Missing or unreadable falls back to the default; a number that is there
     is read, even when it is silly. */
  const g = normaliseField({ cols: 'ancho', rows: undefined });
  assert.deepEqual([g.cols, g.rows], [24, 14]);
});

test('rows derive from real proportions, never from typing', () => {
  assert.equal(deriveRows(24, 16 / 9), 14);
  assert.equal(deriveRows(24, 1), 24);
  assert.equal(deriveRows(24, 0), 24);      // unknown aspect: square, not NaN
  assert.equal(deriveRows(60, .1), 40);     // clamped
});

test('art and audio read what a hand-written file says', () => {
  assert.deepEqual(normaliseArt('assets/x.jpg'), { src: 'assets/x.jpg' });
  assert.deepEqual(normaliseArt({ src: ' assets/x.jpg ' }), { src: 'assets/x.jpg' });
  assert.equal(normaliseArt({ src: '   ' }), null);
  assert.equal(normaliseArt(null), null);

  assert.deepEqual(normaliseAudio('assets/audio/rain.mp3'),
    { music: { src: 'assets/audio/rain.mp3', volume: .5, loop: true }, ambience: null });
  /* A deliberate 0 is a layer turned down, not a missing one. */
  assert.equal(normaliseAudio({ music: { src: 'a.mp3', volume: 0 } })?.music?.volume, 0);
  assert.equal(normaliseAudio({ music: { src: 'a.mp3', loop: false } })?.music?.loop, false);
  assert.equal(normaliseAudio({ music: null, ambience: null }), null);
});

test('an npc nobody configured is hidden, with coarse hit points', () => {
  assert.deepEqual(normaliseReveal(null), { on: false, hp: 'coarse' });
  assert.deepEqual(normaliseReveal({ on: true, hp: 'exact' }), { on: true, hp: 'exact' });
  assert.deepEqual(normaliseReveal({ on: 'yes', hp: 'mucho' }), { on: false, hp: 'coarse' });
});

test('the bench holds players, deduplicated, and nobody else', () => {
  const f = normaliseField({ benched: ['pc:a', 'pc:a', 'npc:b', 7, null] });
  assert.deepEqual(f.benched, ['pc:a']);
});
