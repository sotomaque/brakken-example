import { Suspense } from 'react'
import { ClientApp } from '@/components/client-app'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientApp />
    </Suspense>
  )
}
