/* One character of every class, taken from 1 to 20, checked at every step.

   This is the stage-7 gate, and it is deliberately a sweep rather than a
   handful of examples: the tables are the part of levelling that is arithmetic,
   and arithmetic is exactly what a sweep is good at. What it asserts at each
   level is what the card would print — proficiency bonus, hit dice, hit points,
   spell slots and the save DC — plus the two things that only move sometimes
   (an increase, a subclass).

   What it does NOT assert is what a class feature does, because this app does
   not claim to know: features are free text the DM writes. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, SPELLS, WEAPONS, DIVINE_ORDERS, PRIMAL_ORDERS } from './data.js';
import { derive, validate } from './engine.js';
import { normalise } from './character.js';
import { levelOf, proficiencyBonus, slotsAt, asiLevels, averageHitPoints,
         hitDice, CASTER_KIND, SUBCLASS_LEVEL, MAX_LEVEL, topSpellLevel } from './levels.js';

/** A legal level-1 sheet for a class, built the way the creator would. */
function sheetFor(/** @type {string} */ classKey) {
  const cls = CLASSES[classKey];
  const c = normalise({
    id: 'sweep-' + classKey,
    name: 'Prueba ' + cls.es,
    species: 'humano', class: classKey, background: 'sabio',
    /* The human has two sizes to choose between and a second origin feat —
       both level-1 questions, both the creator's, and both asked here only so
       validate() has nothing to say about the parts this sweep is not about. */
    size: 'mediano', extraFeat: 'alerta',
    /* 27 points, and the class's own primary ability highest. */
    buy: { FUE: 13, DES: 14, CON: 14, INT: 12, SAB: 12, CAR: 8 },
    boosts: { [cls.primary[0]]: 2, CON: 1 },
    classSkills: cls.skills.from.slice(0, cls.skills.n),
    /* However many the class asks for — the fighter wants three, which is the
       kind of number a hand-written fixture gets wrong. */
    masteries: cls.mastery
      ? WEAPONS.filter((/** @type {any} */ w) => w.mastery)
          .slice(0, cls.mastery.n).map((/** @type {any} */ w) => w.key)
      : [],
    equipmentClass: 'A', equipmentBackground: 'A',
  });
  /* Whatever else the class insists on at level 1 — a fighting style, an
     order, spells — filled from its own data so validate() has nothing to say
     about the parts this sweep is not testing. */
  if (cls.features?.some((/** @type {any} */ f) => f.choice === 'fightingStyle')) {
    c.fightingStyle = 'defensa';
  }
  if (cls.features?.some((/** @type {any} */ f) => f.choice === 'divineOrder')) {
    c.divineOrder = Object.keys(DIVINE_ORDERS)[0];
  }
  if (cls.features?.some((/** @type {any} */ f) => f.choice === 'primalOrder')) {
    c.primalOrder = Object.keys(PRIMAL_ORDERS)[0];
  }
  if (cls.expertise) c.expertise = c.classSkills.slice(0, cls.expertise.n);
  /* Spells, from this class's own list. The sweep is about the tables, not
     about which spells anybody picked — but a sheet missing them is not legal,
     and this test refuses to start from an illegal one. */
  if (cls.casting) {
    const from = (/** @type {number} */ lvl) => SPELLS
      .filter((/** @type {any} */ sp) => sp.lvl === lvl && sp.classes.includes(classKey))
      .map((/** @type {any} */ sp) => sp.en);
    const want1 = cls.casting.book ?? cls.casting.prepared ?? cls.casting.known ?? 0;
    c.spells = {
      cantrips: from(0).slice(0, cls.casting.cantrips || 0),
      level1: from(1).slice(0, want1),
    };
  }
  return c;
}

/** Take one level, the way the wizard does: the fixed average for hit points,
    an increase where the class grants one, a subclass at third. */
function takeLevel(/** @type {any} */ c, /** @type {number} */ to) {
  const asi = asiLevels(c.class).includes(to) ? { CON: 2 } : {};
  return {
    ...c,
    levels: [...(c.levels || []), {
      level: to, hp: averageHitPoints(c.class), asi,
      subclass: to === SUBCLASS_LEVEL ? 'Subclase de prueba' : '',
      features: [{ id: 'f' + to, name: `Rasgo de nivel ${to}`, desc: 'Lo que escribió el director.' }],
    }],
  };
}

