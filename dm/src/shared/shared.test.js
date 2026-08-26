/* node --test suite for the pure model layer. Run from the repo root:
   node --test dm/src/shared/   */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankSession, normaliseSession, normalisePlay, normaliseAudio,
         normaliseLayer, serialiseSession, clampCol } from './session.js';
import { normaliseBeast } from './beasts.js';
import { normaliseScene, deriveRows, sceneGridSize, missingAssets,
         resolveRoster, goLive } from './scenes.js';
import { applyDelta, applyGoldDelta, hurt, inOrder, advance, startCombat,
         endCombat, seatAll, freeSquare, applyMove, longRest } from './combat.js';
import { npcHandle, currentHP, pcMaxHP } from './handles.js';
import { normaliseObject, modTotals, heldObjects, effectLines } from './objects.js';
import { normalise } from '../rules/character.js';
import { coarseWord, tokenHP, buildBoard } from './board.js';
import { noteFrom, noteTitle, storyIndex, noteTags, noteLinks, backlinksFor,
         mdToHtml, domToMd } from './story.js';
import { esc, slugify, encodePath } from './util.js';
import { classify, runRel, runPrefix, runSlugOf, runLabel, mesaName,
         isRunPath, PREP_SLUG } from './runs.js';

const urlFor = p => '/campaigns/test/' + encodePath(p);
const flatAspect = (src, fallback) => fallback;

/* A monster handle straight from a bestiary-ish object with play state mixed
   in — the shape session.npcs actually holds. */
const npc = over => {
  const n = Object.assign(normaliseBeast({ id: 'g1', name: 'Goblin', ac: 13, hpMax: 7, speed: 9 }),
                          normalisePlay(null), over || {});
  return n;
};

/* ------------------------------------------------------------- HP grammar */

test('damage: temp absorbs first, remainder floors at 0', () => {
  const n = npc({ hp: 7, temp: 3 });
  const cb = npcHandle(n);
  assert.equal(applyDelta(cb, '5'), true);
  assert.equal(n.temp, 0);
  assert.equal(n.hp, 5);
  assert.equal(applyDelta(cb, '-99'), true);
  assert.equal(n.hp, 0);
});

test('hp: null means untouched-therefore-full, not dead', () => {
  const n = npc();                       // hp: null from blankPlay
  assert.equal(n.hp, null);
  const cb = npcHandle(n);
  assert.equal(currentHP(cb), 7);        // reads as full
  applyDelta(cb, '2');                   // first touch materialises max first
  assert.equal(n.hp, 5);
});

test('normalisePlay round-trips hp:null (Number(null)===0 trap)', () => {
  assert.equal(normalisePlay({ hp: null }).hp, null);
  assert.equal(normalisePlay({ hp: 0 }).hp, 0);
  assert.equal(normalisePlay({ hp: '4' }).hp, 4);
});

test('+n heals capped at max and clears death marks via any positive landing', () => {
  const n = npc({ hp: 2, death: { ok: 1, fail: 2 } });
  const cb = npcHandle(n);
  applyDelta(cb, '+99');
  assert.equal(n.hp, 7);
  assert.deepEqual(n.death, { ok: 0, fail: 0 });
});

test('t5 sets temp, replaces rather than stacks', () => {
  const n = npc({ hp: 7, temp: 2 });
  applyDelta(npcHandle(n), 't5');
  assert.equal(n.temp, 5);
});

test('=n on a monster can raise max; lower =n just sets current', () => {
  const n = npc({ hp: 7 });
  applyDelta(npcHandle(n), '=20');
  assert.equal(n.hpMax, 20);
  assert.equal(n.hp, 20);
  applyDelta(npcHandle(n), '=3');
  assert.equal(n.hpMax, 20);             // never lowered by the box
  assert.equal(n.hp, 3);
});

test('=n on a player clamps at derive()-given max', () => {
  const play = normalisePlay({ hp: 4 });
  const cb = { kind: 'pc', hpMax: 9, play };
  applyDelta(cb, '=99');
  assert.equal(play.hp, 9);
});

test('garbage input is rejected without touching anything', () => {
  const n = npc({ hp: 7 });
  assert.equal(applyDelta(npcHandle(n), '2d6'), false);
  assert.equal(applyDelta(npcHandle(n), ''), false);
  assert.equal(n.hp, 7);
});

