/* ================================================================= ENGINE
   Every number on a character card, computed from the build recipe a player
   exported. Pure functions: each takes what it needs and returns a value, so
   any rule can be checked by hand.

   Ported from the creator, which is still where a player builds a sheet — its
   export is a supported input format here. What was left behind is the
   creator's own half: the questionnaire, the proposals it generates, and the
   in-app editor that consumed them. This app reads sheets and computes from
   them; it does not build them.

   Level is the one thing this copy grows that the creator does not have. Where
   a number used to be "level 1, therefore 2", it now comes from the
   progression tables (see levels.js) — added in stage 7. */

/** @import { Character } from '../shared/types.js' */
/** @import { LevelUp } from '../shared/types.js' */
/** The six ability scores, or the six modifiers derived from them — the same
    shape either way, which is why one typedef covers both.
    @typedef {Record<string, number>} Scores */

import { levelOf, proficiencyBonus, slotsAt, averageHitPoints, hitDice } from './levels.js';
import { ABILITIES, SKILLS, MASTERIES, ARMORS, WEAPONS, DAMAGE_TYPES, ORIGIN_FEATS, SPECIES, BACKGROUNDS, CLASSES, SPELLS, MAGIC_INITIATE_LISTS, POINT_BUY_COST, POINT_BUY_TOTAL } from './data.js';
/* ================================================================= ENGINE
   Pure functions. No DOM, no state mutation: every function takes what it
   needs and returns a value, so each rule can be checked by hand.
========================================================================= */

/** This sheet's proficiency bonus. A function of level now, not the constant 2
    it was while the app stopped at level 1 — every bonus below reads it, so a
    level-up moves attacks, saves, skills and the spell save DC together.
    @param {Character} state */
export const pb = state => proficiencyBonus(levelOf(state));

/** @template {{key: string}} T @param {readonly T[]} list @param {string} key
    @returns {T|undefined} */
export const byKey = (list, key) => list.find(x => x.key === key);
export const skill = (/** @type {string} */ key) => byKey(SKILLS, key);
export const weapon = (/** @type {string} */ key) => byKey(WEAPONS, key);
export const armor = (/** @type {string} */ key) => byKey(ARMORS, key);

export const signed = (/** @type {number} */ n) => (n >= 0 ? `+${n}` : `${n}`);
export const abilityMod = (/** @type {number} */ score) => Math.floor((score - 10) / 2);

/** Point-buy cost of one score, or null if outside the legal 8..15 range. */
/** @param {number} score */
export function buyCost(score) {
  return /** @type {Record<number, number>} */ (POINT_BUY_COST)[score] ?? null;
}

/** Total points spent across the six purchased scores. */
/** @param {Scores} buy */
export function buySpent(buy) {
  return ABILITIES.reduce((sum, a) => sum + (buyCost(buy[a.key]) ?? 0), 0);
}

/**
 * Final ability scores: purchased values plus the background improvement.
 * The 8..15 range applies to the purchase only; the background can push a
 * score to 17, which is the single most misread part of the 2024 rules.
 */
/** @param {Character} state */
export function finalScores(state) {
  /** @type {Scores} */
  const out = {};
  for (const a of ABILITIES) out[a.key] = state.buy[a.key];
  for (const [key, bonus] of Object.entries(state.boosts || {})) {
    if (out[key] != null) out[key] += bonus;
  }
  /* Ability increases taken at 4th, 8th and so on. They are applied to the
     scores rather than written down as text, because every number this engine
     computes — armour class, saves, the spell save DC, attack bonuses — has to
     move with them. The 8…15 range is a rule about the PURCHASE only. */
  for (const lv of (state.levels || [])) {
    for (const [key, bonus] of Object.entries(lv?.asi || {})) {
      if (out[key] != null) out[key] += Number(bonus) || 0;
    }
  }
  return out;
}

/** @param {Scores} scores */
export function mods(scores) {
  /** @type {Scores} */
  const out = {};
  for (const a of ABILITIES) out[a.key] = abilityMod(scores[a.key]);
  return out;
}

