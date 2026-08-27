import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDelta, applyGoldDelta, poolsOf, spend, shortRest, longRest,
         slotKey, resKey } from './play.js';
import { blankSession, normalisePlay } from './session.js';
import { pcHandle, playOf } from './handles.js';
import { normalise } from '../rules/character.js';
import { normaliseBeast } from './beasts.js';
import { npcHandle } from './handles.js';

/* A handle is all the grammar needs: a maximum and a play object. Building one
   by hand keeps these tests about the grammar rather than about a character. */
const dummy = (hpMax, play = {}) => ({
  kind: /** @type {const} */ ('pc'), id: 'x', ref: /** @type {const} */ ('pc:x'),
  name: 'X', sub: '', level: 1, hpMax, ac: 10, initMod: 0, pp: 10, speed: 9,
  mods: { ac: 0, hpMax: 0, initMod: 0, speed: 0, pp: 0 }, portrait: null,
  play: { ...normalisePlay(null), ...play }, char: /** @type {any} */ ({}),
  d: /** @type {any} */ ({}), broken: [],
});

test('a bare number is damage, and so is a negative one', () => {
  const a = dummy(10);
  assert.equal(applyDelta(a, '7'), true);
  assert.equal(a.play.hp, 3);
  const b = dummy(10);
  applyDelta(b, '-7');
  assert.equal(b.play.hp, 3);
});

test('untouched means full, not zero', () => {
  const a = dummy(10, { hp: null });
  applyDelta(a, '3');
  assert.equal(a.play.hp, 7);     // 10 - 3, never 0 - 3
});

test('damage floors at zero and never goes negative', () => {
  const a = dummy(10, { hp: 4 });
  applyDelta(a, '99');
  assert.equal(a.play.hp, 0);
});

test('temporary hit points soak first, and replace rather than stack', () => {
  const a = dummy(10, { hp: 10, temp: 5 });
  applyDelta(a, '3');
  assert.deepEqual([a.play.hp, a.play.temp], [10, 2]);
  applyDelta(a, '4');
  assert.deepEqual([a.play.hp, a.play.temp], [8, 0]);
  applyDelta(a, 't5');
  assert.equal(a.play.temp, 5);
  applyDelta(a, 't2');
  assert.equal(a.play.temp, 2, 'a second t replaces: 5 and 2 never make 7');
});

test('healing caps at the maximum', () => {
  const a = dummy(10, { hp: 8 });
  applyDelta(a, '+5');
  assert.equal(a.play.hp, 10);
});

test('healing off the floor clears the death saves', () => {
  const a = dummy(10, { hp: 0, death: { ok: 1, fail: 2 } });
  applyDelta(a, '+1');
  assert.deepEqual(a.play.death, { ok: 0, fail: 0 });
});

test("=n sets the total, and raises a MONSTER's maximum with it", () => {
  const beast = { ...normaliseBeast({ id: 'g', name: 'Goblin', hpMax: 7 }), ...normalisePlay(null) };
  const cb = npcHandle(beast, []);
  applyDelta(cb, '=20');
  assert.equal(beast.hpMax, 20, 'the number typed became the maximum');
  assert.equal(cb.play.hp, 20);

  /* A player's maximum belongs to their sheet: =99 clamps instead. */
  const pc = dummy(10, { hp: 10 });
  applyDelta(pc, '=99');
  assert.equal(pc.play.hp, 10);
});

test('anything else is refused rather than guessed at', () => {
  const a = dummy(10, { hp: 6 });
  for (const bad of ['', 'siete', '3d6', '+', 't', '=', '7x', '--3']) {
    assert.equal(applyDelta(a, bad), false, bad);
  }
  assert.equal(a.play.hp, 6, 'nothing moved');
});

test('gold has the same grammar, minus temp and minus a ceiling', () => {
  const p = normalisePlay({ gold: 5 });
  assert.equal(applyGoldDelta(p, '+10'), true);
  assert.equal(p.gold, 15);
  applyGoldDelta(p, '-3');
  assert.equal(p.gold, 12);
  applyGoldDelta(p, '=0');
  assert.equal(p.gold, 0);
  /* Floors at zero: a debt is a story beat, not a number this box invents. */
  applyGoldDelta(p, '-12');
  assert.equal(p.gold, 0);
  assert.equal(applyGoldDelta(p, 't5'), false, 'gold has no temporary pool');
});

