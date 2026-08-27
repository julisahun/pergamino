/* Source-level lint, run with the unit suite (see CLAUDE.md for the command —
   a glob cannot be written in here, because the star-slash inside one closes
   the comment, which is a trap this repo has now paid for twice).

   htm does not auto-close void elements: `<input>` without the trailing slash
   silently adopts its following siblings as children and corrupts the vnode
   tree — the symptom is `insertBefore ... is not of type 'Node'` on the SECOND
   render, far from the template that caused it. This scan makes that mistake
   fail at test time instead of at the table.

   The scanner walks the source rather than regexing it, because both cheaper
   approaches have already been wrong here:

     · stripping block comments first eats `accept="image/*"` in a template and
       everything after it, reporting a tag that is perfectly well closed;
     · not stripping them reports prose in a comment that mentions `<input>`.

   So: only the STATIC text inside template literals is scanned, at any nesting
   depth, with `${…}` blanked out — which is exactly what htm itself parses. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const VOID = /<(input|img|br|hr|source|track|wbr)\b[^<>]*>/g;

/**
 * Every static chunk of every template literal in a file. Interpolations are
 * blanked (htm never sees them), and templates nested inside interpolations
 * are collected too, since each is its own template.
 * @param {string} text @returns {string[]}
 */
export function templateChunks(text) {
  /** @type {string[]} */
  const chunks = [];
  let i = 0;

  /** Consume a template literal that starts after its opening backtick. */
  const readTemplate = () => {
    let out = '';
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') { out += ' '; i += 2; continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && text[i + 1] === '{') {
        i += 2;
        readInterpolation();
        out += ' ';           // a hole, opaque to htm
        continue;
      }
      out += c;
      i++;
    }
    chunks.push(out);
  };

  /** Consume up to the matching close brace, collecting nested templates. */
  const readInterpolation = () => {
    let depth = 1;
    while (i < text.length && depth) {
      const c = text[i];
      if (c === '`') { i++; readTemplate(); continue; }
      if (c === '\'' || c === '"') { skipString(c); continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
  };

  const skipString = (/** @type {string} */ quote) => {
    i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === quote) { i++; return; }
      i++;
    }
  };

  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {          // block comment
      i = text.indexOf('*/', i + 2);
      if (i < 0) return chunks;
      i += 2;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {          // line comment
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl;
      continue;
    }
    if (c === '\'' || c === '"') { skipString(c); continue; }
    if (c === '`') { i++; readTemplate(); continue; }
    i++;
  }
  return chunks;
}

function* jsFiles(/** @type {string} */ dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* jsFiles(join(dir, entry.name));
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      yield join(dir, entry.name);
    }
  }
}

test('every void element in an htm template is self-closed', () => {
  /** @type {string[]} */
  const offenders = [];
  let scanned = 0;
  for (const file of jsFiles(SRC)) {
    scanned++;
    for (const chunk of templateChunks(readFileSync(file, 'utf8'))) {
      for (const m of chunk.matchAll(VOID)) {
        if (!m[0].endsWith('/>')) offenders.push(`${file}: ${m[0].slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'unclosed void elements (htm needs <input />):\n' + offenders.join('\n'));
  /* A lint that walked no files passes for the wrong reason. */
  assert.ok(scanned > 0, 'the lint scanned no source files at all');
});

test('the scanner reads what htm reads, and nothing else', () => {
  /* A comment that mentions a tag is prose, not a template. */
  assert.deepEqual(templateChunks('/* write <input> like this */'), []);
  /* A glob inside template text is text, not the start of a comment. */
  const chunks = templateChunks('html`<input accept="image/*" />`');
  assert.deepEqual(chunks, ['<input accept="image/*" />']);
  /* Interpolations are holes; templates inside them are their own templates. */
  assert.deepEqual(templateChunks('html`<p>${x ? html`<br />` : y}</p>`'),
    ['<br />', '<p> </p>']);
  /* And a backtick inside a string is not a template. */
  assert.deepEqual(templateChunks("const s = '`<input>`';"), []);
});
