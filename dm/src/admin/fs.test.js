/* node --test suite for the storage layer's run arithmetic. fs.js touches no
   browser API at module scope, so a fake directory handle is enough to prove
   the part that decides which mesa's files the app reads — and getting that
   wrong looks like a party that silently reads empty, not like an error.

   The fake implements exactly the slice of FileSystemDirectoryHandle fs.js
   uses: values(), getDirectoryHandle, getFileHandle, getFile, createWritable.
   The real thing is verified in Chrome (see dm/CLAUDE.md's probe pattern);
   this is the cheap half that can run in CI. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readTree, listRuns, readRoomCode, writeFile } from './fs.js';

/* ------------------------------------------------------------- the fake */

let clock = 1000;

function dirHandle(name = '') {
  const entries = new Map();          // name -> handle
  const self = {
    kind: 'directory', name, entries,
    async *values() { for (const h of entries.values()) yield h; },
    async getDirectoryHandle(child, opts = {}) {
      const hit = entries.get(child);
      if (hit) {
        if (hit.kind !== 'directory') throw new Error('TypeMismatchError');
        return hit;
      }
      if (!opts.create) throw new Error('NotFoundError');
      const made = dirHandle(child);
      entries.set(child, made);
      return made;
    },
    async getFileHandle(child, opts = {}) {
      const hit = entries.get(child);
      if (hit) {
        if (hit.kind !== 'file') throw new Error('TypeMismatchError');
        return hit;
      }
      if (!opts.create) throw new Error('NotFoundError');
      const made = fileHandle(child, '');
      entries.set(child, made);
      return made;
    },
    async removeEntry(child) { entries.delete(child); },
  };
  return self;
}

function fileHandle(name, body) {
  const h = {
    kind: 'file', name, body, mtime: ++clock,
    async getFile() {
      return { lastModified: h.mtime, async text() { return String(h.body); } };
    },
    async createWritable() {
      let buf = '';
      return {
        async write(chunk) { buf += typeof chunk === 'string' ? chunk : String(chunk); },
        async close() { h.body = buf; h.mtime = ++clock; },
      };
    },
  };
  return h;
}

/** Seed a whole folder from a {path: contents} map. */
async function campaign(files) {
  const root = dirHandle('marea-baja');
  for (const [path, body] of Object.entries(files)) {
    const parts = path.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
    dir.entries.set(parts.at(-1), fileHandle(parts.at(-1), body));
  }
  return root;
}

const SHEET = JSON.stringify({ kind: 'dnd-creator-character', version: 2, character: { id: 'c1', name: 'El muro' } });

const TWO_MESAS = {
  'monsters/raimo.json': '{"id":"raimo","name":"Raimo"}',
  'objects/arpon-de-nasa.json': '{"id":"arpon-de-nasa","name":"Arpón"}',
  'scenarios/faro.json': '{"id":"faro","name":"El faro"}',
  'story/actos/00-llegada.md': '# La llegada',
  'assets/harbor.jpg': 'JPEGBYTES',
  'runs/guils/guils.md': '---\nmesa: Guils\ncampana: Marea Baja\n---\n\n# Guils',
  'runs/guils/estado.md': '# Guils — estado del mundo',
  'runs/guils/bitacora/01-2026-08-25.md': '# Sesión 1',
  'runs/guils/players/el-muro.json': SHEET,
  'runs/guils/session.json': '{"version":1,"play":{}}',
  'runs/last/players/el-cantor.json': SHEET,
  'runs/last/last.md': '---\nmesa:\n---\n\n# Last',
};

/* --------------------------------------------------------------- readTree */

test('readTree: an open run reads its own party and session, not the other mesa\'s', async () => {
  const root = await campaign(TWO_MESAS);
  const { tree } = await readTree(root, 'runs/guils');
  assert.deepEqual(tree.players.map(f => f.path), ['runs/guils/players/el-muro.json']);
  assert.equal(JSON.parse(tree.session).version, 1);
  /* Preparation is campaign-level and shared. */
  assert.deepEqual(tree.monsters.map(f => f.path), ['monsters/raimo.json']);
  assert.deepEqual(tree.objects.map(f => f.path), ['objects/arpon-de-nasa.json']);
  assert.deepEqual(tree.scenarios.map(f => f.path), ['scenarios/faro.json']);
  assert.deepEqual(tree.story.map(f => f.path), ['story/actos/00-llegada.md']);
  assert.deepEqual(tree.assets, ['assets/harbor.jpg']);
});

