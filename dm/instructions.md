# dm — full functional reference

This is the complete behavioral reference for the `dm/` subproject: what
`index.html` (the DM's admin window) and `tablero.html` (the TV window)
actually do, feature by feature, as implemented today. It complements
`CLAUDE.md`, which stays focused on invariants, gotchas and things to know
*before editing code*; this document is the "what it does" manual — read it
to understand the app's behavior without reading 8,000 lines of source.

Everything here was verified directly against the code (including the
in-progress Historia wikilinks/tags/backlinks work), not copied from stale
notes.

---

## 1. Purpose & constraints

`dm/` is the DM-facing half of a two-app, no-build toolkit for running a
level-1-only D&D 5e (2024 rules) campaign. `index.html` is the admin console
the DM drives from a laptop; `tablero.html` is what gets opened in a second
window — typically on a television — for the players to look at.

Both are opened by double-clicking, as `file://` documents. That constraint
shapes almost everything:

- **No `fetch()`/XHR, no server.** A folder can't be listed and a sibling
  `.json` can't be requested over `file://`. The only way to read a directory
  tree is `<input type=file webkitdirectory>`; the only way to read one
  file's bytes is `FileReader` on a `File` the user picked or dropped.
- **No cross-window messaging except `localStorage`.** Chrome (uniquely vs.
  Firefox/Safari) shares `localStorage` across `file://` documents — that is
  the *entire* admin↔TV channel. No `BroadcastChannel`, no `postMessage`, no
  `storage` event (unreliable between `file://` documents) — just polling.
- **`localStorage`'s ~5 MB ceiling** forces large binary payloads (map
  images, portraits, audio) to be paths on disk wherever possible, or
  downscaled/re-encoded before ever touching a key. A dropped map image is
  downscaled to ≤1920px JPEG; a portrait to ≤512px JPEG; audio is never
  embedded, only referenced by relative path.
- **The character creator (`creator/index.html`) is the one source of truth
  for player numbers.** `dm/index.html` carries a byte-identical copy of the
  creator's `<script id="data">` (rules tables) and `<script id="engine">`
  (which contains `derive()`), plus `blankCharacter()`, `newId()`,
  `normalise()`. `derive()` turns an exported character `.json` into
  HP/AC/initiative/saves/skills/spell DC/attacks — the DM board invents none
  of it.
- **Nothing here rolls dice.** Initiative totals, damage, healing, death
  saves — all typed in by the DM from what happened at the table.
- **Language split**: all UI copy and rules text are Spanish; every
  identifier, function name, comment and doc is English.

---

## 2. The two windows

`index.html` opens `tablero.html` via `window.open('tablero.html', 'tablero')`
— a named window, so pressing the button again refocuses it rather than
duplicating it. From then on the two documents only talk through
`localStorage`.

**Signaling**: a monotonic revision counter, key `dnd-dm-rev`. Both windows
poll it every 200ms and only re-parse the payload once the number has moved.
Each side remembers the last revision *it itself* wrote and ignores that
value coming back — this is what stops the two windows from ringing at each
other in a feedback loop.

**What's shared vs. private**:
- `dnd-dm-board` is a **filtered projection** built fresh by `buildBoard()`
  in `index.html`, never the real session. A hidden npc is *absent* from
  `board.npcs`/`board.tokens`, not merely un-rendered — opening the TV
  window's devtools teaches you nothing extra.
- The one thing that flows TV → admin is **token position**:
  `tablero.html`'s drag handlers write `x`/`y` into the same `board` object
  and push it back with a fresh revision; `index.html`'s `boardPoll()` reads
  only `board.tokens[*].{x,y}` back out and folds them into
  `session.field.tokens`. Nothing else is ever read back.
- `dnd-dm-map` holds a **dropped** map's raw JPEG data URI; a scene's own art
  never uses this key, only a relative `src` path both windows can
  `<img src>` directly.

---

## 3. Campaign folder mechanics

