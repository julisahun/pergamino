# pergamino — Pantalla de DM

The DM's table: a console window and a television window, both fed from a
campaign folder the **browser** holds. The repo is the app — there is no
second thing in here.

`README.md` is the user-facing document — what the app does and how to run it.
This file is the part that matters when editing it.

## The shape of the thing

```
shared/     the whole core. No DOM, no node — the browser and the tests
            import the same files.
app/        two pages: index.html (console) and tv.html (television).
server.py   a static host. Stdlib only.
test/       fixture wiring, node-only.
scripts/    Playwright drivers, node-only.
dist/       the build. Gitignored; the only thing deployed.

check-campaign.js lints a campaign folder against the *pre-merge* format —
                  its spec (importing.md) is gone. See lint/README.md.
lint/             the sixteen modules that linter needs — the only part of
                  the previous app that outlived it. Not app code, and
                  nothing here imports it.
```

No campaign content lives here. The repo is the app: campaigns are folders the
DM picks at runtime, and the only one baked in is
`app/src/fixtures/example.json` — a snapshot of a demo campaign that the
Playwright drivers mount in memory, dev-only and dropped from the production
build.

The split that matters is **not** client/server — there is no server. It is
*pure core* (`shared/`) versus *the shells that touch storage*
(`app/src/vault/fsa.ts`, `shared/vault/node.ts`, `shared/vault/memory.ts`).
Anything you can write without a directory handle belongs in `shared/`.

## The rule this app exists to keep

`runs/README.md` in a campaign says:

> La preparación no se toca durante el juego; una partida sólo acumula.
> Nada de `runs/` edita `story/`, `pnj/`, `objects/` ni `scenarios/`.

It is enforced by **types**, not by a check. Loaders take `VaultDir`, which has
no `write`. A handle cannot address its parent. Exactly two descents in
`shared/vault/binding.ts` resolve a `WritableVaultDir`:

- `CampaignVault.run(mesa)` — `runs/<mesa>/`, while playing
- `CampaignVault.scenarios()` — `scenarios/`, from Preparación, which the UI
  refuses while a run is live

If you find yourself wanting a writable handle anywhere else, that is the
design telling you no. `shared/vault/scope.test.ts` will also tell you.

## One file per thing

A PNJ is `pnj/<id>.md` and an object is `objects/<id>.md`: an ordinary Obsidian
note, with the statblock in YAML front matter and the prose below it. There is
no `monsters/` folder and no `story/gente/` — those were two halves of the same
person, kept in step by hand, which the console then stitched back together by
slug at render time.

What falls out of that:

- **The bestiary is in the notes graph.** `[[Cristelle]]` resolves to the
  statblock, backlinks work, and `Pnj.file` *is* the note's key in `NotesIndex`
  — so the card's "Ver nota" is `openNote(pnj.file)` with nothing to look up.
- **`hpMax` is what makes a PNJ a combatant.** No hit points in the front
  matter means someone the party only talks to: `instantiate` skips it and a
  scene roster cannot seat it. `Npc` narrows `hpMax` back to a number.
- **The id falls back to the file name**, which is already stable and unique
  within a folder. The old format had to ask for one in prose.
- **No inline base64.** A portrait is `assets/pnj/<id>.jpg`. The json carried
  ~70 KB data URIs, which is exactly what a note cannot hold.
- **A PJ is a folder: `players/<pj>/<pj>.md` + `<pj>-fc5.xml`.** The note named
  like the folder *is* the character; nothing else in there is. A player
  accumulates a trasfondo, a guía, pdfs and the creator's json beside it, and
  none of those is another member of the party — which is what a flat
  `players/*.md` could not say. A loose `players/x.md` is not a character at
  all, and the extra notes stay reachable through `NotesIndex` like any note.
  The app still never reads a field of the creator's build recipe, and the xml
  says so itself — *"si algún número de la app no coincide con los de arriba,
  mandan los de arriba"*.
- **`scenarios/` stays json**, because it is the one prep folder the app writes
  back to. Round-tripping a scene through the markdown renderer would cost the
  DM their formatting every time they moved a token.

`scripts/migrate-pnj.mjs` is the one-shot that did this to a real folder.

## The other boundary

`projectTable` (`shared/session/project.ts`) decides what the television is
allowed to see. An unrevealed NPC is **absent** from `TableView`, not hidden
inside it — no stat blocks, no DM notes, no positions for tokens that are not
on screen. `project.vault.test.ts` asserts this against the real vault, down to
`JSON.stringify(view)` not containing the hidden id.

The television window has no directory handle, so it cannot read a campaign
even in principle. Keep it that way: it receives a `TableView` and blobs it
asked for by key, over `app/src/transport/`. Nothing else.

## Traps worth knowing first

- **Asset keys are not URLs.** `/vault/assets/x.jpg` and
  `/api/portrait/npc/<id>` are *names* — nothing serves them. The DM window
  resolves one against its handle; the television asks for it over the
  transport. Render them with `<Art>`/`useAssetUrl`, never as `<img src>`.
