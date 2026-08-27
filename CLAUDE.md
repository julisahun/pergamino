# dnd

A personal toolkit for running a D&D 5e (2024 rules) campaign. Two apps plus
the campaign content they read.

```
dnd/
  creator/            character creator — see creator/CLAUDE.md
    index.html        a file:// page, double-clicked, no server
  dm/                 DM table: a static server + admin page + TV page — see dm/CLAUDE.md
    server.py         stdlib-only Python static host (no state, no endpoint that
                      could carry a campaign file) — runs on the Pi
                      (https://dm.sigint-pm.uk); a local run is for dev
    importing.md      how an outside DM maps their campaign onto this format
                      (an LLM-facing conversion spec)
    check-campaign.js lints a campaign folder against that spec
    index.html        admin window (served at /; reads/writes the campaign
                      folder itself via the File System Access API)
    tv.html           television window (served at /tv — a second window on the
                      same machine; the two talk over a BroadcastChannel)
    jsconfig.json     dev-only typechecking, no emit
    src/              native ES modules (rules, shared model, admin, tv, styles)
    probes/           headless-Chrome verification pages
    vendor/           preact.mjs + htm.mjs, committed verbatim
  campaigns/           campaign content, gitignored except example/ — not app code
    marea-baja/
      scenarios/       one .json per prepared scene
      assets/          images, assets/audio/ for music, assets/maps/ for dropped maps
      story/           DM notes, .md, grouped by subfolder (read in Historia,
                       written in a text editor)
      monsters/        bestiary entries, one .json each
      objects/         item catalog, one .json each — stat modifiers + effects,
                       assignable to players and npc instances
      runs/<mesa>/     one table's own layer: its players/, session.json, notes,
                       and its own monsters/objects/scenarios/assets, which
                       shadow the campaign's by id. No runs/ = a flat campaign,
                       whose root is its one implicit table
      session.json     the live table of a flat campaign, autosaved
      trash/           where in-app deletes land, never unlinked
  introduction.md      campaign pitch/premise (narrative, not app docs)
```

Each app has its own `CLAUDE.md` with the detail that matters when editing it.
Read that file before touching code under `creator/` or `dm/`.

## Rules that hold everywhere in this repo

**No build, no npm, no pip.** The creator is opened by double-clicking
(`file://`, so no `fetch()`/XHR there). The dm/ apps are served by
`dm/server.py` — Python stdlib only, deployed on the home Pi at
`https://dm.sigint-pm.uk` (a local `python3 dm/server.py` is for dev and
headless verification) — and are written as native ES modules with two vendored
library files (`dm/vendor/`). Never add a bundler, `package.json`, or a pip
dependency.

`dm/` is typed with JSDoc, checked by a globally installed `typescript`
(`tsc -p dm/jsconfig.json`). That is a machine tool like `python3`, not a repo
dependency: nothing is emitted and nothing is installed into the tree.

**Language split.** UI text and all rules content are **Spanish**. Code,
identifiers, comments and every doc file (including this one) are **English**.

**One look.** Aged-parchment "pergamino" theme — IM Fell English SC headings,
parchment tokens. There is no theme picker and no stored theme preference; the
tokens live in the creator and in `dm/src/styles/tokens.css`.

**The campaign folder is the database for dm/.** The admin page holds a
File System Access grant on the folder the DM picked (`campaigns/<name>/` by
convention, gitignored) and autosaves straight into it — one file per
entity, `session.json` for play state; deletes go to `trash/`. No server
reads or writes campaign files. The dm apps keep only device preferences
locally (the remembered folder handle in IndexedDB, volumes in
`localStorage`). The creator still stores its drafts in `localStorage`
(`dnd-creator-*`) and exports `.json` files.

**The creator builds sheets; dm/ reads them.** `dm/src/rules/` began as a copy
of the creator's blocks and is now the dm app's own — it knows about levels 1
to 20, which the creator does not. The creator's export envelope is a
**supported input format** for `players/*.json`, and that is the whole
relationship: there is no sync guard any more (`check-sync.py` retired with the
rebuild). A player builds a character in `creator/`, sends the `.json`, and the
DM levels it up at the table.

Treat a change to `dm/` as unfinished until all three pass:

```bash
node --test "dm/src/**/*.test.js"
tsc -p dm/jsconfig.json
node dm/check-campaign.js campaigns/example
```

**`campaigns/` is gitignored and personal.** It's session content (an actual
campaign's scenes, party, notes), not application code — treat a missing file
under it as normal, not as a bug in the apps.

**Rules content is paraphrased from the SRD 5.2** (CC-BY-4.0, © Wizards of the
Coast). No text is copied from the Player's Handbook.

**Tests.** `dm/src/**/*.test.js` run under `node --test` (the pure model, the
progression tables, a 12-class 1→20 sweep, and a source lint). Anything on
screen is verified by a probe page under `dm/probes/`, run headless;
`dm/CLAUDE.md` documents the pattern and the traps worth knowing first.