test('gold grammar: =, +, - floored at zero; no max', () => {
  const p = normalisePlay(null);
  assert.equal(applyGoldDelta(p, '=10'), true);
  applyGoldDelta(p, '+5');
  assert.equal(p.gold, 15);
  applyGoldDelta(p, '-99');
  assert.equal(p.gold, 0);
  assert.equal(applyGoldDelta(p, 'x'), false);
});

/* ------------------------------------------------------------ coarse words */

test('coarseWord thresholds', () => {
  assert.equal(coarseWord(0, 10), 'fuera de combate');
  assert.equal(coarseWord(10, 10), 'ileso');
  assert.equal(coarseWord(6, 10), 'herido');     // > .5
  assert.equal(coarseWord(5, 10), 'malherido');  // .5 is not > .5
  assert.equal(coarseWord(3, 10), 'malherido');  // > .25
  assert.equal(coarseWord(2, 10), 'grave');
});

test('tokenHP modes', () => {
  const cb = npcHandle(npc({ hp: 3 }));
  assert.equal(tokenHP(cb, 'none'), null);
  assert.deepEqual(tokenHP(cb, 'exact'), { mode: 'exact', cur: 3, max: 7, pct: 3 / 7 });
  assert.equal(tokenHP(cb, 'coarse').word, 'malherido');
});

/* ------------------------------------------------------------- normalisers */

test('normaliseBeast coerces the string numbers real files carry', () => {
  const b = normaliseBeast({ name: 'Vann', ac: '10', hpMax: '9', initMod: '1', speed: 'None' });
  assert.equal(b.ac, 10);
  assert.equal(b.hpMax, 9);
  assert.equal(b.initMod, 1);
  assert.equal(b.speed, null);           // unparseable speed = no speed, not NaN
});

test('normaliseScene tolerance matrix', () => {
  // envelope
  const env = normaliseScene({ kind: 'dnd-dm-scene', version: 1, scene: { id: 'x', name: 'X', art: { src: 'assets/x.jpg' } } });
  assert.equal(env.id, 'x');
  // bare object + bare-string art
  const bare = normaliseScene({ id: 'y', art: 'assets/y.jpg' });
  assert.equal(bare.art.src, 'assets/y.jpg');
  // bare string audio = music layer, default volume .5
  const aud = normaliseScene({ id: 'z', audio: 'assets/audio/m.mp3' });
  assert.equal(aud.audio.music.src, 'assets/audio/m.mp3');
  assert.equal(aud.audio.music.volume, .5);
  // deliberate volume 0 survives
  assert.equal(normaliseLayer({ src: 'a.mp3', volume: 0 }).volume, 0);
  // absent volume defaults .5
  assert.equal(normaliseLayer({ src: 'a.mp3' }).volume, .5);
  // grid: empty string is not an override; rows never read
  assert.equal(normaliseScene({ id: 'g', grid: { cols: '' } }).grid, null);
  assert.deepEqual(normaliseScene({ id: 'g', grid: { cols: 20, rows: 99 } }).grid, { cols: 20 });
});

test('deriveRows keeps tiles square and clamps', () => {
  assert.equal(deriveRows(24, 16 / 9), 14);
  assert.equal(deriveRows(60, 0.5), 40);   // clamp high
  assert.equal(deriveRows(4, 100), 4);     // clamp low
});

test('missingAssets: empty scan proves nothing', () => {
  const scene = normaliseScene({ id: 's', art: 'assets/gone.jpg' });
  assert.deepEqual(missingAssets(scene, []), []);
  assert.deepEqual(missingAssets(scene, ['assets/other.jpg']), ['assets/gone.jpg']);
});

test('normaliseAudio: string, layers, null', () => {
  assert.equal(normaliseAudio(null), null);
  assert.equal(normaliseAudio({ music: null, ambience: null }), null);
  const a = normaliseAudio('m.mp3');
  assert.equal(a.music.src, 'm.mp3');
  assert.equal(a.ambience, null);
});

/* --------------------------------------------------------------- sessions */

function sessionWith() {
  const s = blankSession();
  s.npcs.push(npc({ hp: 7 }));
  s.field.reveal.g1 = { on: false, hp: 'coarse' };
  seatAll(s);
  return s;
}

