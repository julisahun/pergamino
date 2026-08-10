/* Structural checks on the QR encoder. The full proof — that a real reader
   decodes the output — was done against macOS Vision for versions 1–5 and
   UTF-8 payloads; these tests guard the invariants that made that pass:
   geometry, function patterns, and a self-consistent format word. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix } from './qr.js';

const FINDER = [
  [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1],
];

function assertFinder(grid, r0, c0) {
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    assert.equal(grid[r0 + r][c0 + c], FINDER[r][c],
      `finder module (${r0 + r},${c0 + c})`);
  }
}

test('sizes follow the version the payload needs', () => {
  assert.equal(qrMatrix('HOLA').size, 21);                       // v1
  assert.equal(qrMatrix('x'.repeat(30)).size, 29);               // v3
  assert.equal(qrMatrix('x'.repeat(80)).size, 37);               // v5
  assert.throws(() => qrMatrix('x'.repeat(90)), /demasiado largo/);
});

test('function patterns are in place', () => {
  const { size, grid } = qrMatrix('http://192.168.1.23:8420/tv');
  assert.equal(grid.length, size);
  for (const row of grid) assert.equal(row.length, size);

  assertFinder(grid, 0, 0);
  assertFinder(grid, 0, size - 7);
  assertFinder(grid, size - 7, 0);
  for (let i = 8; i < size - 8; i++) {                 // timing
    assert.equal(grid[6][i], i % 2 === 0 ? 1 : 0);
    assert.equal(grid[i][6], i % 2 === 0 ? 1 : 0);
  }
  assert.equal(grid[size - 8][8], 1);                  // dark module
});

test('format word is BCH-valid, level M, and mirrored in both copies', () => {
  for (const text of ['HOLA', 'http://10.0.0.5:8420/tv', 'x'.repeat(60)]) {
    const { size, grid } = qrMatrix(text);
    /* read copy 1 (around the top-left finder), MSB first */
    const bits = [];
    for (let i = 0; i <= 5; i++) bits.push(grid[8][i]);
    bits.push(grid[8][7], grid[8][8], grid[7][8]);
    for (let i = 5; i >= 0; i--) bits.push(grid[i][8]);
    let f = bits.reduce((acc, b) => (acc << 1) | b, 0) ^ 0x5412;

    let rem = f;                                       // BCH(15,5) check
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    assert.equal(rem, 0, `BCH remainder for «${text}»`);
    assert.equal((f >> 13) & 0b11, 0b00, 'EC level M');

    /* copy 2 must carry the same word */
    const bits2 = [];
    for (let i = 0; i < 7; i++) bits2.push(grid[size - 1 - i][8]);
    for (let i = 0; i < 8; i++) bits2.push(grid[8][size - 8 + i]);
    const f2 = bits2.reduce((acc, b) => (acc << 1) | b, 0) ^ 0x5412;
    assert.equal(f2, f, 'both format copies agree');
  }
});

test('output is deterministic', () => {
  const a = qrMatrix('lo mismo dos veces');
  const b = qrMatrix('lo mismo dos veces');
  assert.deepEqual(a.grid, b.grid);
});