A campaign is `campaigns/<name>/` — a sibling of `dm/`, not nested under it
— holding some or all of `scenarios/`, `assets/`, `story/`, `players/`,
`monsters/`. `index.html`/`tablero.html` are the one pair of files shared by
every campaign; picking a folder is what makes one campaign "current."

### Read: the `webkitdirectory` scan — `scanFolder()`

The hidden `<input type="file" webkitdirectory directory>` hands over every
file in the picked tree with a `webkitRelativePath` like
`campaign-01/scenarios/taberna.json`. The first path segment is stripped and
remembered as `campaign.name` — the one thing a `file://` page can otherwise
never learn about the filesystem. One pass buckets every entry by regex:

- `assets/**` → filenames only, into `library.assets` — never read as
  content.
- `scenarios/*.json` → read as text, parsed, `normaliseScene()`d.
- `story/**/*.md` → read as text, wrapped via `noteFrom(path, content)`.
- `players/*.json` → read as text, `normalise()`d as a character.
- `monsters/*.json` → read as text, `normaliseBeast()`d.

If the scanned folder's name **differs** from the currently loaded
`campaign.name`, session/scene-library/story-library are wiped first
(`resetCampaignState()`) so one campaign's party can never bleed into
another's. Re-scanning the **same** folder merges:

| Found under | Merge rule |
|---|---|
| `scenarios/*.json` | replace by scene `id`, else append |
| `players/*.json` | replace by character `id` — never drops current HP/conditions (`mergeParty()`) |
| `monsters/*.json` | replace by bestiary `id` **only if the file has one**; no id → always a fresh entry (`absorbBeast()`) |
| `story/**/*.md` | **wholesale replace** — deleting a `.md` and rescanning removes it from Historia |

`campaignPath(p)` resolves a scene's stored relative path (`assets/taberna.jpg`)
against the current campaign (`../campaigns/<name>/<p>`); before any campaign
is loaded, a path resolves unchanged (already correct relative to `dm/`'s own
folder).

### Write: `showDirectoryPicker({mode:'readwrite'})` (Chrome-only, asked once per page load)

- **Nueva campaña** (`createNewCampaign()`) picks an empty folder and creates
  `scenarios/`, `assets/`, `players/`, `monsters/`, `story/` inside it — the
  native picker's own "New Folder" is how the folder itself gets named.
- **Guardar campaña** (`saveCampaignToDisk()`) writes every party member,
  every bestiary monster and every library scene to its own file
  (`players/<slug>.json`, `monsters/<slug>.json`, `scenarios/<slug>.json`),
  reusing whatever path a scanned item came from and slugifying a fresh path
  for anything new. **Loaded npc instances are never written** — they're
  spawned copies of a bestiary entry, not something that owns a file.
- **Guardar sesión** (`exportSession()`) always downloads `mesa.json`; if
  directory-write is available, it also writes that payload into the
  campaign folder.

### First run

Until `campaign.name` is set, the whole tab UI is replaced by a gate screen:
"Antes de nada — ¿qué campaña vamos a jugar?" with **Cargar campaña** (the
scan) and **Nueva campaña**.

---

## 4. Storage model — every key

| Key | Owner | Holds |
|---|---|---|
| `dnd-dm-v1` | admin | the session object (§5) |
| `dnd-dm-board` | admin writes; TV writes token `x`/`y` back | the filtered TV projection (§11) |
| `dnd-dm-map` | admin | a **dropped** map image as a JPEG data URI, ≤1920px wide — a scene never uses this |
| `dnd-dm-scenes` | admin, from scan/editor | scene library + last scan's asset filenames (paths only) |
| `dnd-dm-story` | admin, from scan | full note text |
| `dnd-dm-audio` | admin | `{ master, muted }` — a room/hardware property, not session state |
| `dnd-dm-campaign` | admin, from scan/new-campaign | the picked campaign folder's bare name |
| `dnd-dm-rev` | both | monotonic revision counter — the entire sync signal |

All reads/writes are wrapped in `try/catch`; corrupt JSON, private-mode
`localStorage`, or quota overflow degrade to a blank default rather than
throwing.

