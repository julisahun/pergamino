# dm — combat tracker and battle map (File System Access storage)

A small relay server (`server.py`) plus two pages it serves: `/` is the
admin window (what the DM drives, `index.html` + `src/admin/`), `/tv` is the
television (`tv.html` + `src/tv/`), reachable from **any device on the LAN**.
Start everything by double-clicking `DM.command` (or `python3 dm/server.py`).
See the root `CLAUDE.md` for repo-wide rules; `instructions.md` is the full
behavioral reference.

**Campaign files never touch the server.** The admin page holds a File
System Access grant (Chromium-only; needs a secure context — localhost or
https) on whatever folder the DM picked, reads and writes it directly
(`src/admin/fs.js`), and remembers the handle in IndexedDB. The server is
static files + the board/move relay + an ephemeral RAM asset cache
(`/api/asset/<sha256>`) the TV fetches maps/audio/portraits from — there is
no endpoint that can read or write a campaign file, which is what makes
running it beyond the laptop (e.g. the Pi) a non-question for the data.

```bash
python3 dm/server.py --no-browser   # dev; DM.command is the table-side way
DM_PORT=8085 python3 dm/server.py --no-browser   # deployed port override
```

**It invents no rules and rolls no dice.** Every player number comes from
`derive()` in `src/rules/engine.js` — a copy of the creator's engine, guarded
by `check-sync.py` — run against the `.json` a player exported. Every roll at
the table is physical: initiative, damage and death saves are *entered*.

## The one storage story

The campaign folder — any folder the DM picks; `campaigns/<name>/` by repo
convention — **is** the database. Nothing lives anywhere else; there are no
save buttons and no merge rules:

| What | File | Written when |
|---|---|---|
| play state (hp, npcs, encounter, field) | `session.json` | autosaved, 500ms debounce |
| a party member | `players/<slug>.json` | on import only — the DM app never edits sheets |
| a bestiary entry | `monsters/<slug>.json` | wizard save / "Guardar en los PNJ" |
| a scene | `scenarios/<slug>.json` | editor Guardar |
| a dropped map | `assets/maps/<epoch>.jpg` | on drop (≤1920px JPEG) |
| a note | `story/**/*.md` | Historia's WYSIWYG editor (`domToMd`), autosaved — or any text editor, same file. An in-app edit re-serialises the file from the rendered subset: wrapped lines unwrap, constructs the renderer flattens get flattened. |

Deletes go to the campaign's `trash/`, never `unlink` (a copy plus
`removeEntry` — the FS API has no rename). Editing any file on disk shows up
in the app by itself: the admin re-scans mtimes every 5s (hidden tab: paused;
its own writes: suppressed) and re-reads what moved. `session.json` is the
one exception — while a table is open, memory wins over external edits.

`field.map`/`field.audio` hold **campaign-relative paths** (that is what
`session.json` persists). This window resolves them through `urlFor` (an
object-URL cache over the local files); the board push resolves them — and
portraits — to `/api/asset/<sha256>` relay URLs, uploading whatever the
current board references that the relay does not already hold.

The admin's device preferences: the remembered folder handle (IndexedDB
`dnd-dm`) and master volume/mute (localStorage `dnd-dm-audio`). The TV
device keeps its own local volume (`dnd-dm-tv-audio`, arrow keys). None of
that is session state.

## The two windows

The **admin tab is authoritative**; the server is a relay (all game logic in
JS, none in Python). Sync is Server-Sent Events on `/api/events`, one global
channel:

- Admin mutation → `buildBoard()` → `POST /api/board` → broadcast → TVs
  render. `field.paused` gates that POST (**Pausar/Enviar al tablero**).
- TV drag → `POST /api/move` → admin folds it into `session.field.tokens`,
  saves, re-broadcasts. Positions are the only thing that flows back.
- A late/reconnecting TV catches up from the `hello` snapshot the server
  replays on connect; EventSource reconnects on its own.
- Two admin tabs = last-writer-wins plus a visible warning (`admins` count).

`dnd-dm-board` is gone; the projection (see `src/shared/board.js`) travels
over SSE only, with every asset path pre-resolved to a URL — a hidden npc is
**absent** from the payload, not unrendered, and the TV never even learns
the campaign's name.

## Code layout

```
server.py           stdlib HTTP: statics + SSE relay + ephemeral asset cache
                    (~350 lines, no pip deps, $DM_PORT override)
index.html, tv.html thin shells; all logic in native ES modules
vendor/             preact.mjs + htm.mjs, committed, no npm
src/rules/          data.js, engine.js, character.js — creator copies (check-sync)
src/shared/         pure model: session, beasts, scenes, combat, board, story, util, qr
                    (node --test-able; DOM needs are injected: aspectOf, urlFor)
src/admin/          fs.js (File System Access + IndexedDB handle), api.js
                    (fs wrappers + SSE + asset uploads + Autosaver), store.js
                    (state + undo + urlFor/relay caches + board push), app.js,
                    main.js (boot + 5s poll), one module per tab, field.js
                    (the drag board), modals.js
src/tv/             main.js (SSE), board-view.js (renderer), audio.js (crossfade)
src/styles/         tokens.css (check-synced), fonts.css, admin.css, tv.css
```

