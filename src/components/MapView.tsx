import {
  ColorPicker,
  Hotkey,
  OptionsItem,
  SelectField,
  Slider,
  Switch,
} from '@accelint/design-toolkit'
import {
  globalBind,
  globalUnbind,
  Keycode,
  registerHotkey,
  unregisterHotkey,
} from '@accelint/hotkey-manager'
import { ChevronDown, ChevronRight, Keyboard, Layers } from '@accelint/icons'
import maplibregl, { Map as MLMap } from 'maplibre-gl'
import { type CSSProperties, memo, useEffect, useMemo, useRef, useState } from 'react'
import { gridLinesGeoJSON, keypadPolygonsGeoJSON, killboxLabelsGeoJSON } from '@/lib/grid'
import { REF_POINTS } from '@/lib/referencePoints'
import type { HoverInfo } from '@/store'
import { useAppStore } from '@/store'
import type { AirspaceReservation } from '@/lib/types'
import { AOR, fmtAlt } from '@/lib/utils'

const GRID_LINES_SOURCE = 'grid-lines'
const GRID_LABELS_SOURCE = 'grid-labels'
const KEYPADS_SOURCE = 'keypads'
const AIRSPACES_SOURCE = 'airspaces'
const SHAPES_SOURCE = 'shapes'
const REFS_SOURCE = 'refs'

// Hoisted style constants for overlay panels (fix 6b)
const S_OVERLAY_HEADER: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  marginBottom: 8,
  background: 'none',
  border: 'none',
  padding: 0,
  width: '100%',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
}
const S_H4: CSSProperties = { margin: 0 }
const S_COLLAPSE_ICON: CSSProperties = { color: 'var(--muted)', fontSize: 12 }
const S_MODE_LINE: CSSProperties = {
  marginBottom: 8,
  color: 'var(--muted)',
  fontSize: 12,
}
const S_ICON_INLINE: CSSProperties = { verticalAlign: 'middle', marginRight: 4 }
const S_GRID_COLOR_ROW: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 12,
  color: 'var(--muted)',
  marginBottom: 10,
}
const S_MAP_HEIGHT: CSSProperties = { height: '100%' }
const GRID_COLOR_SWATCHES = [
  '#9fb1c5',
  '#ffffff',
  '#4ba3ff',
  '#3cff9e',
  '#ffd24b',
  '#ff8f3d',
  '#ff4444',
  '#00ffff',
]

// Hoisted static JSX for keyboard shortcuts legend (fix 2.3)
const SHORTCUTS_JSX = (
  <>
    <div className="row">
      <Hotkey variant="outline">A</Hotkey>
      <span>Create airspace (keypads)</span>
    </div>
    <div className="row">
      <Hotkey variant="outline">F</Hotkey>
      <span>Free draw mode</span>
    </div>
    <div className="row">
      <Hotkey variant="outline">E</Hotkey>
      <span>Edit selected</span>
    </div>
    <div className="row">
      <Hotkey variant="outline">Enter</Hotkey>
      <span>Confirm draw</span>
    </div>
    <div className="row">
      <Hotkey variant="outline">Esc</Hotkey>
      <span>Cancel</span>
    </div>
    <div className="row">
      <Hotkey variant="outline">Del</Hotkey>
      <span>Archive</span>
    </div>
  </>
)

/** Return the highest altitude point for z-ordering (higher = renders on top). */
function getEffectiveAltitude(a: AirspaceReservation): number {
  return a.altitude.kind === 'SINGLE' ? a.altitude.singleFt : a.altitude.maxFt
}

// Picasso mode offset directions (unit vectors scaled by radius at runtime)
const PICASSO_UNIT_OFFSETS: [number, number][] = [
  [0, 0], // slot 0: no offset
  [1, 0], // slot 1: right
  [-1, 0], // slot 2: left
  [0, 1], // slot 3: down
  [0, -1], // slot 4: up
  [0.707, 0.707], // slot 5: down-right
  [-0.707, 0.707], // slot 6: down-left
  [0.707, -0.707], // slot 7: up-right
]
const PICASSO_SLOT_COUNT = PICASSO_UNIT_OFFSETS.length
const PICASSO_STATES = ['ACTIVE', 'PLANNED', 'COLD'] as const
const PICASSO_DASH: Record<string, number[] | undefined> = {
  ACTIVE: undefined,
  PLANNED: [4, 4],
  COLD: [4, 2, 1, 2],
}

