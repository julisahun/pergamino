/**
 * Levelling a character up.
 *
 * One component for both screens — the DM's console and a player's phone —
 * because the thing being edited is the same record and there is no reason for
 * the two to drift. What it produces is a `SheetPatch`: the fields that change
 * and nothing else, which the server merges shallowly.
 *
 * **The numbers are typed, not worked out.** This app does not know that a
 * rogue gets 1d8 at level 2, and the whole design says it should not: the
 * person filling this in knows the rules, and what arrives here is their
 * answer. What the form *does* know is the arithmetic around that answer —
 * what the new maximum does to the current total, what a proficiency does to a
 * skill — so nothing has to be worked out twice.
 *
 * Everything is optional except the level itself. A rogue's level 2 is one
 * number and one trait; a bard's is those plus a slot, two expertises and a
 * spell. Sections that do not apply are not shown.
 */
import { useMemo, useState } from 'react'
import {
  SKILLS,
  skillRow,
  slotsOf,
  slugId,
  summaryOf,
  formatMod,
  type Prof,
  type Sheet,
  type SkillKey,
  type Trait,
} from '../../../shared/character.ts'
import type { SheetPatch } from '../../../shared/protocol.ts'
import { es } from '../strings/es.ts'
import './level-up.css'

/** `—` → competente → experticia → `—`. */
const NEXT: Record<string, Prof | undefined> = {
  none: 'proficient',
  proficient: 'expertise',
  expertise: undefined,
}

interface NewTrait {
  key: number
  name: string
  text: string
}

