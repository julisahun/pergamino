# Importing an existing campaign — conversion spec

This file is written to be **handed to a language model** along with a DM's
existing campaign material ("convert my campaign using dm/importing.md"). It is
a specification, not a tutorial: schemas, exact vocabularies, hard rules, and
the checker that decides whether the result is correct.

There is no import button and nothing to upload. A campaign *is* a folder, and
the admin page reads whatever is in it — so converting a campaign means writing
files into the right places. The app then picks them up on its own (it re-scans
the folder every 5 seconds).

---

## 0. Instructions to the converting model

1. Produce **only** the files described in §2–§6. Never write `session.json`
   or anything under `trash/` — those belong to the app. Never write anything
   under `runs/` either: a mesa is one table's own history, made in the app
   (§9), not something a conversion can know about.
2. **Never generate `players/*.json`.** Read §7 and report to the DM instead.
3. Every parser in this app is deliberately forgiving: a wrong field is
   coerced or dropped, never refused. **Nothing will tell you that you got it
   wrong.** Treat §8 as part of the task, not as an optional check.
4. Do not invent art. Reference an image path only if the DM actually has that
   file; otherwise omit `art` and say which scenes need a picture.
5. Do not pad. A monster the DM described in one line becomes a monster with a
   one-line `note`. Inventing statblocks, abilities or lore is a conversion
   error, not helpfulness.
6. Report every lossy conversion explicitly at the end: what you dropped, what
   you had to approximate, what the DM has to finish by hand.

---

## 1. Hard rules that apply everywhere

**Units are metric.** Speed is in **metres**, not feet, and the app prints the
number verbatim. This is the single most common conversion error.

| 5e | here |
|---|---|
| 30 ft | `9` |
| 25 ft | `7.5` |
| 20 ft | `6` |
| 40 ft | `12` |
| 5 ft (one square) | `1.5` |

**Ids are load-bearing and must be stable.** Every entity file needs an `id`.
If it is missing the app invents a new one *on every read*, which means a
monster becomes a brand-new bestiary entry every 5 seconds and every reference
to it dies. Use lowercase kebab-case matching the filename: `monsters/sewer-cheese-rat.json`
has `"id": "sewer-cheese-rat"`. Ids must be unique within their folder.

**Only `<folder>/*.json` at the top level is read.** `monsters/undead/lich.json`
is invisible to the app. There are no subfolders anywhere except under
`story/` and `assets/`.

**`monsters/` and `objects/` files are bare objects.** No envelope. A file
shaped `{"kind": …, "beast": {…}}` is read as an object whose every real field
is missing, and it loads as «Sin nombre» with default stats. (`scenarios/` and
`players/` *do* accept an envelope — hence the trap.)

**Language.** Slugs and field names are fixed and never translated. The
*content* — names, notes, abilities, story text — is in whatever language the
table plays in. The app's own chrome is Spanish; it does not care what language
the campaign is in.

**It rolls no dice.** Every number in a file is a number the DM reads out or
types in.

**Characters are converted at level 1** and levelled up inside the app (§7).
The app tracks levels 1–20: the proficiency bonus, hit dice, spell slots,
ability increases and a subclass are computed from tables, and what each class
feature *does* is free text the DM writes as they take it. A conversion never
writes a `levels` array — it is the app's own field, and the level-1 build is
what the creator can express.

---

## 2. `story/**/*.md` — the notes

The easiest and highest-value part of a conversion: most of a campaign's real
content is prose, and prose transfers almost intact.

- Files group by their **first subfolder**: `story/casos/el-robo.md` is in group
  "casos"; `story/intro.md` has no group and shows under "General". Use groups
  that match how the DM already organises their material.
- A note's title is its **first `#` heading**, falling back to a humanised
  filename. Always write a `# heading`.
- `[[Wikilinks]]` work, including the piped form `[[target|label]]`. They
  resolve against note titles first, then filenames. A link that resolves
  produces a backlink in the target's "Mencionada en" footer — this is the main
  way a converted campaign becomes navigable, so **link deliberately**.