/** Every mechanical hook granted by species, background feat and class. */
/** @param {Character} state */
export function hooks(state) {
  const sp = SPECIES[state.species ?? ''];
  const bg = BACKGROUNDS[state.background ?? ''];
  const feats = [];
  if (bg) feats.push(bg.feat);
  if (state.extraFeat) feats.push(state.extraFeat);   // Human's Versatile

  let hpPerLevel = 0, initiativeProficiency = false, unarmed = null;
  if (sp?.grants?.hpPerLevel) hpPerLevel += sp.grants.hpPerLevel;
  for (const f of feats) {
    const h = ORIGIN_FEATS[f ?? '']?.hooks || {};
    if (h.hpPerLevel) hpPerLevel += h.hpPerLevel;
    if (h.initiativeProficiency) initiativeProficiency = true;
    if (h.unarmed) unarmed = h.unarmed;
  }
  return { feats, hpPerLevel, initiativeProficiency, unarmed };
}

/** Hit points at level 1: max hit die + CON mod + per-level bonuses. */
/**
 * Hit points: the class's full hit die at 1st level, plus what each level
 * since actually gave (a rolled number the DM typed, or the fixed average),
 * plus the Constitution modifier and any per-level bonus ONCE PER LEVEL —
 * Tough and the dwarf's toughness are worth +1 or +2 every level, and adding
 * them once was right only while this app stopped at level 1.
 * @param {Character} state @param {Scores} m
 */
export function hitPoints(state, m) {
  const cls = CLASSES[state.class ?? ''];
  if (!cls) return null;
  const h = hooks(state);
  const level = levelOf(state);
  let hp = cls.hitDie + m.CON + h.hpPerLevel;
  for (const lv of (state.levels || [])) {
    const gained = Number.isFinite(Number(lv?.hp)) && Number(lv.hp) > 0
      ? Number(lv.hp) : averageHitPoints(state.class);
    hp += gained + m.CON + h.hpPerLevel;
  }
  return hp;
}

/**
 * What the character is actually carrying, merged from the chosen class and
 * background packages. Single source for AC, attacks and the equipment list,
 * so the sheet can never disagree with the package that was picked.
 */
/** @param {Character} state */
export function loadout(state) {
  const packs = [
    CLASSES[state.class ?? '']?.equipment?.[state.equipmentClass],
    BACKGROUNDS[state.background ?? '']?.equipment?.[state.equipmentBackground],
  ].filter(Boolean);

  /** @type {string[]} */
  const items = [];
  let gp = 0, armorKey = 'ninguna', shield = false;
  /** @type {string[]} */
  const weapons = [];

  for (const p of packs) {
    items.push(...(p.items || []));
    gp += p.gp || 0;
    const g = p.grants || {};
    // Heaviest armor wins when both packages grant one.
    if (g.armor && (armor(g.armor)?.ca ?? 0) > (armor(armorKey)?.ca ?? 0)) armorKey = g.armor;
    if (g.shield) shield = true;
    for (const w of g.weapons || []) if (!weapons.includes(w)) weapons.push(w);
  }
  return { items, gp, armor: armorKey, shield, weapons };
}

/** Armor Class from the equipped armor and shield. */
/** @param {Character} state @param {Scores} m */
export function armorClass(state, m) {
  const kit = loadout(state);
  /* 'ninguna' is a row of a frozen table in this repo: its absence would be a
     broken build, not a case to handle at the table. */
  const a = armor(kit.armor) ?? /** @type {NonNullable<ReturnType<typeof armor>>} */ (armor('ninguna'));
  let ca = a.ca;
  // 'full' adds Dexterity outright, a number caps it (a negative one still
  // applies), 'none' means heavy armour where Dexterity does not count at all.
  if (a.dex === 'full') ca += m.DES;
  else if (typeof a.dex === 'number') ca += Math.min(m.DES, a.dex);
  if (kit.shield) ca += 2;
  if (state.fightingStyle === 'defensa' && a.key !== 'ninguna') ca += 1;

  // Unarmored Defense only applies with no armor. The Barbarian may still use
  // a shield; the Monk may not, so each class declares it.
  const ud = CLASSES[state.class ?? '']?.unarmoredDefense;
  if (ud && a.key === 'ninguna' && !(kit.shield && !ud.shield)) {
    ca = Math.max(ca, 10 + m.DES + m[ud.ability] + (kit.shield && ud.shield ? 2 : 0));
  }
  return ca;
}