test('normaliseSession drops staged, stale refs, keeps paused', () => {
  const raw = {
    npcs: [{ id: 'g1', name: 'Goblin', hpMax: 7 }],
    encounter: { on: true, members: ['npc:g1', 'npc:gone'], init: { 'npc:g1': 12, 'npc:gone': 3 } },
    field: { paused: true, staged: { sceneId: 'x' }, tokens: { 'npc:g1': { x: 99, y: -2 }, 'npc:gone': { x: 1, y: 1 } } },
  };
  const s = normaliseSession(raw);
  assert.equal(s.field.staged, undefined);
  assert.equal(s.field.paused, true);
  assert.deepEqual(s.encounter.members, ['npc:g1']);
  assert.deepEqual(Object.keys(s.encounter.init), ['npc:g1']);
  assert.deepEqual(Object.keys(s.field.tokens), ['npc:g1']);
  assert.equal(s.field.tokens['npc:g1'].x, 23);   // clamped to cols-1
  assert.equal(s.field.tokens['npc:g1'].y, 0);
});

test('pre-scenes save defaults live/grid true; fresh session defaults false', () => {
  assert.equal(normaliseSession({}).field.live, true);
  assert.equal(normaliseSession({}).field.grid, true);
  assert.equal(blankSession().field.live, false);
  assert.equal(blankSession().field.grid, false);
});

test('encounter.on inferred from members for old saves; forced off when empty', () => {
  const old = normaliseSession({ npcs: [{ id: 'g1', hpMax: 7 }], encounter: { members: ['npc:g1'], init: {} } });
  assert.equal(old.encounter.on, true);
  const explicit = normaliseSession({ encounter: { on: true, members: [] } });
  assert.equal(explicit.encounter.on, false);
});

test('serialiseSession excludes party and bestiary', () => {
  const s = sessionWith();
  const out = serialiseSession(s);
  assert.equal(out.party, undefined);
  assert.equal(out.bestiary, undefined);
  assert.equal(out.version, 2);
  assert.ok(out.field && out.play && out.npcs && out.encounter);
});

/* ----------------------------------------------------------------- combat */

test('startCombat seats members, endCombat keeps npcs and wounds', () => {
  const s = sessionWith();
  startCombat(s, ['npc:g1'], [['npc:g1', 15]]);
  assert.equal(s.encounter.on, true);
  assert.equal(s.field.live, true);
  assert.equal(s.encounter.init['npc:g1'], 15);
  s.npcs[0].hp = 2;
  endCombat(s);
  assert.equal(s.encounter.on, false);
  assert.equal(s.npcs.length, 1);
  assert.equal(s.npcs[0].hp, 2);
});

test('inOrder: unrolled sorts to the bottom, not out of the fight', () => {
  const s = blankSession();
  s.npcs.push(npc({ id: 'a', name: 'A', initMod: 0 }), npc({ id: 'b', name: 'B', initMod: 2 }));
  startCombat(s, ['npc:a', 'npc:b'], [['npc:a', 10]]);
  const order = inOrder(s);
  assert.equal(order.length, 2);
  assert.equal(order[0].ref, 'npc:a');    // rolled beats unrolled
  assert.equal(order[1].init, undefined);
});

test('advance skips a monster at 0 hp and wraps the round', () => {
  const s = blankSession();
  s.npcs.push(npc({ id: 'a', name: 'A' }), npc({ id: 'b', name: 'B' }));
  startCombat(s, ['npc:a', 'npc:b'], [['npc:a', 20], ['npc:b', 10]]);
  advance(s, 1);                           // onto A
  assert.equal(s.encounter.activeRef, 'npc:a');
  s.npcs[1].hp = 0;                        // B is down
  advance(s, 1);                           // skips B, wraps to A, round++
  assert.equal(s.encounter.activeRef, 'npc:a');
  assert.equal(s.encounter.round, 2);
});

test('seatAll seats everyone except benched, drops ghosts', () => {
  const s = blankSession();
  s.npcs.push(npc({ id: 'a' }));
  s.field.tokens['npc:ghost'] = { x: 1, y: 1 };
  seatAll(s);
  assert.ok(s.field.tokens['npc:a']);
  assert.equal(s.field.tokens['npc:ghost'], undefined);
});

test('freeSquare walks rows first and never collides', () => {
  const f = { cols: 2, rows: 2, tokens: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } };
  assert.deepEqual(freeSquare(f), { x: 0, y: 1 });
});

test('applyMove clamps and reports whether anything moved', () => {
  const s = sessionWith();
  const before = { ...s.field.tokens['npc:g1'] };
  assert.equal(applyMove(s, 'npc:g1', before.x, before.y), false);
  assert.equal(applyMove(s, 'npc:g1', 999, 999), true);
  assert.deepEqual(s.field.tokens['npc:g1'], { x: 23, y: 13 });
  assert.equal(applyMove(s, 'npc:gone', 1, 1), false);
});

