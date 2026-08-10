#!/usr/bin/env python3
"""
Asserts that the parts of dm/ copied from creator/index.html have not drifted.

  creator/index.html  ──rules──►  dm/src/rules/{data,engine,character}.js
  creator/index.html  ──theme──►  dm/src/styles/tokens.css

The DM app runs derive() against the .json a player exported from the creator,
so it carries the creator's rules tables and engine as ES modules; a divergence
would mean the board quietly showing different numbers than the sheet the
player is holding. tokens.css carries the design tokens so every window is the
same colour.

The modules are the creator's inline text plus mechanical ESM syntax and
nothing else. Before comparing, that syntax is undone:

  data.js       strip leading `export ` on top-level declarations
  engine.js     drop `import …` lines, then strip `export `
  character.js  strip `export `, then extract the three functions the same
                brace-balance way they are extracted from the creator
  tokens.css    nothing — the file keeps the creator's own start/end markers

Usage:  python3 check-sync.py         (run it from anywhere)
Exit:   0 identical, 1 drift, 2 could not extract

Fix drift in creator/index.html first (it is the source of the rules and the
look), then re-apply to the module. When the creator itself is rebuilt onto
these modules, this script retires.
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
CREATOR = HERE.parent / 'creator' / 'index.html'
RULES = HERE / 'src' / 'rules'
TOKENS = HERE / 'src' / 'styles' / 'tokens.css'


def script_block(html, name, where):
    """Inner text of <script id="name"> … </script>."""
    m = re.search(r'<script id="%s">(.*?)</script>' % re.escape(name), html, re.S)
    if not m:
        sys.exit('%s: no <script id="%s"> block found' % (where, name))
    return m.group(1).strip()


def function(text, name, where):
    """A top-level `function name(...) { … }`, found by brace balance.

    Brace counting is enough here because these three functions contain no
    string or comment holding an unbalanced brace — this stops being true
    loudly rather than silently.
    """
    m = re.search(r'^function %s\(' % re.escape(name), text, re.M)
    if not m:
        sys.exit('%s: no top-level `function %s(` found' % (where, name))
    start = m.start()
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    sys.exit('%s: `function %s(` never closes' % (where, name))


THEME_START = '/* ----------------------------------------------------------- shared tokens'
THEME_END = '* { box-sizing: border-box; }'


def theme_tokens(text, where):
    """The token block from its banner comment down to (not including) the
    box-sizing reset — the same region in creator's <style> and tokens.css."""
    try:
        start = text.index(THEME_START)
        end = text.index(THEME_END, start)
    except ValueError:
        sys.exit('%s: could not find the theme token block' % where)
    return text[start:end].rstrip()


def unesm(text):
    """Undo the mechanical ESM wrapping: import lines out, export prefix off."""
    text = re.sub(r'^import .*\n', '', text, flags=re.M)
    return re.sub(r'^export (const |function |let )', r'\1', text, flags=re.M).strip()


def main():
    files = {
        'creator': CREATOR,
        'data.js': RULES / 'data.js',
        'engine.js': RULES / 'engine.js',
        'character.js': RULES / 'character.js',
        'tokens.css': TOKENS,
    }
    for label, path in files.items():
        if not path.exists():
            sys.exit('missing file: %s' % path)
    text = {k: p.read_text(encoding='utf-8') for k, p in files.items()}

    character_flat = unesm(text['character.js'])
    parts = [
        ('<script id="data">', 'creator', 'data.js',
         script_block(text['creator'], 'data', 'creator'),
         unesm(text['data.js'])),
        ('<script id="engine">', 'creator', 'engine.js',
         script_block(text['creator'], 'engine', 'creator'),
         unesm(text['engine.js'])),
    ]
    for name in ('blankCharacter', 'newId', 'normalise'):
        parts.append(('%s()' % name, 'creator', 'character.js',
                      function(text['creator'], name, 'creator'),
                      function(character_flat, name, 'character.js')))
    parts.append(('theme tokens', 'creator', 'tokens.css',
                  theme_tokens(text['creator'], 'creator'),
                  theme_tokens(text['tokens.css'], 'tokens.css')))

    names = {'creator': 'creator/index.html',
             'data.js': 'dm/src/rules/data.js',
             'engine.js': 'dm/src/rules/engine.js',
             'character.js': 'dm/src/rules/character.js',
             'tokens.css': 'dm/src/styles/tokens.css'}
    drift = [p for p in parts if p[3] != p[4]]

    for label, src, dst, a, b in parts:
        mark = 'DRIFT' if a != b else 'ok   '
        print('%s  %-22s %-8s → %-12s %7d bytes' % (mark, label, src, dst, len(a)))

    if drift:
        label, src, dst, a, b = drift[0]
        print('\n%d copied part(s) differ. Fix in %s, re-apply to %s.'
              % (len(drift), names[src], names[dst]))
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
