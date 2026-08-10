/* The combatant card — the one component. Players and monsters differ only
   in what the expanded panel holds and in whether death saves can appear.
   Ported from the legacy cbCard() family; the markup and class names are
   the old ones so the extracted stylesheet keeps working. */

import { html } from './html.js';
import { state, commit, update, flash, saveEntity } from './store.js';
import { signed } from '../rules/engine.js';
import { SPECIES, CLASSES, BACKGROUNDS, ORIGIN_FEATS, FIGHTING_STYLES,
         DIVINE_ORDERS, PRIMAL_ORDERS } from '../rules/data.js';
import { CONDITIONS, CONDITION } from '../shared/conditions.js';
import { normaliseReveal } from '../shared/session.js';
import { applyDelta, applyGoldDelta } from '../shared/combat.js';
import { handleFor, npcById, currentHP } from '../shared/handles.js';
import { normaliseBeast, absorbBeast } from '../shared/beasts.js';
import { heldObjects, effectLines, modSummary } from '../shared/objects.js';
import { openObjectPicker, removeObjectFrom } from './objetos.js';
import { portraitSrc } from '../shared/board.js';
import { metres, slugify } from '../shared/util.js';
import { urlFor } from './store.js';

/* ------------------------------------------------------------- portraits */

export function Portrait({ name, portrait, big, onPick }) {
  const src = portraitSrc(portrait, urlFor);
  const initials = String(name || '').trim().split(/\s+/).slice(0, 2)
    .map(w => w[0] || '').join('').toUpperCase();
  return html`<div class=${'portrait' + (big ? ' big' : '') + (onPick ? ' editable' : '')}
      role=${onPick ? 'button' : null} tabindex=${onPick ? 0 : null}
      title=${onPick ? 'Cambiar retrato' : null}
      onClick=${onPick ? () => pickPortrait(onPick) : null}>
    ${src ? html`<img src=${src} alt="" />` : html`<span class="ini">${initials}</span>`}
  </div>`;
}

/** Downscaled to 512 px and re-encoded as JPEG: a portrait is a thumbnail
    and a token icon, never a full-bleed image. `onReady` decides where the
    stamp lands — a wizard draft, an npc mid-combat. */
export function readPortrait(file, onReady) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(512, img.naturalWidth);
      const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      onReady(cv.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => flash('No pude leer esa imagen.');
    img.src = String(reader.result);
  };
  reader.onerror = () => flash('No se pudo leer el archivo.');
  reader.readAsDataURL(file);
}

function pickPortrait(onStamp) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (f) readPortrait(f, onStamp);
  };
  input.click();
}

/* ----------------------------------------------------------------- card */

