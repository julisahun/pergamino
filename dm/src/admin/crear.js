/* Crear ficha — the creator's questionnaire-free half, inside the DM window.

   The rules modules under src/rules/ are the creator's, verbatim, so a sheet
   built here is the same object the creator exports and lands in
   players/<slug>.json in the same envelope. Nothing is invented locally:
   every number on screen comes from derive() and every complaint from
   validate().

   One page, collapsible sections — the creator's Edit screen, not its
   wizard: a DM building a walk-in player's character at the table wants the
   whole thing in front of them, not eleven screens. `Rellenar` runs the
   creator's own quizResult() over random answers, so a complete, legal
   level-1 character is one button away and everything stays editable. */

import { html } from './html.js';
import { state, update, flash } from './store.js';
import { ModalFrame, closeModal } from './frame.js';
import { absorbCharacter } from './party.js';
import { blankCharacter, normalise } from '../rules/character.js';
import {
  ABILITIES, SKILLS, WEAPONS, MASTERIES, DAMAGE_TYPES, ARTISAN_TOOLS, INSTRUMENTS,
  ORIGIN_FEATS, SPECIES, BACKGROUNDS, CLASSES, FIGHTING_STYLES, DIVINE_ORDERS,
  PRIMAL_ORDERS, MAGIC_INITIATE_LISTS, QUIZ, POINT_BUY_TOTAL,
} from '../rules/data.js';
import {
  byKey, skill, weapon, armor, signed, buyCost, buySpent,
  derive, validate, proficiencies, proficientWithWeapon, grantedSkillSources,
  skillProficiencies, magicInitiateFeat, loadout, spellList, spellByEn, quizResult,
} from '../rules/engine.js';

/* --------------------------------------------------------------- opening */

/** `charId` edits a sheet already in the party; nothing creates a new one.
    The draft is a detached copy — nothing reaches the party or the disk
    until Guardar. */
export function openCharacterEditor(charId = null) {
  const existing = charId ? state.session.party.find(c => c.id === charId) : null;
  const c = normalise(existing ? structuredClone(existing) : blankCharacter());
  const draft = {
    c,
    editing: !!existing,
    /* Which sections are unfolded. A new sheet opens on the three decisions
       everything else hangs off; an edit opens closed, because the DM came
       here for one thing. */
    open: new Set(existing ? [] : ['especie', 'clase', 'trasfondo']),
  };
  update(s => { s.ui.modal = () => CharacterEditor(draft); });
}

/* ------------------------------------------------------------- mutations
   pick() is the creator's: choosing again clears everything that hung off
   the old choice, so a Mago who becomes a Bárbaro cannot keep his spells. */

function pick(c, kind, value) {
  if (kind === 'species') {
    if (c.species === value) return;
    c.species = value;
    c.lineage = null;
    c.speciesSkills = [];
    c.extraFeat = null;
    c.size = SPECIES[value]?.size.length === 1 ? SPECIES[value].size[0] : null;
  } else if (kind === 'class') {
    if (c.class === value) return;
    c.class = value;
    c.classSkills = [];
    c.masteries = [];
    c.expertise = [];
    c.fightingStyle = null;
    c.divineOrder = null;
    c.primalOrder = null;
    c.equipmentClass = Object.keys(CLASSES[value]?.equipment || { A: 1 })[0];
    c.spells = { cantrips: [], level1: [] };
  } else if (kind === 'background') {
    if (c.background === value) return;
    c.background = value;
    c.boosts = {};
    c.featTools = [];
    c.featSkills = [];
    c.magicInitiate = null;
    c.equipmentBackground = Object.keys(BACKGROUNDS[value]?.equipment || { A: 1 })[0];
  } else if (kind === 'extraFeat') {
    c.extraFeat = c.extraFeat === value ? null : value;
    c.featTools = [];
    c.featSkills = [];
    c.magicInitiate = null;
  } else {
    c[kind] = c[kind] === value ? null : value;
  }
}

/** Toggle a value inside a capped list, in place. */
function toggleIn(list, value, max) {
  const at = list.indexOf(value);
  if (at >= 0) list.splice(at, 1);
  else if (list.length < max) list.push(value);
}

const some = list => list[Math.floor(Math.random() * list.length)];
const someKey = table => some(Object.keys(table));

/* --------------------------------------------------------------- Rellenar
   The quiz engine, driven by random answers instead of a player: it returns
   a complete, legal proposal for everything below species and class. What it
   does not settle — the species' own skill, the Human's extra feat, the feat
   pickers — is filled here, from the same pools the manual lists use. */