- `#tags` work; a tag click is a search shortcut.

**The renderer supports a small subset of markdown**, and nothing else:

- `#`, `##`, `###` headings — **only three levels**; `####` and deeper render
  as an ordinary paragraph with the hashes still in it.
- paragraphs, `**bold**`, `*italic*`
- `-` bullet lists — **only the hyphen**, never `*` or `+`, and **flat**:
  indentation is stripped, so a nested bullet becomes a top-level one.

Numbered lists, block quotes, code fences, tables, horizontal rules, images and
inline `[links](…)` are not supported. They survive on disk but render as plain
text — and the first in-app edit of that note rewrites the file *without* them,
because an edit re-serialises the note out of what was rendered. Convert them:

- numbered list → `-` bullets (put the number in the text if it matters)
- table → bullets, or a heading per row
- block quote → **bold** lead-in, or its own `###` section
- nested bullets → flatten, or promote the parent to a `###` heading
- deep heading (`####`+) → restructure into three levels
- inline link → `[[wikilink]]` if it points at another note; otherwise inline
  the URL as plain text

One thing to watch: `#word` anywhere in prose becomes a clickable tag. That is
usually welcome, but check that no converted text contains stray hashes.

---

## 3. `monsters/*.json` — the bestiary

Templates, not instances. The app seats copies of these on the board.

```json
{
  "id": "sewer-cheese-rat",
  "name": "Sewer Cheese-Rat",
  "tag": "vermin",
  "ac": 11,
  "hpMax": 5,
  "initMod": 2,
  "speed": 9,
  "note": "One or two sentences the DM reads at the table.",
  "portrait": null,
  "abilities": [
    { "id": "rat-nibble", "name": "Cheese-Fattened Nibble", "desc": "+4 to hit, 1d4+2 piercing." }
  ]
}
```

| field | rule |
|---|---|
| `id` | required, stable, unique. See §1. |
| `name` | required in practice; absent reads as «Sin nombre». |
| `tag` | free text, one word or two — the kind of thing it is. Shown next to the name. |
| `ac` | number. Unparseable → `10`. |
| `hpMax` | number ≥ 1. Unparseable → `1`. |
| `initMod` | the initiative modifier only (the DM types the rolled total at the table). Unparseable → `0`. |
| `speed` | **metres** (§1), or `null` for a thing that does not move. |
| `note` | free text. This is where everything the schema cannot hold goes. |
| `portrait` | `null`, or `{"src": "assets/…"}`. A bare string reads as no portrait. |
| `abilities` | array of `{id, name, desc}`. Entries with neither `name` nor `desc` are dropped. `desc` is free text — write the attack line the way the DM wants to read it aloud. |

**This shape is deliberately lossy.** There is no place for ability scores,
saving throws, skills, CR, damage resistances, senses, languages, legendary or
lair actions, or a spell list. The DM has that in their own book; this app only
tracks what a card on the table needs. When converting a full statblock: keep
AC, HP, initiative modifier and speed as fields, turn attacks and the two or
three abilities that actually come up into `abilities` entries, and put anything
else worth remembering into `note` in compressed prose. Do not try to smuggle a
statblock into `note` verbatim.

Ability score modifiers matter only inside `desc` text ("+4 to hit"), so
compute them once during conversion and write them out.

---

## 4. `objects/*.json` — the item catalog

Items assignable to players and to npc instances. Duplicates stack.

```json
{
  "id": "ring-of-warding",
  "name": "Anillo de Protección",
  "description": "A plain iron band, warm to the touch.",
  "mods": { "ac": 1 },
  "effects": ["Ventaja en salvaciones contra hechizos."]
}
```

`mods` accepts **exactly five keys**, and nothing else:

| key | meaning |
|---|---|
| `ac` | armour class |
| `hpMax` | maximum hit points |
| `initMod` | initiative modifier |
| `speed` | speed, in metres |
| `pp` | passive perception |

Any other key (`attack`, `damage`, `saves`, a skill bonus) **does nothing** —
the app computes only these five. A `0` is dropped. Everything else the item
does goes in `effects`, an array of short strings the app displays on the
holder's card and never computes. That is the correct home for "+1 to attack
rolls": it is shown, and the DM applies it.

