'use client'

import { PortalProvider, ThemeProvider } from '@accelint/design-toolkit'
import App from './app'

export function ClientApp() {
  return (
    <ThemeProvider defaultMode="dark">
      <PortalProvider>
        <App />
      </PortalProvider>
    </ThemeProvider>
  )
}
