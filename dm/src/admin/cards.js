/* The card: one creature, everything the DM does to it.

   Players and monsters share it, because a handle (shared/handles.js) makes
   them the same shape — the only differences are the ones the rules actually
   have: a player makes death saves at 0 and can be benched, a monster simply
   goes down and can be deleted.

   The grammar boxes are UNCONTROLLED on purpose (`defaultValue`, committed on
   change or Enter). Making them controlled re-renders the input under the
   caret while somebody is typing into it, which is unusable at a table. */

/** @import { Session, Character } from '../shared/types.js' */

import { html } from '../html.js';
import { state, commit, update, flash, urlFor } from './store.js';
import { applyDelta, applyGoldDelta, poolsOf, spend } from '../shared/play.js';
import { currentHP, playOf, handleFor } from '../shared/handles.js';
import { CONDITIONS, CONDITION } from '../shared/conditions.js';
import { heldObjects, effectLines, modSummary } from '../shared/objects.js';
import { portraitSrc } from '../shared/projection.js';
import { hitDice, levelOf, MAX_LEVEL } from '../rules/levels.js';
import { openLevelUp, levelSummary } from './subir.js';

/** @typedef {import('../shared/handles.js').Handle} Handle */

/* ------------------------------------------------------------- the box
   `7` `-7` damage · `+3` heal · `t5` temporary · `=11` set the total. */

const HELP = '7 quita · +3 cura · t5 pone temporales · =11 deja el total en 11';

/** @param {{cb: Handle}} props */
function DamageBox({ cb }) {
  const apply = (/** @type {Event} */ e) => {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const raw = input.value;
    if (!raw.trim()) return;
    let ok = false;
    commit(`${raw} a ${cb.name}`, s => {
      const fresh = handleIn(s.session, cb.ref);
      ok = !!fresh && applyDelta(fresh, raw);
    });
    if (!ok) flash(`No entiendo «${raw}». ${HELP}.`);
    input.value = '';
  };
  return html`<input class="dmg" type="text" inputmode="text" autocomplete="off"
    placeholder="7 · +3 · t5 · =11" title=${HELP}
    onChange=${apply}
    onKeyDown=${(/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Enter') /** @type {HTMLInputElement} */ (e.currentTarget).blur();
    }} />`;
}

/** Re-find a creature inside the session being mutated. A handle that a render
    closed over points into the session as it was BEFORE the commit cloned it,
    so every mutation looks its target up again. */
const handleIn = (/** @type {Session} */ session, /** @type {string} */ ref) =>
  handleFor(session, ref);

/* ------------------------------------------------------------- the card */

/** @param {{cb: Handle, open: boolean}} props */
export function Card({ cb, open }) {
  const hp = currentHP(cb);
  const max = Math.max(0, cb.hpMax || 0);
  const broken = cb.broken.length > 0;
  const down = hp <= 0 && !broken;
  const picked = state.ui.picked.has(cb.ref);

  return html`<article class=${'card' + (down ? ' down' : '') + (picked ? ' picked' : '')}>
    <header>
      <label class="pick" title="Marcar para repartir daño a varios">
        <input type="checkbox" checked=${picked}
          onChange=${() => update(s => {
            if (s.ui.picked.has(cb.ref)) s.ui.picked.delete(cb.ref);
            else s.ui.picked.add(cb.ref);
          })} />
      </label>
      ${cb.portrait && html`<img class="face" src=${urlFor(portraitSrc(cb.portrait)) || ''} alt="" />`}
      <div class="who">
        <b class="dsp">${cb.name}</b>
        <span class="sub">${cb.sub}</span>
      </div>
      <button class="link more" onClick=${() => update(s => {
        if (s.ui.openRows.has(cb.ref)) s.ui.openRows.delete(cb.ref);
        else s.ui.openRows.add(cb.ref);
      })}>${open ? 'menos' : 'más'}</button>
    </header>

    ${broken
      ? html`<p class="warn">Ficha incompleta: ${cb.broken.map(b => b.text).join(' ')}</p>`
      : html`<${Vitals} cb=${cb} hp=${hp} max=${max} />`}

    ${open && html`<${Details} cb=${cb} />`}
  </article>`;
}

