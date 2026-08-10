/* A QR encoder just big enough for one LAN URL: byte mode, EC level M,
   versions 1–5 (up to 84 bytes), all eight masks with penalty scoring.
   Returns a plain boolean matrix — rendering (canvas, quiet zone, scale)
   is the caller's business. No dependencies, ~200 lines, verified by
   decoding its output with a real reader (see qr.test.js for the
   structural half of that promise).

   Spec: ISO/IEC 18004. Everything version- or level-specific below is a
   copy of the standard's tables for the five smallest symbols at level M. */

/* ------------------------------------------------------------ GF(256)
   Arithmetic for Reed–Solomon, polynomial x^8+x^4+x^3+x^2+1 (0x11d). */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

/** Reed–Solomon parity: `deg` codewords appended to `data`. */
function rsParity(data, deg) {
  /* generator polynomial ∏ (x − α^i), i = 0..deg−1 */
  let gen = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= mul(gen[j], EXP[i]);
      next[j + 1] ^= gen[j];
    }
    gen = next;
  }
  /* long division, remainder is the parity */
  const rem = new Array(deg).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift(); rem.push(0);
    /* gen is lowest-order-first and monic; descending coefficient j+1 of
       the divisor is gen[deg − 1 − j]. */
    if (factor) for (let j = 0; j < deg; j++) rem[j] ^= mul(gen[gen.length - 2 - j], factor);
  }
  return rem;
}

/* --------------------------------------------------- version tables (M)
   [total data codewords, EC codewords per block, number of blocks].
   Blocks within a version are all the same size at these versions. */
const VERSIONS = {
  1: { data: 16, ec: 10, blocks: 1 },
  2: { data: 28, ec: 16, blocks: 1 },
  3: { data: 44, ec: 26, blocks: 1 },
  4: { data: 64, ec: 18, blocks: 2 },
  5: { data: 86, ec: 24, blocks: 2 },
};
/* Centres of alignment patterns (besides the three finders). */
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };
/* Bits left over after the last full codeword, all zero. */
const REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7 };

/* -------------------------------------------------------- bit plumbing */
function bitstream(bytes, capacityBits) {
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);                       // byte mode
  push(bytes.length, 8);                 // count (8 bits below version 10)
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacityBits - bits.length));   // terminator
  while (bits.length % 8) bits.push(0);
  const PAD = [0xec, 0x11];
  for (let i = 0; bits.length < capacityBits; i++) push(PAD[i % 2], 8);
  return bits;
}

function codewords(bits, v) {
  const { data, ec, blocks } = VERSIONS[v];
  const all = [];
  for (let i = 0; i < data; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    all.push(b);
  }
  const per = data / blocks;
  const dataBlocks = [], ecBlocks = [];
  for (let i = 0; i < blocks; i++) {
    const chunk = all.slice(i * per, (i + 1) * per);
    dataBlocks.push(chunk);
    ecBlocks.push(rsParity(chunk, ec));
  }
  /* interleave: data column-by-column, then EC the same way */
  const out = [];
  for (let i = 0; i < per; i++) for (const b of dataBlocks) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

/* -------------------------------------------------------- the matrix */
const FINDER = [
  [1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1],
];

function functionPatterns(size, v) {
  /* grid[r][c]: 0/1 module; fun[r][c]: true where data may not go */
  const grid = Array.from({ length: size }, () => new Uint8Array(size));
  const fun = Array.from({ length: size }, () => new Uint8Array(size));
  const set = (r, c, val) => { grid[r][c] = val; fun[r][c] = 1; };

  const finderAt = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      set(rr, cc, (r >= 0 && r <= 6 && c >= 0 && c <= 6) ? FINDER[r][c] : 0);
    }
  };
  finderAt(0, 0); finderAt(0, size - 7); finderAt(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {        // timing patterns
    set(6, i, i % 2 === 0 ? 1 : 0);
    set(i, 6, i % 2 === 0 ? 1 : 0);
  }

  const centres = ALIGN[v];
  for (const r of centres) for (const c of centres) {
    /* skip the three that would sit on finders */
    if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      set(r + dr, c + dc, (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) ? 1 : 0);
  }

  set(size - 8, 8, 1);                        // the always-dark module

  /* reserve the two format-info areas so data placement walks around them */
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { fun[8][i] = 1; fun[i][8] = 1; }
    if (i < 8) { fun[8][size - 1 - i] = 1; fun[size - 1 - i][8] = 1; }
  }
  fun[8][8] = 1;
  return { grid, fun };
}

