# dm — the DM's table

Two pages served by a static Python file host: `/` is the admin window (what
the DM drives), `/tv` is the television (what the players look at). The
campaign folder is the database, read and written by the browser itself.

See the root `CLAUDE.md` for repo-wide rules; `instructions.md` is the full
behavioural reference, and `importing.md` is the spec for converting an outside
campaign into a campaign folder.

```bash
python3 dm/server.py --no-browser --dev     # dev; --dev also serves probes/
node --test "dm/src/**/*.test.js"           # the model
tsc -p dm/jsconfig.json                     # the types (global typescript)
node dm/check-campaign.js campaigns/example # the campaign linter
dm/probes/run.sh mesa                       # one browser probe
```

## The one rule this app is organised around

**No state reaches the television without being stated, in one vocabulary, in
one place.**

The previous version was rebuilt because it broke that rule six ways at once:
the television's rendering was computed from `live` and `grid` at push time, so
what the players were looking at existed nowhere — not in the file, not on the
DM's screen. The header said "En vivo" when it meant "not paused". A dropped
map silently cleared the scene. `ui.tab` was written from eleven places.

Everything below is a consequence of that rule.

## The nine invariants

1. **Two mutation verbs, no third path.** `commit(label, fn)` is an undo step;
   `tweak(fn)` is not, and every `tweak` call site says in one line why not.
   Nothing else touches the session. `store.js` owns both.
2. **Nothing navigates for you.** `ui.tab` is written by a tab click and by
   boot (`firstTab()`), and by nothing else — not by an import, not by putting
   something on the television, not by a scene going up.
3. **One vocabulary for the television**: *nada · escena · tablero*, and
   *en pausa*. "En vivo" is not a phrase this app uses. `MODES` in
   `shared/field.js` is that vocabulary; the control, the header chip and the
   mirror all render from it.
4. **The admin mirrors the television.** Both windows render
   `shared/view/tablero.js` over the same `buildProjection()` output; the only
   difference is `audience`, which decides whether hidden creatures survive
   (marked) or are absent.
5. **No fact stored twice.** `field.mode` is stored and nothing derives it;
   every number on a character card is derived and nothing stores it.
6. **Every write names where it went.** `wrote()` flashes the file and the
   layer: «Vann guardado en `runs/guils/monsters/vann.json` — sólo esta mesa.»
7. **`tsc -p dm/jsconfig.json` is clean, always.** The model is typed first
   (`shared/types.js`); that is what would have caught the flag confusion.
8. **Spanish UI and rules text, English code, identifiers, comments and docs.**
9. **No npm, no pip, no build output, no bundler, no `package.json`.**

## Storage: the campaign folder is the database

The admin holds a File System Access grant on the folder the DM picked
(Chromium-only, secure context — https, or localhost). No server reads or
writes a campaign file, and `server.py` has no endpoint that could.

| What | Where | When |
|---|---|---|
| play state | `session.json` in the open run | autosaved, 500ms debounce |
| a party member | `runs/<mesa>/players/<slug>.json` | on import and on levelling, in the creator's own envelope |
| a monster · an object · a scene | `monsters/` `objects/` `scenarios/`, in the layer the DM picked | on Guardar |
| a dropped map | `assets/maps/<epoch>.jpg`, in the layer the DM picked | on drop |
| notes | `story/**/*.md` and every `.md` inside the mesa | **never** — notes are read only |

Deletes are moves into `trash/`, never unlinks. Edits made outside the app
arrive by themselves: a 5s mtime scan (paused while hidden, own writes excluded
by the mtime they landed with) re-reads whatever moved. `session.json` is the
exception — memory wins while a table is open.

## Two layers

A campaign holds the preparation every table shares. `runs/<mesa>/` holds one
table's own party, play state, notes, and its own monsters/objects/scenes/
assets, which **shadow the campaign's by id**. A campaign with no `runs/` is
flat: the root is its one implicit run, there is one layer, and nothing ever
asks. `shared/runs.js` is the whole arithmetic, and `classify()` is the single
answer to "what can the app see".

- **Every save asks which layer**, when there are two — new entities and edits
  alike, a map dropped mid-combat included (`admin/layers.js`).
- **Saving «a la campaña» something the mesa has its own copy of promotes it**:
  the shared file is written and the run-local one is trashed, because leaving
  both means the copy you just made goes on hiding the file you just saved.
- **Deletes**: a mesa's own files from inside it; the campaign's from
  preparation-only mode, which is a real third choice in the picker.
- `layerOf(path)` is a fact about the path; `isMine(run, path)` is a fact about
  who is asking. Conflating them made another table's file look deletable.

## The two windows

The television is a second window on the same machine, so they talk over a
`BroadcastChannel` (`shared/bus.js`): no relay, no room codes, no network hop,
and **no campaign byte leaves the browser** — asserted in `probes/tele.html`
against the TV window's own resource timeline.

