/**
 * Pure state transitions. Every mutation goes through here so that the log,
 * persistence and broadcast all hang off one place.
 *
 * Anything non-deterministic (ids, dice) is injected through `ReduceOpts` so
 * the reducer stays testable.
 */
import type { Action, AttackTarget } from '../actions.ts'
import type {
  Encounter,
  GameObject,
  LiveState,
  LogEntry,
  Npc,
  ObjectState,
  Ref,
  SessionState,
  Token,
} from '../types.ts'
import { makeRef, refId, refKind } from '../types.ts'
import type { Pnj } from '../types.ts'

export interface ReduceOpts {
  /** Display name of a PC, from its sheet — the log should read "El muro". */
  pcName?: (pcId: string) => string | undefined
  /** Max HP of a PC, from its sheet. Null when the sheet is missing. */
  pcMaxHp?: (pcId: string) => number | null
  /** Initiative modifier of a PC, from its sheet. */
  pcInitMod?: (pcId: string) => number | null
  /**
   * Armour class of a PC, from the line its sheet quotes.
   *
   * Only the bitácora reads it — the verdict on whether a swing landed is
   * settled in the console before it gets here, because the DM is the one who
   * knows about the Escudo that went up in response.
   */
  pcAc?: (pcId: string) => number | null
  /** Prep data, for instantiating pnjs into the session. */
  pnj?: (pnjId: string) => Pnj | undefined
  /** Prep data for magic items, so charges start from the right number. */
  object?: (objectId: string) => GameObject | undefined
  /** A scene's prepared roster, from `scenarios/*.json`. */
  scene?: (sceneId: string) => { roster: { pnjId: string; count: number }[] } | undefined
  newId?: () => string
}