---

## 5. Session shape (`dnd-dm-v1`)

```js
{
  version: 1,
  party: [ /* whole character objects, creator's blankCharacter() shape */ ],
  play: { '<charId>': {
    hp: null,        // null = "untouched, therefore full" — must round-trip as null, not 0
    temp: 0, conditions: [], exh: 0,
    death: { ok: 0, fail: 0 },
    note: '',
    gold: 0, inventory: '',
  } },
  playerFiles: { '<charId>': 'players/thalor-vaelen.json' },
  bestiary: [ { id, name, tag, ac, hpMax, initMod, speed, note, portrait, abilities: [{id,name,desc}], file } ],
  npcs: [ /* same shape as a bestiary entry, plus a full play state mixed in */ ],
  encounter: {
    on: false,
    round: 1, activeRef: null,
    members: [ 'pc:<id>', 'npc:<id>' ],   // who is in THIS fight
    init: { 'pc:<id>': 17 },              // absent ref = hasn't rolled, not "out"
  },
  field: {
    cols: 24, rows: 14,       // 24x14 = 16:9, fills a TV with no letterboxing
    live: false, grid: false,
    sceneId: null,
    map: { src, stamp } | null,        // exactly one of the two is set
    audio: { music, ambience } | null, // the live scene's mix, copied in
    staged: { sceneId, map, audio } | null,   // Preparar's target; buildBoard() never reads this
    paused: false,
    tokens: { '<ref>': { x, y } },
    reveal: { '<npcId>': { on: false, hp: 'coarse' } },
    benched: [ 'pc:<id>' ],
  },
}
```

Invariants worth knowing:
- A **pre-scenes save** (no `field.live`/`grid` at all) defaults both to
  `true` on load — an old save was always a live battlemap. A *brand-new*
  session instead defaults to `live:false, grid:false`.
- `hp: null` must survive the round trip as `null` (`Number(null) === 0`
  would otherwise turn "untouched" into "on the floor").
- `field.reveal[npcId]` defaults to `{ on: false, hp: 'coarse' }` — hidden by
  default, coarse wording if ever revealed.
- Stale initiative entries, token positions, and reveal entries pointing at
  anyone who no longer exists are dropped on every load.
- `encounter.on` for an old save with no explicit flag is inferred as
  `members.length > 0`.

---

## 6. The five tabs

Tab bar shows Spanish labels **Juego / Jugadores / PNJ / Escenas / Historia**
with live counts. Escenas, PNJ and Historia each get a filter box that only
appears once there's something to filter; caret position is preserved across
the wholesale re-render on every keystroke.