/** @param {{cb: Handle, hp: number, max: number}} props */
function Vitals({ cb, hp, max }) {
  const p = cb.play;
  return html`<div class="vitals">
    <div class="hp">
      <span class="num ${hp === 0 ? 'zero' : ''}">${hp}</span>
      <span class="of">/ ${max}</span>
      ${p.temp > 0 && html`<span class="temp" title="Puntos de golpe temporales">+${p.temp}</span>`}
    </div>
    <div class="stats">
      <span title="Clase de armadura">CA ${cb.ac ?? '—'}</span>
      <span title="Modificador de iniciativa">Ini ${signed(cb.initMod)}</span>
      ${cb.pp != null && html`<span title="Percepción pasiva">PP ${cb.pp}</span>`}
      ${cb.speed != null && html`<span title="Velocidad">${cb.speed} m</span>`}
    </div>
    <${DamageBox} cb=${cb} />
    <div class="quick">
      <button title="Un punto menos" onClick=${() => tick(cb, '1')}>−1</button>
      <button title="Un punto más" onClick=${() => tick(cb, '+1')}>+1</button>
    </div>
  </div>`;
}

const signed = (/** @type {number|null} */ n) =>
  (n == null ? '—' : n >= 0 ? `+${n}` : String(n));

/** @param {Handle} cb @param {string} raw */
function tick(cb, raw) {
  commit(`${raw} a ${cb.name}`, s => {
    const fresh = handleIn(s.session, cb.ref);
    if (fresh) applyDelta(fresh, raw);
  });
}

/** @param {{cb: Handle}} props */
function Details({ cb }) {
  const p = cb.play;
  const isPC = cb.kind === 'pc';
  return html`<div class="details">
    <${Conditions} cb=${cb} />
    <${Exhaustion} cb=${cb} />
    ${isPC && currentHP(cb) <= 0 && html`<${DeathSaves} cb=${cb} />`}
    ${isPC && html`<${Levels} cb=${cb} />`}
    ${isPC && html`<${Pools} cb=${cb} />`}
    ${isPC && html`<${Purse} cb=${cb} />`}
    <${Held} cb=${cb} />
    <label class="note">
      <span>Nota</span>
      <textarea rows="2" defaultValue=${p.note}
        onChange=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLTextAreaElement} */ (e.currentTarget).value;
          commit(`nota de ${cb.name}`, s => {
            const t = target(s.session, cb);
            if (t) t.note = v;
          });
        }}></textarea>
    </label>
  </div>`;
}

/** The play object inside the session currently being mutated. */
function target(/** @type {Session} */ session, /** @type {Handle} */ cb) {
  return cb.kind === 'pc'
    ? playOf(session, cb.id)
    : session.npcs.find((/** @type {any} */ n) => n.id === cb.id) || null;
}

/** @param {{cb: Handle}} props */
function Conditions({ cb }) {
  const on = new Set(cb.play.conditions);
  return html`<div class="conds">
    ${CONDITIONS.filter(c => !c.exh).map(c => html`<button
      key=${c.key}
      class=${'cond' + (on.has(c.key) ? ' on' : '') + (c.mark ? ' mark' : '')}
      title=${c.d}
      onClick=${() => commit(`${c.es} · ${cb.name}`, s => {
        const t = target(s.session, cb);
        if (!t) return;
        t.conditions = on.has(c.key)
          ? t.conditions.filter((/** @type {string} */ k) => k !== c.key)
          : [...t.conditions, c.key];
      })}
      onContextMenu=${(/** @type {Event} */ e) => {
        e.preventDefault();
        update(s => { s.ui.condFor = s.ui.condFor === c.key ? null : c.key; });
      }}>${c.es}</button>`)}
    ${state.ui.condFor && html`<p class="cond-text">
      <b>${CONDITION(state.ui.condFor)?.es}:</b> ${CONDITION(state.ui.condFor)?.d}
    </p>`}
  </div>`;
}

