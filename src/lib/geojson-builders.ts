import type { AirspaceReservation, FreeDrawShape } from './types'
import { fmtAlt } from './utils'

/** Return the highest altitude point for z-ordering (higher = renders on top). */
export function getEffectiveAltitude(a: AirspaceReservation): number {
  return a.altitude.kind === 'SINGLE' ? a.altitude.singleFt : a.altitude.maxFt
}

export function buildAirspacesGeoJSON(
  airspaces: AirspaceReservation[],
  overlapGroups: Map<string, number>,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: airspaces
      .filter(a => a.state !== 'ARCHIVED' && !(a.state === 'COLD' && !a.showCold))
      .sort((a, b) => {
        const kindOrder = a.kind === 'KEYPAD' ? 0 : 1
        const kindOrderB = b.kind === 'KEYPAD' ? 0 : 1
        if (kindOrder !== kindOrderB) return kindOrder - kindOrderB
        return getEffectiveAltitude(a) - getEffectiveAltitude(b)
      })
      .map(a => ({
        type: 'Feature' as const,
        properties: {
          id: a.id,
          ownerCallsign: a.ownerCallsign,
          state: a.state,
          kind: a.kind,
          altitude: fmtAlt(a.altitude),
          keypads: a.keypads.join(','),
          color: a.color,
          showFill: a.showFill !== false,
          lineWidth: a.lineWidth ?? 2.0,
          overlapSlot: overlapGroups.get(a.id) ?? 0,
        },
        geometry: a.geometry,
      })),
  }
}

export function buildShapesGeoJSON(shapes: FreeDrawShape[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: shapes.map(s => ({
      type: 'Feature' as const,
      properties: {
        id: s.id,
        label: s.label,
        shapeType: s.shapeType,
        tags: s.tags.join(','),
      },
      geometry: s.geometry as GeoJSON.Geometry,
    })),
  }
}

export type RefPointLike = {
  id: string
  label: string
  keypad: string
  kind: string
  pos: { lat: number; lon: number } | [number, number]
}

export function buildRefsGeoJSON(
  refPoints: RefPointLike[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: refPoints.map(r => ({
      type: 'Feature' as const,
      properties: {
        id: r.id,
        label: r.label,
        keypad: r.keypad,
        kind: r.kind,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: Array.isArray(r.pos) ? r.pos : [r.pos.lon, r.pos.lat],
      },
    })),
  }
}