function fillIn(draft) {
  const c = draft.c;
  if (!c.species) pick(c, 'species', someKey(SPECIES));
  if (!c.class) pick(c, 'class', someKey(CLASSES));

  const r = quizResultFor(c);
  if (r) {
    c.background = r.background;
    c.boosts = { ...r.boosts };
    c.buy = { ...r.buy };
    c.classSkills = [...r.classSkills];
    c.expertise = [...r.expertise];
    c.equipmentClass = r.equipmentClass;
    c.equipmentBackground = r.equipmentBackground;
    c.spells = { cantrips: [...r.spells.cantrips], level1: [...r.spells.level1] };
    if (r.fightingStyle) c.fightingStyle = r.fightingStyle;
    if (r.divineOrder) c.divineOrder = r.divineOrder;
    if (r.primalOrder) c.primalOrder = r.primalOrder;
    if (r.masteries.length) c.masteries = [...r.masteries];
    /* The background moved, so anything hanging off the old one goes. */
    c.featTools = [];
    c.featSkills = [];
    c.magicInitiate = null;
  }
  c.quiz = { answers: {}, applied: false };   // the answers were ours, not a player's
  fillRemaining(c);
  /* The three big choosers have just been answered, so they fold: what the
     DM wants to see next is the whole sheet, not eight rows of cards. */
  for (const id of ['especie', 'clase', 'trasfondo']) draft.open.delete(id);
  update();
  flash(r ? 'Relleno: una construcción legal de nivel 1. Cambia lo que quieras.'
          : 'No he podido proponer nada — elige antes especie y clase.');
}

/** A full set of answers is what quizResult() needs; random ones mean two
    presses of Rellenar do not build the same person twice. */
function quizResultFor(c) {
  const answers = {};
  for (const q of QUIZ) answers[q.id] = Math.floor(Math.random() * q.options.length);
  return quizResult({ ...c, quiz: { answers, applied: false } });
}

/** Everything the quiz has no opinion about, taken from the same pools the
    manual pickers offer — so Rellenar never leaves a validate() error behind. */
function fillRemaining(c) {
  const sp = SPECIES[c.species];
  if (sp?.lineages && !c.lineage) c.lineage = someKey(sp.lineages);
  if (sp?.size?.length > 1 && !c.size) c.size = sp.size[0];
  if (sp?.grants?.originFeat && !c.extraFeat) c.extraFeat = someKey(ORIGIN_FEATS);

  const free = pool => {
    const taken = grantedSkillSources(c);
    return pool.filter(k => !taken.has(k) && !(c.classSkills || []).includes(k));
  };
  if (sp?.grants?.skills) {
    const pool = sp.grants.skillsFrom || SKILLS.map(s => s.key);
    while ((c.speciesSkills || []).length < sp.grants.skills) {
      const next = some(free(pool));
      if (!next) break;
      c.speciesSkills.push(next);
    }
  }

  const cls = CLASSES[c.class];
  if (cls?.mastery) {
    const pool = WEAPONS.filter(w => proficientWithWeapon(c, w)).map(w => w.key);
    while (c.masteries.length < cls.mastery.n && pool.length > c.masteries.length) {
      const next = some(pool.filter(k => !c.masteries.includes(k)));
      if (!next) break;
      c.masteries.push(next);
    }
  }
  if (cls?.features?.some(f => f.choice === 'fightingStyle') && !c.fightingStyle) {
    c.fightingStyle = someKey(FIGHTING_STYLES);
  }
  if (cls?.features?.some(f => f.choice === 'divineOrder') && !c.divineOrder) {
    c.divineOrder = someKey(DIVINE_ORDERS);
  }
  if (cls?.features?.some(f => f.choice === 'primalOrder') && !c.primalOrder) {
    c.primalOrder = someKey(PRIMAL_ORDERS);
  }
  if (cls?.expertise) {
    const { prof } = skillProficiencies(c);
    while (c.expertise.length < cls.expertise.n) {
      const next = some([...prof].filter(k => !c.expertise.includes(k)));
      if (!next) break;
      c.expertise.push(next);
    }
  }

  const feats = [BACKGROUNDS[c.background]?.feat, c.extraFeat].filter(Boolean);
  for (const key of feats) {
    const h = ORIGIN_FEATS[key]?.hooks || {};
    if (h.skillChoices) {
      while (c.featSkills.length < h.skillChoices.n) {
        const next = some(free(SKILLS.map(s => s.key)).filter(k => !c.featSkills.includes(k)));
        if (!next) break;
        c.featSkills.push(next);
      }
    }
    if (h.toolChoices) {
      const pool = h.toolChoices.from === 'instruments' ? INSTRUMENTS : ARTISAN_TOOLS;
      while (c.featTools.length < h.toolChoices.n) {
        const next = some(pool.filter(t => !c.featTools.includes(t)));
        if (!next) break;
        c.featTools.push(next);
      }
    }
  }

  const mi = magicInitiateFeat(c);
  if (mi) {
    const next = { list: mi.list || someKey(MAGIC_INITIATE_LISTS), cantrips: [...(mi.cantrips || [])], level1: mi.level1 };
    const cantrips = spellList(next.list, 0).map(s => s.en);
    const level1 = spellList(next.list, 1).map(s => s.en);
    next.cantrips = next.cantrips.filter(en => cantrips.includes(en));
    while (next.cantrips.length < 2) {
      const one = some(cantrips.filter(en => !next.cantrips.includes(en)));
      if (!one) break;
      next.cantrips.push(one);
    }
    if (!level1.includes(next.level1)) next.level1 = some(level1) || null;
    c.magicInitiate = next;
  }
}