`description` is flavour; `effects` are the lines the DM needs mid-fight. Keep
`effects` entries to one line each.

---

## 5. `scenarios/*.json` — prepared scenes

A scene is prep: a background, sound, a grid, and who is standing on it.
Putting it on the table is a separate act during play.

```json
{
  "kind": "dnd-dm-scene",
  "version": 1,
  "scene": {
    "id": "curdy-sewers",
    "name": "The Curdy Sewers",
    "art": { "src": "assets/curdy-sewers.jpg" },
    "audio": {
      "music":    { "src": "assets/audio/dripping.mp3", "volume": 0.4, "loop": true },
      "ambience": null
    },
    "roster": [
      { "beastId": "sewer-cheese-rat", "x": 3, "y": 2, "objects": [] },
      { "beastId": "sewer-cheese-rat", "x": 6, "y": 5 }
    ],
    "grid": { "cols": 14 },
    "note": "What the DM needs to know the moment this scene opens."
  }
}
```

The envelope is optional (a bare `{ "id": …, "name": … }` object is read too),
but write it — it makes the file self-identifying.

| field | rule |
|---|---|
| `id` | required and stable: the live scene is referenced by id in the play state. |
| `name` | shown in the scene library. |
| `art` | `{"src": "assets/…"}`, a bare string path, or omit. The path must be a file that exists. |
| `audio` | two independent layers, `music` and `ambience`. Each is `{src, volume, loop}`; `volume` is 0…1 (default `0.5`; a deliberate `0` is respected), `loop` defaults to true. A layer may be `null`. Audio plays on the TV only. |
| `roster` | who is seated when the scene goes live. `beastId` **must match a monster's `id`** — a dangling id seats nobody, silently. `x`/`y` are grid squares, zero-based. `objects` is an optional array of object ids. An entry without `beastId` is dropped. |
| `grid` | `{"cols": n}`, 4…60, or omit to use the table's current grid. **Never write `rows`** — rows always derive from the art's real proportions. |
| `note` | free text, the DM's own prep. |

Putting a scene on the table writes its picture, its sound, its board size and
its roster — and decides **nothing** about what the television is showing. That
is one control the DM sets: *nada*, *escena* (the picture full-bleed) or
*tablero* (the grid, with tokens). So do not assume a scene is a battle map, and
do not try to express "this one is a map" in the file: it is not a property a
scene has.

One scene per meaningful location or beat. Rooms a party walks through without
stopping do not need scenes; a room where a fight happens does.

---

## 6. `assets/`

Images and audio referenced by scenes and portraits, by campaign-relative path
(`assets/tavern.jpg`, `assets/audio/rain.mp3`). Convention: maps under
`assets/maps/`, sound under `assets/audio/`; nothing enforces it.

**You cannot create these.** Reference a path only when the DM has confirmed
the file exists. Otherwise omit `art`/`audio`/`portrait` and list, at the end
of the conversion, which scenes and monsters are waiting for a picture. A
scene pointing at a missing file goes live with no background and no warning.

Portraits are stored inline as base64 when made in the app, but for an import
a path under `assets/` is simpler and smaller.

---

## 6b. `runs/` — do not generate these either

A campaign may have a second layer: one folder per table under `runs/<mesa>/`,
holding that table's own party, play state, notes, and its own versions of
monsters, objects, scenes and assets, which **shadow the campaign's by id**.

That is history — what one group did with the material — and a conversion has
none of it. Convert everything into the shared campaign at the top level. The
DM makes a mesa in the app, and the app is what decides, per save, which layer
a change belongs to.

---

## 7. `players/*.json` — do not generate these

A player file is not a statblock. It is a **build recipe** in the character
creator's own vocabulary, and every number on the card — HP, AC, initiative,
saves, skills, spell DC, attacks — is computed from it by `derive()`. You
cannot write "AC 16"; you write a species, a class, a background, a point-buy
spread and an equipment package letter, and the app works out 16. Getting one
slug wrong produces a different, plausible, silently-wrong character.

