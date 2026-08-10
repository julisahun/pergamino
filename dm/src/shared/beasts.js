/* Bestiary entries — templates, not instances. A monster read from
   monsters/*.json must survive being written by hand: real campaign files
   carry `ac: "10"` (string numbers) and `speed: "None"`, so everything is
   coerced and an unparseable speed reads as "no speed", not NaN. */

import { newId } from '../rules/character.js';

export function normaliseBeast(b) {
  const speedRaw = b?.speed;
  const speed = speedRaw === '' || speedRaw == null || !Number.isFinite(Number(speedRaw))
    ? null : Number(speedRaw);
  return {
    id: b?.id || newId(),
    name: String(b?.name || 'Sin nombre'),
    tag: String(b?.tag || '').trim(),
    ac: Math.max(0, Number(b?.ac) || 10),
    hpMax: Math.max(1, Number(b?.hpMax) || 1),
    initMod: Number(b?.initMod) || 0,
    speed,
    note: String(b?.note || ''),
    portrait: b?.portrait
      ? { src: typeof b.portrait.src === 'string' ? b.portrait.src : null,
          stamp: typeof b.portrait.stamp === 'string' ? b.portrait.stamp : null }
      : null,
    abilities: Array.isArray(b?.abilities)
      ? b.abilities.map(a => ({ id: a?.id || newId(), name: String(a?.name || ''), desc: String(a?.desc || '') }))
        .filter(a => a.name || a.desc)
      : [],
    file: typeof b?.file === 'string' ? b.file : null,    // monsters/<name>.json, when it came from disk
  };
}

/** "+ Nuevo PNJ" never checks for a collision — every monster typed by hand
    is new by definition. A monster read from monsters/*.json is not: the same
    file re-read after an edit should update the statblock, not duplicate it.
    `b` has already been through `normaliseBeast()`, which invents an id when
    the file has none — and an invented id can never match anything already in
    the bestiary, so a file with no `id` always lands as a new entry. */
export function absorbBeast(bestiary, b) {
  const at = bestiary.findIndex(x => x.id === b.id);
  if (at >= 0) bestiary[at] = b;
  else bestiary.push(b);
}
