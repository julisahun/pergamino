/**
 * Load, migrate and persist `runs/<mesa>/session.json`.
 *
 * The file on disk is the vault's own v2/v3 schema; we extend it to v4 with
 * `field.handout` and `log`, and normalise `field.reveal` keys to `Ref`s (v3
 * keys them by bare NPC id while `field.tokens` uses `npc:<id>`). v5 repoints
 * each seated NPC's `file` from `monsters/*.json` at its note.
 *
 * `field.fog`, `field.templates` and `field.benched` were v4 fields too. The
 * tools that wrote them are gone — and `benched` never had one, being the
 * durable «off the table» list that «at the table means having a ficha» made
 * unnecessary — so they are simply not read: an older file keeps them until
 * the next write, and `session.json.bak` keeps the original either way.
 */
import type {
  Field,
  LiveState,
  Npc,
  ObjectState,
  Ref,
  RevealState,
  SessionState,
} from '../types.ts'
import { SESSION_VERSION } from '../types.ts'
import { PNJ_DIR } from './pnj.ts'
import { exists, readJson, type VaultDir, type WritableVaultDir } from './source.ts'

export const SESSION_FILE = 'session.json'
export const SESSION_BACKUP = 'session.json.bak'

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
    playerFiles: {},
    npcs: [],
    encounter: { on: false, round: 1, activeRef: null, members: [], init: {} },
    field: emptyField(),
    log: [],
  }
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

function mergeLiveState(raw: unknown, hpFallback: number | null = null): LiveState {
  const d = asRecord(raw)
  const base = emptyLiveState(hpFallback)
  const death = asRecord(d.death)
  return {
    hp: typeof d.hp === 'number' ? d.hp : d.hp === null ? null : base.hp,
    temp: num(d.temp, 0),
    conditions: Array.isArray(d.conditions) ? (d.conditions as string[]) : [],
    exh: num(d.exh, 0),
    death: { ok: num(death.ok, 0), fail: num(death.fail, 0) },
    note: typeof d.note === 'string' ? d.note : '',
    gold: num(d.gold, 0),
    inventory: typeof d.inventory === 'string' ? d.inventory : '',
    objects: Array.isArray(d.objects) ? (d.objects as string[]) : [],
    spent: asRecord(d.spent) as Record<string, number>,
  }
}

/**
 * v3 keys `field.reveal` by bare NPC id; v4 keys it by `Ref` to match
 * `field.tokens`. Anything already prefixed is left alone.
 */
export function normaliseReveal(raw: unknown, npcIds: Set<string>): Record<string, RevealState> {
  const out: Record<string, RevealState> = {}
  for (const [key, value] of Object.entries(asRecord(raw))) {
    const d = asRecord(value)
    const state: RevealState = {
      on: d.on === true,
      hp: d.hp === 'bar' || d.hp === 'exact' ? d.hp : 'none',
    }
    if (key.startsWith('pc:') || key.startsWith('npc:')) {
      out[key] = state
    } else if (npcIds.has(key)) {
      out[`npc:${key}`] = state
    } else {
      // Unknown bare id — keep it namespaced rather than dropping the DM's setting.
      out[`npc:${key}`] = state
    }
  }
  return out
}

function migrateField(raw: unknown, npcIds: Set<string>): Field {
  const d = asRecord(raw)
  const base = emptyField()
  const handout = asRecord(d.handout)
  const audio = asRecord(d.audio)
  return {
    mode: d.mode === 'tablero' ? 'tablero' : 'escena',
    hud: d.hud === undefined ? base.hud : d.hud === true,
    paused: d.paused === true,
    cols: num(d.cols, base.cols),
    rows: num(d.rows, base.rows),
    sceneId: typeof d.sceneId === 'string' ? d.sceneId : null,
    map: typeof (d.map as Record<string, unknown>)?.src === 'string'
      ? { src: (d.map as { src: string }).src }
      : null,
    audio: typeof audio.src === 'string'
      ? {
          src: audio.src,
          volume: num(audio.volume, 0.6),
          loop: audio.loop !== false,
          playing: audio.playing === true,
        }
      : null,
    tokens: asRecord(d.tokens) as Field['tokens'],
    reveal: normaliseReveal(d.reveal, npcIds),
    handout:
      typeof handout.src === 'string'
        ? {
            kind: handout.kind === 'pdf' ? 'pdf' : 'image',
            src: handout.src,
            ...(typeof handout.page === 'number' ? { page: handout.page } : {}),
          }
        : null,
  }
}

