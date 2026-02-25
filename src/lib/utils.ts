import type { Altitude, LatLon } from './types'

// Hoisted RegExp for hot-path parsing functions
const LAT_LON_RE = /^([NS])(\d{2}):([0-5]\d(?:\.\d+)?)\s+([EW])(\d{3}):([0-5]\d(?:\.\d+)?)$/
const TIME_Z_RE = /^(\d{2}):(\d{2}):(\d{2})Z$/

// Hoisted RegExp for parseKeypadString (avoid re-creation per call)
const ALL_MATCH_RE = /^(\d{2}[A-Z]{2})\s*\(all\)$/i
const ALL_MATCH_RE2 = /^(\d{2}[A-Z]{2})\s*\(all\)\s*$/i
const KB_DIGITS_RE = /^(\d{2}[A-Z]{2})([1-9]+)$/i
const SINGLE_KP_RE = /^(\d{2}[A-Z]{2}[1-9])$/i
const KB_ONLY_RE = /^(\d{2}[A-Z]{2})$/i

export const AOR = {
  // N01:18.00 E121:08.00 etc
  nw: { lat: 1 + 18 / 60, lon: 121 + 8 / 60 },
  ne: { lat: 1 + 18 / 60, lon: 123 + 8 / 60 },
  sw: { lat: -(0 + 12 / 60), lon: 121 + 8 / 60 },
  se: { lat: -(0 + 12 / 60), lon: 123 + 8 / 60 },
}

// Killbox grid layout
export const KILLBOX_ROWS = ['23', '22', '21'] // north to south
export const KILLBOX_COLS = ['AF', 'AG', 'AH', 'AI'] // west to east

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

export function parseLatLon(s: string): LatLon | null {
  // Example: N00:33.00 E121:33.00
  // Accepts N/S and E/W with DD:MM.MM
  const m = s.trim().match(LAT_LON_RE)
  if (!m) return null
  const latDeg = parseInt(m[2], 10)
  const latMin = parseFloat(m[3])
  const lonDeg = parseInt(m[5], 10)
  const lonMin = parseFloat(m[6])
  let lat = latDeg + latMin / 60
  let lon = lonDeg + lonMin / 60
  if (m[1] === 'S') lat *= -1
  if (m[4] === 'W') lon *= -1
  return { lat, lon }
}

export function toHHMMSS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function parseTimeZ(t: string): number {
  // "13:05:00Z" -> seconds from midnight
  const m = t.trim().match(TIME_Z_RE)
  if (!m) return 0
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
}

export function fmtAlt(a: Altitude): string {
  if (a.kind === 'SINGLE') return `${a.singleFt}`
  return `${a.minFt}-${a.maxFt}`
}

export function altitudeConflicts(a: Altitude, b: Altitude): boolean {
  // Consistent rule: Single alt conflicts if |a-b| < 1000.
  // Block conflicts if any single within block OR block overlap.
  if (a.kind === 'SINGLE' && b.kind === 'SINGLE') {
    return Math.abs(a.singleFt - b.singleFt) < 1000
  }
  const aMin = a.kind === 'SINGLE' ? a.singleFt : a.minFt
  const aMax = a.kind === 'SINGLE' ? a.singleFt : a.maxFt
  const bMin = b.kind === 'SINGLE' ? b.singleFt : b.minFt
  const bMax = b.kind === 'SINGLE' ? b.singleFt : b.maxFt
  // If either is block, any overlap counts as conflict.
  const overlap = Math.max(aMin, bMin) <= Math.min(aMax, bMax)
  return overlap
}

/**
 * Grid math
 * Treat AOR as flat rectangle in lat/lon.
 * 3 killbox rows x 4 cols; each killbox 3x3 keypads.
 */
function aorToFrac(p: LatLon) {
  // fraction across AOR: x 0..1 west->east, y 0..1 south->north
  const x = (p.lon - AOR.sw.lon) / (AOR.se.lon - AOR.sw.lon)
  const y = (p.lat - AOR.sw.lat) / (AOR.nw.lat - AOR.sw.lat)
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
}

export function fracToLatLon(x: number, y: number): LatLon {
  const lon = AOR.sw.lon + x * (AOR.se.lon - AOR.sw.lon)
  const lat = AOR.sw.lat + y * (AOR.nw.lat - AOR.sw.lat)
  return { lat, lon }
}

export function killboxFromLatLon(p: LatLon): string | null {
  const f = aorToFrac(p)
  const col = clamp(Math.floor(f.x * 4), 0, 3)
  const rowFromSouth = clamp(Math.floor(f.y * 3), 0, 2)
  const row = 2 - rowFromSouth // convert to north->south index
  return `${KILLBOX_ROWS[row]}${KILLBOX_COLS[col]}`
}

