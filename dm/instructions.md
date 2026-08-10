# dm — full functional reference

This is the complete behavioral reference for the `dm/` subproject after the
2026-08 server rebuild and the storage rewrite that followed it (File System
Access API, no server-side campaign files): what the admin window (`/`) and
the television window (`/tv`) actually do, feature by feature. It complements `CLAUDE.md`,
which stays focused on invariants and gotchas *before editing code*; this
document is the "what it does" manual.

The previous, `file://`-era edition of this document — the spec the rebuild
was ported against — is preserved in git history
(`git show 33f423f:dm/instructions.md`).

---

## 1. Purpose & constraints

`dm/` is the DM-facing half of a two-app toolkit for running a level-1-only
D&D 5e (2024 rules) campaign. The admin console is what the DM drives from a
laptop; the tablero is what the players look at — a second window, or any
device pointed at the `/tv` page with the table's room code.

The pages are served by `dm/server.py` (Python stdlib), **deployed on the
home Pi at `https://dm.sigint-pm.uk` — the only way the app is actually
run**; a local `python3 dm/server.py` (port 8420, `$DM_PORT` overridable)
exists for dev and headless verification only. The server is a static host
and a board relay, nothing more: **campaign files never pass through it**,
and it serves **many simultaneous tables**, each partitioned into its own
room (§2). The admin page holds a File System Access grant on the campaign
folder (Chromium-only, so Chrome or Edge; the page needs a secure context —
https or localhost, hence the cloudflared hostname) and reads/writes it
directly:

- **The campaign folder is the single source of truth.** Every change
  autosaves (500ms debounce) into the picked folder — one file per party
  member, monster and scene, plus `session.json` for play state. There are
  no save buttons, no export flow, no re-scan and no merge rules.
- **Disk edits flow in on their own.** The admin re-scans the folder's
  mtimes every 5s (never while its tab is hidden, its own writes excluded)
  and re-adopts whatever moved; editing a note or a monster in a text editor
  shows up in the app without touching anything. (`session.json` is the
  exception: memory wins while a table is open.)
- **Deletes are moves into `trash/`**, never unlink.
- **The creator (`creator/index.html`) is the one source of truth for player
  numbers.** `src/rules/` carries its `data`/`engine`/`character` blocks as
  ES modules (check-sync-guarded); `derive()` turns an exported character
  `.json` into HP/AC/initiative/saves/skills/spell DC/attacks — the DM board
  invents none of it.
- **Nothing here rolls dice.** Initiative totals, damage, healing, death
  saves — all typed in by the DM from what happened at the table.
- **Language split**: all UI copy and rules text are Spanish; every
  identifier, function name, comment and doc is English.

---

## 2. The two windows

Every table is a **room**: a stable 6-char code (unambiguous alphabet, no
0/O/1/I/L) minted the first time a campaign folder is opened and stored
inside it as `.dm-room`, so it survives device switches and re-picks. The
SSE channel, the board post and the move post all carry it — two DMs on two
campaigns share the server without ever seeing each other's television.

The admin opens `/tv?room=<code>` via **Tablero ↗** (a named window, so
pressing it again refocuses); any other device scans the QR in **▦ Conectar
la tele** (the URL carries the room) or opens `/tv` bare and types the code
once into its code screen — the device remembers it (`dnd-dm-tv-room`,
M switches tables). From then on they talk through the server's SSE channel
(`/api/events?room=`):

- The **admin is authoritative**. On every play mutation it rebuilds the
  projection (§10) and `POST /api/board`; the server stores the latest board
  and broadcasts it. A TV that connects late — or reconnects after a wifi
  blip — gets that board replayed in the `hello` event, free.
- The one thing that flows TV → admin is **token position**: a drag on the
  TV posts `/api/move`, the admin clamps it, folds it into
  `session.field.tokens`, saves, and re-broadcasts. Nothing else is ever
  read back.
- Every client stamps its events with its own id and ignores the echo.
- Two admin tabs at once: last-writer-wins, with a persistent warning banner
  on both while it lasts.

---

## 3. Campaign folder mechanics

A campaign is any folder the DM picks — `campaigns/<name>/` in this repo by
convention, but the browser does not care — holding `scenarios/`, `assets/`,
`story/`, `players/`, `monsters/`, and (once played) `session.json`,
`trash/` and `.dm-room` (the table's room code; a dotfile, so the tree walk
and the 5s poll never surface it).

