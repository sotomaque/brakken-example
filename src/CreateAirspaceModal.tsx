import React, { useMemo, useState } from 'react'
import type { Altitude, AirspaceState } from './types'

type Props = {
  open: boolean
  title: string
  defaultCallsign?: string
  onClose: () => void
  onCreate: (payload: { callsign: string; altitude: Altitude; state: AirspaceState }) => void
  note?: string
}

export default function CreateAirspaceModal({ open, title, defaultCallsign, onClose, onCreate, note }: Props) {
  const [callsign, setCallsign] = useState(defaultCallsign ?? '')
  const [state, setState] = useState<AirspaceState>('PLANNED')
  const [altMode, setAltMode] = useState<'SINGLE'|'BLOCK'>('SINGLE')
  const [singleFt, setSingleFt] = useState(3000)
  const [minFt, setMinFt] = useState(0)
  const [maxFt, setMaxFt] = useState(22000)

  const altitude: Altitude = useMemo(() => {
    return altMode === 'SINGLE'
      ? { kind:'SINGLE', singleFt: Number(singleFt) }
      : { kind:'BLOCK', minFt: Number(minFt), maxFt: Number(maxFt) }
  }, [altMode, singleFt, minFt, maxFt])

  if (!open) return null

  return (
    <div className="modalBackdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e)=>e.stopPropagation()}>
        <h3>{title}</h3>
        {note && <div className="note">{note}</div>}
        <div className="modalGrid">
          <div className="field">
            <label>Callsign / Name</label>
            <input value={callsign} onChange={(e)=>setCallsign(e.target.value)} placeholder="e.g., Rambo11" />
          </div>
          <div className="field">
            <label>State</label>
            <select value={state} onChange={(e)=>setState(e.target.value as any)}>
              <option value="PLANNED">PLANNED</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="COLD">COLD</option>
            </select>
          </div>

          <div className="field">
            <label>Altitude mode</label>
            <select value={altMode} onChange={(e)=>setAltMode(e.target.value as any)}>
              <option value="SINGLE">Single (ft)</option>
              <option value="BLOCK">Block (ft)</option>
            </select>
          </div>

          {altMode === 'SINGLE' ? (
            <div className="field">
              <label>Altitude (ft)</label>
              <input type="number" value={singleFt} onChange={(e)=>setSingleFt(parseInt(e.target.value,10) || 0)} />
            </div>
          ) : (
            <>
              <div className="field">
                <label>Min ft</label>
                <input type="number" value={minFt} onChange={(e)=>setMinFt(parseInt(e.target.value,10) || 0)} />
              </div>
              <div className="field">
                <label>Max ft</label>
                <input type="number" value={maxFt} onChange={(e)=>setMaxFt(parseInt(e.target.value,10) || 0)} />
              </div>
            </>
          )}
        </div>

        <div className="modalActions">
          <button className="smallBtn" onClick={onClose}>Cancel</button>
          <button
            className="smallBtn"
            onClick={() => {
              if (!callsign.trim()) return
              onCreate({ callsign: callsign.trim(), altitude, state })
              onClose()
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