test('readTree: the other mesa sees its own empty table', async () => {
  const root = await campaign(TWO_MESAS);
  const { tree } = await readTree(root, 'runs/last');
  assert.deepEqual(tree.players.map(f => f.path), ['runs/last/players/el-cantor.json']);
  assert.equal(tree.session, null);            // never sat down
  assert.equal(tree.monsters.length, 1);       // same preparation
});

test('readTree: a run\'s own notes are not story notes (yet)', async () => {
  const root = await campaign(TWO_MESAS);
  const { tree, mtimes } = await readTree(root, 'runs/guils');
  assert.equal(tree.story.length, 1);
  /* They are walked — the mtime poll sees them — they just have no bucket. */
  assert.equal(mtimes.has('runs/guils/estado.md'), true);
});

test('readTree: a flat campaign reads exactly as it always did', async () => {
  const root = await campaign({
    'session.json': '{"version":1}',
    'players/pip.json': SHEET,
    'monsters/rat.json': '{"id":"rat"}',
    'monsters/undead/lich.json': '{"id":"lich"}',
    'story/00-the-vanishing.md': '# The vanishing',
  });
  const { tree } = await readTree(root, '');
  assert.deepEqual(tree.players.map(f => f.path), ['players/pip.json']);
  assert.equal(JSON.parse(tree.session).version, 1);
  /* Nested entity files stay invisible — the rule importing.md documents. */
  assert.deepEqual(tree.monsters.map(f => f.path), ['monsters/rat.json']);
});

test('readTree: preparation mode finds no table', async () => {
  const root = await campaign(TWO_MESAS);
  const { tree } = await readTree(root, null);
  assert.equal(tree.session, null);
  assert.deepEqual(tree.players, []);
  assert.equal(tree.monsters.length, 1);
  assert.equal(tree.story.length, 1);
});

/* --------------------------------------------------------------- listRuns */

test('listRuns: names, sheet counts and whether the mesa has played', async () => {
  const root = await campaign(TWO_MESAS);
  const runs = await listRuns(root);
  assert.deepEqual(runs, [
    { slug: 'guils', path: 'runs/guils', label: 'Guils', players: 1, played: true },
    /* `mesa:` is empty in last.md, so the humanised slug stands. */
    { slug: 'last', path: 'runs/last', label: 'Last', players: 1, played: false },
  ]);
});

test('listRuns: no runs/ folder at all is a flat campaign, not an error', async () => {
  const root = await campaign({ 'players/pip.json': SHEET });
  assert.deepEqual(await listRuns(root), []);
});

test('listRuns: a mesa with no players/ yet is still a mesa', async () => {
  const root = await campaign({ 'runs/nueva/nueva.md': '# Nueva' });
  const runs = await listRuns(root);
  assert.deepEqual(runs, [{ slug: 'nueva', path: 'runs/nueva', label: 'Nueva', players: 0, played: false }]);
});

/* ----------------------------------------------------------- room per run */

test('readRoomCode: one channel per mesa, stable across opens', async () => {
  const root = await campaign(TWO_MESAS);
  const guils = await readRoomCode(root, 'runs/guils');
  const last = await readRoomCode(root, 'runs/last');
  assert.match(guils, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(last, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(guils, last);                       // two mesas, two televisions
  assert.equal(await readRoomCode(root, 'runs/guils'), guils);   // minted once
  /* And it is a dotfile inside the run, so no walker ever surfaces it. */
  const { tree, mtimes } = await readTree(root, 'runs/guils');
  assert.equal(mtimes.has('runs/guils/.dm-room'), false);
  assert.equal(tree.players.length, 1);
});

test('readRoomCode: a flat campaign keeps its code at the root', async () => {
  const root = await campaign({ 'players/pip.json': SHEET });
  const code = await readRoomCode(root, '');
  assert.equal((await (await root.getFileHandle('.dm-room')).getFile()).lastModified > 0, true);
  assert.equal(await readRoomCode(root, ''), code);
});

test('readRoomCode: a hand-written code is honoured, a broken one replaced', async () => {
  const root = await campaign({ 'runs/guils/.dm-room': 'pruEB2\n', 'runs/last/.dm-room': 'OOPS!!\n' });
  assert.equal(await readRoomCode(root, 'runs/guils'), 'PRUEB2');
  const fixed = await readRoomCode(root, 'runs/last');
  assert.match(fixed, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(fixed, 'OOPS!!');
});

/* ------------------------------------------------------------- writeFile */

test('writeFile creates the run folder on the way down', async () => {
  const root = await campaign({});
  await writeFile(root, 'runs/nueva/session.json', '{"version":1}');
  const { tree } = await readTree(root, 'runs/nueva');
  assert.equal(JSON.parse(tree.session).version, 1);
});
