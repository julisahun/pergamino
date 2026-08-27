import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProjection, coarseWord, tokenHP } from './projection.js';
import { blankSession, normalisePlay } from './session.js';
import { normaliseBeast } from './beasts.js';
import { loadNpc, startCombat, endCombat, advance, inOrder, seatAll,
         stepsBetween, reachOf, removeNpc } from './combat.js';
import { normalise } from '../rules/character.js';

/** A table with one player and however many monsters. */
function table({ mode = 'tablero' } = {}) {
  const s = blankSession();
  const c = normalise({ id: 'pip', name: 'Pip', class: 'bardo', species: 'gnomo',
    background: 'artista', buy: { FUE: 8, DES: 14, CON: 12, INT: 10, SAB: 12, CAR: 15 } });
  s.party = [c];
  s.play[c.id] = normalisePlay(null);
  s.field.mode = mode;
  seatAll(s);
  return s;
}

const goblin = (name = 'Goblin') =>
  normaliseBeast({ id: 'g', name, ac: 13, hpMax: 7, initMod: 2, speed: 9 });

test('the five words say enough and no more', () => {
  assert.equal(coarseWord(7, 7), 'ileso');
  assert.equal(coarseWord(6, 7), 'herido');
  assert.equal(coarseWord(2, 7), 'malherido');
  assert.equal(coarseWord(1, 7), 'grave');
  assert.equal(coarseWord(0, 7), 'fuera de combate');
});

test('hit points travel exact, coarse, or not at all', () => {
  assert.deepEqual(tokenHP(3, 10, 'exact'), { mode: 'exact', cur: 3, max: 10, pct: .3 });
  assert.deepEqual(tokenHP(3, 10, 'coarse'), { mode: 'coarse', word: 'malherido', pct: .3 });
  assert.equal(tokenHP(3, 10, 'none'), null);
});

test('A HIDDEN NPC IS ABSENT FROM THE PAYLOAD, not merely unrendered', () => {
  const s = table();
  loadNpc(s, goblin(), 1);
  const p = buildProjection(s);
  assert.deepEqual(p.npcs, [], 'not in the roster');
  assert.deepEqual(p.tokens.filter(t => t.kind === 'npc'), [], 'not on the board');
  /* The real assertion: the word cannot be found anywhere in what was sent. */
  assert.ok(!JSON.stringify(p).includes('Goblin'), 'the name is nowhere in the payload');
});

test("and the DM's own mirror keeps it, marked", () => {
  const s = table();
  loadNpc(s, goblin(), 1);
  const dm = buildProjection(s, { audience: 'dm' });
  assert.equal(dm.npcs.length, 1);
  assert.equal(dm.npcs[0].hidden, true);
  assert.equal(dm.tokens.find(t => t.kind === 'npc')?.hidden, true);
});

test('revealing one puts it in the payload, without saying more than it should', () => {
  const s = table();
  /* A loaded npc is an INSTANCE with its own id — the template's id belongs to
     the bestiary entry, and three goblins from one entry are three creatures. */
  const [ref] = loadNpc(s, goblin(), 1);
  const id = ref.slice(4);
  s.field.reveal[id] = { on: true, hp: 'coarse' };
  const p = buildProjection(s);
  assert.equal(p.npcs.length, 1);
  assert.equal(p.npcs[0].name, 'Goblin');
  /* Outside a fight it is scenery: no hit points at all. */
  assert.equal(p.npcs[0].hp, null);

  startCombat(s, ['pc:pip', ref], []);
  const q = buildProjection(s);
  assert.deepEqual(q.npcs[0].hp, { mode: 'coarse', word: 'ileso', pct: 1 });
  assert.ok(!JSON.stringify(q.npcs[0].hp).includes('7'), 'the number itself never travels');

  s.field.reveal[id] = { on: true, hp: 'exact' };
  assert.equal(buildProjection(s).npcs[0].hp?.mode, 'exact');
});

test('a hidden monster in the order is three dots, with no face', () => {
  const s = table();
  const [ref] = loadNpc(s, goblin(), 1);
  startCombat(s, ['pc:pip', ref], [['pc:pip', 15], [ref, 12]]);
  const p = buildProjection(s);
  assert.deepEqual(p.order.map(o => o.name), ['Pip', '···']);
  assert.equal(p.order[1].portrait, null);
  /* The DM sees the name — it is the same payload, asked for differently. */
  assert.deepEqual(buildProjection(s, { audience: 'dm' }).order.map(o => o.name),
    ['Pip', 'Goblin']);
});

test('players are always exact, and never gated on a reveal', () => {
  const s = table();
  s.play.pip.hp = 4;
  const p = buildProjection(s);
  assert.equal(p.party[0].hp, 4);
  assert.equal(p.tokens.find(t => t.kind === 'pc')?.hp?.mode, 'exact');
});

