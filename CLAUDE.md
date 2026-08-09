# dnd

A personal toolkit for running a D&D 5e (2024 rules) campaign, level 1 only. Two
self-contained, dependency-free HTML apps plus the campaign content they read.

```
dnd/
  creator/            character creator — see creator/CLAUDE.md
    index.html
  dm/                 combat tracker + TV display — see dm/CLAUDE.md
    index.html
    tablero.html
    check-sync.py
  campaigns/           campaign content, gitignored — not app code
    campaign-01/
      scenarios/       one .json per prepared scene
      assets/          images, assets/audio/ for music
      story/           DM notes, .md, grouped by subfolder
      players/         character exports (the creator's .json)
      monsters/        bestiary entries, one .json each
  introduction.md      campaign pitch/premise (narrative, not app docs)
```

Each app has its own `CLAUDE.md` with the detail that matters when editing it.
Read that file before touching code under `creator/` or `dm/`.

## Rules that hold everywhere in this repo

**No server, no build, no dependencies.** Every app is opened with a double
click (`file://`). Never add a bundler, `package.json`, or `fetch()`/`XHR` —
`file://` pages can't do either; the design works around that constraint on
purpose (see each app's `CLAUDE.md`).

**Language split.** UI text and all rules content are **Spanish**. Code,
identifiers, comments and every doc file (including this one) are **English**.

**One look.** Aged-parchment "pergamino" theme — IM Fell English SC headings,
parchment tokens. There is no theme picker and no stored theme preference;
that was removed on purpose so the three HTML files can never fall out of
visual sync with each other.

**`localStorage` only, one key per concern**, namespaced `dnd-creator-*` /
`dnd-dm-*`. The ceiling is ~5 MB, so anything that could be large (map images,
audio) is stored as a **relative path** on disk, or downscaled/re-encoded
before it ever touches a key — never embedded raw.

**The creator is the source of truth for character rules.** `dm/index.html`
carries a verbatim copy of the creator's rules tables, engine and a few helper
functions; `dm/tablero.html` carries a copy of the shared theme tokens.
`dm/check-sync.py` asserts none of the copies have drifted. **Run it after
editing anything in `creator/index.html`'s `data`/`engine`/theme blocks**, and
treat a change as unfinished until it passes:

```bash
python3 dm/check-sync.py
```

**`campaigns/` is gitignored and personal.** It's session content (an actual
campaign's scenes, party, notes), not application code — treat a missing file
under it as normal, not as a bug in the apps.

**Rules content is paraphrased from the SRD 5.2** (CC-BY-4.0, © Wizards of the
Coast). No text is copied from the Player's Handbook.

**No test suite.** Verification is manual and headless-Chrome-driven; each
app's `CLAUDE.md` documents the fixture pattern and the traps worth knowing
before repeating it.
