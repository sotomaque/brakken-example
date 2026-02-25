import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Altitude } from '@/lib/types'
import { polygonFromKeypads } from '@/lib/utils'
import { useAppStore } from '@/store'

function resetStore() {
  useAppStore.setState({
    aircraft: [],
    airspaces: [],
    shapes: [],
    handledEventIds: {},
    mode: 'SELECT',
    drawType: 'POLYGON',
    selectedKeypads: [],
    selectedId: { kind: null },
    editMode: null,
    hover: { kind: 'NONE' },
    scope: { kind: 'AOR' },
    activeTab: 'ACTIVE',
    picassoMode: false,
    picassoRadius: 8,
    conflicts: [],
    overlapGroups: new Map(),
    pendingDrawResult: null,
    pendingKeypadResult: null,
  })
}

beforeEach(resetStore)
afterEach(resetStore)

function selectKeypads(keypads: string[]) {
  useAppStore.setState({ selectedKeypads: keypads })
}

function createAirspace(
  callsign: string,
  keypads: string[],
  altitude: Altitude,
  state = 'ACTIVE' as const,
) {
  selectKeypads(keypads)
  useAppStore.getState().createAirspaceFromKeypads({ callsign, altitude, state })
}

// ─── createAirspaceFromKeypads ────────────────────────────────────────
describe('createAirspaceFromKeypads', () => {
  test('creates an airspace and aircraft', () => {
    selectKeypads(['23AF5', '23AF6'])
    useAppStore.getState().createAirspaceFromKeypads({
      callsign: 'HAWK01',
      altitude: { kind: 'SINGLE', singleFt: 5000 },
      state: 'ACTIVE',
    })
    const st = useAppStore.getState()
    expect(st.airspaces).toHaveLength(1)
    expect(st.airspaces[0].ownerCallsign).toBe('HAWK01')
    expect(st.airspaces[0].keypads).toEqual(['23AF5', '23AF6'])
    expect(st.airspaces[0].kind).toBe('KEYPAD')
    expect(st.aircraft).toHaveLength(1)
    expect(st.aircraft[0].callsign).toBe('HAWK01')
  })

  test('clears selected keypads after creation', () => {
    selectKeypads(['23AF5'])
    useAppStore.getState().createAirspaceFromKeypads({
      callsign: 'HAWK01',
      altitude: { kind: 'SINGLE', singleFt: 5000 },
      state: 'ACTIVE',
    })
    expect(useAppStore.getState().selectedKeypads).toEqual([])
  })

  test('sets mode to SELECT after creation', () => {
    selectKeypads(['23AF5'])
    useAppStore.getState().createAirspaceFromKeypads({
      callsign: 'HAWK01',
      altitude: { kind: 'SINGLE', singleFt: 5000 },
      state: 'ACTIVE',
    })
    expect(useAppStore.getState().mode).toBe('SELECT')
  })
})

// ─── createAirspaceFromPolygon ────────────────────────────────────────
describe('createAirspaceFromPolygon', () => {
  test('creates a FREEDRAW airspace from polygon', () => {
    const poly = polygonFromKeypads(['23AF5', '23AF6'])
    useAppStore.getState().createAirspaceFromPolygon({
      callsign: 'VIPER01',
      altitude: { kind: 'BLOCK', minFt: 3000, maxFt: 7000 },
      state: 'PLANNED',
      polygon: poly,
    })
    const st = useAppStore.getState()
    expect(st.airspaces).toHaveLength(1)
    expect(st.airspaces[0].kind).toBe('FREEDRAW')
    expect(st.airspaces[0].ownerCallsign).toBe('VIPER01')
    expect(st.airspaces[0].state).toBe('PLANNED')
  })
})

