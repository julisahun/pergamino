/**
 * One-shot migration: json prep + parallel story notes → one note per thing.
 *
 *   node scripts/migrate-pnj.mjs <campaign-folder> [--dry-run]
 *
 * `monsters/*.json` and `story/gente/*.md` were two halves of the same PNJ,
 * and `objects/*.json` and `story/objetos/*.md` two halves of the same item —
 * kept in sync by hand, with the console stitching them back together by slug.
 * This writes the merged files, moves inline base64 portraits out to
 * `assets/pnj/`, repoints every reference, and removes what it replaced.
 *
 * It prints what it could not merge cleanly rather than guessing. Run it on a
 * folder under version control and read the report before committing.
 */
import fs from 'node:fs'
import path from 'node:path'
import { dump, load } from 'js-yaml'

const [, , target, ...flags] = process.argv
const DRY = flags.includes('--dry-run')
if (!target) {
  console.error('usage: node scripts/migrate-pnj.mjs <campaign-folder> [--dry-run]')
  process.exit(2)
}
const ROOT = path.resolve(target)

const report = { wrote: [], removed: [], portraits: [], rewrote: [], carried: [], dropped: [], warn: [] }

const read = (p) => fs.readFileSync(p, 'utf8')
const readJson = (p) => JSON.parse(read(p))
const exists = (p) => fs.existsSync(p)
const rel = (p) => path.relative(ROOT, p)

function write(p, content) {
  report.wrote.push(rel(p))
  if (DRY) return
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function writeBytes(p, bytes) {
  if (DRY) return
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, bytes)
}

function remove(p) {
  report.removed.push(rel(p))
  if (!DRY) fs.rmSync(p, { recursive: true, force: true })
}

const listFiles = (dir, ext) =>
  exists(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(ext)).sort() : []

// --- note text -------------------------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function splitNote(raw) {
  const m = FRONTMATTER.exec(raw)
  return m ? { fmBlock: m[1], body: raw.slice(m[0].length) } : { fmBlock: '', body: raw }
}

/** Front matter keys the note already had, minus the ones we now own. */
function keptFrontmatter(block, owned, where = '') {
  if (!block.trim()) return {}
  let parsed
  try {
    parsed = load(block)
  } catch (err) {
    report.warn.push(`${where}: unparseable front matter, dropped — ${err.message}`)
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out = {}
  for (const [k, v] of Object.entries(parsed)) if (!owned.has(k)) out[k] = v
  return out
}

function frontmatterBlock(fields) {
  const clean = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    clean[k] = v
  }
  // An empty `jugador:` is a placeholder the DM fills in at the table; YAML
  // dumps it as the word `null`, which Obsidian then shows as text.
  const yaml = dump(clean, { lineWidth: 100, quotingType: '"' }).replace(/^(\S+): null$/gm, '$1:')
  return `---\n${yaml}---\n\n`
}

const words = (s) =>
  new Set(
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  )

/** Is `note` already said by `body`? Four fifths of its own words is enough. */
function alreadyCovered(note, body) {
  const from = words(note)
  if (from.size === 0) return true
  const into = words(body)
  let hit = 0
  for (const w of from) if (into.has(w)) hit++
  return hit / from.size >= 0.8
}

// --- portraits -------------------------------------------------------------

const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

/**
 * A ~70 KB base64 JPEG per PNJ is exactly what a note cannot hold. Write it
 * out and point at it, which is what every other picture in the vault does.
 */
function portraitField(slug, portrait) {
  if (!portrait) return undefined
  if (typeof portrait === 'string') return portrait
  if (portrait.src) return portrait.src
  const stamp = portrait.stamp
  if (typeof stamp !== 'string') return undefined
  const m = /^data:([^;]+);base64,(.*)$/s.exec(stamp)
  if (!m) {
    report.warn.push(`${slug}: portrait stamp is not a data: URI — dropped`)
    return undefined
  }
  const ext = EXT_BY_MIME[m[1]] ?? '.jpg'
  const out = `assets/pnj/${slug}${ext}`
  const bytes = Buffer.from(m[2], 'base64')
  writeBytes(path.join(ROOT, out), bytes)
  report.portraits.push(`${out} (${Math.round(bytes.length / 1024)} KB)`)
  return out
}

// --- PNJ -------------------------------------------------------------------


/**
 * The campaign, and every run that keeps its own copies. A run's folders
 * shadow the campaign's by id, so they need the same treatment.
 */
