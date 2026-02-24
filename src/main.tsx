import { createRoot } from 'react-dom/client'
import { ThemeProvider, PortalProvider } from '@accelint/design-toolkit'
import App from './App'
import '@accelint/design-foundation/styles'
import './styles.css'
import 'maplibre-gl/dist/maplibre-gl.css'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultMode="dark">
    <PortalProvider>
      <App />
    </PortalProvider>
  </ThemeProvider>
)
