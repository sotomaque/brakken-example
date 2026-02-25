import { fracToLatLon, KILLBOX_COLS, KILLBOX_ROWS } from './utils'

export function gridLinesGeoJSON() {
  // Lines for killbox and keypad boundaries
  // Total columns: 12 (4*3), total rows: 9 (3*3)
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
  const totalCols = 12
  const totalRows = 9

  const pushLine = (coords: [number, number][], props: Record<string, string>) => {
    features.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'LineString', coordinates: coords },
    })
  }

  // Vertical lines
  for (let c = 0; c <= totalCols; c++) {
    const x = c / totalCols
    const p0 = fracToLatLon(x, 0)
    const p1 = fracToLatLon(x, 1)
    const isKill = c % 3 === 0
    pushLine(
      [
        [p0.lon, p0.lat],
        [p1.lon, p1.lat],
      ],
      { kind: isKill ? 'KILLBOX' : 'KEYPAD' },
    )
  }
  // Horizontal lines
  for (let r = 0; r <= totalRows; r++) {
    const y = r / totalRows
    const p0 = fracToLatLon(0, y)
    const p1 = fracToLatLon(1, y)
    const isKill = r % 3 === 0
    pushLine(
      [
        [p0.lon, p0.lat],
        [p1.lon, p1.lat],
      ],
      { kind: isKill ? 'KILLBOX' : 'KEYPAD' },
    )
  }

  return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection<GeoJSON.LineString>
}

export function killboxLabelsGeoJSON() {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = []
  // label at center keypad of each killbox (i.e., its center)
  const totalCols = 4
  const totalRows = 3
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const kill = `${KILLBOX_ROWS[r]}${KILLBOX_COLS[c]}`
      const x0 = c / totalCols
      const x1 = (c + 1) / totalCols
      const y0 = 1 - (r + 1) / totalRows
      const y1 = 1 - r / totalRows
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      const p = fracToLatLon(cx, cy)
      features.push({
        type: 'Feature',
        properties: { label: kill },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })
    }
  }
  return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection<GeoJSON.Point>
}

export function keypadPolygonsGeoJSON() {
  // Render transparent polygons for each keypad so we can hover/click them.
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  const totalCols = 12
  const totalRows = 9
  const keypadNumber = (r: number, c: number) => {
    const grid = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]
    return grid[r][c]
  }
  for (let killRow = 0; killRow < 3; killRow++) {
    for (let killCol = 0; killCol < 4; killCol++) {
      const kill = `${KILLBOX_ROWS[killRow]}${KILLBOX_COLS[killCol]}`
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const kp = keypadNumber(r, c)
          const globalCol = killCol * 3 + c
          const globalRow = killRow * 3 + r

          const x0 = globalCol / totalCols
          const x1 = (globalCol + 1) / totalCols
          const y0 = 1 - (globalRow + 1) / totalRows
          const y1 = 1 - globalRow / totalRows

          const p00 = fracToLatLon(x0, y0)
          const p10 = fracToLatLon(x1, y0)
          const p11 = fracToLatLon(x1, y1)
          const p01 = fracToLatLon(x0, y1)

          const id = `${kill}${kp}`
          features.push({
            type: 'Feature',
            properties: { keypadId: id, killbox: kill, kp },
            geometry: {
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
            },
          })
        }
      }
    }
  }
  return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection<GeoJSON.Polygon>
}