The correct instruction to the DM is: **rebuild each character in
`creator/index.html`** (open the file, walk the wizard, export the `.json`,
drop it in `players/`). It takes a few minutes per character, it cannot produce
an illegal build, and the exported file is exactly what this app wants.

Your job is to tell the DM, per character, **whether the build can be expressed
at all** before they sit down. It can only if all of these hold:

- **Level 1 is where a sheet starts.** A level-5 character is rebuilt at level
  1 in the creator and then levelled up in the app, which is where hit points
  per level, ability increases, the subclass and the features get recorded. Say
  so per character rather than trying to express level 5 in the file.
- Species is one of: `aasimar`, `draconido`, `enano`, `elfo`, `gnomo`,
  `goliat`, `humano`, `mediano`, `orco`, `tiflin` — with a lineage where the
  species has one (draconido: 10 colours; elfo: drow/alto/bosque; gnomo:
  bosque/rocas; goliat: 6; tiflin: abisal/ctonico/infernal).
- Class is one of: `barbaro`, `bardo`, `brujo`, `clerigo`, `druida`,
  `explorador`, `guerrero`, `hechicero`, `mago`, `monje`, `paladin`, `picaro`.
  No subclasses (they start at level 3).
- Background is one of 16 SRD backgrounds; the ability boosts (+2/+1 or
  +1/+1/+1) must come from that background's own three abilities.
- Abilities come from **27-point buy**, each score 8…15 before boosts. A rolled
  or hand-assigned array usually cannot be reproduced exactly — say so and
  suggest the nearest legal spread.
- Equipment is a **package letter**, not a shopping list: `"A"` or `"B"` for
  every class and every background (the Fighter also has a `"C"` — 155 gp and
  no gear at all). Weapons and armour are not chosen individually, and the
  whole weapon table is nine entries: dagger, mace, quarterstaff, shortbow,
  greataxe, longsword, shortsword, warhammer, longbow. A rapier, a greatsword
  or a crossbow **cannot be represented**, and no package grants one.

  The honest workaround for a signature weapon outside that nine: take the
  package whose armour is right, and write the weapon into the character
  card's free-text inventory box at the table. It will show on the card and
  the DM will apply it by hand — the app will not compute its attack. (For a
  Fighter, package `"C"` gives 155 gp and nothing else, which is the cleanest
  version of that compromise.)
- Spells come from a 96-spell level-0/1 table and are addressed by their
  **English** names. Anything outside it does not exist here.

For each character, report: expressible as-is / expressible with a named
compromise / not expressible. Homebrew species, custom subclasses, non-SRD
spells and anything above level 1 fall in the last bucket, and the honest
answer there is that this app is the wrong tool for that character.

There is no import path for another tool's format, and no rescue path for this
app's own older exports: the campaign folder is the only thing it reads.

---

## 8. Verify — this step is not optional

```bash
node dm/check-campaign.js <campaign-folder>
```

The checker reads the folder the way the app does and reports what the app
would read differently from what the file says: envelope traps, missing and
duplicate ids, dangling `beastId`s, missing assets, unknown modifier keys,
feet-shaped speeds, nested files the app cannot see, markdown the renderer
drops, unresolved wikilinks, and — for any player file that does exist — every
illegal slug plus the creator's own validation notices. It also prints each
character's derived HP / AC / initiative so a wrong build is visible at a
glance.

Exit codes: `0` clean, `1` warnings only, `2` at least one error.

**Iterate until it exits 0 or 1**, and read the remaining warnings rather than
assuming they are noise. Then open the folder in the admin page and look at one
scene and one monster card before playing.

---

## 9. Deliverable

Along with the files, report:

1. **Not converted** — material with nowhere to go in this format, and why.
2. **Approximated** — statblock fields compressed into `note`, ability spreads
   rounded to legal point-buy, weapons substituted.
3. **Waiting on the DM** — scenes and monsters with no art, characters to
   rebuild in the creator, audio to supply.
4. The final `check-campaign.js` output.
