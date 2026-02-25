import { describe, expect, test } from 'bun:test'
import {
  buildAirspacesGeoJSON,
  buildRefsGeoJSON,
  buildShapesGeoJSON,
  getEffectiveAltitude,
} from '@/lib/geojson-builders'
import type { AirspaceReservation, FreeDrawShape } from '@/lib/types'
import { polygonFromKeypads } from '@/lib/utils'

const makeAirspace = (overrides: Partial<AirspaceReservation> = {}): AirspaceReservation => ({
  id: 'a1',
  ownerCallsign: 'HAWK01',
  kind: 'KEYPAD',
  state: 'ACTIVE',
  altitude: { kind: 'SINGLE', singleFt: 5000 },
  keypads: ['23AF5'],
  geometry: polygonFromKeypads(['23AF5']),
  ...overrides,
})

describe('getEffectiveAltitude', () => {
  test('returns singleFt for SINGLE altitude', () => {
    const a = makeAirspace({ altitude: { kind: 'SINGLE', singleFt: 3000 } })
    expect(getEffectiveAltitude(a)).toBe(3000)
  })
  test('returns maxFt for BLOCK altitude', () => {
    const a = makeAirspace({ altitude: { kind: 'BLOCK', minFt: 2000, maxFt: 6000 } })
    expect(getEffectiveAltitude(a)).toBe(6000)
  })
})

describe('buildAirspacesGeoJSON', () => {
  test('filters out ARCHIVED airspaces', () => {
    const airspaces = [
      makeAirspace({ id: 'a1', state: 'ACTIVE' }),
      makeAirspace({ id: 'a2', state: 'ARCHIVED' }),
    ]
    const result = buildAirspacesGeoJSON(airspaces, new Map())
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties.id).toBe('a1')
  })

  test('filters out COLD without showCold', () => {
    const airspaces = [
      makeAirspace({ id: 'a1', state: 'COLD', showCold: false }),
      makeAirspace({ id: 'a2', state: 'COLD', showCold: true }),
    ]
    const result = buildAirspacesGeoJSON(airspaces, new Map())
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties.id).toBe('a2')
  })

  test('sorts KEYPAD before FREEDRAW, then by altitude', () => {
    const airspaces = [
      makeAirspace({
        id: 'fd-high',
        kind: 'FREEDRAW',
        altitude: { kind: 'SINGLE', singleFt: 9000 },
      }),
      makeAirspace({ id: 'kp-low', kind: 'KEYPAD', altitude: { kind: 'SINGLE', singleFt: 1000 } }),
      makeAirspace({ id: 'kp-high', kind: 'KEYPAD', altitude: { kind: 'SINGLE', singleFt: 8000 } }),
    ]
    const result = buildAirspacesGeoJSON(airspaces, new Map())
    const ids = result.features.map(f => f.properties.id)
    expect(ids).toEqual(['kp-low', 'kp-high', 'fd-high'])
  })

  test('includes overlapSlot from overlapGroups', () => {
    const airspaces = [makeAirspace({ id: 'a1' })]
    const groups = new Map([['a1', 3]])
    const result = buildAirspacesGeoJSON(airspaces, groups)
    expect(result.features[0].properties.overlapSlot).toBe(3)
  })

  test('defaults overlapSlot to 0 when not in map', () => {
    const airspaces = [makeAirspace({ id: 'a1' })]
    const result = buildAirspacesGeoJSON(airspaces, new Map())
    expect(result.features[0].properties.overlapSlot).toBe(0)
  })
})

describe('buildShapesGeoJSON', () => {
  test('maps shapes to features', () => {
    const shapes: FreeDrawShape[] = [
      {
        id: 's1',
        label: 'Orbit Alpha',
        shapeType: 'POLYGON',
        tags: ['ROZ', 'ORBIT'],
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        derivedKeypads: [],
      },
    ]
    const result = buildShapesGeoJSON(shapes)
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties.tags).toBe('ROZ,ORBIT')
    expect(result.features[0].properties.label).toBe('Orbit Alpha')
  })
})

describe('buildRefsGeoJSON', () => {
  test('converts ref points with LatLon pos', () => {
    const refs = [
      { id: 'r1', label: 'Base Alpha', keypad: '23AF5', kind: 'AFB', pos: { lat: 1, lon: 122 } },
    ]
    const result = buildRefsGeoJSON(refs)
    expect(result.features).toHaveLength(1)
    expect(result.features[0].geometry.coordinates).toEqual([122, 1])
  })

  test('converts ref points with array pos', () => {
    const refs = [
      {
        id: 'r2',
        label: 'Base Beta',
        keypad: '22AG3',
        kind: 'FOB',
        pos: [122, 1] as [number, number],
      },
    ]
    const result = buildRefsGeoJSON(refs)
    expect(result.features[0].geometry.coordinates).toEqual([122, 1])
  })
})