test('Chebyshev reach: speed 9 m = 6 squares', () => {
  const s = sessionWith();
  s.field.reveal.g1 = { on: true, hp: 'coarse' };
  s.field.live = true; s.field.grid = true;
  const b = buildBoard(s, { master: .7, muted: false }, urlFor);
  assert.equal(b.tokens[0].reach, 6);
});

/* ------------------------------------------------------------- projection */

test('hidden npc is absent from tokens and npcs, masked in order', () => {
  const s = sessionWith();                 // g1 hidden
  s.field.live = true; s.field.grid = true;
  startCombat(s, ['npc:g1'], [['npc:g1', 12]]);
  const b = buildBoard(s, { master: .7, muted: false }, urlFor);
  assert.equal(b.tokens.length, 0);
  assert.equal(b.npcs.length, 0);
  assert.equal(b.order.length, 1);
  assert.equal(b.order[0].name, '···');
  assert.equal(b.order[0].portrait, null);
});

test('revealed npc out of combat: token has hp null (scenery)', () => {
  const s = sessionWith();
  s.field.reveal.g1 = { on: true, hp: 'exact' };
  s.field.live = true; s.field.grid = true;
  const b = buildBoard(s, { master: .7, muted: false }, urlFor);
  assert.equal(b.tokens.length, 1);
  assert.equal(b.tokens[0].hp, null);
  assert.equal(b.npcs[0].hp, null);
});

test('mode idle/scene/field and tokens forced empty off-grid', () => {
  const s = sessionWith();
  s.field.reveal.g1 = { on: true, hp: 'coarse' };
  s.field.live = false;
  assert.equal(buildBoard(s, { master: 1, muted: false }, urlFor).mode, 'idle');
  s.field.live = true; s.field.grid = false;
  const scene = buildBoard(s, { master: 1, muted: false }, urlFor);
  assert.equal(scene.mode, 'scene');
  assert.deepEqual(scene.tokens, []);
  s.field.grid = true;
  assert.equal(buildBoard(s, { master: 1, muted: false }, urlFor).mode, 'field');
});

test('audio only travels live, master 0 when muted', () => {
  const s = sessionWith();
  s.field.audio = normaliseAudio('m.mp3');
  s.field.live = false;
  assert.equal(buildBoard(s, { master: .7, muted: false }, urlFor).audio, null);
  s.field.live = true;
  assert.equal(buildBoard(s, { master: .7, muted: true }, urlFor).audio.master, 0);
  assert.equal(buildBoard(s, { master: .7, muted: false }, urlFor).audio.master, .7);
});

/* ----------------------------------------------------------------- scenes */

test('goLive forces grid off, applies scene grid size, resolves assets', () => {
  const s = blankSession();
  s.field.grid = true;
  const scene = normaliseScene({ id: 'tav', art: 'assets/tav.jpg', grid: { cols: 20 },
                                 audio: { music: { src: 'assets/audio/m.mp3', volume: .4 } } });
  goLive(s, scene, { aspectOf: (src, fb) => 2, urlFor });
  assert.equal(s.field.live, true);
  assert.equal(s.field.grid, false);
  assert.equal(s.field.cols, 20);
  assert.equal(s.field.rows, 10);          // cols / aspect 2
  assert.equal(s.field.map.src, '/campaigns/test/assets/tav.jpg');
  assert.equal(s.field.audio.music.src, '/campaigns/test/assets/audio/m.mp3');
  assert.equal(s.field.audio.music.volume, .4);
});

test('goLive(null) = Sin escena clears everything', () => {
  const s = blankSession();
  s.field.live = true; s.field.grid = true; s.field.map = { src: 'x', stamp: null };
  goLive(s, null, { aspectOf: flatAspect, urlFor });
  assert.equal(s.field.map, null);
  assert.equal(s.field.audio, null);
  assert.equal(s.field.grid, false);
  assert.equal(s.field.live, true);        // still live: an empty board is a thing to show
});

test('roster seats fresh instances, skips occupied squares, no double-seat', () => {
  const s = blankSession();
  s.bestiary.push(normaliseBeast({ id: 'gob', name: 'Goblin', hpMax: 7 }));
  const scene = normaliseScene({ id: 'amb', roster: [{ beastId: 'gob', x: 3, y: 2 }, { beastId: 'gone', x: 0, y: 0 }] });
  goLive(s, scene, { aspectOf: flatAspect, urlFor });
  assert.equal(s.npcs.length, 1);          // 'gone' skipped
  assert.notEqual(s.npcs[0].id, 'gob');    // fresh instance, not the template
  assert.equal(s.npcs[0].hp, 7);           // spawned at full
  goLive(s, scene, { aspectOf: flatAspect, urlFor });
  assert.equal(s.npcs.length, 1);          // square occupied -> no double-seat
});