- `hello` (tv → admin) is what lets a window that opened second catch up.
- `state` (admin → tv) carries the projection **and the directory handle**, so
  the television opens pictures and sound for itself. Paths travel as paths.
- `move` (tv → admin) is the only thing that flows back.
- `trouble` (tv → admin) is the television saying it cannot read the folder —
  out loud, on both screens, rather than quietly showing nothing.

## Code layout

```
server.py           static host; /, /tv, /src, /vendor, /api/ping. --dev adds /probes
check-campaign.js   the campaign linter (node, no deps; knows about runs/)
jsconfig.json       tsc --checkJs, noEmit, strict
index.html tv.html  thin shells
vendor/             preact.mjs + htm.mjs verbatim, plus hand-written .d.mts
src/rules/          data, engine, character, levels — the numbers. Ours now:
                    the creator is a supported input format, not a sibling
src/shared/         types (the model), field, session, runs, combat, play,
                    projection, scenes, story, beasts, objects, handles, bus,
                    files, util, view/tablero (drawn by BOTH windows)
src/admin/          fs (grants + tree), disk (writes + poll), store (state and
                    the two verbs), campaign (open/read/poll), app (screens and
                    tabs), one module per tab, layers (the layer question),
                    entities, cards, combate, subir, broadcast
src/tv/             main (bus + resolve + render), audio (crossfade)
probes/             headless-Chrome verification; run.sh <name>
```

## Traps worth knowing before "fixing" them

- **htm does NOT auto-close void elements.** `<input>` without `/>` adopts its
  following siblings as children; the symptom is an `insertBefore` TypeError on
  the *second* render, far from the cause. `lint.test.js` scans for it — and
  scans only the static chunks of template literals, because stripping comments
  first eats `accept="image/*"` and everything after it.
- **A JS block comment cannot contain a glob** whose star-slash closes it. This
  repo has paid for that twice; `lint.test.js` says so at the top.
- **`@import` in JSDoc only works inside `/** … *&#47;`**, not a plain `/* … *&#47;`.
  The symptom is `Cannot find name 'Session'` in a file that plainly imports it.
- **Grammar boxes are uncontrolled** (`defaultValue`, commit on change/Enter).
  Making them controlled re-renders the input under the caret.
- **`Number(null) === 0`**: `hp: null` means "untouched, therefore full" and is
  guarded with `!= null` everywhere. Never "simplify" it.
- **A fresh table has no `live`/`grid` to migrate**, so it shows *nada*. Reading
  the legacy default there opened every new campaign on a bare grid.
- **`??` doesn't catch `NaN`** — `Number.isFinite` before any `<audio>.volume`.
- Real monster files carry `ac: "10"` and `speed: "None"`; `normaliseBeast`
  coerces, and an unparseable speed is `null` (reach unknown), not `NaN`.
- **`setPointerCapture` throws** on synthetic pointers and some TV browsers —
  the drag works without it, so it is wrapped in try/catch on purpose.
- **`backdrop-filter` makes an element the containing block for its `fixed`
  descendants.** Never put one on an ancestor of the flash or a modal.
- **Percentage `height` resolves against the containing block's width** unless
  that block has a definite height. The board gets its shape from
  `aspect-ratio`, which is what keeps a square square.
- **The board is sized in container units** (`cqh`/`cqw`), never viewport
  units, because the same component fills a television and a 20rem mirror.
- Chromium's `createWritable()` stages into a sibling `.crswap` file — the
  walkers skip them (and dotfiles, and `trash/`) or every autosave would look
  like an edit made outside the app.
- The 5s poll tells its own writes apart by mtime; bypassing `disk.js` for a
  write makes it look external and triggers a pointless re-read.

## Verifying changes

`node --test` for the model. For anything on screen, a probe: a page under
`probes/` that imports the real modules, drives the real components, and
reports by `console.log` — `probes/run.sh <name>` reads it back off Chrome's
stderr. `probes/kit.js` wraps every probe so an exception becomes a failed
check rather than a silent hang.

Headless-Chrome traps that still bite: `--dump-dom` fires at the load event and
shows only the empty shell; `--timeout` alone freezes timers;
`--virtual-time-budget` races real work and hangs; `window.open` needs
`--disable-popup-blocking`; and the window clamps to ~500px wide regardless of
`--window-size`.

## Deliberately not here

Dice of any kind. Walls, line of sight, fog of war. Encounter building, XP.
Monster attack statblocks beyond name/AC/HP/initiative/speed/note/abilities.
Keyboard-driven combat. An auto-written bitácora. Staged scenes. Multiclassing.
A character creator — a sheet is built in `creator/`, and this app reads it.
Class features as data: what a feature *does* is free text the DM writes, which
is why `rules/levels.js` is a hundred lines and not a transcription project.
