import maplibregl, { Map as MLMap } from 'maplibre-gl'
import { useAppStore } from './store'
import { AOR } from './utils'
import { gridLinesGeoJSON, killboxLabelsGeoJSON, keypadPolygonsGeoJSON, AOR_BOUNDS } from './grid'
import { REF_POINTS } from './referencePoints'
import { fmtAlt, keypadFromLatLon } from './utils'
import React, { useEffect, useMemo, useRef, useState } from 'react'


const GRID_LINES_SOURCE = 'grid-lines'
const GRID_LABELS_SOURCE = 'grid-labels'
const KEYPADS_SOURCE = 'keypads'
const AIRSPACES_SOURCE = 'airspaces'
const SHAPES_SOURCE = 'shapes'
const REFS_SOURCE = 'refs'

export default function MapView() {
  const mapRef = useRef<MLMap | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [toolsMinimized, setToolsMinimized] = useState(false)
  const [shortcutsMinimized, setShortcutsMinimized] = useState(false)

  const {
    mode, drawType, editMode,
    selectedKeypads, toggleKeypad,
    airspaces, shapes,
    layerToggles, gridOptions,
    setHover, hover,
    selectedId, selectAirspace, selectShape, clearSelection,
    cancelEdit,
    updateAirspace, updateShapeGeometry,
  } = useAppStore()

  const gridLines = useMemo(() => gridLinesGeoJSON(), [])
  const gridLabels = useMemo(() => killboxLabelsGeoJSON(), [])
  const keypadsGeo = useMemo(() => keypadPolygonsGeoJSON(), [])

  // Convert airspaces + shapes to GeoJSON
  const airspacesGeo = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: airspaces
        .filter(a => a.state !== 'ARCHIVED')
        .filter(a => !(a.state === 'COLD' && !a.showCold))
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
            lineWidth: a.lineWidth ?? 2.0,  // <--- NEW: defaults to 2.0 if not set
          },
          geometry: a.geometry,
        })),
    } as GeoJSON.FeatureCollection<GeoJSON.Polygon>
  }, [airspaces])

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
        properties: { id: r.id, label: r.label, keypad: r.keypad, kind: r.kind },
        geometry: { 
          type: 'Point', 
          // Safely handles whether r.pos is an array [lon, lat] or an object {lon, lat}
          coordinates: Array.isArray(r.pos) ? r.pos : [r.pos.lon, r.pos.lat] 
        },
      })),
    } as GeoJSON.FeatureCollection<GeoJSON.Point>
  }, [])

  // Drawing state (kept local to map component)
  const drawStateRef = useRef<{ active: boolean; coords: [number, number][]; }>({ active:false, coords: [] })

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          dark: {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          { id: 'dark', type: 'raster', source: 'dark' },
        ],
      },
      center: [(AOR.sw.lon + AOR.ne.lon)/2, (AOR.sw.lat + AOR.ne.lat)/2],
      zoom: 6.2,
      attributionControl: false,
    })

    mapRef.current = map
    map.on("error", (e) => {
      // @ts-ignore
      console.error("MapLibre error:", e?.error || e);
    });
    /*
    map.on('styleimagemissing', async (e) => {
      const id = e.id
      const lookup: Record<string, string> = {
        'icon-ship': '/icons/ship.png',
        'icon-afb': '/icons/afb.png',
        'icon-fob': '/icons/fob.png',
      }
      const url = lookup[id]
      if (!url) return
    
      try {
        const img = await loadPng(map, url)
        if (!map.hasImage(id)) map.addImage(id, img)
        console.log(`[icons] styleimagemissing resolved ${id}`)
      } catch (err) {
        console.error(`[icons] styleimagemissing FAILED ${id}`, err)
      }
    })
    */
    map.on("load", () => console.log("MapLibre: load fired"));
    map.on("styledata", () => console.log("MapLibre: styledata"));

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')


    map.on('load', async () => {
      // 1) Sources
      map.addSource(GRID_LINES_SOURCE, { type:'geojson', data: gridLines })
      map.addSource(GRID_LABELS_SOURCE, { type:'geojson', data: gridLabels })
      map.addSource(KEYPADS_SOURCE, { type:'geojson', data: keypadsGeo })
      map.addSource(AIRSPACES_SOURCE, { type:'geojson', data: airspacesGeo })
      map.addSource(SHAPES_SOURCE, { type:'geojson', data: shapesGeo })
      map.addSource(REFS_SOURCE, { type:'geojson', data: refsGeo })
      
/*
      // 2) Icons must exist BEFORE symbol layers that reference them
      const iconDefs = [
        { id: 'icon-ship', url: '/icons/ship.png' },
        { id: 'icon-afb',  url: '/icons/afb.png'  },
        { id: 'icon-fob',  url: '/icons/fob.png'  },
      ];
      
      for (const d of iconDefs) {
        if (map.hasImage(d.id)) continue;
        
        try {
          // try/catch is now INSIDE the loop so one failure doesn't break everything
          const img = await new Promise<HTMLImageElement | ImageBitmap>((resolve, reject) => {
            map.loadImage(d.url, (err, image) => {
              if (err) return reject(err);
              if (!image) return reject(new Error(`No image returned for ${d.url}`));
              resolve(image);
            });
          });
          map.addImage(d.id, img);
          console.log(`[icons] Successfully loaded ${d.id}`);
        } catch (e) {
          console.error(`[icons] Failed to load ${d.id} from ${d.url}:`, e);
        }
      }
*/


      // 1. Colored circles for reference points
      map.addLayer({
        id: 'refs-point',
        type: 'circle',
        source: REFS_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'SHIP', '#00bcd4', // Cyan
            'AFB',  '#ff9800', // Orange
            'FOB',  '#4caf50', // Green
            '#ffffff'
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#000000'
        }
      });

      // 2. Text labels for reference points
      map.addLayer({
        id: 'refs-label',
        type: 'symbol',
        source: REFS_SOURCE,
        layout: {
          'text-field': ['get','label'],
          'text-size': 12,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          // Removed 'text-font' to prevent font-loading crashes
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#9bd1ff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.2,
          'text-opacity': 0.95,
        },
      });
      
      // Basemap toggle: easiest is to set style layers visibility, but the style is remote.
      // For prototype, keep basemap always on; toggle just dims it via fog-like raster opacity by applying a CSS filter to container.
      // (We implement the toggle outside map via overlay opacity; see below.)

      // Keypad polygons (transparent fill) for hover/click
      map.addLayer({
        id: 'keypad-fill',
        type: 'fill',
        source: KEYPADS_SOURCE,
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 0.0001,
        },
      })

      // Selection highlight for selected keypads
      map.addLayer({
        id: 'keypad-selected',
        type: 'fill',
        source: KEYPADS_SOURCE,
        paint: {
          'fill-color': '#4ba3ff',
          'fill-opacity': 0.20,
        },
        filter: ['in', ['get','keypadId'], ['literal', []]],
      })

      // Grid lines
      map.addLayer({
        id: 'grid-killbox',
        type: 'line',
        source: GRID_LINES_SOURCE,
        filter: ['==', ['get','kind'], 'KILLBOX'],
        paint: {
          'line-color': gridOptions.gridColor,
          'line-opacity': gridOptions.gridOpacity,
          'line-width': gridOptions.killboxLineWidth,
        },
      })
      map.addLayer({
        id: 'grid-keypad',
        type: 'line',
        source: GRID_LINES_SOURCE,
        filter: ['==', ['get','kind'], 'KEYPAD'],
        paint: {
          'line-color': gridOptions.gridColor,
          'line-opacity': gridOptions.gridOpacity * 0.8,
          'line-width': gridOptions.keypadLineWidth,
        },
      })

      // Killbox labels
      map.addLayer({
        id: 'grid-labels',
        type: 'symbol',
        source: GRID_LABELS_SOURCE,
        layout: {
          'text-field': ['get','label'],
          'text-size': gridOptions.labelFontSize,
          //'text-font': ['Noto Sans Regular', 'Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': gridOptions.gridColor,
          'text-opacity': gridOptions.labelOpacity,
          'text-halo-color': '#000000',
          'text-halo-width': 1.2,
        },
      })

      // Master color logic: uses custom color if present, else default state color
      const airspaceColorLogic: maplibregl.Expression = [
        'coalesce',
        ['get', 'color'],
        [
          'match', ['get','state'],
          'ACTIVE', '#3cff9e',
          'COLD', '#ffd24b',
          'PLANNED', '#4ba3ff',
          '#999999'
        ]
      ];

      // Airspaces polygon fill
      map.addLayer({
        id: 'airspaces-fill',
        type: 'fill',
        source: AIRSPACES_SOURCE,
        paint: {
          'fill-color': airspaceColorLogic,
          'fill-opacity': ['case', ['==', ['get', 'showFill'], false], 0, 0.20],
        },
      })

      // ACTIVE Outline (Solid)
      map.addLayer({
        id: 'airspaces-outline-active',
        type: 'line',
        source: AIRSPACES_SOURCE,
        filter: ['==', ['get', 'state'], 'ACTIVE'],
        paint: { 'line-color': airspaceColorLogic, 'line-width': ['get', 'lineWidth'], 'line-opacity': 0.9 },
      })

      // PLANNED Outline (Dashed)
      map.addLayer({
        id: 'airspaces-outline-planned',
        type: 'line',
        source: AIRSPACES_SOURCE,
        filter: ['==', ['get', 'state'], 'PLANNED'],
        paint: { 'line-color': airspaceColorLogic, 'line-width': ['get', 'lineWidth'], 'line-opacity': 0.9, 'line-dasharray': [4, 4] },
      })

      // COLD Outline (Dot-Dashed)
      map.addLayer({
        id: 'airspaces-outline-cold',
        type: 'line',
        source: AIRSPACES_SOURCE,
        filter: ['==', ['get', 'state'], 'COLD'],
        paint: { 'line-color': airspaceColorLogic, 'line-width': ['get', 'lineWidth'], 'line-opacity': 0.9, 'line-dasharray': [4, 2, 1, 2] },
      })

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
        paint: {
          'fill-color': '#ff8f3d',
          'fill-opacity': 0.12,
        },
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

      
      

      map.on('click', (e) => {
        const st = useAppStore.getState()
        if (st.mode === 'KEYPAD_SELECT') {
          const features = map.queryRenderedFeatures(e.point, { layers: ['keypad-fill'] })
          const keypadId = features[0]?.properties?.keypadId as string | undefined
          if (keypadId) st.toggleKeypad(keypadId)
          return
        }
        if (st.mode === 'FREEDRAW') {
          const ds = drawStateRef.current
          if (!ds.active) { ds.active = true; ds.coords = [] }
          ds.coords.push([e.lngLat.lng, e.lngLat.lat])
          updateScratch(map)
          return
        }
        const asFeat = map.queryRenderedFeatures(e.point, { layers: ['airspaces-fill'] })[0]
        if (asFeat?.properties?.id) return st.selectAirspace(asFeat.properties.id as string)
        const shFeat = map.queryRenderedFeatures(e.point, { layers: ['shapes-line','shapes-poly','shapes-point'] })[0]
        if (shFeat?.properties?.id) return st.selectShape(shFeat.properties.id as string)
        st.clearSelection()
      })
    
      map.on('mousemove', (e) => {
        const st = useAppStore.getState()
    
        const kpFeat = map.queryRenderedFeatures(e.point, { layers: ['keypad-fill'] })[0]
        if (kpFeat?.properties?.keypadId) {
          st.setHover({ kind:'KEYPAD', keypadId: kpFeat.properties.keypadId as string })
          return
        }
    
        // refs-point layer exists now, so this won't explode
        const refFeat = map.queryRenderedFeatures(e.point, { layers: ['refs-point'] })[0]
        if (refFeat?.properties?.label && refFeat?.properties?.keypad) {
          st.setHover({ kind:'REF', label: refFeat.properties.label as string, keypadId: refFeat.properties.keypad as string })
          return
        }
    
        const asFeat = map.queryRenderedFeatures(e.point, { layers: ['airspaces-fill'] })[0]
        if (asFeat?.properties?.id) {
          st.setHover({ kind:'AIRSPACE', airspaceId: asFeat.properties.id as string })
          return
        }
    
        const shFeat = map.queryRenderedFeatures(e.point, { layers: ['shapes-line','shapes-poly','shapes-point'] })[0]
        if (shFeat?.properties?.id) {
          st.setHover({ kind:'SHAPE', shapeId: shFeat.properties.id as string })
          return
        }
    
        st.setHover({ kind:'NONE' })
      })
    
      // 5) Scratch layers LAST (unchanged)
      map.addSource('scratch', { type:'geojson', data: { type:'FeatureCollection', features: [] } })
      map.addLayer({ id:'scratch-line', type:'line', source:'scratch', paint:{ 'line-color':'#4ba3ff', 'line-width':2.5, 'line-opacity':0.95 }, filter:['==',['get','g'],'line'] })
      map.addLayer({ id:'scratch-fill', type:'fill', source:'scratch', paint:{ 'fill-color':'#4ba3ff', 'fill-opacity':0.15 }, filter:['==',['get','g'],'poly'] })
      map.addLayer({ id:'scratch-pts', type:'circle', source:'scratch', paint:{ 'circle-color':'#4ba3ff', 'circle-radius':4, 'circle-opacity':0.95 }, filter:['==',['get','g'],'pt'] })
    
    })

    return () => {
      map.remove()
      mapRef.current = null
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

  // Apply layer toggles
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const setVis = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none') }

    setVis('airspaces-fill', layerToggles.airspaces)
    setVis('airspaces-outline-active', layerToggles.airspaces)
    setVis('airspaces-outline-planned', layerToggles.airspaces)
    setVis('airspaces-outline-cold', layerToggles.airspaces)
    setVis('shapes-line', layerToggles.freedraw)
    setVis('shapes-poly', layerToggles.freedraw)
    setVis('shapes-poly-outline', layerToggles.freedraw)
    setVis('shapes-point', layerToggles.freedraw)
    setVis('refs-point', layerToggles.refs)
    setVis('refs-label', layerToggles.refs)

    const gridOn = gridOptions.showGrid
    setVis('grid-killbox', gridOn)
    setVis('grid-keypad', gridOn)
    setVis('grid-labels', gridOn && gridOptions.showKillboxLabels)
  }, [layerToggles, gridOptions])

  // Apply grid styling
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const safe = (id: string) => map.getLayer(id)
    if (safe('grid-killbox')) {
      map.setPaintProperty('grid-killbox', 'line-color', gridOptions.gridColor)
      map.setPaintProperty('grid-killbox', 'line-opacity', gridOptions.gridOpacity)
      map.setPaintProperty('grid-killbox', 'line-width', gridOptions.killboxLineWidth)
    }
    if (safe('grid-keypad')) {
      map.setPaintProperty('grid-keypad', 'line-color', gridOptions.gridColor)
      map.setPaintProperty('grid-keypad', 'line-opacity', gridOptions.gridOpacity * 0.8)
      map.setPaintProperty('grid-keypad', 'line-width', gridOptions.keypadLineWidth)
    }
    if (safe('grid-labels')) {
      map.setLayoutProperty('grid-labels', 'text-size', gridOptions.labelFontSize)
      map.setPaintProperty('grid-labels', 'text-color', gridOptions.gridColor)
      map.setPaintProperty('grid-labels', 'text-opacity', gridOptions.labelOpacity)
    }
  }, [gridOptions])

  // Update keypad selection highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!map.getLayer('keypad-selected')) return
    map.setFilter('keypad-selected', ['in', ['get','keypadId'], ['literal', selectedKeypads]])
  }, [selectedKeypads])

  // Basemap toggle: for simplicity, apply CSS filter to map container
  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.style.filter = layerToggles.basemap ? 'none' : 'grayscale(1) brightness(0.7)'
  }, [layerToggles.basemap])

  // Key handling (Enter/Esc for drawing; E edit is handled at app level but we can finish/cancel here)
  /* 
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const map = mapRef.current
      if (!map) return

      if (ev.key === 'Escape') {
        // cancel drawing or edit
        const ds = drawStateRef.current
        ds.active = false
        ds.coords = []
        updateScratch(map)
        cancelEdit()
        return
      }

      if (ev.key === 'Enter') {
        if (mode !== 'FREEDRAW') return
        const ds = drawStateRef.current
        if (!ds.active) return
        const coords = ds.coords.slice()
        ds.active = false
        ds.coords = []
        updateScratch(map)
        // finish geometry -> send to store via a custom DOM event for App to open modal
        const detail = { drawType, coords }
        window.dispatchEvent(new CustomEvent('draw:complete', { detail }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, drawType, cancelEdit])
*/
// Key handling (Enter/Esc/A for drawing and selection)
useEffect(() => {
  const onKey = (ev: KeyboardEvent) => {
    // 1. Ignore shortcuts if the user is typing inside an input or textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((ev.target as HTMLElement).tagName)) {
      return;
    }

    const map = mapRef.current;
    if (!map) return;
    
    // Get fresh state directly to avoid dependency array stale-state issues
    const st = useAppStore.getState();

    if (ev.key === 'Escape') {
      // Cancel drawing or edit
      const ds = drawStateRef.current;
      ds.active = false;
      ds.coords = [];
      updateScratch(map);
      st.cancelEdit();
      
      // Also clear keypad selection if we cancel out
      if (st.mode === 'KEYPAD_SELECT') {
        st.clearSelection();
        // st.setMode('SELECT'); // Optional: kick back to default mode if your store has setMode
      }
      return;
    }

    // 2. Handling Enter (Confirm Draw or Confirm Keypad)
    if (ev.key === 'Enter') {
      if (st.mode === 'FREEDRAW') {
        const ds = drawStateRef.current;
        if (!ds.active) return;
        const coords = ds.coords.slice();
        ds.active = false;
        ds.coords = [];
        updateScratch(map);
        const detail = { drawType: st.drawType, coords };
        window.dispatchEvent(new CustomEvent('draw:complete', { detail }));
      } else if (st.mode === 'KEYPAD_SELECT' && st.selectedKeypads.length > 0) {
        // Confirm keypad selection via Enter
        window.dispatchEvent(new CustomEvent('keypad:complete', { detail: { keypads: st.selectedKeypads } }));
      }
    }

    // 3. Handling 'A' (Toggle Mode or Confirm)
    if (ev.key.toLowerCase() === 'a') {
      ev.preventDefault(); // Prevents the blue box and browser defaults!

      if (st.mode !== 'KEYPAD_SELECT') {
        // Assuming your store has a method to change the mode. 
        // Update this to match your store's exact function name if it's different!
        useAppStore.setState({ mode: 'KEYPAD_SELECT' }); 
      } else {
        // If already in KEYPAD_SELECT mode, act like we pressed Enter
        if (st.selectedKeypads.length > 0) {
          window.dispatchEvent(new CustomEvent('keypad:complete', { detail: { keypads: st.selectedKeypads } }));
        }
      }
    }
  };

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []); // Empty dependency array is fine since we use .getState() inside 

  // When an editMode redraw completes, App will call store update; map doesn't need special handling here.

  function updateScratch(map: MLMap) {
    const ds = drawStateRef.current
    const feats: any[] = []
    for (const c of ds.coords) {
      feats.push({ type:'Feature', properties:{g:'pt'}, geometry:{ type:'Point', coordinates: c } })
    }
    if (ds.coords.length >= 2) {
      feats.push({ type:'Feature', properties:{g:'line'}, geometry:{ type:'LineString', coordinates: ds.coords } })
    }
    if (drawType === 'POLYGON' && ds.coords.length >= 3) {
      feats.push({
        type:'Feature',
        properties:{g:'poly'},
        geometry:{ type:'Polygon', coordinates: [[...ds.coords, ds.coords[0]]] },
      })
    }
    const src = map.getSource('scratch') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData({ type:'FeatureCollection', features: feats } as any)
  }

    return (
    <div className="mapWrap">
      <div ref={containerRef} className="map" style={{ height: '100%' }} />

      {/* RIGHT-SIDE OVERLAY STACK */}
      <div className="mapOverlays">
        {/* SHORTCUTS (collapsible) */}
        <div className="legend">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              marginBottom: 8,
            }}
            onClick={() => setShortcutsMinimized(v => !v)}
            title="Click to expand/collapse"
          >
            <h4 style={{ margin: 0 }}>
              Shortcuts {shortcutsMinimized ? '[minimized]' : ''}
            </h4>
            <span style={{ color: '#9fb1c5', fontSize: 12 }}>
              {shortcutsMinimized ? '▸' : '▾'}
            </span>
          </div>

          {/* Mode is ALWAYS visible even when minimized */}
          <div style={{ marginBottom: 8, color: '#9fb1c5', fontSize: 12 }}>
            Mode: <b>{mode}</b> {mode === 'FREEDRAW' ? `(${drawType})` : ''}
          </div>

          {!shortcutsMinimized && (
            <>
              <div className="row"><span><kbd>A</kbd></span><span>Create airspace (keypads)</span></div>
              <div className="row"><span><kbd>F</kbd></span><span>Free draw mode</span></div>
              <div className="row"><span><kbd>E</kbd></span><span>Edit selected</span></div>
              <div className="row"><span><kbd>Enter</kbd></span><span>Confirm draw</span></div>
              <div className="row"><span><kbd>Esc</kbd></span><span>Cancel</span></div>
              <div className="row"><span><kbd>Del</kbd></span><span>Archive</span></div>
            </>
          )}
        </div>

        {/* GRID & LAYERS (collapsible) */}
        <div className="mapTools">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              marginBottom: 8,
            }}
            onClick={() => setToolsMinimized(v => !v)}
            title="Click to expand/collapse"
          >
            <h4 style={{ margin: 0 }}>
              Grid & Layers {toolsMinimized ? '[minimized]' : ''}
            </h4>
            <span style={{ color: '#9fb1c5', fontSize: 12 }}>
              {toolsMinimized ? '▸' : '▾'}
            </span>
          </div>

          {!toolsMinimized && (
            <>
              <div className="section">
                <label><span>Show grid</span><input type="checkbox" checked={gridOptions.showGrid} onChange={(e)=>useAppStore.getState().setGridOptions({showGrid:e.target.checked})} /></label>
                <label><span>Grid opacity</span><input type="range" min={0} max={1} step={0.01} value={gridOptions.gridOpacity} onChange={(e)=>useAppStore.getState().setGridOptions({gridOpacity: parseFloat(e.target.value)})} /></label>
                <label><span>Grid color</span><input type="color" value={gridOptions.gridColor} onChange={(e)=>useAppStore.getState().setGridOptions({gridColor:e.target.value})} /></label>
                <label><span>Killbox width</span><input type="range" min={1} max={8} step={1} value={gridOptions.killboxLineWidth} onChange={(e)=>useAppStore.getState().setGridOptions({killboxLineWidth: parseInt(e.target.value,10)})} /></label>
                <label><span>Keypad width</span><input type="range" min={1} max={6} step={1} value={gridOptions.keypadLineWidth} onChange={(e)=>useAppStore.getState().setGridOptions({keypadLineWidth: parseInt(e.target.value,10)})} /></label>
                <label><span>Killbox labels</span><input type="checkbox" checked={gridOptions.showKillboxLabels} onChange={(e)=>useAppStore.getState().setGridOptions({showKillboxLabels:e.target.checked})} /></label>
                <label><span>Label size</span><input type="range" min={10} max={22} step={1} value={gridOptions.labelFontSize} onChange={(e)=>useAppStore.getState().setGridOptions({labelFontSize: parseInt(e.target.value,10)})} /></label>
                <label><span>Label opacity</span><input type="range" min={0} max={1} step={0.01} value={gridOptions.labelOpacity} onChange={(e)=>useAppStore.getState().setGridOptions({labelOpacity: parseFloat(e.target.value)})} /></label>
              </div>

              <div className="section">
                <label><span>Basemap</span><input type="checkbox" checked={layerToggles.basemap} onChange={(e)=>useAppStore.getState().setLayerToggle('basemap', e.target.checked)} /></label>
                <label><span>Airspaces</span><input type="checkbox" checked={layerToggles.airspaces} onChange={(e)=>useAppStore.getState().setLayerToggle('airspaces', e.target.checked)} /></label>
                <label><span>Routes</span><input type="checkbox" checked={layerToggles.routes} onChange={(e)=>useAppStore.getState().setLayerToggle('routes', e.target.checked)} /></label>
                <label><span>Free-draw</span><input type="checkbox" checked={layerToggles.freedraw} onChange={(e)=>useAppStore.getState().setLayerToggle('freedraw', e.target.checked)} /></label>
                <label><span>ACMs (stub)</span><input type="checkbox" checked={layerToggles.acms} onChange={(e)=>useAppStore.getState().setLayerToggle('acms', e.target.checked)} /></label>
                <label><span>Reference points</span><input type="checkbox" checked={layerToggles.refs} onChange={(e)=>useAppStore.getState().setLayerToggle('refs', e.target.checked)} /></label>
              </div>
            </>
          )}

          {/* Draw type ALWAYS visible (even when minimized) */}
          <div className="section">
            <label>
              <span>Draw type</span>
              <select value={drawType} onChange={(e)=>useAppStore.getState().setDrawType(e.target.value as any)}>
                <option value="POLYGON">Polygon</option>
                <option value="ROUTE">Route line</option>
                <option value="POINT">Point</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

//function loadPng(map: MLMap, url: string): Promise<HTMLImageElement | ImageBitmap> {
//  return new Promise((resolve, reject) => {
//    (map as any).loadImage(url, (err: any, image: any) => {
//      if (err) return reject(err)
//      if (!image) return reject(new Error(`map.loadImage returned no image for: ${url}`))
//      resolve(image as HTMLImageElement | ImageBitmap)
//    })
//  })
//}


//async function ensureIcons(map: maplibregl.Map) {
//  const icons = [
//    { id: 'icon-ship', url: '/icons/ship.png' },
//    { id: 'icon-afb',  url: '/icons/afb.png' },
//    { id: 'icon-fob',  url: '/icons/fob.png' },
//  ]
//
//  for (const i of icons) {
//    if (map.hasImage(i.id)) continue
//    try {
//      const img = await loadPng(map, i.url)
//      map.addImage(i.id, img)
//      console.log(`[icons] added ${i.id} from ${i.url}`)
//    } catch (e) {
//      console.error(`[icons] FAILED ${i.id} from ${i.url}`, e)
//      // keep going so grid/layers still load
//    }
//  }
//}

