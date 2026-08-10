import { PROFICIENCY_BONUS, ABILITIES, SKILLS, MASTERIES, ARMORS, WEAPONS, DAMAGE_TYPES, ORIGIN_FEATS, SPECIES, BACKGROUNDS, CLASSES, SPELLS, MAGIC_INITIATE_LISTS, QUIZ, SPELL_PICKS, POINT_BUY_COST, POINT_BUY_TOTAL } from './data.js';
/* ================================================================= ENGINE
   Pure functions. No DOM, no state mutation: every function takes what it
   needs and returns a value, so each rule can be checked by hand.
========================================================================= */

export const byKey = (list, key) => list.find(x => x.key === key);
export const skill = key => byKey(SKILLS, key);
export const weapon = key => byKey(WEAPONS, key);
export const armor = key => byKey(ARMORS, key);

export const signed = n => (n >= 0 ? `+${n}` : `${n}`);
export const abilityMod = score => Math.floor((score - 10) / 2);

/** Point-buy cost of one score, or null if outside the legal 8..15 range. */
export function buyCost(score) {
  return POINT_BUY_COST[score] ?? null;
}

/** Total points spent across the six purchased scores. */
export function buySpent(buy) {
  return ABILITIES.reduce((sum, a) => sum + (buyCost(buy[a.key]) ?? 0), 0);
}

/**
 * Final ability scores: purchased values plus the background improvement.
 * The 8..15 range applies to the purchase only; the background can push a
 * score to 17, which is the single most misread part of the 2024 rules.
 */
export function finalScores(state) {
  const out = {};
  for (const a of ABILITIES) out[a.key] = state.buy[a.key];
  for (const [key, bonus] of Object.entries(state.boosts || {})) {
    if (out[key] != null) out[key] += bonus;
  }
  return out;
}

export function mods(scores) {
  const out = {};
  for (const a of ABILITIES) out[a.key] = abilityMod(scores[a.key]);
  return out;
}

/** Every mechanical hook granted by species, background feat and class. */
export function hooks(state) {
  const sp = SPECIES[state.species];
  const bg = BACKGROUNDS[state.background];
  const feats = [];
  if (bg) feats.push(bg.feat);
  if (state.extraFeat) feats.push(state.extraFeat);   // Human's Versatile

  let hpPerLevel = 0, initiativeProficiency = false, unarmed = null;
  if (sp?.grants?.hpPerLevel) hpPerLevel += sp.grants.hpPerLevel;
  for (const f of feats) {
    const h = ORIGIN_FEATS[f]?.hooks || {};
    if (h.hpPerLevel) hpPerLevel += h.hpPerLevel;
    if (h.initiativeProficiency) initiativeProficiency = true;
    if (h.unarmed) unarmed = h.unarmed;
  }
  return { feats, hpPerLevel, initiativeProficiency, unarmed };
}

/** Hit points at level 1: max hit die + CON mod + per-level bonuses. */
export function hitPoints(state, m) {
  const cls = CLASSES[state.class];
  if (!cls) return null;
  const h = hooks(state);
  return cls.hitDie + m.CON + h.hpPerLevel;
}

/**
 * What the character is actually carrying, merged from the chosen class and
 * background packages. Single source for AC, attacks and the equipment list,
 * so the sheet can never disagree with the package that was picked.
 */
