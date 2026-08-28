/**
 * Closing a session: the bitácora note and the run's estado.md.
 *
 * Both are *append-only* from the app's point of view. `estado.md` keeps its
 * own headings and prose; we only add bullets under the sections it already
 * has, and every write is shown to the DM before it happens.
 */
import type { GameObject, LogEntry, Monster, Scene, SessionState } from '../types.ts'
import { readText, type VaultDir, type WritableVaultDir } from './source.ts'

export const BITACORA_DIR = 'bitacora'
export const ESTADO_FILE = 'estado.md'
export const TEMPLATE = '00-plantilla.md'

/** The next unused `NN-` prefix in the run's bitácora. */
export async function nextSessionNumber(runDir: VaultDir): Promise<number> {
  const dir = await runDir.dir(BITACORA_DIR)
  if (!dir) return 1
  let max = 0
  for (const name of (await dir.list()).files) {
    if (name === TEMPLATE || !name.endsWith('.md')) continue
    const n = Number.parseInt(name.slice(0, 2), 10)
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return max + 1
}

/** The run's own bitácora template, or '' when it has none. */
export async function readTemplate(runDir: VaultDir): Promise<string> {
  const dir = await runDir.dir(BITACORA_DIR)
  return (dir && (await readText(dir, TEMPLATE))) ?? ''
}

/** `2026-08-27` → `01-2026-08-27.md`, the naming the template asks for. */
export const bitacoraFilename = (n: number, date: string): string =>
  `${String(n).padStart(2, '0')}-${date}.md`

export interface Draft {
  sessionNumber: number
  filename: string
  content: string
}

const bullet = (text: string) => `- ${text}`

/**
 * Fill the run's own template with what the log recorded. Prose stays the DM's
 * job — this supplies the facts so nothing is forgotten.
 */
export function draftBitacora(
  state: SessionState,
  ctx: {
    date: string
    scenes: Map<string, Scene>
    players: string[]
    /** From `nextSessionNumber`. */
    sessionNumber: number
    /** From `readTemplate`. */
    template: string
  },
): Draft {
  const n = ctx.sessionNumber
  const template = ctx.template

  const byKind = (...kinds: LogEntry['kind'][]) =>
    state.log.filter((e) => kinds.includes(e.kind))

  const scenes = byKind('scene').map((e) => ctx.scenes.get(e.text)?.name ?? e.text)
  const happened = [
    ...(scenes.length ? [bullet(`Escenas: ${[...new Set(scenes)].join(' → ')}`)] : []),
    ...byKind('note', 'encounter', 'rest').map((e) => bullet(e.text)),
  ]
  const world = byKind('death', 'loot').map((e) => bullet(e.text))

  const frontmatter = [
    '---',
    `sesion: ${n}`,
    `fecha: ${ctx.date}`,
    `jugadores: [${ctx.players.map((p) => `"${p}"`).join(', ')}]`,
    'acto:',
    '---',
    '',
  ].join('\n')

  // Keep the template's own section headings and hints; drop its front matter
  // and the "this is a template" note.
  const bodyFromTemplate = template
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/^#\s+.*$/m, `# Sesión ${n} — título`)
    .replace(/^>\s+Plantilla\.[\s\S]*?\n\n/m, '')

  const withFacts = appendToSection(
    appendToSection(bodyFromTemplate, 'Qué pasó', happened),
    'Cambios de mundo',
    world,
  )

  return {
    sessionNumber: n,
    filename: bitacoraFilename(n, ctx.date),
    content: `${frontmatter}\n${withFacts.trimStart()}`,
  }
}

/** Put `lines` at the end of the named `## ` section, after its own guidance. */
function appendToSection(markdown: string, heading: string, lines: string[]): string {
  if (lines.length === 0) return markdown
  const rows = markdown.split('\n')
  const start = rows.findIndex((r) => r.trim() === `## ${heading}`)
  if (start === -1) return markdown
  let end = rows.findIndex((r, i) => i > start && /^##\s/.test(r))
  if (end === -1) end = rows.length
  while (end > start + 1 && rows[end - 1]!.trim() === '') end--
  rows.splice(end, 0, '', ...lines)
  return rows.join('\n')
}

/**
 * Write the note into `runs/<mesa>/bitacora/`. The caller can only get here
 * with a handle on the run, so the guard left to enforce is the file name and
 * the refusal to overwrite anything already there.
 */
export async function writeBitacora(
  runDir: WritableVaultDir,
  filename: string,
  content: string,
): Promise<string> {
  if (!/^\d{2}-[\w-]+\.md$/.test(filename)) {
    throw new Error(`Unexpected bitácora file name: ${filename}`)
  }
  if (filename === TEMPLATE) throw new Error('Refusing to overwrite the template')
  const dir = await runDir.createDir(BITACORA_DIR)
  if ((await dir.list()).files.includes(filename)) {
    throw new Error(`Already exists: ${filename}`)
  }
  await dir.write(filename, content)
  return `${BITACORA_DIR}/${filename}`
}

// --- estado.md -------------------------------------------------------------

export type EstadoSection = 'Gente' | 'Lugares' | 'Objetos' | 'Decisiones'

export interface Deviation {
  section: EstadoSection
  text: string
}

/**
 * What the session state suggests has changed in the world. The DM edits or
 * discards these before anything is written.
 */
export function proposeDeviations(
  state: SessionState,
  ctx: {
    sessionNumber: number
    scenes: Map<string, Scene>
    objects: GameObject[]
    monsters: Monster[]
    pcNames: Map<string, string>
  },
): Deviation[] {
  const out: Deviation[] = []
  const tag = `sesión ${ctx.sessionNumber}`

  // Named NPCs that died. Rank-and-file copies are not worth a line.
  const named = new Set(ctx.monsters.map((m) => m.name))
  for (const npc of state.npcs) {
    if (npc.hp === null || npc.hp > 0) continue
    if (!named.has(npc.name)) continue
    out.push({ section: 'Gente', text: `[[${npc.name}]] — **muerto**, ${tag}.` })
  }

  // Scenes that went on screen.
  const visited = [...new Set(state.log.filter((e) => e.kind === 'scene').map((e) => e.text))]
  for (const id of visited) {
    const scene = ctx.scenes.get(id)
    if (scene) out.push({ section: 'Lugares', text: `[[${scene.id}]] — visitado, ${tag}.` })
  }

  // Where the campaign's objects ended up.
  for (const object of ctx.objects) {
    const holderPc = Object.entries(state.play).find(([, live]) => live.objects.includes(object.id))
    if (holderPc) {
      out.push({
        section: 'Objetos',
        text: `[[${object.id.replace(/^obj-/, '')}]] — lo lleva ${
          ctx.pcNames.get(holderPc[0]) ?? holderPc[0]
        }, ${tag}.`,
      })
      continue
    }
    if (state.objects[object.id]?.spent) {
      out.push({
        section: 'Objetos',
        text: `[[${object.id.replace(/^obj-/, '')}]] — gastado y destruido, ${tag}.`,
      })
    }
  }

  return out
}

/**
 * Insert bullets at the end of each named section, leaving the rest of the file
 * byte-for-byte alone. Returns the whole new document for the DM to review.
 */
export function applyDeviations(current: string, deviations: Deviation[]): string {
  if (deviations.length === 0) return current
  const lines = current.split('\n')

  const bySection = new Map<string, string[]>()
  for (const d of deviations) {
    bySection.set(d.section, [...(bySection.get(d.section) ?? []), `- ${d.text}`])
  }

  // Walk the headings so each block lands at the end of its own section.
  const headings: { index: number; name: string }[] = []
  lines.forEach((line, i) => {
    const m = /^##\s+(.+?)\s*$/.exec(line)
    if (m) headings.push({ index: i, name: m[1]! })
  })

  const insertions: { at: number; lines: string[] }[] = []
  for (const [section, bullets] of bySection) {
    const at = headings.findIndex((h) => h.name === section)
    if (at === -1) continue
    const start = headings[at]!.index
    const end = headings[at + 1]?.index ?? lines.length
    // Step back over trailing blank lines so the bullets sit with the section.
    let insertAt = end
    while (insertAt > start + 1 && lines[insertAt - 1]!.trim() === '') insertAt--
    insertions.push({ at: insertAt, lines: bullets })
  }

  // Apply from the bottom so earlier indices stay valid.
  insertions.sort((a, b) => b.at - a.at)
  const out = [...lines]
  for (const ins of insertions) out.splice(ins.at, 0, ...ins.lines)
  return out.join('\n')
}

export async function readEstado(runDir: VaultDir): Promise<string> {
  return (await readText(runDir, ESTADO_FILE)) ?? ''
}

export async function writeEstado(
  runDir: WritableVaultDir,
  content: string,
): Promise<string> {
  await runDir.write(ESTADO_FILE, content)
  return ESTADO_FILE
}
