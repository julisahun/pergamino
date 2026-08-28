#!/usr/bin/env node
/*
Checks a campaign folder the way the admin page reads it, and says out loud
what the app would swallow in silence.

  node dm2/check-campaign.js campaigns/example

Every parse in dm/ is deliberately forgiving — normaliseBeast() coerces string
numbers, normaliseScene() accepts a bare art path, normalise() fills in every
missing character field — so a wrong file almost never announces itself. A
monster with no `id` becomes a brand-new bestiary entry on every 5s poll; a
roster pointing at a beastId nobody has seats nothing; a species slug that is
not in SPECIES makes derive() quietly compute a different character. All of
that opens the app and looks fine.

This is the missing half of the import instructions (dm2/importing.md): the
checker a converted campaign has to survive before it goes anywhere near a
table.

It runs under plain node with no dependencies, and it imports src/rules/data.js
and calls the app's own engine.validate() rather than restating the vocabulary
in a second language: there is exactly one list of species in this repo, and it
is the one the table plays with.

Exit codes: 0 clean, 1 warnings only, 2 at least one error.
*/

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  SPECIES, CLASSES, BACKGROUNDS, ABILITIES, ALL_SKILLS, MASTERIES,
  ORIGIN_FEATS, FIGHTING_STYLES, DIVINE_ORDERS, PRIMAL_ORDERS,
  MAGIC_INITIATE_LISTS, SPELLS, POINT_BUY_TOTAL, POINT_BUY_COST,
} from './lint/rules/data.js';
import { buySpent, derive, validate, spellByEn } from './lint/rules/engine.js';
import { normalise } from './lint/rules/character.js';
import { normaliseBeast } from './lint/shared/beasts.js';
import { normaliseObject, MOD_KEYS } from './lint/shared/objects.js';
import { normaliseScene } from './lint/shared/scenes.js';
import { RUNS_DIR, isRunPath } from './lint/shared/runs.js';
import { noteFrom, noteTitle, storyIndex, resolveWikilink,
         withoutFrontmatter } from './lint/shared/story.js';

/* ------------------------------------------------------------- findings */

const ERR = 'error', WARN = 'warn', INFO = 'info';
const found = [];
const add = (level, where, text) => found.push({ level, where, text });

/* ------------------------------------------------------------ the walker
   Deliberately the same holes readTree() has: dotfiles, Chromium's .crswap
   write buffers and trash/ are invisible, and only <subdir>/*.json at depth
   two is an entity. A file the walker cannot see is a file the app cannot
   see, which is itself worth reporting. */

const skip = name => name.startsWith('.') || name.endsWith('.crswap');

