/**
 * Levelling a character up.
 *
 * One component for both screens — the DM's console and a player's phone —
 * because the thing being edited is the same record and there is no reason for
 * the two to drift. What it produces is a `SheetPatch`: the fields that change
 * and nothing else, which the server merges shallowly.
 *
 * ## Guided, and never only guided
 *
 * `shared/rules/progression.ts` is asked what this class gains at this level.
 * When it knows, the form **proposes**: the hit die's average is filled in,
 * the features are listed, and each decision becomes a picker. When it does
 * not — a class nobody has written, a level nobody has reached, a homebrew —
 * the same form is still there with the fields empty, and it is typed in by
 * hand exactly as before. Nothing about this component knows which classes
 * exist.
 *
 * Either way the numbers land as a patch a human watched go past, which is how
 * this squares with the repo's rule about not implementing 5e: the table
 * proposes and the person confirms.
 */
import { useMemo, useState } from 'react'
import {
  SKILLS,
  skillRow,
  slotsOf,
  summaryOf,
  formatMod,
  type Prof,
  type Sheet,
} from '../../../shared/character.ts'
import { averageOf, grantFor } from '../../../shared/rules/progression.ts'
import { buildLevelUp, offerableSpells } from '../../../shared/rules/levelup.ts'
import type { SheetPatch } from '../../../shared/protocol.ts'
import { es } from '../strings/es.ts'
import './level-up.css'