/* ------------------------------------------------------------- fragments */

function Cards({ table, current, onPick }) {
  return html`<div class="cards">${Object.entries(table).map(([key, v]) => html`
    <button type="button" class="card" key=${key} aria-pressed=${current === key}
      onClick=${() => onPick(key)}>
      <span class="name">${v.es}</span>
      <span class="why">${v.why || v.d || ''}</span>
    </button>`)}</div>`;
}

function Counter({ n, max, noun }) {
  return html`<p class=${'counter' + (n > max ? ' over' : '')}>Elegidas <b>${n}</b> de ${max} ${noun}.</p>`;
}

/** A capped checkbox list. `blocked` maps a value to whoever already grants
    it — the 2024 rules never stack a duplicate proficiency, so it is shown
    and disabled rather than silently allowed. */
function CheckList({ chosen, options, max, blocked, onToggle }) {
  return html`<div class="opts">${options.map(o => {
    const on = chosen.includes(o.value);
    const by = blocked && blocked.get(o.value);
    const off = !!by || (chosen.length >= max && !on);
    return html`<label class=${'opt' + (off ? ' off' : '')} key=${o.value}>
      <input type="checkbox" checked=${on} disabled=${off} onChange=${() => onToggle(o.value)} />
      <span>${o.label}${by ? html` <span class="tag">ya la da ${by}</span>` : null}</span>
    </label>`;
  })}</div>`;
}

const skillOptions = keys => keys.map(k => ({
  value: k, label: `${skill(k).es} (${skill(k).en}) · ${skill(k).ability}`,
}));

function SpellPicks({ list, chosen, max, onToggle }) {
  return html`<div class="opts">${list.map(sp => {
    const on = chosen.includes(sp.en);
    const off = chosen.length >= max && !on;
    return html`<label class=${'opt' + (off ? ' off' : '')} key=${sp.en}>
      <input type="checkbox" checked=${on} disabled=${off} onChange=${() => onToggle(sp.en)} />
      <span><b>${sp.es}</b> <span class="muted" style="font-size:.85em">(${sp.en})</span>
        <br /><span class="tag">${sp.school}</span>${' '}
        <span class="muted" style="font-size:.82em">${[sp.time, sp.range, sp.dur,
          sp.conc ? 'concentración' : null, sp.rit ? 'ritual' : null].filter(Boolean).join(' · ')}</span>
        <br /><span style="font-size:.9em">${sp.sum}</span></span>
    </label>`;
  })}</div>`;
}

/** One collapsible block. The summary carries the answer, so a folded
    section still says what was decided. */
function Section({ draft, id, title, value, bad, children }) {
  return html`<details open=${draft.open.has(id)}
      onToggle=${e => { e.target.open ? draft.open.add(id) : draft.open.delete(id); }}>
    <summary>${title}${value ? html` <span class="chose">${value}</span>` : null}${
      bad ? html` <span class="bad" title=${bad}>⚠</span>` : null}</summary>
    <div class="body">${children}</div>
  </details>`;
}

/* ---------------------------------------------------------------- screen */