function layers() {
  const out = [ROOT]
  const runs = path.join(ROOT, 'runs')
  if (exists(runs)) {
    for (const mesa of fs.readdirSync(runs).filter((d) => !d.startsWith('.'))) {
      const dir = path.join(runs, mesa)
      if (fs.statSync(dir).isDirectory()) out.push(dir)
    }
  }
  return out
}

function migratePnj(base = ROOT) {
  const monsters = path.join(base, 'monsters')
  const gente = path.join(base, 'story', 'gente')
  const pnjOut = path.join(base, 'pnj')
  const stats = new Map()
  for (const name of listFiles(monsters, '.json')) {
    const j = readJson(path.join(monsters, name))
    stats.set(j.id ?? name.replace(/\.json$/, ''), j)
  }
  const notes = new Map()
  for (const name of listFiles(gente, '.md')) {
    notes.set(name.replace(/\.md$/, ''), read(path.join(gente, name)))
  }

  for (const slug of [...new Set([...stats.keys(), ...notes.keys()])].sort()) {
    const j = stats.get(slug)
    const raw = notes.get(slug)
    const { fmBlock, body } = raw ? splitNote(raw) : { fmBlock: '', body: '' }
    const owned = new Set(['id', 'tag', 'ac', 'hpMax', 'initMod', 'speed', 'portrait', 'abilities'])

    const fields = { id: slug, ...keptFrontmatter(fmBlock, owned, `pnj/${slug}.md`) }
    if (j) {
      if (j.tag) fields.tag = j.tag
      if (typeof j.ac === 'number') fields.ac = j.ac
      if (typeof j.hpMax === 'number') fields.hpMax = j.hpMax
      if (typeof j.initMod === 'number' && j.initMod !== 0) fields.initMod = j.initMod
      if (typeof j.speed === 'number') fields.speed = j.speed
      const portrait = portraitField(slug, j.portrait)
      if (portrait) fields.portrait = portrait
      const abilities = (j.abilities ?? [])
        .filter((a) => a && (a.name || a.desc))
        .map((a) => ({ name: a.name ?? '', desc: a.desc ?? '' }))
      if (abilities.length) fields.abilities = abilities
    }

    let text = body.trim()
    const name = j?.name ?? slug
    if (!text) text = `# ${name}\n`
    else if (!/^#\s/m.test(text)) text = `# ${name}\n\n${text}`

    const note = (j?.note ?? '').trim()
    if (note) {
      if (!raw) {
        text = text.replace(/^(#\s.*)$/m, `$1\n\n${note}`)
      } else if (alreadyCovered(note, text)) {
        report.dropped.push(`pnj/${slug}.md — the note already says it:\n      ${note}`)
      } else {
        text = `${text.trimEnd()}\n\n## Ficha\n\n${note}\n`
        report.carried.push(`pnj/${slug}.md — appended under "## Ficha", merge by hand`)
      }
    }
    if (!j) report.warn.push(`${rel(path.join(pnjOut, slug))}.md has no statblock — it cannot be seated`)

    write(path.join(pnjOut, `${slug}.md`), frontmatterBlock(fields) + text.trimEnd() + '\n')
  }
  return new Set([...stats.keys(), ...notes.keys()])
}

// --- objects ---------------------------------------------------------------


function migrateObjects(base = ROOT) {
  const objects = path.join(base, 'objects')
  const objetos = path.join(base, 'story', 'objetos')
  const bySlug = new Map()
  const oldNames = new Map()
  for (const name of listFiles(objects, '.json')) {
    const j = readJson(path.join(objects, name))
    // `estado.md` links these as `[[<id without obj->]]`, so that is the name
    // the merged note has to have for those links to resolve.
    const slug = String(j.id ?? '').replace(/^obj-/, '') || name.replace(/\.json$/, '')
    bySlug.set(slug, j)
    oldNames.set(slug, name.replace(/\.json$/, ''))
  }
  const notes = new Map()
  for (const name of listFiles(objetos, '.md')) {
    notes.set(name.replace(/\.md$/, ''), read(path.join(objetos, name)))
  }

  for (const slug of [...new Set([...bySlug.keys(), ...notes.keys()])].sort()) {
    const j = bySlug.get(slug)
    const raw = notes.get(slug)
    const { fmBlock, body } = raw ? splitNote(raw) : { fmBlock: '', body: '' }
    const owned = new Set(['id', 'mods', 'usos', 'effects'])

    const fields = { id: j?.id ?? `obj-${slug}`, ...keptFrontmatter(fmBlock, owned, `objects/${slug}.md`) }
    if (j) {
      if (j.mods && Object.keys(j.mods).length) fields.mods = j.mods
      if (typeof j.usos === 'number') fields.usos = j.usos
      if (Array.isArray(j.effects) && j.effects.length) fields.effects = j.effects
    }

    let text = body.trim()
    const name = j?.name ?? slug
    if (!text) text = `# ${name}\n`
    else if (!/^#\s/m.test(text)) text = `# ${name}\n\n${text}`

    const desc = (j?.description ?? '').trim()
    if (desc) {
      if (!raw) {
        text = text.replace(/^(#\s.*)$/m, `$1\n\n${desc}`)
      } else if (alreadyCovered(desc, text)) {
        report.dropped.push(`objects/${slug}.md — the note already says it:\n      ${desc}`)
      } else {
        text = `${text.trimEnd()}\n\n## Ficha\n\n${desc}\n`
        report.carried.push(`objects/${slug}.md — appended under "## Ficha", merge by hand`)
      }
    }
    if (!j) report.warn.push(`${rel(path.join(objects, slug))}.md has no statblock — it carries no modifiers`)

    write(path.join(objects, `${slug}.md`), frontmatterBlock(fields) + text.trimEnd() + '\n')
  }
  return oldNames
}

// --- players ---------------------------------------------------------------

function migratePlayers() {
  for (const base of layers()) {
    const dir = path.join(base, 'players')
    if (!exists(dir)) continue
    for (const name of listFiles(dir, '.json')) {
      const slug = name.replace(/\.json$/, '')
      const jsonPath = path.join(dir, name)
      const notePath = path.join(dir, `${slug}.md`)
      const c = readJson(jsonPath).character ?? {}
      if (!exists(notePath)) {
        report.warn.push(`${rel(notePath)} is missing — writing a stub from the json`)
        write(notePath, `---\nid: ${c.id ?? slug}\nficha: ${c.name ?? slug}\n---\n\n# ${c.name ?? slug}\n`)
        remove(jsonPath)
        continue
      }
      const { fmBlock, body } = splitNote(read(notePath))
      const fields = { id: c.id ?? slug, ...keptFrontmatter(fmBlock, new Set(['id', 'portrait']), notePath) }
      const portrait = portraitField(slug, c.portrait)
      if (portrait) fields.portrait = portrait
      write(notePath, frontmatterBlock(fields) + rewritePlayerProse(body.trim(), slug) + '\n')
      remove(jsonPath)
    }
  }
}

/**
 * These six notes all carry the same boilerplate, and every line of it names
 * the json as the character's mechanical half. The xml is that half now.
 */
function rewritePlayerProse(body, slug) {
  return body
    .replace(
      '> El `.json` de al lado es la mitad mecánica de este personaje; esta nota es\n> la otra mitad.',
      '> El `-fc5.xml` de al lado es la mitad mecánica de este personaje; esta\n> nota es la otra mitad.',
    )
    .replace(`**Ficha de partida:** \`${slug}.json\` · \`${slug}-fc5.xml\``, `**Ficha de partida:** \`${slug}-fc5.xml\``)
    .replace(
      'Cada subida se anota aquí **y** se aplica al `.json`; luego se regenera el\n`-fc5.xml` con `pregenerados/fightclub.py`.',
      'Cada subida se anota aquí **y** se regenera el `-fc5.xml` con\n`pregenerados/fightclub.py`, que es de donde la app lee los números.',
    )
}

// --- scene rosters ---------------------------------------------------------

function migrateScenes() {
  const dir = path.join(ROOT, 'scenarios')
  for (const name of listFiles(dir, '.json')) {
    const p = path.join(dir, name)
    const raw = readJson(p)
    const scene = raw.scene ?? raw
    if (!Array.isArray(scene.roster)) continue
    let touched = false
    scene.roster = scene.roster.map((e) => {
      if (typeof e === 'string') return { pnjId: e, count: 1 }
      const id = e.pnjId ?? e.monsterId ?? e.beastId
      if (e.pnjId || id === undefined) return e
      touched = true
      const { monsterId: _m, beastId: _b, ...rest } = e
      return { pnjId: id, ...rest }
    })
    if (touched) write(p, `${JSON.stringify(raw, null, 2)}\n`)
  }
}

// --- references ------------------------------------------------------------

function walkMd(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMd(p, out)
    else if (entry.name.endsWith('.md')) out.push(p)
  }
  return out
}

/**
 * Repoint every reference the move invalidates: the prose paths the DM writes
 * in backticks, and the two directory-qualified wikilinks that name a folder
 * which no longer exists. Bare `[[Cristelle]]` links resolve by basename and
 * are untouched by design.
 */
function rewriteReferences(objectSlugs) {
  for (const p of walkMd(ROOT)) {
    const before = read(p)
    const ownSlug = path.basename(p, '.md')
    let after = before
      .replace(/monsters\/([\w-]+)\.json/g, 'pnj/$1.md')
      .replace(/players\/([\w-]+)\.json/g, 'players/$1.md')
      .replace(/\[\[((?:\.\.\/)*)story\/gente\/([^\]|]+)/g, '[[$1pnj/$2')
      .replace(/\[\[((?:\.\.\/)*)story\/objetos\/([^\]|]+)/g, '[[$1objects/$2')
      .replace(/`monsters\/`/g, '`pnj/`')
      .replace('players/        los PJ de esta mesa (.json + -fc5.xml + .md)',
               'players/        los PJ de esta mesa (.md + -fc5.xml)')
    for (const [slug, old] of objectSlugs) {
      after = after.split(`objects/${old}.json`).join(`objects/${slug}.md`)
    }

    // "Ficha en `pnj/cristelle.md`" inside `pnj/cristelle.md` points at itself,
    // and it is the paragraph the console shows on the card. Cut it, and only
    // re-capitalise the paragraphs the cut actually left mid-sentence.
    const selfRef = new RegExp(`\\s*Ficha en \`(?:pnj|objects)/${ownSlug}\\.md\`(\\s*—)?\\s*`, 'g')
    after = after
      .split(/\n\n/)
      .map((para) => {
        if (!selfRef.test(para)) return para
        selfRef.lastIndex = 0
        const cut = para.replace(selfRef, ' ').replace(/[ \t]{2,}/g, ' ').trim()
        return cut
          .replace(/^([a-záéíóúüñ])/, (c) => c.toUpperCase())
          .replace(/([.!?]\s+)([a-záéíóúüñ])/g, (_m, lead, c) => lead + c.toUpperCase())
      })
      .join('\n\n')

    if (after !== before) {
      report.rewrote.push(rel(p))
      if (!DRY) fs.writeFileSync(p, after)
    }
  }
}

// --- run -------------------------------------------------------------------

const objectSlugs = new Map()
for (const base of layers()) {
  migratePnj(base)
  for (const [slug, old] of migrateObjects(base)) objectSlugs.set(slug, old)
}
migratePlayers()
migrateScenes()

for (const base of layers()) {
  const monsters = path.join(base, 'monsters')
  const objects = path.join(base, 'objects')
  for (const name of listFiles(monsters, '.json')) remove(path.join(monsters, name))
  for (const [, old] of objectSlugs) {
    const p = path.join(objects, `${old}.json`)
    if (exists(p)) remove(p)
  }
  if (exists(monsters) && fs.readdirSync(monsters).length === 0) remove(monsters)
  for (const dead of [path.join(base, 'story', 'gente'), path.join(base, 'story', 'objetos')]) {
    if (exists(dead)) remove(dead)
  }
}

rewriteReferences(objectSlugs)

// Prose about the character creator's own workflow. It describes exporting a
// json this app no longer reads, and how the DM wants to regenerate the sheets
// from now on is their call, not a rewrite this script should guess at.
if (!DRY) {
  for (const p of walkMd(ROOT)) {
    read(p)
      .split('\n')
      .forEach((line, i) => {
        if (!/\.json/.test(line) || /scenarios\/|session\.json/.test(line)) return
        report.warn.push(`${rel(p)}:${i + 1} still describes a json — ${line.trim().slice(0, 80)}`)
      })
  }
}

const section = (title, rows) => {
  if (!rows.length) return
  console.log(`\n${title} (${rows.length})`)
  for (const r of rows) console.log(`  ${r}`)
}
console.log(DRY ? `\nDRY RUN — nothing written. ${ROOT}` : `\nMigrated ${ROOT}`)
section('Wrote', report.wrote)
section('Portraits written out of base64', report.portraits)
section('References repointed', report.rewrote)
section('Removed', report.removed)
section('Carried over — merge by hand', report.carried)
section('Not carried over — the note already said it', report.dropped)
section('Warnings', report.warn)