/** @param {{cb: Handle}} props */
function Exhaustion({ cb }) {
  const n = cb.play.exh;
  return html`<div class="exh">
    <span>Agotamiento</span>
    ${[1, 2, 3, 4, 5, 6].map(i => html`<button
      key=${i} class=${'pip' + (i <= n ? ' on' : '')}
      title=${`Nivel ${i}: −${i * 2} a las tiradas d20`}
      onClick=${() => commit(`agotamiento ${i === n ? i - 1 : i} · ${cb.name}`, s => {
        const t = target(s.session, cb);
        if (t) t.exh = i === n ? i - 1 : i;
      })}>${i}</button>`)}
    ${n >= 6 && html`<b class="warn">muere</b>`}
  </div>`;
}

/** @param {{cb: Handle}} props */
function DeathSaves({ cb }) {
  const d = cb.play.death;
  const row = (/** @type {'ok'|'fail'} */ which, /** @type {string} */ label) => html`
    <div class="row">
      <span>${label}</span>
      ${[1, 2, 3].map(i => html`<button key=${i}
        class=${'pip' + (i <= d[which] ? ' on ' + which : '')}
        onClick=${() => commit(`salvación de muerte · ${cb.name}`, s => {
          const t = target(s.session, cb);
          if (t) t.death = { ...t.death, [which]: i === d[which] ? i - 1 : i };
        })}></button>`)}
    </div>`;
  return html`<div class="death">
    ${row('ok', 'Éxitos')}
    ${row('fail', 'Fallos')}
    ${d.fail >= 3 && html`<b class="warn">muerto</b>`}
    ${d.ok >= 3 && html`<b class="ok">estable</b>`}
  </div>`;
}

/** What the levels taken add up to: the subclass, the hit dice, and every
    feature the DM wrote down on the way up — which is all this app claims to
    know about class features. @param {{cb: Handle}} props */
function Levels({ cb }) {
  if (cb.kind !== 'pc') return null;
  const c = cb.char;
  const level = levelOf(c);
  const sum = levelSummary(c);
  return html`<div class="levels">
    <div class="row">
      <span class="fine">
        Nivel ${level} · ${hitDice(c.class, level)}
        ${sum.subclass ? ` · ${sum.subclass}` : ''}
        ${sum.nextASI ? ` · mejora en el ${sum.nextASI}` : ''}
      </span>
      ${level < MAX_LEVEL && html`<button class="link" onClick=${() => openLevelUp(c)}>
        subir de nivel
      </button>`}
    </div>
    ${sum.features.map(f => html`<p class="feat" key=${f.id}>
      <b>${f.name}</b> <small class="fine">nivel ${f.level}</small>
      ${f.desc ? html`<span> — ${f.desc}</span>` : null}
    </p>`)}
  </div>`;
}

/** @param {{cb: Handle}} props */
function Pools({ cb }) {
  if (cb.kind !== 'pc') return null;
  const pools = poolsOf(state.session, cb.char);
  if (!pools.length) return null;
  return html`<div class="pools">
    ${pools.map(pool => html`<div class="pool" key=${pool.key}>
      <span class="label" title=${pool.per === 'corto'
        ? 'Vuelve con un descanso corto' : 'Vuelve con un descanso largo'}>${pool.label}</span>
      ${Array.from({ length: pool.max }, (_, i) => html`<button
        key=${i} class=${'pip' + (i < pool.spent ? ' spent' : '')}
        title=${i < pool.spent ? 'Gastado — toca para devolverlo' : 'Toca para gastarlo'}
        onClick=${() => commit(`${pool.label} · ${cb.name}`, s => {
          const play = playOf(s.session, cb.id);
          spend(play, pool, i < pool.spent ? -1 : 1);
        })}></button>`)}
    </div>`)}
  </div>`;
}