function CharacterEditor(draft) {
  const c = draft.c;
  const set = fn => { fn(c); update(); };

  const sp = SPECIES[c.species];
  const cls = CLASSES[c.class];
  const bg = BACKGROUNDS[c.background];
  const d = derive(c);
  const notices = validate(c);
  const errors = notices.filter(n => n.level === 'error');
  const advice = notices.filter(n => n.level !== 'error');
  const errorsIn = step => errors.filter(n => n.step === step).map(n => n.text).join(' · ') || null;

  const save = () => {
    c.name = String(c.name || '').trim();
    if (!c.name) { flash('Ponle un nombre antes de guardar.'); return; }
    c.updatedAt = Date.now();
    const how = absorbCharacter(c, draft.editing ? 'editar' : 'crear');
    closeModal();
    flash(`${how === 'updated' ? 'Guardado' : 'Creado'}: ${c.name}.`
      + (errors.length ? ` Queda ${errors.length} cosa(s) por decidir.` : ''));
  };

  return html`<${ModalFrame} title=${draft.editing ? 'Editar ficha' : 'Nueva ficha'} acts=${html`
      <span class="count">${cls && sp
        ? html`CA <b>${d.ca}</b> · <b>${d.hp ?? '—'}</b> PG · inic. <b>${signed(d.initiative)}</b>`
        : 'Elige especie y clase'}${errors.length
          ? html` · <span class="bad">${errors.length} sin decidir</span>` : null}</span>
      <button class="ghost" title="Propone una construcción legal de nivel 1 para todo lo que falta — conserva el nombre, la especie y la clase que ya hayas elegido"
        onClick=${() => fillIn(draft)}>Rellenar</button>
      <button class="ghost" onClick=${closeModal}>Cancelar</button>
      <button class="primary" onClick=${save}>${draft.editing ? 'Guardar' : 'Crear'}</button>`}>

    <div class="chareditor editor">

      <div class="idrow">
        <label class="field"><span class="lab">Nombre</span>
          <input type="text" defaultValue=${c.name} placeholder="p. ej. Mira Sabalcanto"
            onInput=${e => {
              const had = !!String(c.name || '').trim();
              c.name = e.target.value;
              if (had !== !!e.target.value.trim()) update();
            }} /></label>
        <label class="field"><span class="lab">Jugador</span>
          <input type="text" defaultValue=${c.player} placeholder="quién lo lleva"
            onInput=${e => { c.player = e.target.value; }} /></label>
      </div>

      ${Section({ draft, id: 'especie', title: 'Especie',
        value: sp ? [sp.es, sp.lineages?.[c.lineage]?.es].filter(Boolean).join(' · ') : null,
        bad: errorsIn('especie'),
        children: html`
          <${Cards} table=${SPECIES} current=${c.species}
            onPick=${k => set(() => { pick(c, 'species', k); draft.open.delete('especie'); })} />
          ${sp?.lineages ? html`<fieldset><legend>Linaje de ${sp.es}</legend>
            <${Cards} table=${sp.lineages} current=${c.lineage}
              onPick=${k => set(() => { c.lineage = k; })} /></fieldset>` : null}
          ${sp?.size.length > 1 ? html`<fieldset><legend>Tamaño</legend><div class="opts">
            ${sp.size.map(s => html`<label class="opt" key=${s}>
              <input type="radio" name="crear-size" checked=${c.size === s}
                onChange=${() => set(() => { c.size = s; })} /><span>${s}</span></label>`)}
          </div></fieldset>` : null}
          ${sp?.grants?.skills ? SpeciesSkills(c, sp, set) : null}
          ${sp?.grants?.originFeat ? html`<fieldset><legend>Dote de origen extra de ${sp.es}</legend>
            <p class="muted">El humano lleva una dote de origen además de la del trasfondo.</p>
            <${Cards} table=${ORIGIN_FEATS} current=${c.extraFeat}
              onPick=${k => set(() => pick(c, 'extraFeat', k))} /></fieldset>` : null}
          ${sp ? html`<fieldset><legend>Rasgos que gana</legend>
            ${[...sp.traits, ...(sp.lineages?.[c.lineage]?.traits || [])].map((t, i) =>
              html`<p key=${i}><b>${t.n}.</b> ${t.d}</p>`)}</fieldset>` : null}` })}

      ${Section({ draft, id: 'clase', title: 'Clase', value: cls ? cls.es + ' 1' : null,
        bad: errorsIn('clase'),
        children: html`
          <${Cards} table=${CLASSES} current=${c.class}
            onPick=${k => set(() => { pick(c, 'class', k); draft.open.delete('clase'); })} />
          ${cls ? ClassBits(c, cls, set) : null}` })}

      ${Section({ draft, id: 'trasfondo', title: 'Trasfondo', value: bg ? bg.es : null,
        bad: errorsIn('trasfondo'),
        children: html`
          <${Cards} table=${BACKGROUNDS} current=${c.background}
            onPick=${k => set(() => { pick(c, 'background', k); draft.open.delete('trasfondo'); })} />
          ${bg ? BackgroundBits(c, bg, set) : null}` })}

      ${Section({ draft, id: 'puntos', title: 'Puntuaciones',
        value: ABILITIES.map(a => `${a.key} ${d.scores[a.key]}`).join(' · '),
        bad: errorsIn('puntos'), children: PointBuy(c, d, set) })}

      ${cls ? Section({ draft, id: 'habilidades', title: 'Habilidades',
        value: `${(c.classSkills || []).length} de ${cls.skills.n} de clase`,
        bad: errorsIn('habilidades'), children: Skills(c, cls, set) }) : null}

      ${cls?.casting || magicInitiateFeat(c) || d.extraSpells.length
        ? Section({ draft, id: 'conjuros', title: 'Conjuros',
            value: cls?.casting
              ? `${(c.spells?.cantrips || []).length} trucos · ${(c.spells?.level1 || []).length} de nivel 1`
              : 'de dote o especie',
            bad: errorsIn('conjuros'), children: Spells(c, cls, d, set) })
        : null}

      ${cls && bg ? Section({ draft, id: 'equipo', title: 'Equipo',
        value: [cls.equipment[c.equipmentClass]?.label, bg.equipment[c.equipmentBackground]?.label]
          .filter(Boolean).join(' · '),
        bad: errorsIn('equipo'), children: Equipment(c, cls, bg, d, set) }) : null}

      ${/* Errors block Crear; warnings are advice the DM is free to ignore,
            so a sheet full of them still reads as done. */ null}
      <div class="verdict">
        ${errors.length
          ? html`<div class="notice warn"><b>Queda por decidir:</b>
              <ul style="margin:.2rem 0 0;padding-left:1.1rem">
                ${errors.map((n, i) => html`<li key=${i}>${n.text}</li>`)}</ul></div>`
          : html`<div class="notice ok">La ficha está completa y es legal.</div>`}
        ${advice.length ? html`<div class="notice">
          <ul style="margin:0;padding-left:1.1rem">
            ${advice.map((n, i) => html`<li key=${i}>${n.text}</li>`)}</ul></div>` : null}
      </div>
    </div>
  <//>`;
}

