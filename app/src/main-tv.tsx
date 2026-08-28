import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AssetProvider } from './assets/context.tsx'
import { TableScreen } from './table/TableScreen.tsx'
import { tableAssets } from './state/tableStore.ts'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssetProvider cache={tableAssets}>
      <TableScreen />
    </AssetProvider>
  </StrictMode>,
)
