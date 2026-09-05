import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AssetProvider } from './assets/context.tsx'
import { PlayerApp } from './pj/PlayerApp.tsx'
import { pjAssets } from './state/pjStore.ts'
import './pj.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssetProvider cache={pjAssets}>
      <PlayerApp />
    </AssetProvider>
  </StrictMode>,
)