### Jugadores
The party out of combat. **Importar** opens a multi-file `.json` picker;
**Descanso largo** (once the party is non-empty) resets every party member to
full HP, clears temp HP/conditions/death saves, and removes one exhaustion
level. Each character renders as a full combat card with the bench toggle
visible (the muster doesn't show it inline). Dropping `.json` files anywhere
on the page works regardless of which tab is open.

### PNJ
The bestiary — templates, not instances. **+ Nuevo PNJ** opens a form: name,
a free-text `tag` (autocompleted from tags already in use, for
filtering/grouping), CA, PG, mod. iniciativa, notes, a repeatable
abilities/attacks list (flavor text, not mechanical), and an optional
portrait (downsized to 512px JPEG). Editing preserves whatever scan path an
entry came from.

### Escenas
Either a library grid of scene cards (picture-first, name, thumbnail, a
missing-asset warning, Editar/Exportar/Quitar) or a full-screen editor —
never both. Putting a scene on the table or preparing it is **not** done
here — that lives in Juego's own scene picker, which reuses the same card
component with **Al tablero**/**Preparar** buttons added.

### Historia
See §10 — read-only notes with wikilinks, tags, and a two-view (index/detail)
navigation.

### Juego
Not a separate concept from combat — a three-way branch:

```
juegoScreen() =
  encounter.on         → fight screen
  else !field.live      → "nothing live" screen
  else                   → muster screen
```

The muster and fight screens share the same small field view between two
combatant columns, and reuse the same card component for every row.

---

## 7. Core combat/board model

### Loading ≠ fighting ≠ visible — three independent switches

1. **Existing at all** — an npc reaches `session.npcs` via `loadNpc()` (from
   the PNJ picker, the muster's own stepper, or a scene's roster resolving on
   go-live). This alone seats it on the field with no other effect.
2. **Reveal** (`field.reveal[id].on`) — whether it's in the TV payload at
   all, fight or not. Defaults hidden; the muster's per-row 👁/🙈 toggle
   defaults to *visible*.
3. **Fight membership** (`encounter.members`) — whether its *card* shows
   numbers (HP, conditions) at all. A loaded-but-not-fighting npc shows no HP
   even in the admin's own view — it reads as pure scenery, same as it will
   on the TV. A player never has this gate — always tracked.

### The muster picker — fight-membership flow

**Combate** always shows **Empezar combate**, enabled unconditionally;
pressing it opens the muster modal — search box, two columns:
- **Jugadores**: everyone in the party, on-table members first, then a
  "Fuera de la mesa" (benched) group; benching can be toggled right there.
- **PNJ**: everyone already loaded (each with its own 👁/🙈), then everyone
  else in the bestiary with a `+`/`−`/tick stepper to load fresh instances.

Nobody is ticked by default. Confirming spawns any newly-stepped npcs, folds
every hide flag into `field.reveal`, and opens the initiative wizard — one
name/one box/Enter, party first then npcs in add-order; blank means "hasn't
rolled," not "out of the fight." Closing the modal by accident keeps
everything typed so far. Confirming starts the fight: sets
`members`/`init`/`round=1`/`on=true`, flips `field.live=true` — but never
touches `field.grid`, since combat is a fact about the game, not a mode of
the television.

**Terminar combate** resets only round/turn/membership/initiative — an npc
stays exactly where it is, exactly as wounded, until removed by its own ✕.
A player can never be deleted this way; **benching** takes them off the
board while the character itself is untouched.

### Grid vs. live vs. combat — three independent facts

Starting or ending a fight never touches `field.grid` — the DM flips it
separately. A scene going live always forces `grid=false` (full-bleed art),
regardless of what it was before; the DM decides fresh, per scene, whether
tokens belong on it. Tokens only ever travel to the TV when the grid is on.

### Tokens, dragging, reach

Both windows draw the same field from the same token data. Dragging uses
**pointer events**, not HTML5 drag-and-drop, for one code path across mouse
and touch. A tap that doesn't move (under a 4px threshold) toggles selection
instead of moving; selecting lights every square within reach. Reach is
**Chebyshev distance** (a diagonal costs one square, per 2024 rules),
computed from speed, clamped as a rectangle to the field's edges — no walls,
no pathing. A drag is explicitly **not** an undo step in either direction.

The scene editor's roster board shares the exact same drag machinery but
writes into the *draft* scene, not the live session — nothing there is real
until **Guardar**.

### Pausar tablero

`field.paused` gates every outgoing write to the TV: flip it to arrange an
ambush off-screen (drag tokens, adjust HP, reveal some/hide others) with
nothing reaching the TV until **Enviar al tablero** pushes once. A visible
banner stays up on every screen while paused. Not an undo step; persists
across reload.

---

## 8. Card / HP grammar

One damage-expression box per card, committed on blur or **Enter**:

| Typed | Effect |
|---|---|
| `7` / `-7` | 7 damage — temp HP absorbs first, remainder floors current HP at 0 |
| `+3` | heal 3, capped at max |
| `t5` | set temp HP to 5 — replaces, never stacks |
| `=11` | set total outright. On a **monster** this can raise max with it; a **player**'s max always stays whatever the creator's `derive()` computed |

Anything else is rejected with a message. Landing above 0 clears any death-save
marks. A quick **+1**/**−1** pair sits beside the box.

**Shared multi-target box**: tick several cards, one shared box appears with
**Aplicar** (full amount) and **Mitad** (half, floored, for a successful
save) — same grammar, one undo step for the whole batch.

**Gold**: its own near-identical grammar (`=n` set, `+n` gain uncapped, `-n`
spend floored at 0) plus a free-text inventory box, both per-character, never
touched by damage/heal logic.

**Undo**: a 25-deep snapshot stack of the whole session (not a diff) — an
area attack undoes as one step. Token drags, scene staging, mute/volume, and
pausing are explicitly *not* undo steps.

**Death saves**: shown only when a player is at 0 HP — three pips each for
successes/failures, clicking a pip toggles it. 3 fails = muerto, 3 successes
= estable. A monster at 0 HP instead greys out, loses its turn, keeps its
card — never gets a death-save row.

**Conditions**: the 15 SRD conditions + Concentration, with full rules text
shown on tap rather than silently toggling off. Exhaustion counts 0–6 and
clears itself past 6.

**`0 of 0`** (an unfinished character sheet) reads as "ficha incompleta,"
never as dead.

---

## 9. Scenes system

A **scene** is pure prep — name, art, two audio layers, an optional grid-size
override, a roster, a note — stored in its own library, never in the
session:

```js
{ id, name, art: { src } | null, audio: { music, ambience } | null,
  grid: { cols } | null, roster: [ { beastId, x, y } ], note: '', file: null }
```

Hand-edit tolerance mirrors the creator's own: the full envelope or a bare
object; `art` accepts a bare string; each audio layer accepts a bare string;
a layer's absent `volume` defaults to `.5` (a deliberate `volume: 0`
survives); grid is column-count-only — rows always derive from the art's own
aspect ratio so tiles stay square.

