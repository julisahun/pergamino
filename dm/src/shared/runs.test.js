import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, runRel, runPrefix, runSlugOf, runLabel, mesaName, layerPath,
         layersOf, layerOf, isMine, shadowById, shadowByPath, FLAT_RUN, PREP_RUN,
         runFrom } from './runs.js';

/* Every path below is campaign-relative, the one vocabulary the whole app
   speaks — the same strings the writer writes and the poll compares. */

test('a flat campaign has one layer and reads exactly as it always did', () => {
  const at = (/** @type {string} */ p) => classify(p, '');
  assert.deepEqual(at('session.json'), { bucket: 'session', layer: 'campaign' });
  assert.deepEqual(at('players/pip.json'), { bucket: 'players', layer: 'campaign' });
  assert.deepEqual(at('monsters/rat.json'), { bucket: 'monsters', layer: 'campaign' });
  assert.deepEqual(at('scenarios/sewers.json'), { bucket: 'scenarios', layer: 'campaign' });
  assert.deepEqual(at('objects/ring.json'), { bucket: 'objects', layer: 'campaign' });
  assert.deepEqual(at('story/casos/robo.md'), { bucket: 'story', layer: 'campaign' });
  assert.deepEqual(at('assets/maps/cala.jpg'), { bucket: 'assets', layer: 'campaign' });
  /* One layer is never called 'run', even though the root IS the run here. */
  assert.equal(layersOf(FLAT_RUN).length, 1);
});

test('inside a mesa, its own folder is the second layer', () => {
  const at = (/** @type {string} */ p) => classify(p, 'runs/guils');
  assert.deepEqual(at('runs/guils/session.json'), { bucket: 'session', layer: 'run' });
  assert.deepEqual(at('runs/guils/players/amparo.json'), { bucket: 'players', layer: 'run' });
  assert.deepEqual(at('runs/guils/monsters/vann.json'), { bucket: 'monsters', layer: 'run' });
  assert.deepEqual(at('runs/guils/assets/maps/cala.jpg'), { bucket: 'assets', layer: 'run' });
  /* The campaign's prep is still readable from inside a mesa — that is the
     whole point of two layers. */
  assert.deepEqual(at('monsters/vann.json'), { bucket: 'monsters', layer: 'campaign' });
  assert.deepEqual(at('story/lore/roquena.md'), { bucket: 'story', layer: 'campaign' });
  assert.deepEqual(layersOf(runFrom({ slug: 'guils', path: 'runs/guils', label: 'Guils' })),
                   ['campaign', 'run']);
});

test('every .md inside a mesa is a note; at campaign level only story/ is', () => {
  const at = (/** @type {string} */ p) => classify(p, 'runs/guils');
  for (const p of ['runs/guils/estado.md', 'runs/guils/guils.md',
                   'runs/guils/bitacora/01-la-cala.md', 'runs/guils/players/amparo.md']) {
    assert.deepEqual(at(p), { bucket: 'story', layer: 'run' }, p);
  }
  /* A README beside the campaign's folders is somebody's own file. */
  assert.equal(at('README.md'), null);
  assert.equal(at('pregenerados/fichas.md'), null);
});

test("another mesa's files are invisible, always", () => {
  const at = (/** @type {string} */ p) => classify(p, 'runs/guils');
  assert.equal(at('runs/last/session.json'), null);
  assert.equal(at('runs/last/players/quien.json'), null);
  assert.equal(at('runs/last/monsters/vann.json'), null);
  assert.equal(at('runs/README.md'), null);
  /* And from a flat campaign, a runs/ folder that appeared later is nobody's. */
  assert.equal(classify('runs/guils/session.json', ''), null);
});

test('preparation-only mode finds no table at all', () => {
  const at = (/** @type {string} */ p) => classify(p, null);
  assert.equal(at('session.json'), null);
  assert.equal(at('players/pip.json'), null);
  assert.equal(at('runs/guils/session.json'), null);
  /* The prep itself is exactly what it is there to edit. */
  assert.deepEqual(at('monsters/rat.json'), { bucket: 'monsters', layer: 'campaign' });
  assert.deepEqual(at('story/intro.md'), { bucket: 'story', layer: 'campaign' });
  assert.equal(layersOf(PREP_RUN).length, 1);
});

test('the app only ever reads the top level of an entity folder', () => {
  assert.equal(classify('monsters/undead/lich.json', ''), null);
  assert.equal(classify('monsters/rat.txt', ''), null);
  assert.equal(classify('runs/guils/monsters/undead/lich.json', 'runs/guils'), null);
});