/* ------------------------------------------------------------ expendables */

const wizardAt = level => {
  const s = blankSession();
  const c = normalise({
    id: 'w', name: 'Mago', class: 'mago', species: 'humano', background: 'sabio',
    buy: { FUE: 8, DES: 14, CON: 14, INT: 15, SAB: 12, CAR: 8 },
    levels: Array.from({ length: level - 1 }, (_, i) => ({ level: i + 2, hp: 4, asi: {}, subclass: '', features: [] })),
    resources: [{ key: 'recuperacion', name: 'Recuperación arcana', uses: 1, per: 'corto' }],
  });
  s.party = [c];
  s.play[c.id] = normalisePlay(null);
  return { s, c };
};

test('spell slots are pools that come off the progression table', () => {
  const { s, c } = wizardAt(5);
  const pools = poolsOf(s, c);
  assert.deepEqual(pools.filter(p => p.kind === 'slot').map(p => [p.label, p.max]),
    [['Nivel 1', 4], ['Nivel 2', 3], ['Nivel 3', 2]]);
  assert.deepEqual(pools.filter(p => p.kind === 'resource').map(p => [p.label, p.max, p.per]),
    [['Recuperación arcana', 1, 'corto']]);
});

test('spending is bounded by the pool in both directions', () => {
  const { s, c } = wizardAt(5);
  const play = playOf(s, c.id);
  const first = poolsOf(s, c)[0];
  spend(play, first, 1);
  spend(play, first, 1);
  assert.equal(play.spent[slotKey('1')], 2);
  for (let i = 0; i < 10; i++) spend(play, poolsOf(s, c)[0], 1);
  assert.equal(play.spent[slotKey('1')], 4, 'never more than the pool holds');
  for (let i = 0; i < 10; i++) spend(play, poolsOf(s, c)[0], -1);
  assert.equal(play.spent[slotKey('1')], undefined, 'and an empty pool is simply absent');
});

test('a short rest brings back what a short rest brings back', () => {
  const { s, c } = wizardAt(5);
  const play = playOf(s, c.id);
  for (const p of poolsOf(s, c)) spend(play, p, 1);
  shortRest(s);
  assert.equal(play.spent[resKey('recuperacion')], undefined, 'the short-rest pool is back');
  assert.equal(play.spent[slotKey('1')], 1, 'the spell slot is not');
});

test('a warlock gets its pact slots back on a short rest', () => {
  const s = blankSession();
  const c = normalise({ id: 'b', name: 'Brujo', class: 'brujo',
    levels: Array.from({ length: 4 }, (_, i) => ({ level: i + 2 })) });
  s.party = [c];
  const pools = poolsOf(s, c);
  assert.equal(pools.length, 1);
  assert.match(pools[0].label, /^Pacto/);
  assert.equal(pools[0].per, 'corto');
  spend(playOf(s, c.id), pools[0], 1);
  shortRest(s);
  assert.deepEqual(playOf(s, c.id).spent, {});
});

test('a long rest puts everything back and takes one level of exhaustion off', () => {
  const { s, c } = wizardAt(5);
  const play = playOf(s, c.id);
  play.hp = 1; play.temp = 4; play.conditions = ['envenenado']; play.exh = 3;
  play.death = { ok: 1, fail: 2 };
  for (const p of poolsOf(s, c)) spend(play, p, 1);
  longRest(s);
  assert.equal(play.hp, pcHandle(s, c).hpMax);
  assert.deepEqual([play.temp, play.conditions, play.exh], [0, [], 2]);
  assert.deepEqual(play.death, { ok: 0, fail: 0 });
  assert.deepEqual(play.spent, {});
});

test('a class with nothing to spend shows no pools at all', () => {
  const s = blankSession();
  const c = normalise({ id: 'f', name: 'Guerrero', class: 'guerrero' });
  s.party = [c];
  assert.deepEqual(poolsOf(s, c), []);
});