**Editor** (full screen, not a modal — nothing is real until **Guardar**):
name, note, an art picker from the last scan's image assets, a grid override
with a live row-count preview, two audio pickers each with a volume slider,
and **Reparto** — a mini live-drag board at the scene's own eventual grid
size, seeded from the bestiary; each **+ Añadir** adds one npc template to
the nearest free square.

**Preparar vs. A la tele**: Preparar resolves art/audio into a staged slot
and stops there — the TV never learns about it. **A la tele** is the only
action that actually promotes a scene: sets it live, forces grid off, applies
its own grid size if set, resolves art/audio, and seats a **fresh** npc
instance per roster entry — skipping any square already occupied, which is
what makes going live on the same scene twice not double-seat it.

**"Sin escena"** clears grid/map/audio/scene entirely — the bare-grid state
that predates scenes.

**Assets stay paths, never bytes** — one MP3 already exceeds the 5MB
ceiling. The live map holds exactly one of a path or dropped-image bytes; a
scene's own art only ever uses the path.

**Audio playback lives entirely in `tablero.html`** — "it's the window with
speakers." Two layers (music, ambience), each **two `<audio>` elements that
swap which one is current** on every track change for a real crossfade
rather than a cut. A single ticker steps all four elements toward their
target volumes every 50ms over a ~900ms fade, pausing (not just silencing)
any element that reaches zero.

**Autoplay unlock**: Chrome refuses playback until the TV window itself has
been touched. A pulsing "♪ Toca aquí para el sonido" pill appears only on a
genuine `NotAllowedError` (a missing/broken file doesn't raise it — the admin
side already reports that). Any tap or keypress anywhere unlocks, not just
the pill.

**Volume**: its own key, deliberately outside session/undo — correcting a
damage roll should never also move the volume back. The slider previews live
on every pixel of movement but only persists on release.

---

## 10. Historia — notes, wikilinks, tags, backlinks

**Source and read-only nature**: notes are `story/**/*.md`, read verbatim on
scan, grouped by the first path segment after `story/` (bare `story/x.md`
groups under "General"). There is no editor and no export — a note is edited
in a text editor on disk and reappears on the next scan. Never enters the TV
projection, never an undo step, wholesale-replaced on every scan (unlike
scenes, which merge by id).

