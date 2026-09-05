# instructions.md — turning source material into a campaign folder

You are an LLM that has been handed **campaign material that already exists** —
a published adventure, a PDF, a pile of the DM's own notes, a campaign in some
other tool's format — and asked to render it as a folder this app can open.

This document is the whole contract. It is written against the loaders in
`shared/vault/`, not against a spec: every "required", every default and every
"not read" below is what the code actually does. When the two disagree, the
code is right and this file is a bug.

The app is not a rules engine and neither are you. **You transcribe.** Every
number you write must come from the source material or from an answer the DM
gave you. Nothing is derived, rolled, averaged, converted from memory of the
SRD, or filled in because a field looked empty.

---

## 0. The three rules

**1 — Never write into a campaign that already exists.** The DM's folder is
their prep, edited by hand in Obsidian, and this app's entire design is built
on prep not being touched. You create a *new* campaign folder and write only
inside it. If the target folder exists and has anything in it, stop and ask.

**2 — Never invent a value. Ask.** Not a hit point total, not an AC, not an
id, not an alias, not a portrait filename, not a tag. If the source does not
say it, it is a question for the DM. See §2 for how to ask without producing
four hundred questions.

**3 — The campaign is written in Spanish.** Prose, note titles, `# headings`,
ability names and descriptions, scene notes, `effects`, the fc5 sheet's own
note text. Translate as you convert. Field *names*, ids, filenames and folder
names stay as they are — they are code, and code in this repo is English.

---

## 1. Round zero — settle these before writing a byte

Ask all of it in one message, then wait.

| Question | Why it cannot be assumed |
|---|---|
| **Where does the new campaign go?** Propose `campaigns/<slug>/` beside the existing ones, in the world folder the DM points you at. | The DM may want it outside the vault entirely until it is ready. |
| **World or flat campaign?** | Decides whether the notes index spans `mundo/` (§10). A campaign inside `campaigns/` is a world member; a standalone folder is flat. |
| **Campaign slug** — the folder name, kebab-case ASCII. | It is the display name (`titleCase`) when nothing else is on screen. |
| **Mesa name** for `runs/<mesa>/`, or "none yet". | Without a run folder there is nothing to play; see §8. |
| **Feet or metres in the source?** | The app is metric: `speed` renders as `<n> m`, one grid square is 1.5 m. A 30 ft speed is `speed: 9`. Confirm before converting a single number. |
| **Which parts of the source become what** — an inventory. List every NPC, creature, item, location and map you found, and say what each will become: a `pnj/` note, an `objects/` note, a scene, a story note, or prose inside another note. | This is the one decision that shapes everything else, and it is entirely the DM's. |

Do not start writing until the inventory is approved.

---

## 2. How to ask about gaps

**Batch per file.** Collect every unknown for one PNJ, one scene, one
character; ask them together; write the file; move to the next. Never ask
mid-file and never write a file with an open question in it.

Ask as a short table: the field, what the source says (quote it), and two or
three concrete options with a recommendation. The DM is answering dozens of
these, so make each one a choice rather than an essay.

**Omission is a decision too, and it is invisible.** These four cases look
identical to a filled-in field once the app renders them:

| Leaving out | Produces | So it means |
|---|---|---|
| `ac` | `10` | An unarmoured commoner. Never a "we don't know". |
| `hpMax` | `null` | **Someone the party can only talk to.** They cannot be seated on the board and a scene roster cannot name them. |
| `initMod` | `0` | Initiative flat, not unknown. |
| `speed` | `null` | The card shows no speed line. This one really is "unstated". |

So "the source does not give this creature an AC" is a question, not a reason
to skip the key. `hpMax` in particular is the switch between a person and a
combatant — never decide it yourself.

---

## 3. The folder

```
<campaign>/
  pnj/<id>.md            people and creatures — statblock in front matter
  objects/<id>.md        items
  scenarios/<id>.json    scenes: art, grid, roster, reading note
  players/<pj>/          one folder per PJ
    <pj>.md              the note that *is* the character
    <pj>-fc5.xml         every number on the card
  story/**.md            free notes, any depth
  assets/                art, handouts, ambience
  runs/<mesa>/           one folder per table — the only writable place
  README.md              optional, for a human
```

