/**
 * Authoring scene rosters. This is the one place the app writes into the prep
 * folders, so it refuses to work while a run is live.
 */
import { useState } from 'react'
import type { RosterEntry } from '../../../shared/types.ts'
import { isCombatant } from '../../../shared/vault/campaign.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'

export function PreparacionPanel() {
  const { scenes, pnjs, state, saveRoster } = useDm()
  const [drafts, setDrafts] = useState<Record<string, RosterEntry[]>>({})
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!state) return null
  const live = state.encounter.on || state.field.sceneId !== null
  // A PNJ with no hit points cannot be seated — `instantiate` skips it — so a
  // roster must not be able to name one.
  const seatable = pnjs.filter(isCombatant)

  const rosterOf = (sceneId: string): RosterEntry[] =>
    drafts[sceneId] ?? scenes.find((s) => s.id === sceneId)?.roster ?? []

  const setRoster = (sceneId: string, roster: RosterEntry[]) =>
    setDrafts((d) => ({ ...d, [sceneId]: roster }))

  const save = async (sceneId: string) => {
    setError(null)
    try {
      await saveRoster(sceneId, rosterOf(sceneId))
    } catch (err) {
      setError((err as Error).message)
      return
    }
    setSaved(sceneId)
    setDrafts((d) => {
      const { [sceneId]: _drop, ...rest } = d
      return rest
    })
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div className="prep">
      {live && (
        <div className="banner">
          <strong>{es.bloqueado}</strong>
          {es.bloqueadoAyuda}
        </div>
      )}

      <h2 className="section-title">{es.rosters}</h2>
      <p className="muted" style={{ marginTop: -4, marginBottom: 14 }}>
        {es.rosterAyuda}
      </p>

      {scenes.map((scene) => {
        const roster = rosterOf(scene.id)
        const dirty = drafts[scene.id] !== undefined
        return (
          <div className="roster-card" key={scene.id}>
            <h3>{scene.name}</h3>
            {roster.length === 0 && <p className="muted">{es.sinReparto}</p>}
            {roster.map((entry, i) => (
              <div className="roster-row" key={i}>
                <select
                  value={entry.pnjId}
                  disabled={live}
                  onChange={(e) =>
                    setRoster(
                      scene.id,
                      roster.map((r, j) => (j === i ? { ...r, pnjId: e.target.value } : r)),
                    )
                  }
                >
                  {seatable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  className="hp-input"
                  value={entry.count}
                  inputMode="numeric"
                  disabled={live}
                  onChange={(e) =>
                    setRoster(
                      scene.id,
                      roster.map((r, j) =>
                        j === i
                          ? { ...r, count: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) }
                          : r,
                      ),
                    )
                  }
                />
                <button
                  className="mini"
                  disabled={live}
                  onClick={() => setRoster(scene.id, roster.filter((_, j) => j !== i))}
                >
                  {es.quitar}
                </button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <button
                disabled={live || seatable.length === 0}
                onClick={() =>
                  setRoster(scene.id, [...roster, { pnjId: seatable[0]!.id, count: 1 }])
                }
              >
                {es.anadirFila}
              </button>
              <button disabled={live || !dirty} onClick={() => void save(scene.id)}>
                {es.guardar}
              </button>
              {saved === scene.id && <span className="badge">{es.guardado}</span>}
            </div>
          </div>
        )
      })}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  )
}