test('roster objects spawn on the instance: danglers dropped, hp counts the +PG in', () => {
  const s = blankSession();
  s.bestiary.push(normaliseBeast({ id: 'gob', name: 'Goblin', ac: 13, hpMax: 7 }));
  s.objects.push(normaliseObject({ id: 'ring', name: 'Anillo', mods: { hpMax: 2, ac: 1 } }));
  const scene = normaliseScene({ id: 'amb',
    roster: [{ beastId: 'gob', x: 3, y: 2, objects: ['ring', 'ring', 'gone'] }] });
  assert.deepEqual(scene.roster[0].objects, ['ring', 'ring', 'gone']);  // parsing keeps, resolving judges
  goLive(s, scene, { aspectOf: flatAspect, urlFor });
  assert.deepEqual(s.npcs[0].objects, ['ring', 'ring']);   // duplicates stack, dangler gone
  const cb = npcHandle(s.npcs[0], s.objects);
  assert.equal(cb.hpMax, 11);                              // 7 + 2 + 2
  assert.equal(s.npcs[0].hp, 11);                          // spawned at its *modified* full
  assert.equal(cb.ac, 15);
});

test('a roster entry without objects still spawns (old scene files)', () => {
  const s = blankSession();
  s.bestiary.push(normaliseBeast({ id: 'gob', name: 'Goblin', hpMax: 7 }));
  const scene = normaliseScene({ id: 'old', roster: [{ beastId: 'gob', x: 1, y: 1 }] });
  goLive(s, scene, { aspectOf: flatAspect, urlFor });
  assert.deepEqual(s.npcs[0].objects, []);
  assert.equal(s.npcs[0].hp, 7);
});

test('scene with no grid override keeps the table size', () => {
  const s = blankSession();
  s.field.cols = 30; s.field.rows = 10;
  const size = sceneGridSize(normaliseScene({ id: 'x' }), s.field, flatAspect, urlFor);
  assert.deepEqual(size, { cols: 30, rows: 10 });
});

/* ------------------------------------------------------------------ story */

const NOTES = [
  noteFrom('story/gente/raimo.md', '# Raimo\n\nCobra el amarre. #puerto'),
  noteFrom('story/actos/hook.md', 'Se acerca el [[Raimo]] y también [[recelo|el recelo del pueblo]]. #acto #puerto'),
  noteFrom('story/lore/recelo.md', '# Recelo\n\nNadie confía en forasteros.'),
  noteFrom('story/suelto.md', 'Sin heading, con [[raimo]] por filename.'),
];

test('noteFrom groups by first segment, bare files read General', () => {
  assert.equal(NOTES[0].group, 'gente');
  assert.equal(NOTES[3].group, 'General');
});

test('noteTitle: first heading, else humanized filename', () => {
  assert.equal(noteTitle(NOTES[0]), 'Raimo');
  assert.equal(noteTitle(NOTES[3]), 'Suelto');
});

test('wikilinks resolve by title first then filename, case-insensitive', () => {
  const idx = storyIndex(NOTES);
  const links = noteLinks(NOTES[1], idx);
  assert.equal(links.length, 2);
  assert.equal(links[0].path, 'story/gente/raimo.md');
  assert.equal(links[1].path, 'story/lore/recelo.md');   // piped form resolves target
  assert.equal(noteLinks(NOTES[3], idx)[0].path, 'story/gente/raimo.md');  // filename match
});

test('piped [[target|label]] renders the label, resolves the target', () => {
  const idx = storyIndex(NOTES);
  const html = mdToHtml(NOTES[1].content, idx);
  assert.ok(html.includes('>el recelo del pueblo</span>'));
  assert.ok(html.includes('data-opennote="story/lore/recelo.md"'));
});

test('self-links and unresolved targets never count as backlinks', () => {
  const self = noteFrom('story/a.md', '# A\n[[A]] talks about itself and [[Nadie]].');
  const idx = storyIndex([self, ...NOTES]);
  assert.deepEqual(noteLinks(self, idx), []);
  const back = backlinksFor(NOTES[0], idx, NOTES);
  assert.equal(back.length, 2);            // hook.md and suelto.md
});

