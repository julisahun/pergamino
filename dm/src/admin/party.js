/* The one door a character sheet comes through — a picked file, a drop, or
   the editor. It lives apart from jugadores.js on purpose: that module
   registers a screen and therefore reaches app.js (and, through it, main.js),
   so anything importing it inherits the boot cycle. This one only knows the
   store and the model. */

import { commit, saveEntity } from './store.js';
import { playOf, pcMaxHP, clearStatCache } from '../shared/handles.js';
import { seatAll } from '../shared/combat.js';
import { slugify } from '../shared/util.js';

/** A re-import must never cost the party its wounds — but a lowered max
    clamps what is left. New members start at full. */
export function mergeParty(s, c) {
  const at = s.session.party.findIndex(x => x.id === c.id);
  if (at >= 0) {
    s.session.party[at] = c;
    const p = playOf(s.session, c.id);
    const max = pcMaxHP(s.session, c);
    if (p.hp != null) p.hp = Math.min(p.hp, max);
    return 'updated';
  }
  s.session.party.push(c);
  playOf(s.session, c.id).hp = pcMaxHP(s.session, c);
  return 'added';
}

/**
 * Put a sheet in the party and on the disk. `verb` only names the undo step.
 * Returns 'added' or 'updated'.
 */
export function absorbCharacter(c, verb) {
  clearStatCache();
  let result;
  commit(`${verb} ${c.name || 'ficha'}`, s => {
    result = mergeParty(s, c);
    /* An existing member keeps the path it came in on — renaming someone
       must not orphan the file the party already lives in. */
    const rel = s.session.playerFiles[c.id] || ('players/' + (slugify(c.name || '') || c.id) + '.json');
    s.session.playerFiles[c.id] = rel;
    seatAll(s.session);
    /* The exact envelope the creator exports, so the file on disk stays
       interchangeable with the one the player sent. */
    saveEntity(rel, { kind: 'dnd-creator-character', version: 2, character: c });
  });
  return result;
}
