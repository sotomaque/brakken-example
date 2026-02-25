import { useMemo } from 'react'
import type { AirspaceReservation, FreeDrawShape, Scope } from '@/lib/types'

export function filterVisibleAirspaces(
  airspaces: AirspaceReservation[],
  activeTab: string,
  scope: Scope,
  shapes: FreeDrawShape[],
): AirspaceReservation[] {
  const tabFilter = (a: AirspaceReservation) => {
    if (activeTab === 'ARCHIVED') return a.state === 'ARCHIVED'
    if (activeTab === 'ACTIVE') return a.state === 'ACTIVE'
    return a.state === 'PLANNED' || a.state === 'COLD'
  }
  let list = airspaces.filter(tabFilter)

  if (scope.kind === 'KILLBOX') {
    list = list.filter(a => a.keypads.some(k => k.startsWith(scope.killbox)))
  } else if (scope.kind === 'AREA') {
    const area = shapes.find(s => s.id === scope.areaId)
    const kp = new Set(area?.derivedKeypads ?? [])
    list = list.filter(a => a.keypads.some(k => kp.has(k)))
  }
  return list
}

export function useVisibleAirspaces(
  airspaces: AirspaceReservation[],
  activeTab: string,
  scope: Scope,
  shapes: FreeDrawShape[],
): AirspaceReservation[] {
  return useMemo(
    () => filterVisibleAirspaces(airspaces, activeTab, scope, shapes),
    [airspaces, activeTab, scope, shapes],
  )
}