export function CbCard({ cb, opts = {} }) {
  const p = cb.play;
  const max = Math.max(0, cb.hpMax || 0);
  const hp = currentHP(cb);
  const down = max > 0 && hp <= 0;
  const bloodied = !down && max > 0 && hp * 2 <= max;
  const pct = max ? Math.round(hp / max * 100) : 0;
  const tpct = max ? Math.min(100 - pct, Math.round((p.temp || 0) / max * 100)) : 0;
  const open = state.ui.openRows.has(cb.ref);
  const on = state.ui.picked.has(cb.ref);

  const cardState = cb.broken?.length ? 'ficha incompleta'
    : down ? (cb.kind === 'npc' ? 'fuera de combate'
      : p.death.fail >= 3 ? 'muerto' : p.death.ok >= 3 ? 'estable' : 'inconsciente')
    : bloodied ? 'malherido' : '';

  const toggleExpand = () => update(s => {
    s.ui.openRows.has(cb.ref) ? s.ui.openRows.delete(cb.ref) : s.ui.openRows.add(cb.ref);
  });
  const applyExpr = raw => {
    if (!String(raw).trim()) return;
    commit(`${raw} a ${cb.name}`, () => {
      const fresh = handleFor(state.session, cb.ref);
      if (!fresh || !applyDelta(fresh, raw)) flash('No entiendo eso. Prueba 7, +3, t5 o =11.');
    });
  };

  /* `bare` is for the muster, where the row above the card already is the
     head: drawing a second name, tick and caret inside it would read as two
     controls for one thing. */
  return html`<article class=${'cb ' + cb.kind + (down ? ' down' : '') + (bloodied ? ' bloodied' : '')
      + (opts.active ? ' active' : '') + (on ? ' picked' : '') + (opts.bare ? ' bare' : '')
      + (opts.compact ? ' compact' : '')} key=${cb.ref}>

    ${opts.bare ? null : html`<div class="head">
      <button class=${'tick' + (on ? ' on' : '')} aria-pressed=${on}
        title="Marcar para repartir el mismo daño"
        onClick=${() => update(s => {
          s.ui.picked.has(cb.ref) ? s.ui.picked.delete(cb.ref) : s.ui.picked.add(cb.ref);
        })}>${on ? '✓' : ''}</button>
      <div class="who" role="button" tabindex="0" aria-expanded=${open} onClick=${toggleExpand}>
        <${Portrait} name=${cb.name} portrait=${cb.portrait} />
        <div class="id">
          <b>${cb.name}</b>
          ${cb.sub ? html`<span class="sub">${cb.sub}</span>` : null}
        </div>
      </div>
      ${opts.editInit
        ? html`<div class="init"><input type="number" inputmode="numeric"
            defaultValue=${opts.init ?? ''} placeholder="—"
            aria-label=${'Iniciativa de ' + cb.name}
            onChange=${e => opts.onInit && opts.onInit(e.target.value)} /><small>iniciativa</small></div>`
        : html`<div class="init caret" onClick=${toggleExpand}>${open ? '▾' : '▸'}</div>`}
    </div>`}

    <div class="nums">
      <span title=${modTip(cb, 'ac')}>CA<b>${cb.ac ?? '—'}</b></span>
      <span title=${modTip(cb, 'initMod')}>Inic.<b>${signed(cb.initMod || 0)}</b></span>
      ${cb.pp != null ? html`<span title=${modTip(cb, 'pp')}>Perc.<b>${cb.pp}</b></span>` : null}
      ${cb.speed != null ? html`<span title=${modTip(cb, 'speed')}>Vel.<b>${metres(cb.speed)}</b></span>` : null}
      ${p.exh ? html`<span>Agot.<b>${p.exh}</b></span>` : null}
    </div>

    <div class="hp">
      <div class="bar"><i style=${'width:' + pct + '%'}></i>${tpct ? html`<u style=${'width:' + tpct + '%'}></u>` : null}</div>
      <div class="hpline">
        <span class="cur">${hp}</span><span class="max" title=${modTip(cb, 'hpMax')}>/ ${max} PG</span>
        ${p.temp ? html`<span class="tmp">+${p.temp} temp</span>` : null}
        ${cardState ? html`<span class="state">${cardState}</span>` : null}
      </div>
      <div class="dmg">
        <button title="1 de daño" onClick=${() => applyExpr('1')}>−</button>
        <input placeholder="7 · +3 · t5 · =11" autocomplete="off"
          aria-label=${'Daño o curación para ' + cb.name}
          onChange=${e => { applyExpr(e.target.value); e.target.value = ''; }} />
        <button title="1 de curación" onClick=${() => applyExpr('+1')}>+</button>
        <button class="qhelp" title="¿Qué se puede escribir aquí?"
          aria-expanded=${state.ui.dmgHelp === cb.ref}
          onClick=${() => update(s => {
            s.ui.dmgHelp = s.ui.dmgHelp === cb.ref ? null : cb.ref;
          })}>?</button>
      </div>
      ${state.ui.dmgHelp === cb.ref ? html`<p class="dmghelp">
        <b>7</b> hace daño · <b>+3</b> cura · <b>t5</b> da PG temporales · <b>=11</b> deja los PG en 11.
      </p>` : null}
    </div>

    <${ChipRow} cb=${cb} />
    <${FxLine} cb=${cb} />
    ${cb.kind === 'npc' ? html`<${RevealRow} cb=${cb} />` : null}
    ${opts.bench && cb.kind === 'pc' ? html`<${BenchRow} cb=${cb} onEdit=${opts.onEdit} />` : null}
    ${down && cb.kind === 'pc' ? html`<${DeathRow} cb=${cb} />` : null}
    ${opts.bare
      ? html`<div class="more"><button class="small ghost" aria-expanded=${open}
          onClick=${toggleExpand}>${open ? '▾ cerrar' : '▸'} ${
          cb.kind === 'npc' ? 'editar la ficha' : 'ver la ficha'}</button></div>`
      : null}
    ${open ? html`<div class="detail">${cb.kind === 'pc'
      ? html`<${PcDetail} cb=${cb} />` : html`<${NpcDetail} cb=${cb} />`}</div>` : null}
  </article>`;
}