/** Warns when the armor's Strength requirement is not met. */
/** @param {Character} state @param {Scores} scores */
export function armorPenalty(state, scores) {
  const a = armor(loadout(state).armor);
  if (!a || !a.str) return null;
  if (scores.FUE >= a.str) return null;
  return `${a.es} pide Fuerza ${a.str} y tienes ${scores.FUE}: tu velocidad baja 3 m.`;
}

/** Set of skill keys the character is proficient in, and which are expertise. */
/** @param {Character} state */
export function skillProficiencies(state) {
  const prof = new Set();
  const expertise = new Set();
  const bg = BACKGROUNDS[state.background ?? ''];
  if (bg) bg.skills.forEach((/** @type {string} */ s) => prof.add(s));
  for (const s of state.classSkills || []) prof.add(s);
  for (const s of state.speciesSkills || []) prof.add(s);
  for (const s of state.featSkills || []) prof.add(s);
  for (const s of state.expertise || []) if (prof.has(s)) expertise.add(s);
  return { prof, expertise };
}

/** Skills granted automatically, mapped to where they came from. */
/** @param {Character} state */
export function grantedSkillSources(state) {
  const src = new Map();
  const bg = BACKGROUNDS[state.background ?? ''];
  if (bg) bg.skills.forEach((/** @type {string} */ s) => src.set(s, bg.es));
  for (const s of state.speciesSkills || []) if (!src.has(s)) src.set(s, SPECIES[state.species ?? '']?.es || 'Especie');
  for (const s of state.featSkills || []) if (!src.has(s)) src.set(s, 'Dote');
  return src;
}

/** @param {string} key @param {Scores} m @param {Set<string>} prof
    @param {Set<string>} expertise @param {number} bonusAt this sheet's proficiency bonus */
export function skillRow(key, m, prof, expertise, bonusAt = 2) {
  const sk = /** @type {NonNullable<ReturnType<typeof skill>>} */ (skill(key));
  const base = m[sk.ability];
  const bonus = expertise.has(key) ? bonusAt * 2 : prof.has(key) ? bonusAt : 0;
  return { ...sk, total: base + bonus, prof: prof.has(key), expertise: expertise.has(key) };
}

/** @param {Character} state @param {Scores} m */
export function saves(state, m) {
  const cls = CLASSES[state.class ?? ''];
  const profSaves = new Set(cls?.saves || []);
  return ABILITIES.map(a => ({
    ...a,
    prof: profSaves.has(a.key),
    total: m[a.key] + (profSaves.has(a.key) ? pb(state) : 0),
  }));
}

/** Walking speed in metres. A lineage may override the species value. */
/** @param {Character} state */
export function speed(state) {
  const sp = SPECIES[state.species ?? ''];
  if (!sp) return null;
  return sp.lineages?.[state.lineage ?? '']?.speed ?? sp.speed;
}

/** Size, either fixed by the species or chosen by the player. */
/** @param {Character} state */
export function size(state) {
  const sp = SPECIES[state.species ?? ''];
  if (!sp) return null;
  return sp.size.length === 1 ? sp.size[0] : (state.size || null);
}

/** @param {Character} state @param {Scores} m */
export function initiative(state, m) {
  const h = hooks(state);
  return m.DES + (h.initiativeProficiency ? pb(state) : 0);
}

/** @param {Scores} m @param {Set<string>} prof @param {Set<string>} expertise
    @param {number} bonusAt */
export function passivePerception(m, prof, expertise, bonusAt = 2) {
  return 10 + skillRow('percepcion', m, prof, expertise, bonusAt).total;
}

/**
 * Armor and weapon proficiency, after the level-1 class choices that widen it:
 * the Cleric's Protector order and the Druid's Guardian order.
 */
/** @param {Character} state */
export function proficiencies(state) {
  const cls = CLASSES[state.class ?? ''];
  if (!cls) return { armor: [], weapons: [], weaponProf: { simple: false, martial: false } };
  const armorList = [...cls.armor];
  const weaponList = [...cls.weapons];
  const wp = { ...cls.weaponProf };

  if (state.divineOrder === 'protector') {
    if (!armorList.includes('pesadas')) armorList.push('pesadas');
    if (wp.martial !== 'todas') { wp.martial = 'todas'; weaponList.push('marciales'); }
  }
  if (state.primalOrder === 'guardian') {
    if (!armorList.includes('medias')) armorList.push('medias');
    if (wp.martial !== 'todas') { wp.martial = 'todas'; weaponList.push('marciales'); }
  }
  return { armor: armorList, weapons: weaponList, weaponProf: wp };
}

