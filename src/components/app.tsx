import { uuid } from '@accelint/core'
import {
  Button,
  ClassificationBanner,
  Drawer,
  DrawerContent,
  DrawerLayout,
  DrawerLayoutMain,
  DrawerPanel,
  DrawerTrigger,
  DrawerView,
} from '@accelint/design-toolkit'
import { PanelClosed, PanelOpen } from '@accelint/icons'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useDrawCompletion } from '@/hooks/use-draw-completion'
import CreateAirspaceModal from './create-airspace-modal'
import HoverAndChat from './hover-and-chat'
import RightPanel from './right-panel'

const MapView = dynamic(() => import('./map-view'), { ssr: false })
const SpamAd = dynamic(() => import('./spam-ad'), { ssr: false, loading: () => null })

const S_GRID = { display: 'grid', gridTemplateRows: '1fr auto', height: '100%' } as const
const S_DRAWER_LAYOUT: React.CSSProperties = { height: '100vh' }
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
  const { modalOpen, modalTitle, modalNote, handleModalClose, handleModalCreate } =
    useDrawCompletion()
  const [drawerOpen, setDrawerOpen] = useState(true)

  return (
    <>
      <SpamAd />
      <ClassificationBanner variant="unclassified" />
      <DrawerLayout push="right" style={S_DRAWER_LAYOUT}>
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
            <DrawerView id={VIEW_ID}>
              <DrawerContent>
                <div style={S_GRID}>
                  <RightPanel />
                  <HoverAndChat />
                </div>
              </DrawerContent>
            </DrawerView>
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
