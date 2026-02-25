import { describe, expect, test } from 'bun:test'
import { buildHoverText } from '@/hooks/use-hover-text'
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

describe('buildHoverText', () => {
  const shapes: FreeDrawShape[] = []

  test('NONE hover returns instruction text', () => {
    const text = buildHoverText({ kind: 'NONE' }, [], shapes, { kind: 'AOR' })
    expect(text).toContain('Hover')
  })

  test('REF hover shows keypad/label', () => {
    const text = buildHoverText({ kind: 'REF', label: 'Hill AFB', keypadId: '22AF6' }, [], shapes, {
      kind: 'AOR',
    })
    expect(text).toBe('22AF6/HILL AFB')
  })

  test('AIRSPACE hover shows owner, state, altitude', () => {
    const airspaces = [makeAirspace({ id: 'a1', ownerCallsign: 'HAWK01', state: 'ACTIVE' })]
    const text = buildHoverText({ kind: 'AIRSPACE', airspaceId: 'a1' }, airspaces, shapes, {
      kind: 'AOR',
    })
    expect(text).toContain('HAWK01')
    expect(text).toContain('ACTIVE')
    expect(text).toContain('5000')
  })

  test('AIRSPACE hover returns "Unknown airspace" for missing ID', () => {
    const text = buildHoverText({ kind: 'AIRSPACE', airspaceId: 'missing' }, [], shapes, {
      kind: 'AOR',
    })
    expect(text).toBe('Unknown airspace')
  })

  test('SHAPE hover shows label, type, tags', () => {
    const shapeList: FreeDrawShape[] = [
      {
        id: 's1',
        label: 'Orbit Alpha',
        shapeType: 'POLYGON',
        tags: ['ROZ'],
        derivedKeypads: ['23AF5'],
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
    const text = buildHoverText({ kind: 'SHAPE', shapeId: 's1' }, [], shapeList, { kind: 'AOR' })
    expect(text).toContain('Orbit Alpha')
    expect(text).toContain('POLYGON')
    expect(text).toContain('ROZ')
  })

  test('KEYPAD hover shows keypad stack sorted by altitude descending', () => {
    const airspaces = [
      makeAirspace({
        id: 'a1',
        ownerCallsign: 'LOW01',
        keypads: ['23AF5'],
        altitude: { kind: 'SINGLE', singleFt: 3000 },
      }),
      makeAirspace({
        id: 'a2',
        ownerCallsign: 'HIGH01',
        keypads: ['23AF5'],
        altitude: { kind: 'SINGLE', singleFt: 9000 },
      }),
    ]
    const text = buildHoverText({ kind: 'KEYPAD', keypadId: '23AF5' }, airspaces, shapes, {
      kind: 'AOR',
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('23AF5')
    expect(lines[1]).toContain('HIGH01')
    expect(lines[2]).toContain('LOW01')
  })

  test('KEYPAD hover shows out of scope when not in killbox scope', () => {
    const text = buildHoverText({ kind: 'KEYPAD', keypadId: '23AF5' }, [], shapes, {
      kind: 'KILLBOX',
      killbox: '22AG',
    })
    expect(text).toContain('out of scope')
  })
})