**Title**: a note's first `# Heading` line, else its filename humanized.

**Rendering**: a small hand-rolled renderer, not CommonMark — headings
(pushed down two levels so a note's own headings never outrank its card
title), `**bold**`, `*italic*`, `- ` bullet lists, blank-line paragraphs. The
source is escaped before any inline processing, so a stray `<`/`&` can't
break the markup that follows.

### Two views: index and detail

Historia shows either an **index** (grouped list of note titles, tags shown
as small inline pills next to each title) or a single **note in full** —
never both. A "← Índice" button sits above the open note. Opening a note that
no longer exists (its file vanished on the last rescan) falls back silently
to the index rather than showing nothing.

### Wikilinks

`[[Texto]]` inside a note's body resolves against every other note's title
first, then its filename, case-insensitive — a DM writing a link could be
thinking of either, and the heading is what's actually on screen so it wins
ties. A resolved link renders clickable (sepia, underlined) and jumps
straight to that note; an unresolved one renders muted with a dashed
underline and isn't clickable. Self-links and unresolved targets never count
toward backlinks.

### Tags

`#word` anywhere in the prose becomes a small pill — in the note's own tag
row, inline in the index, and inline in the rendered body wherever it
appears. Clicking any tag, anywhere, sets the search filter to that tag and
returns to the index — a tag is a shortcut into search, not a filter of its
own.

### Backlinks

An open note shows a "Mencionada en" footer listing every other note whose
wikilinks resolve to it, each itself a clickable link — note-to-note
navigation without a detour through the index.

Nothing about this layer is ever written back to storage — links, tags and
backlinks are all derived from the note text fresh on every render, the same
"read-only, reappears on next scan" spirit as everything else in Historia.

---

## 11. The TV projection shape (`dnd-dm-board`)

```js
{
  rev, cols, rows,
  mode: 'idle' | 'scene' | 'field',   // idle: nothing live. scene: full-bleed art. field: grid + tokens
  map: { src, stamp } | null,
  audio: { music, ambience, master } | null,   // master is 0 if muted
  banner: { round, active } | null,            // null unless a fight is actually on
  order: [ { name, portrait, kind, active, down } ],   // hidden npc reads as name:'···', portrait:null
  party: [ { name, portrait, colour, hp, hpMax, temp, state } ],   // everyone on the board, minus benched
  npcs:  [ { name, portrait, hp } ],   // loaded AND revealed only; hp null unless also in the current fight
  tokens: [ { id, name, kind, colour, x, y, active, hp, conditions, reach } ],   // [] whenever mode isn't 'field'
}
```

Filtering facts:
- A hidden npc is skipped entirely from both `tokens` and `npcs` — genuinely
  absent, not merely un-rendered.
- HP travels as either an exact number/pct or one of five coarse words
  (*ileso / herido / malherido / grave / fuera de combate*), chosen
  per-npc; a player is always exact.
- A monster's portrait is exactly as gated as its name — a hidden monster's
  face is exactly as secret as its name.
- `reach` is always sent, even outside combat, since planning a position is
  useful before a fight starts.
- `tokens` is forced empty whenever the mode isn't `'field'` — no board to
  place a token on under full-bleed art, even mid-fight.

---

## 12. Sync with `creator/` (`check-sync.py`)

```
creator/index.html  ──rules──►  dm/index.html  ──theme──►  dm/tablero.html
```

`dm/index.html` carries a byte-identical copy of the creator's `data`/
`engine` script blocks and the functions `blankCharacter()`, `newId()`,
`normalise()` — what makes accepting an exported `.json` safe.
`dm/tablero.html` carries only the shared theme tokens — no components, no
board CSS, no rules.

```bash
python3 dm/check-sync.py    # exit 0 = clean, 1 = drift, 2 = couldn't extract
```

Run this after touching the creator's data/engine/theme blocks — it is not
checked automatically. Not covered: `featuresFor()` (rewritten, not copied),
drag handling (looks similar, writes to different things), and the
app-owned `dm-data`/`dm-app`/`tv-app` script blocks.

