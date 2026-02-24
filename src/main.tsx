import { PortalProvider, ThemeProvider } from '@accelint/design-toolkit'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/roboto-flex'
import '@fontsource-variable/roboto-mono'
import '@accelint/design-foundation/styles'
import './styles.css'
import 'maplibre-gl/dist/maplibre-gl.css'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultMode="dark">
    <PortalProvider>
      <App />
    </PortalProvider>
  </ThemeProvider>,
)
