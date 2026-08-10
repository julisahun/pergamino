/* Jugadores — the party out of combat: who is hurt, who is conditioned, and
   every number a DM looks up without asking the player to read their own
   sheet aloud. Importing a .json here also writes it to players/ — the
   folder IS the party now. */

import { html } from './html.js';
import { state, commit, update, flash, saveEntity } from './store.js';
import { screens } from './app.js';
import { CbCard, PickBar } from './cards.js';
import { normalise } from '../rules/character.js';
import { normaliseSession } from '../shared/session.js';
import { partyHandles, playOf, stats, clearStatCache } from '../shared/handles.js';
import { longRest, seatAll } from '../shared/combat.js';
import { slugify } from '../shared/util.js';

/** A re-import must never cost the party its wounds — but a lowered max
    clamps what is left. New members start at full. */
function mergeParty(s, c) {
  const at = s.session.party.findIndex(x => x.id === c.id);
  if (at >= 0) {
    s.session.party[at] = c;
    const p = playOf(s.session, c.id);
    const max = stats(c).hp ?? 0;
    if (p.hp != null) p.hp = Math.min(p.hp, max);
    return 'updated';
  }
  s.session.party.push(c);
  playOf(s.session, c.id).hp = stats(c).hp ?? 0;
  return 'added';
}

export function importCharacterFiles(files) {
  for (const f of Array.from(files || [])) {
    if (!/\.json$/i.test(f.name)) continue;
    f.text().then(text => {
      let raw;
      try { raw = JSON.parse(text); } catch { flash(`${f.name} no es un JSON válido.`); return; }
      /* The same picker and the same drop target take a character export AND
         a whole mesa.json from the old file:// app — the envelope says which. */
      if (raw.kind === 'dnd-dm-session' || (raw.session && raw.session.party)) {
        importLegacySession(raw.session || raw);
        return;
      }
      const c = normalise(raw.character || raw);
      clearStatCache();
      let result;
      commit(`importar ${c.name || f.name}`, s => {
        result = mergeParty(s, c);
        const rel = s.session.playerFiles[c.id] || ('players/' + (slugify(c.name || '') || c.id) + '.json');
        s.session.playerFiles[c.id] = rel;
        seatAll(s.session);
        /* The exact envelope the creator exports, so the file on disk stays
           interchangeable with the one the player sent. */
        saveEntity(rel, { kind: 'dnd-creator-character', version: 2, character: c });
      });
      flash(`${result === 'updated' ? 'Actualizado' : 'Importado'}: ${c.name || 'sin nombre'}.`);
    }).catch(() => flash(`No se pudo leer ${f.name}.`));
  }
}

/** The rescue for a session the old file:// app exported: mesa.json carries
    the party and the bestiary inline, so everything in it can land in its
    own file — the shape this app keeps everything in anyway. The one thing
    that cannot survive is a map that lived as bytes in the old app's
    localStorage: its stamp points at storage this origin cannot read. */
function importLegacySession(rawSession) {
  const incoming = normaliseSession(rawSession);
  const droppedMap = incoming.field.map && !incoming.field.map.src;
  if (droppedMap) incoming.field.map = null;
  commit('importar mesa.json', s => {
    for (const c of incoming.party) {
      const rel = incoming.playerFiles[c.id] || ('players/' + (slugify(c.name || '') || c.id) + '.json');
      incoming.playerFiles[c.id] = rel;
      saveEntity(rel, { kind: 'dnd-creator-character', version: 2, character: c });
    }
    for (const b of incoming.bestiary) {
      if (!b.file) b.file = 'monsters/' + slugify(b.name) + '.json';
      saveEntity(b.file, b);
    }
    s.session = incoming;
    clearStatCache();
    seatAll(s.session);
    s.ui.tab = incoming.encounter.on ? 'juego' : 'jugadores';
  });
  flash('Sesión importada: grupo, PNJ y mesa restaurados.'
    + (droppedMap ? ' El mapa suelto no viaja en mesa.json — vuelve a soltar la imagen.' : ''));
}

function pickCharacterFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.multiple = true;
  input.onchange = () => importCharacterFiles(input.files);
  input.click();
}

function Jugadores() {
  const party = partyHandles(state.session);
  return html`<main><section class="panel wide">
    <div class="quickadd">
      <button class="ghost" onClick=${pickCharacterFiles}>Importar</button>
      ${party.length ? html`<button class="ghost" onClick=${() => {
        commit('descanso largo', s => longRest(s.session));
        flash('Descanso largo: PG al máximo, estados fuera, un nivel de agotamiento menos.');
      }}>Descanso largo</button>` : null}
    </div>
    ${party.length
      ? html`<div class="board">${party.map(cb => html`<${CbCard} cb=${cb} opts=${{ bench: true }} key=${cb.ref} />`)}</div>`
      : html`<div class="drop" onClick=${pickCharacterFiles}>
          <b>Arrastra aquí las fichas de tus jugadores</b>
          Los <code>.json</code> que exporta el creador de personajes. También puedes${' '}
          <button class="link">elegir los archivos</button>.
          <p class="muted" style="font-size:.85rem;margin:.8rem 0 0">
            Cada ficha trae sus propios números: PG, CA, iniciativa, percepción pasiva.
            Si un jugador cambia su ficha, vuelve a importarla y se actualiza sin perder
            los PG que lleve.</p>
        </div>`}
  </section></main>
  <${PickBar} />`;
}

screens.jugadores = Jugadores;

/* Dropping .json files anywhere on the page imports characters, whatever tab
   is open — same as the old app. Images are the map's business (juego.js). */
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files || [])].filter(f => /\.json$/i.test(f.name));
  if (files.length) importCharacterFiles(files);
});
