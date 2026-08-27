/* The bus between the two windows.

   The television is a second window on the same machine and the same origin,
   so the two talk over a BroadcastChannel: no server, no relay, no room codes,
   no network hop, and — the part that matters — no campaign byte leaving the
   browser. The old app's SSE relay, board endpoint, move endpoint and
   ephemeral asset cache all collapse into this file.

   Four messages, and that is the whole protocol:

     hello    tv → admin   "I am here, send me everything"
     state    admin → tv   the projection, plus the folder handle to read
                           pictures and sound out of
     move     tv → admin   a token was dragged (the one thing that flows back)
     trouble  tv → admin   "I cannot read that folder" — said out loud rather
                           than degrading into a silent fallback

   A BroadcastChannel only delivers to channels that already exist, so a
   television that opens (or reloads) mid-session would otherwise sit waiting
   for the next change: `hello` is what makes a late window catch up, and it is
   the direct replacement for the relay's `hello` snapshot. */

/** @import { Projection, Ref } from './types.js' */

export const CHANNEL = 'dnd-dm';

/** @typedef {{kind: 'hello', from: string}} HelloMsg */
/** @typedef {{kind: 'state', from: string, projection: Projection,
                root: FileSystemDirectoryHandle|null, rootName: string|null}} StateMsg */
/** @typedef {{kind: 'move', from: string, ref: Ref, x: number, y: number}} MoveMsg */
/** @typedef {{kind: 'trouble', from: string, what: string}} TroubleMsg */
/** @typedef {HelloMsg|StateMsg|MoveMsg|TroubleMsg} Msg */

/** Who this window is. Messages come back to every OTHER channel object, never
    to the one that sent them, but a window may hold more than one — and a
    stamped message is one you can reason about in a log. */
export const ME = Math.random().toString(36).slice(2, 8) + Date.now().toString(36);

export class Bus {
  /** @param {Partial<Record<Msg['kind'], (msg: any) => void>>} handlers */
  constructor(handlers = {}) {
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.addEventListener('message', e => {
      const msg = /** @type {Msg|null} */ (e.data);
      if (!msg || typeof msg !== 'object' || msg.from === ME) return;
      handlers[msg.kind]?.(msg);
    });
  }

  /** @param {Omit<HelloMsg, 'from'>|Omit<StateMsg, 'from'>|Omit<MoveMsg, 'from'>|Omit<TroubleMsg, 'from'>} msg */
  send(msg) {
    try {
      this.channel.postMessage({ ...msg, from: ME });
    } catch (e) {
      /* A message that will not clone is a bug in what was put on the bus, not
         a runtime condition to survive quietly. */
      console.error('bus: no se pudo enviar', msg.kind, e);
    }
  }

  close() {
    this.channel.close();
  }
}
