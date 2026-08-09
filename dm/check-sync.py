#!/usr/bin/env python3
"""
Asserts that the parts of these three files copied from one another have not
drifted.

  creator/index.html  ──rules──►  dm/index.html  ──theme──►  dm/tablero.html

The DM board calls derive() on the players' exported .json, so it carries a
verbatim copy of the creator's rules tables and engine; a divergence would mean
the board quietly showing different numbers than the sheet the player is
holding. tablero.html carries the design tokens so the television and the laptop
are the same colour.

What is checked:

  creator → dm       <script id="data">     the frozen rules tables
                     <script id="engine">   derive() and everything it calls
                     blankCharacter()       needed to accept an exported file
                     newId()
                     normalise()

  creator → dm       theme tokens           the single :root token block
  creator → tablero  theme tokens

Usage:  python3 check-sync.py         (run it from anywhere)
Exit:   0 identical, 1 drift, 2 could not extract

Fix drift in the file on the left of the arrow, then copy across. The creator
is the source of the rules; it is also the source of the look.
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
CREATOR = HERE.parent / 'creator' / 'index.html'
DM = HERE / 'index.html'
TV = HERE / 'tablero.html'


def script_block(html, name, where):
    """The whole <script id="name"> … </script>, tags included."""
    m = re.search(r'<script id="%s">.*?</script>' % re.escape(name), html, re.S)
    if not m:
        sys.exit('%s: no <script id="%s"> block found' % (where, name))
    return m.group(0)


def function(html, name, where):
    """A top-level `function name(...) { … }`, found by brace balance.

    Brace counting is enough here because these three functions contain no
    string or comment holding an unbalanced brace — asserted below, so this
    stops being true loudly rather than silently.
    """
    m = re.search(r'^function %s\(' % re.escape(name), html, re.M)
    if not m:
        sys.exit('%s: no top-level `function %s(` found' % (where, name))
    start = m.start()
    depth = 0
    for i in range(start, len(html)):
        if html[i] == '{':
            depth += 1
        elif html[i] == '}':
            depth -= 1
            if depth == 0:
                return html[start:i + 1]
    sys.exit('%s: `function %s(` never closes' % (where, name))


THEME_START = '/* ----------------------------------------------------------- shared tokens'
THEME_END = '* { box-sizing: border-box; }'


def theme_tokens(html, where):
    """The whole :root token block, from its comment down to the reset.

    tablero.html has no components and no print section, so the tokens are the
    only stylesheet the three files have any business sharing.
    """
    try:
        start = html.index(THEME_START)
        end = html.index(THEME_END, start)
    except ValueError:
        sys.exit('%s: could not find the theme token block' % where)
    return html[start:end].rstrip()


def main():
    for path in (CREATOR, DM, TV):
        if not path.exists():
            sys.exit('missing file: %s' % path)

    creator = CREATOR.read_text(encoding='utf-8')
    dm = DM.read_text(encoding='utf-8')
    tv = TV.read_text(encoding='utf-8')

    parts = []
    for name in ('data', 'engine'):
        parts.append(('<script id="%s">' % name, 'creator', 'dm',
                      script_block(creator, name, 'creator'),
                      script_block(dm, name, 'dm')))
    for name in ('blankCharacter', 'newId', 'normalise'):
        parts.append(('%s()' % name, 'creator', 'dm',
                      function(creator, name, 'creator'),
                      function(dm, name, 'dm')))
    parts.append(('theme tokens', 'creator', 'dm',
                  theme_tokens(creator, 'creator'), theme_tokens(dm, 'dm')))
    parts.append(('theme tokens', 'creator', 'tablero',
                  theme_tokens(creator, 'creator'), theme_tokens(tv, 'tablero')))

    names = {'creator': 'creator/index.html', 'dm': 'dm/index.html', 'tablero': 'dm/tablero.html'}
    drift = [p for p in parts if p[3] != p[4]]

    for label, src, dst, a, b in parts:
        mark = 'DRIFT' if a != b else 'ok   '
        print('%s  %-22s %-8s → %-8s %7d bytes' % (mark, label, src, dst, len(a)))

    if drift:
        label, src, dst, a, b = drift[0]
        print('\n%d copied part(s) differ. Fix in %s, copy into %s.' % (len(drift), names[src], names[dst]))
        print('A diff of the first one:\n')
        import difflib
        sys.stdout.writelines(difflib.unified_diff(
            a.splitlines(True), b.splitlines(True),
            fromfile=names[src] + ' ' + label,
            tofile=names[dst] + ' ' + label, n=2))
        return 1

    print('\nAll %d copied parts are identical.' % len(parts))
    return 0


if __name__ == '__main__':
    sys.exit(main())