test('unresolved link renders muted, not clickable', () => {
  const idx = storyIndex(NOTES);
  const html = mdToHtml('Ver [[Inexistente]].', idx);
  assert.ok(html.includes('wikilink unresolved'));
  assert.ok(!html.includes('data-opennote="story/inexistente'));
});

test('tags derived lowercase and deduped; markdown escapes html', () => {
  assert.deepEqual(noteTags(NOTES[1]), ['acto', 'puerto']);
  const idx = storyIndex([]);
  const html = mdToHtml('# T\n\n<script>alert(1)</script> & **bold** *it*\n\n- a\n- b', idx);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<em>it</em>'));
  assert.ok(html.includes('<ul><li>a</li><li>b</li></ul>'));
  assert.ok(html.includes('<h3>T</h3>'));  // headings pushed down two levels
});

test('wikilinks and tags carry their raw source for the editor round trip', () => {
  const idx = storyIndex(NOTES);
  const html = mdToHtml('Ver [[recelo|el recelo del pueblo]] y #Acto.', idx);
  assert.ok(html.includes('data-md="[[recelo|el recelo del pueblo]]"'));
  assert.ok(html.includes('data-md="#Acto"'));
  assert.ok(html.includes('contenteditable="false"'));
});

/* --------------------------------------------------------------- domToMd
   Fake nodes with the same shape the browser hands the editor: mdToHtml's
   own output plus what contentEditable typing adds (div, b/i, br, nbsp). */

const el = (tagName, childNodes = [], attrs = {}) =>
  ({ nodeType: 1, tagName, childNodes, getAttribute: k => (k in attrs ? attrs[k] : null) });
const tx = textContent => ({ nodeType: 3, textContent });
const root = childNodes => ({ childNodes });

test('domToMd: blocks — headings, paragraphs, bullets', () => {
  const md = domToMd(root([
    el('H3', [tx('Título')]),
    el('P', [tx('Hola '), el('STRONG', [tx('mundo')]), tx('.')]),
    el('H5', [tx('Sub')]),
    el('UL', [el('LI', [tx('a')]), el('LI', [el('EM', [tx('b')])])]),
  ]));
  assert.equal(md, '# Título\n\nHola **mundo**.\n\n### Sub\n\n- a\n- *b*\n');
});

test('domToMd: what typing adds — divs, br, b/i, nbsp, empty lines', () => {
  const md = domToMd(root([
    el('P', [tx('uno'), el('BR'), tx('dos tres')]),
    el('DIV', [el('BR')]),                      // Chrome's empty line
    el('DIV', [tx('línea '), el('B', [tx(' negrita ')]), tx('suelta')]),
  ]));
  assert.equal(md, 'uno\ndos tres\n\nlínea **negrita** suelta\n');
});

test('domToMd: data-md atoms return verbatim; unknown elements keep only text', () => {
  const md = domToMd(root([
    el('P', [
      tx('Ver '),
      el('SPAN', [tx('el recelo del pueblo')], { 'data-md': '[[recelo|el recelo del pueblo]]' }),
      tx(' y '),
      el('SPAN', [tx('#Acto')], { 'data-md': '#Acto' }),
      el('CODE', [tx(' pegado')]),               // pasted junk degrades to prose
    ]),
  ]));
  assert.equal(md, 'Ver [[recelo|el recelo del pueblo]] y #Acto pegado\n');
});

test('domToMd: empty edit surface is an empty file, root text becomes a paragraph', () => {
  assert.equal(domToMd(root([])), '');
  assert.equal(domToMd(root([el('DIV', [el('BR')])])), '');
  assert.equal(domToMd(root([tx('suelto al principio')])), 'suelto al principio\n');
});

/* ------------------------------------------------------------------- util */

test('esc, slugify, encodePath', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(slugify('Thálor Vaélen!'), 'thalor-vaelen');
  assert.equal(slugify('***'), 'sin-nombre');
  assert.equal(encodePath('story/Medalla del Tratado.md'), 'story/Medalla%20del%20Tratado.md');
});

/* ---------------------------------------------------------------- objects */

test('normaliseObject: coerces, drops zero/unknown mods, trims effects', () => {
  const o = normaliseObject({ name: 'Anillo', mods: { ac: '1', hpMax: 0, speed: 'x', foo: 5 },
                              effects: [' brilla ', ''] });
  assert.deepEqual(o.mods, { ac: 1 });
  assert.deepEqual(o.effects, ['brilla']);
  assert.equal(normaliseObject(null).name, 'Sin nombre');
});

