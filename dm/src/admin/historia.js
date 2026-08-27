/* Historia — the campaign's notes, and this mesa's own, read at the table.

   READ-ONLY, on purpose. Notes are written in a text editor — the DM already
   has one, it already has search and folding and version history — and the 5s
   poll is what makes what you type there appear here. The previous app edited
   them in place and re-serialised every note it touched out of what the
   renderer understood, which quietly flattened numbered lists, unwrapped hand
   wrapped lines and made frontmatter something to defend.

   What this window adds is what a text editor cannot: the notes grouped, the
   wikilinks clickable, the tags searchable, and a «Mencionada en» footer that
   turns a folder of files into something you can follow at speed. */

import { html } from '../html.js';
import { state, update } from './store.js';
import { storyIndex, noteTitle, mdToHtml, backlinksFor, noteTags,
         withoutFrontmatter } from '../shared/story.js';
import { matchesFilter } from '../shared/util.js';

export function Historia() {
  const notes = state.story;
  const index = storyIndex(notes);
  const filter = state.ui.filters.story;
  const open = notes.find(n => n.path === state.ui.openNote) || null;

  const shown = notes.filter(n =>
    matchesFilter(`${noteTitle(n)} ${n.content}`, filter));
  /** @type {Map<string, typeof notes>} */
  const groups = new Map();
  for (const n of shown) {
    if (!groups.has(n.group)) groups.set(n.group, []);
    groups.get(n.group)?.push(n);
  }
  /* An order somebody chose, rather than whatever order the disk answered in:
     loose notes first, then the campaign's folders alphabetically, then this
     mesa's own — tonight's state reads last because it is the part you already
     know. Inside a group, by title. */
  const rank = (/** @type {string} */ g) =>
    (g === 'General' ? 0 : g.startsWith('Mesa') ? 2 : 1);
  const ordered = [...groups].sort(([a], [b]) =>
    rank(a) - rank(b) || a.localeCompare(b, 'es'));
  for (const [, list] of ordered) {
    list.sort((x, y) => noteTitle(x).localeCompare(noteTitle(y), 'es'));
  }

  return html`<section class="tab historia">
    <div class="bar">
      <h2 class="dsp">Historia <small>${notes.length}</small></h2>
      <input class="filter" type="search" placeholder="Buscar en todo…"
        value=${filter}
        onInput=${(/** @type {Event} */ e) => update(s => {
          s.ui.filters.story = /** @type {HTMLInputElement} */ (e.currentTarget).value;
        })} />
    </div>

    ${!notes.length && html`<p class="empty">
      Sin notas. Son archivos <code>.md</code> en <code>story/</code>, y se
      escriben en tu editor de siempre: esta ventana los lee cada 5 segundos.
    </p>`}

    <div class="story-cols">
      <nav class="index">
        ${ordered.map(([group, list]) => html`<div class="group" key=${group}>
          <h3 class="dsp">${group}</h3>
          ${list.map(n => html`<button
            key=${n.path}
            class=${'note-link' + (open?.path === n.path ? ' on' : '')}
            onClick=${() => update(s => { s.ui.openNote = n.path; })}>
            ${noteTitle(n)}
          </button>`)}
        </div>`)}
      </nav>

      <article class="note-body" onClick=${onBodyClick}>
        ${open ? html`
          <h3 class="dsp">${noteTitle(open)}</h3>
          <p class="fine">${open.path}</p>
          <div dangerouslySetInnerHTML=${{ __html: mdToHtml(withoutFrontmatter(open.content), index) }}></div>
          ${(() => {
            const back = backlinksFor(open, index, notes);
            const tags = noteTags(open);
            return html`
              ${tags.length > 0 && html`<p class="tags">
                ${tags.map(t => html`<button class="tag" key=${t}
                  onClick=${() => update(s => { s.ui.filters.story = '#' + t; })}>#${t}</button>`)}
              </p>`}
              ${back.length > 0 && html`<footer class="backlinks">
                <b>Mencionada en</b>
                ${back.map(n => html`<button class="link" key=${n.path}
                  onClick=${() => update(s => { s.ui.openNote = n.path; })}>${noteTitle(n)}</button>`)}
              </footer>`}`;
          })()}`
          : html`<p class="fine">Elige una nota.</p>`}
      </article>
    </div>
  </section>`;
}

/** Wikilinks and tags are rendered as plain spans carrying what they point at,
    so one listener on the body handles every one of them — rather than the
    renderer having to build components it cannot, being a string.
    @param {Event} e */
function onBodyClick(e) {
  const el = /** @type {HTMLElement} */ (e.target);
  const note = el.dataset?.opennote;
  if (note) { update(s => { s.ui.openNote = note; }); return; }
  const tag = el.dataset?.tag;
  if (tag) update(s => { s.ui.filters.story = '#' + tag; });
}
