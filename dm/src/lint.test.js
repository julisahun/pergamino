/* Source-level lint, run with the unit suite:
     node --test dm/src/

   htm does not auto-close void elements: `<input>` without the trailing
   slash silently adopts its following siblings as children and corrupts the
   vnode tree — the symptom is `insertBefore ... is not of type 'Node'` on
   the SECOND render, far from the template that caused it. This scan makes
   that mistake fail loudly at test time instead. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const VOID = /<(input|img|br|hr|source|track|wbr)\b[^<>]*>/g;

/** htm only ever parses the template's static chunks — `${…}` holes are
    opaque to it — so interpolations (which legitimately contain `>` in arrow
    functions) are blanked out, brace-balanced, before the tag scan. Block
    comments go too: prose mentioning a bare tag is not a template. */
function staticChunks(text) {
  let out = '', i = 0;
  while (i < text.length) {
    if (text.startsWith('${', i)) {
      let depth = 1;
      i += 2;
      while (i < text.length && depth) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        i++;
      }
      out += ' ';
    } else {
      out += text[i++];
    }
  }
  return out.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function* jsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'rules') yield* jsFiles(join(dir, entry.name));
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) yield join(dir, entry.name);
  }
}

test('every void element in an htm template is self-closed', () => {
  const offenders = [];
  for (const file of jsFiles(SRC)) {
    const text = staticChunks(readFileSync(file, 'utf8'));
    for (const m of text.matchAll(VOID)) {
      if (!m[0].endsWith('/>')) offenders.push(`${file}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, [], 'unclosed void elements (htm needs <input />):\n' + offenders.join('\n'));
});