test('paths build and read back the same way', () => {
  assert.equal(runPrefix('guils'), 'runs/guils');
  assert.equal(runPrefix(''), '');
  assert.equal(runRel('', 'session.json'), 'session.json');
  assert.equal(runRel('runs/guils', 'players/amparo.json'), 'runs/guils/players/amparo.json');
  assert.equal(runSlugOf('runs/guils/session.json'), 'guils');
  assert.equal(runSlugOf('monsters/vann.json'), null);
  assert.equal(runLabel('marea-baja'), 'Marea baja');
});

test('a mesa is called what its note says it is called', () => {
  assert.equal(mesaName('---\nmesa: Guils\ntipo: mesa\n---\n\n# Lo que sea'), 'Guils');
  assert.equal(mesaName('# Sin frontmatter'), null);
  assert.equal(mesaName('---\nmesa:   \n---'), null);
});

test('a save goes where its layer says, and nowhere else', () => {
  const guils = runFrom({ slug: 'guils', path: 'runs/guils', label: 'Guils' });
  assert.equal(layerPath(guils, 'run', 'monsters/vann.json'), 'runs/guils/monsters/vann.json');
  assert.equal(layerPath(guils, 'campaign', 'monsters/vann.json'), 'monsters/vann.json');
  /* Nothing can land "in the run" of a campaign that has no runs. */
  assert.equal(layerPath(FLAT_RUN, 'run', 'monsters/vann.json'), 'monsters/vann.json');
  assert.equal(layerOf(guils, 'runs/guils/monsters/vann.json'), 'run');
  assert.equal(layerOf(guils, 'monsters/vann.json'), 'campaign');
  assert.equal(layerOf(FLAT_RUN, 'monsters/vann.json'), 'campaign');
});

test('a file under runs/ belongs to a mesa whoever is asking', () => {
  const guils = runFrom({ slug: 'guils', path: 'runs/guils', label: 'Guils' });
  /* Which LAYER never depends on who is looking… */
  assert.equal(layerOf(PREP_RUN, 'runs/last/monsters/vann.json'), 'run');
  assert.equal(layerOf(FLAT_RUN, 'runs/last/monsters/vann.json'), 'run');
  /* …but whether it is MINE does. Conflating the two made another table's file
     look like shared preparation from preparation-only mode. */
  assert.equal(isMine(guils, 'runs/guils/monsters/vann.json'), true);
  assert.equal(isMine(guils, 'runs/last/monsters/vann.json'), false);
  assert.equal(isMine(PREP_RUN, 'monsters/vann.json'), false, 'prep owns no table');
  assert.equal(isMine(FLAT_RUN, 'monsters/vann.json'), true, 'flat owns its root');
  assert.equal(isMine(FLAT_RUN, 'runs/last/monsters/vann.json'), false);
});

test('a run-local entity shadows the campaign one, and says what it displaced', () => {
  const campaign = [{ id: 'vann', name: 'Vann', file: 'monsters/vann.json' },
                    { id: 'raimo', name: 'Raimo', file: 'monsters/raimo.json' }];
  const run = [{ id: 'vann', name: 'Vann (herido)', file: 'runs/guils/monsters/vann.json' }];
  const seen = shadowById(campaign, run);
  assert.equal(seen.length, 2);
  const vann = seen.find(e => e.id === 'vann');
  assert.equal(vann?.name, 'Vann (herido)');
  assert.equal(vann?.layer, 'run');
  assert.equal(vann?.shadows, 'monsters/vann.json');
  const raimo = seen.find(e => e.id === 'raimo');
  assert.equal(raimo?.layer, 'campaign');
  assert.equal(raimo?.shadows, null);
});

test('a run-local entity nobody prepared shadows nothing', () => {
  const seen = shadowById([], [{ id: 'nuevo', file: 'runs/guils/monsters/nuevo.json' }]);
  assert.deepEqual(seen.map(e => [e.layer, e.shadows]), [['run', null]]);
});

test('assets shadow by their path below assets/', () => {
  const seen = shadowByPath(
    ['assets/maps/cala.jpg', 'assets/audio/mar.mp3'],
    ['runs/guils/assets/maps/cala.jpg'],
    'runs/guils');
  const cala = seen.find(a => a.rel === 'assets/maps/cala.jpg');
  assert.equal(cala?.path, 'runs/guils/assets/maps/cala.jpg');   // what actually loads
  assert.equal(cala?.layer, 'run');
  assert.equal(cala?.shadows, 'assets/maps/cala.jpg');
  assert.equal(seen.find(a => a.rel === 'assets/audio/mar.mp3')?.layer, 'campaign');
  assert.equal(seen.length, 2);
});
