/* Jugadores — the party out of combat: who is hurt, who is conditioned, and
   every number a DM looks up without asking the player to read their own
   sheet aloud. Importing a .json here also writes it to players/ — the
   folder IS the party now, and so does building one in the editor
   (crear.js), which writes the same envelope the creator exports. */

import { html } from './html.js';
import { state, commit, flash, saveEntity } from './store.js';
import { screens } from './app.js';
import { CbCard, PickBar } from './cards.js';
import { absorbCharacter } from './party.js';
import { normalise } from '../rules/character.js';
import { normaliseSession } from '../shared/session.js';
import { partyHandles, clearStatCache } from '../shared/handles.js';
import { longRest, seatAll } from '../shared/combat.js';
import { slugify } from '../shared/util.js';

/* The editor is a whole screen's worth of rules UI that most sessions never
   open — it loads on the click, not at boot. */
const openEditor = id => import('./crear.js').then(m => m.openCharacterEditor(id));

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
      const result = absorbCharacter(c, 'importar');
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
      <button class="primary" title="Construye una ficha de nivel 1 aquí mismo, con las mismas reglas que el creador"
        onClick=${() => openEditor(null)}>+ Nueva ficha</button>
      <button class="ghost" onClick=${pickCharacterFiles}>Importar</button>
      ${party.length ? html`<button class="ghost" onClick=${() => {
        commit('descanso largo', s => longRest(s.session));
        flash('Descanso largo: PG al máximo, estados fuera, un nivel de agotamiento menos.');
      }}>Descanso largo</button>` : null}
    </div>
    ${party.length
      ? html`<div class="board">${party.map(cb =>
          html`<${CbCard} cb=${cb} key=${cb.ref}
            opts=${{ bench: true, onEdit: () => openEditor(cb.id) }} />`)}</div>`
      : html`<div class="drop" onClick=${pickCharacterFiles}>
          <b>Arrastra aquí las fichas de tus jugadores</b>
          Los <code>.json</code> que exporta el creador de personajes. También puedes${' '}
          <button class="link">elegir los archivos</button>${' '}o${' '}
          <button class="link" onClick=${e => { e.stopPropagation(); openEditor(null); }}>construir
            una aquí mismo</button>.
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
