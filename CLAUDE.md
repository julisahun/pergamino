# pergamino — Pantalla de DM

The DM's table: a console window and a television window fed from a campaign
folder the **browser** holds, a player page on each phone, and a small server
that owns the party and the live state. The repo is the app — there is no
second thing in here.

`README.md` is the user-facing document — what the app does and how to run it.
This file is the part that matters when editing it.

## The shape of the thing

```
shared/     the whole core. No DOM, no node — the browser, the server and the
            tests import the same files.
shared/combat/  what a combatant can do, read out of the prose that already
            describes it. Pure: no state, no session, no dice inside `reduce`.
shared/protocol.ts  every shape that crosses the wire; both sides import it.
app/        the pages: index.html (console), tv.html (television),
            pj.html (a player's phone).
server/     Node + SQLite. Owns characters and live state, runs the same
            `reduce`, serves the pages. Bundled to one file for the Pi.
test/       fixture wiring, node-only.
scripts/    Playwright drivers and `dev.mjs`, node-only.
dist/       the build. Gitignored; with server/dist/index.mjs, the only
            thing deployed.

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

The split that matters is still *pure core* (`shared/`) versus *the shells
that touch storage*, and there are three shells now: the console's directory
handle (`app/src/vault/fsa.ts`, and `shared/vault/{node,memory}.ts` for tests
and the fixture), the server's SQLite (`server/src/`), and a phone, which has
no storage at all and holds a projection. Anything you can write without a
directory handle, a database or a socket belongs in `shared/`.

Prep never leaves the machine; live state never touches the folder. The
console reads pnj, objects, scenes, notes and assets from the folder and
*publishes* to the server only what `reduce` needs of them — statblocks,
object rules, scene rosters, never prose (`app/src/state/publish.ts` is where
the cutting happens). The server owns the party and the session. The folder
holds `runs/<mesa>/` for bitácora and estado, and `.pergamino/campaign.json`
with the campaign's id, and no `session.json` any more.

## The rule this app exists to keep

`runs/README.md` in a campaign says:

> La preparación no se toca durante el juego; una partida sólo acumula.
> Nada de `runs/` edita `story/`, `pnj/`, `objects/` ni `scenarios/`.

It is enforced by **types**, not by a check. Loaders take `VaultDir`, which has
no `write`. A handle cannot address its parent. Exactly three descents in
`shared/vault/binding.ts` resolve a `WritableVaultDir`:

- `CampaignVault.run(mesa)` — `runs/<mesa>/`, for bitácora and estado.md
- `CampaignVault.scenarios()` — `scenarios/`, from Preparación, which the UI
  refuses while a run is live
- `CampaignVault.pergamino()` — `.pergamino/`, the app's own dotdir, written
  once on registration with the campaign's id and read by no note walk

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
- **A PJ is a row on the server**: the `-fc5.xml` its player uploaded through
  the campaign's link, plus its live layer. The vault holds no party — a
  `players/` folder, if there is one, is ordinary material (trasfondos, guías,
  the creator's json) reachable as notes and never read as characters. Level-up
  is the player uploading a new xml; the live layer survives it. The app still
  never reads a field of the creator's build recipe, and the xml says so
  itself — *"si algún número de la app no coincide con los de arriba, mandan
  los de arriba"*.
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

One thing crosses it *changed* rather than absent: a PNJ whose note gives an
`alias` is projected under that name — `tableNames` in the same file — so the
console can go on calling him Tulio while the television says "Soldado ahogado
2". Whoever is not masked keeps their real name, so a number means the same
creature on both screens; the mask itself is live state (`field.reveal[ref]
.name`), because taking it off is something that happens at the table. The log
never reaches the television, so it keeps real names.

Being at the table is having a ficha, and the projection draws that line too:
`projectTable` lists whoever has a token *and* is revealed. «Quitar de la
mesa» is `token/remove`, which leaves the ficha and its reveal in the session
so `+ Añadir` can seat the same creature again with its hit points — and for a
while the television went on showing a bandit the rail (which lists by token)
could no longer reach. `token/remove` also takes the seat out of
`encounter.members`, and `advance` skips a member with no token, because a run
saved before that pruning can still carry one.

The television window has no directory handle, so it cannot read a campaign
even in principle. Keep it that way: it receives a `TableView` and blobs it
asked for by key, over `app/src/transport/`. Nothing else.

The player page is the second projection boundary, with the same discipline.
`projectPlayer` (`shared/session/player.ts`) gives a phone one character in
full — sheet, live layer, held objects — and about everyone else exactly
`projectTable`'s combatant list split into `party` and `foes`, so another PC's
hit points follow the reveal rule the screen in the room follows and an
unrevealed NPC is not there. `LiveState.note` is the *DM's* note about the
character and does not cross; `player.test.ts` asserts the leaks by
`JSON.stringify`. What a player may *do* is the allowlist in
`shared/session/allow.ts`, applied on the server before `reduce` and on the
phone only to grey a control out.

## Where the dice are

The reducer is deterministic. `ReduceOpts` injects ids so the whole suite can
drive `reduce` without stubbing a generator, and initiative used to be rolled
in there and was deliberately taken out — `reducer.ts` still says *"Nothing is
rolled here"* and `reducer.vault.test.ts` still asserts it.

Resolving an attack did not change that. The console rolls — by the DM's hand
or by the 🎲 beside the field, which are the same thing as far as anything
downstream is concerned — and `attack/resolve` carries an *outcome*:
who swung, what with, and per target the face, the verdict and the amount. So
the die the DM wanted and the determinism the tests rest on are not in tension;
they are on opposite sides of one action payload.

Two things follow, and both matter more than they look:

- **The verdict is a suggestion.** `hits()` returns `null` when nothing states
  an AC or the note gives no attack bonus, and the console shows «sin CA —
  decides tú» with a `⇄` rather than inventing a number. A wizard with Escudo
  up has an AC no sheet knows about, and nothing is applied until Aplicar.
- **`AttackTarget.hit` means "it landed", which for a save means the target
  *failed* it** — and it does not decide the damage. `amount` is already what
  that target takes, a made save's half included (`afterSave` in the console).
  The reducer applies `amount` for a save whatever `hit` says; only an attack
  roll can land on nothing at all.

`attack/resolve` is one action rather than three dispatches because a fireball
that half-applied would be worse than one that did not, and because three
entries in the bitácora would not say they were the same swing. It reaches the
same `takeDamage`/`giveHealing` helpers `hp/damage` and `hp/heal` do, so
temporary hit points absorb and a PC who drops still goes Inconsciente.

## What an action is read from

`shared/combat/attacks.ts` reads attacks out of prose a human wrote for a
human. Nothing was added to any campaign for it: a pnj note already said
«+3 al ataque, 1d6+1 de daño cortante» and a `-fc5.xml` already said
«Ataque +5, daño 1d6 +3 perforante». Asking the DM to restate those in a second
structured field would mean two places that can disagree.

- **No dice, no action.** That one rule is what keeps Misil Mágico (three
  darts, «no fallan nunca», one `<roll>` that describes none of it), Grasa,
  Bendición and Guía off the list, and it needs no special case for any of
  them. Ossian's «El agua lo cierra todo» and Tulio's «La sal» state no damage
  and stay prose on the ficha, which is where the DM runs them from.
- **Damage is what makes an attack; the bonus is optional.** Gerald's
  Devastating Cuddle is `2d8+4` and no to-hit at all, and refusing to offer it
  would be refusing to run the only attack the demo campaign's boss has. What
  a missing bonus costs is the verdict, not the action.
- **Both languages.** `marea-baja` is Spanish and the shipped fixture is
  English; that is one format in two languages, so it is one alternation
  rather than a setting somebody has to get right.
- **The damage type is dropped on the floor.** Nothing here resists, absorbs
  or doubles anything, so carrying "cortante" to the log would be decoration
  that reads like a mechanic.
- `attacks.vault.test.ts` pins the *coverage* against the real campaign — every
  seated pnj and every player sheet. That is the file that tells you a new
  statblock worded its attack some other way, rather than an empty menu at the
  table telling you mid-fight.

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
- **`dispatch` is a message, not a call.** `RemoteSessionStore.dispatch` sends
  the action over the socket and returns; the state arrives later, as a whole,
  by subscription. Never read state right after dispatching. A typed field
  goes through `useDraft` (`app/src/dm/useDraft.ts`), or the server's echo
  fights the keystrokes. And `reduce` mints ids and stamps times, so the
  console does not apply optimistically — one copy of the state, on the
  server, and nothing to reconcile.
- **`start()` runs once.** StrictMode mounts effects twice in development; a
  second boot racing the first registers the campaign twice.
- **Chromium only — for the console.** The File System Access API is not in
  Firefox or Safari. The app says so plainly rather than failing oddly; keep
  that path working. The player page has no handle and must work everywhere.
- **Node strips types, but not everything.** The server runs unbundled in
  development (`node server/src/index.ts`), so no constructor parameter
  properties, no enums. `node:sqlite` is loaded through
  `process.getBuiltinModule` because Vite, which runs the tests, would go
  looking for a package called `sqlite`.

## Rules that hold across the repo

**The campaign folder is the prep database; the server is the live one.** The
console holds a File System Access grant on the folder the DM picked — a world
(`talasia/`, with `campaigns/` inside) or a flat campaign — and reads it
directly; the server never sees a directory, a note, `story/` or a scene's
prose. Characters and live state are the server's, keyed by the id in
`.pergamino/campaign.json`; renaming a folder changes nothing. The console
keeps device preferences locally — the folder handle in IndexedDB, the
campaign, mesa and DM token in `localStorage`.

**The server's contract** (`server/src/`): it receives the campaign's title,
the published statblocks (`PrepBody`), a `-fc5.xml` per character, and
actions. Every write under `/api/dm/` wants the DM's bearer token from `.env`;
the server refuses to start without one. A link secret (`/pj#<link>`) reveals
the picker and one character's own view, and lets whoever holds it add or
replace a character — friend-scale trust, rotatable from the console. No route
serves a campaign file; `deploy-dm.yml` re-asserts that on the box. Cache
headers are the ones `server.py` learned the hard way: assets immutable, pages
`no-cache`, errors `no-store`.

