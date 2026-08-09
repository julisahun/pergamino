# dm — combat tracker and battle map

Two `file://` HTML pages sharing `localStorage`: `index.html` is the admin
window (what the DM drives), `tablero.html` is what goes on the television.
`check-sync.py` guards the parts copied from `creator/index.html`. See the
root `CLAUDE.md` for repo-wide rules (language split, no-build, storage
discipline) — this file is the detail specific to this tool.

```bash
open index.html
```

**It invents no rules and rolls no dice.** Every player number (HP, CA,
initiative, saves, spell DC, …) comes from `derive()`, copied verbatim from
the creator and run against the `.json` a player exported. Every roll at the
table is physical — initiative, damage, death saves are *entered*, never
generated.

## Campaign folder

A campaign is a sibling folder under `campaigns/` with some or all of
`scenarios/`, `assets/`, `story/`, `players/`, `monsters/`. `dm/index.html` and
`dm/tablero.html` are the *one* pair of files shared by every campaign; only
the folder picked in **Buscar campaña** changes what loads.

Two independent mechanisms, don't conflate them:
- **`<input webkitdirectory>`** — the read-only scan. Works everywhere
  `file://` does. One pick reads `scenarios/*.json`, names in `assets/`,
  `story/**/*.md`, `players/*.json`, `monsters/*.json` in one pass. Chrome
  doesn't remember the pick across reloads, so results are cached in
  `dnd-dm-scenes` / `dnd-dm-story` / `dnd-dm-campaign`; re-pick only after
  adding/editing a file on disk.
- **`showDirectoryPicker({mode:'readwrite'})`** — Chrome-only, asked for once
  per page load, used by **Guardar campaña** to write party/bestiary/scenes
  back to their own files. Not remembered across reloads, on purpose (same
  as the read side).

Re-scan merge rules differ by what was found — this is deliberate, not
inconsistent:

| Found under | Merge rule |
|---|---|
| `scenarios/*.json` | by scene `id` |
| `players/*.json` | by character `id` (`mergeParty()`) — a re-import must never cost the party its wounds |
| `monsters/*.json` | by bestiary `id` **if the file has one**; no `id` → always a fresh entry (author's choice, per file) |
| `story/**/*.md` | wholesale replace — deleting a `.md` and rescanning removes it from Historia too |

Picking a **different** campaign folder clears session, scene library and
story library first. Re-picking the **same** one is an ordinary rescan/merge.

`campaignPath()` resolves a scene's stored relative path (`assets/taberna.jpg`)
against the current campaign, since `campaigns/` is a sibling of `dm/`, not
nested under it. `fetch()`/`XHR` don't work on `file://`; everything here goes
through `<img src>`, `FileReader` on a dropped/picked `File`, or `<audio>`.

## Storage keys

One key per concern, so a failure in one can't corrupt another:

| Key | Owner | Holds |
|---|---|---|
| `dnd-dm-v1` | admin | the session (below) |
| `dnd-dm-board` | admin writes; TV writes positions only | the projection sent to the TV |
| `dnd-dm-map` | admin | a **dropped** map image as a data URI, downscaled to ≤1920px JPEG. A scene never uses this |
| `dnd-dm-scenes` | admin, from scan | scene library + last scan's asset names (paths only) |
| `dnd-dm-story` | admin, from scan | full note text (small enough to not need path-only treatment) |
| `dnd-dm-audio` | admin | master volume + mute — a room property, not session/state |
| `dnd-dm-campaign` | admin, from scan | the picked campaign folder's name |
| `dnd-dm-rev` | both | monotonic revision counter (the sync signal) |

## Session shape (`dnd-dm-v1`)

```js
{
  version: 1,
  party: [ /* whole character objects — derive() needs the real thing */ ],
  play: { '<charId>': { hp, temp, conditions: [], exh, death: {ok, fail}, note } },
  playerFiles: { '<charId>': 'players/thalor-vaelen.json' },
  bestiary: [ { id, name, tag, ac, hpMax, initMod, speed, note, file } ],   // templates
  npcs: [ { id, name, tag, ac, hpMax, initMod, speed, note, file, ...play } ], // spawned instances, in or out of any fight
  encounter: {
    round, activeRef,
    init: { 'pc:<id>': 17, 'npc:<uid>': 12 },   // absent ref = not in the fight
    on: false,                                  // combat started, not implied
    members: [ 'pc:<id>', 'npc:<id>' ],         // who's in THIS fight
  },
  field: {
    cols: 24, rows: 14,
    live: false, grid: true,        // grid is a session toggle, independent of scene AND of combat
    sceneId: null,
    map: { src, stamp } | null,     // exactly one source: a path, or bytes in dnd-dm-map
    audio: { music, ambience } | null,  // live scene's mix, copied in — mirrors field.map
    benched: [ 'pc:<id>' ],         // off the board on purpose, character untouched. No npc equivalent
    tokens: { '<ref>': { x, y } },
    reveal: { '<npcId>': { on: false, hp: 'none'|'coarse'|'exact' } },
    staged: { /* Preparar target — never touches live/map/audio/sceneId */ },
    paused: false,                  // see "Pausar tablero" below
  }
}
```

Key invariants — get these wrong and things silently break:
- **A pre-scenes save has no opinion, so `live`/`grid` default to `true`** on
  load (an old save was always a live battlemap). `audio` defaults to
  **silence** — there's no old behaviour to preserve there.
- **`hp: null` means "untouched, therefore full"** and must round-trip as
  `null`, not `0`. (`Number(null) === 0` bit this before; the guard is
  `p.hp != null && …`.)
- `normaliseSession()` drops initiative entries and token positions pointing
  at anyone who no longer exists.

## The five tabs

| Tab (internal id) | What it is |
|---|---|
| **Juego** (`juego`) | The TV right now — nothing live, a scene, or a fight |
| **Jugadores** (`jugadores`) | The party out of combat: HP, conditions, every number, no sheet-reading |
| **PNJ** (`monstruos`) | The bestiary — a monster, villager, informant, anyone not at the table |
| **Escenas** (`escenas`) | The scene library + editor |
| **Historia** (`story`) | Read-only notes from `story/`, grouped by subfolder |

Internal ids/code identifiers (`monstruos`, `beastWizard()`, `session.bestiary`)
stayed the old names on purpose after the PNJ rename — that's a library of
*templates* regardless of what's in it. `session.npcs` is the different
thing: a spawned copy per instance, `npc:<uid>` refs.

Escenas, PNJ and Historia each have a filter box (substring match on name,
and on PNJ the tag too) — only shown once there's something to filter.

## Core model: loading ≠ fighting

An npc reaches the board via `loadNpc()` (from any of several **+** buttons) —
pushed into `session.npcs`, seated on the field, nothing else. Joining a fight
is the separate call `startCombat()`, even when one press in `musterPicker()`
does both back to back. Two independent switches follow:

- **◉/○ reveal** — whether the npc is in the TV payload at all, fight or not.
  Hidden by default.
- **`encounter.members`** — whether its *card* shows numbers (HP, conditions).
  Not-yet-in-a-fight npcs read as scenery.

Ending a fight (**Terminar combate**) resets round/turn/initiatives only. An
npc stays on the board exactly as it was until removed with its own ✕. A
player can't be deleted this way — **benching** (`data-bench`) takes them off
the board while keeping the character; `seatAll()` seats every npc
unconditionally but skips benched players.

`Combate` opens on the **muster** (prep, no membership question), with
**Empezar combate** always enabled — it opens `musterPicker()`, a modal with
party and loaded PNJ in separate columns, **nobody ticked by default**. A PNJ
row carries an extra 👁/🙈 toggle (default visible) that writes straight to
`field.reveal`. Confirming feeds the ticked refs to the initiative wizard —
one name, one box, **Enter**, next name; blank = not rolled yet, not out of
the fight; closing the modal keeps typed numbers (forgotten only when the
fight ends).

## Escenas — scenes vs the field

A **scene** is prep (name, art, two audio layers, a note); the **field is the
live board and a scene loads into it** — nothing downstream (undo, the
projection, `normaliseSession()`) needs to know scenes exist. There is **one
kind of scene** — whether a grid sits over it is a field toggle, not a scene
property.

```
scenarios/taberna-del-ancla.json
```
```js
{ kind: 'dnd-dm-scene', version: 1, scene: {
  id: 'taberna-del-ancla', name: 'La taberna del Ancla',
  art: { src: 'assets/taberna.jpg' },              // bare string also accepted
  audio: {
    music:    { src: 'assets/audio/mus-taberna.mp3', volume: 0.55, loop: true },
    ambience: { src: 'assets/audio/amb-taberna.ogg', volume: 0.40, loop: true },
  },
  grid: { cols: 20 },        // optional; absent = whatever the table's grid already is
  roster: [ { beastId, x, y } ],   // who's waiting, and where — see below
  note: 'Huele a brea y a sopa.',
}}
```

Hand-editing tolerance mirrors `importCharacter()`: envelope or bare object,
`art` may be a bare string, `audio` layers may be a bare string, absent
`volume` defaults to 0.5, a deliberate `volume: 0` is kept (not defaulted
away). There's no `rows` field anywhere — rows are always derived from the
art's own proportions so a tile stays square (`sceneGridSize()`).

**`scene.roster`** (edited via the editor's **Reparto** section) seats a fresh
npc instance per entry on `goLive()`, *after* applying the scene's own grid
size, but skips any square already occupied — so going live on the same
scene twice doesn't double-seat it. A `beastId` no longer in the bestiary is
skipped, not refused.

**Preparar** resolves art/audio into `field.staged` and stops — never touches
`live`/`map`/`audio`/`sceneId`, so the TV never learns about it. **A la tele**
promotes staged→live; `goLive()` clears `staged` itself once it's the scene
that just went live.

**Assets are paths, not bytes**, because one MP3 already blows the ~5 MB
`localStorage` ceiling. `field.map` holds exactly one of `src` (a path) or
`stamp` (bytes, from a dropped image, in `dnd-dm-map`) — a scene only ever
uses `src`.

**Sound** lives in `tablero.html` (it's the window with speakers): two audio
layers (music/ambience), each **two `<audio>` elements that swap roles** for a
real crossfade — one element per layer would mean stopping the old track
before the new one starts. Volume is walked by one 50ms ticker across all
four elements. Sound keys off **`live`, not `mode`** — a fight starting never
touches what's playing. Chrome autoplay: a small pill asks for one tap
(**any** tap unlocks, not just the pill); a load failure never raises it —
only `NotAllowedError` does, and a failed unlock brings the pill back.

Master volume/mute live in their own key, `dnd-dm-audio` — not session state,
not in `mesa.json`, never an undo step.

## The field, tokens, combat vs grid

`field.grid` and `encounter.on` are **independent** — a scene can fight with
the grid off (art stays up, turn banner/HP overlay it) or preview a battlemap
with nobody's turn yet. Only tokens are grid-only.

Reach is plain **Chebyshev distance** (5e 2024 counts a diagonal as one
square) — a rectangle, clamped to field edges, no walls to path around.
Dragging uses pointer events (not HTML5 DnD) for one code path across
mouse/touch. The same field renders identically in the admin window (between
the two combat columns) and on the TV — one set of coordinates, two views.

**Pausar tablero** (`field.paused`) gates every write through `syncBoard()`:
flip it to arrange an ambush off-screen (drag tokens, adjust HP, reveal some
hide others) with nothing reaching the TV until **Enviar al tablero** pushes
once. Persisted across reload; not an undo step.

## Card / HP grammar

One damage expression box per card:

| Typed | Means |
|---|---|
| `7` / `-7` | 7 damage (temp HP absorbs first, floors at 0) |
| `+3` | heal 3, capped at max |
| `t5` | set temp HP to 5 (replaces, never stacks) |
| `=11` | set total outright — on a **monster** this can raise max with it; a player's max stays `derive()`'s |

Anything else is rejected with a message. Tick several cards → a shared box
at the foot (`Aplicar` full, `Mitad` half). **⟲ undo** is a 25-deep snapshot
of the whole session (not a diff) — an area attack undoes as one step. At 0
HP: players get the death-save tracker; monsters grey out and lose their turn
but keep their card. `0 of 0` reads as *ficha incompleta*, not dead.

## Historia

`story/**/*.md`, grouped by first subfolder (bare `story/nombre.md` → group
**General**). Title = first `# Heading` line, else filename humanized. A
second scan **wholesale-replaces** the note library (unlike scenes, which only
add/update by id). Read-only — edited in a text editor, re-scanned. Small,
deliberately non-CommonMark markdown (headings, `**bold**`, `*italic*`,
`- ` lists), escaped first. Never enters the TV projection; not linked to
scenes/bestiary ids; not part of undo (own key, `dnd-dm-story`).

## The two windows / the TV projection

Both are `file://` pages; **Chrome shares `localStorage` across `file://`
pages** (Firefox/Safari do not — this design is Chrome-specific). Both poll
`dnd-dm-rev` 5×/sec and only re-parse when it moves; each side ignores its own
echo. Not the `storage` event — undependable between `file://` documents.

`dnd-dm-board` is a **filtered projection**, never the session:

```js
{ rev, cols, rows,
  map: {src, stamp} | null,
  audio: {music, ambience, master} | null,
  banner: {round, active} | null,        // null unless a fight is on
  order: [ {name, portrait, kind, active, down} ],
  party: [ {name, portrait, colour, hp, hpMax, temp, state} ],   // on the board, period
  npcs:  [ {name, portrait, hp} ],                                // loaded AND revealed only
  tokens: [ {id, name, kind, colour, x, y, active, hp, conditions, reach} ], // [] whenever mode is 'scene'
}
```

A hidden npc is **absent**, not unrendered — from both `npcs` and `tokens`.
Nothing is learned by opening the TV window's devtools. Positions are the
only thing that flows admin←TV.

## The copied blocks (check-sync.py)

```
creator/index.html  ──rules──►  dm/index.html  ──theme──►  dm/tablero.html
```

`dm/index.html` carries a verbatim copy of `<script id="data">`,
`<script id="engine">`, and the functions `blankCharacter()`, `newId()`,
`normalise()` from the creator — what makes accepting an exported `.json`
safe. `dm/tablero.html` carries only the shared theme tokens + the IM Fell
`@font-face`; no components, no board CSS, no rules — it's a renderer with
nothing to reason about.

```bash
python3 dm/check-sync.py    # exit 0 = clean, 1 = drift (prints a diff), 2 = couldn't extract
```

**The source is always the file on the left of the arrow.** Run this after
touching the creator's data/engine/theme blocks — it is not checked
automatically. What's deliberately *not* covered: `featuresFor()` (rewritten,
not copied), drag handling (looks similar, writes to different things),
`script#dm-data`/`script#dm-app`/`script#tv-app`.

## Verifying changes

No test suite. The pattern used during development:

```bash
# syntax of every inline <script> block
python3 - <<'PY' && node --check /tmp/a.js
import re, pathlib
h = pathlib.Path('index.html').read_text(encoding='utf-8')
js = "\n".join(m.group(1) for m in re.finditer(r'<script[^>]*>(.*?)</script>', h, re.S))
pathlib.Path('/tmp/a.js').write_text(js)
PY

# console errors on load
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --virtual-time-budget=4000 --enable-logging=stderr --v=1 --dump-dom \
  "file://$PWD/index.html" 2>&1 | grep -iE 'CONSOLE|Uncaught'
```

Headless Chrome starts with empty `localStorage`, so anything past a bare
load needs a **fixture**: copy the file, splice a `<script>` that seeds
`dnd-dm-v1` *before* `<script id="data">` (the app reads storage as it
boots), append a probe that drives the real DOM events (not the bare
functions) and writes what it found into `document.title` — `--dump-dom |
grep '<title>'` makes the fixture self-checking. Two-window/shared-storage
behavior needs one Chrome profile, two pages, in that order.

## Traps worth knowing before "fixing" them

- **`Number(null) === 0`** and `Number.isFinite(0) === true` — a stored
  `hp: null` ("untouched, therefore full") came back as dead on reload unless
  guarded with `p.hp != null && …`.
- **`JSON.stringify` drops `undefined` keys.** A not-yet-rolled `init` value
  must be sent as an explicit `null`, or the TV renders the literal word
  *undefined*.
- **`??` doesn't catch `NaN`.** `Number(undefined) ?? 1` is `NaN`, which
  throws when assigned to an `<audio>` element's `.volume`. Use
  `Number.isFinite`.
- **Descendant selectors aren't child selectors.** `.turnbar .now` also
  matched `.orderstrip li.now` — scope selectors tightly near shared class
  names like `.now`/`.active`.
- **Percentage `margin-top`/`top`/`height` resolve against the containing
  block's *width*, not height** — this is why the grid needs two separate
  units, `--sq` and `--sqy`.
- **A percentage inside an absolutely-positioned token resolves against the
  token itself**, not the board — cap label width in `cqw` (container query
  units), not `calc(var(--sq) * n)`.
- **An absolutely positioned child's containing block is the padding box** —
  subtract the field's own border from both origin and length when turning a
  pointer position into a grid square, or drops land off by a fraction of a
  square.
- **`.card` was already the creator's chrome class** — the muster's open-card
  wrapper is `.open-card`, not `.card`.
- **`min-width: auto` on a flex item is content-based**, and an `<input>`'s
  intrinsic width (~180px) will refuse to share a row without `min-width: 0`
  on both the input and its wrapping box.
- **Typing `+3` then clicking that same card's `+` doesn't apply both** — the
  `change` event on blur re-renders and detaches the button before its click
  reaches the delegated listener. Expected behavior, not a bug.
- **Headless Chrome won't lay out narrower than 500 CSS px** — it crops the
  screenshot instead (looks like a layout bug). To check phone widths, inject
  `documentElement.style.width` and measure element rects against it, not
  `scrollWidth` (which reports the 500px floor). Exclude anything inside a
  `position: fixed` bar from that measurement — its children report the
  bar's real viewport width, not the injected one.
- **Filenames with spaces**: `url()` around a background-image path must be
  quoted, or a name like `taberna (2).jpg` breaks.

## Scope

**In:** party board, damage/healing/temp HP/death saves, 15 conditions +
concentration, one number to many combatants, 25-deep undo, a fight with
explicit start/membership, one-at-a-time initiative entry, a bestiary,
long rest, session export, a DM-toggled grid independent of scene and combat,
a map image, per-monster reveal, draggable tokens on either window, a manual
sync pause, a scene library with two crossfading audio layers, read-only
story notes.

**Deliberately out:** dice of any kind, spell slots, monster statblocks
beyond name/AC/HP/initiative/note, encounter building, XP, doors, walls, line
of sight, fog of war, light/darkvision, elevation, anything above level 1. A
tile layer with walls and fog shipped once and was removed — it cost more
schema than a DM narrating "you can't see past the door" was ever short of.