export function loadout(state) {
  const packs = [
    CLASSES[state.class]?.equipment?.[state.equipmentClass],
    BACKGROUNDS[state.background]?.equipment?.[state.equipmentBackground],
  ].filter(Boolean);

  const items = [];
  let gp = 0, armorKey = 'ninguna', shield = false;
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
export function armorClass(state, m) {
  const kit = loadout(state);
  const a = armor(kit.armor) || armor('ninguna');
  let ca = a.ca;
  // 'full' adds Dexterity outright, a number caps it (a negative one still
  // applies), 'none' means heavy armour where Dexterity does not count at all.
  if (a.dex === 'full') ca += m.DES;
  else if (typeof a.dex === 'number') ca += Math.min(m.DES, a.dex);
  if (kit.shield) ca += 2;
  if (state.fightingStyle === 'defensa' && a.key !== 'ninguna') ca += 1;

  // Unarmored Defense only applies with no armor. The Barbarian may still use
  // a shield; the Monk may not, so each class declares it.
  const ud = CLASSES[state.class]?.unarmoredDefense;
  if (ud && a.key === 'ninguna' && !(kit.shield && !ud.shield)) {
    ca = Math.max(ca, 10 + m.DES + m[ud.ability] + (kit.shield && ud.shield ? 2 : 0));
  }
  return ca;
}

/** Warns when the armor's Strength requirement is not met. */
export function armorPenalty(state, scores) {
  const a = armor(loadout(state).armor);
  if (!a || !a.str) return null;
  if (scores.FUE >= a.str) return null;
  return `${a.es} pide Fuerza ${a.str} y tienes ${scores.FUE}: tu velocidad baja 3 m.`;
}

/** Set of skill keys the character is proficient in, and which are expertise. */
export function skillProficiencies(state) {
  const prof = new Set();
  const expertise = new Set();
  const bg = BACKGROUNDS[state.background];
  if (bg) bg.skills.forEach(s => prof.add(s));
  for (const s of state.classSkills || []) prof.add(s);
  for (const s of state.speciesSkills || []) prof.add(s);
  for (const s of state.featSkills || []) prof.add(s);
  for (const s of state.expertise || []) if (prof.has(s)) expertise.add(s);
  return { prof, expertise };
}

/** Skills granted automatically, mapped to where they came from. */
export function grantedSkillSources(state) {
  const src = new Map();
  const bg = BACKGROUNDS[state.background];
  if (bg) bg.skills.forEach(s => src.set(s, bg.es));
  for (const s of state.speciesSkills || []) if (!src.has(s)) src.set(s, SPECIES[state.species]?.es || 'Especie');
  for (const s of state.featSkills || []) if (!src.has(s)) src.set(s, 'Dote');
  return src;
}

export function skillRow(key, m, prof, expertise) {
  const sk = skill(key);
  const base = m[sk.ability];
  const bonus = expertise.has(key) ? PROFICIENCY_BONUS * 2 : prof.has(key) ? PROFICIENCY_BONUS : 0;
  return { ...sk, total: base + bonus, prof: prof.has(key), expertise: expertise.has(key) };
}

export function saves(state, m) {
  const cls = CLASSES[state.class];
  const profSaves = new Set(cls?.saves || []);
  return ABILITIES.map(a => ({
    ...a,
    prof: profSaves.has(a.key),
    total: m[a.key] + (profSaves.has(a.key) ? PROFICIENCY_BONUS : 0),
  }));
}

/** Walking speed in metres. A lineage may override the species value. */
export function speed(state) {
  const sp = SPECIES[state.species];
  if (!sp) return null;
  return sp.lineages?.[state.lineage]?.speed ?? sp.speed;
}

/** Size, either fixed by the species or chosen by the player. */
export function size(state) {
  const sp = SPECIES[state.species];
  if (!sp) return null;
  return sp.size.length === 1 ? sp.size[0] : (state.size || null);
}

export function initiative(state, m) {
  const h = hooks(state);
  return m.DES + (h.initiativeProficiency ? PROFICIENCY_BONUS : 0);
}

export function passivePerception(m, prof, expertise) {
  return 10 + skillRow('percepcion', m, prof, expertise).total;
}

/**
 * Armor and weapon proficiency, after the level-1 class choices that widen it:
 * the Cleric's Protector order and the Druid's Guardian order.
 */
export function proficiencies(state) {
  const cls = CLASSES[state.class];
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
export function proficientWithWeapon(state, w) {
  const wp = proficiencies(state).weaponProf;
  if (w.cat === 'simple') return !!wp.simple;
  const has = p => w.props.some(x => x.startsWith(p));
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
export function isMonkWeapon(w) {
  if (!w.melee) return false;
  const has = p => w.props.some(x => x.startsWith(p));
  if (has('pesada') || has('a dos manos')) return false;
  return w.cat === 'simple' || has('ligera');
}

/** Attack rows for the character's chosen weapons, plus unarmed when it matters. */
export function attacks(state, m) {
  const masteries = new Set(state.masteries || []);
  const cls = CLASSES[state.class];
  const martialArts = cls?.martialArts;

  const rows = loadout(state).weapons.map(key => {
    const w = weapon(key);
    if (!w) return null;
    const proficient = proficientWithWeapon(state, w);
    const finesse = w.props.some(p => p.startsWith('sutil'));
    const dexAllowed = !w.melee || finesse || (martialArts && isMonkWeapon(w));
    const useDex = dexAllowed && m.DES >= m.FUE;
    const abilityKey = useDex ? 'DES' : 'FUE';
    const mod = m[abilityKey];
    return {
      key,
      name: w.es,
      en: w.en,
      ability: abilityKey,
      attack: mod + (proficient ? PROFICIENCY_BONUS : 0),
      damage: `${w.dmg}${mod ? ' ' + signed(mod) : ''} ${DAMAGE_TYPES[w.type]}`,
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
      attack: mod + PROFICIENCY_BONUS,
      damage: `${unarmedDie}${mod ? ' ' + signed(mod) : ''} ${DAMAGE_TYPES.c}`,
      props: martialArts ? ['artes marciales'] : ['camorrista'],
      mastery: null,
      proficient: true,
    });
  }
  return rows;
}

/** Level-1 spellcasting numbers, or null for a character who does not cast. */
export function spellcasting(state, m) {
  const cls = CLASSES[state.class];
  if (!cls?.casting) return null;
  const ab = cls.casting.ability;
  return {
    ability: ab,
    abilityName: byKey(ABILITIES, ab).es,
    dc: 8 + PROFICIENCY_BONUS + m[ab],
    attack: PROFICIENCY_BONUS + m[ab],
    cantrips: cls.casting.cantrips || 0,
    prepared: cls.casting.prepared ?? null,
    known: cls.casting.known ?? null,
    slots: cls.casting.slots1 || 0,
    ritual: !!cls.casting.ritual,
  };
}

/* Spells are identified by their English name, which is unique in the table. */
export const spellByEn = en => SPELLS.find(s => s.en === en) || null;

/** The spells one class list offers at a given level. */
export function spellList(classKey, lvl) {
  return SPELLS.filter(s => s.lvl === lvl && s.classes.includes(classKey))
    .sort((a, b) => a.es.localeCompare(b.es, 'es'));
}

/** Does this character have a Magic Initiate feat, and from which list? */
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
export function extraSpellSources(state) {
  const out = [];
  const sp = SPECIES[state.species];
  if (sp?.grants?.cantrips?.length) {
    out.push({ from: sp.es, cantrips: sp.grants.cantrips, level1: [] });
  }
  const lineage = sp?.lineages?.[state.lineage];
  if (lineage?.cantrips?.length) {
    out.push({ from: lineage.es, cantrips: lineage.cantrips, level1: [] });
  }
  const mi = magicInitiateFeat(state);
  if (mi && (mi.cantrips?.length || mi.level1)) {
    out.push({
      from: `Iniciado en la magia (${MAGIC_INITIATE_LISTS[mi.list]?.es || '—'})`,
      cantrips: mi.cantrips || [],
      level1: mi.level1 ? [mi.level1] : [],
    });
  }
  return out;
}

/** True when there is anything at all to put on a spell sheet. */
export function castsAnything(state) {
  if (CLASSES[state.class]?.casting) return true;
  const sp = SPECIES[state.species];
  if (sp?.grants?.cantrips?.length) return true;
  if (sp?.lineages?.[state.lineage]?.cantrips?.length) return true;
  return !!magicInitiateFeat(state);
}

/** Class cantrips and level-1 spells the player has actually picked. */
export function chosenClassSpells(state) {
  return {
    cantrips: (state.spells?.cantrips || []).map(spellByEn).filter(Boolean),
    level1: (state.spells?.level1 || []).map(spellByEn).filter(Boolean),
  };
}

/** Full derived character. One call, everything the sheet needs. */
export function derive(state) {
  const scores = finalScores(state);
  const m = mods(scores);
  const { prof, expertise } = skillProficiencies(state);
  return {
    scores, mods: m,
    hp: hitPoints(state, m),
    ca: armorClass(state, m),
    initiative: initiative(state, m),
    saves: saves(state, m),
    skills: SKILLS.map(s => skillRow(s.key, m, prof, expertise)),
    passivePerception: passivePerception(m, prof, expertise),
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

/* ============================================================ QUIZ ENGINE
   Pure: takes the answers and returns a complete, legal proposal for the
   background, ability spread, skills, equipment and spells. It never writes
   to the state — the app applies it, and the player can change all of it.
========================================================================= */

/** Adds every selected answer's weights into one bucket per channel. */
export function quizWeights(answers) {
  const acc = { bg: {}, ab: {}, sk: {}, kit: {}, tone: {} };
  for (const q of QUIZ) {
    const pick = answers?.[q.id];
    if (pick == null) continue;
    const w = q.options[pick]?.w;
    if (!w) continue;
    for (const channel of ['bg', 'ab', 'sk', 'kit', 'tone']) {
      for (const [key, value] of Object.entries(w[channel] || {})) {
        acc[channel][key] = (acc[channel][key] || 0) + value;
      }
    }
  }
  return acc;
}

/** Keys of a score bucket, highest first, ties broken alphabetically. */
export function ranked(bucket) {
  return Object.entries(bucket)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

export const quizAnswered = answers => QUIZ.filter(q => answers?.[q.id] != null).length;

/**
 * Ability priority. The quiz gives the flavour, but the class decides what the
 * character actually needs, so its primary abilities get a decisive bonus and
 * Constitution a small one — nobody at level 1 wants a d6 class with CON 8.
 */
export function abilityPriority(state, weights) {
  const cls = CLASSES[state.class];
  const score = {};
  for (const a of ABILITIES) {
    score[a.key] = (weights.ab[a.key] || 0)
      + (cls?.primary?.includes(a.key) ? 20 : 0)
      + (a.key === 'CON' ? 4 : 0);
  }
  // A spellcasting class must not end up with a weak casting ability.
  if (cls?.casting) score[cls.casting.ability] += 20;

  const order = ranked(score);

  // Constitution must land in the top three, which is a 13 or better on the
  // standard spread. A level-1 character with CON 12 and three players at the
  // table goes down too easily for the quiz to hand that out by accident.
  const at = order.indexOf('CON');
  if (at > 2) {
    order.splice(at, 1);
    order.splice(2, 0, 'CON');
  }
  return order;
}

/**
 * The standard 27-point spread, handed out in priority order, plus the
 * background improvement placed as high up that order as the background allows.
 */
export const QUIZ_SPREAD = Object.freeze([15, 14, 13, 12, 10, 8]);

export function allocateAbilities(priority, backgroundKey) {
  const buy = {};
  priority.forEach((key, i) => { buy[key] = QUIZ_SPREAD[i]; });

  // +2/+1, both restricted to the three abilities the background offers.
  const allowed = BACKGROUNDS[backgroundKey]?.abilities || [];
  const byPriority = priority.filter(k => allowed.includes(k));
  const boosts = {};
  if (byPriority[0]) boosts[byPriority[0]] = 2;
  if (byPriority[1]) boosts[byPriority[1]] = 1;
  return { buy, boosts };
}

/** The package that best matches a fighting style, never the gold-only one. */
export function packageForStyle(cls, style) {
  const entries = Object.entries(cls?.equipment || {}).filter(([, p]) => (p.items || []).length);
  if (!entries.length) return Object.keys(cls?.equipment || { A: 1 })[0];

  const score = ([, p]) => {
    const weapons = (p.grants?.weapons || []).map(weapon).filter(Boolean);
    const has = pred => weapons.some(pred);
    const prop = (w, name) => w.props.some(x => x.startsWith(name));
    let n = 0;
    if (style === 'distancia' && has(w => !w.melee)) n += 3;
    if (style === 'cuerpo' && has(w => w.melee && !prop(w, 'ligera'))) n += 2;
    if (style === 'cuerpo' && (p.grants?.shield || armor(p.grants?.armor || 'ninguna')?.cat === 'pesada')) n += 2;
    if (style === 'sutil' && has(w => prop(w, 'sutil') || prop(w, 'ligera'))) n += 3;
    if (style === 'apoyo' && p.grants?.shield) n += 2;
    return n;
  };
  return entries.slice().sort((a, b) => score(b) - score(a))[0][0];
}

/** Class skills, chosen by affinity and skipping anything already granted. */
export function pickClassSkills(state, weights, backgroundKey) {
  const cls = CLASSES[state.class];
  if (!cls) return [];
  const taken = new Set([
    ...(BACKGROUNDS[backgroundKey]?.skills || []),
    ...(state.speciesSkills || []),
  ]);
  const pool = cls.skills.from.filter(k => !taken.has(k));
  const order = pool.slice().sort((a, b) =>
    (weights.sk[b] || 0) - (weights.sk[a] || 0) || a.localeCompare(b));
  return order.slice(0, cls.skills.n);
}

/** Spells from the curated list, trimmed to what the class may actually take. */
export function pickSpells(state, slant) {
  const cls = CLASSES[state.class];
  if (!cls?.casting) return { cantrips: [], level1: [] };
  const picks = SPELL_PICKS[state.class]?.[slant];
  if (!picks) return { cantrips: [], level1: [] };

  const legal = (names, lvl) => {
    const allowed = new Set(spellList(state.class, lvl).map(s => s.en));
    return names.filter(n => allowed.has(n));
  };
  const wantL1 = cls.casting.book ?? cls.casting.prepared ?? cls.casting.known ?? 0;
  return {
    cantrips: legal(picks.c, 0).slice(0, cls.casting.cantrips),
    level1: legal(picks.l, 1).slice(0, wantL1),
  };
}

/**
 * Weapon masteries. Mastery only pays off on a weapon you actually swing, so
 * the ones in the chosen starting package come first; after that, whatever
 * fits the fighting style and hits hardest, so the count is always filled.
 */
export function pickMasteries(state, cls, style, carried = []) {
  const usable = WEAPONS.filter(w => proficientWithWeapon(state, w));
  const wantsRanged = style === 'distancia';
  const fitsStyle = w => wantsRanged ? !w.melee
    : style === 'sutil' ? w.props.some(p => p.startsWith('sutil') || p.startsWith('ligera'))
    : w.melee;

  // Average damage, only used to break ties sensibly.
  const avg = w => {
    const m = /^(\d+)d(\d+)$/.exec(w.dmg);
    return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 : Number(w.dmg) || 0;
  };
  const score = w =>
    (carried.includes(w.key) ? 100 : 0) +
    (fitsStyle(w) ? 20 : 0) +
    (w.cat === 'marcial' ? 5 : 0) +
    avg(w);

  return usable.slice().sort((a, b) => score(b) - score(a) || a.key.localeCompare(b.key))
    .slice(0, cls.mastery.n).map(w => w.key);
}

/** The full proposal. `null` until the questionnaire is finished. */
export function quizResult(state) {
  const answers = state.quiz?.answers || {};
  if (quizAnswered(answers) < QUIZ.length) return null;

  const weights = quizWeights(answers);
  const background = ranked(weights.bg)[0] || 'trotamundos';
  const priority = abilityPriority(state, weights);
  const { buy, boosts } = allocateAbilities(priority, background);
  const style = ranked(weights.kit)[0] || 'cuerpo';
  const tones = ranked(weights.tone).slice(0, 3);

  const cls = CLASSES[state.class];
  const classSkills = pickClassSkills(state, weights, background);

  // Expertise, for the Rogue, follows the same affinity order.
  let expertise = [];
  if (cls?.expertise) {
    const proficient = [...new Set([...classSkills, ...(BACKGROUNDS[background]?.skills || []),
      ...(state.speciesSkills || [])])];
    expertise = proficient
      .sort((a, b) => (weights.sk[b] || 0) - (weights.sk[a] || 0) || a.localeCompare(b))
      .slice(0, cls.expertise.n);
  }

  // A support-leaning character gets the support spell list.
  const slant = (style === 'apoyo' || tones[0] === 'protector') ? 'apoyo' : 'ofensivo';

  // Masteries need to know the equipment first: they follow what you carry.
  const equipmentClass = cls ? packageForStyle(cls, style) : 'A';
  const carried = cls?.equipment?.[equipmentClass]?.grants?.weapons || [];

  return {
    background, priority, buy, boosts, style, tones, classSkills, expertise, slant,
    equipmentClass,
    equipmentBackground: 'A',
    spells: pickSpells(state, slant),
    // Class choices the quiz can settle without the player going back.
    fightingStyle: cls?.features?.some(f => f.choice === 'fightingStyle')
      ? (style === 'distancia' ? 'arqueria' : style === 'sutil' ? 'dosarmas' : 'defensa') : null,
    divineOrder: cls?.features?.some(f => f.choice === 'divineOrder')
      ? (style === 'cuerpo' ? 'protector' : 'taumaturgo') : null,
    primalOrder: cls?.features?.some(f => f.choice === 'primalOrder')
      ? (style === 'cuerpo' ? 'guardian' : 'mago') : null,
    masteries: cls?.mastery ? pickMasteries(state, cls, style, carried) : [],
  };
}

/**
 * Non-blocking notices. Order matters: `error` entries mean the step is
 * incomplete, `warn` entries are advice a player is free to ignore.
 */
export function validate(state) {
  const out = [];
  const push = (level, step, text) => out.push({ level, step, text });

  if (!state.name?.trim()) push('error', 'concepto', 'El personaje no tiene nombre.');
  if (!state.species) push('error', 'especie', 'Falta elegir especie.');
  if (!state.class) push('error', 'clase', 'Falta elegir clase.');
  if (!state.background) push('error', 'trasfondo', 'Falta elegir trasfondo.');

  const sp = SPECIES[state.species];
  if (sp?.lineages && !state.lineage) push('error', 'especie', `Falta elegir el linaje de ${sp.es}.`);
  if (sp?.size?.length > 1 && !state.size) push('error', 'especie', 'Falta elegir tamaño.');

  const cls = CLASSES[state.class];
  if (cls) {
    const need = cls.skills.n, have = (state.classSkills || []).length;
    if (have < need) push('error', 'habilidades', `Te faltan ${need - have} habilidad(es) de ${cls.es}.`);
    if (cls.mastery && (state.masteries || []).length < cls.mastery.n) {
      push('error', 'clase', `Te faltan armas con maestría (${(state.masteries||[]).length} de ${cls.mastery.n}).`);
    }
    if (cls.features?.some(f => f.choice === 'fightingStyle') && !state.fightingStyle) {
      push('error', 'clase', 'Falta elegir estilo de combate.');
    }
    if (cls.features?.some(f => f.choice === 'divineOrder') && !state.divineOrder) {
      push('error', 'clase', 'Falta elegir orden divina.');
    }
    if (cls.features?.some(f => f.choice === 'primalOrder') && !state.primalOrder) {
      push('error', 'clase', 'Falta elegir orden primigenia.');
    }
    if (cls.expertise && (state.expertise || []).length < cls.expertise.n) {
      push('error', 'habilidades', `Te falta elegir experticia (${(state.expertise||[]).length} de ${cls.expertise.n}).`);
    }
  }

  const bg = BACKGROUNDS[state.background];
  if (bg) {
    const spent = Object.values(state.boosts || {}).reduce((a, b) => a + b, 0);
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
    const best = cls.primary.reduce((a, b) => (scores[a] >= scores[b] ? a : b));
    if (scores[best] < 14) {
      push('warn', 'puntos', `${cls.es} funciona mejor con ${cls.primary.map(k => byKey(ABILITIES,k).es).join(' o ')} alta; ahora la mejor está en ${scores[best]}.`);
    }
  }
  const pen = state.class ? armorPenalty(state, finalScores(state)) : null;
  if (pen) push('warn', 'equipo', pen);

  return out;
}
