import { create } from 'zustand'
import { SCENARIO } from './lib/scenario'
import type {
  Aircraft,
  AirspaceReservation,
  Altitude,
  FreeDrawShape,
  GridOptions,
  LayerToggles,
  Scenario,
  Scope,
} from './lib/types'
import {
  altitudeConflicts,
  deriveKeypadsFromLine,
  deriveKeypadsFromPoint,
  deriveKeypadsFromPolygon,
  parseKeypadString,
  polygonFromKeypads,
  uid,
} from './lib/utils'

export type Mode = 'SELECT' | 'KEYPAD_SELECT' | 'FREEDRAW'
export type DrawType = 'POLYGON' | 'ROUTE' | 'POINT'
export type EditMode =
  | null
  | { kind: 'EDIT_KEYPADS'; airspaceId: string }
  | {
      kind: 'REDRAW_GEOMETRY'
      targetType: 'AIRSPACE' | 'SHAPE'
      targetId: string
      drawType: 'POLYGON' | 'ROUTE' | 'POINT'
    }

export type HoverInfo =
  | { kind: 'NONE' }
  | { kind: 'KEYPAD'; keypadId: string }
  | { kind: 'REF'; label: string; keypadId: string }
  | { kind: 'AIRSPACE'; airspaceId: string }
  | { kind: 'SHAPE'; shapeId: string }

export type Conflict = { aId: string; bId: string; reason: string; overlappingKeypads: string[] }

export type PendingDrawResult = {
  drawType: 'POLYGON' | 'ROUTE' | 'POINT'
  coords: [number, number][]
} | null
export type PendingKeypadResult = { keypads: string[] } | null

type AppState = {
  // data
  aircraft: Aircraft[]
  airspaces: AirspaceReservation[]
  shapes: FreeDrawShape[]
  scenario: Scenario
  handledEventIds: Record<string, boolean>

  // ui
  mode: Mode
  drawType: DrawType
  selectedKeypads: string[]
  selectedId: { kind: 'AIRSPACE' | 'SHAPE' | 'AIRCRAFT' | null; id?: string }
  editMode: EditMode
  hover: HoverInfo
  scope: Scope
  activeTab: 'ACTIVE' | 'PLANNED' | 'ARCHIVED'
  layerToggles: LayerToggles
  gridOptions: GridOptions
  picassoMode: boolean
  picassoRadius: number // 4..16 px

  // scenario time (seconds from midnight)
  currentTimeSec: number

  // derived
  conflicts: Conflict[]
  overlapGroups: Map<string, number> // airspaceId -> offset slot (0-7)

  // pending results from map interactions (replaces CustomEvent bus)
  pendingDrawResult: PendingDrawResult
  pendingKeypadResult: PendingKeypadResult

  // actions
  setMode: (m: Mode) => void
  setDrawType: (t: DrawType) => void
  setHover: (h: HoverInfo) => void
  setScope: (s: Scope) => void
  setActiveTab: (t: AppState['activeTab']) => void
  setLayerToggle: (k: keyof LayerToggles, v: boolean) => void
  setGridOptions: (p: Partial<GridOptions>) => void
  togglePicassoMode: () => void
  setPicassoRadius: (r: number) => void

  toggleKeypad: (id: string) => void
  clearKeypads: () => void

  selectAirspace: (id: string) => void
  selectShape: (id: string) => void
  clearSelection: () => void

  startEditSelected: () => void
  cancelEdit: () => void

  createAirspaceFromKeypads: (payload: {
    callsign: string
    altitude: Altitude
    state: AirspaceReservation['state']
    displayText?: string
  }) => void
  createAirspaceFromPolygon: (payload: {
    callsign: string
    altitude: Altitude
    state: AirspaceReservation['state']
    polygon: GeoJSON.Polygon
    displayText?: string
  }) => void

  updateAirspace: (id: string, patch: Partial<Omit<AirspaceReservation, 'id'>>) => void
  updateAirspaceKeypadString: (id: string, keypadText: string) => { ok: boolean; warning?: string }
  archiveSelected: () => void
  deleteAirspace: (id: string) => void

  duplicateAirspace: (id: string) => void

  upsertAircraft: (callsign: string, patch?: Partial<Aircraft>) => void
  updateAircraft: (id: string, patch: Partial<Aircraft>) => void

  addShape: (shape: Omit<FreeDrawShape, 'id' | 'derivedKeypads'>) => void
  updateShapeGeometry: (id: string, geometry: FreeDrawShape['geometry']) => void
  deleteShape: (id: string) => void

  setCurrentTimeSec: (sec: number) => void
  toggleHandled: (eventKey: string) => void

  submitDrawResult: (r: NonNullable<PendingDrawResult>) => void
  submitKeypadResult: (r: NonNullable<PendingKeypadResult>) => void
  clearPendingDraw: () => void
  clearPendingKeypad: () => void

  recomputeDerived: () => void
}