export function keypadFromLatLon(p: LatLon): string | null {
  const f = aorToFrac(p)
  const col = clamp(Math.floor(f.x * 12), 0, 11) // 4 killboxes * 3 keypads
  const rowFromSouth = clamp(Math.floor(f.y * 9), 0, 8) // 3 killboxes * 3 keypads
  const row = 8 - rowFromSouth // north->south
  const killboxCol = Math.floor(col / 3)
  const killboxRow = Math.floor(row / 3)
  const withinCol = col % 3 // 0..2 west->east
  const withinRow = row % 3 // 0..2 north->south
  const kill = `${KILLBOX_ROWS[killboxRow]}${KILLBOX_COLS[killboxCol]}`
  const keypadNumber = keypadNumberFromWithin(withinRow, withinCol)
  return `${kill}${keypadNumber}`
}

function keypadNumberFromWithin(r: number, c: number): number {
  // r: 0..2 (north->south), c: 0..2 (west->east)
  const grid = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]
  return grid[r][c]
}

// Module-level cache for keypadPolygon — only 108 possible keypads, pure function (fix 3.3)
const keypadPolyCache = new Map<string, GeoJSON.Polygon | null>()

export function keypadPolygon(keypadId: string): GeoJSON.Polygon | null {
  const cached = keypadPolyCache.get(keypadId)
  if (cached !== undefined) return cached

  // keypadId like "23AF6"
  const m = keypadId.match(/^(\d{2})([A-Z]{2})([1-9])$/)
  if (!m) {
    keypadPolyCache.set(keypadId, null)
    return null
  }
  const killNum = m[1]
  const killLet = m[2]
  const kp = parseInt(m[3], 10)

  const row = KILLBOX_ROWS.indexOf(killNum)
  const col = KILLBOX_COLS.indexOf(killLet)
  if (row < 0 || col < 0) {
    keypadPolyCache.set(keypadId, null)
    return null
  }

  const within = withinFromKeypad(kp)
  const totalCols = 12
  const totalRows = 9
  const globalColStart = col * 3 + within.c
  const globalRowStart = row * 3 + within.r

  const x0 = globalColStart / totalCols
  const x1 = (globalColStart + 1) / totalCols
  const y0 = 1 - (globalRowStart + 1) / totalRows
  const y1 = 1 - globalRowStart / totalRows

  const p00 = fracToLatLon(x0, y0)
  const p10 = fracToLatLon(x1, y0)
  const p11 = fracToLatLon(x1, y1)
  const p01 = fracToLatLon(x0, y1)

  const result: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [p00.lon, p00.lat],
        [p10.lon, p10.lat],
        [p11.lon, p11.lat],
        [p01.lon, p01.lat],
        [p00.lon, p00.lat],
      ],
    ],
  }
  keypadPolyCache.set(keypadId, result)
  return result
}

function withinFromKeypad(kp: number): { r: number; c: number } {
  // returns within killbox r/c: 0..2
  const map: Record<number, { r: number; c: number }> = {
    1: { r: 0, c: 0 },
    2: { r: 0, c: 1 },
    3: { r: 0, c: 2 },
    4: { r: 1, c: 0 },
    5: { r: 1, c: 1 },
    6: { r: 1, c: 2 },
    7: { r: 2, c: 0 },
    8: { r: 2, c: 1 },
    9: { r: 2, c: 2 },
  }
  return map[kp]
}

export function allKeypadsInKillbox(killbox: string): string[] {
  const m = killbox.match(/^(\d{2})([A-Z]{2})$/)
  if (!m) return []
  const out: string[] = []
  for (let i = 1; i <= 9; i++) out.push(`${killbox}${i}`)
  return out
}

