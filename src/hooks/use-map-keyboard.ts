import {
  globalBind,
  globalUnbind,
  Keycode,
  registerHotkey,
  unregisterHotkey,
} from '@accelint/hotkey-manager'
import type { Map as MLMap } from 'maplibre-gl'
import { type MutableRefObject, useEffect } from 'react'
import { useAppStore } from '@/store'

export function useMapKeyboard(
  mapRef: MutableRefObject<MLMap | null>,
  drawStateRef: MutableRefObject<{ active: boolean; coords: [number, number][] }>,
  updateScratch: (map: MLMap) => void,
) {
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
      for (const c of cleanups) c()
      for (const m of managers) unregisterHotkey(m)
      globalUnbind()
    }
  }, [mapRef, drawStateRef, updateScratch])
}
