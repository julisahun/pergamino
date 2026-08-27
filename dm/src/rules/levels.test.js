import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proficiencyBonus, slotsAt, pactMagic, topSpellLevel, asiLevels,
         averageHitPoints, hitDice, levelOf, levelBrings, SUBCLASS_LEVEL,
         CASTER_KIND, MAX_LEVEL } from './levels.js';
import { CLASSES } from './data.js';

test('the proficiency bonus steps every four levels', () => {
  const pb = Array.from({ length: 20 }, (_, i) => proficiencyBonus(i + 1));
  assert.deepEqual(pb, [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
  assert.equal(proficiencyBonus(0), 2);     // clamped, never 1
  assert.equal(proficiencyBonus(99), 6);
});

test('a full caster gets the table everyone knows by heart', () => {
  assert.deepEqual(slotsAt('mago', 1), { 1: 2 });
  assert.deepEqual(slotsAt('mago', 3), { 1: 4, 2: 2 });
  assert.deepEqual(slotsAt('mago', 5), { 1: 4, 2: 3, 3: 2 });
  assert.deepEqual(slotsAt('mago', 11), { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 });
  assert.deepEqual(slotsAt('mago', 20),
    { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 });
});

test('a half caster reads the same table at half the level, rounded up', () => {
  assert.deepEqual(slotsAt('paladin', 1), slotsAt('mago', 1));
  assert.deepEqual(slotsAt('paladin', 2), slotsAt('mago', 1));
  assert.deepEqual(slotsAt('paladin', 5), slotsAt('mago', 3));
  assert.deepEqual(slotsAt('explorador', 13), slotsAt('mago', 7));
  assert.deepEqual(slotsAt('paladin', 20), slotsAt('mago', 10));
  /* Never above 5th level, which is the whole point of being a half caster. */
  assert.equal(topSpellLevel('paladin', 20), 5);
});

test('pact magic is a different thing wearing the same word', () => {
  assert.deepEqual(pactMagic(1), { slots: 1, level: 1 });
  assert.deepEqual(pactMagic(2), { slots: 2, level: 1 });
  assert.deepEqual(pactMagic(5), { slots: 2, level: 3 });
  assert.deepEqual(pactMagic(9), { slots: 2, level: 5 });
  assert.deepEqual(pactMagic(11), { slots: 3, level: 5 });
  assert.deepEqual(pactMagic(17), { slots: 4, level: 5 });
  /* One pool, under its own key: a warlock's slots are not 1st-level slots. */
  assert.deepEqual(slotsAt('brujo', 5), { pact: 2 });
  assert.equal(topSpellLevel('brujo', 5), 3);
});

test('a class that does not cast has no slots at any level', () => {
  for (const c of ['barbaro', 'guerrero', 'monje', 'picaro']) {
    assert.deepEqual(slotsAt(c, 20), {}, c);
    assert.equal(topSpellLevel(c, 20), 0, c);
  }
  assert.deepEqual(slotsAt(null, 5), {});
});

test('every class in the data has an answer about casting', () => {
  for (const key of Object.keys(CLASSES)) {
    const kind = CASTER_KIND[key];
    const casts = !!CLASSES[key].casting;
    assert.equal(!!kind, casts, `${key}: data says casting=${casts}, tables say ${kind}`);
  }
});

test('ability increases land where the class says', () => {
  assert.deepEqual(asiLevels('mago'), [4, 8, 12, 16, 19]);
  assert.deepEqual(asiLevels('guerrero'), [4, 6, 8, 12, 14, 16, 19]);
  assert.deepEqual(asiLevels('picaro'), [4, 8, 10, 12, 16, 19]);
});

test('hit points and hit dice come off the class', () => {
  assert.equal(averageHitPoints('barbaro'), 7);    // d12
  assert.equal(averageHitPoints('mago'), 4);       // d6
  assert.equal(averageHitPoints(null), 0);
  assert.equal(hitDice('barbaro', 5), '5d12');
  assert.equal(hitDice(null, 5), '');
});

test('a sheet with no levels taken is level 1', () => {
  assert.equal(levelOf({ levels: [] }), 1);
  assert.equal(levelOf({}), 1);
  assert.equal(levelOf({ levels: Array(4).fill({}) }), 5);
  assert.equal(levelOf({ levels: Array(40).fill({}) }), MAX_LEVEL);
});

test('a level-up wizard is told exactly what the level introduces', () => {
  const third = levelBrings('mago', 3);
  assert.equal(third.subclass, true);
  assert.equal(third.asi, false);
  assert.deepEqual(third.slots, [{ level: '1', from: 3, to: 4 },
                                 { level: '2', from: 0, to: 2 }]);
  assert.equal(third.proficiencyBonus, null);      // still +2

  const fifth = levelBrings('mago', 5);
  assert.equal(fifth.proficiencyBonus, 3);
  /* Only the 3rd-level slots are new at 5th — the 2nd-level ones arrived at
     4th, and a wizard that said otherwise would be inventing a sentence. */
  assert.deepEqual(fifth.slots, [{ level: '3', from: 0, to: 2 }]);

  const fourth = levelBrings('guerrero', 4);
  assert.equal(fourth.asi, true);
  assert.equal(fourth.subclass, false);
  assert.equal(fourth.hitPoints, 6);               // d10
  assert.equal(SUBCLASS_LEVEL, 3);
});
