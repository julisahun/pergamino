/* Subir de nivel — the wizard, which asks only what the new level introduces.

   Never about species, never about background, never about the point buy:
   those are level-1 facts, they are in the file the player exported, and a
   wizard that re-asked them would be a second character creator. What a level
   brings is a handful of things, and `levelBrings()` says which:

     hit points   the fixed average, or the number that was rolled
     an increase  at 4th, 8th, … (and 6th and 14th for a fighter)
     a subclass   at 3rd
     slots        recomputed from the tables, never typed
     features     FREE TEXT, because the alternative is transcribing twelve
                  classes of the SRD and being wrong about it within a year

   The features the DM writes here are what the card shows. That is the whole
   contract, and it is why this file is short. */

/** @import { Character, LevelUp } from '../shared/types.js' */

import { html } from '../html.js';
import { state, commit, update } from './store.js';
import { levelOf, levelBrings, averageHitPoints, asiLevels, slotsAt,
         SUBCLASS_LEVEL, MAX_LEVEL } from '../rules/levels.js';
import { ABILITIES, CLASSES } from '../rules/data.js';
import { clearStatCache, pcHandle } from '../shared/handles.js';
import { absorbCharacter } from './jugadores.js';
import { newId } from '../rules/character.js';

/** @param {Character} c */
export function openLevelUp(c) {
  const to = levelOf(c) + 1;
  if (to > MAX_LEVEL) return;
  update(s => {
    s.ui.modal = 'levelup';
    s.ui.levelDraft = {
      id: c.id,
      /** @type {LevelUp} */
      entry: {
        level: to,
        hp: averageHitPoints(c.class),
        asi: {},
        subclass: '',
        features: [],
      },
    };
  });
}

export function LevelUp() {
  const draft = state.ui.levelDraft;
  if (!draft) return null;
  const c = state.session.party.find(x => x.id === draft.id);
  if (!c) return null;

  const to = draft.entry.level;
  const brings = levelBrings(c.class, to);
  const cls = CLASSES[c.class ?? ''];
  const set = (/** @type {(e: LevelUp) => void} */ fn) =>
    update(s => { fn(s.ui.levelDraft.entry); });
  const asiSpent = Object.values(draft.entry.asi).reduce((a, b) => a + Number(b || 0), 0);

  return html`<div class="scrim" onClick=${close}>
    <div class="modal" onClick=${(/** @type {Event} */ e) => e.stopPropagation()}>
      <h3 class="dsp">${c.name} sube a nivel ${to}</h3>
      <p class="fine">
        ${cls?.es ?? 'Sin clase'} ${to}
        ${brings.proficiencyBonus ? ` · el bono de competencia sube a +${brings.proficiencyBonus}` : ''}
      </p>

      <label class="f">
        <span>
          Puntos de golpe que gana
          <small class="fine">la media fija es ${averageHitPoints(c.class)}; si tiró, escribe lo que sacó</small>
        </span>
        <input type="number" min="1" defaultValue=${draft.entry.hp}
          onChange=${(/** @type {Event} */ e) => {
            const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
            set(entry => { entry.hp = Math.max(1, v || 1); });
          }} />
      </label>

      ${brings.subclass && html`<label class="f">
        <span>Subclase <small class="fine">se elige a nivel ${SUBCLASS_LEVEL}</small></span>
        <input placeholder="Colegio del Saber" defaultValue=${draft.entry.subclass}
          onChange=${(/** @type {Event} */ e) => {
            const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
            set(entry => { entry.subclass = v; });
          }} />
      </label>`}

      ${brings.asi && html`<div class="f">
        <span>
          Mejora de característica
          <small class="fine">reparte 2 puntos — o coge una dote y escríbela abajo</small>
        </span>
        <div class="grid2">
          ${ABILITIES.map(a => html`<label class="asi" key=${a.key}>
            <span>${a.key}</span>
            <input type="number" min="0" max="2" defaultValue=${draft.entry.asi[a.key] ?? 0}
              onChange=${(/** @type {Event} */ e) => {
                const v = Number(/** @type {HTMLInputElement} */ (e.currentTarget).value);
                set(entry => {
                  if (v > 0) entry.asi[a.key] = Math.min(2, v);
                  else delete entry.asi[a.key];
                });
              }} />
          </label>`)}
        </div>
        ${asiSpent !== 2 && html`<p class="fine">
          ${asiSpent} de 2 repartidos${asiSpent > 2 ? ' — te has pasado' : ''}.
        </p>`}
      </div>`}

      ${brings.slots.length > 0 && html`<p class="fine slots">
        Ranuras: ${brings.slots.map(sl => sl.from === 0
          ? `nivel ${sl.level} nuevas (${sl.to})`
          : `nivel ${sl.level} sube a ${sl.to}`).join(' · ')}.
        Se calculan solas — no hay nada que escribir.
      </p>`}

      <h4>Lo que gana <small class="fine">con tus palabras: es lo que verá la ficha</small></h4>
      ${draft.entry.features.map((/** @type {any} */ f, /** @type {number} */ i) => html`
        <div class="ability" key=${f.id}>
          <input placeholder="Nombre" defaultValue=${f.name}
            onChange=${(/** @type {Event} */ e) => {
              const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
              set(entry => { entry.features[i].name = v; });
            }} />
          <input placeholder="Qué hace, en una línea" defaultValue=${f.desc}
            onChange=${(/** @type {Event} */ e) => {
              const v = /** @type {HTMLInputElement} */ (e.currentTarget).value;
              set(entry => { entry.features[i].desc = v; });
            }} />
          <button class="link" onClick=${() =>
            set(entry => { entry.features.splice(i, 1); })}>quitar</button>
        </div>`)}
      <button onClick=${() => set(entry => {
        entry.features.push({ id: newId(), name: '', desc: '' });
      })}>+ rasgo</button>

      <div class="modal-foot">
        <button class="link" onClick=${close}>Cancelar</button>
        <button class="primary" onClick=${apply}>Subir a nivel ${to}</button>
      </div>
    </div>
  </div>`;
}

const close = () => update(s => { s.ui.modal = null; s.ui.levelDraft = null; });

/** The level is appended to the sheet and the sheet is written back to its own
    file — the same path it arrived on, in the same envelope the creator reads.
    A player who levels up here and re-exports from the creator later gets their
    level-1 recipe refreshed without losing the levels: that is what
    absorbCharacter's merge is for. */
function apply() {
  const draft = state.ui.levelDraft;
  if (!draft) return;
  const c = state.session.party.find(x => x.id === draft.id);
  if (!c) return;
  const entry = {
    ...draft.entry,
    features: draft.entry.features.filter((/** @type {any} */ f) => f.name || f.desc),
  };
  const levelled = {
    ...structuredClone(c),
    levels: [...(c.levels || []), entry],
    updatedAt: Date.now(),
  };
  clearStatCache();
  absorbCharacter(levelled);
  close();
}

/** What a card shows about the levels taken: the subclass once it exists, and
    every feature the DM wrote, in the order they were gained.
    @param {Character} c */
export function levelSummary(c) {
  const levels = c.levels || [];
  return {
    subclass: levels.map(l => l.subclass).filter(Boolean).pop() || '',
    features: levels.flatMap(l => (l.features || []).map(f => ({ ...f, level: l.level }))),
    slots: slotsAt(c.class, levelOf(c)),
    nextASI: asiLevels(c.class).find(l => l > levelOf(c)) ?? null,
  };
}
