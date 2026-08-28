import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AssetProvider } from './assets/context.tsx'
import { Console } from './dm/Console.tsx'
import { dmAssets } from './state/dmStore.ts'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssetProvider cache={dmAssets}>
      <Console />
    </AssetProvider>
  </StrictMode>,
)