/** Whether the character is proficient with a given weapon. */
/** @param {Character} state @param {any} w */
export function proficientWithWeapon(state, w) {
  const wp = proficiencies(state).weaponProf;
  if (w.cat === 'simple') return !!wp.simple;
  const has = (/** @type {string} */ p) => w.props.some((/** @type {string} */ x) => x.startsWith(p));
  switch (wp.martial) {
    case 'todas': return true;
    case 'sutil-o-ligera': return has('sutil') || has('ligera');
    case 'ligera': return has('ligera');
    default: return false;
  }
}

/**
 * A Monk's Martial Arts lets Dexterity replace Strength on unarmed strikes and
 * on "monk weapons": Simple melee, or Martial melee with Ligera, never Pesada
 * or a dos manos.
 */
/** @param {any} w */
export function isMonkWeapon(w) {
  if (!w.melee) return false;
  const has = (/** @type {string} */ p) => w.props.some((/** @type {string} */ x) => x.startsWith(p));
  if (has('pesada') || has('a dos manos')) return false;
  return w.cat === 'simple' || has('ligera');
}

/** Attack rows for the character's chosen weapons, plus unarmed when it matters. */
/** @param {Character} state @param {Scores} m */
export function attacks(state, m) {
  const masteries = new Set(state.masteries || []);
  const cls = CLASSES[state.class ?? ''];
  const martialArts = cls?.martialArts;

  const rows = loadout(state).weapons.map(key => {
    const w = weapon(key);
    if (!w) return null;
    const proficient = proficientWithWeapon(state, w);
    const finesse = w.props.some((/** @type {any} */ p) => p.startsWith('sutil'));
    const dexAllowed = !w.melee || finesse || (martialArts && isMonkWeapon(w));
    const useDex = dexAllowed && m.DES >= m.FUE;
    const abilityKey = useDex ? 'DES' : 'FUE';
    const mod = m[abilityKey];
    return {
      key,
      name: w.es,
      en: w.en,
      ability: abilityKey,
      attack: mod + (proficient ? pb(state) : 0),
      damage: `${w.dmg}${mod ? ' ' + signed(mod) : ''} ${/** @type {Record<string, string>} */ (DAMAGE_TYPES)[w.type]}`,
      props: w.props,
      mastery: masteries.has(key) ? MASTERIES[w.mastery] : null,
      proficient,
    };
  }).filter(Boolean);

  // Unarmed strike, listed only when something makes it worth rolling.
  const h = hooks(state);
  const unarmedDie = martialArts || h.unarmed;
  if (unarmedDie) {
    const useDex = martialArts ? m.DES >= m.FUE : false;
    const mod = useDex ? m.DES : m.FUE;
    rows.push({
      key: 'unarmed',
      name: 'Golpe sin armas',
      en: 'Unarmed Strike',
      ability: useDex ? 'DES' : 'FUE',
      attack: mod + pb(state),
      damage: `${unarmedDie}${mod ? ' ' + signed(mod) : ''} ${DAMAGE_TYPES.c}`,
      props: martialArts ? ['artes marciales'] : ['camorrista'],
      mastery: null,
      proficient: true,
    });
  }
  return rows;
}

/** Spellcasting numbers at the level this sheet has reached, or null for a
    character who does not cast. `slots` is the whole grid — {'1': 4, '2': 3} —
    or {'pact': n} for a warlock, whose slots are one pool of one level. */
/** @param {Character} state @param {Scores} m */
export function spellcasting(state, m) {
  const cls = CLASSES[state.class ?? ''];
  if (!cls?.casting) return null;
  const ab = cls.casting.ability;
  return {
    ability: ab,
    abilityName: byKey(ABILITIES, ab)?.es ?? ab,
    dc: 8 + pb(state) + m[ab],
    attack: pb(state) + m[ab],
    cantrips: cls.casting.cantrips || 0,
    prepared: cls.casting.prepared ?? null,
    known: cls.casting.known ?? null,
    slots: slotsAt(state.class, levelOf(state)),
    ritual: !!cls.casting.ritual,
  };
}