**Shape detection.** The DM picks a folder and the app decides what it is:

- contains `campaigns/` → a **world**. Campaigns live in
  `campaigns/<name>/`, and the notes index spans the whole world, so a
  campaign note can reach `mundo/` lore.
- contains `scenarios/` **or** `story/` → a **flat campaign**. The index is
  rooted at the campaign folder.
- neither → the app refuses the folder outright.

A campaign with no `scenarios/` and no `story/` therefore cannot be opened on
its own. Write at least one of them.

**Enumeration rules that apply everywhere.** `pnj/`, `objects/`,
`scenarios/` and `players/` are read **one level deep, not recursively**. A
file starting with `.` is skipped. `*.md` matches case-insensitively;
`*.json` does not. `story/` is walked recursively, skipping dotfiles and
`.obsidian`, `.git`, `.venv`, `node_modules`, `__pycache__`.

A file that fails to parse is skipped with a console warning and the rest of
the folder still loads — which means a broken file is silent. That is why §11
exists.

---

## 4. `pnj/<id>.md` — people and creatures

There is no bestiary. A sewer rat and a village trader are the same kind of
file; the only difference is whether the front matter gives hit points.

An ordinary Obsidian note: YAML front matter, prose below.

```markdown
---
id: tulio
alias: Soldado ahogado
tag: enemigos
ac: 15
hpMax: 16
initMod: 1
speed: 9
portrait: assets/pnj/tulio.jpg
abilities:
  - name: Lanza corta
    desc: +4 a impactar, 1d6+2 de daño perforante.
  - name: Aguantar la respiración
    desc: >-
      No necesita respirar. Peleará bajo el agua tanto tiempo como haga falta.
---

# Tulio

Llevaba la medalla de su hermano cuando el barco se hundió. Nadie en la
compañía sabe todavía que es él.
```

| Key | Type | Required | Default / note |
|---|---|---|---|
| `id` | string | no | **File name without `.md`.** Write it anyway, equal to the file name. It is what scene rosters name. |
| `alias` | string | no | `null`. The name the *television* is given instead of the real one. Only when the source has a reason to hide the name — see §4.2. |
| `tag` | string | no | `null`. Groups the PNJ catalogue and is searchable. One word, Spanish, lowercase. |
| `ac` | number | no | **`10`, silently.** Ask rather than omit. |
| `hpMax` | number | no | `null` = *sólo trato*: not a combatant, cannot be seated, cannot appear in a roster. Presence is the semantic switch. |
| `initMod` | number | no | `0` |
| `speed` | number | no | `null`. **Metres.** Rendered as `<n> m`. 30 ft → `9`. |
| `portrait` | string, or `{src: string}` | no | `null`. Campaign-relative path (§9). No leading `/`, no `..`. |
| `abilities` | list of `{name, desc, id?}` | no | `[]`. An entry with neither `name` nor `desc` is dropped. `id` defaults to a slug of `name`, then `ability-<n>`. **An entry whose `desc` states damage dice becomes a resolvable action — see §4.1.** |
| `ficha` | string | no | **Reserved.** If present it overrides the note's title. Do not use it here. |
| anything else | — | — | **Ignored by the app.** Harmless in Obsidian, invisible in the console. Do not put mechanics there and expect them to show up. |

**Body.** The first `# Heading` is the PNJ's name; without one the file name is
used. The first paragraph that is not a heading and not a bare tag line is the
card's summary — wikilinks and `*`/`_`/`` ` `` are flattened for it, so write
one clean opening sentence and put the rest below.

### 4.1 An ability with numbers is an action

Whoever is up in a fight gets an action bar under their row, and it is built by
reading `abilities` back. An entry that states **damage dice** becomes something
the DM can resolve — pick it, pick who it lands on, roll, apply — and an entry
that does not stays prose on the ficha.

