import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseScene, blankScene, sceneGridSize, missingAssets, resolveRoster,
         putOnTable, normaliseRosterList } from './scenes.js';
import { blankSession } from './session.js';
import { normaliseBeast } from './beasts.js';

/* A scene file is small enough to write by hand in a text editor, so it has to
   survive being written by hand in a text editor. Everything below is a
   tolerance the importing spec promises to outsiders. */

const aspect16by9 = () => 16 / 9;
const id = (/** @type {string} */ s) => s;

test('the envelope is optional, and a bare object reads the same', () => {
  const wrapped = normaliseScene({ kind: 'dnd-dm-scene', version: 1, scene: { id: 'cala', name: 'La cala' } });
  const bare = normaliseScene({ id: 'cala', name: 'La cala' });
  assert.equal(wrapped.id, 'cala');
  assert.equal(bare.id, 'cala');
  assert.equal(wrapped.name, bare.name);
});

test('art accepts the bare string somebody types first', () => {
  assert.deepEqual(normaliseScene({ art: 'assets/cala.jpg' }).art, { src: 'assets/cala.jpg' });
  assert.deepEqual(normaliseScene({ art: { src: 'assets/cala.jpg' } }).art, { src: 'assets/cala.jpg' });
  assert.equal(normaliseScene({}).art, null);
});

test('audio: a bare string is the music, and a deliberate 0 survives', () => {
  const s = normaliseScene({ audio: 'assets/audio/mar.mp3' });
  assert.deepEqual(s.audio?.music, { src: 'assets/audio/mar.mp3', volume: .5, loop: true });
  assert.equal(s.audio?.ambience, null);
  assert.equal(normaliseScene({ audio: { music: { src: 'a.mp3', volume: 0 } } }).audio?.music?.volume, 0);
  assert.equal(normaliseScene({ audio: { music: { src: 'a.mp3', loop: false } } }).audio?.music?.loop, false);
});

test('a roster entry with no beastId is not a placement of anything', () => {
  const r = normaliseRosterList([{ beastId: 'vann', x: 3, y: 2 }, { x: 1, y: 1 }, null]);
  assert.deepEqual(r, [{ beastId: 'vann', x: 3, y: 2, objects: [] }]);
});

test('the grid override is read from where a hand-written file puts it', () => {
  assert.equal(normaliseScene({ grid: { cols: 14 } }).cols, 14);
  assert.equal(normaliseScene({ cols: 14 }).cols, 14);
  /* Absent stays absent: a scene with no opinion uses the table's own grid. */
  assert.equal(normaliseScene({}).cols, null);
  assert.equal(normaliseScene({ grid: { cols: '' } }).cols, null);
  assert.equal(normaliseScene({ grid: { cols: 999 } }).cols, 60);
  /* Rows are never read: they derive from the art, every time. */
  assert.equal(/** @type {any} */ (normaliseScene({ grid: { cols: 14, rows: 40 } })).rows, undefined);
});

test('rows come from the art, not from the file', () => {
  const field = { ...blankSession().field };
  const scene = normaliseScene({ art: 'a.jpg', grid: { cols: 16 } });
  assert.deepEqual(sceneGridSize(scene, field, aspect16by9, id), { cols: 16, rows: 9 });
  /* No override: the table's own grid, untouched. */
  assert.deepEqual(sceneGridSize(normaliseScene({}), field, aspect16by9, id),
    { cols: field.cols, rows: field.rows });
});

test('missing assets are reported, but an empty list proves nothing', () => {
  const scene = normaliseScene({ art: 'assets/cala.jpg', audio: 'assets/audio/mar.mp3' });
  assert.deepEqual(missingAssets(scene, ['assets/cala.jpg']), ['assets/audio/mar.mp3']);
  assert.deepEqual(missingAssets(scene, []), [], 'no asset list cannot cry wolf');
});

/* -------------------------------------------------------- putting it up */

function tableWith(/** @type {any} */ scene) {
  const s = blankSession();
  s.bestiary = [normaliseBeast({ id: 'vann', name: 'Vann', hpMax: 9 })];
  s.field.mode = 'escena';
  putOnTable(s, scene, { aspectOf: aspect16by9, urlFor: id });
  return s;
}

test('a scene supplies the picture, the sound and its own board size', () => {
  const s = tableWith(normaliseScene({
    id: 'cala', art: 'assets/cala.jpg', audio: 'assets/audio/mar.mp3', grid: { cols: 16 },
  }));
  assert.deepEqual(s.field.map, { src: 'assets/cala.jpg' }, 'a path, not a URL');
  assert.equal(s.field.audio?.music?.src, 'assets/audio/mar.mp3');
  assert.deepEqual([s.field.cols, s.field.rows], [16, 9]);
  assert.equal(s.field.sceneId, 'cala');
});

test('AND IT DOES NOT DECIDE WHAT THE TELEVISION IS SHOWING', () => {
  /* The old app forced the grid off here, so putting up a scene silently
     changed what kind of thing was on screen. The mode is a stated control. */
  const s = blankSession();
  s.field.mode = 'tablero';
  putOnTable(s, normaliseScene({ id: 'x', art: 'a.jpg' }), { aspectOf: aspect16by9, urlFor: id });
  assert.equal(s.field.mode, 'tablero');

  const t = blankSession();
  t.field.mode = 'nada';
  putOnTable(t, normaliseScene({ id: 'x' }), { aspectOf: aspect16by9, urlFor: id });
  assert.equal(t.field.mode, 'nada');
});

test('«Sin escena» clears the picture and the sound, and nothing else', () => {
  const s = tableWith(normaliseScene({ id: 'cala', art: 'a.jpg', audio: 'm.mp3' }));
  s.field.mode = 'escena';
  putOnTable(s, null, { aspectOf: aspect16by9, urlFor: id });
  assert.deepEqual([s.field.map, s.field.audio, s.field.sceneId], [null, null, null]);
  assert.equal(s.field.mode, 'escena', 'the mode is the DM\'s, not the scene\'s');
});

test('the roster seats fresh instances, and never the same square twice', () => {
  const scene = normaliseScene({
    id: 'cala', roster: [{ beastId: 'vann', x: 3, y: 2 }, { beastId: 'nadie', x: 4, y: 2 }],
  });
  const s = tableWith(scene);
  assert.equal(s.npcs.length, 1, 'a dangling beastId seats nobody, silently');
  assert.equal(s.npcs[0].name, 'Vann');
  assert.notEqual(s.npcs[0].id, 'vann', 'an instance, not the bestiary entry');
  assert.deepEqual(s.field.tokens['npc:' + s.npcs[0].id], { x: 3, y: 2 });
  assert.equal(s.npcs[0].hp, 9, 'and it arrives unwounded');

  /* Twice on the same scene must not double the ambush. */
  putOnTable(s, scene, { aspectOf: aspect16by9, urlFor: id });
  assert.equal(s.npcs.length, 1);
});

test('a seated npc is hidden until somebody says otherwise', () => {
  const s = tableWith(normaliseScene({ id: 'cala', roster: [{ beastId: 'vann', x: 1, y: 1 }] }));
  const id2 = s.npcs[0].id;
  assert.notEqual(s.field.reveal[id2]?.on, true);
});
