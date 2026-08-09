# creator — D&D 5e (2024 rules) character creator, level 1

A single self-contained HTML file (`index.html`, ~380KB) that walks a
first-time player through building a level-1 character and prints it on A4.
See the root `CLAUDE.md` for repo-wide rules — this file is the detail
specific to this tool.

```bash
open index.html
```

**This file is the source of truth** for character rules in this repo.
`dm/index.html` carries a verbatim copy of its data/engine blocks and a few
helper functions — see [dm/CLAUDE.md](../dm/CLAUDE.md#the-copied-blocks-check-syncpy).
**After editing anything in `<script id="data">`, `<script id="engine">`, or
the theme tokens, run `python3 ../dm/check-sync.py` before considering the
change done.**

## Screens

Four, mobile-first, no tab bar (the wizard is a wizard):

| Screen | What it is |
|---|---|
| **Roster** | Every saved character — new, open, edit, duplicate, download `.json`, delete, import |
| **Wizard** | One decision per screen, back/next only, progress bar |
| **View** | The character laid out for reading at the table |
| **Edit** | One page, collapsible sections, reusing the wizard's step views |

**Siguiente** disables while a required choice is missing and names which
one; advice never blocks. **The A4 sheet is never on screen** — it's rendered
into `#print-area`, revealed only by `@media print`, so 🖨 always produces the
same sheet regardless of which screen you're on.

## The look

**One theme, no picker: "pergamino"** (aged parchment, IM Fell English SC
headings, ❦ flourishes). There used to be four themes on `data-theme` with a
picker (`dnd-creator-theme` in storage) — all removed, so nothing can drift
out of visual sync across this file, `dm/index.html` and `dm/tablero.html`.
Tokens (`--seal`, `--panel`, `--display`, `--orn`, …) hold the palette in one
place; the **ornament block** near the bottom of the stylesheet is pure
decoration (centred headings, flourishes) and can be deleted without breaking
anything.

The display face is **base64 woff2, embedded** (a `file://` page can't fetch
anything) — IM Fell English SC, headings only, body stays on system serif,
OFL 1.1 © Igino Marini.

## Storage

```js
// localStorage key: dnd-creator-v2
{ version: 2, characters: [ { id, updatedAt, ...character } ] }
```

A `dnd-creator-v1` save (single character) migrates on first load, not
dropped. `normalise()` backfills any field a stored character is missing, so
old saves keep opening as the schema grows. Export writes
`{ kind, version, character }`; **import always lands as a new character**
with a fresh id — a teammate's file can never overwrite one of yours. (`dm/`
deliberately differs here: it matches on `character.id` so a re-sent sheet
updates the board without losing tracked wounds.)

## The questionnaire

Species and class are picked from lists; everything else comes from
**fourteen situational questions**, one per screen — each answer spreads
weight across five channels (`bg` background, `ab` ability priority, `sk`
skill affinity, `kit` fighting style, `tone` personality). `quizResult(state)`
sums them into a complete, legal proposal; `applyQuizResult()` writes it to
state. Nothing is locked afterward — every later step is the same editing UI.

Two hard overrides on top of the quiz, because taste shouldn't produce an
unplayable level-1 character:
- the class's primary ability (and a caster's casting ability) always gets 15
- **Constitution never drops below third place** (always 13+)

Calibration is checkable: `kit` weights are ~25/24/20/19 across styles, and
over 400 answer sets each style wins a real share (melee 42%, ranged 25%,
subtle 17%, support 17%). Worth re-measuring if the questions are edited — an
earlier weighting made ranged never win.

Weapon masteries follow: weapons the chosen package grants → fighting style →
damage. Story suggestions in the last step come from the top tones via
`TONE_STORY`.

## Scope (level 1 only)

Deliberately excludes subclasses (level 3), ability score improvements
(level 4), spells above level 1.

- **9 weapons**: dagger, quarterstaff, mace, shortsword, longsword, greataxe,
  shortbow, longbow, warhammer — covers all 12 classes, keeps 7 of 8 mastery
  properties alive (Graze is the one gone), every weapon in ≥1 starting
  package.
- **10 species** with lineages and, where rules allow, a size choice.
- **12 classes** at level 1, including level-1 choices that change
  proficiency (Fighting Style, Divine Order, Primal Order) and mastery.
- **16 backgrounds**, each with ability improvements, origin feat, skills,
  tool, equipment package.
- **10 origin feats**, with mechanical ones wired into the engine (Tough →
  HP, Alert → initiative proficiency, Skilled → skills, Magic Initiate →
  spells).
- **33 cantrips + 63 level-1 spells**, each with school/casting
  time/range/components/duration/concentration/ritual + a short summary.
- **14 questions × 4 answers**, plus curated offensive/support spell
  shortlists per casting class.

Not included: levels 2–5, buying equipment with gold, standard array/4d6
scores, a random character generator.

**Known soft spot:** starting **equipment packages** — the package-or-gold
structure is certain, the exact item lists less so. The gold-only option is
always safe.

## Printing

One A4 page; a **second page appears only if the character casts** (any
caster feature, including one granted by a background/feat). Paper is
**ink-light**: `@media print` strips parchment tints/fills/shadows, leaving
black line art on white. What survives: IM Fell small caps, ❦ before each
heading, double rules, 8.6pt body.

**Only text, borders, and inline SVG are guaranteed to print.** Chrome hides
background graphics (`background`, gradients, `background-image`) unless the
reader finds the *Background graphics* checkbox — `print-color-adjust: exact`
does not reliably override this. Every decorative element on the sheet is
therefore inline SVG stroked in `currentColor`, held in the `ORN` object, or a
plain border. This was **measured**, not assumed: `--print-to-pdf` is more
permissive than the real print dialog and will lie to you.