```yaml
abilities:
  - name: Lanza corta
    desc: +4 al ataque, 1d6+2 de daño perforante.   # an action
  - name: Aguantar la respiración
    desc: No necesita respirar.                      # prose, run by hand
```

| What the desc states | What you get |
|---|---|
| damage dice **and** a to-hit | the action, with a verdict against the target's CA |
| damage dice, no to-hit | the action, and the console hands the hit/miss call back to the DM |
| no damage dice | nothing — it stays a trait |

Damage is what makes an action; the to-hit only decides whether the app can
judge the roll. Write it as `+4 al ataque` or `+4 a impactar`, and the dice
beside the word `daño` — `1d6+2 de daño perforante`. The damage *type* is read
and thrown away; nothing in the app resists or doubles anything, so it is there
for the DM to read, not for the app to act on.

**This cuts both ways, and the quiet direction is the dangerous one.** A trait
that mentions dice for some other reason will be offered as an attack. Ossian's
«cada vez que recibe daño la herida se le cierra» states no dice and is safe;
something like «suma 1d4 a su siguiente tirada» would be read as a 1d4 attack.
If a trait needs to talk about dice without being an action, keep the dice away
from the word `daño`, or say the numbers in prose («un dado de cuatro caras»).

Nothing else is derived from an ability. There are no attack types, no ranges,
no riders — the rest of the sentence is for the DM's eyes, and the app quotes
none of it back.

### 4.2 `alias`

A named enemy is a plot point, and the television reading his name gives it
away. `alias` is the name the table is told; the console keeps calling him
Tulio, which is how the DM knows which of three drowned soldiers has the medal
and the sixteen hit points.

Masked names collide on purpose: real names win, and the masked ones take the
next free number — *Soldado ahogado*, *Soldado ahogado 1*, *Soldado ahogado 2*.
Taking the mask off is a live decision made at the table, not something the
note controls.

Only write `alias` when the source itself distinguishes "what it is called" from
"what the players are told". Otherwise leave it out and ask if you are unsure.

---

## 5. `objects/<id>.md` — items

```markdown
---
id: lagrima-de-milia
usos: 5
mods:
  ac: 1
effects:
  - Cura 2d4 al gastar una carga.
  - Los usos son cinco en total para toda la aventura.
---

# Lágrima de Milia

Una gota de resina fría que no se derrite en la mano.
```

| Key | Type | Required | Default / note |
|---|---|---|---|
| `id` | string | no | File name without `.md`. Write it. |
| `usos` | number | no | Absent = not a consumable. Charges are tracked **per object, not per holder**: passing it on does not refill it. |
| `mods.ac` | number | no | The only mechanical modifier the app reads. |
| `mods.<anything else>` | — | — | **Silently ignored.** The demo campaign ships a `mods: {pp: 1}` that does nothing at all. If the source gives a bonus that is not AC, it belongs in `effects` as prose. |
| `effects` | list of strings | no | `[]`. Non-strings and empty strings are dropped. Spanish sentences, one per line. |
| anything else | — | — | Ignored. |

**Body.** `# Heading` → the item's name. First paragraph → the description shown
on the item sheet.

---

## 6. `scenarios/<id>.json` — scenes

The one prep folder the app writes back to, from **Preparación**, which is why
it stays JSON: round-tripping markdown would cost the DM their formatting every
time they moved a token.

```json
{
  "kind": "dnd-dm-scene",
  "version": 1,
  "scene": {
    "id": "puerto-viejo",
    "name": "El puerto viejo",
    "art": { "src": "assets/puerto-viejo.jpg" },
    "audio": "assets/lluvia.mp3",
    "roster": [
      { "pnjId": "tulio", "count": 1 },
      { "pnjId": "soldado-ahogado", "count": 3 }
    ],
    "grid": { "cols": 20, "rows": 12 },
    "note": "Llueve desde hace tres días. El agua ya llega a los escalones."
  }
}
```

