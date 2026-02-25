import {
  ColorPicker,
  Hotkey,
  OptionsItem,
  SelectField,
  Slider,
  Switch,
} from '@accelint/design-toolkit'
import { ChevronDown, ChevronRight, Keyboard, Layers } from '@accelint/icons'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MLMap } from 'maplibre-gl'
import { type CSSProperties, memo, useRef, useState } from 'react'
import { useMapDrawing } from '@/hooks/use-map-drawing'
import { useMapInstance } from '@/hooks/use-map-instance'
import { useMapKeyboard } from '@/hooks/use-map-keyboard'
import { useAppStore } from '@/store'

// Hoisted style constants
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

// ── Extracted tools panel — subscribes to store independently of MapView ──
const MapToolsPanel = memo(function MapToolsPanel({
  applyPicassoRadius,
}: {
  applyPicassoRadius: (r: number) => void
}) {
  const gridOptions = useAppStore(s => s.gridOptions)
  const layerToggles = useAppStore(s => s.layerToggles)
  const picassoMode = useAppStore(s => s.picassoMode)
  const picassoRadius = useAppStore(s => s.picassoRadius)
  const drawType = useAppStore(s => s.drawType)

  const [toolsMinimized, setToolsMinimized] = useState(false)

  return (
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

      {!toolsMinimized ? (
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
              onChange={v => useAppStore.getState().setGridOptions({ gridOpacity: v as number })}
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
              onChange={v => useAppStore.getState().setGridOptions({ labelFontSize: v as number })}
              showValueLabels={false}
              layout="grid"
            />
            <Slider
              label="Label opacity"
              minValue={0}
              maxValue={1}
              step={0.01}
              value={gridOptions.labelOpacity}
              onChange={v => useAppStore.getState().setGridOptions({ labelOpacity: v as number })}
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
            {picassoMode ? (
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
            ) : null}
          </div>
        </>
      ) : null}

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
  )
})

export default memo(function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shortcutsMinimized, setShortcutsMinimized] = useState(false)

  const mode = useAppStore(s => s.mode)
  const drawType = useAppStore(s => s.drawType)

  // Hooks: drawing first (creates drawStateRef), then map instance, then keyboard
  const placeholderMapRef = useRef<MLMap | null>(null)
  const { drawStateRef, updateScratch, handleMapClick } = useMapDrawing(placeholderMapRef)
  const { mapRef, applyPicassoRadius } = useMapInstance(containerRef, handleMapClick)
  // Point the placeholder at the real map for the keyboard hook
  placeholderMapRef.current = mapRef.current
  useMapKeyboard(mapRef, drawStateRef, updateScratch)

  return (
    <div className="mapWrap">
      <div ref={containerRef} className="map" style={S_MAP_HEIGHT} />

      <div className="mapOverlays">
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

          {!shortcutsMinimized ? SHORTCUTS_JSX : null}
        </div>

        <MapToolsPanel applyPicassoRadius={applyPicassoRadius} />
      </div>
    </div>
  )
})
