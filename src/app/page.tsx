import { Suspense } from 'react'
import { ClientApp } from '@/components/ClientApp'

export default function Page() {
  return (
    <Suspense>
      <ClientApp />
    </Suspense>
  )
}