| Key | Type | Required | Default / note |
|---|---|---|---|
| `kind`, `version` | string, number | no | **Not read.** Conventional; write `"dnd-dm-scene"` / `1`. |
| `scene` | object | **effectively yes** | Reading tolerates a bare scene object at the top level. **Preparación does not** — it finds a scene file by `parsed.scene.id`, so a file without the wrapper can never be written back to. Always write the wrapper. |
| `scene.id` | string | **yes** | A scene without a string `id` is **skipped entirely**, silently. Unique within `scenarios/`. |
| `scene.name` | string | no | Falls back to `id`. |
| `scene.art` | `{src, stamp?}` or `null` | no | `null`. `src` is campaign-relative (§9). Art is shown whole in both windows, never cropped. |
| `scene.audio` | string or `null` | no | `null`. Campaign-relative path to an audio file. |
| `scene.roster` | array | no | `[]`. See below. |
| `scene.grid` | `{cols, rows?}` or `null` | no | `null`. When the scene goes on screen **its grid becomes the grid**. `cols` is required inside the object. |
| `scene.note` | string | no | `""`. The reading note pinned under the board. Spanish. |

**Roster entries.** Each entry is either a bare string (the PNJ id, count 1) or
an object:

| Key | Required | Note |
|---|---|---|
| `pnjId` | **yes** | Must match a `pnj/` note's `id`. An entry without it is dropped silently. `beastId` is accepted as a legacy fallback; do not write it. |
| `count` | no | `1`. How many copies get seated. |

**`x` and `y` are not read.** The demo campaign writes them on roster entries
and the loader throws them away; Preparación rewrites the roster without them.
Token positions are live session state, not prep. Do not write them.

A roster may only name a PNJ that has `hpMax`. Naming a *sólo trato* PNJ
produces an entry that can never be seated.

---

## 7. `players/<pj>/` — the party

**A PJ is a folder.** `players/toribio/toribio.md` is the character; the note
whose name matches the folder (case-insensitively) is the only one that counts.
Everything else in there — `toribio-trasfondo.md`, a guía, the creator's json,
pdfs — is *that character's* material, reachable as an ordinary note, and is
never mistaken for a second member of the party.

A loose `players/x.md` at the top level is **not a character at all** and will
not load. The folder is mandatory.

```markdown
---
id: toribio
ficha: Toribio Pardo
jugador: Ana
portrait: assets/pj/toribio.jpg
---

# Toribio Pardo

Segundo hijo de un armador arruinado. Se enroló para no tener que explicarlo.
```

| Key | Type | Required | Default / note |
|---|---|---|---|
| `id` | string | no | File name without `.md`. It is the key the run layer overrides by (§8), so write it explicitly. |
| `ficha` | string | no | **The displayed name**, taking precedence over the `# Heading`. Either is fine; do not let them disagree. |
| `jugador` | string | no | `""`. The person at the table. `player` is accepted as an alias for this key. |
| `portrait` | string | no | `null`. Campaign-relative. |
| anything else | — | — | Ignored. |

Every **number** comes from the xml beside it. Nothing in this note is
mechanical.

---

## 8. `<pj>-fc5.xml` — the sheet, and the one place to be careful

The file name is the note's name with `.md` replaced by `-fc5.xml`:
`toribio/toribio.md` → `toribio/toribio-fc5.xml`, inside the PJ's folder.

This app reads derived numbers out of this file **precisely so that it never
re-derives hit points from class, CON and species traits and gets them subtly
wrong at the table**. That guarantee is worth nothing if you compute them
instead. So:

> **Transcribe, never derive.** Every number here must be quoted from the
> source material — a pregen sheet, a stat block, a character export. If the
> source does not state a number, it is a question for the DM (§2). Do not
> compute a modifier from a score, do not compute HP from a hit die, do not
> infer AC from armour, do not add a proficiency bonus to anything.

If the DM has `pregenerados/fightclub.py` or an equivalent generator, ask
whether to leave the xml out entirely and let them generate it. A missing xml
is handled cleanly: every number is simply absent from the card.

### What is actually read

The app does **not** parse this as general XML. It reads a fixed set of tags
and, above all, the prose inside `<note><text>`.