test('modTotals stacks duplicates and skips dangling ids', () => {
  const catalog = [normaliseObject({ id: 'a', mods: { ac: 1, pp: 5 } })];
  assert.deepEqual(modTotals(catalog, ['a', 'a', 'gone']),
    { ac: 2, hpMax: 0, initMod: 0, speed: 0, pp: 10 });
  assert.deepEqual(modTotals(catalog, undefined),
    { ac: 0, hpMax: 0, initMod: 0, speed: 0, pp: 0 });
});

test('heldObjects groups with counts; effectLines dedupe', () => {
  const catalog = [
    normaliseObject({ id: 'a', name: 'A', effects: ['brilla'] }),
    normaliseObject({ id: 'b', name: 'B', effects: ['brilla', 'pesa'] }),
  ];
  const held = heldObjects(catalog, ['a', 'b', 'a', 'gone']);
  assert.deepEqual(held.map(h => [h.obj.id, h.count]), [['a', 2], ['b', 1]]);
  assert.deepEqual(effectLines(catalog, ['a', 'b']), ['brilla', 'pesa']);
});

test('normalisePlay keeps held ids, drops junk', () => {
  assert.deepEqual(normalisePlay({ objects: ['a', '', 7, 'b'] }).objects, ['a', 'b']);
  assert.deepEqual(normalisePlay(null).objects, []);
});

test('serialiseSession: catalog stays out, assignments stay in', () => {
  const c = normalise({ id: 'p9', name: 'Pip' });
  const s = normaliseSession({
    party: [c],
    play: { p9: { objects: ['ring'] } },
    npcs: [{ id: 'g1', hpMax: 7, objects: ['ring'] }],
    objects: [{ id: 'ring', name: 'Anillo' }],
  });
  assert.equal(s.objects[0].name, 'Anillo');
  const out = serialiseSession(s);
  assert.equal(out.objects, undefined);           // the catalog is objects/*.json
  assert.deepEqual(out.play.p9.objects, ['ring']);
  assert.deepEqual(out.npcs[0].objects, ['ring']);
});

test('npcHandle layers held objects over stored stats', () => {
  const catalog = [normaliseObject({ id: 'ring', mods: { ac: 1, hpMax: 2, initMod: 1, pp: 3 } })];
  const cb = npcHandle(npc({ objects: ['ring', 'ring'] }), catalog);
  assert.equal(cb.ac, 15);                        // 13 + 2
  assert.equal(cb.hpMax, 11);                     // 7 + 4
  assert.equal(cb.initMod, 2);
  assert.equal(cb.pp, null);                      // unknown + bonus stays unknown
  assert.equal(currentHP(cb), 11);                // hp: null reads full at the raised max
  const noSpeed = Object.assign(normaliseBeast({ id: 'x', speed: 'None' }), normalisePlay(null),
                                { objects: ['ring'] });
  assert.equal(npcHandle(noSpeed, catalog).speed, null);
});

test('=n above the raised max stores base, reads effective (no double count)', () => {
  const catalog = [normaliseObject({ id: 'ring', mods: { hpMax: 2 } })];
  const n = npc({ objects: ['ring'] });
  const cb = npcHandle(n, catalog);
  assert.equal(cb.hpMax, 9);
  applyDelta(cb, '=20');
  assert.equal(n.hpMax, 18);                      // what the instance stores
  assert.equal(n.hp, 20);                         // what the table sees
  assert.equal(npcHandle(n, catalog).hpMax, 20);
});

test('longRest and pcMaxHP heal to the object-raised maximum', () => {
  const c = normalise({ id: 'p8', name: 'Nora' });
  const s = normaliseSession({
    party: [c],
    play: { p8: { hp: 0, objects: ['ring', 'ring'] } },
    objects: [{ id: 'ring', mods: { hpMax: 2 } }],
  });
  assert.equal(pcMaxHP(s, s.party[0]), 4);        // blank sheet: base 0, +2 twice
  longRest(s);
  assert.equal(s.play.p8.objects.length, 2);      // a rest packs nothing away
  assert.equal(s.play.p8.hp, 4);
});

