# lint/ — the data contract's library

Not app code. These sixteen modules are what `../check-campaign.js` needs to
read a campaign folder, and they are the only part of the previous app that
outlived it.

> **They now describe a format that no longer exists.** `importing.md` — the
> spec they were the executable half of — has been deleted, and PNJ, objects
> and players are markdown notes rather than json (see the repo's `CLAUDE.md`).
> Pointed at a current campaign this linter reports everything as broken. It is
> kept because the rules engine underneath is real work; decide whether to
> rewrite it against the new format or drop it, but do not trust it as it is.

## Why they are not shared with the app

The app that replaced it does not implement 5e character rules at all. It
reads the derived numbers out of the `-fc5.xml` the creator generates
(`shared/vault/sheet.ts`), precisely so it never has to re-derive hit points
from class, CON and species traits and get them subtly wrong at the table.

`rules/engine.js` and `rules/data.js` *do* implement them, because validating a
player build is exactly what the linter is for. That makes this a second
implementation of nothing the app relies on — which is why it lives here,
under a name that says what it is, rather than in `shared/`.

## If you change these

The only consumer is `check-campaign.js`. Nothing here is bundled, typechecked
or shipped: the deploy sends `dist/` and `server.py` and nothing else. Run

```bash
node check-campaign.js campaigns/example
```

from the repo root, which is what CI does. Exit 1 is warnings, exit 2 is
errors, and
only errors mean the app would read something different from what the file
says.