```xml
<?xml version='1.0' encoding='UTF-8'?>
<pc version="5">
 <character>
  <name>Toribio Pardo</name>
  <race><name>Humano</name><speed>30</speed></race>
  <class><name>Guerrero</name><level>1</level></class>
  <slots>0,0,0,0,0,0,0,0,0,0,</slots>
  <item><name>Cota de malla</name><ac>16</ac></item>
  <item>
    <name>Lanza</name>
    <damage1H>1d6</damage1H>
    <text>Ataque +5, daño 1d6 +3 perforante.</text>
  </item>
  <note>
   <name>Marea Baja — mesa Guils</name>
   <text>Humano guerrero de nivel 1 (Guardia). Tamaño Mediano.

CA 19 · PG 13 · Iniciativa +2 · Percepción pasiva 14 · Competencia +2

Habilidades: Atletismo +5 · Percepción +4
Salvaciones: Fuerza +5 · Constitución +4

Si algún número de la app no coincide con los de arriba, mandan los de arriba.</text>
  </note>
  <abilities>17,10,14,8,14,12,</abilities>
  <hpMax>13</hpMax>
 </character>
</pc>
```

| Source | Feeds | Required | Note |
|---|---|---|---|
| `<hpMax>` | max hit points | no | Falls back to `PG <n>` in the note text. One of the two must exist or the character has no HP. |
| `<level>` | level | no | — |
| `<abilities>` | the six scores | no | **Comma-separated, in order FUE, DES, CON, INT, SAB, CAR**, post-boost. Fewer than six values and all six are dropped. Modifiers are arithmetic on these; that is the one calculation the app does. |
| `<slots>` | spell slots | no | Comma-separated. **Index 0 is cantrips**; indexes 1–9 are slot levels. Zeros are omitted from the result. Empty for non-casters. |
| `<item>` with `<name>` **and** `<damage1H>` | a weapon | no | `<damage1H>` is what makes an item a weapon — structural, not prose. `<text>` is the line shown. An item without `<damage1H>` is not a weapon (that is how «Bastón (foco arcano)» stays off the list). |
| `<spell>` with `<name>` | a spell | no | `<level>` absent = cantrip (`0`). `<roll>` and `<text>` are optional to *read*, but a spell without both is never offered as an action — see below. |
| `<item><ac>` | **nothing** | — | **Not read.** It is the armour's base value; the app wants the final number, which only the note line has. |
| `<race><speed>` | **nothing** | — | Not read. |

### Which weapons and spells become actions

The same action bar §4.1 describes is built for the party out of this file. A
weapon with `<damage1H>` is always one. A spell becomes one only if it has a
`<roll>` **and** its `<text>` says which of three shapes it is — the app reads
the prose, in Spanish, because that is where the shape actually lives:

| The text says | Shape | Keyed to |
|---|---|---|
| `Ataque de conjuro …` | attack roll | the `ataque +n` on the `Conjuros:` line |
| `… salvación de <Habilidad> …` | a save the target makes | the `CD n` on the same line |
| `Curas 2d8 + tu modificador …` | healing | that modifier, worked out as `ataque − competencia` |

`la mitad si acierta` (or `la mitad de daño si acierta`) is what makes a made
save still take half. Without it a made save takes nothing.

**A spell with no `<roll>` is deliberately not an action, and that is a
feature.** Grasa and Fuego Feérico say «salvación de Destreza» and roll nothing;
Misil Mágico says «no fallan nunca» and its single `<roll>` describes neither
the three darts nor the `+1`. None of them is offered, because a menu entry
that half-works is worse than the DM reading the note. Do not add a `<roll>` to
a spell to "make it work" — you would be inventing a mechanic. Write the spell
as the source states it and let it stay prose.

Watch the inverse too: `<roll>1d4</roll>` on Bendición or Guía is a bonus to
somebody else's roll, not damage. Those are safely skipped only because their
text names none of the three shapes — so never describe a buff with the word
`salvación de` or `ataque de conjuro`.

### The note line

