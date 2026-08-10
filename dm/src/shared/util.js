/* Small helpers shared by every module. Pure — no DOM, no fetch. */

export const esc = s => String(s ?? '')
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Files are named after the character or monster, not the id — id is what
    a merge matches on, a name is what you find in Finder. */
export const slugify = s => String(s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-nombre';

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Metres with a Spanish decimal comma; null reads as an em-dash. */
export const metres = n => n == null ? '—' : String(n).replace('.', ',');

export const matchesFilter = (text, filter) =>
  !filter.trim() || text.toLowerCase().includes(filter.trim().toLowerCase());

/** A campaign-relative path ("assets/taberna del puerto.jpg") as a URL the
    server can actually serve — each segment percent-encoded, so spaces and
    accents in filenames survive the trip. */
export const encodePath = p => String(p).split('/').map(encodeURIComponent).join('/');
