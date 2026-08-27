# dm — full functional reference

What the admin window (`/`) and the television (`/tv`) actually do, feature by
feature. `CLAUDE.md` is the one to read *before editing code* — invariants,
layout, traps. This is the "what it does" manual, written from the app that
exists.

---

## 1. What this is

A toolkit for running a D&D 5e (2024 rules) campaign from a laptop, with a
second window on a television the players look at. It invents no rules and
**rolls no dice**: initiative totals, damage, healing and death saves are typed
in from what happened in the room. Every number on a character card is computed
from the sheet the player exported from the creator; the app stores none of
them.

Two pages, served by `server.py` (Python stdlib, static files only). The admin
holds a File System Access grant on the campaign folder and reads and writes it
directly — **campaign files never pass through a server**, and there is no
endpoint that could carry one.

Language: everything the DM reads is Spanish. Everything a programmer reads is
English.

---

## 2. Opening a campaign

Three doors, taken in order, each one a thing the DM did:

1. **The folder.** «Abrir carpeta…» is the OS picker (Chromium only, secure
   context). An empty folder becomes a campaign on the spot — the six subfolders
   are seeded. Anything else opens as it is, missing categories reading as
   empty. The handle is remembered in IndexedDB and reopened silently on the
   next boot if the browser still holds the grant; otherwise the gate shows
   «Reabrir <nombre>», because a permission prompt has to come from a click.
2. **The mesa.** A campaign with a `runs/` folder asks which table is sitting:
   one button per mesa (named by its own note's `mesa:` frontmatter, with how
   many sheets it has and whether it has ever played), plus **Sólo preparación**
   and **+ Mesa nueva**. A campaign with no `runs/` skips this entirely.
3. **The table.** Tabs: Juego · Jugadores · PNJ · Objetos · Escenas · Historia.
   Preparation-only mode has the last four; there is no table, so there are no
   tabs about one.

**+ Mesa nueva** creates `runs/<slug>/players/`, `<slug>.md` (with the
frontmatter the picker reads), `estado.md` and `bitacora/00-plantilla.md` —
folders and scaffolds, so a text editor has something to open.

---

## 3. Two layers

The campaign folder holds what every table shares. `runs/<mesa>/` holds one
table's own: its party, its play state, its notes, and its own versions of
monsters, objects, scenes and assets, which **shadow the campaign's by id**
(assets, by path below `assets/`). Two tables take the same adventure to
different places without either editing the other's anything.

- **Every save asks which layer**, with two buttons that each name the exact
  file they will write. A dropped map asks too, mid-combat included.
- **«A la campaña» on something the mesa has its own copy of promotes it**: the
  shared file is written and the run-local copy goes to `trash/`.
- **«copiar a esta mesa» / «mover a la campaña»** move an entity either way from
  its card.
- **Deletes**: from inside a mesa, that mesa's files. The campaign's shared prep
  is deleted from preparation-only mode.
- A **flat** campaign (no `runs/`) has one layer and never asks about anything.

Every write flashes the file and the layer it landed in.

---

## 4. The television

`field.mode` is **one stored fact** with three values, set by one control in
Juego and by nothing else:

| mode | what the players see |
|---|---|
| **Nada** | nothing — quiet parchment |
| **Escena** | the picture, full-bleed |
| **Tablero** | the grid, with tokens on it, over the picture if there is one |

Two further switches, each orthogonal and each stated:

- **Fichas** (`hud`) — whether the party strip and the turn order ride along.
  Not a consequence of a fight starting.
- **En pausa** (`paused`) — the television keeps the last thing it was given.
  Arrange the ambush, then let it through. It is not a mode and it is never
  called "en vivo".

Beside the control is the **mirror**: the very payload the television is
holding, drawn by the television's own component. While paused it shows what is
actually up there (which is older than the table); otherwise it shows what the
players see now, with hidden creatures marked.

**Tablero ↗** opens (or refocuses) the television window. It reads pictures and
sound out of the campaign folder itself, through the handle the admin posts it.
If it cannot, it says so on both screens rather than showing nothing.

---

## 5. Jugadores

`players/*.json` **is** the party — no import step for a campaign that already
has files. Dropping a sheet anywhere on the window merges it by character id:
wounds survive, and a maximum that dropped clamps them. Sheets are built in
`creator/` and read here.

A card carries: the portrait, name, species/class/level, AC, initiative
modifier, passive perception, speed; hit points with the damage box; and, when
opened, conditions, exhaustion, death saves, levels and features, expendables,
gold, inventory, held objects and a note.

- **The damage box**: `7` or `-7` damage (temporary hit points soak first,
  floors at 0) · `+3` heal, capped · `t5` set temporary (replaces, never
  stacks) · `=11` set the total (raises a *monster's* maximum; a player's
  belongs to their sheet). Anything else is refused out loud and changes
  nothing. `±1` beside it.
- **Several at once**: tick cards, and one shared box does all of them as one
  undo step, with **Aplicar** and **Mitad** (floored — the saving-throw half).
- **Conditions**: the 15 SRD conditions plus concentración, each with its rules
  text. **Exhaustion** counts 0–6. **Death saves** appear for a player at 0 and
  clear the moment they are standing again.
- **Expendables**: spell slots from the progression tables, plus per-day pools
  the DM names. Tap a pip to spend, tap again to give it back.
- **Descanso corto** returns pact slots and short-rest pools. **Descanso largo**
  returns everything, refills hit points, clears temporary/conditions/death
  saves and takes one level of exhaustion off.