// ─── recomputeDerived ─────────────────────────────────────────────────
describe('recomputeDerived', () => {
  test('detects conflicts when airspaces share keypads and altitude', () => {
    createAirspace('A1', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    createAirspace('A2', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    const { conflicts } = useAppStore.getState()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].overlappingKeypads).toContain('23AF5')
  })

  test('no conflict when altitudes are separated', () => {
    createAirspace('A1', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    createAirspace('A2', ['23AF5'], { kind: 'SINGLE', singleFt: 20000 })
    expect(useAppStore.getState().conflicts).toHaveLength(0)
  })

  test('no conflict when keypads do not overlap', () => {
    createAirspace('A1', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    createAirspace('A2', ['22AG3'], { kind: 'SINGLE', singleFt: 5000 })
    expect(useAppStore.getState().conflicts).toHaveLength(0)
  })

  test('MARSA suppresses conflict', () => {
    createAirspace('A1', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    createAirspace('A2', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })

    // Set mutual MARSA
    const st = useAppStore.getState()
    const ac1 = st.aircraft.find(a => a.callsign === 'A1')!
    const ac2 = st.aircraft.find(a => a.callsign === 'A2')!
    useAppStore.getState().updateAircraft(ac1.id, { marsaWith: ['A2'] })
    useAppStore.getState().updateAircraft(ac2.id, { marsaWith: ['A1'] })
    useAppStore.getState().recomputeDerived()

    expect(useAppStore.getState().conflicts).toHaveLength(0)
  })

  test('assigns overlap groups for geographically overlapping airspaces', () => {
    createAirspace('A1', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    createAirspace('A2', ['23AF5'], { kind: 'SINGLE', singleFt: 20000 }) // no altitude conflict but same keypad
    const { overlapGroups } = useAppStore.getState()
    expect(overlapGroups.size).toBe(2)
  })
})

// ─── duplicateAirspace ────────────────────────────────────────────────
describe('duplicateAirspace', () => {
  test('creates a duplicate with "-duplicate" suffix in PLANNED state', () => {
    createAirspace('HAWK01', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    const id = useAppStore.getState().airspaces[0].id
    useAppStore.getState().duplicateAirspace(id)

    const st = useAppStore.getState()
    expect(st.airspaces).toHaveLength(2)
    const dup = st.airspaces.find(a => a.id !== id)!
    expect(dup.ownerCallsign).toBe('HAWK01-duplicate')
    expect(dup.state).toBe('PLANNED')
    expect(dup.keypads).toEqual(st.airspaces.find(a => a.id === id)?.keypads)
  })
})

// ─── archiveSelected ──────────────────────────────────────────────────
describe('archiveSelected', () => {
  test('archives selected airspace', () => {
    createAirspace('HAWK01', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    const id = useAppStore.getState().airspaces[0].id
    useAppStore.setState({ selectedId: { kind: 'AIRSPACE', id } })
    useAppStore.getState().archiveSelected()
    expect(useAppStore.getState().airspaces[0].state).toBe('ARCHIVED')
  })

  test('deletes selected shape', () => {
    useAppStore.getState().addShape({
      label: 'test',
      shapeType: 'POLYGON',
      tags: [],
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
    })
    const id = useAppStore.getState().shapes[0].id
    useAppStore.setState({ selectedId: { kind: 'SHAPE', id } })
    useAppStore.getState().archiveSelected()
    expect(useAppStore.getState().shapes).toHaveLength(0)
  })
})

// ─── startEditSelected ────────────────────────────────────────────────
describe('startEditSelected', () => {
  test('KEYPAD airspace enters EDIT_KEYPADS mode', () => {
    createAirspace('HAWK01', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    const id = useAppStore.getState().airspaces[0].id
    useAppStore.setState({ selectedId: { kind: 'AIRSPACE', id } })
    useAppStore.getState().startEditSelected()

    const st = useAppStore.getState()
    expect(st.editMode).toEqual({ kind: 'EDIT_KEYPADS', airspaceId: id })
    expect(st.mode).toBe('KEYPAD_SELECT')
  })

  test('FREEDRAW airspace enters REDRAW_GEOMETRY mode', () => {
    const poly = polygonFromKeypads(['23AF5'])
    useAppStore.getState().createAirspaceFromPolygon({
      callsign: 'V1',
      altitude: { kind: 'SINGLE', singleFt: 5000 },
      state: 'ACTIVE',
      polygon: poly,
    })
    const id = useAppStore.getState().airspaces[0].id
    useAppStore.setState({ selectedId: { kind: 'AIRSPACE', id } })
    useAppStore.getState().startEditSelected()

    const st = useAppStore.getState()
    expect(st.editMode).not.toBeNull()
    expect(st.editMode?.kind).toBe('REDRAW_GEOMETRY')
    expect(st.mode).toBe('FREEDRAW')
  })
})

// ─── toggleKeypad ─────────────────────────────────────────────────────
describe('toggleKeypad', () => {
  test('adds keypad to selection', () => {
    useAppStore.getState().toggleKeypad('23AF5')
    expect(useAppStore.getState().selectedKeypads).toEqual(['23AF5'])
  })

  test('removes keypad from selection on second toggle', () => {
    useAppStore.getState().toggleKeypad('23AF5')
    useAppStore.getState().toggleKeypad('23AF5')
    expect(useAppStore.getState().selectedKeypads).toEqual([])
  })

  test('accumulates multiple keypads', () => {
    useAppStore.getState().toggleKeypad('23AF5')
    useAppStore.getState().toggleKeypad('23AF6')
    expect(useAppStore.getState().selectedKeypads).toEqual(['23AF5', '23AF6'])
  })
})

// ─── addShape ─────────────────────────────────────────────────────────
describe('addShape', () => {
  test('adds a shape and derives keypads', () => {
    useAppStore.getState().addShape({
      label: 'Orbit Alpha',
      shapeType: 'POLYGON',
      tags: ['ROZ'],
      geometry: polygonFromKeypads(['23AF5', '23AF6', '23AF8', '23AF9']),
    })
    const st = useAppStore.getState()
    expect(st.shapes).toHaveLength(1)
    expect(st.shapes[0].label).toBe('Orbit Alpha')
    expect(st.shapes[0].derivedKeypads.length).toBeGreaterThan(0)
  })
})

// ─── deleteAirspace ───────────────────────────────────────────────────
describe('deleteAirspace', () => {
  test('permanently removes airspace', () => {
    createAirspace('HAWK01', ['23AF5'], { kind: 'SINGLE', singleFt: 5000 })
    const id = useAppStore.getState().airspaces[0].id
    useAppStore.getState().deleteAirspace(id)
    expect(useAppStore.getState().airspaces).toHaveLength(0)
  })
})