/** The zig-zag walk: 2-module columns right to left, skipping column 6. */
function placeData(grid, fun, bits) {
  const size = grid.length;
  let i = 0, upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (fun[r][c]) continue;
        grid[r][c] = bits[i] ?? 0;
        i++;
      }
    }
    upward = !upward;
  }
}

const maskHit = [
  (r, c) => (r + c) % 2 === 0,
  (r, _) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

/** Format info: EC level M (0b00) + mask, BCH(15,5)-coded, xored, placed. */
function writeFormat(grid, mask) {
  const size = grid.length;
  let f = (0b00 << 3) | mask;                 // M = 00
  let rem = f << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  f = ((f << 10) | rem) ^ 0x5412;
  const bit = i => (f >> i) & 1;

  for (let i = 0; i <= 5; i++) grid[8][i] = bit(14 - i);       // top-left, row 8
  grid[8][7] = bit(8); grid[8][8] = bit(7); grid[7][8] = bit(6);
  for (let i = 0; i <= 5; i++) grid[i][8] = bit(i);            // top-left, col 8

  for (let i = 0; i < 7; i++) grid[size - 1 - i][8] = bit(14 - i);  // bottom-left
  for (let i = 0; i < 8; i++) grid[8][size - 8 + i] = bit(7 - i);   // top-right
}

/** Standard four penalty rules; lower is better. */
function penalty(grid) {
  const size = grid.length;
  let score = 0;
  const runs = line => {
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) { run++; continue; }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
  };
  for (let r = 0; r < size; r++) runs(grid[r]);
  for (let c = 0; c < size; c++) runs(grid.map(row => row[c]));
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = grid[r][c];
    if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
  }
  const FIND = [1,0,1,1,1,0,1,0,0,0,0], REV = [...FIND].reverse();
  const seek = line => {
    for (let i = 0; i + 11 <= line.length; i++) {
      if (FIND.every((v, j) => line[i + j] === v) || REV.every((v, j) => line[i + j] === v)) score += 40;
    }
  };
  for (let r = 0; r < size; r++) seek([...grid[r]]);
  for (let c = 0; c < size; c++) seek(grid.map(row => row[c]));
  let dark = 0;
  for (const row of grid) for (const v of row) dark += v;
  score += 10 * Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5);
  return score;
}

/** text → { size, grid } where grid[r][c] is 1 for a dark module. */
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  let v = 0;
  for (const cand of [1, 2, 3, 4, 5]) {
    if (4 + 8 + bytes.length * 8 <= VERSIONS[cand].data * 8) { v = cand; break; }
  }
  if (!v) throw new Error('demasiado largo para un QR pequeño (' + bytes.length + ' bytes)');
  const size = 17 + 4 * v;

  const { data, ec, blocks } = VERSIONS[v];
  const bits = bitstream(bytes, data * 8);
  const cw = codewords(bits, v);
  const dataBits = [];
  for (const b of cw) for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1);
  for (let i = 0; i < REMAINDER[v]; i++) dataBits.push(0);
  void ec; void blocks;

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const { grid, fun } = functionPatterns(size, v);
    placeData(grid, fun, dataBits);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!fun[r][c] && maskHit[mask](r, c)) grid[r][c] ^= 1;
    }
    writeFormat(grid, mask);
    const p = penalty(grid);
    if (!best || p < best.p) best = { grid, p };
  }
  return { size, grid: best.grid };
}

/** Draw onto a canvas at `scale` px per module with a 4-module quiet zone. */
export function qrToCanvas(canvas, text, { scale = 6, dark = '#2b2118', light = '#fdf6e6' } = {}) {
  const { size, grid } = qrMatrix(text);
  const quiet = 4, px = (size + quiet * 2) * scale;
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = dark;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (grid[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
}