- **Al banquillo** takes a player off the board without touching their sheet —
  the only off-board state a player has.

**Subir de nivel** asks only what the new level introduces: hit points (the
fixed average offered, a rolled number accepted), an ability increase where the
class grants one, a subclass at 3rd, and **what it gained, in the DM's own
words**. Slots and the proficiency bonus are recomputed, never typed. The level
is appended to the sheet's own file in the creator's envelope, so the file stays
one the player can open in the creator.

---

## 6. Juego

Three panels: the television control and its mirror, the fight, and the DM's
own board.

**Empezar combate** opens the muster picker with **nobody ticked** — being at
the table and being in this fight are different facts. Each npc row carries the
eye (whether the players know it exists at all) and how much of its hit points
may travel: nothing, one of five words, or the number. Confirming opens the
initiative wizard: one box per name, Enter moves to the next, **blank means
"has not rolled yet"**, which is not the same as being out. The numbers survive
the modal being closed by accident.

Then: **← turno / turno →**, the round counter, and an order strip where an
initiative can be corrected mid-fight. A monster on 0 hit points keeps its card
and loses its turn; a player on 0 is making death saves, which is a turn.
**Terminar** resets the round, the turns and the membership — nobody
disappears, and nobody is healed.

**The board** is the same component the television draws, asked for with the
DM's audience, so hidden creatures are there to be dragged. Drag to move, tap to
light the reach (a Chebyshev box — the diagonal costs what the straight line
costs). Dragging is not an undo step, in either window. Drop an image on it to
use it as a map.

---

## 7. PNJ, Objetos, Escenas

**PNJ** is the bestiary: templates, not instances. Name, kind, AC, hit points,
initiative modifier, speed (metres), a note to read aloud, a few abilities, a
portrait (downscaled to 512px, stored inline). **«a la mesa»** with a count
makes that many instances, each with its own hit points, **hidden**, in no
fight. Loading, revealing and fighting are three separate decisions.

**Objetos** is the catalog. Five modifiers the app computes — CA, PG máx, mod.
iniciativa, velocidad, percepción pasiva — and free-text effects it shows but
never calculates. Holders keep ids; duplicates stack.

**Escenas** is preparation: a picture, two sound layers with their own volumes,
an optional column count (rows always derive from the art's real proportions), a
roster of who is standing where, and a note. **A la mesa** writes the picture,
the sound, the board size and seats the roster — skipping occupied squares, so
putting the same scene up twice never doubles an ambush. It changes **nothing**
about what the television is showing: that is the mode control's job. **Sin
escena** clears the picture and the sound.

---

## 8. Historia

Every `story/**/*.md` in the campaign, and every `.md` inside the open mesa —
`estado.md`, `bitacora/*.md`, `<mesa>.md`, `players/*.md` — in one index,
grouped: loose notes first, then the campaign's folders, then the mesa's own.

Notes are **read only**. They are written in a text editor, and the 5s poll is
what makes that feel live. What this window adds is what an editor cannot: the
rendering, `[[wikilinks]]` (including `[[target|label]]`) that navigate, `#tags`
that search, and a «Mencionada en» footer.

The renderer is a small subset: three heading levels, paragraphs, `**bold**`,
`*italic*`, `-` bullets. Anything else stays in the file untouched and reads as
plain text. YAML frontmatter is skipped, not rendered.

---

## 9. What the television is given

`buildProjection()` produces one object; both windows draw it.

```js
{ seq, audience, mode, hud, cols, rows,
  map: {src} | null,                       // a campaign-relative path
  audio: {music, ambience, master} | null,
  banner: {round, active} | null,          // null unless a fight is on
  order: [{name, portrait, kind, active, down}],   // hidden npc = '···', no face
  party: [{name, portrait, colour, hp, hpMax, temp, state}],
  npcs:  [{name, portrait, hp}],           // revealed only; hp null outside a fight
  tokens:[{id, name, kind, colour, portrait, x, y, active, hp, conditions, reach}] }
```

**A hidden npc is absent** — not greyed out, not unrendered. Its name is
nowhere in the payload, so devtools on the television teach a player nothing.
Npc hit points travel exact, as one of five words (*ileso · herido · malherido ·
grave · fuera de combate*), or not at all; players are always exact. Tokens
travel only in `tablero`. Audio and the picture travel only when the mode is not
`nada`.

Audience `'dm'` is the same object with hidden creatures kept and marked
`hidden`. That is the only difference between the two.

---

## 10. Undo

`⟲` in the header names the step it will undo («deshacer: 7 a Vann»). It is a
25-deep stack of whole-session snapshots, so an area attack that wounded five
undoes as one thing.

Deliberately **not** undo steps, each for the same reason — undoing them would
undo the wrong thing: dragging a token (either window), pausing, resizing the
grid, and the volume.

---

## 11. Storage, exactly

| Where | Holds |
|---|---|
| the campaign folder | everything: prep, mesas, notes, assets, play state |
| IndexedDB `dnd-dm` | the remembered folder handle and the last mesa — device preferences |
| localStorage `dnd-dm-audio` | master volume and mute, on the admin machine |
| localStorage `dnd-dm-tv-audio` | that television's own volume (arrow keys) |
| the server | nothing. It hands out files and answers `/api/ping` |

`session.json` holds `{version: 3, play, playerFiles, npcs, encounter, field}` —
never the party, the bestiary or the catalog, which live in their own files and
are injected at load. Deletes move into `trash/`. A v2 session (the two-boolean
board) is read and translated: `live`+`grid` become one `mode`.