function walk(root, prefix = '', out = []) {
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (rel !== 'trash') walk(root, rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

const readJSON = (root, rel) => {
  try { return { raw: JSON.parse(readFileSync(join(root, rel), 'utf8')) }; }
  catch (e) { return { error: e.message }; }
};

/* ---------------------------------------------------------- shared rules */

/** monsters/ and objects/ are read as bare objects: main.js hands the parsed
    file straight to normaliseBeast({...raw, file}) with no unwrapping, so an
    envelope's keys are simply not the ones being read. Scenes and characters
    do unwrap, which is exactly why this trap is easy to fall into. */
function envelopeTrap(rel, raw, kind) {
  if (raw && typeof raw === 'object' && ('kind' in raw || kind in raw)) {
    add(ERR, rel, `wrapped in an envelope: ${rel.split('/')[0]}/ files are read as `
      + `bare objects (no unwrapping), so every real field is invisible and this `
      + `lands as «Sin nombre» with the defaults. Move the inner object to the top level.`);
    return true;
  }
  return false;
}

function requireId(rel, raw, what, consequence) {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (!id) add(ERR, rel, `no \`id\`: one is invented on every read, so ${consequence}`);
  return id;
}

const numberish = v => v !== '' && v != null && Number.isFinite(Number(v));

/* ------------------------------------------------------------- monsters */

function checkMonsters(root, files, ids) {
  for (const rel of files) {
    const { raw, error } = readJSON(root, rel);
    if (error) { add(ERR, rel, `not valid JSON (${error}) — the app skips the file without a word.`); continue; }
    if (envelopeTrap(rel, raw, 'beast')) continue;

    const id = requireId(rel, raw, 'monster',
      'this becomes a NEW bestiary entry every 5s poll, and no scene roster can point at it.');
    if (id) {
      if (ids.monsters.has(id)) add(ERR, rel, `duplicate id "${id}" (also in ${ids.monsters.get(id)}) — one silently replaces the other.`);
      else ids.monsters.set(id, rel);
    }

    const b = normaliseBeast(raw);
    if (!raw?.name) add(WARN, rel, 'no `name` — reads as «Sin nombre».');
    if (!numberish(raw?.ac)) add(WARN, rel, `\`ac\` is ${JSON.stringify(raw?.ac)} — reads as 10.`);
    if (!numberish(raw?.hpMax)) add(WARN, rel, `\`hpMax\` is ${JSON.stringify(raw?.hpMax)} — reads as 1.`);
    if (raw?.initMod != null && !numberish(raw.initMod)) add(WARN, rel, `\`initMod\` is ${JSON.stringify(raw.initMod)} — reads as 0.`);

    /* The mistake every converted statblock makes. Speed is metres here
       (SPECIES.humano is 9, not 30) and the card prints "<n> m" verbatim, so
       a copied "30 ft." reads as a monster that moves thirty metres. All five
       monsters in campaigns/example currently do this. */
    if (b.speed != null && b.speed >= 15) {
      add(WARN, rel, `\`speed\`: ${b.speed} looks like feet — this field is METRES and the card prints `
        + `"${b.speed} m". 5e 30 ft is 9, 25 ft is 7.5, 20 ft is 6.`);
    }
    if (raw?.speed != null && !numberish(raw.speed) && String(raw.speed).toLowerCase() !== 'none' && raw.speed !== '') {
      add(INFO, rel, `\`speed\`: ${JSON.stringify(raw.speed)} is unparseable, so the card shows no speed at all.`);
    }

    if (raw?.abilities != null && !Array.isArray(raw.abilities)) {
      add(WARN, rel, '`abilities` is not an array — dropped entirely.');
    } else if (Array.isArray(raw?.abilities)) {
      const kept = b.abilities.length;
      if (kept < raw.abilities.length) add(WARN, rel, `${raw.abilities.length - kept} ability entry(ies) have neither \`name\` nor \`desc\` and are dropped.`);
    }
    if (typeof raw?.portrait === 'string') {
      add(WARN, rel, '`portrait` is a bare string — it must be {"src": "assets/…"}; as written it reads as no portrait.');
    }
    if (b.portrait?.src) ids.assetRefs.push({ rel, src: b.portrait.src, field: 'portrait.src' });
  }
}

/* -------------------------------------------------------------- objects */

function checkObjects(root, files, ids) {
  const known = MOD_KEYS.map(([k]) => k);
  for (const rel of files) {
    const { raw, error } = readJSON(root, rel);
    if (error) { add(ERR, rel, `not valid JSON (${error}) — the app skips the file without a word.`); continue; }
    if (envelopeTrap(rel, raw, 'object')) continue;

    const id = requireId(rel, raw, 'object',
      'every holder that carries this object loses it on the next poll (assignments are stored as ids).');
    if (id) {
      if (ids.objects.has(id)) add(ERR, rel, `duplicate id "${id}" (also in ${ids.objects.get(id)}) — one silently replaces the other.`);
      else ids.objects.set(id, rel);
    }

    if (!raw?.name) add(WARN, rel, 'no `name` — reads as «Sin nombre».');
    if (raw?.mods != null && (typeof raw.mods !== 'object' || Array.isArray(raw.mods))) {
      add(WARN, rel, '`mods` is not an object — no modifier applies.');
    } else {
      for (const [k, v] of Object.entries(raw?.mods || {})) {
        if (!known.includes(k)) {
          add(WARN, rel, `\`mods.${k}\` is not a modifier the app computes (only ${known.join(', ')}) — `
            + 'it does nothing. Write it as an `effects` line instead, which is shown but never computed.');
        } else if (!Number.isFinite(Number(v))) {
          add(WARN, rel, `\`mods.${k}\` is ${JSON.stringify(v)} — dropped.`);
        }
      }
    }
    if (raw?.effects != null && !Array.isArray(raw.effects)) add(WARN, rel, '`effects` is not an array — dropped entirely.');
  }
}

/* --------------------------------------------------------------- scenes */

function checkScenes(root, files, ids) {
  for (const rel of files) {
    const { raw, error } = readJSON(root, rel);
    if (error) { add(ERR, rel, `not valid JSON (${error}) — the app skips the file without a word.`); continue; }

    const s = normaliseScene(raw);
    const inner = raw?.kind === 'dnd-dm-scene' ? raw.scene : (raw?.scene || raw);
    if (!inner || typeof inner !== 'object') { add(ERR, rel, 'no scene object to read.'); continue; }

    if (!String(inner.id || '').trim()) {
      add(ERR, rel, 'no `id`: one is invented on every read, so the live scene reference in session.json '
        + '(`field.sceneId`) goes stale the moment the folder is re-polled.');
    } else if (ids.scenes.has(s.id)) {
      add(ERR, rel, `duplicate id "${s.id}" (also in ${ids.scenes.get(s.id)}).`);
    } else {
      ids.scenes.set(s.id, rel);
    }

    if (!String(inner.name || '').trim()) add(WARN, rel, 'no `name` — reads as «Escena sin nombre».');
    if (!s.art) add(WARN, rel, 'no `art` — the scene goes live with no background at all.');
    else if (s.art.src) ids.assetRefs.push({ rel, src: s.art.src, field: 'art.src' });
    else add(WARN, rel, '`art` has no usable `src`.');

    for (const layer of ['music', 'ambience']) {
      const l = s.audio?.[layer];
      if (l) ids.assetRefs.push({ rel, src: l.src, field: `audio.${layer}.src` });
      const rawLayer = inner.audio?.[layer];
      const v = rawLayer?.volume;
      if (v != null && Number.isFinite(Number(v)) && (Number(v) < 0 || Number(v) > 1)) {
        add(WARN, rel, `\`audio.${layer}.volume\` is ${v} — clamped to 0…1.`);
      }
    }

    const rawCols = inner.grid?.cols;
    if (rawCols != null && String(rawCols).trim() !== '' && !Number.isFinite(Number(rawCols))) {
      add(WARN, rel, `\`grid.cols\` is ${JSON.stringify(rawCols)} — ignored, the scene uses the table's current grid.`);
    } else if (Number.isFinite(Number(rawCols)) && (Number(rawCols) < 4 || Number(rawCols) > 60)) {
      add(WARN, rel, `\`grid.cols\` ${rawCols} is outside 4…60 — clamped to ${s.grid?.cols}.`);
    }
    if (inner.grid?.rows != null) {
      add(INFO, rel, '`grid.rows` is read and discarded — rows always derive from the art\'s real proportions.');
    }

    const rawRoster = Array.isArray(inner.roster) ? inner.roster : [];
    if (inner.roster != null && !Array.isArray(inner.roster)) add(WARN, rel, '`roster` is not an array — dropped entirely.');
    const dropped = rawRoster.length - s.roster.length;
    if (dropped > 0) add(WARN, rel, `${dropped} roster entry(ies) have no \`beastId\` and are dropped.`);

    for (const r of s.roster) {
      if (!ids.monsters.has(r.beastId)) {
        add(ERR, rel, `roster points at beastId "${r.beastId}", which no monsters/*.json declares — `
          + 'the entry seats nobody when the scene goes to the TV.');
      }
      for (const oid of r.objects) {
        if (!ids.objects.has(oid)) add(WARN, rel, `roster entry carries object id "${oid}", which no objects/*.json declares — it contributes nothing.`);
      }
      if (s.grid && r.x >= s.grid.cols) {
        add(WARN, rel, `roster entry at x=${r.x} is outside this scene's ${s.grid.cols} columns — it gets reseated somewhere else.`);
      }
    }
  }
}

/* -------------------------------------------------------------- players */

const inList = (v, list) => v == null || v === '' || list.includes(v);

function checkSpellPick(rel, en, wantLvl, clsKey, where) {
  const sp = spellByEn(en);
  if (!sp) {
    add(ERR, rel, `${where}: "${en}" is not a spell this app knows. Spells are addressed by their `
      + `ENGLISH name from the ${SPELLS.length}-spell table (SPELLS in src/rules/data.js); an unknown `
      + 'name shows up as nothing at all on the sheet.');
    return;
  }
  if (sp.lvl !== wantLvl) {
    add(ERR, rel, `${where}: "${en}" is level ${sp.lvl}, not ${wantLvl} — it is in the wrong list.`);
  }
  if (clsKey && Array.isArray(sp.classes) && !sp.classes.includes(clsKey)) {
    add(WARN, rel, `${where}: "${en}" is not on the ${CLASSES[clsKey]?.es || clsKey} list (${sp.classes.join(', ')}).`);
  }
}

function checkPlayers(root, files, ids) {
  for (const rel of files) {
    const { raw, error } = readJSON(root, rel);
    if (error) { add(ERR, rel, `not valid JSON (${error}) — the app skips the file without a word.`); continue; }

    const body = raw?.character || raw;
    if (!body || typeof body !== 'object') { add(ERR, rel, 'no character object to read.'); continue; }

    if (!String(body.id || '').trim()) {
      add(ERR, rel, 'no `id`: the party is merged by character id, so an invented one means a '
        + 'duplicate party member (and reset wounds) every time the folder is re-read.');
    } else if (ids.players.has(body.id)) {
      add(ERR, rel, `duplicate character id "${body.id}" (also in ${ids.players.get(body.id)}) — one overwrites the other in the party.`);
    } else {
      ids.players.set(body.id, rel);
    }

    const c = normalise(body);

    /* The vocabulary. validate() cannot catch these: a bogus slug is truthy,
       so "falta elegir especie" never fires and derive() just computes a
       different character in silence. */
    if (!inList(c.species, Object.keys(SPECIES))) {
      add(ERR, rel, `\`species\`: "${c.species}" is not one of ${Object.keys(SPECIES).join(', ')}.`);
    } else if (c.species) {
      const sp = SPECIES[c.species];
      const lineages = sp.lineages ? Object.keys(sp.lineages) : null;
      if (lineages && !inList(c.lineage, lineages)) {
        add(ERR, rel, `\`lineage\`: "${c.lineage}" is not a ${sp.es} lineage (${lineages.join(', ')}).`);
      }
      if (!lineages && c.lineage) add(WARN, rel, `\`lineage\`: ${sp.es} has no lineages — the value is ignored.`);
      if (!inList(c.size, sp.size)) add(WARN, rel, `\`size\`: "${c.size}" is not one of ${sp.size.join(', ')}.`);
    }
    if (!inList(c.class, Object.keys(CLASSES))) {
      add(ERR, rel, `\`class\`: "${c.class}" is not one of ${Object.keys(CLASSES).join(', ')}.`);
    }
    if (!inList(c.background, Object.keys(BACKGROUNDS))) {
      add(ERR, rel, `\`background\`: "${c.background}" is not one of ${Object.keys(BACKGROUNDS).join(', ')}.`);
    }
    if (!inList(c.extraFeat, Object.keys(ORIGIN_FEATS))) {
      add(ERR, rel, `\`extraFeat\`: "${c.extraFeat}" is not one of ${Object.keys(ORIGIN_FEATS).join(', ')}.`);
    }
    if (!inList(c.fightingStyle, Object.keys(FIGHTING_STYLES))) {
      add(ERR, rel, `\`fightingStyle\`: "${c.fightingStyle}" is not one of ${Object.keys(FIGHTING_STYLES).join(', ')}.`);
    }
    if (!inList(c.divineOrder, Object.keys(DIVINE_ORDERS))) {
      add(ERR, rel, `\`divineOrder\`: "${c.divineOrder}" is not one of ${Object.keys(DIVINE_ORDERS).join(', ')}.`);
    }
    if (!inList(c.primalOrder, Object.keys(PRIMAL_ORDERS))) {
      add(ERR, rel, `\`primalOrder\`: "${c.primalOrder}" is not one of ${Object.keys(PRIMAL_ORDERS).join(', ')}.`);
    }

    const cls = CLASSES[c.class];
    for (const [field, list] of [['classSkills', c.classSkills], ['speciesSkills', c.speciesSkills],
                                 ['featSkills', c.featSkills], ['expertise', c.expertise]]) {
      for (const k of list || []) {
        if (!ALL_SKILLS.includes(k)) add(ERR, rel, `\`${field}\` has "${k}", which is not a skill key (${ALL_SKILLS.join(', ')}).`);
      }
    }
    if (cls?.skills?.from) {
      for (const k of c.classSkills || []) {
        if (ALL_SKILLS.includes(k) && !cls.skills.from.includes(k)) {
          add(WARN, rel, `\`classSkills\` has "${k}", which is not on the ${cls.es} list.`);
        }
      }
    }
    for (const k of c.masteries || []) {
      if (!Object.keys(MASTERIES).includes(k)) {
        add(ERR, rel, `\`masteries\` has "${k}", which is not one of ${Object.keys(MASTERIES).join(', ')}.`);
      }
    }
    if (!cls?.mastery && (c.masteries || []).length) {
      add(WARN, rel, `\`masteries\`: ${cls?.es || 'this class'} gets none at level 1 — the values are ignored.`);
    }

    /* The equipment package letter IS the loadout. There is no way to say
       "she carries a rapier": loadout() reads the class and background
       packages and derives armour, shield and weapons from them. */
    for (const [field, table, key] of [['equipmentClass', cls, c.equipmentClass],
                                       ['equipmentBackground', BACKGROUNDS[c.background], c.equipmentBackground]]) {
      const keys = table?.equipment ? Object.keys(table.equipment) : null;
      if (keys && !keys.includes(key)) add(ERR, rel, `\`${field}\`: "${key}" is not one of ${keys.join(', ')}.`);
    }
    for (const stray of ['armor', 'shield', 'weapons', 'ac', 'hp', 'hpMax', 'level']) {
      if (stray in body) {
        add(WARN, rel, `\`${stray}\` is not a field the app reads — every number is derived by derive() from `
          + 'the build (species/class/background/buy/boosts/equipment letters). Delete it so the file '
          + 'does not look like it is saying something.');
      }
    }

    const abilityKeys = ABILITIES.map(a => a.key);
    for (const [k, v] of Object.entries(c.buy || {})) {
      if (!abilityKeys.includes(k)) add(ERR, rel, `\`buy.${k}\` is not an ability key (${abilityKeys.join(', ')}).`);
      else if (POINT_BUY_COST[v] == null) add(ERR, rel, `\`buy.${k}\` is ${v} — point buy only allows 8…15.`);
    }
    for (const k of abilityKeys) {
      if (c.buy?.[k] == null) add(WARN, rel, `\`buy.${k}\` is missing — it defaults to 8.`);
    }
    const spent = buySpent(c.buy);
    if (spent !== POINT_BUY_TOTAL) {
      add(spent > POINT_BUY_TOTAL ? ERR : WARN, rel,
        `\`buy\` spends ${spent} of ${POINT_BUY_TOTAL} point-buy points.`);
    }

    const bg = BACKGROUNDS[c.background];
    if (bg) {
      for (const k of Object.keys(c.boosts || {})) {
        if (!bg.abilities.includes(k)) {
          add(ERR, rel, `\`boosts.${k}\`: ${bg.es} only boosts ${bg.abilities.join(', ')}.`);
        }
      }
      const vals = Object.values(c.boosts || {});
      const sum = vals.reduce((a, b) => a + b, 0);
      if (sum !== 3) add(ERR, rel, `\`boosts\` add up to ${sum}, not 3.`);
      else if (!vals.includes(2) && vals.filter(v => v === 1).length !== 3) {
        add(ERR, rel, `\`boosts\` ${JSON.stringify(c.boosts)} is not a legal split — it must be +2/+1 or +1/+1/+1.`);
      }
    }

    for (const en of c.spells?.cantrips || []) checkSpellPick(rel, en, 0, c.class, '`spells.cantrips`');
    for (const en of c.spells?.level1 || []) checkSpellPick(rel, en, 1, c.class, '`spells.level1`');
    if (!cls?.casting && ((c.spells?.cantrips || []).length || (c.spells?.level1 || []).length)) {
      add(WARN, rel, `\`spells\`: ${cls?.es || 'this class'} has no spellcasting at level 1 — `
        + 'these picks are ignored (a feat\'s spells go in `magicInitiate`, not here).');
    }

    const wantsMI = bg?.feat === 'iniciado' || c.extraFeat === 'iniciado';
    if (c.magicInitiate && !wantsMI) {
      add(WARN, rel, '`magicInitiate` is set but nothing grants Iniciado en la magia — it is ignored.');
    }
    if (wantsMI && c.magicInitiate) {
      const mi = c.magicInitiate;
      if (!inList(mi.list, Object.keys(MAGIC_INITIATE_LISTS))) {
        add(ERR, rel, `\`magicInitiate.list\`: "${mi.list}" is not one of ${Object.keys(MAGIC_INITIATE_LISTS).join(', ')}.`);
      }
      for (const en of mi.cantrips || []) checkSpellPick(rel, en, 0, mi.list, '`magicInitiate.cantrips`');
      if (mi.level1) checkSpellPick(rel, mi.level1, 1, mi.list, '`magicInitiate.level1`');
    }

    if (typeof body.portrait === 'string') {
      add(WARN, rel, '`portrait` is a bare string — it must be {"src": …} or {"stamp": …}; as written it reads as no portrait.');
    }
    if (c.portrait?.src) ids.assetRefs.push({ rel, src: c.portrait.src, field: 'portrait.src' });

    /* The creator's own notices, verbatim — everything above is what
       validate() structurally cannot see. */
    for (const n of validate(c)) {
      add(n.level === 'error' ? ERR : WARN, rel, `[${n.step}] ${n.text}`);
    }

    if (!c.wizardDone) add(INFO, rel, '`wizardDone` is false — the creator still considers this sheet unfinished.');

    /* Print what the board will actually show. A converted character that
       validates can still be the wrong character, and the fastest way to
       notice is to read the four numbers out loud. */
    try {
      const d = derive(c);
      ids.derived.push(`${c.name || '(sin nombre)'} — ${cls?.es || '?'} ${SPECIES[c.species]?.es || '?'}`
        + ` · PG ${d.hp ?? '—'} · CA ${d.ca} · Init ${d.initiative >= 0 ? '+' : ''}${d.initiative}`
        + ` · Vel ${d.speed ?? '—'} m · PP ${d.passivePerception}`);
    } catch (e) {
      add(ERR, rel, `derive() throws on this sheet (${e.message}) — the DM board cannot render the card at all.`);
    }
  }
}

/* ---------------------------------------------------------------- story */

function checkStory(root, files) {
  const notes = files.map(rel => noteFrom(rel, readFileSync(join(root, rel), 'utf8')));
  const index = storyIndex(notes);

  for (const note of notes) {
    /* What the renderer's markdown subset drops. The file itself is never at
       risk — this app only ever READS notes — so this is about what the DM
       will and will not see on screen at the table. */
    const flattened = [
      [/^\s*\d+[.)]\s+/m, 'numbered lists'],
      [/^\s*>/m, 'block quotes'],
      [/^\s*```/m, 'code fences'],
      [/^\s*\|.*\|/m, 'tables'],
      [/^\s*(-{3,}|\*{3,})\s*$/m, 'horizontal rules'],
      [/!\[[^\]]*\]\([^)]*\)/, 'images'],
      [/(?<!\[)\[[^\]]+\]\([^)]*\)/, 'inline [links](…) — use [[wikilinks]] instead'],
      /* mdToHtml() matches `#{1,3}` for headings and `^-\s` for bullets, and
         trims every line first — so a fourth hash level, a star bullet and an
         indented bullet each fall through to the paragraph branch. */
      [/^#{4,}\s/m, 'headings deeper than ###'],
      [/^\s*[*+]\s+\S/m, 'bullets written with * or + (only - is a bullet)'],
      [/^[ \t]+-\s+\S/m, 'indented bullets (nesting is flattened)'],
    /* Frontmatter is not markdown the renderer failed to support: the app
       reads a field out of it and skips the rest on purpose. */
    ].filter(([re]) => re.test(withoutFrontmatter(note.content))).map(([, what]) => what);
    if (flattened.length) {
      add(WARN, note.path, `contains ${flattened.join(', ')}, which the notes renderer does not support. `
        + 'It stays in the file untouched, but it reads as plain text in the app.');
    }

    for (const m of note.content.matchAll(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)) {
      if (!resolveWikilink(m[1], index)) {
        add(WARN, note.path, `[[${m[1]}]] resolves to nothing — no note has that title or filename. `
          + 'It renders muted and creates no backlink.');
      }
    }
    if (!/^#\s+/m.test(withoutFrontmatter(note.content))) {
      add(INFO, note.path, `no \`# heading\` — the card title falls back to the filename ("${noteTitle(note)}").`);
    }
  }
  return notes;
}

/* --------------------------------------------------------------- layout */

function checkLayout(root, all) {
  const SUBDIRS = ['scenarios', 'assets', 'players', 'monsters', 'objects', 'story'];
  for (const d of SUBDIRS) {
    if (!existsSync(join(root, d))) add(INFO, d + '/', 'missing — reads as empty, which is fine unless you meant to put something there.');
  }

  for (const rel of all) {
    const parts = rel.split('/');
    if (parts.length === 1) {
      /* A README in the campaign root is a note to the next human, not a
         file the app was supposed to read. Anything else up here is a
         misfiled entity. */
      if (rel !== 'session.json' && !rel.endsWith('.md')) {
        add(WARN, rel, 'sits in the campaign root, where nothing reads it. Only session.json lives here.');
      }
      continue;
    }
    const [top] = parts;
    /* runs/<mesa>/… is a mesa's own layer, checked by checkRuns() below with
       the same rules — a run-local monster is a monster. */
    if (isRunPath(rel)) {
      /* A README in runs/ is a note to the next human, the same way one in the
         campaign root is — not a misfiled entity. */
      if (parts.length < 3 && !rel.endsWith('.md')) {
        add(WARN, rel, 'sits directly in runs/, where nothing reads it. A mesa is runs/<mesa>/.');
      }
      continue;
    }
    if (!SUBDIRS.includes(top)) {
      add(WARN, rel, `\`${top}/\` is not a folder the app reads (${SUBDIRS.join(', ')}).`);
      continue;
    }
    /* isTop() in fs.js requires exactly depth two, so an entity filed one
       level deeper is invisible — a mistake that looks like tidy housekeeping. */
    if (['scenarios', 'players', 'monsters', 'objects'].includes(top)) {
      if (parts.length > 2) {
        add(ERR, rel, `nested: only ${top}/*.json at the top level is read — this file is invisible to the app.`);
      } else if (!rel.endsWith('.json')) {
        add(WARN, rel, `not a .json — ${top}/ only reads .json files.`);
      }
    }
    if (top === 'story' && !rel.endsWith('.md')) add(WARN, rel, 'not a .md — story/ only reads .md files.');
  }
}

/* ------------------------------------------------------------------ runs
   A mesa is a second layer over the same campaign: its own party and play
   state, plus its own monsters, objects, scenes and assets, each shadowing the
   campaign's by id. Shadowing is the point, so it is reported as a note rather
   than a complaint — but only where an id actually matches, because a mesa's
   file whose id matches nothing shared is simply a monster only this mesa has,
   and one whose id has a typo in it is a shadow that silently is not one. */

function checkRuns(root, all, ids) {
  const slugs = [...new Set(all.filter(isRunPath).map(p => p.split('/')[1]).filter(Boolean))];
  if (!slugs.length) return [];

  const READ = ['players', 'monsters', 'objects', 'scenarios', 'assets'];
  for (const slug of slugs) {
    const prefix = `${RUNS_DIR}/${slug}`;
    const mine = all.filter(p => p.startsWith(prefix + '/'));
    const rel = p => p.slice(prefix.length + 1);

    for (const path of mine) {
      const parts = rel(path).split('/');
      const top = parts[0];
      if (parts.length === 1) {
        /* A mesa's own root: the two things the app reads, and notes. */
        if (path.endsWith('.md') || rel(path) === 'session.json') continue;
        add(WARN, path, 'sits in the mesa root, where only session.json and .md notes are read.');
        continue;
      }
      if (!READ.includes(top) && !path.endsWith('.md')) {
        add(WARN, path, `\`${top}/\` inside a mesa is not read (${READ.join(', ')}, o notas .md).`);
        continue;
      }
      if (['players', 'monsters', 'objects', 'scenarios'].includes(top)) {
        if (parts.length > 2) {
          add(ERR, path, `nested: only ${top}/*.json at the top of the mesa is read.`);
        } else if (!path.endsWith('.json')) {
          add(WARN, path, `not a .json — ${top}/ only reads .json files.`);
        }
      }
    }

    /* The mesa's own entities, checked exactly like the campaign's, and then
       compared against them. */
    const pickIn = top => mine.filter(p => {
      const parts = rel(p).split('/');
      return parts.length === 2 && parts[0] === top && p.endsWith('.json');
    });
    const runIds = { monsters: new Map(), objects: new Map(), scenes: new Map(),
                     players: new Map(), assetRefs: [], derived: [] };
    checkMonsters(root, pickIn('monsters'), runIds);
    checkObjects(root, pickIn('objects'), runIds);
    checkScenes(root, pickIn('scenarios'), runIds);
    checkPlayers(root, pickIn('players'), runIds);

    for (const [kind, shared] of [['monsters', ids.monsters], ['objects', ids.objects],
                                 ['scenes', ids.scenes]]) {
      for (const [id, where] of runIds[kind]) {
        if (shared.has(id)) {
          add(INFO, where, `tapa a ${shared.get(id)} mientras juegue ${slug} — es lo que hace una mesa.`);
        }
      }
    }

    /* A scene's roster can point at a monster from either layer, because that
       is what the app resolves; checkScenes only saw one, so it is re-checked
       here against both. */
    for (const [id, where] of runIds.scenes) void id, where;

    if (!mine.some(p => rel(p).startsWith('players/') && p.endsWith('.json'))) {
      add(INFO, prefix + '/players/', 'sin fichas todavía — la mesa existe pero no se ha sentado nadie.');
    }
  }
  return slugs;
}

/* ----------------------------------------------------------------- main */

function main(argv) {
  const root = argv[0];
  if (!root) {
    console.error('usage: node dm/check-campaign.js <campaign-folder>');
    return 2;
  }
  try { if (!statSync(root).isDirectory()) throw new Error('not a directory'); }
  catch (e) { console.error(`cannot read ${root}: ${e.message}`); return 2; }

  const all = walk(root).sort();
  const pick = (top) => all.filter(p => {
    const parts = p.split('/');
    return parts.length === 2 && parts[0] === top && p.endsWith('.json');
  });

  const ids = {
    monsters: new Map(), objects: new Map(), scenes: new Map(), players: new Map(),
    assetRefs: [], derived: [],
  };

  checkLayout(root, all);
  /* Monsters and objects first: scene rosters are checked against their ids. */
  checkMonsters(root, pick('monsters'), ids);
  checkObjects(root, pick('objects'), ids);
  checkScenes(root, pick('scenarios'), ids);
  checkPlayers(root, pick('players'), ids);
  const runs = checkRuns(root, all, ids);
  /* Notes are one index across both layers, because that is how the app reads
     them: a mesa's bitácora can link to the campaign's lore and back. */
  const notes = checkStory(root, all.filter(p =>
    (p.startsWith('story/') && p.endsWith('.md')) || (isRunPath(p) && p.endsWith('.md'))));

  const assets = new Set(all.filter(p => p.startsWith('assets/')
    || (isRunPath(p) && p.split('/')[2] === 'assets')));
  const referenced = new Set();
  for (const { rel, src, field } of ids.assetRefs) {
    referenced.add(src);
    if (!assets.has(src)) {
      add(ERR, rel, `\`${field}\` points at "${src}", which is not in the folder — it loads as nothing.`);
    }
  }
  for (const a of assets) {
    if (!referenced.has(a) && !a.endsWith('.md')) add(INFO, a, 'in assets/ but nothing references it.');
  }

  /* -------------------------------------------------------- the report */

  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of found) counts[f.level]++;

  /* File count first, because that is what the DM put there; the id count
     second when they differ, because that is what the app ends up with. */
  const tally = (label, files, map) => {
    const n = files.length;
    return n === map.size ? `${n} ${label}(s)` : `${n} ${label}(s) (${map.size} usable)`;
  };
  console.log(`${root} — ${tally('monster', pick('monsters'), ids.monsters)}, `
    + `${tally('scene', pick('scenarios'), ids.scenes)}, `
    + `${tally('player', pick('players'), ids.players)}, `
    + `${tally('object', pick('objects'), ids.objects)}, `
    + `${notes.length} note(s), ${assets.size} asset(s)`);
  for (const line of ids.derived) console.log(`  ${line}`);

  const order = { error: 0, warn: 1, info: 2 };
  const byFile = new Map();
  for (const f of found) {
    if (!byFile.has(f.where)) byFile.set(f.where, []);
    byFile.get(f.where).push(f);
  }
  for (const where of [...byFile.keys()].sort()) {
    const rows = byFile.get(where).sort((a, b) => order[a.level] - order[b.level]);
    console.log(`\n${where}`);
    for (const r of rows) {
      const tag = r.level === ERR ? 'ERROR' : r.level === WARN ? 'warn ' : 'info ';
      console.log(`  ${tag} ${r.text}`);
    }
  }

  console.log(`\n${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} note(s).`);
  if (counts.error) {
    console.log('Errors mean the app reads something other than what the file says. Fix them before playing.');
    return 2;
  }
  if (counts.warn) return 1;
  console.log('Nothing the app would read differently than written.');
  return 0;
}

process.exit(main(process.argv.slice(2)));
