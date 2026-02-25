import type { AirspaceReservation, FreeDrawShape, Scope } from '@/lib/types'

export function filterVisibleAirspaces(
  airspaces: AirspaceReservation[],
  activeTab: string,
  scope: Scope,
  shapes: FreeDrawShape[],
): AirspaceReservation[] {
  const kpSet =
    scope.kind === 'AREA'
      ? new Set(shapes.find(s => s.id === scope.areaId)?.derivedKeypads ?? [])
      : null

  return airspaces.filter(a => {
    // Tab filter
    if (activeTab === 'ARCHIVED') {
      if (a.state !== 'ARCHIVED') return false
    } else if (activeTab === 'ACTIVE') {
      if (a.state !== 'ACTIVE') return false
    } else {
      if (a.state !== 'PLANNED' && a.state !== 'COLD') return false
    }

    // Scope filter
    if (scope.kind === 'KILLBOX') return a.keypads.some(k => k.startsWith(scope.killbox))
    if (scope.kind === 'AREA') return a.keypads.some(k => kpSet!.has(k))
    return true
  })
}

export function useVisibleAirspaces(
  airspaces: AirspaceReservation[],
  activeTab: string,
  scope: Scope,
  shapes: FreeDrawShape[],
): AirspaceReservation[] {
  return filterVisibleAirspaces(airspaces, activeTab, scope, shapes)
}
