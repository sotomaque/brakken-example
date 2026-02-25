import { describe, expect, test } from 'bun:test'
import { filterVisibleAirspaces } from '@/hooks/use-visible-airspaces'
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

describe('filterVisibleAirspaces', () => {
  const shapes: FreeDrawShape[] = []

  test('ACTIVE tab shows only ACTIVE', () => {
    const airspaces = [
      makeAirspace({ id: 'a1', state: 'ACTIVE' }),
      makeAirspace({ id: 'a2', state: 'PLANNED' }),
      makeAirspace({ id: 'a3', state: 'ARCHIVED' }),
    ]
    const result = filterVisibleAirspaces(airspaces, 'ACTIVE', { kind: 'AOR' }, shapes)
    expect(result.map(a => a.id)).toEqual(['a1'])
  })

  test('PLANNED tab shows PLANNED and COLD', () => {
    const airspaces = [
      makeAirspace({ id: 'a1', state: 'ACTIVE' }),
      makeAirspace({ id: 'a2', state: 'PLANNED' }),
      makeAirspace({ id: 'a3', state: 'COLD' }),
    ]
    const result = filterVisibleAirspaces(airspaces, 'PLANNED', { kind: 'AOR' }, shapes)
    expect(result.map(a => a.id)).toEqual(['a2', 'a3'])
  })

  test('ARCHIVED tab shows only ARCHIVED', () => {
    const airspaces = [
      makeAirspace({ id: 'a1', state: 'ACTIVE' }),
      makeAirspace({ id: 'a2', state: 'ARCHIVED' }),
    ]
    const result = filterVisibleAirspaces(airspaces, 'ARCHIVED', { kind: 'AOR' }, shapes)
    expect(result.map(a => a.id)).toEqual(['a2'])
  })

  test('KILLBOX scope filters by keypad prefix', () => {
    const airspaces = [
      makeAirspace({ id: 'a1', keypads: ['23AF5'] }),
      makeAirspace({ id: 'a2', keypads: ['22AG3'] }),
    ]
    const result = filterVisibleAirspaces(
      airspaces,
      'ACTIVE',
      { kind: 'KILLBOX', killbox: '23AF' },
      shapes,
    )
    expect(result.map(a => a.id)).toEqual(['a1'])
  })

  test('AREA scope filters by derived keypads of shape', () => {
    const shapesWithArea: FreeDrawShape[] = [
      {
        id: 'area1',
        label: 'ROZ Alpha',
        shapeType: 'POLYGON',
        tags: ['ROZ'],
        derivedKeypads: ['23AF5', '23AF6'],
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
      },
    ]
    const airspaces = [
      makeAirspace({ id: 'a1', keypads: ['23AF5'] }),
      makeAirspace({ id: 'a2', keypads: ['22AG3'] }),
    ]
    const result = filterVisibleAirspaces(
      airspaces,
      'ACTIVE',
      { kind: 'AREA', areaId: 'area1' },
      shapesWithArea,
    )
    expect(result.map(a => a.id)).toEqual(['a1'])
  })
})
