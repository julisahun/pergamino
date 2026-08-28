# lint/ — the data contract's library

Not app code. These sixteen modules are what `../check-campaign.js` needs to
read a campaign folder the way `../importing.md` says it should be read, and
they are the only part of the previous app that outlived it.

They stayed because the linter is the executable half of the import spec: the
spec says what a `scenarios/*.json` may contain, and the linter is what tells
an outside DM whether theirs does. Deleting them would have left `importing.md`
as a promise nobody checks.

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
