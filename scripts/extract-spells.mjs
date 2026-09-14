/**
 * Lifts the spell table out of the creator into `shared/rules/spells.ts`.
 *
 * The creator (`CREATOR=~/Downloads/index.html`) is a **level-1** character
 * builder and says so about itself, so what it holds is cantrips and level-1
 * spells — 93 of them, each already written in the DM's own Spanish. That is
 * exactly what a level-up needs to offer, and re-typing it here would be a
 * second copy to keep in step.
 *
 * One-shot by design: run it again when the creator's table grows.
 *
 *     CREATOR=~/Downloads/index.html node scripts/extract-spells.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import nodePath from 'node:path'

const creator = (process.env.CREATOR ?? '~/Downloads/index.html').replace(/^~/, os.homedir())
if (!fs.existsSync(creator)) {
  console.error(`No encuentro el creador en ${creator} — pásalo con CREATOR=`)
  process.exit(1)
}

const html = fs.readFileSync(creator, 'utf8')
const start = html.indexOf('const SPELLS = Object.freeze([')
if (start < 0) {
  console.error('El creador ya no declara `const SPELLS = Object.freeze([`')
  process.exit(2)
}
// Walk the brackets so the end of the array is found rather than guessed.
const open = html.indexOf('[', start)
let depth = 0
let end = -1
for (let i = open; i < html.length; i++) {
  if (html[i] === '[') depth++
  else if (html[i] === ']') {
    depth--
    if (depth === 0) {
      end = i + 1
      break
    }
  }
}
if (end < 0) {
  console.error('No se cierra el array de conjuros')
  process.exit(2)
}

// The literal is plain data — object literals of strings, numbers and booleans
// — so it evaluates on its own with nothing from the creator's runtime.
const spells = new Function(`return ${html.slice(open, end)}`)()
if (!Array.isArray(spells) || spells.length === 0) {
  console.error('El array salió vacío')
  process.exit(2)
}

const classes = [...new Set(spells.flatMap((s) => s.classes ?? []))].sort()
const byLevel = spells.reduce((acc, s) => ({ ...acc, [s.lvl]: (acc[s.lvl] ?? 0) + 1 }), {})

/*
 * The interface is derived from the data rather than restated here, so a field
 * the creator adds — `rit` was the one that caught this out — arrives typed
 * instead of failing the build.
 */
const TYPE_OF = { string: 'string', number: 'number', boolean: 'boolean' }
const fields = new Map()
for (const spell of spells) {
  for (const [key, value] of Object.entries(spell)) {
    const type = Array.isArray(value) ? 'string[]' : (TYPE_OF[typeof value] ?? 'unknown')
    const seen = fields.get(key)
    fields.set(key, { type: seen && seen.type !== type ? `${seen.type} | ${type}` : type, count: (seen?.count ?? 0) + 1 })
  }
}
const DOC = {
  es: 'The name as the table writes it, which is what goes on screen.',
  en: 'The English name, for looking it up in a book.',
  lvl: '`0` is a cantrip.',
  classes: `Class slugs: ${classes.join(', ')}.`,
  sum: 'The prose shown under the name — the DM\'s own words, not the SRD\'s.',
}
const iface = [...fields]
  .map(([key, { type, count }]) => {
    const doc = DOC[key] ? `  /** ${DOC[key]} */\n` : ''
    return `${doc}  ${key}${count === spells.length ? '' : '?'}: ${type}`
  })
  .join('\n')

const out = `/**
 * Every spell the app can offer, lifted from the creator by
 * \`scripts/extract-spells.mjs\`. Do not edit by hand: edit the creator's own
 * table and run the script again.
 *
 * The creator is a level-1 builder, so this is cantrips and level-1 spells.
 * A level-up that wants to offer something higher will find nothing here and
 * say so, which is the honest answer until the table grows.
 *
 * Rules content paraphrased from the SRD 5.2 (CC-BY-4.0, © Wizards of the
 * Coast), like everything else in this repo that touches the rules.
 */

/** A spell as the picker needs it. Fields follow the creator's own table. */
export interface RuleSpell {
${iface}
}

export const SPELLS: readonly RuleSpell[] = ${JSON.stringify(spells, null, 2)}

/** The spells one class may pick at or below a level. Empty when unknown. */
export const spellsFor = (className: string, maxLevel: number): RuleSpell[] =>
  SPELLS.filter((s) => s.classes.includes(className) && s.lvl <= maxLevel)

/** Which class slugs this table knows anything about. */
export const SPELL_CLASSES: readonly string[] = ${JSON.stringify(classes)}
`

fs.writeFileSync(nodePath.join('shared', 'rules', 'spells.ts'), out)
console.log(`${spells.length} conjuros → shared/rules/spells.ts`)
console.log(`  por nivel: ${Object.entries(byLevel).map(([l, n]) => `nivel ${l}: ${n}`).join(' · ')}`)
console.log(`  clases: ${classes.join(', ')}`)
