import { describe, expect, test } from 'bun:test'
import type { Altitude } from '@/lib/types'
import {
  AOR,
  allKeypadsInKillbox,
  altitudeConflicts,
  centroid,
  clamp,
  deriveKeypadsFromLine,
  deriveKeypadsFromPoint,
  deriveKeypadsFromPolygon,
  fmtAlt,
  KILLBOX_COLS,
  KILLBOX_ROWS,
  keypadFromLatLon,
  keypadPolygon,
  killboxFromLatLon,
  parseKeypadString,
  parseLatLon,
  parseTimeZ,
  pointInPoly,
  polygonFromKeypads,
  toHHMMSS,
  uid,
} from '@/lib/utils'

// ─── clamp ────────────────────────────────────────────────────────────
describe('clamp', () => {
  test('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  test('clamps to min', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })
  test('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
  test('returns boundary when exactly at min/max', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

// ─── uid ──────────────────────────────────────────────────────────────
describe('uid', () => {
  test('starts with prefix', () => {
    expect(uid('foo').startsWith('foo_')).toBe(true)
  })
  test('generates unique values', () => {
    const a = uid()
    const b = uid()
    expect(a).not.toBe(b)
  })
  test('uses default prefix "id"', () => {
    expect(uid().startsWith('id_')).toBe(true)
  })
})

// ─── parseLatLon ──────────────────────────────────────────────────────
describe('parseLatLon', () => {
  test('parses N/E coordinate', () => {
    const result = parseLatLon('N00:33.00 E121:33.00')
    expect(result).not.toBeNull()
    expect(result?.lat).toBeCloseTo(0 + 33 / 60, 6)
    expect(result?.lon).toBeCloseTo(121 + 33 / 60, 6)
  })
  test('parses S/W coordinate', () => {
    const result = parseLatLon('S00:12.00 W001:08.00')
    expect(result).not.toBeNull()
    expect(result?.lat).toBeCloseTo(-(0 + 12 / 60), 6)
    expect(result?.lon).toBeCloseTo(-(1 + 8 / 60), 6)
  })
  test('returns null for invalid input', () => {
    expect(parseLatLon('invalid')).toBeNull()
    expect(parseLatLon('')).toBeNull()
  })
  test('trims whitespace', () => {
    const result = parseLatLon('  N01:00.00 E122:00.00  ')
    expect(result).not.toBeNull()
    expect(result?.lat).toBeCloseTo(1, 4)
    expect(result?.lon).toBeCloseTo(122, 4)
  })
})

// ─── toHHMMSS / parseTimeZ roundtrip ─────────────────────────────────
describe('toHHMMSS / parseTimeZ', () => {
  test('formats zero seconds', () => {
    expect(toHHMMSS(0)).toBe('00:00:00')
  })
  test('formats arbitrary seconds', () => {
    expect(toHHMMSS(3661)).toBe('01:01:01')
  })
  test('parses time string to seconds', () => {
    expect(parseTimeZ('13:05:00Z')).toBe(13 * 3600 + 5 * 60)
  })
  test('returns 0 for invalid time', () => {
    expect(parseTimeZ('invalid')).toBe(0)
  })
  test('roundtrips correctly', () => {
    const seconds = 13 * 3600 + 5 * 60 + 30
    const formatted = `${toHHMMSS(seconds)}Z`
    expect(parseTimeZ(formatted)).toBe(seconds)
  })
})

// ─── fmtAlt ───────────────────────────────────────────────────────────
describe('fmtAlt', () => {
  test('formats single altitude', () => {
    expect(fmtAlt({ kind: 'SINGLE', singleFt: 5000 })).toBe('5000')
  })
  test('formats block altitude', () => {
    expect(fmtAlt({ kind: 'BLOCK', minFt: 3000, maxFt: 7000 })).toBe('3000-7000')
  })
})

// ─── altitudeConflicts ────────────────────────────────────────────────
describe('altitudeConflicts', () => {
  test('single vs single: same altitude conflicts', () => {
    const a: Altitude = { kind: 'SINGLE', singleFt: 5000 }
    const b: Altitude = { kind: 'SINGLE', singleFt: 5000 }
    expect(altitudeConflicts(a, b)).toBe(true)
  })
  test('single vs single: 999ft apart conflicts', () => {
    const a: Altitude = { kind: 'SINGLE', singleFt: 5000 }
    const b: Altitude = { kind: 'SINGLE', singleFt: 5999 }
    expect(altitudeConflicts(a, b)).toBe(true)
  })
  test('single vs single: 1000ft apart does NOT conflict', () => {
    const a: Altitude = { kind: 'SINGLE', singleFt: 5000 }
    const b: Altitude = { kind: 'SINGLE', singleFt: 6000 }
    expect(altitudeConflicts(a, b)).toBe(false)
  })
  test('block vs block: overlapping conflicts', () => {
    const a: Altitude = { kind: 'BLOCK', minFt: 3000, maxFt: 7000 }
    const b: Altitude = { kind: 'BLOCK', minFt: 5000, maxFt: 9000 }
    expect(altitudeConflicts(a, b)).toBe(true)
  })
  test('block vs block: non-overlapping does NOT conflict', () => {
    const a: Altitude = { kind: 'BLOCK', minFt: 3000, maxFt: 5000 }
    const b: Altitude = { kind: 'BLOCK', minFt: 5001, maxFt: 9000 }
    expect(altitudeConflicts(a, b)).toBe(false)
  })
  test('single vs block: inside block conflicts', () => {
    const a: Altitude = { kind: 'SINGLE', singleFt: 5000 }
    const b: Altitude = { kind: 'BLOCK', minFt: 3000, maxFt: 7000 }
    expect(altitudeConflicts(a, b)).toBe(true)
  })
  test('single vs block: outside block does NOT conflict', () => {
    const a: Altitude = { kind: 'SINGLE', singleFt: 2000 }
    const b: Altitude = { kind: 'BLOCK', minFt: 3000, maxFt: 7000 }
    expect(altitudeConflicts(a, b)).toBe(false)
  })
  test('block vs block: sharing exact boundary conflicts', () => {
    const a: Altitude = { kind: 'BLOCK', minFt: 3000, maxFt: 5000 }
    const b: Altitude = { kind: 'BLOCK', minFt: 5000, maxFt: 9000 }
    expect(altitudeConflicts(a, b)).toBe(true)
  })
})

// ─── Grid math: killboxFromLatLon / keypadFromLatLon ──────────────────
describe('killboxFromLatLon', () => {
  test('NW corner is 23AF', () => {
    expect(killboxFromLatLon(AOR.nw)).toBe('23AF')
  })
  test('center of AOR resolves', () => {
    const center = {
      lat: (AOR.nw.lat + AOR.sw.lat) / 2,
      lon: (AOR.nw.lon + AOR.ne.lon) / 2,
    }
    const kb = killboxFromLatLon(center)
    expect(kb).not.toBeNull()
    expect(KILLBOX_ROWS).toContain(kb?.slice(0, 2))
    expect(KILLBOX_COLS).toContain(kb?.slice(2, 4))
  })
})

describe('keypadFromLatLon', () => {
  test('NW corner resolves to a keypad in 23AF', () => {
    // Slightly inside from the exact corner
    const p = { lat: AOR.nw.lat - 0.01, lon: AOR.nw.lon + 0.01 }
    const kp = keypadFromLatLon(p)
    expect(kp).not.toBeNull()
    expect(kp?.startsWith('23AF')).toBe(true)
  })
  test('keypad IDs are 5 characters', () => {
    const center = {
      lat: (AOR.nw.lat + AOR.sw.lat) / 2,
      lon: (AOR.nw.lon + AOR.ne.lon) / 2,
    }
    const kp = keypadFromLatLon(center)
    expect(kp).not.toBeNull()
    expect(kp?.length).toBe(5)
  })
  test('last char is digit 1-9', () => {
    const center = {
      lat: (AOR.nw.lat + AOR.sw.lat) / 2,
      lon: (AOR.nw.lon + AOR.ne.lon) / 2,
    }
    const kp = keypadFromLatLon(center)!
    const digit = parseInt(kp[4], 10)
    expect(digit).toBeGreaterThanOrEqual(1)
    expect(digit).toBeLessThanOrEqual(9)
  })
})

// ─── keypadPolygon ────────────────────────────────────────────────────
describe('keypadPolygon', () => {
  test('returns polygon for valid keypad', () => {
    const poly = keypadPolygon('23AF5')
    expect(poly).not.toBeNull()
    expect(poly?.type).toBe('Polygon')
    expect(poly?.coordinates[0]).toHaveLength(5) // closed ring
  })
  test('returns null for invalid keypad', () => {
    expect(keypadPolygon('invalid')).toBeNull()
    expect(keypadPolygon('99ZZ5')).toBeNull()
  })
  test('caches results', () => {
    const a = keypadPolygon('22AG3')
    const b = keypadPolygon('22AG3')
    expect(a).toBe(b) // same reference
  })
})

// ─── allKeypadsInKillbox ──────────────────────────────────────────────
describe('allKeypadsInKillbox', () => {
  test('returns 9 keypads for valid killbox', () => {
    const kps = allKeypadsInKillbox('23AF')
    expect(kps).toHaveLength(9)
    expect(kps[0]).toBe('23AF1')
    expect(kps[8]).toBe('23AF9')
  })
  test('returns empty for invalid killbox', () => {
    expect(allKeypadsInKillbox('invalid')).toHaveLength(0)
  })
})

// ─── pointInPoly ──────────────────────────────────────────────────────
describe('pointInPoly', () => {
  const square: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  }
  test('point inside returns true', () => {
    expect(pointInPoly([5, 5], square)).toBe(true)
  })
  test('point outside returns false', () => {
    expect(pointInPoly([15, 5], square)).toBe(false)
  })
})

// ─── centroid ─────────────────────────────────────────────────────────
describe('centroid', () => {
  test('centroid of closed ring averages all points including closing', () => {
    // closed ring: 5 pts total (corner + closing), so average is (0+10+10+0+0)/5 = 4
    const square: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    }
    const [cx, cy] = centroid(square)
    expect(cx).toBeCloseTo(4, 4)
    expect(cy).toBeCloseTo(4, 4)
  })
  test('centroid of keypad polygon is within AOR', () => {
    const poly = keypadPolygon('22AG5')!
    const [cx, cy] = centroid(poly)
    expect(cx).toBeGreaterThan(AOR.sw.lon)
    expect(cx).toBeLessThan(AOR.ne.lon)
    expect(cy).toBeGreaterThan(AOR.sw.lat)
    expect(cy).toBeLessThan(AOR.ne.lat)
  })
})

// ─── deriveKeypadsFromPolygon ─────────────────────────────────────────
describe('deriveKeypadsFromPolygon', () => {
  test('large polygon covering entire AOR returns all keypads', () => {
    // A polygon covering the whole AOR
    const poly: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [AOR.sw.lon - 1, AOR.sw.lat - 1],
          [AOR.se.lon + 1, AOR.se.lat - 1],
          [AOR.ne.lon + 1, AOR.ne.lat + 1],
          [AOR.nw.lon - 1, AOR.nw.lat + 1],
          [AOR.sw.lon - 1, AOR.sw.lat - 1],
        ],
      ],
    }
    const kps = deriveKeypadsFromPolygon(poly)
    // 12 killboxes * 9 keypads = 108
    expect(kps).toHaveLength(108)
  })
  test('tiny polygon far outside AOR returns empty', () => {
    const poly: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0.001, 0],
          [0.001, 0.001],
          [0, 0.001],
          [0, 0],
        ],
      ],
    }
    expect(deriveKeypadsFromPolygon(poly)).toHaveLength(0)
  })
})