/* ------------------------------------------------------------- the parts */

function SpeciesSkills(c, sp, set) {
  const pool = sp.grants.skillsFrom || SKILLS.map(s => s.key);
  const blocked = new Map();
  for (const [k, src] of grantedSkillSources(c)) {
    if (!(c.speciesSkills || []).includes(k)) blocked.set(k, src);
  }
  return html`<fieldset><legend>Habilidad de ${sp.es}</legend>
    <${Counter} n=${(c.speciesSkills || []).length} max=${sp.grants.skills} noun="habilidades" />
    <${CheckList} chosen=${c.speciesSkills} options=${skillOptions(pool)}
      max=${sp.grants.skills} blocked=${blocked}
      onToggle=${k => set(() => toggleIn(c.speciesSkills, k, sp.grants.skills))} />
  </fieldset>`;
}

function ClassBits(c, cls, set) {
  const prof = proficiencies(c);
  const choice = key => cls.features.some(f => f.choice === key);
  const masteryPool = cls.mastery
    ? WEAPONS.filter(w => proficientWithWeapon(c, w)).map(w => ({
        value: w.key,
        label: `${w.es} — ${w.dmg} ${DAMAGE_TYPES[w.type]} · ${MASTERIES[w.mastery].es}: ${MASTERIES[w.mastery].d}`,
      }))
    : [];

  return html`
    <fieldset><legend>Lo que le da ${cls.es}</legend>
      <div style="font-size:.92rem">
        <p><b>Dado de golpe:</b> 1d${cls.hitDie} ·${' '}
          <b>Salvaciones:</b> ${cls.saves.map(s => byKey(ABILITIES, s).es).join(' y ')}</p>
        <p><b>Armaduras:</b> ${prof.armor.join(', ') || 'ninguna'}<br />
          <b>Armas:</b> ${prof.weapons.join(', ')}${
          cls.tools ? html`<br /><b>Herramientas:</b> ${cls.tools}` : null}</p>
        ${cls.features.map((f, i) => html`<p key=${i}><b>${f.n}.</b> ${f.d}</p>`)}
      </div></fieldset>
    ${choice('fightingStyle') ? html`<fieldset><legend>Estilo de combate</legend>
      <${Cards} table=${FIGHTING_STYLES} current=${c.fightingStyle}
        onPick=${k => set(() => pick(c, 'fightingStyle', k))} /></fieldset>` : null}
    ${choice('divineOrder') ? html`<fieldset><legend>Orden divina</legend>
      <${Cards} table=${DIVINE_ORDERS} current=${c.divineOrder}
        onPick=${k => set(() => pick(c, 'divineOrder', k))} /></fieldset>` : null}
    ${choice('primalOrder') ? html`<fieldset><legend>Orden primigenia</legend>
      <${Cards} table=${PRIMAL_ORDERS} current=${c.primalOrder}
        onPick=${k => set(() => pick(c, 'primalOrder', k))} /></fieldset>` : null}
    ${cls.mastery ? html`<fieldset><legend>Armas con maestría</legend>
      <${Counter} n=${(c.masteries || []).length} max=${cls.mastery.n} noun="armas" />
      <${CheckList} chosen=${c.masteries} options=${masteryPool} max=${cls.mastery.n}
        onToggle=${k => set(() => toggleIn(c.masteries, k, cls.mastery.n))} />
    </fieldset>` : null}`;
}

