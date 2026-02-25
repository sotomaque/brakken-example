import type maplibregl from 'maplibre-gl'
import type { Map as MLMap } from 'maplibre-gl'
import { type MutableRefObject, useCallback, useRef } from 'react'
import { useAppStore } from '@/store'

export function useMapDrawing(_mapRef: MutableRefObject<MLMap | null>) {
  const drawStateRef = useRef<{ active: boolean; coords: [number, number][] }>({
    active: false,
    coords: [],
  })

  const updateScratch = useCallback((map: MLMap) => {
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
  }, [])

  const handleMapClick = useCallback(
    (map: MLMap, e: maplibregl.MapMouseEvent) => {
      const st = useAppStore.getState()
      if (st.mode === 'KEYPAD_SELECT') {
        const features = map.queryRenderedFeatures(e.point, { layers: ['keypad-fill'] })
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
      const asFeat = map.queryRenderedFeatures(e.point, { layers: ['airspaces-fill'] })[0]
      if (asFeat?.properties?.id) return st.selectAirspace(asFeat.properties.id as string)
      const shFeat = map.queryRenderedFeatures(e.point, {
        layers: ['shapes-line', 'shapes-poly', 'shapes-point'],
      })[0]
      if (shFeat?.properties?.id) return st.selectShape(shFeat.properties.id as string)
      st.clearSelection()
    },
    [updateScratch],
  )

  return { drawStateRef, updateScratch, handleMapClick }
}
