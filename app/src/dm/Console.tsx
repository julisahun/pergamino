import { useEffect, useRef, useState } from 'react'
import { useDm, type Tab } from '../state/dmStore.ts'
import { es } from '../strings/es.ts'
import { MesaPanel } from './MesaPanel.tsx'
import { PartyPanel } from './PartyPanel.tsx'
import { PnjPanel } from './PnjPanel.tsx'
import { ObjetosPanel } from './ObjetosPanel.tsx'
import { NotasPanel } from './NotasPanel.tsx'
import { SesionPanel } from './SesionPanel.tsx'
import { PreparacionPanel } from './PreparacionPanel.tsx'
import { CampaignFormat } from './CampaignFormat.tsx'

/** The screens used during play. The bookends live behind the ⋯ menu. */
const TABS: { id: Tab; label: string }[] = [
  { id: 'mesa', label: es.mesa },
  { id: 'party', label: es.party },
  { id: 'pnj', label: es.pnjs },
  { id: 'objetos', label: es.objetos },
  { id: 'notas', label: es.notas },
]

const MENU: { id: Tab; label: string }[] = [
  { id: 'sesion', label: es.cerrarSesion },
  { id: 'preparacion', label: es.preparacion },
]

function MoreMenu() {
  const { tab, setTab, close, changeToken } = useDm()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const inMenu = MENU.some((m) => m.id === tab)

  return (
    <div className="menu-wrap" ref={wrap}>
      <button aria-pressed={inMenu} title={es.masOpciones} onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open && (
        <div className="menu">
          {MENU.map((m) => (
            <button
              key={m.id}
              aria-pressed={tab === m.id}
              onClick={() => {
                setTab(m.id)
                setOpen(false)
              }}
            >
              {m.label}
            </button>
          ))}
          <div className="divider" />
          <button
            onClick={() => {
              setOpen(false)
              changeToken()
            }}
          >
            {es.cambiarToken}
          </button>
          <button
            onClick={() => {
              setOpen(false)
              void close()
            }}
          >
            {es.cerrarCarpeta}
          </button>
        </div>
      )}
    </div>
  )
}

/** The DM's token, pasted once from the server's `.env`. */
function TokenForm() {
  const { setToken, serverError } = useDm()
  const [token, setTokenText] = useState('')
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        void setToken(token)
      }}
    >
      <input
        type="password"
        autoFocus
        placeholder={es.tokenDm}
        value={token}
        onChange={(e) => setTokenText(e.target.value)}
        style={{ minWidth: 260 }}
      />
      <button className="primary" type="submit" disabled={!token.trim()}>
        {es.guardarToken}
      </button>
      {serverError && <span style={{ color: 'var(--danger)' }}>{serverError}</span>}
    </form>
  )
}

/**
 * Everything before a folder is open.
 *
 * The picker has to be a click: `showDirectoryPicker` and re-granting a
 * remembered handle both require a user gesture, so there is no version of
 * this that happens on load.
 */
