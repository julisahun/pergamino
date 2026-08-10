/* Historia — the story, not the mechanics: notes as .md files under
   story/<grupo>/*.md. This layer only *reads* them — the admin's editor
   writes the raw markdown back through the API, and a note edited in a
   text editor reappears on the next watcher tick; either way the file is
   the truth. Links, tags and backlinks are all derived from the note text
   fresh on every render, never stored.

   Wikilinks support Obsidian's piped form too — `[[target|label]]` resolves
   `target` and displays `label` — because the campaign notes actually use
   it (the old app resolved the whole `target|label` string and missed). */

import { esc } from './util.js';

/* One regex for every consumer, so a link can never resolve one way in the
   body and another in the backlinks. Group 1 is the target, group 2 the
   optional display label. */
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/** `story/<grupo>/nombre.md` groups by the first segment after story/; a bare
    `story/nombre.md` has no group at all, so it reads as "General" rather
    than a group nobody typed. */
export function noteFrom(path, content) {
  const parts = path.replace(/^story\//i, '').split('/');
  const group = parts.length > 1 ? parts[0] : 'General';
  const name = parts[parts.length - 1].replace(/\.md$/i, '');
  return { path, group, name, content };
}

/** Derived, not stored: the first heading in the file if the note has one,
    else the filename turned into something worth reading. */
export function noteTitle(note) {
  const h = note.content.match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  const spaced = note.name.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** One index built per render pass, shared by link resolution and backlinks,
    so a title only ever resolves one way. */
export function storyIndex(notes) {
  const byTitle = new Map(), byName = new Map();
  for (const note of notes) {
    byTitle.set(noteTitle(note).toLowerCase(), note);
    byName.set(note.name.toLowerCase(), note);
  }
  return { byTitle, byName };
}

/** A DM writes `[[Título]]` thinking either of a note's heading or its
    filename — try the heading first since that's what's actually on screen. */
export function resolveWikilink(text, index) {
  const key = text.trim().toLowerCase();
  return index.byTitle.get(key) || index.byName.get(key) || null;
}

export const noteTags = note => {
  const seen = new Set();
  for (const m of note.content.matchAll(/#([a-z0-9_-]+)/gi)) seen.add(m[1].toLowerCase());
  return [...seen];
};

/** Only resolved targets count as graph edges — an unresolved [[link]] is a
    rendering concern (shown muted), not something backlinks track. */
export function noteLinks(note, index) {
  const out = [];
  for (const m of note.content.matchAll(WIKILINK)) {
    const target = resolveWikilink(m[1], index);
    if (target && target !== note && !out.includes(target)) out.push(target);
  }
  return out;
}

export const backlinksFor = (note, index, notes) =>
  notes.filter(n => n !== note && noteLinks(n, index).includes(note));

/** A notes renderer, not a CommonMark implementation — headings, paragraphs,
    bold/italic and bullet lists are what a session note actually uses.
    Escaped first, so a stray "<" or "&" in a note cannot break what follows;
    heading levels are pushed down two so a note's own headings never outrank
    its card title. */
export function mdToHtml(md, index) {
  /* text reaching inline() is already esc()'d (see the split() below), but
     resolveWikilink() needs the raw title back to match noteTitle()/note.name —
     esc() only ever touches &<>", so undoing it is this small on purpose. */
  const unesc = s => s.replace(/&amp;|&lt;|&gt;|&quot;/g, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' }[m]));
  const lines = esc(String(md || '')).split(/\r?\n/);
  /* Wikilinks and tags carry their own raw source in data-md and are marked
     non-editable: the admin's WYSIWYG editor treats them as atoms — typed
     text can never leak into one — and domToMd() writes them back verbatim,
     so the piped [[target|label]] form survives a round trip untouched. */
  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(WIKILINK, (src, target, label) => {
      const shown = label && label.trim() ? label : target;
      const resolved = resolveWikilink(unesc(target), index);
      return resolved
        ? `<span class="wikilink" contenteditable="false" data-md="${src}" data-opennote="${esc(resolved.path)}">${shown}</span>`
        : `<span class="wikilink unresolved" contenteditable="false" data-md="${src}">${shown}</span>`;
    })
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/#([a-z0-9_-]+)/gi, (src, tag) =>
      `<span class="tag" contenteditable="false" data-md="${src}" data-tag="${tag.toLowerCase()}">#${tag}</span>`);
  const out = [];
  let para = [], list = [];
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

/* ------------------------------------------------------- the way back
   The admin edits the rendered note in place (contentEditable), so what
   comes back is DOM: mdToHtml's own output plus whatever the browser adds
   while typing — div/b/i, <br>, stray root text, &nbsp;. domToMd() folds
   that into markdown again. Wikilinks and tags return verbatim through
   data-md; unknown elements contribute their text and nothing else, so a
   pasted mess degrades to prose instead of breaking the file.

   It only sees node shape (nodeType, tagName, childNodes, getAttribute,
   textContent), so tests can feed it plain objects. */

const NBSP = /\u00a0/g;

function inlineMd(node) {
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { out += String(c.textContent).replace(NBSP, ' '); continue; }
    if (c.nodeType !== 1) continue;
    const tag = String(c.tagName).toUpperCase();
    const md = c.getAttribute ? c.getAttribute('data-md') : null;
    if (md != null) { out += md; continue; }
    if (tag === 'BR') { out += '\n'; continue; }
    if (tag === 'STRONG' || tag === 'B' || tag === 'EM' || tag === 'I') {
      /* Edge whitespace moves outside the marks — "** b**" renders as
         literal asterisks, which is exactly the bug this dodges. */
      const [, lead, body, tail] = inlineMd(c).match(/^(\s*)([\s\S]*?)(\s*)$/);
      const mark = tag === 'STRONG' || tag === 'B' ? '**' : '*';
      out += body ? lead + mark + body + mark + tail : lead + tail;
      continue;
    }
    out += inlineMd(c);
  }
  return out;
}

export function domToMd(root) {
  const blocks = [];
  let para = [];
  /* Space runs collapse — HTML rendered them as one, markdown will too, so
     writing both (one from the text, one hugging a **mark**) is noise. */
  const tidy = text => text.replace(/ {2,}/g, ' ').trim();
  const flushPara = () => {
    if (!para.length) return;
    const text = tidy(para.join(''));
    if (text) blocks.push(text);
    para = [];
  };
  const HEADING = { H3: '#', H4: '##', H5: '###' };
  for (const node of root.childNodes) {
    if (node.nodeType === 3) { para.push(String(node.textContent).replace(NBSP, ' ')); continue; }
    if (node.nodeType !== 1) continue;
    const tag = String(node.tagName).toUpperCase();
    if (HEADING[tag]) {
      flushPara();
      const text = tidy(inlineMd(node));
      if (text) blocks.push(`${HEADING[tag]} ${text}`);
      continue;
    }
    if (tag === 'UL' || tag === 'OL') {
      flushPara();
      const items = [...node.childNodes]
        .filter(c => c.nodeType === 1 && String(c.tagName).toUpperCase() === 'LI')
        .map(li => tidy(inlineMd(li))).filter(Boolean)
        .map(text => `- ${text}`);
      if (items.length) blocks.push(items.join('\n'));
      continue;
    }
    if (tag === 'BR') { flushPara(); continue; }
    if (tag === 'P' || tag === 'DIV') {
      flushPara();
      const text = tidy(inlineMd(node));
      if (text) blocks.push(text);
      continue;
    }
    para.push(inlineMd(node));   // a stray inline element at the root
  }
  flushPara();
  return blocks.length ? blocks.join('\n\n') + '\n' : '';
}
