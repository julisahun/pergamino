export function blankCharacter() {
  return {
    id: newId(),
    updatedAt: Date.now(),
    wizardStep: 0,
    wizardDone: false,
    name: '', player: '', appearance: '', portrait: null,
    species: null, lineage: null, size: null, speciesSkills: [], extraFeat: null,
    class: null, classSkills: [], masteries: [], expertise: [], fightingStyle: null,
    divineOrder: null, primalOrder: null,
    quiz: { answers: {}, applied: false },
    background: null, boosts: {}, featSkills: [], featTools: [], magicInitiate: null,
    buy: { FUE: 8, DES: 8, CON: 8, INT: 8, SAB: 8, CAR: 8 },
    equipmentClass: 'A', equipmentBackground: 'A',
    spells: { cantrips: [], level1: [] },
    story: { personality: '', ideals: '', bonds: '', flaws: '', backstory: '', ties: '' },
  };
}

export function newId() {
  return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export function normalise(c) {
  const merged = Object.assign(blankCharacter(), c);
  merged.id = c.id || newId();
  merged.quiz = Object.assign({ answers: {}, applied: false }, c.quiz);
  merged.spells = Object.assign({ cantrips: [], level1: [] }, c.spells);
  merged.story = Object.assign(
    { personality: '', ideals: '', bonds: '', flaws: '', backstory: '', ties: '' }, c.story);
  merged.portrait = c.portrait
    ? { src: typeof c.portrait.src === 'string' ? c.portrait.src : null,
        stamp: typeof c.portrait.stamp === 'string' ? c.portrait.stamp : null }
    : null;
  delete merged.step;                // v1 field, replaced by wizardStep
  return merged;
}
