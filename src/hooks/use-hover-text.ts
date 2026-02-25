import { useMemo } from 'react'
import type { AirspaceReservation, FreeDrawShape, Scope } from '@/lib/types'
import { fmtAlt } from '@/lib/utils'
import type { HoverInfo } from '@/store'

export function buildHoverText(
  hover: HoverInfo,
  airspaces: AirspaceReservation[],
  shapes: FreeDrawShape[],
  scope: Scope,
): string {
  if (hover.kind === 'NONE')
    return 'Hover a keypad / airspace / reference point to see details here.'

  if (hover.kind === 'REF') {
    return `${hover.keypadId}/${hover.label.toUpperCase()}`
  }

  if (hover.kind === 'AIRSPACE') {
    const a = airspaces.find(x => x.id === hover.airspaceId)
    if (!a) return 'Unknown airspace'
    const alt =
      a.altitude.kind === 'SINGLE'
        ? `${a.altitude.singleFt}`
        : `${a.altitude.minFt}-${a.altitude.maxFt}`
    const kp = a.keypads.toSorted().join(' ')
    return `${a.ownerCallsign}\n${a.state} ${a.kind}\nALT ${alt} ft\n${kp}`
  }

  if (hover.kind === 'SHAPE') {
    const s = shapes.find(x => x.id === hover.shapeId)
    if (!s) return 'Unknown shape'
    const tags = s.tags.join(',')
    const kp = s.derivedKeypads.toSorted().join(' ')
    return `${s.label}\n${s.shapeType} [${tags}]\n${kp}`
  }

  if (hover.kind === 'KEYPAD') {
    const keypadId = hover.keypadId
    const inScope = (kp: string) => {
      if (scope.kind === 'AOR') return true
      if (scope.kind === 'KILLBOX') return kp.startsWith(scope.killbox)
      if (scope.kind === 'AREA') {
        const area = shapes.find(s => s.id === scope.areaId)
        const set = new Set(area?.derivedKeypads ?? [])
        return set.has(kp)
      }
      return true
    }
    if (!inScope(keypadId)) return `${keypadId}\n(out of scope)`

    const stack: { label: string; sortAlt: number }[] = []

    for (const s of shapes) {
      if (!s.tags.includes('ROZ')) continue
      if (!s.derivedKeypads.includes(keypadId)) continue
      const alt = s.altitude ? fmtAlt(s.altitude) : 'SFC-??'
      const sortAlt =
        s.altitude?.kind === 'SINGLE' ? s.altitude.singleFt : (s.altitude?.maxFt ?? 999999)
      stack.push({ label: `${s.label} ${alt}`, sortAlt })
    }

    for (const a of airspaces) {
      if (a.state === 'ARCHIVED') continue
      if (!a.keypads.includes(keypadId)) continue
      const { altitude } = a
      const alt =
        altitude.kind === 'SINGLE' ? `${altitude.singleFt}` : `${altitude.minFt}-${altitude.maxFt}`
      const sortAlt = altitude.kind === 'SINGLE' ? altitude.singleFt : altitude.maxFt
      stack.push({ label: `${a.ownerCallsign} ${alt}`, sortAlt })
    }

    stack.sort((x, y) => y.sortAlt - x.sortAlt)
    const lines = [keypadId, ...stack.map(s => s.label)]
    return lines.join('\n')
  }

  return ''
}

export function useHoverText(
  hover: HoverInfo,
  airspaces: AirspaceReservation[],
  shapes: FreeDrawShape[],
  scope: Scope,
): string {
  return useMemo(
    () => buildHoverText(hover, airspaces, shapes, scope),
    [hover, airspaces, shapes, scope],
  )
}