`store.js` has the three verbs: `update()` (re-render only — ui state,
drags, volume), `commit(label, fn)` (undo step + autosave + board push —
every play mutation), `updateSession()` (persist + push, NOT an undo step —
token drags, pause, resize). The undo stack is 25 deep, whole-session
snapshots, and never rewrites entity files.

## check-sync.py

```
creator/index.html ──rules──► dm/src/rules/{data,engine,character}.js
creator/index.html ──theme──► dm/src/styles/tokens.css
```

Same contract as always (exit 0/1/2, diff on drift), but the right side is
now the modules: it strips `export ` prefixes and `import` lines before
comparing. Run it after touching the creator's data/engine/theme blocks or
anything under `src/rules/`. `tokens.css` keeps the creator's literal
`shared tokens` banner and `* { box-sizing }` line — the extractor anchors
on them. Retires when creator/ is rebuilt onto these modules.

## Verifying changes

```bash
node --test dm/src/lint.test.js dm/src/shared/shared.test.js dm/src/shared/qr.test.js dm/src/tv/audio.test.js
python3 dm/check-sync.py
```

Beyond units, the pattern that works (see git history for examples):

1. **Bare load**: headless Chrome `--timeout=6000 --dump-dom` against
   `http://127.0.0.1:8420/`, grep stderr for `CONSOLE.*rror`. (`--timeout`
   alone freezes timers; `--virtual-time-budget` advances them but races
   ahead of real network and hangs on the never-idle SSE stream.)
2. **Behavioral probes**: a temporary page under `src/` (so the server will
   serve it) with a `<script type=module>` that imports the real modules and
   drives them, run plain headless (no dump flags) for N real seconds, and
   have the probe **report via `POST /api/board`** with a `probeReport`
   field — read it back from the SSE `hello` snapshot with curl.
   `--dump-dom` fires at the load event, before any async work, so it only
   ever shows the empty shell. For a campaign folder without a picker
   gesture, use OPFS: `navigator.storage.getDirectory()` hands you a real
   `FileSystemDirectoryHandle` (fs.js's `hasPermission` treats its missing
   `queryPermission` as granted for exactly this). Delete the probe page
   after.
3. The TV's audio unlock cannot be probed (synthetic taps are
   `isTrusted: false`) — that one is a manual check.

## Traps worth knowing before "fixing" them

- **htm does NOT auto-close void elements.** `<input>` without `/>` adopts
  its following siblings as children; the symptom is an `insertBefore`
  TypeError on the *second* render, far from the cause. `lint.test.js`
  scans for it — keep it passing.
- **Grammar boxes are uncontrolled** (`defaultValue`, commit on
  change/Enter). Making them controlled re-renders under the caret.
- A JS block comment cannot contain a glob like `story/**` followed by
  `*.md` — the `*/` inside ends the comment.
- `Number(null) === 0`: `hp: null` means "untouched, therefore full" and is
  guarded with `!= null` everywhere. Never "simplify" that.
- `??` doesn't catch `NaN` — `Number.isFinite` before any `<audio>.volume`.
- Real monster files carry `ac: "10"` and `speed: "None"` — `normaliseBeast`
  coerces; unparseable speed is `null` (reach unknown), not `NaN`.
- `setPointerCapture` throws on synthetic pointers and some TV browsers —
  both drag handlers wrap it in try/catch on purpose.
- **`backdrop-filter` makes an element the containing block for its `fixed`
  descendants.** `header.top` carries a blur — never put a
  `position: fixed` element inside it (or any blurred ancestor); it will pin
  to the ancestor's box instead of the viewport.
- Headless Chrome clamps the window to ~500px wide even with
  `--window-size=390,…` — the PNG comes out 390 wide but *cropped*, so a
  "phone" screenshot can show fake horizontal overflow. Verify at ≥500px or
  probe `innerWidth` before trusting it.
- Percentage `top`/`height` resolve against the containing block's *width*
  — the grid keeps two units, `--sq` and `--sqy`; token labels are capped in
  `cqw`; drop math subtracts the field's border (padding-box rule).
- Spaced filenames (`Medalla del Tratado.md`): `encodePath()` for URLs,
  quoted `url("…")` in CSS.
- SSE responses must not set Content-Length, must flush per event, and the
  handler thread dies via `BrokenPipeError` — that's the reaper, not a bug.
- An HTTP handler that rejects a PUT **without reading its body** poisons
  the keep-alive connection — the unread bytes parse as the next request
  (symptom: a stray 501 on the following call). Drain or set
  `self.close_connection = True` before failing.
- Chromium's `createWritable()` stages into a sibling `.crswap` file —
  fs.js's walkers skip them (and dotfiles, and `trash/`) or every autosave
  would look like an external edit.
- The 5s poll tells its own writes apart by mtime (`api.js` keeps
  `baseline`/`ownWrites`); bypassing `putFile`/`deleteFile` for a write
  makes it look external and triggers a re-read.

## Scope

Everything the old app did (see `instructions.md`) **minus Preparar**
(staged scenes) — "A la tele" is the only scene action. Still deliberately
out: dice, spell slots, statblocks beyond name/AC/HP/initiative/note,
encounter building, XP, walls, line of sight, fog of war, anything above
level 1.