/* Spells are identified by their English name, which is unique in the table. */
export const spellByEn = (/** @type {string} */ en) => SPELLS.find(s => s.en === en) || null;

/** The spells one class list offers at a given level. */
/** @param {string} classKey @param {number} lvl */
export function spellList(classKey, lvl) {
  return SPELLS.filter((/** @type {any} */ s) => s.lvl === lvl && s.classes.includes(classKey))
    .sort((a, b) => a.es.localeCompare(b.es, 'es'));
}

/** Does this character have a Magic Initiate feat, and from which list? */
/** @param {Character} state */
export function magicInitiateFeat(state) {
  const h = hooks(state);
  if (!h.feats.includes('iniciado')) return null;
  return state.magicInitiate || { list: null, cantrips: [], level1: null };
}

/**
 * Every spell the character has, grouped by where it came from. Species and
 * feat spells are separate from class spells because they do not use the
 * class's spell slots.
 */
/** @param {Character} state */
export function extraSpellSources(state) {
  const out = [];
  const sp = SPECIES[state.species ?? ''];
  if (sp?.grants?.cantrips?.length) {
    out.push({ from: sp.es, cantrips: sp.grants.cantrips, level1: [] });
  }
  const lineage = sp?.lineages?.[state.lineage ?? ''];
  if (lineage?.cantrips?.length) {
    out.push({ from: lineage.es, cantrips: lineage.cantrips, level1: [] });
  }
  const mi = magicInitiateFeat(state);
  if (mi && (mi.cantrips?.length || mi.level1)) {
    out.push({
      from: `Iniciado en la magia (${MAGIC_INITIATE_LISTS[mi.list ?? '']?.es || '—'})`,
      cantrips: mi.cantrips || [],
      level1: mi.level1 ? [mi.level1] : [],
    });
  }
  return out;
}

/** True when there is anything at all to put on a spell sheet. */
/** @param {Character} state */
export function castsAnything(state) {
  if (CLASSES[state.class ?? '']?.casting) return true;
  const sp = SPECIES[state.species ?? ''];
  if (sp?.grants?.cantrips?.length) return true;
  if (sp?.lineages?.[state.lineage ?? '']?.cantrips?.length) return true;
  return !!magicInitiateFeat(state);
}

/** Class cantrips and level-1 spells the player has actually picked. */
/** @param {Character} state */
export function chosenClassSpells(state) {
  return {
    cantrips: (state.spells?.cantrips || []).map(spellByEn).filter(Boolean),
    level1: (state.spells?.level1 || []).map(spellByEn).filter(Boolean),
  };
}

/** Full derived character. One call, everything the sheet needs. */
/** @param {Character} state */
export function derive(state) {
  const scores = finalScores(state);
  const m = mods(scores);
  const { prof, expertise } = skillProficiencies(state);
  const level = levelOf(state);
  const bonusAt = proficiencyBonus(level);
  return {
    level, proficiencyBonus: bonusAt, hitDice: hitDice(state.class, level),
    scores, mods: m,
    hp: hitPoints(state, m),
    ca: armorClass(state, m),
    initiative: initiative(state, m),
    saves: saves(state, m),
    skills: SKILLS.map(s => skillRow(s.key, m, prof, expertise, bonusAt)),
    passivePerception: passivePerception(m, prof, expertise, bonusAt),
    attacks: attacks(state, m),
    casting: spellcasting(state, m),
    extraSpells: extraSpellSources(state),
    classSpells: chosenClassSpells(state),
    hooks: hooks(state),
    loadout: loadout(state),
    proficiencies: proficiencies(state),
    speed: speed(state),
    size: size(state),
    armorPenalty: armorPenalty(state, scores),
  };
}

/**
 * Non-blocking notices. Order matters: `error` entries mean the step is
 * incomplete, `warn` entries are advice a player is free to ignore.
 */