**The build is deliberate.** This repo held "no build, no npm" for years, and
the rebuilt app broke it: Vite, React and TypeScript, so there is a
`package.json` and a `node_modules/`. What bought the exception: the browser
owns every prep file through the File System Access API, `shared/` is typed
end to end so the write scope is a compile error rather than a runtime check,
and the server runs the *same* reducer the tests do. The Pi now runs Node — one
bundled file, no `node_modules` — because the alternative was a party that
lived in four places.

**The app does not implement 5e rules.** It reads the derived numbers out of
the `-fc5.xml` a player uploaded, precisely so it never re-derives hit points
from class, CON and species traits and gets them subtly wrong at the table.
The one addition (`shared/skills.ts`) is arithmetic on stated numbers: a skill
the sheet marks proficient but does not quote shows ability plus the sheet's
own proficiency bonus, flagged `derived`, and a stated line always wins. The
rules code under `lint/` belongs to `check-campaign.js`, not to the app.

**Rules content is paraphrased from the SRD 5.2** (CC-BY-4.0, © Wizards of the
Coast). No text is copied from the Player's Handbook.

## Language

UI text is **Spanish**, in `app/src/strings/es.ts` and nowhere else. Code,
identifiers, file names, comments and every doc file (including this one) are
**English**.

## Treat a change here as unfinished until these pass