**First run**: until a folder is opened the whole UI is a gate screen with
**Abrir carpeta…** (the OS directory picker, readwrite) and — when a folder
was open before — **Reabrir <nombre>**. Picking an *empty* folder seeds the
five subfolders on the spot (that is the whole "new campaign" flow); a
non-empty folder opens as it is, missing categories reading as empty. The
directory handle persists in IndexedDB and the grant is re-checked silently
on boot — still granted means the campaign reopens by itself, anything else
leaves the gate showing Reabrir (the re-prompt must come from a click). The
header button with the folder's name walks back to the gate.

**Loading** is one `readTree()` walk over the folder (fs.js): every
scenario/player/monster file's text, every story `.md`, the asset paths, and
`session.json` if there is one. Parsing and normalising stay client-side, with the same hand-edit
tolerances as always (envelope or bare object; bare-string art/audio; absent
`volume` defaults to `.5` while a deliberate `0` survives; monster files with
string numbers or `speed: "None"` coerce; a monster file with no `id` is a
fresh entry each read). `players/*.json` **are** the party — there is no
separate import step for a returning campaign, and with no `session.json`
everyone is simply unwounded.

**Writing** is the autosaver: play state to `session.json`; an imported
character to `players/<slug>.json` (the exact creator envelope, so the file
stays interchangeable with what the player sent); a monster to
`monsters/<slug>.json`; a scene to `scenarios/<slug>.json`; a dropped map
image to `assets/maps/<epoch>.jpg`. Paths a file arrived under are reused;
new entities get a slug of their name.

**mesa.json rescue**: dropping an old app's exported `mesa.json` anywhere
(or picking it via Importar) restores the whole session — party and bestiary
land in their own files, wounds/gold/conditions/field survive, the removed
`staged` field and a stamp-based map (bytes this origin can never read) are
dropped.

---

## 4. Storage model

| Where | Holds |
|---|---|
| the picked campaign folder | everything (§3), including the table's room code (`.dm-room`) |
| admin IndexedDB (`dnd-dm`) | the remembered directory handle — a device preference |
| admin localStorage `dnd-dm-audio` | master volume + mute — a room property, outside undo |
| TV localStorage `dnd-dm-tv-audio` | that device's own volume (arrow keys), multiplied with the admin's master |
| TV localStorage `dnd-dm-tv-room` | the joined table's room code (M switches) |
| server memory | per-room latest boards for `hello` replays (idle clientless rooms LRU-pruned), plus the global ephemeral asset cache (sha-256-addressed, LRU ≤128MB) the boards' URLs point into |

`session.json` holds `{version: 2, play, playerFiles, npcs, encounter,
field}` — **not** the party and **not** the bestiary, which live in their own
files. That split is what killed the old three-way merge rules.

---

## 5. Session shape

In memory the session also carries `party` and `bestiary` (injected from
their files at load). The shapes are unchanged from v1 except that
`field.staged` no longer exists:

```js
{
  version: 2,
  party: [ /* whole character objects, creator shape */ ],
  play: { '<charId>': { hp: null /* null = untouched, therefore full */,
    temp, conditions: [], exh, death: {ok, fail}, note, gold, inventory } },
  playerFiles: { '<charId>': 'players/thalor.json' },
  bestiary: [ { id, name, tag, ac, hpMax, initMod, speed, note, portrait,
                abilities: [{id,name,desc}], file } ],
  npcs: [ /* bestiary shape + play state mixed in — spawned instances */ ],
  encounter: { on, round, activeRef, members: ['pc:<id>','npc:<id>'],
               init: { 'pc:<id>': 17 } },   // absent ref = hasn't rolled, not "out"
  field: { cols, rows, live, grid, sceneId, map: {src}|null, audio|null,
           paused, tokens: {'<ref>': {x,y}},
           reveal: {'<npcId>': {on:false, hp:'coarse'}}, benched: ['pc:<id>'] },
}
```

`normaliseSession()` still reads every older shape (v1 mesa.json included):
pre-scenes saves default `live`/`grid` to true, `encounter.on` is inferred
from members when absent, stale refs are dropped everywhere, `hp: null`
round-trips as null, and `staged` is read and discarded.

---

## 6. The five tabs

**Juego / Jugadores / PNJ / Escenas / Historia**, with live counts. Escenas,
PNJ and Historia have filter boxes once there is something to filter.