/** `—` → competente → experticia → `—`, for the manual skill grid. */
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
  const target = Number.parseInt(level, 10)
  const grant = useMemo(
    () => (Number.isFinite(target) ? grantFor(sheet.className, target) : null),
    [sheet.className, target],
  )

  const suggestedHp =
    grant?.hitDie && sheet.hpMax !== null ? sheet.hpMax + averageOf(grant.hitDie) : sheet.hpMax
  const [hpMax, setHpMax] = useState(suggestedHp === null ? '' : String(suggestedHp))
  const [hpTouched, setHpTouched] = useState(false)
  const [slots, setSlots] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(slotsOf(sheet)).map(([l, n]) => [l, String(n)])),
  )
  const [slotsTouched, setSlotsTouched] = useState(false)
  const [traits, setTraits] = useState<NewTrait[]>([])
  const [skills, setSkills] = useState(sheet.skills)
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [openSkills, setOpenSkills] = useState(false)
  const [openChoice, setOpenChoice] = useState<string | null>(null)

  // The table's numbers follow the level while nobody has overruled them.
  const hpValue = hpTouched ? hpMax : (suggestedHp === null ? '' : String(suggestedHp))
  const slotValue = (l: string): string =>
    slotsTouched ? (slots[l] ?? '') : String(grant?.slots?.[l] ?? slotsOf(sheet)[l] ?? '')

  const casts = sheet.spellcasting !== null
  const slotLevels = useMemo(() => {
    const had = Object.keys(slotsOf(sheet)).map(Number)
    const offered = Object.keys(grant?.slots ?? {}).map(Number)
    const all = [...had, ...offered]
    const next = Math.min(9, (all.length ? Math.max(...all) : 0) + 1)
    return [...new Set([...all, next])].sort((a, b) => a - b).map(String)
  }, [sheet, grant])

  const num = (v: string): number | null => {
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  const newLevel = num(level)
  const newHpMax = num(hpValue)
  const gained = newHpMax !== null && sheet.hpMax !== null ? newHpMax - sheet.hpMax : 0
  const hpNow = currentHp ?? null

  const has = (id: string) => picks[id] ?? []
  const toggle = (id: string, value: string, max: number) => {
    const chosen = has(id)
    const next = chosen.includes(value)
      ? chosen.filter((v) => v !== value)
      : [...chosen, value].slice(-max)
    setPicks({ ...picks, [id]: next })
  }

  const spellPool = useMemo(() => (max: number) => offerableSpells(sheet, max), [sheet])

  const built: SheetPatch = buildLevelUp(sheet, grant, {
    level: newLevel,
    hpMax: newHpMax,
    slots: Object.fromEntries(slotLevels.map((l) => [l, num(slotValue(l)) ?? 0])),
    picks,
    traits,
    skills,
  })
  const changes = Object.keys(built).length
  const preview = { ...sheet, ...built }
  const pending = (grant?.choices ?? []).filter((c) => has(c.id).length < c.pick)

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

        {!grant && (
          <p className="lvl-note lvl-manual">
            {es.sinTabla} <b>{sheet.className ?? '—'}</b> {es.nivelN.toLowerCase()} {level || '—'}.{' '}
            {es.sinTablaAyuda}
          </p>
        )}

        <div className="lvl-row">
          <label>
            <span>{es.pgMaximos}</span>
            <input
              className="lvl-num"
              inputMode="numeric"
              value={hpValue}
              onChange={(e) => {
                setHpTouched(true)
                setHpMax(e.target.value.replace(/\D/g, ''))
              }}
            />
          </label>
          <span className="lvl-was">
            {es.antes} {sheet.hpMax ?? '—'}
            {gained > 0 && <b className="lvl-gain"> +{gained}</b>}
            {grant?.hitDie && !hpTouched && (
              <span className="lvl-from"> · {es.mediaDe} d{grant.hitDie}</span>
            )}
          </span>
        </div>
        {gained > 0 && hpNow !== null && (
          <p className="lvl-note">
            {es.pgActualesSuben} <b>{hpNow} → {Math.min(hpNow + gained, newHpMax ?? hpNow + gained)}</b>
          </p>
        )}

        {grant?.features && grant.features.length > 0 && (
          <>
            <div className="lvl-label">{es.teLlevas}</div>
            {grant.features.map((f) => (
              <div className="lvl-granted" key={f.name}>
                <b>{f.name}</b>
                <p>{f.text}</p>
              </div>
            ))}
          </>
        )}

        {(grant?.choices ?? []).map((choice) => {
          const chosen = has(choice.id)
          const open = openChoice === choice.id
          return (
            <div className="lvl-choice" key={choice.id}>
              <button className="lvl-toggle" onClick={() => setOpenChoice(open ? null : choice.id)}>
                {open ? '▾' : '▸'} {choice.label}
                <span className={chosen.length >= choice.pick ? 'lvl-gain' : 'lvl-pending'}>
                  {' '}{chosen.length}/{choice.pick}
                </span>
              </button>
              {chosen.length > 0 && !open && (
                // A skill choice holds keys, not names: `sigilo` is what the
                // record wants and «Sigilo» is what a person reads.
                <p className="lvl-chosen">
                  {chosen
                    .map((v) => (choice.kind === 'skills' ? (SKILLS.find((s) => s.key === v)?.name ?? v) : v))
                    .join(' · ')}
                </p>
              )}
              {open && (
                <>
                  {choice.help && <p className="lvl-help">{choice.help}</p>}
                  {choice.kind === 'skills' && (
                    <div className="lvl-skills">
                      {(choice.from ?? SKILLS.map((s) => s.key)).map((key) => {
                        const skill = SKILLS.find((s) => s.key === key)!
                        const already = sheet.skills[key]?.prof
                        return (
                          <button
                            key={key}
                            className={`lvl-skill ${chosen.includes(key) ? choice.as : (already ?? 'none')}`}
                            onClick={() => toggle(choice.id, key, choice.pick)}
                          >
                            <span className="lvl-skill-name">
                              {skill.name}
                              {already && <span className="lvl-from"> {es[already === 'expertise' ? 'experticia' : 'competente']}</span>}
                            </span>
                            <b>{formatMod(skillRow(preview, key).mod ?? 0)}</b>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {choice.kind === 'spells' && (
                    <div className="lvl-spells">
                      {spellPool(choice.maxLevel).map((s) => (
                        <button
                          key={s.es}
                          className={`lvl-spell${chosen.includes(s.es) ? ' on' : ''}`}
                          onClick={() => toggle(choice.id, s.es, choice.pick)}
                        >
                          <span className="lvl-spell-head">
                            <b>{s.es}</b>
                            <span className="lvl-from">
                              {s.lvl === 0 ? es.trucos : `${es.nivelN} ${s.lvl}`} · {s.school}
                              {s.conc ? ' · conc.' : ''}
                              {s.rit ? ` · ${es.ritual}` : ''}
                            </span>
                          </span>
                          <span className="lvl-spell-sum">{s.sum}</span>
                        </button>
                      ))}
                      {spellPool(choice.maxLevel).length === 0 && (
                        <p className="lvl-help">{es.sinConjurosQueOfrecer}</p>
                      )}
                    </div>
                  )}
                  {choice.kind === 'features' && (
                    <div className="lvl-spells">
                      {choice.from.map((f) => (
                        <button
                          key={f.name}
                          className={`lvl-spell${chosen.includes(f.name) ? ' on' : ''}`}
                          onClick={() => toggle(choice.id, f.name, choice.pick)}
                        >
                          <span className="lvl-spell-head">
                            <b>{f.name}</b>
                          </span>
                          <span className="lvl-spell-sum">{f.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

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
                    value={slotValue(l)}
                    placeholder="0"
                    onChange={(e) => {
                      // Whatever is on screen becomes the state the moment one
                      // of them is touched, so the table stops driving them.
                      const seeded = Object.fromEntries(slotLevels.map((k) => [k, slotValue(k)]))
                      setSlotsTouched(true)
                      setSlots({ ...seeded, [l]: e.target.value.replace(/\D/g, '') })
                    }}
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
            <button
              className="lvl-add"
              title={es.quitar}
              onClick={() => setTraits(traits.filter((_, j) => j !== i))}
            >
              ✕
            </button>
            <textarea
              placeholder={es.queHaceElRasgo}
              value={t.text}
              onChange={(e) =>
                setTraits(traits.map((x, j) => (i === j ? { ...x, text: e.target.value } : x)))
              }
            />
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
        </button>
        {openSkills && (
          <div className="lvl-skills">
            {SKILLS.map((s) => {
              const prof = skills[s.key]?.prof
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
                  <b>{formatMod(skillRow(preview, s.key).mod ?? 0)}</b>
                </button>
              )
            })}
          </div>
        )}

        {error && <p className="lvl-error">{error}</p>}
        {pending.length > 0 && (
          <p className="lvl-help lvl-pending">
            {es.faltaElegir} {pending.map((c) => c.label.toLowerCase()).join(', ')}.
          </p>
        )}
        <div className="lvl-actions">
          <button onClick={onClose}>{es.cancelar}</button>
          <button
            className="primary"
            disabled={busy || changes === 0 || newLevel === null}
            onClick={() => onApply(built)}
          >
            {busy ? es.subiendo : `${es.subirA} ${newLevel ?? '—'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