```bash
npm test                 # 324 with the DM's vault present, 192 without
npm run typecheck
npm run build            # tsc, the pages, and server/dist/index.mjs
```

`check-campaign.js` is not in that list, and no longer matches the format
either — it validates `monsters/*.json` and creator player builds against a
spec that has been deleted. Pointed at a current campaign it now detects the
markers (`pnj/<id>.md`, `objects/<id>.md`, `players/<pj>/<pj>.md`), says so and
exits 2 rather than reporting zero of everything; `--force` runs the old checks
anyway. Deciding whether to port or drop it is still open — see
`lint/README.md`.

The vault tests read the DM's live campaign — the prep, and the four real
`-fc5.xml` files still kept under `runs/last/players/`, which the app no longer
reads as a party but which are the real sheets of a real one (`loadParty()` in
`test/fixture.ts`). Nothing reads live state from the folder; there is none.
A test that needs someone at the table **builds** the state — `seated()`, plus
`npc/add` from real prep.

And, for anything on screen, one of the drivers:

```bash
npm run dev &            # the server (data/dev.sqlite, token `dev`) and Vite
node scripts/e2e.mjs     # starts an in-memory server itself if none answers
```

They open the app on `?fixture=example`, which mounts
`app/src/fixtures/example.json` in memory — the native folder picker cannot be
driven from a script — and registers it on the dev server under one fixed id,
wiped and rebuilt on every boot, uploading the sheet the snapshot keeps under
`players/`. The harness sets the token in `localStorage` the way the DM does;
there is no test door in the app. The fixture is dev-only; `import.meta.env.DEV`
keeps it out of the production bundle. It is the *only* copy of the demo
campaign, so treat it as content rather than as build output; regenerate it
with `node scripts/build-fixture.mjs <folder>` if you want a different one.

## Tests, and the vault that is not on CI

The suite splits by what the machine has:

- Everything built on `MemoryVault` (`test/memory.ts`) and on an in-memory
  SQLite (`server/src/*.test.ts`) runs anywhere — the write-scope guard, the
  async shells, the server's session, router and socket. That is what CI runs.
- The DM's own Obsidian vault is private. Tests that read it are named
  `*.vault.test.ts`, and `vitest.config.ts` leaves them out when it is not
  there — saying so out loud, because they are the check that moving the pure
  modules to `shared/` changed no behaviour.

Never write to the real vault from a test. `test/fixture.ts` opens it
read-only, so the handle throws before a byte moves; `readonly.vault.test.ts`
drives the store at it on purpose and checks `session.json` is untouched.