- **Jugadores** — the party out of combat. **Importar** (or dropping `.json`
  anywhere) merges by character id — a re-import never costs the party its
  wounds, though a lowered max clamps them. **Descanso largo** = full HP,
  clears temp/conditions/death saves, −1 exhaustion. Cards carry the bench
  toggle.
- **PNJ** — the bestiary: templates, not instances. The wizard edits
  name/tag/CA/PG/mod/notes/abilities/portrait (portraits downscale to 512px
  JPEG, stored base64-in-file); saving writes the file, Borrar trashes it.
- **Escenas** — library grid or full-screen editor, never both. Putting a
  scene on the table happens from Juego's picker, not here.
- **Historia** — §9.
- **Juego** — the three-way branch: fight screen / "nothing live" / muster.

---

## 7. Core combat/board model

Unchanged from the original design; the load-bearing distinctions:

1. **Loading ≠ fighting ≠ visible.** An npc reaches the board via load
   (picker, muster, or a scene roster resolving); `field.reveal[id].on`
   decides whether the TV ever hears of it (hidden by default); membership in
   `encounter.members` decides whether its card shows numbers — a loaded
   npc outside the fight is scenery. Players are always tracked, never
   revealed-gated; **benching** is their only off-board state.
2. **Empezar combate** always opens the muster picker — nobody ticked by
   default, benching togglable in place, unloaded bestiary entries loadable
   with a stepper, each npc row carrying the 👁/🙈 that folds into `reveal`.
   Confirming opens the initiative wizard: one name, one box, Enter; blank =
   "hasn't rolled", not "out"; typed numbers survive the modal closing.
   Starting the fight sets members/init/round and forces `live` — never
   `grid`.
