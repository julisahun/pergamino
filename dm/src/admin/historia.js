/* Historia — notes, one .md file each under story/. Editable since the
   rework: the split editor autosaves the raw markdown through saveRaw, a
   new note is born from the index, and deletes go to trash/ like every
   other entity. A note edited on disk still reappears on the watcher tick —
   the file is the truth either way, last writer wins. Two views: the
   grouped index, or one note (read or edit) with the index beside it. */

import { html } from './html.js';
import { state, update, flash, saveRaw } from './store.js';
import { screens } from './app.js';
import { noteFrom, noteTitle, noteTags, storyIndex, backlinksFor, mdToHtml, domToMd } from '../shared/story.js';
import { matchesFilter, slugify } from '../shared/util.js';

const openNote = path => update(s => {
  s.ui.storyOpen = path || null;
  s.ui.storyEditing = false;
  s.ui.storyDraft = null;
});

/** mdToHtml emits data-opennote spans and data-tag pills as raw HTML, so the
    rendered body needs one delegated click instead of per-node handlers. */
function bodyClick(e) {
  const link = e.target.closest('[data-opennote]');
  if (link) { openNote(link.getAttribute('data-opennote')); return; }
  const tag = e.target.closest('[data-tag]');
  if (tag) {
    /* A tag is a shortcut into search, not a filter of its own. */
    update(s => { s.ui.filters.story = '#' + tag.getAttribute('data-tag'); s.ui.storyOpen = null; });
  }
}

/* -------------------------------------------------------------- new note */

function createNote(title, group) {
  const t = title.trim();
  if (!t) return;
  const g = group.trim();
  const dir = !g || g.toLowerCase() === 'general' ? '' : g + '/';
  const base = slugify(t) || 'nota';
  let rel = `story/${dir}${base}.md`;
  for (let n = 2; state.story.notes.some(x => x.path === rel); n++) {
    rel = `story/${dir}${base}-${n}.md`;
  }
  const content = `# ${t}\n\n`;
  saveRaw(rel, content);
  /* Optimistic: the watcher's re-read will confirm the same note. The seed
     freezes before the render so the caret drops straight into the body. */
  update(s => { s.story.notes.push(noteFrom(rel, content)); });
  editingSeed = mdToHtml(content, storyIndex(state.story.notes));
  focusOnMount = true;
  update(s => {
    s.ui.storyOpen = rel;
    s.ui.storyEditing = true;
    s.ui.storyDraft = content;
  });
  flash(`${t} creada — se guarda sola en ${rel}.`);
}

function NewNote() {
  const groups = [...new Set(state.story.notes.map(n => n.group))]
    .filter(g => g !== 'General').sort();
  return html`<details class="newnote">
    <summary>+ Nueva nota</summary>
    <form class="quickadd" onSubmit=${e => {
      e.preventDefault();
      const data = new FormData(e.target);
      createNote(String(data.get('title') || ''), String(data.get('group') || ''));
    }}>
      <input name="title" required placeholder="Título" autocomplete="off" />
      <input name="group" list="notegroups" placeholder="Carpeta — vacío es General" autocomplete="off" />
      <datalist id="notegroups">${groups.map(g => html`<option value=${g} key=${g} />`)}</datalist>
      <button class="primary">Crear</button>
    </form>
  </details>`;
}

/* ----------------------------------------------------------------- index */

/** Filter box + grouped titles — the index itself, wherever it sits: alone
    as the whole tab, or as the left pane beside an open note. Groups fold
    shut per window; an active search overrides the folds so a match can
    never hide behind one. */
function IndexBody() {
  const notes = state.story.notes;
  const filter = state.ui.filters.story;
  const searching = !!filter.trim();
  const shown = notes.filter(note => matchesFilter(`${noteTitle(note)} ${note.content}`, filter));
  const groups = [];
  for (const note of shown) {
    let g = groups.find(x => x.name === note.group);
    if (!g) { g = { name: note.group, notes: [] }; groups.push(g); }
    g.notes.push(note);
  }
  const toggle = name => update(s => {
    s.ui.storyCollapsed.has(name) ? s.ui.storyCollapsed.delete(name) : s.ui.storyCollapsed.add(name);
  });
  return html`
    <div class="filterbar"><input type="text" placeholder="Buscar en las notas…"
      value=${filter} onInput=${e => update(s => { s.ui.filters.story = e.target.value; })} /></div>
    ${groups.length
      ? groups.map(g => {
          const shut = !searching && state.ui.storyCollapsed.has(g.name);
          return html`<div key=${g.name}>
            <button class="grouph" aria-expanded=${!shut} onClick=${() => toggle(g.name)}>
              <span class="caret">${shut ? '▸' : '▾'}</span>${g.name}
              <span class="n">${g.notes.length}</span>
            </button>
            ${shut ? null : html`<ul class="storyindex">${g.notes.map(note => {
              const tags = noteTags(note);
              return html`<li key=${note.path} class=${note.path === state.ui.storyOpen ? 'on' : null}>
                <button class="link" onClick=${() => openNote(note.path)}>${noteTitle(note)}</button>
                ${tags.length ? html` <span class="notetags inline" onClick=${bodyClick}>
                  ${tags.map(t => html`<span class="tag" data-tag=${t} key=${t}>#${t}</span>`)}</span>` : null}</li>`;
            })}</ul>`}
          </div>`;
        })
      : html`<p class="muted">Ninguna nota coincide con “${filter}”.</p>`}`;
}

const EmptyStory = () => html`<div class="drop">
  <b>Ninguna nota todavía</b>
  Una nota es un archivo <code>.md</code> bajo <code>story/</code>, agrupado por la
  primera carpeta que le pongas — <code>story/pueblo/*.md</code>,
  <code>story/mazmorra/*.md</code>. Crea la primera aquí arriba, o deja el archivo
  en la carpeta.
  <p class="muted" style="font-size:.85rem;margin:.8rem 0 0">
    Da igual dónde la escribas o la retoques — aparece y se actualiza sola.</p>
</div>`;

/* ------------------------------------------------------------- one note
   The rendered note IS the editor: the body is contentEditable, so the
   caret lands wherever you click and the formatting never leaves — you
   write inside headings, bold and bullets as they look. domToMd() folds
   the DOM back into markdown on every keystroke and it autosaves from
   there; wikilinks and tags are non-editable atoms that navigate on click
   and round-trip verbatim through data-md. While the body has focus its
   seed HTML is frozen, so a re-render (a flash, the watcher, SSE chatter)
   can never rewrite the DOM under the caret. */

