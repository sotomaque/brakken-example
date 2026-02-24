import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Airspace Deconfliction Prototype',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
