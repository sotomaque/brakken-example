import type { Map as MLMap } from 'maplibre-gl'
import maplibregl from 'maplibre-gl'
import { type MutableRefObject, type RefObject, useEffect, useMemo, useRef } from 'react'
import { buildAirspacesGeoJSON, buildRefsGeoJSON, buildShapesGeoJSON } from '@/lib/geojson-builders'
import { gridLinesGeoJSON, keypadPolygonsGeoJSON, killboxLabelsGeoJSON } from '@/lib/grid'
import { REF_POINTS } from '@/lib/reference-points'
import { AOR } from '@/lib/utils'
import type { HoverInfo } from '@/store'
import { useAppStore } from '@/store'

const GRID_LINES_SOURCE = 'grid-lines'
const GRID_LABELS_SOURCE = 'grid-labels'
const KEYPADS_SOURCE = 'keypads'
const AIRSPACES_SOURCE = 'airspaces'
const SHAPES_SOURCE = 'shapes'
const REFS_SOURCE = 'refs'

const PICASSO_UNIT_OFFSETS: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
]
const PICASSO_SLOT_COUNT = PICASSO_UNIT_OFFSETS.length
const PICASSO_STATES = ['ACTIVE', 'PLANNED', 'COLD'] as const
const PICASSO_DASH: Record<string, number[] | undefined> = {
  ACTIVE: undefined,
  PLANNED: [4, 4],
  COLD: [4, 2, 1, 2],
}

let mapDidInit = false

export function useMapInstance(
  containerRef: RefObject<HTMLDivElement | null>,
  handleMapClick: (map: MLMap, e: maplibregl.MapMouseEvent) => void,
): { mapRef: MutableRefObject<MLMap | null>; applyPicassoRadius: (r: number) => void } {
  const mapRef = useRef<MLMap | null>(null)

  const airspaces = useAppStore(s => s.airspaces)
  const shapes = useAppStore(s => s.shapes)
  const layerToggles = useAppStore(s => s.layerToggles)
  const gridOptions = useAppStore(s => s.gridOptions)
  const selectedKeypads = useAppStore(s => s.selectedKeypads)
  const overlapGroups = useAppStore(s => s.overlapGroups)
  const picassoMode = useAppStore(s => s.picassoMode)

  const gridLines = useMemo(() => gridLinesGeoJSON(), [])
  const gridLabels = useMemo(() => killboxLabelsGeoJSON(), [])
  const keypadsGeo = useMemo(() => keypadPolygonsGeoJSON(), [])

  const airspacesGeo = useMemo(
    () => buildAirspacesGeoJSON(airspaces, overlapGroups),
    [airspaces, overlapGroups],
  )
  const shapesGeo = useMemo(() => buildShapesGeoJSON(shapes), [shapes])
  const refsGeo = useMemo(() => buildRefsGeoJSON(REF_POINTS), [])

  // rAF gate for hover
  const hoverRafRef = useRef(0)
  const pendingHoverRef = useRef<HoverInfo | null>(null)

  // Init map — runs once; data updates handled by separate effects below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: init-once effect
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
      console.error('MapLibre error:', e?.error || e)
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')

    map.on('load', () => {
      // Sources
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

      // Selection highlight
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

      // Master color logic
      const airspaceColorLogic: maplibregl.ExpressionSpecification = [
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

      // Outline layers
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

      // Picasso mode layers
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

      // Shapes
      map.addLayer({
        id: 'shapes-line',
        type: 'line',
        source: SHAPES_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#ff8f3d', 'line-width': 2, 'line-opacity': 0.9 },
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
        paint: { 'line-color': '#ff8f3d', 'line-width': 2, 'line-opacity': 0.85 },
      })
      map.addLayer({
        id: 'shapes-point',
        type: 'circle',
        source: SHAPES_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#ff8f3d', 'circle-radius': 5, 'circle-opacity': 0.9 },
      })

      // Click handler
      map.on('click', e => handleMapClick(map, e))

      // Hover with rAF throttle
      map.on('mousemove', e => {
        const kpFeat = map.queryRenderedFeatures(e.point, { layers: ['keypad-fill'] })[0]
        if (kpFeat?.properties?.keypadId) {
          pendingHoverRef.current = {
            kind: 'KEYPAD',
            keypadId: kpFeat.properties.keypadId as string,
          }
        } else {
          const refFeat = map.queryRenderedFeatures(e.point, { layers: ['refs-point'] })[0]
          if (refFeat?.properties?.label && refFeat?.properties?.keypad) {
            pendingHoverRef.current = {
              kind: 'REF',
              label: refFeat.properties.label as string,
              keypadId: refFeat.properties.keypad as string,
            }
          } else {
            const asFeat = map.queryRenderedFeatures(e.point, { layers: ['airspaces-fill'] })[0]
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

      // Scratch layers
      map.addSource('scratch', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'scratch-line',
        type: 'line',
        source: 'scratch',
        paint: { 'line-color': '#4ba3ff', 'line-width': 2.5, 'line-opacity': 0.95 },
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
        paint: { 'circle-color': '#4ba3ff', 'circle-radius': 4, 'circle-opacity': 0.95 },
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

  // Apply layer toggles
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

  // Apply grid styling
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
  }, [layerToggles.basemap, containerRef])

  // Picasso radius helper
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

  return { mapRef, applyPicassoRadius }
}
