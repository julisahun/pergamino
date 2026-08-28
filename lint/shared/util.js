/* Small helpers shared by every module. Pure — no DOM, no fetch, no storage. */

/** @type {Record<string, string>} */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export const esc = (/** @type {unknown} */ s) =>
  String(s ?? '').replace(/[&<>"]/g, c => ESCAPES[c] ?? c);

/** Files are named after the character or the monster, not after the id: an id
    is what a merge matches on, a name is what you find in Finder. */
export const slugify = (/** @type {unknown} */ s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-nombre';

export const clamp = (/** @type {number} */ n, /** @type {number} */ lo,
                      /** @type {number} */ hi) => Math.min(hi, Math.max(lo, n));

/** Metres with a Spanish decimal comma; null reads as an em dash. */
export const metres = (/** @type {number|null} */ n) =>
  (n == null ? '—' : String(n).replace('.', ','));

export const matchesFilter = (/** @type {string} */ text, /** @type {string} */ filter) =>
  !filter.trim() || text.toLowerCase().includes(filter.trim().toLowerCase());