function BackgroundBits(c, bg, set) {
  const feat = ORIGIN_FEATS[bg.feat];
  const spent = Object.values(c.boosts || {}).reduce((a, b) => a + b, 0);
  const legal = spent === 3
    && (Object.values(c.boosts).includes(2)
      || Object.values(c.boosts).filter(v => v === 1).length === 3);

  return html`
    <fieldset><legend>Mejoras de puntuación</legend>
      <p class="muted">Reparte <b>+2 y +1</b> entre dos de estas tres, o <b>+1 a cada una</b>.
        Se suman después de la compra de puntos, así que una puntuación puede acabar en 17.</p>
      <div class="opts">${bg.abilities.map(k => {
        const a = byKey(ABILITIES, k);
        const cur = c.boosts?.[k] || 0;
        return html`<div class="opt" key=${k}>
          <span style="min-width:9rem"><b>${a.es}</b> <span class="muted">(${a.en})</span></span>
          ${[0, 1, 2].map(v => html`<label style="margin-right:.6rem" key=${v}>
            <input type="radio" name=${'crear-boost-' + k} checked=${cur === v}
              onChange=${() => set(() => {
                if (v === 0) delete c.boosts[k]; else c.boosts[k] = v;
              })} /> ${v ? '+' + v : '—'}</label>`)}
        </div>`;
      })}</div>
      <p class=${'counter' + (spent !== 3 ? ' over' : '')}>Repartido <b>${spent}</b> de 3.
        Válido: +2/+1 o +1/+1/+1.</p>
      ${spent === 3 && !legal
        ? html`<div class="notice warn">Ese reparto no es legal: tiene que ser +2/+1 o +1/+1/+1.</div>`
        : null}
    </fieldset>
    <fieldset><legend>Lo que le da ${bg.es}</legend>
      <p><b>Habilidades:</b> ${bg.skills.map(s => `${skill(s).es} (${skill(s).en})`).join(', ')}</p>
      <p><b>Herramienta:</b> ${bg.tool.label}</p>
      <p><b>Dote de origen — ${feat.es}.</b> ${feat.d}</p>
    </fieldset>
    ${FeatTools(c, set)}`;
}

/** Crafter and Musician each need three tool picks; the rest need nothing. */
function FeatTools(c, set) {
  const feats = [BACKGROUNDS[c.background]?.feat, c.extraFeat].filter(Boolean);
  const rows = feats
    .map(key => [key, ORIGIN_FEATS[key]])
    .filter(([, f]) => f?.hooks?.toolChoices);
  if (!rows.length) return null;
  const n = rows.reduce((a, [, f]) => a + f.hooks.toolChoices.n, 0);
  const pool = [...new Set(rows.flatMap(([, f]) =>
    f.hooks.toolChoices.from === 'instruments' ? INSTRUMENTS : ARTISAN_TOOLS))];
  return html`<fieldset><legend>Herramientas de ${rows.map(([, f]) => f.es).join(' y ')}</legend>
    <${Counter} n=${(c.featTools || []).length} max=${n} noun="herramientas" />
    <${CheckList} chosen=${c.featTools} options=${pool.map(t => ({ value: t, label: t }))} max=${n}
      onToggle=${t => set(() => toggleIn(c.featTools, t, n))} />
  </fieldset>`;
}