Layout, top to bottom: name/identity, a flourish, vitals (AC in a heraldic
shield, HP in a cut-corner box, initiative in a hexagon, 4 plain boxes), six
abilities full-width, then **one balanced two-column flow** (`columns: 2`) —
skills, attacks, spells, features, equipment, proficiencies, trackers,
history — closing flourish and footer, all inside a ruled frame. A fixed
two-column split was tried and wastes ~56mm on the shorter side; the flow
reclaimed ~90mm, which pays for the frame/flourishes/drawn shapes.

Most blocks are `break-inside: avoid`; the two long ones (skills, features)
are `.long` and may split. `h3` is `break-after: avoid`. Two column-width
consequences: attacks put weapon properties/mastery on their own line rather
than a 4th column (tried full-width above the flow — costs more page than it
saves); the casting block on page 2 holds numbers only, not spell names
(already listed in full elsewhere on that page).

## File layout

```
<script id="data">    frozen rules tables, no calculations
<script id="engine">  pure functions (derive(), validate(), …), never touches the DOM
<script id="app">     storage, router, screens, listeners
```

`library` holds every character; `state` points at the one being edited —
every view/engine call takes a plain character object. Inputs write to
`state` then call `render()`; values are never read back out of the DOM. Text
inputs repaint only `#print-area`, not the form, so typing doesn't steal
focus.

Two things survive re-render on purpose: which editor sections are open
(`openSections`, via a capturing `toggle` listener — `toggle` doesn't bubble),
and `wizardStep` (stored on the character).

**Validation notices carry step ids, not indices**
(`push('error', 'trasfondo', …)`) — inserting a step never silently
mispoints an existing warning. `stepIndex(id)` resolves ids for navigation.

Adding a class or background = one data-block entry; the engine and sheet
need no changes. Every derived number goes through `derive(state)`; every
notice through `validate(state)`.

## Verifying changes

No test suite; checks below are run by hand.

```bash
# JS syntax of every inline script block
python3 - <<'PY' && node --check /tmp/creator.js
import re, pathlib
h = pathlib.Path('index.html').read_text(encoding='utf-8')
js = "\n".join(m.group(1) for m in re.finditer(r'<script[^>]*>(.*?)</script>', h, re.S))
pathlib.Path('/tmp/creator.js').write_text(js)
PY

# console errors on load
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --virtual-time-budget=4000 --enable-logging=stderr --v=1 --dump-dom \
  "file://$PWD/index.html" 2>&1 | grep -iE 'CONSOLE|Uncaught'

# A4 pagination — count /Type /Page objects, no PDF lib needed
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf=/tmp/sheet.pdf "file://$PWD/index.html"
```

Headless Chrome starts with empty `localStorage`, so anything past a bare
load needs a **fixture**: copy `index.html`, append a `<script>` that drives
the app's *own* engine (not a hand-written character object) to seed one:

```js
library = { version: 2, characters: [] };
state = normalise({ name: 'Thalor Vaelen', player: 'Juli' });
library.characters.push(state);
pick('species', 'elfo'); /* ...set lineage/size/skills... */
pick('class', 'mago');
QUIZ.forEach((q, i) => { state.quiz.answers[q.id] = i % 4; });
applyQuizResult();
screen = 'view'; render();
document.title = JSON.stringify(validate(state).filter(n => n.level === 'error'));
```

`state`/`library`/`render` are top-level bindings, reachable from a later
`<script>` in the same file. Writing `validate()`'s output into
`document.title` makes the fixture self-checking via
`--dump-dom | grep '<title>'` — confirms the seeded character is legal before
any screenshot is trusted. Pagination checks need **both** a caster (2 pages)
and non-caster (1 page) fixture; re-run after touching `clip-path`,
`backdrop-filter` or the ability band, which shift pagination most.

When a sheet spills, **measure, don't guess**: extract the `@media print`
body as plain screen CSS in a fixture, pin `html` to the A4 content box
(`210mm − 2×margin`), reveal `#print-area`, and read
`getBoundingClientRect().height` per block (convert px→mm with a `100mm`
probe element, not an assumed 96dpi). `@page` margin is **8mm**; available
height is `297mm − 2×margin`. Blocks marked `.long` report the *whole
column's* height (their bounding box spans both columns) — read that as flow
height, not block height.

The data/engine blocks load into Node via `vm` and can be asserted against
the book directly — used to verify all 120 class×species combos plus named
fixtures (Dwarf Fighter, High Elf Wizard, Human Paladin, Halfling Rogue).

## Traps worth knowing before "fixing" them

- **`<!DOCTYPE html>` on line 1 is load-bearing.** Without it, Chrome renders
  in quirks mode where tables don't inherit `font-size`, and attack/spell
  tables print larger than everything else.
- **Headless Chrome won't lay out narrower than 500 CSS px**, whatever
  `--window-size` says — it crops the screenshot instead (looks like a layout
  bug). To check phone width, set `documentElement.style.width = '390px'`
  from JS (neither file has a `</head>` to splice a `<style>` into) and
  measure `getBoundingClientRect().right` against 390 — ignore anything
  inside `.foot` (the sticky footer and **all its children**), since they're
  statically positioned and report the footer's real viewport width (~484px
  on a 500px window), a false overflow. `el.closest('.foot')` is the filter.
  Never trust `documentElement.scrollWidth` here — it reports 485–500
  whatever you ask for.

## Credits

Rules content paraphrased from the **SRD 5.2**, CC-BY-4.0, © Wizards of the
Coast. No text is copied from the Player's Handbook.