test('every class, 1 to 20, every number the card prints', () => {
  for (const classKey of Object.keys(CLASSES)) {
    const cls = CLASSES[classKey];
    let c = sheetFor(classKey);

    assert.deepEqual(validate(c).filter(n => n.level === 'error'), [],
      `${classKey}: the level-1 sheet this sweep builds is not even legal`);

    const conAt = (/** @type {any} */ ch) => derive(ch).mods.CON;
    let expectedHP = cls.hitDie + conAt(c);

    for (let level = 1; level <= MAX_LEVEL; level++) {
      if (level > 1) {
        const before = conAt(c);
        c = takeLevel(c, level);
        const after = conAt(c);
        /* An increase that lands on Constitution is worth a hit point per
           level ALREADY TAKEN, not just this one — which is the rule people
           get wrong by hand, and the reason hit points are recomputed from
           the whole list rather than accumulated. */
        expectedHP += averageHitPoints(classKey) + after;
        if (after !== before) expectedHP += (after - before) * (level - 1);
      }

      const d = derive(c);
      const pb = proficiencyBonus(level);

      assert.equal(levelOf(c), level, `${classKey} ${level}: level`);
      assert.equal(d.level, level, `${classKey} ${level}: derived level`);
      assert.equal(d.proficiencyBonus, pb, `${classKey} ${level}: proficiency bonus`);
      assert.equal(d.hitDice, `${level}d${cls.hitDie}`, `${classKey} ${level}: hit dice`);
      assert.equal(d.hp, expectedHP, `${classKey} ${level}: hit points`);

      /* Every proficiency in every row moves with the bonus. */
      const profSave = d.saves.find((/** @type {any} */ s) => s.prof);
      if (profSave) {
        assert.equal(profSave.total, d.mods[profSave.key] + pb,
          `${classKey} ${level}: a proficient save`);
      }
      const profSkill = d.skills.find((/** @type {any} */ s) => s.prof && !s.expertise);
      if (profSkill) {
        assert.equal(profSkill.total, d.mods[profSkill.ability] + pb,
          `${classKey} ${level}: a proficient skill`);
      }

      /* Casting: the DC and the attack bonus follow the bonus and the ability,
         and the slots come off the tables rather than off the sheet. */
      if (cls.casting) {
        const ab = cls.casting.ability;
        assert.equal(d.casting.dc, 8 + pb + d.mods[ab], `${classKey} ${level}: save DC`);
        assert.equal(d.casting.attack, pb + d.mods[ab], `${classKey} ${level}: spell attack`);
        assert.deepEqual(d.casting.slots, slotsAt(classKey, level), `${classKey} ${level}: slots`);
        const kind = CASTER_KIND[classKey];
        if (kind === 'half') {
          assert.ok(topSpellLevel(classKey, level) <= 5,
            `${classKey} ${level}: a half caster never passes 5th`);
        }
        if (kind === 'pact') {
          assert.deepEqual(Object.keys(d.casting.slots), ['pact'],
            `${classKey} ${level}: pact magic is one pool`);
        }
      } else {
        assert.equal(d.casting, null, `${classKey} ${level}: does not cast`);
        assert.deepEqual(slotsAt(classKey, level), {}, `${classKey} ${level}: and has no slots`);
      }

      /* A sheet stays legal all the way up: nothing about levelling makes the
         level-1 recipe it was built from invalid. */
      assert.deepEqual(validate(c).filter(n => n.level === 'error'), [],
        `${classKey} ${level}: sheet stopped validating`);
    }

    /* And what the DM wrote is all still there, in order. */
    const features = (c.levels || []).flatMap((/** @type {any} */ l) => l.features);
    assert.equal(features.length, 19, `${classKey}: one feature per level taken`);
    assert.equal(features[0].name, 'Rasgo de nivel 2');
    assert.equal(features.at(-1).name, 'Rasgo de nivel 20');
    assert.equal((c.levels || []).filter((/** @type {any} */ l) => l.subclass).length, 1,
      `${classKey}: exactly one subclass, at level ${SUBCLASS_LEVEL}`);
  }
});

test('an ability increase moves every number that depends on it', () => {
  let c = sheetFor('mago');
  const before = derive(c);
  for (let l = 2; l <= 4; l++) c = takeLevel(c, l);   // 4th grants the increase
  const after = derive(c);

  assert.equal(before.proficiencyBonus, after.proficiencyBonus, 'still +2 at 4th');
  assert.equal(after.mods.CON, before.mods.CON + 1, 'the +2 to CON is a +1 modifier');
  /* The saving throw, the initiative and the hit points all moved with it, and
     nobody typed any of them. */
  const conSave = (/** @type {any} */ d) => d.saves.find((/** @type {any} */ s) => s.key === 'CON').total;
  assert.equal(conSave(after), conSave(before) + 1);
});

test('the hit point rule people get wrong by hand', () => {
  /* Taking +2 CON at 4th is worth a hit point for EVERY level already taken,
     not one. A wizard at 4th with 14 CON going to 16: 4 levels x +1. */
  let c = sheetFor('mago');
  for (let l = 2; l <= 4; l++) c = takeLevel(c, l);
  const withASI = derive(c).hp;

  let plain = sheetFor('mago');
  for (let l = 2; l <= 4; l++) {
    plain = { ...plain, levels: [...(plain.levels || []),
      { level: l, hp: averageHitPoints('mago'), asi: {}, subclass: '', features: [] }] };
  }
  assert.equal(withASI - derive(plain).hp, 4, 'one per level already taken');
});

test('a per-level bonus is per level, not per character', () => {
  /* The Tough origin feat and the dwarf's toughness both grant hit points per
     level. Adding them once was right only while this app stopped at level 1. */
  const base = sheetFor('guerrero');
  const tough = normalise({ ...base, background: 'artesano', extraFeat: 'robusto' });
  const at = (/** @type {any} */ c, /** @type {number} */ level) => {
    let x = c;
    for (let l = 2; l <= level; l++) x = takeLevel(x, l);
    return derive(x).hp;
  };
  const gap1 = at(tough, 1) - at(base, 1);
  const gap5 = at(tough, 5) - at(base, 5);
  assert.ok(gap5 > gap1, `Tough is worth more at 5th (${gap5}) than at 1st (${gap1})`);
  assert.equal(gap5, gap1 * 5, 'exactly five times as much, at five levels');
});