function PointBuy(c, d, set) {
  const spent = buySpent(c.buy);
  const left = POINT_BUY_TOTAL - spent;
  const m = d.mods;
  const step = (key, delta) => set(() => { c.buy[key] += delta; });

  return html`
    <p class="muted">Compra de puntos: 27 para repartir, nadie tira dados. El modificador es lo
      que se suma a las tiradas y sube de dos en dos — 12→+1, 14→+2, 16→+3.</p>
    <p class=${'counter' + (left < 0 ? ' over' : '')}>Gastados <b>${spent}</b> de ${POINT_BUY_TOTAL}
      · quedan <b>${left}</b></p>
    <div class="buyrows">${ABILITIES.map(a => {
      const buy = c.buy[a.key];
      const bonus = c.boosts?.[a.key] || 0;
      const canUp = buy < 15 && buyCost(buy + 1) - buyCost(buy) <= left;
      return html`<div class="buyrow" key=${a.key}>
        <div class="nm">${a.es}<span class="muted"> (${a.en})</span>
          <span class="brk">compra ${buy}${bonus ? ` · trasfondo +${bonus}` : ''}</span></div>
        <div class="ctl">
          <button type="button" disabled=${buy <= 8} aria-label=${'Bajar ' + a.es}
            onClick=${() => step(a.key, -1)}>−</button>
          <button type="button" disabled=${!canUp} aria-label=${'Subir ' + a.es}
            onClick=${() => step(a.key, 1)}>+</button>
        </div>
        <div class="out"><b>${d.scores[a.key]}</b><span>${signed(m[a.key])}</span></div>
      </div>`;
    })}</div>
    <p><button type="button" class="ghost small" onClick=${() => set(() => {
      c.buy = blankCharacter().buy;
    })}>Reiniciar reparto</button></p>`;
}

function Skills(c, cls, set) {
  const granted = grantedSkillSources(c);
  const blocked = new Map();
  for (const [k, src] of granted) if (!(c.classSkills || []).includes(k)) blocked.set(k, src);

  const skilled = c.extraFeat === 'instruido' || BACKGROUNDS[c.background]?.feat === 'instruido';
  const featBlocked = new Map(blocked);
  for (const k of c.classSkills || []) featBlocked.set(k, cls.es);
  const { prof } = skillProficiencies(c);

  return html`
    ${granted.size ? html`<fieldset><legend>Ya las tiene</legend><div class="opts">
      ${[...granted].map(([k, src]) => html`<div class="opt" key=${k}>
        <span>● ${skill(k).es} <span class="tag">${src}</span></span></div>`)}
    </div></fieldset>` : null}
    <fieldset><legend>Habilidades de ${cls.es}</legend>
      <${Counter} n=${(c.classSkills || []).length} max=${cls.skills.n} noun="habilidades" />
      <${CheckList} chosen=${c.classSkills} options=${skillOptions(cls.skills.from)}
        max=${cls.skills.n} blocked=${blocked}
        onToggle=${k => set(() => toggleIn(c.classSkills, k, cls.skills.n))} />
    </fieldset>
    ${skilled ? html`<fieldset><legend>Habilidades de la dote Instruido</legend>
      <${Counter} n=${(c.featSkills || []).length} max=${3} noun="habilidades" />
      <${CheckList} chosen=${c.featSkills} options=${skillOptions(SKILLS.map(s => s.key))}
        max=${3} blocked=${featBlocked}
        onToggle=${k => set(() => toggleIn(c.featSkills, k, 3))} />
    </fieldset>` : null}
    ${cls.expertise ? html`<fieldset><legend>Experticia</legend>
      <p class="muted">Dobla el bonificador de competencia: en vez de +2 suma +4. Solo entre las
        habilidades en las que ya tiene competencia.</p>
      <${Counter} n=${(c.expertise || []).length} max=${cls.expertise.n} noun="habilidades" />
      ${prof.size
        ? html`<${CheckList} chosen=${c.expertise} options=${skillOptions([...prof])}
            max=${cls.expertise.n}
            onToggle=${k => set(() => toggleIn(c.expertise, k, cls.expertise.n))} />`
        : html`<div class="notice warn">Elige primero las habilidades de arriba.</div>`}
    </fieldset>` : null}`;
}