---

## 13. Verification approach

No formal test suite. The pattern in active use:

1. Extract every inline `<script>` block and run `node --check` against the
   concatenated text — catches syntax errors without opening a browser.
2. Headless Chrome console-error check on a bare load
   (`--headless --dump-dom`, grep stderr for `CONSOLE|Uncaught`).
3. Behavioral fixtures: headless Chrome starts with empty `localStorage`, so
   anything past a bare load needs a copy of the file with a spliced-in
   `<script>` that seeds storage *before* the app's own boot script runs,
   plus a probe that drives real DOM events and writes its findings into
   `document.title` (self-checking via `--dump-dom | grep '<title>'`).
4. Two-window/shared-storage behavior needs one Chrome profile, two pages
   open in a specific order.

---

## Known issue

`boardPoll()` in `index.html` (the function that folds a TV-dragged token's
new position back into the session) calls `updateExplored()` — no such
function exists anywhere in the file. It appears to be a leftover reference
to the tile/fog-of-war layer mentioned as removed in `CLAUDE.md`'s Scope
section. As written, dragging a token on the TV window and having the admin
side pick up that drag would throw a `ReferenceError` at that call site.

---

## Function/screen index

**Storage & normalization**: `blankSession`, `normaliseSession`,
`blankField`, `normaliseArt`, `normaliseLayer`, `normaliseAudio`,
`normaliseReveal`, `normalisePlay`, `normaliseBeast`, `absorbBeast`,
`loadSession`/`save`, `loadCampaign`/`saveCampaign`/`campaignPath`.

**Scenes**: `blankScene`, `normaliseScene`, `aspectOf`, `deriveRows`,
`sceneGridSize`, `loadScenes`/`saveScenes`, `missingAssets`,
`resolveSceneAssets`, `stageScene`, `resolveRoster`, `goLive`,
`exportScene`, `freeRosterSquare`, `rosterFieldHTML`.

**Story**: `loadStory`/`saveStory`, `noteFrom`, `noteTitle`, `storyIndex`,
`resolveWikilink`, `noteTags`, `noteLinks`, `backlinksFor`, `mdToHtml`,
`storyScreen`, `storyIndexView`, `storyNoteView`.

**Campaign scan/write**: `scanFolder`, `resetCampaignState`,
`createNewCampaign`, `getCampaignDirHandle`, `writeJSON`,
`saveCampaignToDisk`, `exportSession`, `slugify`.

**Combat engine**: `blankPlay`, `applyDelta`/`hurt`/`heal`,
`applyGoldDelta`, `longRest`, `inOrder`, `advance`, `startCombat`,
`endCombat`, `seatAll`, `freeSquare`.

**Board/TV**: `buildBoard`, `pushBoard`, `syncBoard`, `boardPoll`,
`tokenHP`, `coarseWord`, `loadAudioPrefs`/`saveAudioPrefs`, `mapSrc`,
`fieldAspect`, `portraitSrc`, `readImage`, `readPortrait`, `applyPortrait`.

**Screens**: `render`, `nav`, `topBar`, `tvPanel`, `audioBar`, `tabs`,
`tableScreen`, `juegoScreen`, `nothingLiveScreen`, `scenePanel`,
`sceneEmptyPanel`, `escenasScreen`, `sceneLibrary`, `sceneCard`,
`stagedStrip`, `sceneEditor`, `editorFields`, `musterScreen`, `rosterRow`,
`sidelinedRow`, `fightScreen`, `midBoard`, `bestiaryScreen`, `cbCard`,
`revealRow`, `benchRow`, `pickBar`, `chipRow`, `deathRow`, `pcDetail`,
`npcDetail`, `featuresFor`.

**Modals**: `modalView`, `beastWizard`, `npcPicker`, `scenePicker`,
`initQueue`, `initWizard`, `commitInit`, `stepInit`, `playerPicker`,
`musterPicker`.
