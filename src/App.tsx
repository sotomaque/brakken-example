import React, { useEffect, useMemo, useState } from 'react'
import MapView from './MapView'
import RightPanel from './RightPanel'
import HoverAndChat from './HoverAndChat'
import CreateAirspaceModal from './CreateAirspaceModal'
import { useAppStore } from './store'
import { uid, parseKeypadString, polygonFromKeypads, deriveKeypadsFromPolygon, deriveKeypadsFromLine, deriveKeypadsFromPoint } from './utils'
import type { Altitude } from './types'

type PendingCreate =
  | null
  | { kind: 'KEYPAD' }
  | { kind: 'FREEDRAW'; drawType: 'POLYGON'|'ROUTE'|'POINT'; coords: [number, number][] }

export default function App() {
  const { mode, setMode, drawType, setDrawType, selectedKeypads, createAirspaceFromKeypads, createAirspaceFromPolygon,
    addShape, editMode, cancelEdit, selectedId, archiveSelected, startEditSelected, airspaces, shapes,
    updateAirspace, updateShapeGeometry,
  } = useAppStore()

  const [pending, setPending] = useState<PendingCreate>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('Create Airspace')
  const [modalNote, setModalNote] = useState<string | undefined>(undefined)

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // 1. Guard to prevent hotkeys from firing when typing in input fields
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((ev.target as HTMLElement).tagName)) {
        return;
      }

      const key = ev.key.toLowerCase()

      if (key === 'f') {
        setMode('FREEDRAW')
        return
      }

      if (key === 'e') {
        startEditSelected()
        return
      }

      if (key === 'delete' || ev.key === 'Backspace') {
        archiveSelected()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedKeypads, setMode, startEditSelected, archiveSelected])

  // Listen for draw completion from MapView (Enter)
  useEffect(() => {
    const onComplete = (ev: Event) => {
      const ce = ev as CustomEvent
      const detail = ce.detail as { drawType: 'POLYGON'|'ROUTE'|'POINT'; coords: [number, number][] }
      // If we're in redraw mode, apply immediately without modal
      const em = useAppStore.getState().editMode
      if (em && em.kind === 'REDRAW_GEOMETRY') {
        applyRedraw(em, detail)
        useAppStore.getState().cancelEdit()
        useAppStore.getState().setMode('SELECT')
        return
      }

      // Otherwise, free draw creates either a shape (ROUTE/POINT) or an airspace (POLYGON default).
      // We treat POLYGON as airspace unless user wants to create a non-airspace free shape; we keep it simple:
      // - POLYGON => create AIRSPACE
      // - ROUTE/POINT => create FreeDrawShape
      setPending({ kind:'FREEDRAW', drawType: detail.drawType, coords: detail.coords })
      if (detail.drawType === 'POLYGON') {
        setModalTitle('Create Airspace (free-draw polygon)')
        setModalNote('Polygon created. Enter callsign + altitude to create the airspace.')
        setModalOpen(true)
      } else {
        // Create shape directly, prompt for label? Keep minimal: auto-label and create.
        const label = detail.drawType === 'ROUTE' ? `Route-${new Date().toISOString().slice(11,19)}` : `Point-${new Date().toISOString().slice(11,19)}`
        if (detail.drawType === 'ROUTE') {
          addShape({
            label,
            shapeType: 'ROUTE',
            tags: [],
            geometry: { type:'LineString', coordinates: detail.coords },
          })
        } else {
          const p = detail.coords[detail.coords.length-1] ?? detail.coords[0]
          addShape({
            label,
            shapeType: 'POINT',
            tags: [],
            geometry: { type:'Point', coordinates: p },
          })
        }
        useAppStore.getState().setMode('SELECT')
      }
    }
    window.addEventListener('draw:complete', onComplete)
    return () => window.removeEventListener('draw:complete', onComplete)
  }, [])

  // Listen for keypad selection completion from MapView (Enter or second 'A' press)
  useEffect(() => {
    const onKeypadComplete = (ev: Event) => {
      const ce = ev as CustomEvent
      const keypads = ce.detail.keypads as string[]

      if (keypads.length === 0) return
      
      setPending({ kind: 'KEYPAD' })
      setModalTitle('Create Airspace (from keypads)')
      setModalNote(`Selected keypads: ${keypads.slice().sort().join(' ')}`)
      setModalOpen(true)
    }
    
    window.addEventListener('keypad:complete', onKeypadComplete)
    return () => window.removeEventListener('keypad:complete', onKeypadComplete)
  }, [])

  function applyRedraw(em: any, detail: { drawType: 'POLYGON'|'ROUTE'|'POINT'; coords: [number, number][] }) {
    if (em.targetType === 'AIRSPACE') {
      const id = em.targetId as string
      const src = airspaces.find(a=>a.id===id)
      if (!src) return
      if (detail.drawType !== 'POLYGON') return
      const poly: GeoJSON.Polygon = { type:'Polygon', coordinates:[[...detail.coords, detail.coords[0]]] }
      const keypads = deriveKeypadsFromPolygon(poly).sort()
      updateAirspace(id, { geometry: poly, keypads, kind: 'FREEDRAW' })
    } else {
      const id = em.targetId as string
      const src = shapes.find(s=>s.id===id)
      if (!src) return
      if (detail.drawType === 'POLYGON') {
        const poly: GeoJSON.Polygon = { type:'Polygon', coordinates:[[...detail.coords, detail.coords[0]]] }
        updateShapeGeometry(id, poly)
      } else if (detail.drawType === 'ROUTE') {
        updateShapeGeometry(id, { type:'LineString', coordinates: detail.coords })
      } else {
        const p = detail.coords[detail.coords.length-1] ?? detail.coords[0]
        updateShapeGeometry(id, { type:'Point', coordinates: p })
      }
    }
  }

  return (
    <div className="app">
      <div className="mapWrap">
        <MapView />
      </div>

      <div className="rightPanel">
        <div style={{ display:'grid', gridTemplateRows:'1fr auto', height:'100%' }}>
          <RightPanel />
          <HoverAndChat />
        </div>
      </div>

      <CreateAirspaceModal
        open={modalOpen}
        title={modalTitle}
        note={modalNote}
        onClose={() => { setModalOpen(false); setPending(null); setModalNote(undefined) }}
        onCreate={({ callsign, altitude, state }) => {
          if (!pending) return
          if (pending.kind === 'KEYPAD') {
            createAirspaceFromKeypads({ callsign, altitude, state })
          } else if (pending.kind === 'FREEDRAW' && pending.drawType === 'POLYGON') {
            const coords = pending.coords
            if (coords.length < 3) return
            const poly: GeoJSON.Polygon = { type:'Polygon', coordinates:[[...coords, coords[0]]] }
            createAirspaceFromPolygon({ callsign, altitude, state, polygon: poly })
          }
          useAppStore.getState().setMode('SELECT')
        }}
      />
    </div>
  )
}