3. **Terminar combate** resets only round/turn/membership/initiative (and
   the wizard's remembered numbers). Npcs stay exactly where and how wounded
   they were; players can never be deleted, only benched.
4. **Grid vs live vs combat are three independent facts.** A scene going
   live always forces `grid` off (full-bleed art); the DM re-decides per
   scene. Tokens travel to the TV only in grid mode.
5. **Tokens** drag with pointer events on both windows (one code path,
   mouse and touch); a tap that moves <4px selects instead, lighting
   **Chebyshev** reach (diagonal = one square, 2024 rules), clamped, no
   walls. A drag is not an undo step in either direction.
6. **Pausar tablero** gates every board POST: arrange an ambush off-screen,
   then **Enviar al tablero** pushes once. Persists across reload; not an
   undo step.

---

## 8. Card / HP grammar

One damage-expression box per card, committed on blur or Enter:
`7`/`-7` damage (temp absorbs first, floors at 0) · `+3` heal capped at max ·
`t5` set temp (replaces, never stacks) · `=11` set total (raises a
*monster's* max; a player's max stays `derive()`'s). Anything else is
rejected. Landing above 0 clears death-save pips. ±1 quick buttons beside.

Tick several cards → one shared box with **Aplicar**/**Mitad** (half,
floored) — one undo step for the batch. Gold has its own `=`/`+`/`-` grammar
(floored at 0) plus a free-text inventory box. **Undo** is a 25-deep
whole-session snapshot stack; drags, pause, volume and scene drafts are
deliberately not steps. Death saves appear only for a player at 0 HP (3
fails = muerto, 3 successes = estable); a monster at 0 greys out and loses
its turn but keeps its card. The 15 SRD conditions + concentration show
their rules text on tap; exhaustion counts 0–6 and clears past 6. `0 of 0`
reads as *ficha incompleta*, never dead.

---

## 9. Scenes and Historia

A **scene** is prep — name, art, two audio layers, an optional column-count
override (rows always derive from the art's real proportions), a roster, a
note — in its own `scenarios/*.json`. The editor is a full screen with a
live-drag **Reparto** board at the scene's own eventual grid size; nothing is
real until Guardar. **A la tele** is the only scene action (Preparar was
removed in the rebuild): it goes live, forces grid off, applies the scene's
grid size, copies the scene's art/audio paths into the field (they stay
campaign-relative paths — this window resolves them to object URLs to render,
the board push resolves them to relay URLs for the TV), and seats one fresh
npc instance per roster entry — skipping occupied squares, so going live twice never
double-seats. **Sin escena** clears art/audio/grid.

**Audio** plays only on the TV ("it's the window with speakers"): two layers
× two `<audio>` elements swapping roles for a real crossfade, one 50ms
ticker walking all four volumes over ~900ms, pausing at zero. The unlock
pill appears only on a genuine `NotAllowedError`; any tap or key unlocks.
Admin master (and mute) ride in the payload; each TV multiplies its own
local volume on top.

**Historia** is `story/**/*.md`, grouped by first subfolder (bare files
under "General", groups fold shut per window — search overrides the folds),
title = first `#` heading else humanized filename. Rendering is the small
non-CommonMark subset (headings pushed down two levels, bold/italic,
bullets) with `[[wikilinks]]` — **including the piped `[[target|label]]`
form** — `#tags` (a tag click = a search shortcut), and a "Mencionada en"
backlinks footer. Notes are editable in place, WYSIWYG: the body is
contentEditable, so the caret lands wherever you click and the formatting
never leaves — you type inside headings, bold and bullets as they look,
and `domToMd()` folds the DOM back into markdown for the autosave.
Wikilinks and tags are non-editable atoms (they navigate on click and
round-trip verbatim through their `data-md` attribute); pasted content is
inserted as plain text. Esc or clicking away ends the edit. "+ Nueva nota"
creates `story/<carpeta>/<slug>.md`. There is deliberately **no delete
button** for notes (one too many accidents): a note is removed by deleting
its file on disk. A text editor works exactly as before — the 5s poll makes
either side's edits appear; last writer wins. One consequence to know: an in-app
edit re-serialises the whole file from the rendered subset, so
hand-wrapped long lines unwrap and any markdown the renderer flattens
(numbered lists, quotes, code fences) is flattened in the file too.

---

## 10. The TV projection

Built by `buildBoard()` (pure, unit-tested), pushed on every unpaused
mutation:

```js
{ seq, cols, rows,
  mode: 'idle' | 'scene' | 'field',
  map: {src} | null,                       // src is a ready-to-load /api/asset/ URL
  audio: {music, ambience, master} | null, // master 0 when muted
  banner: {round, active} | null,          // null unless a fight is on
  order: [ {name, portrait, kind, active, down} ],  // hidden npc = '···', no portrait
  party: [ {name, portrait, colour, hp, hpMax, temp, state} ],
  npcs:  [ {name, portrait, hp} ],         // loaded AND revealed; hp null outside a fight
  tokens: [ {id, name, kind, colour, x, y, active, hp, conditions, reach} ] }
```

A hidden npc is **absent** from `npcs` and `tokens` — devtools on the TV
teach nothing. Npc HP travels exact, or as one of five coarse words (*ileso /
herido / malherido / grave / fuera de combate*), per-npc; players are always
exact. `reach` always travels (planning positions is useful before a fight);
`tokens` is forced empty outside `'field'` mode.

---

## 11. Server API

Campaign files have no endpoints at all — the admin reads and writes the
picked folder itself, in the browser. What remains:

| Endpoint | Purpose |
|---|---|
| `GET /` · `GET /tv` | the two pages; `/src`, `/vendor` static (dm/-confined, dotfiles invisible, Range supported) |
| `GET /api/ping` | `{app, pid, lanUrl}` — duplicate-start detection + the TV address |
| `POST /api/board` · `POST /api/move` | store+broadcast / broadcast, scoped to the `room` in the body (missing/invalid → 400); the board reply lists referenced asset hashes the relay lacks, so the admin re-uploads and re-posts by itself |
| `PUT/GET /api/asset/<sha256>` | the ephemeral asset cache the TV loads maps/audio/portraits from: RAM-only, hash-verified on upload (no poisoning), LRU ≤128MB, Range for audio — deliberately global, not per-room (content addressing cannot collide) |
| `GET /api/events?room=` | SSE, one room: `hello` (that room's board replay + admin count), `board`, `move`, `clients`, 15s heartbeats |

---

## 12. Sync with creator/ and verification

`check-sync.py` compares the creator's inline blocks against
`src/rules/*.js` (export/import syntax stripped) and its theme block against
`src/styles/tokens.css`. Exit 0/1/2, diff on drift, source is always the
creator.

Unit tests: `node --test dm/src/lint.test.js dm/src/shared/shared.test.js
dm/src/tv/audio.test.js` — HP grammar, coarse words, reach, scene
tolerances, wikilinks with pipes, projection filtering, session
normalisation, fade math, and a source lint for htm's unclosed-void-element
trap. UI verification is headless-Chrome probe pages; the recipe and its
traps live in `CLAUDE.md`.
