export type LatLon = { lat: number; lon: number }

export type AircraftStatus = 'GROUND' | 'TRANSIT' | 'ESTABLISHED' | 'RTB' | 'SAFE' | 'ARCHIVED'

export type Aircraft = {
  id: string
  callsign: string
  type: string
  qty: number
  mode23: string
  status: AircraftStatus
  marsaWith: string[] // callsigns
  notes: string
}

export type Altitude =
  | { kind: 'SINGLE'; singleFt: number }
  | { kind: 'BLOCK'; minFt: number; maxFt: number }

export type AirspaceState = 'PLANNED' | 'ACTIVE' | 'COLD' | 'ARCHIVED'

export type AirspaceReservation = {
  id: string
  ownerCallsign: string
  name?: string
  kind: 'KEYPAD' | 'FREEDRAW'
  state: AirspaceState
  altitude: Altitude
  keypads: string[] // expanded keypad IDs like "23AF5"
  displayText?: string // original operator string when edited in table
  geometry: GeoJSON.Polygon
  showCold?: boolean // <--- NEW: toggles visibility for COLD state
  color?: string // <--- NEW: custom hex color
  showFill?: boolean // <--- NEW: toggles the transparent fill
  lineWidth?: number // <--- NEW: custom line thickness
}

export type FreeDrawShape = {
  id: string
  label: string
  shapeType: 'POLYGON' | 'ROUTE' | 'POINT'
  tags: string[] // e.g., ["ORBIT"], ["ROZ"]
  altitude?: Altitude // optional for ROZ-like areas
  geometry: GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point
  derivedKeypads: string[]
}

export type Route = {
  id: string
  ownerCallsign: string
  polyline: GeoJSON.LineString
  derivedKeypads: string[]
}

export type Scope =
  | { kind: 'AOR' }
  | { kind: 'KILLBOX'; killbox: string }
  | { kind: 'AREA'; areaId: string }

export type GridOptions = {
  showGrid: boolean
  gridOpacity: number // 0..1
  gridColor: string
  killboxLineWidth: number
  keypadLineWidth: number
  showKillboxLabels: boolean
  labelFontSize: number
  labelOpacity: number
}

export type LayerToggles = {
  basemap: boolean
  airspaces: boolean
  routes: boolean
  freedraw: boolean
  acms: boolean
  refs: boolean
}

export type ScenarioEvent = { timeZ: string; text: string }

export type Scenario = { startTimeZ: string; events: ScenarioEvent[] }