/**
 * A seated NPC remembers where it came from. v4 files say `monsters/vann.json`;
 * the bestiary and the cast are one folder of notes now, so the same PNJ lives
 * at `pnj/vann.md`. Rewriting the pointer keeps a run that is mid-session
 * resolving its portraits and its prep note after the migration.
 *
 * `prefix` is the campaign's own place in the vault, because `Pnj.file` is a
 * vault-relative note path — the key it has in `NotesIndex` — and these two
 * have to be the same string for the lookup to hit.
 */
const migrateNpcFile = (file: string, prefix: string): string => {
  const m = /^monsters\/([^/]+)\.json$/.exec(file)
  if (!m) return file
  const rel = `${PNJ_DIR}/${m[1]}.md`
  return prefix ? `${prefix}/${rel}` : rel
}

/** Migrate any on-disk version (2 to 5) to the in-memory v5 shape. */
export function migrate(raw: unknown, prefix = ''): SessionState {
  const d = asRecord(raw)
  const npcsRaw = Array.isArray(d.npcs) ? d.npcs : []
  const npcs: Npc[] = npcsRaw.map((entry) => {
    const n = asRecord(entry)
    const hpMax = num(n.hpMax, 1)
    return {
      id: String(n.id ?? ''),
      name: typeof n.name === 'string' ? n.name : '',
      tag: typeof n.tag === 'string' ? n.tag : null,
      ac: num(n.ac, 10),
      hpMax,
      initMod: num(n.initMod, 0),
      speed: typeof n.speed === 'number' ? n.speed : null,
      portrait: (n.portrait as Npc['portrait']) ?? null,
      abilities: Array.isArray(n.abilities) ? (n.abilities as Npc['abilities']) : [],
      file: typeof n.file === 'string' ? migrateNpcFile(n.file, prefix) : '',
      ...mergeLiveState(n, hpMax),
    }
  })
  const npcIds = new Set(npcs.map((n) => n.id))

  const play: Record<string, LiveState> = {}
  for (const [pcId, value] of Object.entries(asRecord(d.play))) {
    play[pcId] = mergeLiveState(value)
  }

  const enc = asRecord(d.encounter)
  return {
    version: SESSION_VERSION,
    play,
    objects: asRecord(d.objects) as Record<string, ObjectState>,
    playerFiles: asRecord(d.playerFiles) as Record<string, string>,
    npcs,
    encounter: {
      on: enc.on === true,
      round: num(enc.round, 1),
      activeRef: typeof enc.activeRef === 'string' ? (enc.activeRef as Ref) : null,
      members: Array.isArray(enc.members) ? (enc.members as Ref[]) : [],
      init: asRecord(enc.init) as Record<string, number>,
    },
    field: migrateField(d.field, npcIds),
    log: Array.isArray(d.log) ? (d.log as SessionState['log']) : [],
  }
}

export interface LoadResult {
  state: SessionState
  /** The version found on disk, or null when the file did not exist. */
  fromVersion: number | null
}

/**
 * Read `runs/<mesa>/session.json`. The directory is a plain `VaultDir`: a
 * load can never become a save.
 */
export async function loadSession(runDir: VaultDir, prefix = ''): Promise<LoadResult> {
  const raw = (await readJson(runDir, SESSION_FILE)) as Record<string, unknown> | null
  if (raw === null) return { state: emptySession(), fromVersion: null }
  const fromVersion = typeof raw.version === 'number' ? raw.version : null
  return { state: migrate(raw, prefix), fromVersion }
}

/**
 * Persist the session. The first time we rewrite a pre-v5 file we keep the
 * original alongside it as `session.json.bak`.
 *
 * The old node version wrote a `.tmp` and renamed it. There is no rename in
 * the File System Access API, and none is needed: `createWritable()` buffers
 * into a swap file the browser only commits on close, which is the same
 * guarantee by a different route.
 */
export async function saveSession(
  runDir: WritableVaultDir,
  state: SessionState,
  opts: { backup?: boolean } = {},
): Promise<void> {
  if (opts.backup && !(await exists(runDir, SESSION_BACKUP))) {
    const current = await runDir.file(SESSION_FILE)
    if (current) await runDir.write(SESSION_BACKUP, await current.text())
  }
  await runDir.write(SESSION_FILE, `${JSON.stringify(state, null, 2)}\n`)
}