/** @param {{cb: Handle}} props */
function Purse({ cb }) {
  const p = cb.play;
  return html`<div class="purse">
    <label>
      <span>Oro</span>
      <b>${p.gold}</b>
      <input class="gold" type="text" autocomplete="off" placeholder="+10 · -3 · =0"
        onChange=${(/** @type {Event} */ e) => {
          const input = /** @type {HTMLInputElement} */ (e.currentTarget);
          const raw = input.value;
          if (!raw.trim()) return;
          let ok = false;
          commit(`oro de ${cb.name}`, s => {
            const t = target(s.session, cb);
            ok = !!t && applyGoldDelta(t, raw);
          });
          if (!ok) flash(`No entiendo «${raw}». Prueba +10, -3 o =0.`);
          input.value = '';
        }} />
    </label>
    <label class="inv">
      <span>Inventario</span>
      <textarea rows="2" defaultValue=${p.inventory}
        onChange=${(/** @type {Event} */ e) => {
          const v = /** @type {HTMLTextAreaElement} */ (e.currentTarget).value;
          commit(`inventario de ${cb.name}`, s => {
            const t = target(s.session, cb);
            if (t) t.inventory = v;
          });
        }}></textarea>
    </label>
  </div>`;
}

/** @param {{cb: Handle}} props */
function Held({ cb }) {
  const catalog = state.session.objects;
  const held = heldObjects(catalog, cb.play.objects);
  const effects = effectLines(catalog, cb.play.objects);
  if (!held.length) return null;
  return html`<div class="held">
    ${held.map(({ obj, count }) => html`<span class="item" key=${obj.id} title=${obj.description}>
      ${obj.name}${count > 1 ? ` ×${count}` : ''}
      ${modSummary(obj.mods) && html`<small> ${modSummary(obj.mods)}</small>`}
    </span>`)}
    ${effects.map(e => html`<p class="effect" key=${e}>${e}</p>`)}
  </div>`;
}

/* ------------------------------------------------------- several at once
   Tick a few cards, then one box does all of them as ONE undo step — an area
   attack is one thing that happened, not five. */

/** @param {{refs: string[]}} props */
export function BatchBox({ refs }) {
  if (!refs.length) return null;
  const apply = (/** @type {string} */ raw, /** @type {boolean} */ half) => {
    if (!raw.trim()) return;
    let bad = false;
    commit(`${raw}${half ? ' (mitad)' : ''} a ${refs.length}`, s => {
      for (const ref of refs) {
        const cb = handleIn(s.session, ref);
        if (!cb) continue;
        const value = half ? halve(raw) : raw;
        if (!applyDelta(cb, value)) bad = true;
      }
    });
    if (bad) flash(`No entiendo «${raw}». ${HELP}.`);
  };
  /** Half, floored — the saving-throw half, which is the only reason this
      button exists. `t` and `=` are not halved: they are not quantities of
      damage. */
  const halve = (/** @type {string} */ raw) => {
    const s = raw.trim().toLowerCase();
    const m = s.match(/^([+-]?)(\d+)$/);
    if (!m) return s;
    return `${m[1]}${Math.floor(Number(m[2]) / 2)}`;
  };

  let value = '';
  return html`<div class="batch">
    <b>${refs.length} marcados</b>
    <input type="text" autocomplete="off" placeholder="7 · +3 · t5"
      onInput=${(/** @type {Event} */ e) => {
        value = /** @type {HTMLInputElement} */ (e.currentTarget).value;
      }} />
    <button class="primary" onClick=${() => apply(value, false)}>Aplicar</button>
    <button onClick=${() => apply(value, true)} title="La mitad, redondeando hacia abajo">Mitad</button>
    <button class="link" onClick=${() => update(s => s.ui.picked.clear())}>quitar marcas</button>
  </div>`;
}

/** The hit dice line a card shows when it is worth showing: a level above 1.
    @param {Character} c @param {number} level */
export const diceLine = (c, level) => (level > 1 ? hitDice(c.class, level) : '');