let editingSeed = null;    // the frozen innerHTML for the whole focus span
let focusOnMount = false;  // a just-created note wants the caret immediately

function startEditing(note, idx) {
  if (state.ui.storyEditing) return;
  editingSeed = mdToHtml(note.content, idx);
  update(s => { s.ui.storyEditing = true; s.ui.storyDraft = note.content; });
}

const stopEditing = () => {
  editingSeed = null;
  update(s => {
    /* The draft becomes the note right away — the disk catches up on the
       autosave debounce, the watcher confirms after that. */
    const live = s.story.notes.find(n => n.path === s.ui.storyOpen);
    if (live && s.ui.storyDraft != null) live.content = s.ui.storyDraft;
    s.ui.storyEditing = false;
    s.ui.storyDraft = null;
  });
};

function NoteCard({ note }) {
  const idx = storyIndex(state.story.notes);
  const tags = noteTags(note);
  const backlinks = backlinksFor(note, idx, state.story.notes);
  const editing = state.ui.storyEditing;
  const bodyHtml = editing && editingSeed != null ? editingSeed : mdToHtml(note.content, idx);

  return html`<article class=${'notecard' + (editing ? ' editing' : '')}>
    <b>${noteTitle(note)}</b>
    ${tags.length ? html`<div class="notetags" onClick=${bodyClick}>${tags.map(t =>
      html`<span class="tag" data-tag=${t} key=${t}>#${t}</span>`)}</div>` : null}
    <div class="notebody" key=${note.path} contentEditable spellcheck=${false}
      role="textbox" aria-multiline="true" aria-label=${'Texto de ' + noteTitle(note)}
      ref=${el => {
        if (!el || !focusOnMount) return;
        focusOnMount = false;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }}
      onClick=${e => { if (e.target.closest('[data-opennote],[data-tag]')) bodyClick(e); }}
      onFocus=${() => startEditing(note, idx)}
      onInput=${e => {
        const v = domToMd(e.currentTarget);
        saveRaw(note.path, v);
        state.ui.storyDraft = v;   /* no re-render per keystroke — the DOM is the render */
      }}
      onKeyDown=${e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
      onPaste=${e => {
        /* Pasted formatting from elsewhere is nobody's markdown — insert
           the plain text and let the file's own syntax do the styling. */
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onBlur=${stopEditing}
      dangerouslySetInnerHTML=${{ __html: bodyHtml }}></div>
    ${editing ? html`<p class="edithint">✎ editando — se guarda solo · Esc o toca fuera para terminar</p>` : null}
    ${!editing && backlinks.length ? html`<div class="backlinks" onClick=${bodyClick}><b>Mencionada en</b>${' '}
      ${backlinks.map((b, i) => html`<span key=${b.path}>${i ? ', ' : ''}<span class="wikilink"
        data-opennote=${b.path}>${noteTitle(b)}</span></span>`)}</div>` : null}
  </article>`;
}

/* Deleting has no button here on purpose: a note dies by deleting its file
   on disk, never by a tap two centimetres from the text you are editing.
   (There was a Borrar once. It lasted one session.) */

function NoteView({ note }) {
  return html`<main><section class="panel wide storywrap">
    <div class="storysplit">
      <aside class="idx">${IndexBody()}</aside>
      <div class="reader">
        <div class="quickadd">
          <button class="ghost backbtn" onClick=${() => openNote(null)}>← Índice</button>
          <span class="muted" style="font-size:.78rem;align-self:center">
            toca el texto para escribir — se guarda solo en ${note.path}</span>
        </div>
        <${NoteCard} note=${note} />
      </div>
    </div>
  </section></main>`;
}

function Historia() {
  /* A stale path (the note vanished on the last re-read) falls back to the
     index rather than rendering nothing. */
  const note = state.ui.storyOpen ? state.story.notes.find(n => n.path === state.ui.storyOpen) : null;
  if (!note) return html`<main><section class="panel">
    <${NewNote} />
    ${state.story.notes.length ? IndexBody() : EmptyStory()}
  </section></main>`;
  return html`<${NoteView} note=${note} />`;
}

screens.story = Historia;