/** @param {Character} state */
export function validate(state) {
  /** @type {{level: 'error'|'warn', step: string, text: string}[]} */
  const out = [];
  const push = (/** @type {'error'|'warn'} */ level, /** @type {string} */ step,
                /** @type {string} */ text) => out.push({ level, step, text });

  if (!state.name?.trim()) push('error', 'concepto', 'El personaje no tiene nombre.');
  if (!state.species) push('error', 'especie', 'Falta elegir especie.');
  if (!state.class) push('error', 'clase', 'Falta elegir clase.');
  if (!state.background) push('error', 'trasfondo', 'Falta elegir trasfondo.');

  const sp = SPECIES[state.species ?? ''];
  if (sp?.lineages && !state.lineage) push('error', 'especie', `Falta elegir el linaje de ${sp.es}.`);
  if (sp?.size?.length > 1 && !state.size) push('error', 'especie', 'Falta elegir tamaño.');

  const cls = CLASSES[state.class ?? ''];
  if (cls) {
    const need = cls.skills.n, have = (state.classSkills || []).length;
    if (have < need) push('error', 'habilidades', `Te faltan ${need - have} habilidad(es) de ${cls.es}.`);
    if (cls.mastery && (state.masteries || []).length < cls.mastery.n) {
      push('error', 'clase', `Te faltan armas con maestría (${(state.masteries||[]).length} de ${cls.mastery.n}).`);
    }
    if (cls.features?.some((/** @type {any} */ f) => f.choice === 'fightingStyle') && !state.fightingStyle) {
      push('error', 'clase', 'Falta elegir estilo de combate.');
    }
    if (cls.features?.some((/** @type {any} */ f) => f.choice === 'divineOrder') && !state.divineOrder) {
      push('error', 'clase', 'Falta elegir orden divina.');
    }
    if (cls.features?.some((/** @type {any} */ f) => f.choice === 'primalOrder') && !state.primalOrder) {
      push('error', 'clase', 'Falta elegir orden primigenia.');
    }
    if (cls.expertise && (state.expertise || []).length < cls.expertise.n) {
      push('error', 'habilidades', `Te falta elegir experticia (${(state.expertise||[]).length} de ${cls.expertise.n}).`);
    }
  }

  const bg = BACKGROUNDS[state.background ?? ''];
  if (bg) {
    const spent = Object.values(state.boosts || {}).reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
    if (spent !== 3) push('error', 'trasfondo', 'Falta repartir las mejoras de puntuación del trasfondo (+2/+1 o +1/+1/+1).');
  }

  if (cls?.casting) {
    const c = cls.casting;
    const nCantrips = (state.spells?.cantrips || []).length;
    const nLevel1 = (state.spells?.level1 || []).length;
    const wantLevel1 = c.book ?? c.prepared ?? c.known ?? 0;
    if (nCantrips < c.cantrips) push('error', 'conjuros', `Te faltan ${c.cantrips - nCantrips} truco(s).`);
    if (nLevel1 < wantLevel1) push('error', 'conjuros', `Te faltan ${wantLevel1 - nLevel1} conjuro(s) de nivel 1.`);
  }
  const mi = magicInitiateFeat(state);
  if (mi) {
    if (!mi.list) push('error', 'conjuros', 'Falta elegir la lista de Iniciado en la magia.');
    else {
      if ((mi.cantrips || []).length < 2) push('error', 'conjuros', 'Iniciado en la magia: te faltan trucos.');
      if (!mi.level1) push('error', 'conjuros', 'Iniciado en la magia: falta el conjuro de nivel 1.');
    }
  }

  const spentPoints = buySpent(state.buy);
  if (spentPoints > POINT_BUY_TOTAL) push('error', 'puntos', `Te has pasado: ${spentPoints} de ${POINT_BUY_TOTAL} puntos.`);
  else if (spentPoints < POINT_BUY_TOTAL) push('warn', 'puntos', `Te quedan ${POINT_BUY_TOTAL - spentPoints} puntos por gastar.`);

  // advice, never blocking
  if (cls && state.class) {
    const scores = finalScores(state);
    const best = cls.primary.reduce((/** @type {number} */ a, /** @type {number} */ b) => (scores[a] >= scores[b] ? a : b));
    if (scores[best] < 14) {
      push('warn', 'puntos', `${cls.es} funciona mejor con ${cls.primary.map((/** @type {string} */ k) => byKey(ABILITIES, k)?.es ?? k).join(' o ')} alta; ahora la mejor está en ${scores[best]}.`);
    }
  }
  const pen = state.class ? armorPenalty(state, finalScores(state)) : null;
  if (pen) push('warn', 'equipo', pen);

  return out;
}