`<note><text>` is prose, and it is where AC, passive perception, proficiency,
skills, saves and the authoritative initiative come from. The labels are
Spanish and matched literally:

| Pattern | Feeds |
|---|---|
| `CA <n>` | **AC. The only source there is.** No line, no AC on the card. |
| `PG <n>` | max HP, when `<hpMax>` is absent |
| `Iniciativa +<n>` | initiative — **wins over DEX**, which is why a character with *Alerta* comes out right. Falls back to the DEX modifier when the line is missing. |
| `Percepción pasiva <n>` | passive perception |
| `Competencia +<n>` | proficiency bonus |
| `Conjuros: <Habilidad> · CD <n> · ataque +<n>` | casting ability, save DC, spell attack. Scoped to that one line. |
| `Habilidades: Sigilo +7 · Percepción +5` | the stated skill modifiers, in order. Separator `·` or `,`. |
| `Salvaciones: Fuerza +5 · Constitución +4` | the stated saves |
| the first line of the text | the card's summary |

Include the sheet's own closing sentence — *"Si algún número de la app no
coincide con los de arriba, mandan los de arriba"* — because it is true, and it
tells whoever opens the file next which numbers are authoritative.

---

## 9. `runs/<mesa>/` — the tables

One folder per table. **This is the only place the app is allowed to write**,
and the rule the whole design exists to keep is that a session never edits
prep. You are writing prep. Keep out of the way.

| Path | Write it? | Note |
|---|---|---|
| `runs/<mesa>/` | **yes**, if the DM named a mesa | The folder must exist or opening that mesa throws. Empty is fine — a mesa with no session is *sin empezar*. |
| `runs/<mesa>/session.json` | **never** | Live state, written by the app, migrated from older schemas, backed up as `session.json.bak` on first rewrite. Authoring one by hand is how you corrupt a table. |
| `runs/<mesa>/estado.md` | optional | Free markdown with `## ` headings. Closing a session appends bullets under headings that already exist. A short `# Estado` plus a paragraph is a good seed. |
| `runs/<mesa>/bitacora/00-plantilla.md` | optional | The template a session note is drafted from. Give it `## Qué pasó` and `## Cambios de mundo` — those two headings are the ones the draft appends facts under. |
| `runs/<mesa>/bitacora/NN-*.md` | no | Session notes, written on close. Numbering comes from the highest `NN` prefix present. |
| `runs/<mesa>/players/<pj>/<pj>.md` | only if asked | A per-table party that **shadows the campaign's `players/` by `id`**. Same format as §7, xml included. Use the campaign layer unless the DM says this mesa has its own people. |
| `runs/<mesa>/<mesa>.md` | optional | A note about the table, for Obsidian. **Not read by the app.** |
| `runs/<mesa>/pnj/`, `objects/`, `scenarios/` | **no** | `runs/README.md` in some vaults says a run can override these. **The app does not read them.** Writing them creates files that look meaningful and do nothing. |

---

## 10. `assets/` — art, handouts, ambience

Paths in `art.src`, `portrait`, `audio` and handouts are **campaign-relative
names, not URLs**. Nothing serves them: the console resolves them against its
folder handle, the television asks for them over the transport. Write
`assets/puerto-viejo.jpg`, never a leading `/`, never `..`, never a URL.

**The picker only sees the top level.** The asset lists the DM chooses from
(scene art, handouts, ambience) are built from files **directly under
`assets/`**, split by extension:

- images: `.jpg .jpeg .png .gif .webp .avif .svg`
- documents: `.pdf`
- audio: `.mp3 .ogg .m4a .wav`

A nested path like `assets/pnj/tulio.jpg` resolves fine when a note references
it, but never appears in a picker. So: **anything the DM picks from the UI goes
flat in `assets/`**; portraits, which are only ever referenced by name, may
nest.

**What to do about art you cannot produce:**

1. If the source material has images — maps in a PDF, an art folder — extract
   them into `assets/` and reference them. Say which page or file each came
   from.
