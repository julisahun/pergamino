/**
 * The cast, statblocks and all.
 *
 * Every `pnj/*.md` in the campaign, readable without seating anyone on the
 * board first — which until now was the only way to see an AC or a trait. It
 * reads prep and never writes it: the one action here is `npc/add`, which puts
 * a copy into the *session*, and only for a PNJ that has hit points.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Pnj } from '../../../shared/types.ts'
import { assetUrl } from '../../../shared/session/project.ts'
import { isCombatant } from '../../../shared/vault/campaign.ts'
import { es } from '../strings/es.ts'
import { useDm } from '../state/dmStore.ts'
import { Face } from './Face.tsx'

const statLine = (p: Pnj): string =>
  [
    p.tag,
    `${es.ca} ${p.ac}`,
    p.hpMax !== null && `${es.pg} ${p.hpMax}`,
    p.speed !== null && `${es.velocidad} ${p.speed} m`,
    p.initMod !== 0 && `${es.iniciativa} ${p.initMod > 0 ? '+' : ''}${p.initMod}`,
  ]
    .filter(Boolean)
    .join(' · ')

export function PnjPanel() {
  const { pnjs, state, dispatch, openNote } = useDm()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [count, setCount] = useState(1)

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pnjs
    return pnjs.filter((p) =>
      [p.name, p.tag ?? '', p.lead, ...p.abilities.map((a) => a.name)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [pnjs, query])

  // Grouped by the `tag` in the front matter — the closest thing the notes
  // have to a bestiary index. Untagged people fall to the bottom.
  const groups = useMemo(() => {
    const map = new Map<string, typeof found>()
    for (const p of found) {
      const key = p.tag?.trim() || es.sinEtiqueta
      map.set(key, [...(map.get(key) ?? []), p])
    }
    return [...map.entries()]
      .map(([tag, list]) => [tag, [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'))] as const)
      .sort(([a], [b]) =>
        a === es.sinEtiqueta ? 1 : b === es.sinEtiqueta ? -1 : a.localeCompare(b, 'es'),
      )
  }, [found])

  // Never land on an empty right-hand pane.
  useEffect(() => {
    if (selected === null && pnjs.length > 0) setSelected(pnjs[0]!.id)
  }, [pnjs, selected])

  const current = pnjs.find((p) => p.id === selected) ?? null
  const seated = current
    ? (state?.npcs ?? []).filter((n) => n.file === current.file || n.id === current.id).length
    : 0

  if (pnjs.length === 0) return <div className="panel muted">{es.sinPnj}</div>

  return (
    <div className="catalogo">
      <div>
        <input
          className="note-search"
          type="text"
          value={query}
          placeholder={es.buscarPnj}
          onChange={(e) => setQuery(e.target.value)}
        />

        {found.length === 0 && <p className="muted">{es.sinResultados}</p>}

        {groups.map(([tag, list]) => (
          <div className="note-group" key={tag}>
            <div className="group-label">
              {tag} · {list.length}
            </div>
            <div className="note-list">
              {list.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={selected === p.id}
                  onClick={() => setSelected(p.id)}
                >
                  {p.name}
                  <span className="cat-sub">
                    {isCombatant(p)
                      ? `${es.ca} ${p.ac} · ${es.pg} ${p.hpMax}`
                      : es.soloTrato}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="detail">
        {!current ? (
          <p className="muted">{es.eligePnj}</p>
        ) : (
          <>
            <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
              {/* The portrait is a vault path in the front matter, so it is a
                  `/vault/…` key — not the `/api/portrait/npc/<id>` one, which
                  only names someone already in the session. */}
              <Face
                src={assetUrl(current.portrait?.src)}
                name={current.name}
                className="cat-face"
              />
              <div style={{ flex: 1 }}>
                <h2>{current.name}</h2>
                <div className="sub">{statLine(current)}</div>
              </div>
            </div>

            {isCombatant(current) ? (
              <section className="card" style={{ marginBottom: 12 }}>
                <h3>{es.anadirALaSesion}</h3>
                <div className="row">
                  <input
                    className="hp-input"
                    value={count}
                    inputMode="numeric"
                    title={es.copias}
                    onChange={(e) =>
                      setCount(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))
                    }
                  />
                  <button
                    disabled={!state}
                    onClick={() => dispatch({ type: 'npc/add', pnjId: current.id, count })}
                  >
                    {es.anadir}
                  </button>
                  {seated > 0 && (
                    <span className="muted">
                      {seated} {es.yaEnLaSesion}
                    </span>
                  )}
                </div>
              </section>
            ) : (
              <p className="muted" style={{ marginBottom: 12 }}>
                {es.soloTratoAyuda}
              </p>
            )}

            {current.abilities.length > 0 && (
              <section className="card" style={{ marginBottom: 12 }}>
                <h3>{es.rasgos}</h3>
                {current.abilities.map((a) => (
                  <div className="ability" key={a.id}>
                    <strong>{a.name}</strong>
                    <p>{a.desc}</p>
                  </div>
                ))}
              </section>
            )}

            {current.lead && (
              <section className="card" style={{ marginBottom: 12 }}>
                <h3>{es.notaPreparacion}</h3>
                <p className="prep-note">{current.lead}</p>
              </section>
            )}

            <button className="mini" onClick={() => openNote(current.file)}>
              {es.verNota} →
            </button>
            <p className="reader-path" style={{ marginTop: 8 }}>
              {current.file}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
