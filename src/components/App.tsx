import {
  Button,
  Drawer,
  DrawerContent,
  DrawerLayout,
  DrawerLayoutMain,
  DrawerPanel,
  DrawerTrigger,
  DrawerView,
} from '@accelint/design-toolkit'
import { uuid } from '@accelint/core'
import { PanelClosed, PanelOpen } from '@accelint/icons'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import CreateAirspaceModal from './CreateAirspaceModal'
import HoverAndChat from './HoverAndChat'
import MapView from './MapView'
import RightPanel from './RightPanel'
import { type EditMode, useAppStore } from '@/store'
import type { AirspaceState, Altitude } from '@/lib/types'
import { deriveKeypadsFromPolygon } from '@/lib/utils'

const SpamAd = dynamic(() => import('./SpamAd'), { ssr: false })

type PendingCreate =
  | null
  | { kind: 'KEYPAD' }
  | { kind: 'FREEDRAW'; drawType: 'POLYGON' | 'ROUTE' | 'POINT'; coords: [number, number][] }

const S_GRID = { display: 'grid', gridTemplateRows: '1fr auto', height: '100%' } as const
const S_TOGGLE_BTN: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  zIndex: 6,
  background: 'rgba(18,25,35,0.92)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

const DRAWER_ID = uuid()
const VIEW_ID = uuid()

