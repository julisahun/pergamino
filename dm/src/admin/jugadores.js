/* Jugadores — the party out of combat.

   `players/*.json` IS the party: there is no import step for a campaign that
   already has files, and no roster to maintain. Dropping a sheet on the window
   merges it by character id, which is what makes a player re-sending their
   file after levelling up a non-event: the wounds stay, and a maximum that
   dropped clamps them.

   A sheet is built in the creator, never here. This app reads sheets and runs
   a table with them. */

/** @import { Character } from '../shared/types.js' */

import { html } from '../html.js';
import { state, commit, update, flash, wrote, saveEntity, saveSession } from './store.js';
import { Card, BatchBox } from './cards.js';
import { partyHandles, pcMaxHP, clearStatCache } from '../shared/handles.js';
import { normalisePlay } from '../shared/session.js';
import { shortRest, longRest } from '../shared/play.js';
import { normalise } from '../rules/character.js';
import { layerPath } from '../shared/runs.js';
import { LevelUp } from './subir.js';

export function Jugadores() {
  const party = partyHandles(state.session);
  const benched = new Set(state.session.field.benched);
  const picked = [...state.ui.picked].filter(r => r.startsWith('pc:'));

  return html`<section class="tab">
    <div class="bar">
      <h2 class="dsp">Jugadores <small>${party.length}</small></h2>
      <button onClick=${pickSheets}>Importar ficha…</button>
      <button onClick=${() => commit('descanso corto', s => shortRest(s.session))}
        title="Devuelve las ranuras de pacto y los recursos de descanso corto">
        Descanso corto
      </button>
      <button class="primary" onClick=${() => commit('descanso largo', s => longRest(s.session))}
        title="PG al máximo, sin temporales ni estados, un nivel de agotamiento menos, todo repuesto">
        Descanso largo
      </button>
    </div>

    ${!party.length && html`<p class="empty">
      Nadie todavía. La carpeta <code>${layerPath(state.run, 'run', 'players/')}</code>
      es la mesa: arrastra aquí las fichas que exportó el creador, o cópialas dentro.
    </p>`}

    <${BatchBox} refs=${picked} />

    <div class="cards">
      ${party.filter(cb => !benched.has(cb.ref)).map(cb => html`
        <div class="slot" key=${cb.ref}>
          <${Card} cb=${cb} open=${state.ui.openRows.has(cb.ref)} />
          <button class="link bench" onClick=${() => bench(cb.ref, true)}
            title="Fuera del tablero sin tocar la ficha">al banquillo</button>
        </div>`)}
    </div>

    ${state.ui.modal === 'levelup' && html`<${LevelUp} />`}

    ${benched.size > 0 && html`<div class="benched">
      <h3 class="dsp">En el banquillo</h3>
      ${party.filter(cb => benched.has(cb.ref)).map(cb => html`
        <div class="row" key=${cb.ref}>
          <span>${cb.name}</span>
          <button class="link" onClick=${() => bench(cb.ref, false)}>volver</button>
        </div>`)}
    </div>`}
  </section>`;
}

/** Off the board on purpose, without touching the sheet. The only off-board
    state a player has — a monster taken off the board is simply deleted.
    @param {string} ref @param {boolean} on */
function bench(ref, on) {
  commit(on ? 'al banquillo' : 'de vuelta al tablero', s => {
    const f = s.session.field;
    f.benched = on ? [...new Set([...f.benched, ref])] : f.benched.filter(r => r !== ref);
    if (on) delete f.tokens[ref];
  });
}

/* --------------------------------------------------------------- import */

async function pickSheets() {
  /** @type {any} */
  const w = window;
  if (!w.showOpenFilePicker) return;
  let handles;
  try {
    handles = await w.showOpenFilePicker({
      multiple: true,
      types: [{ description: 'Fichas', accept: { 'application/json': ['.json'] } }],
    });
  } catch { return; /* cancelled */ }
  for (const h of handles) await absorbFile(await h.getFile());
}

/** One dropped or picked `.json`. @param {File} file */
export async function absorbFile(file) {
  let raw;
  try { raw = JSON.parse(await file.text()); } catch {
    flash(`${file.name} no es un JSON que pueda leer.`);
    return;
  }
  const character = raw?.character || raw;
  if (!character || typeof character !== 'object' || !character.class) {
    flash(`${file.name} no parece una ficha de personaje.`);
    return;
  }
  absorbCharacter(normalise(character));
}

/**
 * A sheet joins the party, or replaces the one with its id. Wounds survive:
 * the only thing a re-import may do to play state is clamp hit points that no
 * longer fit under a lowered maximum.
 * @param {Character} c
 */
export function absorbCharacter(c) {
  /** @type {string} */
  let rel = '';
  commit(`ficha de ${c.name || 'alguien'}`, s => {
    const session = s.session;
    const at = session.party.findIndex(x => x.id === c.id);
    if (at >= 0) session.party[at] = c;
    else session.party.push(c);
    if (!session.play[c.id]) session.play[c.id] = normalisePlay(null);
    clearStatCache();
    const p = session.play[c.id];
    if (p.hp != null) p.hp = Math.min(p.hp, pcMaxHP(session, c));

    /* A member keeps the path it arrived on: renaming a character does not
       move their file. The party is always this mesa's, so there is no layer
       to ask about. */
    rel = session.playerFiles[c.id]
      || layerPath(state.run, 'run', `players/${slugify(c.name) || c.id}.json`);
    session.playerFiles[c.id] = rel;
  });
  /* Written back in the creator's own envelope, so the file stays a file the
     player can open in the creator again. */
  saveEntity(rel, { kind: 'dnd-creator-character', version: 2, character: c });
  saveSession();
  wrote(c.name || 'La ficha', rel);
}

export const slugify = (/** @type {string} */ s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