function defaultGridOptions(): GridOptions {
  return {
    showGrid: true,
    gridOpacity: 0.85,
    gridColor: '#ffffff',
    killboxLineWidth: 3,
    keypadLineWidth: 1,
    showKillboxLabels: true,
    labelFontSize: 14,
    labelOpacity: 0.9,
  }
}

function defaultLayers(): LayerToggles {
  return { basemap: true, airspaces: true, routes: true, freedraw: true, acms: false, refs: true }
}

export const useAppStore = create<AppState>((set, get) => ({
  aircraft: [],
  airspaces: [],
  shapes: [],
  scenario: SCENARIO,
  handledEventIds: {},

  mode: 'SELECT',
  drawType: 'POLYGON',
  selectedKeypads: [],
  selectedId: { kind: null },
  editMode: null,
  hover: { kind: 'NONE' },
  scope: { kind: 'AOR' },
  activeTab: 'ACTIVE',
  layerToggles: defaultLayers(),
  gridOptions: defaultGridOptions(),
  currentTimeSec: 13 * 3600,
  picassoMode: false,
  picassoRadius: 8,
  conflicts: [],
  overlapGroups: new Map(),
  pendingDrawResult: null,
  pendingKeypadResult: null,

  setMode: m => set({ mode: m }),
  setDrawType: t => set({ drawType: t }),
  setHover: h => set({ hover: h }),
  setScope: s => set({ scope: s }),
  setActiveTab: t => set({ activeTab: t }),
  setLayerToggle: (k, v) => set({ layerToggles: { ...get().layerToggles, [k]: v } }),
  setGridOptions: p => set({ gridOptions: { ...get().gridOptions, ...p } }),
  togglePicassoMode: () => set(st => ({ picassoMode: !st.picassoMode })),
  setPicassoRadius: r => set({ picassoRadius: r }),

  toggleKeypad: id =>
    set(st => {
      const exists = st.selectedKeypads.includes(id)
      const selectedKeypads = exists
        ? st.selectedKeypads.filter(k => k !== id)
        : [...st.selectedKeypads, id]
      return { selectedKeypads }
    }),
  clearKeypads: () => set({ selectedKeypads: [] }),

  selectAirspace: id => set({ selectedId: { kind: 'AIRSPACE', id } }),
  selectShape: id => set({ selectedId: { kind: 'SHAPE', id } }),
  clearSelection: () => set({ selectedId: { kind: null } }),

  startEditSelected: () => {
    const sel = get().selectedId
    if (sel.kind === 'AIRSPACE' && sel.id) {
      const a = get().airspaces.find(x => x.id === sel.id)
      if (!a) return
      if (a.kind === 'KEYPAD')
        set({ editMode: { kind: 'EDIT_KEYPADS', airspaceId: a.id }, mode: 'KEYPAD_SELECT' })
      else
        set({
          editMode: {
            kind: 'REDRAW_GEOMETRY',
            targetType: 'AIRSPACE',
            targetId: a.id,
            drawType: 'POLYGON',
          },
          mode: 'FREEDRAW',
          drawType: 'POLYGON',
        })
    } else if (sel.kind === 'SHAPE' && sel.id) {
      const s = get().shapes.find(x => x.id === sel.id)
      if (!s) return
      const drawType = s.shapeType
      set({
        editMode: { kind: 'REDRAW_GEOMETRY', targetType: 'SHAPE', targetId: s.id, drawType },
        mode: 'FREEDRAW',
        drawType,
      })
    }
  },
  cancelEdit: () => set({ editMode: null, mode: 'SELECT' }),

  createAirspaceFromKeypads: ({ callsign, altitude, state, displayText }) => {
    const keypads = get().selectedKeypads.toSorted()
    const geometry = polygonFromKeypads(keypads)
    const id = uid('as')
    const a: AirspaceReservation = {
      id,
      ownerCallsign: callsign,
      kind: 'KEYPAD',
      state,
      altitude,
      keypads,
      displayText: displayText ?? keypads.join(''),
      geometry,
    }
    set(st => ({
      airspaces: [a, ...st.airspaces],
      selectedKeypads: [],
      selectedId: { kind: 'AIRSPACE', id },
      mode: 'SELECT',
    }))
    get().upsertAircraft(callsign)
    get().recomputeDerived()
  },

  createAirspaceFromPolygon: ({ callsign, altitude, state, polygon, displayText }) => {
    const keypads = deriveKeypadsFromPolygon(polygon).toSorted()
    const id = uid('as')
    const a: AirspaceReservation = {
      id,
      ownerCallsign: callsign,
      kind: 'FREEDRAW',
      state,
      altitude,
      keypads,
      displayText,
      geometry: polygon,
    }
    set(st => ({
      airspaces: [a, ...st.airspaces],
      selectedId: { kind: 'AIRSPACE', id },
      mode: 'SELECT',
    }))
    get().upsertAircraft(callsign)
    get().recomputeDerived()
  },

  updateAirspace: (id, patch) => {
    set(st => ({ airspaces: st.airspaces.map(a => (a.id === id ? { ...a, ...patch } : a)) }))
    get().recomputeDerived()
  },

  updateAirspaceKeypadString: (id, keypadText) => {
    const res = parseKeypadString(keypadText)
    if (!res.ok) return { ok: false, warning: res.warning }
    const geometry = polygonFromKeypads(res.keypads)
    set(st => ({
      airspaces: st.airspaces.map(a =>
        a.id === id
          ? { ...a, keypads: res.keypads, displayText: res.displayText, geometry, kind: 'KEYPAD' }
          : a,
      ),
    }))
    get().recomputeDerived()
    return { ok: true, warning: res.warning }
  },

  archiveSelected: () => {
    const sel = get().selectedId
    if (sel.kind === 'AIRSPACE' && sel.id) {
      set(st => ({
        airspaces: st.airspaces.map(a => (a.id === sel.id ? { ...a, state: 'ARCHIVED' } : a)),
      }))
      get().recomputeDerived()
    }
    if (sel.kind === 'SHAPE' && sel.id) {
      set(st => ({ shapes: st.shapes.filter(s => s.id !== sel.id) }))
      get().recomputeDerived()
    }
  },

  deleteAirspace: id => {
    set(st => ({ airspaces: st.airspaces.filter(a => a.id !== id) }))
    get().recomputeDerived()
  },

  duplicateAirspace: id => {
    const src = get().airspaces.find(a => a.id === id)
    if (!src) return
    const newId = uid('as')
    const callsign = `${src.ownerCallsign}-duplicate`
    const dup: AirspaceReservation = {
      ...src,
      id: newId,
      ownerCallsign: callsign,
      name: src.name ? `${src.name}-duplicate` : undefined,
      state: 'PLANNED',
    }
    set(st => ({ airspaces: [dup, ...st.airspaces], selectedId: { kind: 'AIRSPACE', id: newId } }))
    get().upsertAircraft(callsign)
    get().recomputeDerived()
  },

  upsertAircraft: (callsign, patch) => {
    set(st => {
      const existing = st.aircraft.find(a => a.callsign === callsign)
      if (existing) {
        return {
          aircraft: st.aircraft.map(a => (a.callsign === callsign ? { ...a, ...patch } : a)),
        }
      }
      const a: Aircraft = {
        id: uid('ac'),
        callsign,
        type: patch?.type ?? '',
        qty: patch?.qty ?? 1,
        mode23: patch?.mode23 ?? '',
        status: patch?.status ?? 'GROUND',
        marsaWith: patch?.marsaWith ?? [],
        notes: patch?.notes ?? '',
      }
      return { aircraft: [a, ...st.aircraft] }
    })
  },

  updateAircraft: (id, patch) =>
    set(st => ({ aircraft: st.aircraft.map(a => (a.id === id ? { ...a, ...patch } : a)) })),

  addShape: shape => {
    const id = uid('sh')
    const derivedKeypads =
      shape.shapeType === 'POLYGON'
        ? deriveKeypadsFromPolygon(shape.geometry as GeoJSON.Polygon)
        : shape.shapeType === 'ROUTE'
          ? deriveKeypadsFromLine(shape.geometry as GeoJSON.LineString)
          : deriveKeypadsFromPoint(shape.geometry as GeoJSON.Point)

    const sh: FreeDrawShape = { id, ...shape, derivedKeypads }
    set(st => ({ shapes: [sh, ...st.shapes], selectedId: { kind: 'SHAPE', id }, mode: 'SELECT' }))
    get().recomputeDerived()
  },

  updateShapeGeometry: (id, geometry) => {
    set(st => ({
      shapes: st.shapes.map(s => {
        if (s.id !== id) return s
        const derivedKeypads =
          s.shapeType === 'POLYGON'
            ? deriveKeypadsFromPolygon(geometry as GeoJSON.Polygon)
            : s.shapeType === 'ROUTE'
              ? deriveKeypadsFromLine(geometry as GeoJSON.LineString)
              : deriveKeypadsFromPoint(geometry as GeoJSON.Point)
        return { ...s, geometry, derivedKeypads }
      }),
    }))
    get().recomputeDerived()
  },

  deleteShape: id => set(st => ({ shapes: st.shapes.filter(s => s.id !== id) })),

  setCurrentTimeSec: sec => set({ currentTimeSec: sec }),
  toggleHandled: eventKey =>
    set(st => ({
      handledEventIds: { ...st.handledEventIds, [eventKey]: !st.handledEventIds[eventKey] },
    })),

  submitDrawResult: r => set({ pendingDrawResult: r }),
  submitKeypadResult: r => set({ pendingKeypadResult: r }),
  clearPendingDraw: () => set({ pendingDrawResult: null }),
  clearPendingKeypad: () => set({ pendingKeypadResult: null }),

  recomputeDerived: () => {
    const { airspaces, aircraft } = get()
    const conflicts: Conflict[] = []
    const relevant = airspaces.filter(a => a.state !== 'ARCHIVED')

    // Build callsign→Aircraft index once (fix 7b)
    const acByCallsign = new Map<string, Aircraft>()
    for (const ac of aircraft) acByCallsign.set(ac.callsign, ac)

    // Adjacency for overlap groups (geographic overlap regardless of altitude)
    const adjacency = new Map<string, Set<string>>()
    for (const a of relevant) adjacency.set(a.id, new Set())

    for (let i = 0; i < relevant.length; i++) {
      for (let j = i + 1; j < relevant.length; j++) {
        const A = relevant[i],
          B = relevant[j]

        // Use Set for O(n) overlap check instead of O(n*m) (fix 7a)
        const bSet = new Set(B.keypads)
        const overlap = A.keypads.filter(k => bSet.has(k))
        if (overlap.length === 0) continue

        // Track geographic overlap for picasso mode (altitude-independent)
        adjacency.get(A.id)!.add(B.id)
        adjacency.get(B.id)!.add(A.id)

        if (!altitudeConflicts(A.altitude, B.altitude)) continue

        // MARSA suppression only if both owners are aircraft and MARSA set between them
        const aAc = acByCallsign.get(A.ownerCallsign)
        const bAc = acByCallsign.get(B.ownerCallsign)
        const marsa = !!(
          aAc &&
          bAc &&
          aAc.marsaWith.includes(bAc.callsign) &&
          bAc.marsaWith.includes(aAc.callsign)
        )
        if (marsa) continue

        conflicts.push({
          aId: A.id,
          bId: B.id,
          reason: 'Keypad overlap + altitude conflict (<1000ft or block overlap)',
          overlappingKeypads: overlap,
        })
      }
    }

    // BFS to find connected overlap components and assign slots
    const overlapGroups = new Map<string, number>()
    const visited = new Set<string>()

    for (const a of relevant) {
      if (visited.has(a.id)) continue
      const neighbors = adjacency.get(a.id)!
      if (neighbors.size === 0) {
        overlapGroups.set(a.id, 0)
        visited.add(a.id)
        continue
      }

      // BFS connected component
      const component: string[] = []
      const queue: string[] = [a.id]
      visited.add(a.id)
      while (queue.length > 0) {
        const current = queue.shift()!
        component.push(current)
        for (const neighbor of adjacency.get(current)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }

      // Assign deterministic slots sorted by ID for stability
      component.sort()
      for (let idx = 0; idx < component.length; idx++) {
        overlapGroups.set(component[idx], idx % 8)
      }
    }

    // Reuse existing Map reference if entries are identical (Rule 1.4: avoid unnecessary subscriber notifications)
    const existing = get().overlapGroups
    let groupsChanged = existing.size !== overlapGroups.size
    if (!groupsChanged) {
      for (const [id, slot] of overlapGroups) {
        if (existing.get(id) !== slot) {
          groupsChanged = true
          break
        }
      }
    }
    set({ conflicts, overlapGroups: groupsChanged ? overlapGroups : existing })
  },
}))
