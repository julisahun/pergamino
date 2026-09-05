/**
 * The character, on a phone: a sticky head with what changes in a fight, a
 * bar of tabs underneath for everything else.
 */
import { useState } from 'react'
import { es } from '../strings/es.ts'
import { usePj } from '../state/pjStore.ts'
import { HpHeader } from './HpHeader.tsx'
import { Caracteristicas } from './tabs/Caracteristicas.tsx'
import { Combate } from './tabs/Combate.tsx'
import { Conjuros } from './tabs/Conjuros.tsx'
import { Equipo } from './tabs/Equipo.tsx'
import { Mesa } from './tabs/Mesa.tsx'
import { Rasgos } from './tabs/Rasgos.tsx'

type Tab = 'combate' | 'caracteristicas' | 'conjuros' | 'rasgos' | 'equipo' | 'mesa'

export function SheetScreen() {
  const { view, connection, reject, forget, replaceSheet, busy } = usePj()
  const [tab, setTab] = useState<Tab>('combate')
  const [menu, setMenu] = useState(false)

  if (!view) return <div className="pj-center muted">{es.cargando}</div>

  const casts = Object.keys(view.sheet.slots).length > 0 || view.sheet.spells.length > 0
  const tabs: { id: Tab; label: string }[] = [
    { id: 'combate', label: es.combate },
    { id: 'caracteristicas', label: es.caracteristicas },
    ...(casts ? [{ id: 'conjuros' as Tab, label: es.conjuros }] : []),
    { id: 'rasgos', label: es.rasgosTab },
    { id: 'equipo', label: es.equipoTab },
    { id: 'mesa', label: es.mesa },
  ]
  const offline = connection !== 'conectada'

  return (
    <div className="pj-page pj-sheet">
      <HpHeader view={view} disabled={offline} onMenu={() => setMenu((v) => !v)} />
      {offline && (
        <div className="pj-banner">
          {connection === 'sin-autorizar' ? es.enlaceCaducado : `${es.sinConexion} · ${es.reconectando}`}
        </div>
      )}
      {reject && <div className="pj-banner warn">{`${es.rechazado}: ${reject}`}</div>}
      {menu && (
        <div className="pj-menu" onClick={() => setMenu(false)}>
          <label className="pj-menu-item">
            {es.sustituirFicha}
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void replaceSheet(f)
              }}
            />
          </label>
          <button className="pj-menu-item" onClick={forget}>
            {es.cambiarPersonaje}
          </button>
        </div>
      )}
      <main className="pj-body">
        {tab === 'combate' && <Combate view={view} />}
        {tab === 'caracteristicas' && <Caracteristicas view={view} />}
        {tab === 'conjuros' && <Conjuros view={view} disabled={offline} />}
        {tab === 'rasgos' && <Rasgos view={view} />}
        {tab === 'equipo' && <Equipo view={view} disabled={offline} />}
        {tab === 'mesa' && <Mesa view={view} />}
      </main>
      <nav className="pj-tabs">
        {tabs.map((t) => (
          <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