export interface ReduceResult {
  state: SessionState
  log: Omit<LogEntry, 't'>[]
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const defaultId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

// --- reading and writing one combatant's live state ------------------------

export function liveOf(state: SessionState, ref: Ref): LiveState | undefined {
  return refKind(ref) === 'pc'
    ? state.play[refId(ref)]
    : state.npcs.find((n) => n.id === refId(ref))
}

export function nameOf(state: SessionState, ref: Ref, opts: ReduceOpts = {}): string {
  const id = refId(ref)
  if (refKind(ref) === 'npc') {
    return state.npcs.find((n) => n.id === id)?.name ?? id
  }
  return opts.pcName?.(id) ?? id
}

function maxHpOf(state: SessionState, ref: Ref, opts: ReduceOpts): number | null {
  if (refKind(ref) === 'npc') {
    return state.npcs.find((n) => n.id === refId(ref))?.hpMax ?? null
  }
  return opts.pcMaxHp?.(refId(ref)) ?? null
}

/** Apply `fn` to whichever collection holds `ref`. Returns the same state when absent. */
function withLive(
  state: SessionState,
  ref: Ref,
  fn: (live: LiveState) => LiveState,
): SessionState {
  const id = refId(ref)
  if (refKind(ref) === 'pc') {
    const current = state.play[id]
    if (!current) return state
    return { ...state, play: { ...state.play, [id]: fn(current) } }
  }
  let touched = false
  const npcs = state.npcs.map((npc) => {
    if (npc.id !== id) return npc
    touched = true
    return { ...npc, ...fn(npc) } as Npc
  })
  return touched ? { ...state, npcs } : state
}

/** Turn roster entries into live NPCs, numbered around whoever is already in. */
function instantiate(
  state: SessionState,
  entries: { pnjId: string; count: number }[],
  opts: ReduceOpts,
  newId: () => string,
): Npc[] {
  const taken = new Set(state.npcs.map((n) => n.name))
  const added: Npc[] = []
  for (const entry of entries) {
    const pnj = opts.pnj?.(entry.pnjId)
    // A PNJ with no hit points in its front matter is someone the party talks
    // to, not someone they fight. It has no place on the board.
    if (!pnj || pnj.hpMax === null) continue
    const hpMax = pnj.hpMax
    for (let i = 0; i < Math.max(1, entry.count); i++) {
      const name = nextName(taken, pnj.name)
      taken.add(name)
      const { lead: _lead, ...prep } = pnj
      added.push({
        ...prep,
        hpMax,
        id: newId(),
        name,
        hp: hpMax,
        temp: 0,
        conditions: [],
        exh: 0,
        death: { ok: 0, fail: 0 },
        note: '',
        gold: 0,
        inventory: '',
        objects: [],
        spent: {},
      })
    }
  }
  return added
}

/** Everyone currently carrying `objectId`. */
function holdersOf(state: SessionState, objectId: string): Ref[] {
  const out: Ref[] = []
  for (const [pcId, live] of Object.entries(state.play)) {
    if (live.objects.includes(objectId)) out.push(makeRef('pc', pcId))
  }
  for (const npc of state.npcs) {
    if (npc.objects.includes(objectId)) out.push(makeRef('npc', npc.id))
  }
  return out
}

const objectName = (objectId: string, opts: ReduceOpts): string =>
  opts.object?.(objectId)?.name ?? objectId

// --- naming ----------------------------------------------------------------

/**
 * `Bandido`, then `Bandido 1`, `Bandido 2` — the convention already used by
 * hand in `runs/guils/session.json`.
 */
export function nextName(taken: Set<string>, base: string): string {
  if (!taken.has(base)) return base
  for (let i = 1; ; i++) {
    const candidate = `${base} ${i}`
    if (!taken.has(candidate)) return candidate
  }
}

// --- initiative ------------------------------------------------------------

/** Highest first; ties break on the initiative modifier, then name, then ref. */
export function orderMembers(
  state: SessionState,
  members: Ref[],
  opts: ReduceOpts = {},
): Ref[] {
  const modOf = (ref: Ref): number => initModOf(state, ref, opts)
  return [...members].sort((a, b) => {
    const ia = state.encounter.init[a] ?? -Infinity
    const ib = state.encounter.init[b] ?? -Infinity
    if (ia !== ib) return ib - ia
    const ma = modOf(a)
    const mb = modOf(b)
    if (ma !== mb) return mb - ma
    const na = nameOf(state, a, opts)
    const nb = nameOf(state, b, opts)
    return na.localeCompare(nb, 'es') || a.localeCompare(b)
  })
}

/** Initiative modifier of any combatant: NPC stat block or PC sheet. */
/**
 * A ficha for each newly minted PNJ. Being in the session and being on the
 * board are the same thing — the rail lists whoever has a ficha — so anything
 * that instantiates a PNJ has to put it somewhere. Hiding one from the
 * players is the reveal toggle's job, not an absence of ficha.
 */
function withTokens(
  field: { tokens: Record<string, Token>; cols: number; rows: number },
  added: { id: string }[],
): Record<string, Token> {
  const tokens = { ...field.tokens }
  for (const npc of added) {
    const spot = freeSquare(tokens, field.cols, field.rows, true)
    if (spot) tokens[makeRef('npc', npc.id)] = spot
  }
  return tokens
}

/**
 * The first empty square, scanning in from one edge — PCs from the left and
 * PNJ from the right, so a roster dropped onto the board does not stack up in
 * one corner. Null when the board is full.
 */
function freeSquare(
  tokens: Record<string, Token>,
  cols: number,
  rows: number,
  fromRight: boolean,
): Token | null {
  const taken = new Set(Object.values(tokens).map((t) => `${t.x},${t.y}`))
  for (let i = 0; i < cols; i++) {
    const x = fromRight ? cols - 1 - i : i
    for (let y = 0; y < rows; y++) {
      if (!taken.has(`${x},${y}`)) return { x, y }
    }
  }
  return null
}

function initModOf(state: SessionState, ref: Ref, opts: ReduceOpts): number {
  return refKind(ref) === 'npc'
    ? (state.npcs.find((n) => n.id === refId(ref))?.initMod ?? 0)
    : (opts.pcInitMod?.(refId(ref)) ?? 0)
}

function advance(
  state: SessionState,
  delta: 1 | -1,
  opts: ReduceOpts,
): { encounter: Encounter; wrapped: boolean } {
  // Only whoever is seated. `token/remove` takes a member out of the list
  // itself now, but a run saved before it did can still carry someone whose
  // ficha left the board, and a turn on them is a turn neither screen shows.
  const seated = state.encounter.members.filter((ref) => state.field.tokens[ref])
  const order = orderMembers(state, seated, opts)
  if (order.length === 0) return { encounter: state.encounter, wrapped: false }
  const current = state.encounter.activeRef
  const at = current ? order.indexOf(current) : -1
  // No active combatant yet: step onto the first (or last, going backwards).
  const nextAt = at === -1 ? (delta === 1 ? 0 : order.length - 1) : at + delta
  const wrapped = nextAt >= order.length || nextAt < 0
  const index = ((nextAt % order.length) + order.length) % order.length
  const round = Math.max(1, state.encounter.round + (wrapped ? delta : 0))
  return {
    encounter: { ...state.encounter, activeRef: order[index]!, round },
    wrapped,
  }
}

// --- hit points ------------------------------------------------------------

/**
 * Hit points off, temporary ones absorbing first.
 *
 * Split out of `hp/damage` so `attack/resolve` cannot drift from it. What
 * comes back is the state, the hit points left, and the *consequences* — a PC
 * dropped to zero goes Inconsciente and the bitácora says so. The line that
 * says why the damage happened is the caller's, because a swing and a bare
 * number are the same event told differently.
 */
function takeDamage(
  state: SessionState,
  ref: Ref,
  amount: number,
  opts: ReduceOpts,
): { state: SessionState; hp: number; log: Omit<LogEntry, 't'>[] } | null {
  const live = liveOf(state, ref)
  if (!live || amount <= 0) return null
  const absorbed = Math.min(live.temp, amount)
  const before = live.hp ?? maxHpOf(state, ref, opts) ?? 0
  const after = Math.max(0, before - (amount - absorbed))
  let next = withLive(state, ref, (l) => ({ ...l, temp: l.temp - absorbed, hp: after }))
  const log: Omit<LogEntry, 't'>[] = []
  if (after === 0 && before > 0) {
    log.push({ kind: 'death', text: `${nameOf(state, ref, opts)} cae a 0 PG` })
    if (refKind(ref) === 'pc') {
      next = withLive(next, ref, (l) => ({
        ...l,
        conditions: l.conditions.includes('Inconsciente')
          ? l.conditions
          : [...l.conditions, 'Inconsciente'],
      }))
    }
  }
  return { state: next, hp: after, log }
}

/** Hit points back on, capped at the maximum. Coming off 0 ends the dying. */
function giveHealing(
  state: SessionState,
  ref: Ref,
  amount: number,
  opts: ReduceOpts,
): { state: SessionState; hp: number; gained: number } | null {
  const live = liveOf(state, ref)
  if (!live || amount <= 0) return null
  const max = maxHpOf(state, ref, opts)
  const before = live.hp ?? 0
  const after = max === null ? before + amount : Math.min(max, before + amount)
  return {
    state: withLive(state, ref, (l) => ({
      ...l,
      hp: after,
      death: before === 0 ? { ok: 0, fail: 0 } : l.death,
      conditions: before === 0 ? l.conditions.filter((c) => c !== 'Inconsciente') : l.conditions,
    })),
    hp: after,
    // What actually went on, not what was rolled: a 2d8 into someone one hit
    // point down heals one.
    gained: after - before,
  }
}

// --- what the bitácora is told about a swing -------------------------------

/** The AC an attack was up against, when anything states one. */
function acOf(state: SessionState, ref: Ref, opts: ReduceOpts): number | null {
  if (refKind(ref) === 'npc') return state.npcs.find((n) => n.id === refId(ref))?.ac ?? null
  return opts.pcAc?.(refId(ref)) ?? null
}

const signed = (n: number): string => (n < 0 ? `${n}` : `+${n}`)

/**
 * One line per target, misses included.
 *
 * A miss changes no hit points and so would leave no trace at all, which is
 * exactly why it is written down: read back after the session the bitácora is
 * the fight, and a fight is mostly people not connecting.
 */
function attackLine(
  state: SessionState,
  action: Extract<Action, { type: 'attack/resolve' }>,
  target: AttackTarget,
  hp: number | null,
  opts: ReduceOpts,
): string {
  const who = nameOf(state, action.ref, opts)
  const whom = nameOf(state, target.ref, opts)
  const left = hp === null ? '' : ` (${hp} PG)`

  if (action.kind === 'heal') {
    return `${who} cura a ${whom} con ${action.name}: ${target.amount}${left}`
  }

  if (action.kind === 'save') {
    const roll =
      target.save === null
        ? action.dc === null
          ? ''
          : `CD ${action.dc}`
        : `${target.save} vs CD ${action.dc ?? '—'}`
    // `hit` reads as "the save failed" here: the same field, the same meaning
    // — the action landed on this one.
    const verb = target.hit ? 'no salva contra' : 'salva contra'
    const effect = target.amount > 0 ? ` · ${target.amount}${left}` : ' · sin daño'
    return `${whom} ${verb} ${action.name}${roll ? `: ${roll}` : ''}${effect}`
  }

  const ac = acOf(state, target.ref, opts)
  const versus =
    target.roll === null
      ? ''
      : `${target.roll}${action.mod ? ` ${signed(action.mod)} = ${target.roll + action.mod}` : ''}${
          ac === null ? '' : ` vs CA ${ac}`
        }`
  if (!target.hit) {
    return `${who} falla contra ${whom} con ${action.name}${versus ? `: ${versus}` : ''}`
  }
  const crit = target.crit ? '¡CRÍTICO! ' : ''
  return `${who} golpea a ${whom} con ${action.name}: ${crit}${versus ? `${versus} · ` : ''}${
    target.amount
  }${left}`
}

// --- the reducer -----------------------------------------------------------

export function reduce(
  state: SessionState,
  action: Action,
  now: number,
  opts: ReduceOpts = {},
): ReduceResult {
  const log: Omit<LogEntry, 't'>[] = []
  const newId = opts.newId ?? defaultId
  let next: SessionState = state
  const field = { ...state.field }

  switch (action.type) {
    // --- escena ------------------------------------------------------------
    case 'scene/show': {
      if (field.sceneId === action.sceneId) return { state, log }
      field.sceneId = action.sceneId
      next = { ...state, field }
      log.push({ kind: 'scene', text: action.sceneId ?? '(sin escena)' })
      break
    }
    case 'field/mode':
      field.mode = action.mode
      next = { ...state, field }
      break
    case 'field/paused':
      field.paused = action.paused
      next = { ...state, field }
      break
    case 'field/hud':
      field.hud = action.hud
      next = { ...state, field }
      break
    case 'field/map':
      field.map = action.src ? { src: action.src } : null
      next = { ...state, field }
      break
    case 'audio/set':
      field.audio = action.audio
      next = { ...state, field }
      break
    case 'audio/volume':
      if (!field.audio) return { state, log }
      field.audio = { ...field.audio, volume: clamp01(action.volume) }
      next = { ...state, field }
      break
    case 'audio/playing':
      if (!field.audio) return { state, log }
      field.audio = { ...field.audio, playing: action.playing }
      next = { ...state, field }
      break
    case 'handout/show':
      field.handout = action.handout
      next = { ...state, field }
      break

    // --- revelado ----------------------------------------------------------
    case 'reveal/set': {
      const isPc = action.ref.startsWith('pc:')
      const current = field.reveal[action.ref] ?? {
        on: isPc,
        hp: isPc ? ('exact' as const) : ('none' as const),
        name: 'alias' as const,
      }
      field.reveal = {
        ...field.reveal,
        [action.ref]: {
          on: action.on ?? current.on,
          hp: action.hp ?? current.hp,
          name: action.name ?? current.name,
        },
      }
      next = { ...state, field }
      break
    }
    case 'reveal/all': {
      const reveal = { ...field.reveal }
      for (const npc of state.npcs) {
        const ref = makeRef('npc', npc.id)
        // Putting the board on screen is not the same as naming what is on
        // it: a masked PNJ stays masked through a `revelar todos`.
        reveal[ref] = {
          on: action.on,
          hp: reveal[ref]?.hp ?? 'none',
          name: reveal[ref]?.name ?? 'alias',
        }
      }
      field.reveal = reveal
      next = { ...state, field }
      break
    }

    // --- PNJ ---------------------------------------------------------------
    case 'npc/add': {
      const added = instantiate(state, [{ pnjId: action.pnjId, count: action.count }], opts, newId)
      if (added.length === 0) return { state, log }
      field.tokens = withTokens(field, added)
      next = { ...state, npcs: [...state.npcs, ...added], field }
      log.push({ kind: 'encounter', text: `Añadidos: ${added.map((n) => n.name).join(', ')}` })
      break
    }
    case 'roster/load': {
      const roster = opts.scene?.(action.sceneId)?.roster ?? []
      const added = instantiate(state, roster, opts, newId)
      if (added.length === 0) return { state, log }
      field.tokens = withTokens(field, added)
      next = { ...state, npcs: [...state.npcs, ...added], field }
      log.push({ kind: 'encounter', text: `Reparto cargado: ${added.map((n) => n.name).join(', ')}` })
      break
    }
    case 'npc/remove': {
      const ref = makeRef('npc', action.id)
      const npc = state.npcs.find((n) => n.id === action.id)
      if (!npc) return { state, log }
      const { [ref]: _t, ...tokens } = field.tokens
      const { [ref]: _r, ...reveal } = field.reveal
      field.tokens = tokens
      field.reveal = reveal
      const { [ref]: _i, ...init } = state.encounter.init
      next = {
        ...state,
        npcs: state.npcs.filter((n) => n.id !== action.id),
        field,
        encounter: {
          ...state.encounter,
          members: state.encounter.members.filter((m) => m !== ref),
          activeRef: state.encounter.activeRef === ref ? null : state.encounter.activeRef,
          init,
        },
      }
      break
    }
    case 'npc/rename':
      next = {
        ...state,
        npcs: state.npcs.map((n) =>
          n.id === action.id ? { ...n, name: action.name } : n,
        ),
      }
      break

    // --- estado vivo -------------------------------------------------------
    case 'hp/damage': {
      const hit = takeDamage(state, action.ref, action.amount, opts)
      if (!hit) return { state, log }
      next = hit.state
      log.push({
        kind: 'damage',
        text: `${nameOf(state, action.ref, opts)} recibe ${action.amount} (${hit.hp} PG)`,
      })
      log.push(...hit.log)
      break
    }
    case 'hp/heal': {
      const healed = giveHealing(state, action.ref, action.amount, opts)
      if (!healed) return { state, log }
      next = healed.state
      log.push({
        kind: 'heal',
        text: `${nameOf(state, action.ref, opts)} recupera ${healed.gained} (${healed.hp} PG)`,
      })
      break
    }
    case 'hp/set': {
      const max = maxHpOf(state, action.ref, opts)
      const hp = Math.max(0, max === null ? action.hp : Math.min(max, action.hp))
      next = withLive(state, action.ref, (l) => ({ ...l, hp }))
      break
    }
    case 'hp/temp':
      next = withLive(state, action.ref, (l) => ({ ...l, temp: Math.max(0, action.temp) }))
      break
    case 'hp/full': {
      const max = maxHpOf(state, action.ref, opts)
      if (max === null) return { state, log }
      next = withLive(state, action.ref, (l) => ({
        ...l,
        hp: max,
        temp: 0,
        death: { ok: 0, fail: 0 },
        conditions: l.conditions.filter((c) => c !== 'Inconsciente'),
      }))
      break
    }
    case 'condition/toggle':
      next = withLive(state, action.ref, (l) => ({
        ...l,
        conditions: l.conditions.includes(action.condition)
          ? l.conditions.filter((c) => c !== action.condition)
          : [...l.conditions, action.condition],
      }))
      break
    case 'condition/clear':
      next = withLive(state, action.ref, (l) => ({ ...l, conditions: [] }))
      break
    case 'exh/set':
      next = withLive(state, action.ref, (l) => ({
        ...l,
        exh: Math.max(0, Math.min(6, action.value)),
      }))
      break
    case 'death/mark': {
      const live = liveOf(state, action.ref)
      if (!live) return { state, log }
      const death = {
        ok: live.death.ok + (action.outcome === 'ok' ? 1 : 0),
        fail: live.death.fail + (action.outcome === 'fail' ? 1 : 0),
      }
      next = withLive(state, action.ref, (l) => ({ ...l, death }))
      if (death.fail >= 3) {
        log.push({ kind: 'death', text: `${nameOf(state, action.ref, opts)} muere` })
      } else if (death.ok >= 3) {
        log.push({ kind: 'death', text: `${nameOf(state, action.ref, opts)} se estabiliza` })
      }
      break
    }
    case 'death/reset':
      next = withLive(state, action.ref, (l) => ({ ...l, death: { ok: 0, fail: 0 } }))
      break
    case 'live/note':
      next = withLive(state, action.ref, (l) => ({ ...l, note: action.note }))
      break

    // --- combate -----------------------------------------------------------
    case 'encounter/start': {
      next = {
        ...state,
        encounter: {
          on: true,
          round: 1,
          activeRef: null,
          members: action.members,
          // What the DM read off the table, over whatever a previous fight
          // left behind. Nothing is rolled here.
          init: { ...state.encounter.init, ...(action.init ?? {}) },
        },
      }
      log.push({ kind: 'encounter', text: `Combate iniciado (${action.members.length})` })
      break
    }
    /**
     * A whole action, applied at once.
     *
     * The randomness happened in the console; what arrives is a list of
     * outcomes. Everything that touches hit points goes through the same two
     * helpers `hp/damage` and `hp/heal` use, so temporary hit points absorb
     * here too and a PC who drops still goes Inconsciente.
     */
    case 'attack/resolve': {
      const live = liveOf(state, action.ref)
      if (!live || action.targets.length === 0) return { state, log }
      next = state

      if (action.spend) {
        const { level } = action.spend
        next = withLive(next, action.ref, (l) => ({
          ...l,
          spent: { ...l.spent, [level]: (l.spent[level] ?? 0) + 1 },
        }))
        log.push({
          kind: 'attack',
          text: `${nameOf(state, action.ref, opts)} usa ${action.name} (espacio de nivel ${level})`,
        })
      }

      for (const target of action.targets) {
        // The line is written against `state`, not `next`: with two soldiers
        // caught in the same cone, the second one's name must not be looked up
        // in a state the first one already changed.
        // For a save the amount already accounts for the roll — `afterSave`
        // halved or zeroed it in the console — so a made save against Manos
        // Ardientes still takes its half. Only an attack roll can land on
        // nothing at all.
        const lands = action.kind === 'attack' ? target.hit : true
        if (!lands || target.amount <= 0) {
          log.push({ kind: 'attack', text: attackLine(state, action, target, null, opts) })
          continue
        }
        if (action.kind === 'heal') {
          const healed = giveHealing(next, target.ref, target.amount, opts)
          if (!healed) continue
          next = healed.state
          log.push({
            kind: 'attack',
            text: attackLine(state, action, { ...target, amount: healed.gained }, healed.hp, opts),
          })
          continue
        }
        const hit = takeDamage(next, target.ref, target.amount, opts)
        if (!hit) continue
        next = hit.state
        log.push({ kind: 'attack', text: attackLine(state, action, target, hit.hp, opts) })
        log.push(...hit.log)
      }
      break
    }
    case 'encounter/end':
      next = { ...state, encounter: { ...state.encounter, on: false, activeRef: null } }
      log.push({ kind: 'encounter', text: 'Combate terminado' })
      break
    case 'encounter/members':
      next = {
        ...state,
        encounter: {
          ...state.encounter,
          members: action.members,
          activeRef: action.members.includes(state.encounter.activeRef as Ref)
            ? state.encounter.activeRef
            : null,
        },
      }
      break
    case 'encounter/init':
      next = {
        ...state,
        encounter: {
          ...state.encounter,
          init: { ...state.encounter.init, [action.ref]: action.value },
        },
      }
      break
    case 'encounter/advance': {
      const { encounter, wrapped } = advance(state, action.delta, opts)
      if (encounter === state.encounter) return { state, log }
      next = { ...state, encounter }
      if (wrapped && action.delta === 1) {
        log.push({ kind: 'encounter', text: `Ronda ${encounter.round}` })
      }
      break
    }

    // --- tablero -----------------------------------------------------------
    case 'token/move': {
      const x = Math.max(0, Math.min(field.cols - 1, Math.round(action.x)))
      const y = Math.max(0, Math.min(field.rows - 1, Math.round(action.y)))
      const current = field.tokens[action.ref]
      if (current && current.x === x && current.y === y) return { state, log }
      field.tokens = { ...field.tokens, [action.ref]: { x, y } }
      next = { ...state, field }
      break
    }
    case 'token/remove': {
      if (!field.tokens[action.ref]) return { state, log }
      const { [action.ref]: _drop, ...tokens } = field.tokens
      field.tokens = tokens
      // Off the table is out of the fight: a member with no ficha is a turn
      // that neither screen can show, and «Siguiente turno» would land on it.
      // The ficha itself stays, so `+ Añadir` can seat them again with their
      // hit points intact; the initiative stays with it for the same reason.
      const { members, activeRef } = state.encounter
      const encounter = members.includes(action.ref)
        ? {
            ...state.encounter,
            members: members.filter((m) => m !== action.ref),
            activeRef: activeRef === action.ref ? null : activeRef,
          }
        : state.encounter
      next = { ...state, field, encounter }
      break
    }
    case 'token/place': {
      if (field.tokens[action.ref]) return { state, log }
      const spot =
        action.x !== undefined && action.y !== undefined
          ? { x: action.x, y: action.y }
          : freeSquare(field.tokens, field.cols, field.rows, action.ref.startsWith('npc:'))
      if (!spot) return { state, log }
      field.tokens = { ...field.tokens, [action.ref]: spot }
      next = { ...state, field }
      break
    }
    case 'token/placeAll': {
      const tokens = { ...field.tokens }
      const place = (ref: Ref, fromRight: boolean) => {
        if (tokens[ref]) return
        const spot = freeSquare(tokens, field.cols, field.rows, fromRight)
        if (spot) tokens[ref] = spot
      }
      for (const pcId of Object.keys(state.play)) place(makeRef('pc', pcId), false)
      for (const npc of state.npcs) place(makeRef('npc', npc.id), true)
      if (Object.keys(tokens).length === Object.keys(field.tokens).length) {
        return { state, log }
      }
      field.tokens = tokens
      next = { ...state, field }
      break
    }
    case 'field/grid': {
      const cols = Math.max(1, Math.min(60, Math.round(action.cols)))
      const rows = Math.max(1, Math.min(60, Math.round(action.rows)))
      if (cols === field.cols && rows === field.rows) return { state, log }
      field.cols = cols
      field.rows = rows
      // Keep every token on the board.
      field.tokens = Object.fromEntries(
        Object.entries(field.tokens).map(([ref, t]) => [
          ref,
          { x: Math.min(t.x, cols - 1), y: Math.min(t.y, rows - 1) },
        ]),
      )
      next = { ...state, field }
      break
    }
    // --- objetos -----------------------------------------------------------
    case 'object/give': {
      const live = liveOf(state, action.ref)
      if (!live || live.objects.includes(action.objectId)) return { state, log }
      // An object is in one pair of hands at a time.
      let moved = withLive(state, action.ref, (l) => ({
        ...l,
        objects: [...l.objects, action.objectId],
      }))
      for (const holder of holdersOf(state, action.objectId)) {
        if (holder === action.ref) continue
        moved = withLive(moved, holder, (l) => ({
          ...l,
          objects: l.objects.filter((o) => o !== action.objectId),
        }))
      }
      // Charges start full the first time the object enters play.
      const objects = { ...moved.objects }
      const def = opts.object?.(action.objectId)
      if (def?.usos !== undefined && !objects[action.objectId]) {
        objects[action.objectId] = { uses: def.usos, spent: false }
      }
      next = { ...moved, objects }
      log.push({
        kind: 'loot',
        text: `${nameOf(state, action.ref, opts)} recibe ${objectName(action.objectId, opts)}`,
      })
      break
    }
    case 'object/take': {
      const live = liveOf(state, action.ref)
      if (!live?.objects.includes(action.objectId)) return { state, log }
      next = withLive(state, action.ref, (l) => ({
        ...l,
        objects: l.objects.filter((o) => o !== action.objectId),
      }))
      break
    }
    case 'object/charges': {
      const def = opts.object?.(action.objectId)
      if (def?.usos === undefined) return { state, log }
      const current: ObjectState = state.objects[action.objectId] ?? {
        uses: def.usos,
        spent: false,
      }
      const uses = Math.max(0, Math.min(def.usos, Math.trunc(action.uses)))
      // Clicking past either end of the row states what is already true.
      if (uses === current.uses) return { state, log }
      next = {
        ...state,
        objects: { ...state.objects, [action.objectId]: { uses, spent: uses === 0 } },
      }
      if (uses === 0) {
        // The item is destroyed: take it out of whoever's hands hold it.
        for (const holder of holdersOf(next, action.objectId)) {
          next = withLive(next, holder, (l) => ({
            ...l,
            objects: l.objects.filter((o) => o !== action.objectId),
          }))
        }
        log.push({ kind: 'loot', text: `${objectName(action.objectId, opts)} se destruye` })
      }
      break
    }
    case 'object/refill': {
      const def = opts.object?.(action.objectId)
      if (def?.usos === undefined) return { state, log }
      next = {
        ...state,
        objects: {
          ...state.objects,
          [action.objectId]: { uses: def.usos, spent: false },
        },
      }
      break
    }
    case 'loot/transfer': {
      const from = liveOf(state, action.from)
      if (!from || from.objects.length === 0) {
        if (!from || (from.gold === 0 && from.objects.length === 0)) return { state, log }
      }
      const carried = [...from.objects]
      const gold = from.gold
      let moved = withLive(state, action.from, (l) => ({ ...l, objects: [], gold: 0 }))
      moved = withLive(moved, action.to, (l) => ({
        ...l,
        objects: [...new Set([...l.objects, ...carried])],
        gold: l.gold + gold,
      }))
      next = moved
      log.push({
        kind: 'loot',
        text: `${nameOf(state, action.to, opts)} saquea a ${nameOf(state, action.from, opts)}${
          carried.length ? `: ${carried.map((o) => objectName(o, opts)).join(', ')}` : ''
        }`,
      })
      break
    }
    case 'gold/set':
      next = withLive(state, action.ref, (l) => ({ ...l, gold: Math.max(0, action.gold) }))
      break
    case 'inventory/set':
      next = withLive(state, action.ref, (l) => ({ ...l, inventory: action.text }))
      break
    case 'slots/set':
      next = withLive(state, action.ref, (l) => ({
        ...l,
        spent: { ...l.spent, [action.level]: Math.max(0, action.spent) },
      }))
      break
    case 'rest/short': {
      // A short rest recovers nothing on its own in 5e; it clears the dying
      // state of anyone stabilised and is the moment to spend Hit Dice, which
      // the DM applies by hand.
      next = state
      for (const ref of action.refs) {
        next = withLive(next, ref, (l) => ({ ...l, death: { ok: 0, fail: 0 } }))
      }
      if (next !== state) log.push({ kind: 'rest', text: 'Descanso corto' })
      break
    }
    case 'rest/long': {
      next = state
      for (const ref of action.refs) {
        const max = maxHpOf(state, ref, opts)
        next = withLive(next, ref, (l) => ({
          ...l,
          hp: max ?? l.hp,
          temp: 0,
          spent: {},
          exh: Math.max(0, l.exh - 1),
          death: { ok: 0, fail: 0 },
          conditions: l.conditions.filter((c) => c !== 'Inconsciente'),
        }))
      }
      log.push({ kind: 'rest', text: 'Descanso largo' })
      break
    }

    case 'log/note':
      log.push({ kind: 'note', text: action.text })
      break

    default: {
      const exhaustive: never = action
      void exhaustive
      return { state, log }
    }
  }

  if (log.length > 0) {
    next = { ...next, log: [...next.log, ...log.map((e) => ({ ...e, t: now }))] }
  }
  return { state: next, log }
}