// ─── deriveKeypadsFromLine ────────────────────────────────────────────
describe('deriveKeypadsFromLine', () => {
  test('line crossing AOR returns some keypads', () => {
    const line: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [
        [AOR.sw.lon + 0.1, (AOR.sw.lat + AOR.nw.lat) / 2],
        [AOR.se.lon - 0.1, (AOR.sw.lat + AOR.nw.lat) / 2],
      ],
    }
    const kps = deriveKeypadsFromLine(line)
    expect(kps.length).toBeGreaterThan(0)
  })
})

// ─── deriveKeypadsFromPoint ───────────────────────────────────────────
describe('deriveKeypadsFromPoint', () => {
  test('point inside AOR returns 1 keypad', () => {
    const pt: GeoJSON.Point = {
      type: 'Point',
      coordinates: [(AOR.sw.lon + AOR.se.lon) / 2, (AOR.sw.lat + AOR.nw.lat) / 2],
    }
    const kps = deriveKeypadsFromPoint(pt)
    expect(kps).toHaveLength(1)
    expect(kps[0].length).toBe(5)
  })
})

// ─── parseKeypadString ────────────────────────────────────────────────
describe('parseKeypadString', () => {
  test('empty string returns not ok', () => {
    const r = parseKeypadString('')
    expect(r.ok).toBe(false)
    expect(r.keypads).toHaveLength(0)
  })
  test('single keypad like "23AF5"', () => {
    const r = parseKeypadString('23AF5')
    expect(r.ok).toBe(true)
    expect(r.keypads).toEqual(['23AF5'])
  })
  test('killbox with (all)', () => {
    const r = parseKeypadString('23AG (all)')
    expect(r.ok).toBe(true)
    expect(r.keypads).toHaveLength(9)
  })
  test('cluster like "23AG89"', () => {
    const r = parseKeypadString('23AG89')
    expect(r.ok).toBe(true)
    expect(r.keypads).toEqual(['23AG8', '23AG9'])
  })
  test('comma-separated', () => {
    const r = parseKeypadString('23AF5, 22AG3')
    expect(r.ok).toBe(true)
    expect(r.keypads).toEqual(['23AF5', '22AG3'])
  })
  test('plus-separated', () => {
    const r = parseKeypadString('23AF5+22AG3')
    expect(r.ok).toBe(true)
    expect(r.keypads).toEqual(['23AF5', '22AG3'])
  })
  test('ambiguous text returns warning', () => {
    const r = parseKeypadString('south half of 23AF')
    expect(r.ok).toBe(false)
    expect(r.warning).toBeDefined()
  })
  test('killbox alone is ambiguous warning', () => {
    const r = parseKeypadString('23AF')
    expect(r.ok).toBe(false)
    expect(r.warning).toBeDefined()
  })
  test('deduplicates keypads', () => {
    const r = parseKeypadString('23AF5+23AF5')
    expect(r.ok).toBe(true)
    expect(r.keypads).toEqual(['23AF5'])
  })
})

// ─── polygonFromKeypads ───────────────────────────────────────────────
describe('polygonFromKeypads', () => {
  test('returns bounding box polygon for single keypad', () => {
    const poly = polygonFromKeypads(['23AF5'])
    expect(poly.type).toBe('Polygon')
    expect(poly.coordinates[0]).toHaveLength(5) // closed ring
  })
  test('bounding box grows with more keypads', () => {
    const single = polygonFromKeypads(['23AF5'])
    const multi = polygonFromKeypads(['23AF5', '23AF6', '23AF8', '23AF9'])
    // multi bounding box should be at least as large
    const sCoords = single.coordinates[0]
    const mCoords = multi.coordinates[0]
    const sWidth = Math.abs(sCoords[1][0] - sCoords[0][0])
    const mWidth = Math.abs(mCoords[1][0] - mCoords[0][0])
    expect(mWidth).toBeGreaterThanOrEqual(sWidth)
  })
  test('empty keypads returns degenerate polygon', () => {
    const poly = polygonFromKeypads([])
    expect(poly.type).toBe('Polygon')
  })
})