function Spells(c, cls, d, set) {
  const cast = cls?.casting;
  const wantLevel1 = cast ? (cast.book ?? cast.prepared ?? cast.known ?? 0) : 0;
  const fixed = d.extraSpells.filter(s => !s.from.startsWith('Iniciado'));
  const mi = magicInitiateFeat(c);

  const setMi = fn => set(() => {
    c.magicInitiate = { list: null, cantrips: [], level1: null, ...c.magicInitiate };
    fn(c.magicInitiate);
  });

  return html`
    ${cast ? html`<fieldset><legend>Sus números</legend>
      <p><b>Característica:</b> ${d.casting.abilityName} · <b>CD</b> ${d.casting.dc} ·${' '}
        <b>ataque de conjuro</b> ${signed(d.casting.attack)} ·${' '}
        <b>espacios de nivel 1:</b> ${d.casting.slots}</p>
      ${cast.note ? html`<div class="notice">${cast.note}</div>` : null}
    </fieldset>` : null}
    ${cast?.cantrips > 0 ? html`<fieldset><legend>Trucos</legend>
      <${Counter} n=${(c.spells?.cantrips || []).length} max=${cast.cantrips} noun="trucos" />
      <${SpellPicks} list=${spellList(c.class, 0)} chosen=${c.spells.cantrips} max=${cast.cantrips}
        onToggle=${en => set(() => toggleIn(c.spells.cantrips, en, cast.cantrips))} />
    </fieldset>` : null}
    ${wantLevel1 > 0 ? html`<fieldset><legend>${cast.book ? `Conjuros del libro (${cast.book})`
        : cast.known != null ? `Conjuros conocidos (${cast.known})`
        : `Conjuros preparados (${cast.prepared})`}</legend>
      <${Counter} n=${(c.spells?.level1 || []).length} max=${wantLevel1} noun="conjuros" />
      <${SpellPicks} list=${spellList(c.class, 1)} chosen=${c.spells.level1} max=${wantLevel1}
        onToggle=${en => set(() => toggleIn(c.spells.level1, en, wantLevel1))} />
    </fieldset>` : null}
    ${fixed.length ? html`<fieldset><legend>Conjuros que ya trae</legend>
      ${fixed.map((src, i) => html`<p key=${i}><b>${src.from}:</b> ${
        [...src.cantrips, ...src.level1].map(en => spellByEn(en)?.es || en).join(', ')}</p>`)}
      <p class="muted" style="font-size:.88em">No gastan espacios de conjuro.</p>
    </fieldset>` : null}
    ${mi ? html`<fieldset><legend>Iniciado en la magia</legend>
      <p class="muted">Dos trucos y un conjuro de nivel 1 de una lista. El de nivel 1 se lanza
        una vez por descanso largo sin gastar espacio.</p>
      <div class="opts">${Object.entries(MAGIC_INITIATE_LISTS).map(([key, v]) => html`
        <label class="opt" key=${key}>
          <input type="radio" name="crear-mi-list" checked=${mi.list === key}
            onChange=${() => setMi(m => { m.list = key; m.cantrips = []; m.level1 = null; })} />
          <span><b>${v.es}</b> <span class="muted">— lanza con ${byKey(ABILITIES, v.ability).es}</span></span>
        </label>`)}</div>
      ${mi.list ? html`
        <h4>Dos trucos</h4>
        <${Counter} n=${(mi.cantrips || []).length} max=${2} noun="trucos" />
        <${SpellPicks} list=${spellList(mi.list, 0)} chosen=${mi.cantrips || []} max=${2}
          onToggle=${en => setMi(m => toggleIn(m.cantrips, en, 2))} />
        <h4>Un conjuro de nivel 1</h4>
        <div class="opts">${spellList(mi.list, 1).map(sp => html`
          <label class="opt" key=${sp.en}>
            <input type="radio" name="crear-mi-l1" checked=${mi.level1 === sp.en}
              onChange=${() => setMi(m => { m.level1 = sp.en; })} />
            <span><b>${sp.es}</b> <span class="muted" style="font-size:.85em">(${sp.en})</span>
              <br /><span style="font-size:.9em">${sp.sum}</span></span>
          </label>`)}</div>` : null}
    </fieldset>` : null}`;
}

function Equipment(c, cls, bg, d, set) {
  const kit = loadout(c);
  const a = armor(kit.armor);
  const packs = (table, field) => html`<div class="opts">${Object.entries(table).map(([key, p]) => {
    const sub = [...p.items, p.gp ? `${p.gp} po` : ''].filter(Boolean).join(' · ');
    const detail = sub && sub !== p.label ? sub : 'Solo el oro: tú eliges qué comprar con él.';
    return html`<label class="opt" key=${key}>
      <input type="radio" name=${'crear-' + field} checked=${c[field] === key}
        onChange=${() => set(() => { c[field] = key; })} />
      <span><b>${p.label || key}</b><br />
        <span class="muted" style="font-size:.88em">${detail}</span></span>
    </label>`;
  })}</div>`;

  return html`
    <fieldset><legend>Paquete de ${cls.es}</legend>${packs(cls.equipment, 'equipmentClass')}</fieldset>
    <fieldset><legend>Paquete de ${bg.es}</legend>${packs(bg.equipment, 'equipmentBackground')}</fieldset>
    <fieldset><legend>Lo que sale de ahí</legend>
      <p><b>Armadura:</b> ${a.es}${kit.shield ? ' + escudo' : ''} → <b>CA ${d.ca}</b></p>
      <p><b>Armas:</b> ${kit.weapons.map(w => weapon(w).es).join(', ') || '—'}</p>
      <p><b>Monedas:</b> ${kit.gp} po</p>
    </fieldset>`;
}