test('tokens travel only in tablero, fight or no fight', () => {
  const s = table({ mode: 'escena' });
  const [ref] = loadNpc(s, goblin(), 1);
  s.field.reveal[ref.slice(4)] = { on: true, hp: 'exact' };
  startCombat(s, ['pc:pip', ref], []);
  assert.deepEqual(buildProjection(s).tokens, []);
  s.field.mode = 'tablero';
  assert.equal(buildProjection(s).tokens.length, 2);
});

test('the banner is combat data, not a display switch', () => {
  const s = table();
  assert.equal(buildProjection(s).banner, null);
  const [ref] = loadNpc(s, goblin(), 1);
  startCombat(s, ['pc:pip', ref], [['pc:pip', 18], [ref, 9]]);
  advance(s, 1);
  const p = buildProjection(s);
  assert.deepEqual(p.banner, { round: 1, active: 'Pip' });
  endCombat(s);
  assert.equal(buildProjection(s).banner, null);
  assert.deepEqual(buildProjection(s).order, []);
});

test('reach is Chebyshev: the diagonal costs one square', () => {
  assert.equal(reachOf(9), 6);          // 9 m at 1.5 m a square
  assert.equal(reachOf(null), null);
  assert.equal(stepsBetween({ x: 0, y: 0 }, { x: 3, y: 3 }), 3);
  assert.equal(stepsBetween({ x: 0, y: 0 }, { x: 3, y: 1 }), 3);
  assert.equal(stepsBetween({ x: 2, y: 5 }, { x: 2, y: 5 }), 0);
});

/* ------------------------------------------------------------- the fight */

test('loading is not fighting, and fighting is not existing', () => {
  const s = table();
  const refs = loadNpc(s, goblin(), 3);
  assert.equal(s.npcs.length, 3);
  assert.deepEqual(s.npcs.map(n => n.name), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
  assert.equal(s.encounter.on, false, 'loading three goblins started no fight');

  startCombat(s, ['pc:pip', refs[0]], []);
  assert.deepEqual(s.encounter.members, ['pc:pip', refs[0]]);
  assert.equal(s.npcs.length, 3, 'the other two are still at the table');

  endCombat(s);
  assert.equal(s.npcs.length, 3, 'and ending the fight deletes nobody');
  assert.equal(s.encounter.on, false);
});

test('starting a fight does not touch the television', () => {
  const s = table({ mode: 'nada' });
  const [ref] = loadNpc(s, goblin(), 1);
  startCombat(s, ['pc:pip', ref], []);
  assert.equal(s.field.mode, 'nada', 'a fight is a state of the game, not of the screen');
});

test('an absent initiative means "has not rolled", not "out"', () => {
  const s = table();
  const [ref] = loadNpc(s, goblin(), 1);
  startCombat(s, ['pc:pip', ref], [['pc:pip', 14]]);
  const order = inOrder(s);
  assert.equal(order.length, 2, 'both are in the fight');
  assert.equal(order[0].ref, 'pc:pip');
  assert.equal(order[1].init, undefined, 'the goblin simply has not rolled');
});

test('turns skip a monster that is down, and the round ticks over', () => {
  const s = table();
  const refs = loadNpc(s, goblin(), 2);
  startCombat(s, ['pc:pip', ...refs], [['pc:pip', 20], [refs[0], 15], [refs[1], 10]]);
  advance(s, 1);
  assert.equal(s.encounter.activeRef, 'pc:pip');
  advance(s, 1);
  assert.equal(s.encounter.activeRef, refs[0]);
  /* Drop the second goblin: its turn is skipped, not removed. */
  s.npcs[1].hp = 0;
  advance(s, 1);
  assert.equal(s.encounter.activeRef, 'pc:pip', 'wrapped past the one that is down');
  assert.equal(s.encounter.round, 2);
  assert.equal(s.encounter.members.length, 3, 'the downed one is still in the fight');
});

test('a monster taken off the board is gone, cleanly', () => {
  const s = table();
  const [ref] = loadNpc(s, goblin(), 1);
  startCombat(s, ['pc:pip', ref], [[ref, 12]]);
  removeNpc(s, ref);
  assert.deepEqual(s.npcs, []);
  assert.deepEqual(s.encounter.members, ['pc:pip']);
  assert.equal(s.field.tokens[ref], undefined);
  assert.equal(s.field.reveal[ref.slice(4)], undefined);
});

test('everybody who exists is seated, and a benched player is not', () => {
  const s = table();
  loadNpc(s, goblin(), 2);
  assert.equal(Object.keys(s.field.tokens).length, 3);
  s.field.benched = ['pc:pip'];
  seatAll(s);
  assert.equal(s.field.tokens['pc:pip'], undefined);
  assert.equal(Object.keys(s.field.tokens).length, 2);
});