// Very small point-in-polygon for keypad-center sampling
export function pointInPoly(point: [number, number], poly: GeoJSON.Polygon): boolean {
  const [x, y] = point
  const ring = poly.coordinates[0]
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1]
    const xj = ring[j][0],
      yj = ring[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function centroid(poly: GeoJSON.Polygon): [number, number] {
  const pts = poly.coordinates[0]
  let x = 0,
    y = 0
  for (const p of pts) {
    x += p[0]
    y += p[1]
  }
  return [x / pts.length, y / pts.length]
}

export function deriveKeypadsFromPolygon(poly: GeoJSON.Polygon): string[] {
  // Approx: keypad is included if its center point is inside polygon.
  const out: string[] = []
  for (const kbNum of KILLBOX_ROWS) {
    for (const kbLet of KILLBOX_COLS) {
      const kb = `${kbNum}${kbLet}`
      for (let i = 1; i <= 9; i++) {
        const id = `${kb}${i}`
        const kpPoly = keypadPolygon(id)
        if (!kpPoly) continue
        const c = centroid(kpPoly)
        if (pointInPoly(c, poly)) out.push(id)
      }
    }
  }
  return out
}

export function deriveKeypadsFromLine(line: GeoJSON.LineString): string[] {
  // sample along line
  const out = new Set<string>()
  const coords = line.coordinates
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i],
      b = coords[i + 1]
    const steps = 12
    for (let t = 0; t <= steps; t++) {
      const x = a[0] + (b[0] - a[0]) * (t / steps)
      const y = a[1] + (b[1] - a[1]) * (t / steps)
      const kp = keypadFromLatLon({ lat: y, lon: x })
      if (kp) out.add(kp)
    }
  }
  return Array.from(out)
}

export function deriveKeypadsFromPoint(pt: GeoJSON.Point): string[] {
  const [x, y] = pt.coordinates
  const kp = keypadFromLatLon({ lat: y, lon: x })
  return kp ? [kp] : []
}

export type ParseKeypadResult = {
  ok: boolean
  keypads: string[]
  displayText: string
  warning?: string
}

export function parseKeypadString(input: string): ParseKeypadResult {
  const raw = input.trim()
  if (!raw) return { ok: false, keypads: [], displayText: raw, warning: 'Empty' }

  const low = raw.toLowerCase()
  if (
    low.includes('boundary') ||
    low.includes('south half') ||
    low.includes('north half') ||
    low.includes('vicinity')
  ) {
    return {
      ok: false,
      keypads: [],
      displayText: raw,
      warning: 'Ambiguous text (boundary/half/vicinity). Edit to explicit keypads.',
    }
  }

  // Normalize separators: +, comma
  const parts = raw
    .split(/\+|,/)
    .map(s => s.trim())
    .filter(Boolean)
  const out: string[] = []
  let warned: string | undefined

  for (const p of parts) {
    // Handle "(all)" e.g. "23AG (all)" or "23AG(all)"
    const allMatch = p.match(ALL_MATCH_RE) || p.match(ALL_MATCH_RE2)
    if (allMatch) {
      out.push(...allKeypadsInKillbox(allMatch[1].toUpperCase()))
      continue
    }

    // Handle killbox + digits cluster e.g. 23AG89, 22AF124578
    const m = p.match(KB_DIGITS_RE)
    if (m) {
      const kb = m[1].toUpperCase()
      const digits = m[2].split('')
      for (const d of digits) out.push(`${kb}${d}`)
      continue
    }

    // Handle explicit single keypad like 23AF5
    const m2 = p.match(SINGLE_KP_RE)
    if (m2) {
      out.push(m2[1].toUpperCase())
      continue
    }

    // Handle killbox alone -> treat as ambiguous unless "(all)"
    const kbOnly = p.match(KB_ONLY_RE)
    if (kbOnly) {
      warned =
        warned || 'Killbox without (all) is ambiguous. Use e.g. "23AG (all)" or specify digits.'
      continue
    }

    warned = warned || `Unparsed segment: "${p}"`
  }

  const uniq = Array.from(new Set(out))
  const ok = uniq.length > 0
  return { ok, keypads: uniq, displayText: raw, warning: warned }
}

export function polygonFromKeypads(keypads: string[]): GeoJSON.Polygon {
  // For display, create a multipolygon-ish union is complex; instead, create convex-ish hull rectangle around all keypad polygons.
  // This is fine for a prototype: it still highlights area.
  const boxes: { minX: number; minY: number; maxX: number; maxY: number }[] = []
  for (const k of keypads) {
    const poly = keypadPolygon(k)
    if (!poly) continue
    const coords = poly.coordinates[0]
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const [x, y] of coords) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    boxes.push({ minX, minY, maxX, maxY })
  }
  if (boxes.length === 0) {
    const p = fracToLatLon(0.5, 0.5)
    return {
      type: 'Polygon',
      coordinates: [
        [
          [p.lon, p.lat],
          [p.lon, p.lat],
          [p.lon, p.lat],
          [p.lon, p.lat],
          [p.lon, p.lat],
        ],
      ],
    }
  }
  // Single pass for bounding box (rule 7.6: combine iterations)
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX
    if (b.minY < minY) minY = b.minY
    if (b.maxX > maxX) maxX = b.maxX
    if (b.maxY > maxY) maxY = b.maxY
  }
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  }
}