function Welcome() {
  const { phase, vaultName, pick, reopen, error, retryServer, register, serverError } = useDm()
  const [format, setFormat] = useState(false)

  // What has to be inside the folder is a question you have *before* there is
  // one, so it hangs here rather than behind the ⋯ menu — and it is still the
  // question on a browser that cannot open folders at all.
  const formato = (
    <>
      <button onClick={() => setFormat(true)}>{es.formato}</button>
      {format && <CampaignFormat onClose={() => setFormat(false)} />}
    </>
  )

  if (phase === 'sin-soporte') {
    return (
      <div className="welcome">
        <h2>{es.navegadorNoSoportado}</h2>
        <p className="muted">{es.navegadorAyuda}</p>
        <div className="row">{formato}</div>
      </div>
    )
  }

  // The folder is open; what is missing is on the server's side.
  if (phase === 'sin-servidor') {
    return (
      <div className="welcome">
        <h2>{es.sinServidor}</h2>
        <p className="muted">{es.sinServidorAyuda}</p>
        {serverError && <p className="muted small">{serverError}</p>}
        <div className="row">
          <button className="primary" onClick={() => void retryServer()}>
            {es.reintentar}
          </button>
        </div>
      </div>
    )
  }
  if (phase === 'sin-token') {
    return (
      <div className="welcome">
        <h2>{es.tokenDm}</h2>
        <p className="muted">{es.tokenDmAyuda}</p>
        <TokenForm />
      </div>
    )
  }
  if (phase === 'sin-registrar') {
    return (
      <div className="welcome">
        <h2>{es.registrarCampana}</h2>
        <p className="muted">{es.registrarCampanaAyuda}</p>
        <div className="row">
          <button className="primary" onClick={() => void register()}>
            {es.registrarCampana} · {vaultName}
          </button>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div className="welcome">
      <h2>{es.app}</h2>
      <p>{es.bienvenida}</p>
      {phase === 'reabrir' ? (
        <>
          <p className="muted">{es.reabrirAyuda}</p>
          <div className="row">
            <button className="primary" onClick={() => void reopen()}>
              {es.reabrir} · {vaultName}
            </button>
            <button onClick={() => void pick()}>{es.cambiarCarpeta}</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button
            className="primary"
            disabled={phase === 'abriendo'}
            onClick={() => void pick()}
          >
            {phase === 'abriendo' ? es.abriendo : es.abrirCarpeta}
          </button>
        </div>
      )}
      <p className="muted small">{es.bienvenidaAyuda}</p>
      <p className="muted small">{es.bienvenidaForma}</p>
      <div className="row">{formato}</div>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  )
}

export function Console() {
  const {
    start,
    phase,
    ready,
    tab,
    setTab,
    mesa,
    runs,
    openRun,
    campaign,
    campaigns,
    openCampaign,
    connection,
    serverError,
    error,
  } = useDm()

  useEffect(() => {
    start()
    document.title = `${es.app} · ${es.consola}`
  }, [start])

  if (!ready) return <Welcome />

  return (
    <div className="console">
      <header className="topbar">
        <h1>{es.app}</h1>

        {campaigns.length > 1 && (
          <select
            value={campaign}
            onChange={(e) => void openCampaign(e.target.value)}
            title={es.campana}
          >
            {campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <select value={mesa} onChange={(e) => void openRun(e.target.value)} title={es.mesaQueJuega}>
          {runs.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        <span
          className="status"
          title={
            connection === 'conectada'
              ? es.conectado
              : connection === 'conectando'
                ? es.conectando
                : connection === 'sin-autorizar'
                  ? es.sinAutorizar
                  : es.sinConexion
          }
        >
          <span
            className={`dot ${
              connection === 'conectada'
                ? 'open'
                : connection === 'conectando'
                  ? 'connecting'
                  : 'closed'
            }`}
          />
          {connection === 'sin-conexion' && es.reconectando}
        </span>
        {serverError && (
          <span className="badge warn" title={serverError}>
            {es.rechazado}
          </span>
        )}
        {error && <span className="badge warn">{error}</span>}

        <button onClick={() => window.open('/tv', 'mesa', 'width=1280,height=760')}>
          {es.abrirMesa}
        </button>

        <MoreMenu />
      </header>

      {phase !== 'lista' ? (
        <div className="panel muted">{es.abriendo}</div>
      ) : tab === 'mesa' ? (
        <MesaPanel />
      ) : tab === 'party' ? (
        <PartyPanel />
      ) : tab === 'pnj' ? (
        <PnjPanel />
      ) : tab === 'objetos' ? (
        <ObjetosPanel />
      ) : tab === 'notas' ? (
        <NotasPanel />
      ) : tab === 'sesion' ? (
        <SesionPanel />
      ) : (
        <PreparacionPanel />
      )}
    </div>
  )
}