/* -------------------------------------------------------------- objects */

/** The number in the strip is already adjusted — this only answers "why is
    it 17" on hover, where an object is part of the answer. */
function modTip(cb, key) {
  const m = cb.mods?.[key];
  return m ? `incluye ${signed(m)} por objetos` : null;
}

/** The carried effects, on the card face: mid-combat is exactly when
    "ventaja en sigilo" must not live behind a caret. */
function FxLine({ cb }) {
  const fx = effectLines(state.session.objects, cb.play.objects);
  return fx.length ? html`<div class="fxline">✦ ${fx.join(' · ')}</div>` : null;
}

/** The carried objects, in the expanded panel — players and npcs alike. */
function ObjectsBlock({ cb }) {
  const held = heldObjects(state.session.objects, cb.play.objects);
  return html`<div class=${cb.kind === 'npc' ? 'wide' : null}><h4>Objetos</h4>
    ${held.map(({ obj, count }) => {
      const sum = modSummary(obj.mods);
      return html`<div class="objrow" key=${obj.id}>
        <span><b>${obj.name}</b>${count > 1 ? ` ×${count}` : ''}${
          sum ? html`<span class="muted"> · ${sum}</span>` : null}</span>
        <button class="small ghost" onClick=${() => removeObjectFrom(cb.ref, obj.id)}>Quitar</button>
      </div>`;
    })}
    <div class="objadd">
      ${held.length ? null : html`<span class="muted" style="font-size:.84rem">Nada encima.</span>`}
      <button class="small ghost" onClick=${() => openObjectPicker(cb.ref)}>+ Añadir objeto</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ condition */

function ChipRow({ cb }) {
  const p = cb.play;
  const openHere = state.ui.condFor === cb.ref;
  const toggleCond = key => commit(`estado de ${cb.name}`, s => {
    const fresh = handleFor(s.session, cb.ref);
    if (!fresh) return;
    const list = fresh.play.conditions;
    const c = CONDITION(key);
    if (c?.exh) {
      /* Exhaustion counts 0-6 and clears itself past 6. */
      fresh.play.exh = (fresh.play.exh || 0) + 1;
      if (fresh.play.exh > 6) { fresh.play.exh = 0; }
      if (fresh.play.exh && !list.includes(key)) list.push(key);
      if (!fresh.play.exh) fresh.play.conditions = list.filter(k => k !== key);
    } else {
      fresh.play.conditions = list.includes(key) ? list.filter(k => k !== key) : [...list, key];
    }
    s.ui.condShown = key;
  });

  return html`<div class="chips">
    ${p.conditions.map(k => {
      const c = CONDITION(k);
      if (!c) return null;
      const lvl = c.exh && p.exh ? ' ' + p.exh : '';
      return html`<button class="chip on" key=${k}
        onClick=${() => update(s => { s.ui.condFor = cb.ref; s.ui.condShown = k; })}>${c.es}${lvl}</button>`;
    })}
    <button class="chip add" onClick=${() => update(s => {
      s.ui.condFor = openHere ? null : cb.ref; s.ui.condShown = null;
    })}>${openHere ? '× cerrar' : '+ estado'}</button>
  </div>
  ${openHere ? html`<div class="condbox">
    <div class="grid">${CONDITIONS.map(c => html`<button key=${c.key}
      class=${'chip' + (p.conditions.includes(c.key) ? ' on' : '')}
      onClick=${() => toggleCond(c.key)}>${c.es}</button>`)}</div>
    ${state.ui.condShown && CONDITION(state.ui.condShown)
      ? html`<p class="why"><b>${CONDITION(state.ui.condShown).es}.</b> ${CONDITION(state.ui.condShown).d}</p>`
      : html`<p class="why muted">Toca una para ponerla o quitarla; te recuerdo lo que hace.</p>`}
  </div>` : null}`;
}

/* --------------------------------------------------------------- reveal */

function RevealRow({ cb }) {
  const r = normaliseReveal(state.session.field.reveal[cb.id]);
  const modes = [['none', 'nada'], ['coarse', 'aproximada'], ['exact', 'exacta']];
  return html`<div class=${'reveal' + (r.on ? '' : ' off')}>
    <button class=${'small' + (r.on ? '' : ' ghost')}
      onClick=${() => commit(`revelar ${cb.name}`, s => {
        s.session.field.reveal[cb.id] = { ...r, on: !r.on };
      })}>${r.on ? '◉ en el tablero' : '○ oculto'}</button>
    <label>salud
      <select disabled=${!r.on} aria-label=${'Salud visible de ' + cb.name}
        onChange=${e => commit(`salud visible de ${cb.name}`, s => {
          s.session.field.reveal[cb.id] = { ...r, hp: e.target.value };
        })}>
        ${modes.map(([k, es]) => html`<option value=${k} selected=${r.hp === k}>${es}</option>`)}
      </select></label>
  </div>`;
}

/* ---------------------------------------------------------------- bench */

function BenchRow({ cb, onEdit }) {
  const benched = state.session.field.benched.includes(cb.ref);
  return html`<div class="benchrow">
    <button class="small ghost" onClick=${() => commit(`banquillo: ${cb.name}`, s => {
      const b = s.session.field.benched;
      if (benched) s.session.field.benched = b.filter(r => r !== cb.ref);
      else { b.push(cb.ref); delete s.session.field.tokens[cb.ref]; }
    })}>${benched ? 'Volver a la mesa' : 'Quitar de la mesa'}</button>
    ${onEdit ? html`<button class="small ghost"
      title="Cambiar la ficha — escribe en players/, igual que una importación"
      onClick=${onEdit}>Editar ficha</button>` : null}
    ${benched ? html`<span class="muted" style="font-size:.78rem">Fuera del tablero</span>` : null}
  </div>`;
}

/* ----------------------------------------------------------- death saves */

function DeathRow({ cb }) {
  const d = cb.play.death;
  const pips = (kind, n, mark) => html`<span class="pips">${[1, 2, 3].map(i =>
    html`<button class=${'pip ' + kind + (i <= n ? ' on' : '')} key=${kind + i}
      aria-label=${(kind === 'ok' ? 'Éxitos ' : 'Fallos ') + i}
      onClick=${() => commit(`salvación de muerte de ${cb.name}`, s => {
        const fresh = handleFor(s.session, cb.ref);
        if (fresh) fresh.play.death[kind] = fresh.play.death[kind] === i ? i - 1 : i;
      })}>${i <= n ? mark : ''}</button>`)}</span>`;

  const verdict = d.fail >= 3 ? 'muerto' : d.ok >= 3 ? 'estable' : '';
  return html`<div class="death">
    <span>Salvaciones de muerte</span>
    ${pips('ok', d.ok, '✓')}${pips('fail', d.fail, '✗')}
    ${verdict ? html`<span class="verdict">${verdict}</span>` : null}
  </div>`;
}

/* ----------------------------------------------------- multi-target box */

export function PickBar() {
  const picked = state.ui.picked;
  if (!picked.size) return null;
  const names = [...picked].map(r => handleFor(state.session, r)?.name).filter(Boolean);
  const apply = (input, half) => {
    const s = String(input.value).trim().toLowerCase().replace(/\s+/g, '');
    const m = s.match(/^(t|=|\+|-)?(\d+)$/);
    if (!m) { flash('No entiendo eso. Prueba 7, +3 o t5.'); return; }
    const n = half ? Math.floor(Number(m[2]) / 2) : Number(m[2]);
    const expression = (m[1] === '-' ? '' : (m[1] || '')) + n;
    const hit = [];
    commit(`${half ? 'mitad de ' : ''}${input.value} a ${picked.size}`, st => {
      for (const ref of picked) {
        const cb = handleFor(st.session, ref);
        if (cb && applyDelta(cb, expression)) hit.push(cb.name);
      }
    });
    input.value = '';
    flash(hit.length ? `${expression} → ${hit.join(', ')}.` : 'No se aplicó a nadie.');
  };
  return html`<div class="foot pickbar">
    <span class="who">${picked.size} marcado${picked.size === 1 ? '' : 's'}
      <span class="muted">${names.join(', ')}</span></span>
    <input placeholder="7 · +3 · t5" autocomplete="off"
      aria-label="Daño o curación para los marcados"
      onKeyDown=${e => { if (e.key === 'Enter') apply(e.target, false); }} />
    <button class="primary" onClick=${e => apply(e.target.parentElement.querySelector('input'), false)}>Aplicar</button>
    <button title="La mitad, para quien haya salvado"
      onClick=${e => apply(e.target.parentElement.querySelector('input'), true)}>Mitad</button>
    <button class="ghost" title="Quitar las marcas"
      onClick=${() => update(s => s.ui.picked.clear())}>✕</button>
  </div>`;
}

/* ------------------------------------------------------ expanded panels */

function PcDetail({ cb }) {
  const d = cb.d;
  const c = cb.char;
  const p = cb.play;
  const cls = CLASSES[c.class], bg = BACKGROUNDS[c.background];
  const spells = d.casting ? [...d.classSpells.cantrips, ...d.classSpells.level1] : [];

  return html`
    ${cb.broken.length ? html`<div class="notice warn"><b>Ficha incompleta:</b>
      ${' ' + cb.broken.map(n => n.text).join(' · ')}</div>` : null}

    <div><h4>Salvaciones</h4>
      <div class="abgrid">${d.saves.map(s => html`
        <div class=${'ab' + (s.prof ? ' prof' : '')} key=${s.key}>
          <span class="n">${s.es}</span>
          <span class="s">${d.scores[s.key]}</span>
          <span class="sv">salv. ${signed(s.total)}${s.prof ? ' ●' : ''}</span>
        </div>`)}</div></div>

    <div><h4>Habilidades · percepción pasiva ${d.passivePerception}</h4>
      <div class="skgrid">${d.skills.map(s => html`
        <div class=${s.prof ? 'prof' : ''} key=${s.key}>
          <span class="dot">${s.expertise ? '●●' : s.prof ? '●' : ''}</span>
          <span>${s.es}</span>
          <span class="mod">${signed(s.total)}</span>
        </div>`)}</div></div>

    <details class="abdetails">
      <summary>Habilidades y ataques</summary>
      ${d.attacks.length ? html`<div><h4>Ataques</h4><table class="vt">
        <thead><tr><th>Arma</th><th>Ataque</th><th>Daño</th><th>Notas</th></tr></thead><tbody>
        ${d.attacks.map((a, i) => html`<tr key=${i}><td>${a.name}</td><td class="c">${signed(a.attack)}</td>
          <td class="c">${a.damage}</td>
          <td>${a.props.join(', ')}${a.mastery ? html` · ${' '}<b>${a.mastery.es}</b>` : null}</td></tr>`)}
        </tbody></table></div>` : null}
      <div><h4>Rasgos y dotes</h4>${featuresFor(c, d)}</div>
    </details>

    ${d.casting ? html`<div><h4>Conjuros</h4>
      <p style="margin:0;font-size:.9rem">${d.casting.abilityName} ·${' '}
        CD <b>${d.casting.dc}</b> · ataque <b>${signed(d.casting.attack)}</b> ·
        espacios de nivel 1: <b>${d.casting.slots}</b></p>
      ${spells.length ? html`<table class="vt" style="margin-top:.3rem">
        <tbody>${spells.map(sp => html`<tr key=${sp.es}><td><b>${sp.es}</b></td><td>${sp.sum}</td></tr>`)}</tbody></table>` : null}
    </div>` : null}

    <div><h4>Competencias y equipo</h4>
      <div style="font-size:.86rem">
        <p style="margin:0 0 .3rem"><b>Armaduras:</b> ${d.proficiencies.armor.join(', ') || 'ninguna'} ·${' '}
          <b>Armas:</b> ${d.proficiencies.weapons.join(', ') || '—'} ·${' '}
          <b>Herramientas:</b> ${[cls?.tools, bg?.tool?.label, ...(c.featTools || [])]
            .filter(Boolean).join(', ') || '—'}</p>
        <p style="margin:0"><b>Equipo:</b> ${d.loadout.items.join(' · ') || '—'} ·${' '}
          <b>${d.loadout.gp} po</b> de partida</p>
      </div></div>

    <div><h4>Bolsa</h4>
      <p style="margin:0 0 .3rem"><b>${p.gold} po</b> en mano
        <input placeholder="+50 · -12 · =200" style="margin-left:.5rem;width:8rem"
          aria-label=${'Oro ganado o gastado por ' + cb.name} autocomplete="off"
          onChange=${e => {
            const v = e.target.value;
            if (!v.trim()) return;
            commit(`oro de ${cb.name}`, s => {
              const fresh = handleFor(s.session, cb.ref);
              if (!fresh || !applyGoldDelta(fresh.play, v)) flash('No entiendo eso. Prueba +50, -12 o =200.');
            });
            e.target.value = '';
          }} /></p>
      <textarea rows="2" defaultValue=${p.inventory}
        placeholder="Lo que lleva encima, aparte del equipo de partida"
        onChange=${e => commit(`bolsa de ${cb.name}`, s => {
          const fresh = handleFor(s.session, cb.ref);
          if (fresh) fresh.play.inventory = e.target.value;
        })}></textarea>
    </div>

    <${ObjectsBlock} cb=${cb} />

    ${c.appearance || c.story?.personality ? html`<div><h4>Quién es</h4>
      <p style="margin:0;font-size:.88rem">${[c.appearance, c.story?.personality].filter(Boolean).join(' · ')}</p>
    </div>` : null}

    <div class="note"><h4>Notas de la sesión</h4>
      <textarea rows="2" defaultValue=${cb.play.note}
        placeholder="Lo que arrastra, lo que debe, lo que no sabe todavía"
        onChange=${e => commit(`nota de ${cb.name}`, s => {
          const fresh = handleFor(s.session, cb.ref);
          if (fresh) fresh.play.note = e.target.value;
        })}></textarea></div>`;
}

/** The creator's featuresHTML(), rewritten to take a character instead of
    reading the global the creator keeps. Same rows, same order. */
export function featuresFor(c, d) {
  const rows = [];
  const sp = SPECIES[c.species];
  const cls = CLASSES[c.class];
  if (sp) for (const t of sp.traits) rows.push([t.n, t.d]);
  const lineage = sp?.lineages?.[c.lineage];
  if (lineage) for (const t of (lineage.traits || [])) rows.push([t.n, t.d]);
  const CHOICE_TABLES = {
    fightingStyle: [FIGHTING_STYLES, 'Estilo de combate'],
    divineOrder:   [DIVINE_ORDERS,   'Orden divina'],
    primalOrder:   [PRIMAL_ORDERS,   'Orden primigenia'],
  };
  if (cls) for (const f of cls.features) {
    const table = f.choice && CHOICE_TABLES[f.choice];
    const chosen = f.choice && c[f.choice];
    if (table && chosen && table[0][chosen]) rows.push([`${table[1]}: ${table[0][chosen].es}`, table[0][chosen].d]);
    else rows.push([f.n, f.d]);
  }
  for (const f of d.hooks.feats) {
    const feat = ORIGIN_FEATS[f];
    if (feat) rows.push([`${feat.es} (dote de origen)`, feat.d]);
  }
  if (!rows.length) return html`<div class="muted">—</div>`;
  return rows.map(([n, dsc], i) => html`<div class="feat" key=${i}><b>${n}.</b> ${dsc}</div>`);
}

function NpcDetail({ cb }) {
  const n = cb.npc;
  const edit = (key, cast) => e => commit(`editar ${n.name}`, s => {
    const live = npcById(s.session, n.id);
    if (live) live[key] = cast ? cast(e.target.value) : e.target.value;
  });
  const num = v => Number(v) || 0;
  return html`<div class="mform">
    <div class="wide" style="display:flex;justify-content:center">
      <${Portrait} name=${n.name} portrait=${n.portrait} big
        onPick=${stamp => commit(`retrato de ${n.name}`, s => {
          const live = npcById(s.session, n.id);
          if (live) live.portrait = { src: null, stamp };
        })} /></div>
    <label class="wide">Nombre <input defaultValue=${n.name} onChange=${edit('name')} /></label>
    <label>CA <input type="number" inputmode="numeric" defaultValue=${n.ac} onChange=${edit('ac', num)} /></label>
    <label>PG máx <input type="number" inputmode="numeric" defaultValue=${n.hpMax}
      onChange=${edit('hpMax', v => Math.max(1, Number(v) || 1))} /></label>
    <label>Mod. inic. <input type="number" inputmode="numeric" defaultValue=${n.initMod} onChange=${edit('initMod', num)} /></label>
    <label class="wide">Notas
      <textarea rows="3" defaultValue=${n.note} onChange=${edit('note')}></textarea></label>
    ${n.abilities.length ? html`<details class="wide abdetails">
      <summary>Habilidades y ataques</summary>
      ${n.abilities.map(a => html`<div class="feat" key=${a.id}><b>${a.name}.</b> ${a.desc}</div>`)}
    </details>` : null}
    <${ObjectsBlock} cb=${cb} />
    <div class="acts">
      <button class="small ghost" onClick=${() => keepInBestiary(n.id)}>Guardar en los PNJ</button>
      <button class="small ghost" onClick=${() => commit(`quitar ${n.name}`, s => {
        s.session.npcs = s.session.npcs.filter(x => x.id !== n.id);
        delete s.session.field.tokens[cb.ref];
        delete s.session.field.reveal[n.id];
        s.session.encounter.members = s.session.encounter.members.filter(r => r !== cb.ref);
        delete s.session.encounter.init[cb.ref];
      })}>Quitar de la mesa</button>
    </div>
  </div>`;
}

/** A table npc promoted to a template: lands in the bestiary AND on disk,
    because the bestiary is monsters/*.json now — nothing exists only in
    memory. */
function keepInBestiary(npcId) {
  const n = npcById(state.session, npcId);
  if (!n) return;
  /* "Goblin 3" goes back to being "Goblin" — the instance number belongs to
     the table, not the template. */
  const entry = normaliseBeast({ ...n, id: undefined, name: n.name.replace(/\s\d+$/, ''), file: null });
  entry.file = 'monsters/' + slugify(entry.name) + '.json';
  update(s => absorbBeast(s.session.bestiary, entry));
  saveEntity(entry.file, entry);
  flash(`${entry.name} guardado en los PNJ.`);
}
