/**
 * The shape a session starts from.
 *
 * This file used to load, migrate and persist `runs/<mesa>/session.json`.
 * Live state lives on the server now and the folder holds none of it, so what
 * is left is the empty state — which the server, the console's projections
 * and the tests all have to agree on.
 */
import type { Field, LiveState, SessionState } from '../types.ts'
import { SESSION_VERSION } from '../types.ts'

export function emptyLiveState(hp: number | null = null): LiveState {
  return {
    hp,
    temp: 0,
    conditions: [],
    exh: 0,
    death: { ok: 0, fail: 0 },
    note: '',
    gold: 0,
    inventory: '',
    objects: [],
    spent: {},
  }
}

export function emptyField(): Field {
  return {
    mode: 'escena',
    hud: true,
    paused: false,
    cols: 24,
    rows: 14,
    sceneId: null,
    map: null,
    audio: null,
    tokens: {},
    reveal: {},
    handout: null,
  }
}

export function emptySession(): SessionState {
  return {
    version: SESSION_VERSION,
    play: {},
    objects: {},
    npcs: [],
    encounter: { on: false, round: 1, activeRef: null, members: [], init: {} },
    field: emptyField(),
    log: [],
  }
}