export default function App() {
  const [pending, setPending] = useState<PendingCreate>(null)
  const pendingRef = useRef<PendingCreate>(null)
  pendingRef.current = pending
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('Create Airspace')
  const [modalNote, setModalNote] = useState<string | undefined>(undefined)
  const [drawerOpen, setDrawerOpen] = useState(true)

  // Transient Zustand subscriptions — react to pending results without
  // subscribing in the render cycle (fixes 1.1, 1.11)
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prev) => {
      // Draw completion
      if (state.pendingDrawResult && state.pendingDrawResult !== prev.pendingDrawResult) {
        const detail = state.pendingDrawResult
        useAppStore.getState().clearPendingDraw()

        const em = useAppStore.getState().editMode
        if (em && em.kind === 'REDRAW_GEOMETRY') {
          applyRedraw(em, detail)
          useAppStore.getState().cancelEdit()
          useAppStore.getState().setMode('SELECT')
          return
        }

        setPending({ kind: 'FREEDRAW', drawType: detail.drawType, coords: detail.coords })
        if (detail.drawType === 'POLYGON') {
          setModalTitle('Create Airspace (free-draw polygon)')
          setModalNote('Polygon created. Enter callsign + altitude to create the airspace.')
          setModalOpen(true)
        } else {
          const label =
            detail.drawType === 'ROUTE'
              ? `Route-${new Date().toISOString().slice(11, 19)}`
              : `Point-${new Date().toISOString().slice(11, 19)}`
          if (detail.drawType === 'ROUTE') {
            useAppStore.getState().addShape({
              label,
              shapeType: 'ROUTE',
              tags: [],
              geometry: { type: 'LineString', coordinates: detail.coords },
            })
          } else {
            const p = detail.coords[detail.coords.length - 1] ?? detail.coords[0]
            useAppStore.getState().addShape({
              label,
              shapeType: 'POINT',
              tags: [],
              geometry: { type: 'Point', coordinates: p },
            })
          }
          useAppStore.getState().setMode('SELECT')
        }
      }

      // Keypad selection completion
      if (state.pendingKeypadResult && state.pendingKeypadResult !== prev.pendingKeypadResult) {
        const { keypads } = state.pendingKeypadResult
        useAppStore.getState().clearPendingKeypad()

        if (keypads.length === 0) return

        setPending({ kind: 'KEYPAD' })
        setModalTitle('Create Airspace (from keypads)')
        setModalNote(`Selected keypads: ${keypads.slice().sort().join(' ')}`)
        setModalOpen(true)
      }
    })
    return unsub
  }, [])

  function applyRedraw(
    em: Extract<EditMode, { kind: 'REDRAW_GEOMETRY' }>,
    detail: { drawType: 'POLYGON' | 'ROUTE' | 'POINT'; coords: [number, number][] },
  ) {
    const st = useAppStore.getState()
    if (em.targetType === 'AIRSPACE') {
      const src = st.airspaces.find(a => a.id === em.targetId)
      if (!src) return
      if (detail.drawType !== 'POLYGON') return
      const poly: GeoJSON.Polygon = {
        type: 'Polygon',
        coordinates: [[...detail.coords, detail.coords[0]]],
      }
      const keypads = deriveKeypadsFromPolygon(poly).sort()
      st.updateAirspace(em.targetId, { geometry: poly, keypads, kind: 'FREEDRAW' })
    } else {
      const src = st.shapes.find(s => s.id === em.targetId)
      if (!src) return
      if (detail.drawType === 'POLYGON') {
        const poly: GeoJSON.Polygon = {
          type: 'Polygon',
          coordinates: [[...detail.coords, detail.coords[0]]],
        }
        st.updateShapeGeometry(em.targetId, poly)
      } else if (detail.drawType === 'ROUTE') {
        st.updateShapeGeometry(em.targetId, { type: 'LineString', coordinates: detail.coords })
      } else {
        const p = detail.coords[detail.coords.length - 1] ?? detail.coords[0]
        st.updateShapeGeometry(em.targetId, { type: 'Point', coordinates: p })
      }
    }
  }

  const handleModalClose = useCallback(() => {
    setModalOpen(false)
    setPending(null)
    setModalNote(undefined)
  }, [])

  const handleModalCreate = useCallback(
    ({
      callsign,
      altitude,
      state,
    }: {
      callsign: string
      altitude: Altitude
      state: AirspaceState
    }) => {
      const cur = pendingRef.current
      if (!cur) return
      if (cur.kind === 'KEYPAD') {
        useAppStore.getState().createAirspaceFromKeypads({ callsign, altitude, state })
      } else if (cur.kind === 'FREEDRAW' && cur.drawType === 'POLYGON') {
        const coords = cur.coords
        if (coords.length < 3) return
        const poly: GeoJSON.Polygon = {
          type: 'Polygon',
          coordinates: [[...coords, coords[0]]],
        }
        useAppStore
          .getState()
          .createAirspaceFromPolygon({ callsign, altitude, state, polygon: poly })
      }
      useAppStore.getState().setMode('SELECT')
    },
    [],
  )

  return (
    <>
      <SpamAd />
      <DrawerLayout push="right" style={{ height: '100vh' }}>
        <DrawerLayoutMain>
          <div className="mapWrap">
            <MapView />
            <DrawerTrigger for={`toggle:${VIEW_ID}`}>
              <Button variant="icon" size="small" style={S_TOGGLE_BTN}>
                {drawerOpen ? (
                  <PanelOpen width={16} height={16} />
                ) : (
                  <PanelClosed width={16} height={16} />
                )}
              </Button>
            </DrawerTrigger>
          </div>
        </DrawerLayoutMain>

        <Drawer
          id={DRAWER_ID}
          defaultView={VIEW_ID}
          placement="right"
          size="large"
          onChange={view => setDrawerOpen(view !== null)}
        >
          <DrawerPanel>
            <DrawerContent>
              <DrawerView id={VIEW_ID}>
                <div style={S_GRID}>
                  <RightPanel />
                  <HoverAndChat />
                </div>
              </DrawerView>
            </DrawerContent>
          </DrawerPanel>
        </Drawer>

        <CreateAirspaceModal
          open={modalOpen}
          title={modalTitle}
          note={modalNote}
          onClose={handleModalClose}
          onCreate={handleModalCreate}
        />
      </DrawerLayout>
    </>
  )
}