export function LevelUp({
  sheet,
  currentHp,
  busy,
  error,
  onApply,
  onClose,
}: {
  sheet: Sheet
  /** What the character has on them now, to show what the new maximum does to it. */
  currentHp?: number | null
  busy?: boolean
  error?: string | null
  onApply: (patch: SheetPatch) => void
  onClose: () => void
}) {
  const from = sheet.level ?? 1
  const [level, setLevel] = useState(String(from + 1))
  const [hpMax, setHpMax] = useState(sheet.hpMax === null ? '' : String(sheet.hpMax))
  const [slots, setSlots] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(slotsOf(sheet)).map(([l, n]) => [l, String(n)])),
  )
  const [traits, setTraits] = useState<NewTrait[]>([])
  const [skills, setSkills] = useState(sheet.skills)
  const [openSkills, setOpenSkills] = useState(false)

  const casts = sheet.spellcasting !== null
  // The levels that already have slots, plus the next one up — which is how a
  // caster gains a second-level slot without a nine-row grid to scroll past.
  const slotLevels = useMemo(() => {
    const had = Object.keys(slotsOf(sheet)).map(Number)
    const next = Math.min(9, (had.length ? Math.max(...had) : 0) + 1)
    return [...new Set([...had, next])].sort((a, b) => a - b).map(String)
  }, [sheet])

  const num = (v: string): number | null => {
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  const newLevel = num(level)
  const newHpMax = num(hpMax)
  const gained = newHpMax !== null && sheet.hpMax !== null ? newHpMax - sheet.hpMax : 0
  const hpNow = currentHp ?? null
  const skillsTouched = JSON.stringify(skills) !== JSON.stringify(sheet.skills)
  const named = traits.filter((t) => t.name.trim() !== '')

  const patch = (): SheetPatch => {
    const out: SheetPatch = {}
    if (newLevel !== null && newLevel !== sheet.level) out.level = newLevel
    if (newHpMax !== null && newHpMax !== sheet.hpMax) out.hpMax = newHpMax
    if (casts && sheet.spellcasting) {
      const next: Record<string, number> = {}
      for (const [l, v] of Object.entries(slots)) {
        const n = num(v)
        if (n !== null && n > 0) next[l] = n
      }
      if (JSON.stringify(next) !== JSON.stringify(slotsOf(sheet))) {
        out.spellcasting = { ...sheet.spellcasting, slots: next }
      }
    }
    if (named.length > 0) {
      // A patch replaces a list outright, so the new rows go on the end of the
      // ones already there rather than arriving on their own.
      const taken = new Set(sheet.traits.map((t) => t.id))
      const added: Trait[] = named.map((t) => {
        const id = slugId(t.name, taken)
        taken.add(id)
        return { id, name: t.name.trim(), text: t.text.trim(), source: 'class' }
      })
      out.traits = [...sheet.traits, ...added]
    }
    if (skillsTouched) out.skills = skills
    return out
  }

  const changes = Object.keys(patch()).length
  const preview = { ...sheet, ...patch() }

  return (
    <div className="lvl-backdrop" onClick={onClose}>
      <div className="lvl-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{es.subirDeNivel}</h2>
        <div className="lvl-who">
          {sheet.name}
          {summaryOf(sheet) ? ` · ${summaryOf(sheet)}` : ''}
        </div>

        <div className="lvl-row">
          <label>
            <span>{es.nivel}</span>
            <input
              className="lvl-num"
              inputMode="numeric"
              value={level}
              onChange={(e) => setLevel(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <span className="lvl-was">{es.antes} {from}</span>
        </div>

        <div className="lvl-row">
          <label>
            <span>{es.pgMaximos}</span>
            <input
              className="lvl-num"
              inputMode="numeric"
              value={hpMax}
              onChange={(e) => setHpMax(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <span className="lvl-was">
            {es.antes} {sheet.hpMax ?? '—'}
            {gained > 0 && <b className="lvl-gain"> +{gained}</b>}
          </span>
        </div>
        {gained > 0 && hpNow !== null && (
          // The thing the old re-upload path got wrong, said out loud.
          <p className="lvl-note">
            {es.pgActualesSuben} <b>{hpNow} → {Math.min(hpNow + gained, newHpMax ?? hpNow + gained)}</b>
          </p>
        )}

        {casts && (
          <>
            <div className="lvl-label">{es.espacios}</div>
            <div className="lvl-slots">
              {slotLevels.map((l) => (
                <label key={l}>
                  <span>{l}º</span>
                  <input
                    className="lvl-num small"
                    inputMode="numeric"
                    value={slots[l] ?? ''}
                    placeholder="0"
                    onChange={(e) => setSlots({ ...slots, [l]: e.target.value.replace(/\D/g, '') })}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        <div className="lvl-label">{es.rasgosNuevos}</div>
        {traits.map((t, i) => (
          <div className="lvl-trait" key={t.key}>
            <input
              placeholder={es.nombreDelRasgo}
              value={t.name}
              onChange={(e) =>
                setTraits(traits.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))
              }
            />
            <textarea
              placeholder={es.queHaceElRasgo}
              value={t.text}
              onChange={(e) =>
                setTraits(traits.map((x, j) => (i === j ? { ...x, text: e.target.value } : x)))
              }
            />
            <button
              className="lvl-add"
              title={es.quitar}
              onClick={() => setTraits(traits.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="lvl-add"
          onClick={() => setTraits([...traits, { key: Date.now(), name: '', text: '' }])}
        >
          + {es.anadirRasgo}
        </button>

        <button className="lvl-toggle" onClick={() => setOpenSkills(!openSkills)}>
          {openSkills ? '▾' : '▸'} {es.competencias}
          {skillsTouched && <span className="lvl-gain"> ●</span>}
        </button>
        {openSkills && (
          <div className="lvl-skills">
            {SKILLS.map((s) => {
              const prof = skills[s.key]?.prof
              const row = skillRow(preview, s.key)
              return (
                <button
                  key={s.key}
                  className={`lvl-skill ${prof ?? 'none'}`}
                  title={es.tocaParaCambiar}
                  onClick={() => {
                    const next = NEXT[prof ?? 'none']
                    const entry = { ...skills[s.key], prof: next }
                    if (next === undefined) delete entry.prof
                    const copy: Record<string, unknown> = { ...skills }
                    if (Object.keys(entry).length === 0) delete copy[s.key]
                    else copy[s.key] = entry
                    setSkills(copy as Sheet['skills'])
                  }}
                >
                  <span className="lvl-skill-name">{s.name}</span>
                  <b>{row.mod === null ? '—' : formatMod(row.mod)}</b>
                </button>
              )
            })}
          </div>
        )}

        {error && <p className="lvl-error">{error}</p>}
        <div className="lvl-actions">
          <button onClick={onClose}>{es.cancelar}</button>
          <button
            className="primary"
            disabled={busy || changes === 0 || newLevel === null}
            onClick={() => onApply(patch())}
          >
            {busy ? es.subiendo : `${es.subirA} ${newLevel ?? '—'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** What a `SkillKey` is, kept honest against the table rather than restated. */
export type { SkillKey }
