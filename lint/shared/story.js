/* Historia — the story, not the mechanics: notes as .md files, from the
   campaign's `story/` and from inside the open mesa.

   THIS LAYER ONLY READS. Notes are written in a text editor — Obsidian, or
   whatever the DM already uses — and the 5s poll is what makes that feel live.
   The previous app edited them in place, WYSIWYG, which meant every note it
   touched was re-serialised out of what the renderer understood: hand-wrapped
   lines unwrapped, numbered lists flattened, frontmatter needed defending.
   Reading only, all of that goes away, and the file is simply the truth.

   Links, tags and backlinks are derived from the text on every render, never
   stored. Wikilinks support Obsidian's piped form — `[[target|label]]`
   resolves `target` and shows `label` — because the campaign notes use it. */

import { esc } from './util.js';

/* One regex for every consumer, so a link can never resolve one way in the
   body and another in the backlinks. Group 1 is the target, group 2 the
   optional display label. */
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/** YAML frontmatter, as Obsidian and every other note tool writes it. The app
    reads exactly one field out of it (`mesa:`, in runs.js) and renders none of
    it: a note's body starts after the closing fence. Nothing is stripped from
    the FILE — this app only reads — so what the DM wrote stays written.
    @param {string} content */
export function withoutFrontmatter(content) {
  const m = String(content || '').match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? content.slice(m[0].length) : content;
}

/** `story/<grupo>/nombre.md` groups by the first segment after story/; a bare
    `story/nombre.md` has no group at all, so it reads as "General" rather than
    a group nobody typed. A note inside the open mesa groups under the mesa.
    @param {string} path @param {string} content @param {string} [runPath] */
export function noteFrom(path, content, runPath = '') {
  const name = (path.split('/').pop() || path).replace(/\.md$/i, '');
  return { path, group: groupOf(path, runPath), name, content,
           layer: /** @type {'campaign'|'run'} */ (
             runPath && path.startsWith(runPath + '/') ? 'run' : 'campaign') };
}

/** Derived, not stored: the first heading in the file if the note has one,
    else the filename turned into something worth reading. */
/** @param {{content: string, name: string}} note */
export function noteTitle(note) {
  const h = withoutFrontmatter(note.content).match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  const spaced = note.name.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** One index built per render pass, shared by link resolution and backlinks,
    so a title only ever resolves one way. */
/** @param {any[]} notes */
export function storyIndex(notes) {
  /** @type {Map<string, any>} */
  const byTitle = new Map();
  /** @type {Map<string, any>} */
  const byName = new Map();
  for (const note of notes) {
    byTitle.set(noteTitle(note).toLowerCase(), note);
    byName.set(note.name.toLowerCase(), note);
  }
  return { byTitle, byName };
}

/** A DM writes `[[Título]]` thinking either of a note's heading or its
    filename — try the heading first since that's what's actually on screen. */
/** @param {string} text @param {ReturnType<typeof storyIndex>} index */
export function resolveWikilink(text, index) {
  const key = text.trim().toLowerCase();
  return index.byTitle.get(key) || index.byName.get(key) || null;
}

/** @param {{content: string}} note */
export const noteTags = note => {
  const seen = new Set();
  for (const m of note.content.matchAll(/#([a-z0-9_-]+)/gi)) seen.add(m[1].toLowerCase());
  return [...seen];
};

/** Only resolved targets count as graph edges — an unresolved [[link]] is a
    rendering concern (shown muted), not something backlinks track. */
/** @param {any} note @param {ReturnType<typeof storyIndex>} index */
export function noteLinks(note, index) {
  /** @type {any[]} */
  const out = [];
  for (const m of note.content.matchAll(WIKILINK)) {
    const target = resolveWikilink(m[1], index);
    if (target && target !== note && !out.includes(target)) out.push(target);
  }
  return out;
}

/** @param {any} note @param {ReturnType<typeof storyIndex>} index @param {any[]} notes */
export const backlinksFor = (note, index, notes) =>
  notes.filter(n => n !== note && noteLinks(n, index).includes(note));

/** A notes renderer, not a CommonMark implementation — headings, paragraphs,
    bold/italic and bullet lists are what a session note actually uses.
    Escaped first, so a stray "<" or "&" in a note cannot break what follows;
    heading levels are pushed down two so a note's own headings never outrank
    its card title. */
/** @param {string} md @param {ReturnType<typeof storyIndex>} index */
export function mdToHtml(md, index) {
  /* text reaching inline() is already esc()'d (see the split() below), but
     resolveWikilink() needs the raw title back to match noteTitle()/note.name —
     esc() only ever touches &<>", so undoing it is this small on purpose. */
  const unesc = (/** @type {string} */ s) => s.replace(/&amp;|&lt;|&gt;|&quot;/g, (/** @type {string} */ m) => /** @type {Record<string, string>} */ ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' })[m]);
  const lines = esc(String(md || '')).split(/\r?\n/);
  /* A wikilink and a tag are each one clickable atom: the link navigates, the
     tag searches. Nothing here is editable, so nothing has to survive being
     written back. */
  const inline = (/** @type {string} */ s) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(WIKILINK, (src, target, label) => {
      const shown = label && label.trim() ? label : target;
      const resolved = resolveWikilink(unesc(target), index);
      return resolved
        ? `<span class="wikilink" data-opennote="${esc(resolved.path)}">${shown}</span>`
        : `<span class="wikilink unresolved">${shown}</span>`;
    })
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/#([a-z0-9_-]+)/gi, (src, tag) =>
      `<span class="tag" data-tag="${tag.toLowerCase()}">#${tag}</span>`);
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  let para = [];
  /** @type {string[]} */
  let list = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); list = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushPara(); flushList();
      const level = heading[1].length + 2;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) { flushPara(); list.push(bullet[1]); continue; }
    if (!line) { flushPara(); flushList(); continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}

/** Which layer a note came from, and the group it shows under. A mesa's own
    notes — `estado.md`, `bitacora/*.md`, `<mesa>.md`, `players/*.md` — group
    under the mesa itself, so the DM reads tonight's state beside the campaign's
    lore rather than in another window.
    @param {string} path @param {string} runPath */
export function groupOf(path, runPath) {
  if (runPath && (path === runPath || path.startsWith(runPath + '/'))) {
    const rel = path.slice(runPath.length + 1);
    const parts = rel.split('/');
    return parts.length > 1 ? `Mesa · ${parts[0]}` : 'Mesa';
  }
  const parts = path.replace(/^story\//i, '').split('/');
  return parts.length > 1 ? parts[0] : 'General';
}