test('board party rows carry the object-raised hpMax', () => {
  const c = normalise({ id: 'p7', name: 'Ivo' });
  const s = normaliseSession({
    party: [c],
    play: { p7: { objects: ['ring'] } },
    objects: [{ id: 'ring', mods: { hpMax: 2 } }],
  });
  seatAll(s);
  const b = buildBoard(s, { master: .7, muted: false }, urlFor);
  assert.equal(b.party[0].hpMax, 2);              // blank sheet: base 0 + 2
  assert.equal(b.party[0].hp, 2);                 // hp: null = full at the raised max
});

/* ------------------------------------------------------------------- runs
   The path arithmetic that decides which mesa a file belongs to. fs.js walks
   a real folder with classify() and check-campaign.js lints one with it, so
   a mistake here is a party that silently reads empty. */

test('runPrefix/runRel: a flat campaign is the root itself', () => {
  assert.equal(runPrefix(''), '');
  assert.equal(runPrefix(null), '');
  assert.equal(runPrefix('guils'), 'runs/guils');
  assert.equal(runRel('', 'session.json'), 'session.json');
  assert.equal(runRel('runs/guils', 'session.json'), 'runs/guils/session.json');
  assert.equal(runRel('runs/guils', 'players/el-muro.json'), 'runs/guils/players/el-muro.json');
});

test('classify: an open run reads its own table and nobody else\'s', () => {
  const c = p => classify(p, 'runs/guils');
  assert.equal(c('runs/guils/session.json'), 'session');
  assert.equal(c('runs/guils/players/el-muro.json'), 'players');
  /* Another mesa's identical files are invisible — the whole point. */
  assert.equal(c('runs/last/session.json'), null);
  assert.equal(c('runs/last/players/el-cantor.json'), null);
  /* Preparation is campaign-level and shared by every mesa. */
  assert.equal(c('monsters/raimo.json'), 'monsters');
  assert.equal(c('objects/arpon-de-nasa.json'), 'objects');
  assert.equal(c('scenarios/faro.json'), 'scenarios');
  assert.equal(c('story/actos/00-llegada.md'), 'story');
  assert.equal(c('assets/maps/1756.jpg'), 'assets');
  /* A run's own notes are not story notes yet, and a stray root session
     belongs to no mesa. */
  assert.equal(c('runs/guils/estado.md'), null);
  assert.equal(c('runs/guils/bitacora/01.md'), null);
  assert.equal(c('session.json'), null);
  assert.equal(c('players/el-muro.json'), null);
});

test('classify: a flat campaign reads exactly what it always did', () => {
  const c = p => classify(p, '');
  assert.equal(c('session.json'), 'session');
  assert.equal(c('players/pip-nosewick.json'), 'players');
  assert.equal(c('monsters/sewer-cheese-rat.json'), 'monsters');
  assert.equal(c('story/00-the-vanishing.md'), 'story');
  /* Still only one level down, still only .json — the old isTop() rule. */
  assert.equal(c('monsters/undead/lich.json'), null);
  assert.equal(c('players/notes.md'), null);
  assert.equal(c('players/old/pip.json'), null);
});

test('classify: preparation mode has no table at all', () => {
  const c = p => classify(p, null);
  assert.equal(c('session.json'), null);
  assert.equal(c('players/pip-nosewick.json'), null);
  assert.equal(c('runs/guils/session.json'), null);
  assert.equal(c('monsters/raimo.json'), 'monsters');
  assert.equal(c('story/actos/00-llegada.md'), 'story');
});

test('runSlugOf / isRunPath', () => {
  assert.equal(runSlugOf('runs/guils/session.json'), 'guils');
  assert.equal(runSlugOf('runs/guils'), 'guils');
  assert.equal(runSlugOf('runs'), null);
  assert.equal(runSlugOf('monsters/raimo.json'), null);
  assert.equal(isRunPath('runs/guils/players/x.json'), true);
  assert.equal(isRunPath('runsomething/x.json'), false);
  assert.equal(PREP_SLUG.startsWith('#'), true);   // never a real folder name
});

test('runLabel / mesaName: the picker shows the name the DM wrote', () => {
  assert.equal(runLabel('guils'), 'Guils');
  assert.equal(runLabel('la-otra_mesa'), 'La otra mesa');
  assert.equal(mesaName('---\nmesa: Guils\ncampana: Marea Baja\n---\n\n# Guils'), 'Guils');
  assert.equal(mesaName('---\nmesa:\n---\n'), null);      // empty field, use the slug
  assert.equal(mesaName('# Guils\n\nno frontmatter'), null);
  assert.equal(mesaName(''), null);
  assert.equal(mesaName(null), null);
});