// Module-level guard for map init (fix 3.4 — prevents double init in StrictMode)
let mapDidInit = false

export default memo(function MapView() {
  const mapRef = useRef<MLMap | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [toolsMinimized, setToolsMinimized] = useState(false)
  const [shortcutsMinimized, setShortcutsMinimized] = useState(false)

  // Granular selectors (fix 5a) -- only subscribe to slices used in render or effects
  const mode = useAppStore(s => s.mode)
  const drawType = useAppStore(s => s.drawType)
  const airspaces = useAppStore(s => s.airspaces)
  const shapes = useAppStore(s => s.shapes)
  const layerToggles = useAppStore(s => s.layerToggles)
  const gridOptions = useAppStore(s => s.gridOptions)
  const selectedKeypads = useAppStore(s => s.selectedKeypads)
  const overlapGroups = useAppStore(s => s.overlapGroups)
  const picassoMode = useAppStore(s => s.picassoMode)
  const picassoRadius = useAppStore(s => s.picassoRadius)

  const gridLines = useMemo(() => gridLinesGeoJSON(), [])
  const gridLabels = useMemo(() => killboxLabelsGeoJSON(), [])
  const keypadsGeo = useMemo(() => keypadPolygonsGeoJSON(), [])

  const airspacesGeo = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: airspaces
        .filter(a => a.state !== 'ARCHIVED')
        .filter(a => !(a.state === 'COLD' && !a.showCold))
        .sort((a, b) => {
          // Z-ordering: KEYPAD below FREEDRAW, then lower altitude below higher
          const kindOrder = a.kind === 'KEYPAD' ? 0 : 1
          const kindOrderB = b.kind === 'KEYPAD' ? 0 : 1
          if (kindOrder !== kindOrderB) return kindOrder - kindOrderB
          return getEffectiveAltitude(a) - getEffectiveAltitude(b)
        })
        .map(a => ({
          type: 'Feature',
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
    } as GeoJSON.FeatureCollection<GeoJSON.Polygon>
  }, [airspaces, overlapGroups])

  const shapesGeo = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: shapes.map(s => ({
        type: 'Feature',
        properties: {
          id: s.id,
          label: s.label,
          shapeType: s.shapeType,
          tags: s.tags.join(','),
        },
        geometry: s.geometry as any,
      })),
    } as GeoJSON.FeatureCollection
  }, [shapes])

  const refsGeo = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: REF_POINTS.map(r => ({
        type: 'Feature',
        properties: {
          id: r.id,
          label: r.label,
          keypad: r.keypad,
          kind: r.kind,
        },
        geometry: {
          type: 'Point',
          coordinates: Array.isArray(r.pos) ? r.pos : [r.pos.lon, r.pos.lat],
        },
      })),
    } as GeoJSON.FeatureCollection<GeoJSON.Point>
  }, [])

  // Drawing state (kept local to map component)
  const drawStateRef = useRef<{ active: boolean; coords: [number, number][] }>({
    active: false,
    coords: [],
  })

  // rAF gate for hover — avoids re-rendering HoverAndChat on every mousemove pixel (fix 1.12)
  const hoverRafRef = useRef(0)
  const pendingHoverRef = useRef<HoverInfo | null>(null)

  useEffect(() => {
    if (mapDidInit) return
    mapDidInit = true
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          dark: {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [{ id: 'dark', type: 'raster', source: 'dark' }],
      },
      center: [(AOR.sw.lon + AOR.ne.lon) / 2, (AOR.sw.lat + AOR.ne.lat) / 2],
      zoom: 6.2,
      attributionControl: false,
    })

    mapRef.current = map
    map.on('error', e => {
      // @ts-ignore
      console.error('MapLibre error:', e?.error || e)
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')

    map.on('load', async () => {
      // 1) Sources
      map.addSource(GRID_LINES_SOURCE, { type: 'geojson', data: gridLines })
      map.addSource(GRID_LABELS_SOURCE, { type: 'geojson', data: gridLabels })
      map.addSource(KEYPADS_SOURCE, { type: 'geojson', data: keypadsGeo })
      map.addSource(AIRSPACES_SOURCE, { type: 'geojson', data: airspacesGeo })
      map.addSource(SHAPES_SOURCE, { type: 'geojson', data: shapesGeo })
      map.addSource(REFS_SOURCE, { type: 'geojson', data: refsGeo })

      // Reference point circles
      map.addLayer({
        id: 'refs-point',
        type: 'circle',
        source: REFS_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'SHIP',
            '#00bcd4',
            'AFB',
            '#ff9800',
            'FOB',
            '#4caf50',
            '#ffffff',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#000000',
        },
      })

      // Reference point labels
      map.addLayer({
        id: 'refs-label',
        type: 'symbol',
        source: REFS_SOURCE,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#9bd1ff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.2,
          'text-opacity': 0.95,
        },
      })

      // Keypad polygons (transparent fill) for hover/click
      map.addLayer({
        id: 'keypad-fill',
        type: 'fill',
        source: KEYPADS_SOURCE,
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.0001 },
      })

      // Selection highlight for selected keypads
      map.addLayer({
        id: 'keypad-selected',
        type: 'fill',
        source: KEYPADS_SOURCE,
        paint: { 'fill-color': '#4ba3ff', 'fill-opacity': 0.2 },
        filter: ['in', ['get', 'keypadId'], ['literal', []]],
      })

      // Grid lines
      const initGrid = useAppStore.getState().gridOptions
      map.addLayer({
        id: 'grid-killbox',
        type: 'line',
        source: GRID_LINES_SOURCE,
        filter: ['==', ['get', 'kind'], 'KILLBOX'],
        paint: {
          'line-color': initGrid.gridColor,
          'line-opacity': initGrid.gridOpacity,
          'line-width': initGrid.killboxLineWidth,
        },
      })
      map.addLayer({
        id: 'grid-keypad',
        type: 'line',
        source: GRID_LINES_SOURCE,
        filter: ['==', ['get', 'kind'], 'KEYPAD'],
        paint: {
          'line-color': initGrid.gridColor,
          'line-opacity': initGrid.gridOpacity * 0.8,
          'line-width': initGrid.keypadLineWidth,
        },
      })

      // Killbox labels
      map.addLayer({
        id: 'grid-labels',
        type: 'symbol',
        source: GRID_LABELS_SOURCE,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': initGrid.labelFontSize,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': initGrid.gridColor,
          'text-opacity': initGrid.labelOpacity,
          'text-halo-color': '#000000',
          'text-halo-width': 1.2,
        },
      })

      // Master color logic (typed loosely — MapLibre style-spec Expression types are incomplete)
      const airspaceColorLogic: any = [
        'coalesce',
        ['get', 'color'],
        [
          'match',
          ['get', 'state'],
          'ACTIVE',
          '#3cff9e',
          'COLD',
          '#ffd24b',
          'PLANNED',
          '#4ba3ff',
          '#999999',
        ],
      ]

      // Airspaces polygon fill
      map.addLayer({
        id: 'airspaces-fill',
        type: 'fill',
        source: AIRSPACES_SOURCE,
        paint: {
          'fill-color': airspaceColorLogic,
          'fill-opacity': ['case', ['==', ['get', 'showFill'], false], 0, 0.2],
        },
      })

      // Outline layers (ACTIVE=solid, PLANNED=dashed, COLD=dot-dashed)
      map.addLayer({
        id: 'airspaces-outline-active',
        type: 'line',
        source: AIRSPACES_SOURCE,
        filter: ['==', ['get', 'state'], 'ACTIVE'],
        paint: {
          'line-color': airspaceColorLogic,
          'line-width': ['get', 'lineWidth'],
          'line-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'airspaces-outline-planned',
        type: 'line',
        source: AIRSPACES_SOURCE,
        filter: ['==', ['get', 'state'], 'PLANNED'],
        paint: {
          'line-color': airspaceColorLogic,
          'line-width': ['get', 'lineWidth'],
          'line-opacity': 0.9,
          'line-dasharray': [4, 4],
        },
      })
      map.addLayer({
        id: 'airspaces-outline-cold',
        type: 'line',
        source: AIRSPACES_SOURCE,
        filter: ['==', ['get', 'state'], 'COLD'],
        paint: {
          'line-color': airspaceColorLogic,
          'line-width': ['get', 'lineWidth'],
          'line-opacity': 0.9,
          'line-dasharray': [4, 2, 1, 2],
        },
      })

      // Picasso mode layers (8 slots x 3 states = 24 layers, initially hidden)
      const initRadius = useAppStore.getState().picassoRadius
      for (let slot = 0; slot < PICASSO_SLOT_COUNT; slot++) {
        const [ux, uy] = PICASSO_UNIT_OFFSETS[slot]
        const translate: [number, number] = [ux * initRadius, uy * initRadius]
        for (const state of PICASSO_STATES) {
          const layerDef: maplibregl.LayerSpecification = {
            id: `picasso-outline-${state.toLowerCase()}-${slot}`,
            type: 'line',
            source: AIRSPACES_SOURCE,
            filter: ['all', ['==', ['get', 'state'], state], ['==', ['get', 'overlapSlot'], slot]],
            paint: {
              'line-color': airspaceColorLogic,
              'line-width': ['get', 'lineWidth'],
              'line-opacity': 0.9,
              'line-translate': translate,
              ...(PICASSO_DASH[state] ? { 'line-dasharray': PICASSO_DASH[state] } : {}),
            },
            layout: { visibility: 'none' },
          }
          map.addLayer(layerDef as any)
        }
      }

      // Shapes (polygons/lines/points)
      map.addLayer({
        id: 'shapes-line',
        type: 'line',
        source: SHAPES_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#ff8f3d',
          'line-width': 2,
          'line-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'shapes-poly',
        type: 'fill',
        source: SHAPES_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#ff8f3d', 'fill-opacity': 0.12 },
      })
      map.addLayer({
        id: 'shapes-poly-outline',
        type: 'line',
        source: SHAPES_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': '#ff8f3d',
          'line-width': 2,
          'line-opacity': 0.85,
        },
      })
      map.addLayer({
        id: 'shapes-point',
        type: 'circle',
        source: SHAPES_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#ff8f3d',
          'circle-radius': 5,
          'circle-opacity': 0.9,
        },
      })

      map.on('click', e => {
        const st = useAppStore.getState()
        if (st.mode === 'KEYPAD_SELECT') {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ['keypad-fill'],
          })
          const keypadId = features[0]?.properties?.keypadId as string | undefined
          if (keypadId) st.toggleKeypad(keypadId)
          return
        }
        if (st.mode === 'FREEDRAW') {
          const ds = drawStateRef.current
          if (!ds.active) {
            ds.active = true
            ds.coords = []
          }
          ds.coords.push([e.lngLat.lng, e.lngLat.lat])
          updateScratch(map)
          return
        }
        const asFeat = map.queryRenderedFeatures(e.point, {
          layers: ['airspaces-fill'],
        })[0]
        if (asFeat?.properties?.id) return st.selectAirspace(asFeat.properties.id as string)
        const shFeat = map.queryRenderedFeatures(e.point, {
          layers: ['shapes-line', 'shapes-poly', 'shapes-point'],
        })[0]
        if (shFeat?.properties?.id) return st.selectShape(shFeat.properties.id as string)
        st.clearSelection()
      })

      // Hover with rAF throttle — queries features immediately but batches
      // the Zustand write to one per animation frame (fix 1.12)
      map.on('mousemove', e => {
        const kpFeat = map.queryRenderedFeatures(e.point, {
          layers: ['keypad-fill'],
        })[0]
        if (kpFeat?.properties?.keypadId) {
          pendingHoverRef.current = {
            kind: 'KEYPAD',
            keypadId: kpFeat.properties.keypadId as string,
          }
        } else {
          const refFeat = map.queryRenderedFeatures(e.point, {
            layers: ['refs-point'],
          })[0]
          if (refFeat?.properties?.label && refFeat?.properties?.keypad) {
            pendingHoverRef.current = {
              kind: 'REF',
              label: refFeat.properties.label as string,
              keypadId: refFeat.properties.keypad as string,
            }
          } else {
            const asFeat = map.queryRenderedFeatures(e.point, {
              layers: ['airspaces-fill'],
            })[0]
            if (asFeat?.properties?.id) {
              pendingHoverRef.current = {
                kind: 'AIRSPACE',
                airspaceId: asFeat.properties.id as string,
              }
            } else {
              const shFeat = map.queryRenderedFeatures(e.point, {
                layers: ['shapes-line', 'shapes-poly', 'shapes-point'],
              })[0]
              if (shFeat?.properties?.id) {
                pendingHoverRef.current = {
                  kind: 'SHAPE',
                  shapeId: shFeat.properties.id as string,
                }
              } else {
                pendingHoverRef.current = { kind: 'NONE' }
              }
            }
          }
        }
        if (!hoverRafRef.current) {
          hoverRafRef.current = requestAnimationFrame(() => {
            hoverRafRef.current = 0
            if (pendingHoverRef.current) {
              useAppStore.getState().setHover(pendingHoverRef.current)
            }
          })
        }
      })

      // Scratch layers (drawing preview)
      map.addSource('scratch', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'scratch-line',
        type: 'line',
        source: 'scratch',
        paint: {
          'line-color': '#4ba3ff',
          'line-width': 2.5,
          'line-opacity': 0.95,
        },
        filter: ['==', ['get', 'g'], 'line'],
      })
      map.addLayer({
        id: 'scratch-fill',
        type: 'fill',
        source: 'scratch',
        paint: { 'fill-color': '#4ba3ff', 'fill-opacity': 0.15 },
        filter: ['==', ['get', 'g'], 'poly'],
      })
      map.addLayer({
        id: 'scratch-pts',
        type: 'circle',
        source: 'scratch',
        paint: {
          'circle-color': '#4ba3ff',
          'circle-radius': 4,
          'circle-opacity': 0.95,
        },
        filter: ['==', ['get', 'g'], 'pt'],
      })
    })

    return () => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
      map.remove()
      mapRef.current = null
      mapDidInit = false
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update sources when data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(AIRSPACES_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (src) src.setData(airspacesGeo as any)
  }, [airspacesGeo])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(SHAPES_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (src) src.setData(shapesGeo as any)
  }, [shapesGeo])

  // Apply layer toggles (Rule 1.3: narrow deps to primitives)
  const { airspaces: airspacesOn, freedraw: freedrawOn, refs: refsOn } = layerToggles
  const { showGrid, showKillboxLabels } = gridOptions
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const setVis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    }

    setVis('airspaces-fill', airspacesOn)
    setVis('airspaces-outline-active', airspacesOn && !picassoMode)
    setVis('airspaces-outline-planned', airspacesOn && !picassoMode)
    setVis('airspaces-outline-cold', airspacesOn && !picassoMode)

    // Picasso outline layers
    for (let slot = 0; slot < PICASSO_SLOT_COUNT; slot++) {
      for (const state of PICASSO_STATES) {
        setVis(`picasso-outline-${state.toLowerCase()}-${slot}`, airspacesOn && picassoMode)
      }
    }

    setVis('shapes-line', freedrawOn)
    setVis('shapes-poly', freedrawOn)
    setVis('shapes-poly-outline', freedrawOn)
    setVis('shapes-point', freedrawOn)
    setVis('refs-point', refsOn)
    setVis('refs-label', refsOn)

    setVis('grid-killbox', showGrid)
    setVis('grid-keypad', showGrid)
    setVis('grid-labels', showGrid && showKillboxLabels)
  }, [airspacesOn, freedrawOn, refsOn, showGrid, showKillboxLabels, picassoMode])

  // Picasso radius: imperative helper called from event handler (Rule 1.11)
  function applyPicassoRadius(r: number) {
    const map = mapRef.current
    if (!map) return
    for (let slot = 0; slot < PICASSO_SLOT_COUNT; slot++) {
      const [ux, uy] = PICASSO_UNIT_OFFSETS[slot]
      const translate: [number, number] = [ux * r, uy * r]
      for (const state of PICASSO_STATES) {
        const layerId = `picasso-outline-${state.toLowerCase()}-${slot}`
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-translate', translate)
        }
      }
    }
  }

  // Apply grid styling (Rule 1.3: narrow deps to primitives)
  const { gridColor, gridOpacity, killboxLineWidth, keypadLineWidth, labelFontSize, labelOpacity } =
    gridOptions
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const safe = (id: string) => map.getLayer(id)
    if (safe('grid-killbox')) {
      map.setPaintProperty('grid-killbox', 'line-color', gridColor)
      map.setPaintProperty('grid-killbox', 'line-opacity', gridOpacity)
      map.setPaintProperty('grid-killbox', 'line-width', killboxLineWidth)
    }
    if (safe('grid-keypad')) {
      map.setPaintProperty('grid-keypad', 'line-color', gridColor)
      map.setPaintProperty('grid-keypad', 'line-opacity', gridOpacity * 0.8)
      map.setPaintProperty('grid-keypad', 'line-width', keypadLineWidth)
    }
    if (safe('grid-labels')) {
      map.setLayoutProperty('grid-labels', 'text-size', labelFontSize)
      map.setPaintProperty('grid-labels', 'text-color', gridColor)
      map.setPaintProperty('grid-labels', 'text-opacity', labelOpacity)
    }
  }, [gridColor, gridOpacity, killboxLineWidth, keypadLineWidth, labelFontSize, labelOpacity])

  // Update keypad selection highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.getLayer('keypad-selected')) return
    map.setFilter('keypad-selected', ['in', ['get', 'keypadId'], ['literal', selectedKeypads]])
  }, [selectedKeypads])

  // Basemap toggle
  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.style.filter = layerToggles.basemap
      ? 'none'
      : 'grayscale(1) brightness(0.7)'
  }, [layerToggles.basemap])

  // Keyboard shortcuts via @accelint/hotkey-manager
  useEffect(() => {
    globalBind()

    const managers = [
      registerHotkey({
        id: 'esc',
        key: { code: Keycode.Escape },
        onKeyDown: () => {
          const map = mapRef.current
          if (!map) return
          const st = useAppStore.getState()
          const ds = drawStateRef.current
          ds.active = false
          ds.coords = []
          updateScratch(map)
          st.cancelEdit()
          if (st.mode === 'KEYPAD_SELECT') st.clearSelection()
        },
      }),
      registerHotkey({
        id: 'enter',
        key: { code: Keycode.Enter },
        onKeyDown: () => {
          const map = mapRef.current
          if (!map) return
          const st = useAppStore.getState()
          if (st.mode === 'FREEDRAW') {
            const ds = drawStateRef.current
            if (!ds.active) return
            const coords = ds.coords.slice()
            ds.active = false
            ds.coords = []
            updateScratch(map)
            st.submitDrawResult({ drawType: st.drawType, coords })
          } else if (st.mode === 'KEYPAD_SELECT' && st.selectedKeypads.length > 0) {
            st.submitKeypadResult({ keypads: st.selectedKeypads })
          }
        },
      }),
      registerHotkey({
        id: 'key-a',
        key: { code: Keycode.KeyA },
        onKeyDown: event => {
          event.preventDefault()
          const st = useAppStore.getState()
          if (st.mode !== 'KEYPAD_SELECT') {
            st.setMode('KEYPAD_SELECT')
          } else if (st.selectedKeypads.length > 0) {
            st.submitKeypadResult({ keypads: st.selectedKeypads })
          }
        },
      }),
      registerHotkey({
        id: 'key-f',
        key: { code: Keycode.KeyF },
        onKeyDown: () => {
          useAppStore.getState().setMode('FREEDRAW')
        },
      }),
      registerHotkey({
        id: 'key-e',
        key: { code: Keycode.KeyE },
        onKeyDown: () => {
          useAppStore.getState().startEditSelected()
        },
      }),
      registerHotkey({
        id: 'delete',
        key: [{ code: Keycode.Delete }, { code: Keycode.Backspace }],
        onKeyDown: () => {
          useAppStore.getState().archiveSelected()
        },
      }),
    ]

    const cleanups = managers.map(m => m.bind())

    return () => {
      cleanups.forEach(c => {
        c()
      })
      managers.forEach(m => {
        unregisterHotkey(m)
      })
      globalUnbind()
    }
  }, [])

  function updateScratch(map: MLMap) {
    const ds = drawStateRef.current
    const feats: any[] = []
    for (const c of ds.coords) {
      feats.push({
        type: 'Feature',
        properties: { g: 'pt' },
        geometry: { type: 'Point', coordinates: c },
      })
    }
    if (ds.coords.length >= 2) {
      feats.push({
        type: 'Feature',
        properties: { g: 'line' },
        geometry: { type: 'LineString', coordinates: ds.coords },
      })
    }
    // Use getState() for drawType to avoid stale closure
    if (useAppStore.getState().drawType === 'POLYGON' && ds.coords.length >= 3) {
      feats.push({
        type: 'Feature',
        properties: { g: 'poly' },
        geometry: {
          type: 'Polygon',
          coordinates: [[...ds.coords, ds.coords[0]]],
        },
      })
    }
    const src = map.getSource('scratch') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData({ type: 'FeatureCollection', features: feats } as any)
  }

  return (
    <div className="mapWrap">
      <div ref={containerRef} className="map" style={S_MAP_HEIGHT} />

      <div className="mapOverlays">
        {/* SHORTCUTS (collapsible) */}
        <div className="legend">
          <button
            type="button"
            style={S_OVERLAY_HEADER}
            onClick={() => setShortcutsMinimized(v => !v)}
            title="Click to expand/collapse"
          >
            <h4 style={S_H4}>
              <Keyboard width={14} height={14} style={S_ICON_INLINE} /> Shortcuts
            </h4>
            {shortcutsMinimized ? (
              <ChevronRight width={14} height={14} style={S_COLLAPSE_ICON} />
            ) : (
              <ChevronDown width={14} height={14} style={S_COLLAPSE_ICON} />
            )}
          </button>

          <div style={S_MODE_LINE}>
            Mode: <b>{mode}</b> {mode === 'FREEDRAW' ? `(${drawType})` : ''}
          </div>

          {!shortcutsMinimized && SHORTCUTS_JSX}
        </div>

        {/* GRID & LAYERS (collapsible) */}
        <div className="mapTools">
          <button
            type="button"
            style={S_OVERLAY_HEADER}
            onClick={() => setToolsMinimized(v => !v)}
            title="Click to expand/collapse"
          >
            <h4 style={S_H4}>
              <Layers width={14} height={14} style={S_ICON_INLINE} /> Grid & Layers
            </h4>
            {toolsMinimized ? (
              <ChevronRight width={14} height={14} style={S_COLLAPSE_ICON} />
            ) : (
              <ChevronDown width={14} height={14} style={S_COLLAPSE_ICON} />
            )}
          </button>

          {!toolsMinimized && (
            <>
              <div className="section">
                <Switch
                  isSelected={gridOptions.showGrid}
                  onChange={v => useAppStore.getState().setGridOptions({ showGrid: v })}
                  labelPosition="start"
                >
                  Show grid
                </Switch>
                <Slider
                  label="Grid opacity"
                  minValue={0}
                  maxValue={1}
                  step={0.01}
                  value={gridOptions.gridOpacity}
                  onChange={v =>
                    useAppStore.getState().setGridOptions({ gridOpacity: v as number })
                  }
                  showValueLabels={false}
                  layout="grid"
                />
                <div style={S_GRID_COLOR_ROW}>
                  <span>Grid color</span>
                  <ColorPicker
                    items={GRID_COLOR_SWATCHES}
                    value={gridOptions.gridColor}
                    onChange={color =>
                      useAppStore.getState().setGridOptions({ gridColor: color.toString('hex') })
                    }
                  />
                </div>
                <Slider
                  label="Killbox width"
                  minValue={1}
                  maxValue={8}
                  step={1}
                  value={gridOptions.killboxLineWidth}
                  onChange={v =>
                    useAppStore.getState().setGridOptions({ killboxLineWidth: v as number })
                  }
                  showValueLabels={false}
                  layout="grid"
                />
                <Slider
                  label="Keypad width"
                  minValue={1}
                  maxValue={6}
                  step={1}
                  value={gridOptions.keypadLineWidth}
                  onChange={v =>
                    useAppStore.getState().setGridOptions({ keypadLineWidth: v as number })
                  }
                  showValueLabels={false}
                  layout="grid"
                />
                <Switch
                  isSelected={gridOptions.showKillboxLabels}
                  onChange={v => useAppStore.getState().setGridOptions({ showKillboxLabels: v })}
                  labelPosition="start"
                >
                  Killbox labels
                </Switch>
                <Slider
                  label="Label size"
                  minValue={10}
                  maxValue={22}
                  step={1}
                  value={gridOptions.labelFontSize}
                  onChange={v =>
                    useAppStore.getState().setGridOptions({ labelFontSize: v as number })
                  }
                  showValueLabels={false}
                  layout="grid"
                />
                <Slider
                  label="Label opacity"
                  minValue={0}
                  maxValue={1}
                  step={0.01}
                  value={gridOptions.labelOpacity}
                  onChange={v =>
                    useAppStore.getState().setGridOptions({ labelOpacity: v as number })
                  }
                  showValueLabels={false}
                  layout="grid"
                />
              </div>

              <div className="section">
                <Switch
                  isSelected={layerToggles.basemap}
                  onChange={v => useAppStore.getState().setLayerToggle('basemap', v)}
                  labelPosition="start"
                >
                  Basemap
                </Switch>
                <Switch
                  isSelected={layerToggles.airspaces}
                  onChange={v => useAppStore.getState().setLayerToggle('airspaces', v)}
                  labelPosition="start"
                >
                  Airspaces
                </Switch>
                <Switch
                  isSelected={layerToggles.routes}
                  onChange={v => useAppStore.getState().setLayerToggle('routes', v)}
                  labelPosition="start"
                >
                  Routes
                </Switch>
                <Switch
                  isSelected={layerToggles.freedraw}
                  onChange={v => useAppStore.getState().setLayerToggle('freedraw', v)}
                  labelPosition="start"
                >
                  Free-draw
                </Switch>
                <Switch
                  isSelected={layerToggles.acms}
                  onChange={v => useAppStore.getState().setLayerToggle('acms', v)}
                  labelPosition="start"
                >
                  ACMs (stub)
                </Switch>
                <Switch
                  isSelected={layerToggles.refs}
                  onChange={v => useAppStore.getState().setLayerToggle('refs', v)}
                  labelPosition="start"
                >
                  Reference points
                </Switch>
                <Switch
                  isSelected={picassoMode}
                  onChange={() => useAppStore.getState().togglePicassoMode()}
                  labelPosition="start"
                >
                  Picasso mode
                </Switch>
                {picassoMode && (
                  <Slider
                    label="Offset radius"
                    minValue={4}
                    maxValue={16}
                    step={1}
                    value={picassoRadius}
                    onChange={v => {
                      const r = v as number
                      useAppStore.getState().setPicassoRadius(r)
                      applyPicassoRadius(r)
                    }}
                    showValueLabels={false}
                    layout="grid"
                  />
                )}
              </div>
            </>
          )}

          <div className="section">
            <SelectField
              label="Draw type"
              size="small"
              selectedKey={drawType}
              onSelectionChange={key =>
                useAppStore.getState().setDrawType(key as 'POLYGON' | 'ROUTE' | 'POINT')
              }
            >
              <OptionsItem id="POLYGON">Polygon</OptionsItem>
              <OptionsItem id="ROUTE">Route line</OptionsItem>
              <OptionsItem id="POINT">Point</OptionsItem>
            </SelectField>
          </div>
        </div>
      </div>
    </div>
  )
})
