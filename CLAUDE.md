# dnd

A personal toolkit for running a D&D 5e (2024 rules) campaign, level 1 only.
Two apps plus the campaign content they read.

```
dnd/
  creator/            character creator — see creator/CLAUDE.md
    index.html        a file:// page, double-clicked, no server
  dm/                 DM table: relay server + admin page + TV page — see dm/CLAUDE.md
    server.py         stdlib-only Python server (static + SSE relay + asset cache;
                      campaign files never pass through it) — runs on the Pi
                      (https://dm.sigint-pm.uk), never locally except for dev/tests
    index.html        admin window (served at /; reads/writes the campaign
                      folder itself via the File System Access API)
    tv.html           television window (served at /tv, works on any LAN device)
    src/              native ES modules (rules, shared model, admin, tv, styles)
    vendor/           preact.mjs + htm.mjs, committed verbatim
    check-sync.py     guards the parts copied from creator/
  campaigns/           campaign content, gitignored — not app code
    campaign-01/
      scenarios/       one .json per prepared scene
      assets/          images, assets/audio/ for music, assets/maps/ for dropped maps
      story/           DM notes, .md, grouped by subfolder (editable in Historia too)
      players/         character exports (the creator's .json) — this IS the party
      monsters/        bestiary entries, one .json each
      session.json     the live table, autosaved
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
headless verification only) — and are written as native ES modules with two
vendored library files (`dm/vendor/`). Never add a bundler, `package.json`,
or a pip dependency.

**Language split.** UI text and all rules content are **Spanish**. Code,
identifiers, comments and every doc file (including this one) are **English**.

**One look.** Aged-parchment "pergamino" theme — IM Fell English SC headings,
parchment tokens. There is no theme picker and no stored theme preference;
the tokens live in the creator and in `dm/src/styles/tokens.css`, and
`check-sync.py` keeps them identical.

**The campaign folder is the database for dm/.** The admin page holds a
File System Access grant on the folder the DM picked (`campaigns/<name>/` by
convention, gitignored) and autosaves straight into it — one file per
entity, `session.json` for play state; deletes go to `trash/`. No server
reads or writes campaign files. The dm apps keep only device preferences
locally (the remembered folder handle in IndexedDB, volumes in
`localStorage`). The creator still stores its drafts in `localStorage`
(`dnd-creator-*`) and exports `.json` files.

**The creator is the source of truth for character rules.**
`dm/src/rules/{data,engine,character}.js` are copies of the creator's inline
blocks (plus mechanical `export`/`import` syntax), and
`dm/src/styles/tokens.css` of its theme block. `dm/check-sync.py` asserts none
of the copies have drifted. **Run it after editing the creator's
`data`/`engine`/theme blocks or anything under `dm/src/rules/`**, and treat a
change as unfinished until it passes:

```bash
python3 dm/check-sync.py
node --test dm/src/lint.test.js dm/src/shared/shared.test.js dm/src/shared/qr.test.js dm/src/tv/audio.test.js
```

**`campaigns/` is gitignored and personal.** It's session content (an actual
campaign's scenes, party, notes), not application code — treat a missing file
under it as normal, not as a bug in the apps.

**Rules content is paraphrased from the SRD 5.2** (CC-BY-4.0, © Wizards of the
Coast). No text is copied from the Player's Handbook.

**Tests.** `dm/src/**/*.test.js` run under `node --test` (pure model + a
source lint). UI verification is headless-Chrome-driven; `dm/CLAUDE.md`
documents the probe pattern and the traps worth knowing before repeating it.