- **`readOnly()` is a real handle, not a cast.** `WritableVaultDir.readOnly()`
  returns a handle that cannot write and whose children cannot either. Casting
  past `VaultDir` buys nothing, which is what makes the scope test true.
- **`createDir` reuses.** It only needs write permission to actually *create*;
  that is what lets the read-only fixture descend into a run and then refuse
  the write itself.
- **No `node:path` in `shared/`.** Use `shared/pathish.ts` — POSIX only, and
  what a directory walk and an Obsidian wikilink both produce.
- **Front matter is real YAML** (`js-yaml`), so `Note.frontmatter` is
  `Record<string, unknown>` and a statblock can hold lists and maps. Guard the
  empty block: js-yaml 5 *throws* on `''` where v4 returned `undefined`.
- **A scene roster reads `pnjId ?? monsterId ?? beastId`.** The spec said
  `beastId` and the loader only ever read `monsterId`, so every roster written
  to spec was silently dropped. Keep the fallback.
- **The store is async now.** `store.open(mesa)` and `store.flush()` return
  promises; `dispatch` does not.
- **Chromium only.** The File System Access API is not in Firefox or Safari.
  The app says so plainly rather than failing oddly; keep that path working.

## Rules that hold across the repo

**The campaign folder is the database.** The console page holds a File System
Access grant on the folder the DM picked — a world (`talasia/`, with
`campaigns/` inside) or a flat campaign (`campaigns/<name>/`) — and reads and
writes it directly. No server reads or writes campaign files, and the
television window holds no grant at all. The app keeps only device preferences
locally: the remembered folder handle in IndexedDB, the campaign and mesa in
`localStorage`.

**`server.py` is Python stdlib only.** Never add a pip dependency. It is a
static host and nothing else: no endpoint reads, writes or receives a campaign
file, and there is no `do_POST`. That property is what makes it safe to host at
`https://dm.sigint-pm.uk` without auth — do not add a route that breaks it.

**The build is deliberate.** This repo held "no build, no npm" for years, and
the rebuilt app broke it: Vite, React and TypeScript, so there is a
`package.json` and a `node_modules/`. What bought the exception: the browser
owns every campaign file through the File System Access API, `shared/` is typed
end to end so the write scope is a compile error rather than a runtime check,
and the Pi runs *less* than before — `dist/` and `server.py`, no Node at all.
`engines.node` is for development only.

**The app does not implement 5e rules.** It reads the derived numbers out of
the `-fc5.xml` beside each player file, precisely so it never re-derives hit
points from class, CON and species traits and gets them subtly wrong at the
table. The rules code under `lint/` belongs to `check-campaign.js`, not to the
app.

**Rules content is paraphrased from the SRD 5.2** (CC-BY-4.0, © Wizards of the
Coast). No text is copied from the Player's Handbook.

## Language

UI text is **Spanish**, in `app/src/strings/es.ts` and nowhere else. Code,
identifiers, file names, comments and every doc file (including this one) are
**English**.

## Treat a change here as unfinished until these pass

```bash
npm test                 # 185 with the DM's vault present, 49 without
npm run typecheck
npm run build
```

`check-campaign.js` is not in that list, and no longer matches the format
either — it validates `monsters/*.json` and creator player builds against a
spec that has been deleted. Pointed at a current campaign it now detects the
markers (`pnj/<id>.md`, `objects/<id>.md`, `players/<pj>/<pj>.md`), says so and
exits 2 rather than reporting zero of everything; `--force` runs the old checks
anyway. Deciding whether to port or drop it is still open — see
`lint/README.md`.

The vault tests read the DM's live campaign, so **close the console tab before
running them**: an open DM window re-scans the folder every 5 seconds and will
rewrite `runs/<mesa>/session.json` underneath the suite.

And, for anything on screen, one of the drivers:

```bash
npm run dev &
node scripts/e2e.mjs
```

They open the app on `?fixture=example`, which mounts
`app/src/fixtures/example.json` in memory — the native folder picker cannot be
driven from a script. That fixture is dev-only; `import.meta.env.DEV` keeps it
out of the production bundle. It is now the *only* copy of the demo campaign,
so treat it as content rather than as build output; regenerate it with
`node scripts/build-fixture.mjs <folder>` if you want a different one.

## Tests, and the vault that is not on CI

The suite splits by what the machine has:

- Everything built on `MemoryVault` (`test/memory.ts`) runs anywhere — the
  write-scope guard and the async shells. That is what CI runs.
- The DM's own Obsidian vault is private. Tests that read it are named
  `*.vault.test.ts`, and `vitest.config.ts` leaves them out when it is not
  there — saying so out loud, because they are the check that moving the pure
  modules to `shared/` changed no behaviour.

Never write to the real vault from a test. `test/fixture.ts` opens it
read-only, so the handle throws before a byte moves; `readonly.vault.test.ts`
drives the store at it on purpose and checks `session.json` is untouched.