2. Otherwise write the conventional path anyway (`assets/<scene-id>.jpg`,
   `assets/pnj/<id>.jpg`) and hand the DM **one list at the end** of every file
   they need to drop in, with the size and subject each one wants. A scene
   works the moment the file appears; no JSON has to change.
3. Never generate a placeholder image and never invent a filename that does not
   follow from an id.

Audio the same way: a scene's `audio` is a real file or `null`. Do not name a
track you did not put there without listing it.

---

## 11. `story/**.md` — the notes

Ordinary Obsidian notes, any depth, no front matter required. This is where
everything that is not a statblock goes: the hook, the locations, the
factions, the things the party might find out.

- **Wikilinks**: `[[Basename]]`, `[[basename|Alias]]`, `[[ruta/a/la/nota|Alias]]`.
  Resolution is Obsidian's: as a path first (relative to the linking note, then
  to the vault root), then as a basename, preferring the candidate nearest the
  note that links to it. Use the path form when a basename is ambiguous —
  `README` always is.
- `pnj/` and `objects/` notes are in the same index, so `[[Tulio]]` from a story
  note resolves to his statblock and backlinks work. Link to people rather than
  restating them.
- **Tags**: `#etiqueta` anywhere in the body, two characters or more, letters,
  digits, `_` and `-`. They are filterable. A line that is nothing but tags is
  treated as a header chip and skipped when the card's summary is taken.
- A `mundo/` folder at the **world** root is indexed too, so shared lore lives
  there and campaign notes reach it. In a flat campaign there is no such thing.

Do not duplicate prose between a `pnj/` note and a story note. That seam — two
files saying the same thing in different words, kept in step by hand — is
exactly what this format was built to remove.

---

## 12. Never write these

- Anything inside a campaign folder that already existed before you started.
- `session.json`, or any `.bak`.
- `x`/`y` on a roster entry, or any token position.
- `monsters/*.json`, `story/gente/*`, `players/*.md` at the top level, inline
  base64 portraits, a `note:` field on a statblock. All of these are the
  pre-merge format. They do not load.
- A number you calculated rather than read.
- An `id` that does not match its file name, unless the DM asked for it.
- Front matter keys that "document" mechanics the app does not read, presented
  to the DM as if they will show up. They will not.

---

## 13. Before you hand it over

Check every one of these yourself, then report the result. Most failures in
this format are **silent** — a skipped file, a defaulted `10`, a roster entry
dropped — so nothing here is optional.

- [ ] The campaign folder is new, and nothing outside it was written.
- [ ] It contains `scenarios/` or `story/`, so the app will accept it.
- [ ] Every `pnj/` and `objects/` note has an `id` equal to its file name, and
      ids are unique within their folder.
- [ ] Every `pnjId` in every roster names a `pnj/` note that exists **and has
      `hpMax`**.
- [ ] Every combatant's attack reads back as an action: the dice sit beside the
      word `daño`, and the to-hit is `+n al ataque` or `+n a impactar` (§4.1).
      A statblock whose attack does not parse fails silently — an empty menu
      mid-fight is how you find out.
- [ ] Every scene file has the `{"scene": {...}}` wrapper and a string
      `scene.id`, unique across the folder.
- [ ] Every `art.src`, `portrait` and `audio` path either points at a file you
      wrote, or appears in the list of assets the DM has to supply.
- [ ] Every asset the DM picks from a menu is flat in `assets/`.
- [ ] Every wikilink resolves, or is listed as deliberately dangling.
- [ ] Every PJ is a folder whose note matches the folder name; the xml beside
      it is named `<pj>-fc5.xml`.
- [ ] Every number in every xml can be traced to a line in the source or to an
      answer the DM gave. List them if asked.
- [ ] Speeds are metres. Grid squares are 1.5 m.
- [ ] The prose is Spanish; ids, filenames and field names are not.
- [ ] The list of open questions is empty — or, if the DM chose to defer some,
      it is at the top of your handover, not buried.

Then tell the DM, in one message: what you wrote, what you had to ask about and
what they answered, what art is still missing, and anything in the source you
deliberately left out.
