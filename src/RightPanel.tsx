import React, { useMemo, useState } from 'react'
import { useAppStore } from './store'
import { fmtAlt } from './utils'
import type { AirspaceReservation } from './types'

const QUICK_COLORS = [
  { label: 'Green', hex: '#3cff9e' },
  { label: 'Blue', hex: '#4ba3ff' },
  { label: 'Yellow', hex: '#ffd24b' },
  { label: 'Red', hex: '#ff4b4b' },
  { label: 'Pink', hex: '#ff4bcf' },
  { label: 'Purple', hex: '#b24bff' }
];

type ContextMenuState = { x: number; y: number; airspaceId: string } | null

export default function RightPanel() {
  const {
    aircraft, airspaces, conflicts, activeTab, setActiveTab,
    scope, setScope, shapes,
    selectedId, selectAirspace,
    updateAirspace, updateAirspaceKeypadString, duplicateAirspace, deleteAirspace,
    updateAircraft,
  } = useAppStore()

  const [openId, setOpenId] = useState<string | null>(null)
  const [ctx, setCtx] = useState<ContextMenuState>(null)

  const handleAltChange = (id: string, val: string) => {
    const cleanVal = val.trim();
    if (!cleanVal) return;
    
    let newAlt: any;
    
    if (cleanVal.includes('-')) {
      const [minStr, maxStr] = cleanVal.split('-');
      const minFt = parseInt(minStr, 10);
      const maxFt = parseInt(maxStr, 10);
      if (!isNaN(minFt) && !isNaN(maxFt)) {
        newAlt = { kind: 'BLOCK', minFt, maxFt }; 
      }
    } else {
      const singleFt = parseInt(cleanVal, 10);
      if (!isNaN(singleFt)) {
        newAlt = { kind: 'SINGLE', singleFt };
      }
    }

    if (newAlt) {
      updateAirspace(id, { altitude: newAlt });
      useAppStore.getState().recomputeDerived();
    }
  };

  const conflictSet = useMemo(() => {
    const map = new Map<string, {count:number; others:string[]; overlap:string[]}>()
    for (const c of conflicts) {
      const add = (id: string, otherId: string) => {
        const prev = map.get(id) || { count: 0, others: [], overlap: [] }
        prev.count += 1
        prev.others.push(otherId)
        prev.overlap = Array.from(new Set([...prev.overlap, ...c.overlappingKeypads]))
        map.set(id, prev)
      }
      add(c.aId, c.bId)
      add(c.bId, c.aId)
    }
    return map
  }, [conflicts])

  const visibleAirspaces = useMemo(() => {
    const tabFilter = (a: AirspaceReservation) => {
      if (activeTab === 'ARCHIVED') return a.state === 'ARCHIVED'
      if (activeTab === 'ACTIVE') return a.state === 'ACTIVE'
      return a.state === 'PLANNED' || a.state === 'COLD'
    }
    let list = airspaces.filter(tabFilter)

    if (scope.kind === 'KILLBOX') {
      list = list.filter(a => a.keypads.some(k => k.startsWith(scope.killbox)))
    } else if (scope.kind === 'AREA') {
      const area = shapes.find(s => s.id === scope.areaId)
      const kp = new Set(area?.derivedKeypads ?? [])
      list = list.filter(a => a.keypads.some(k => kp.has(k)))
    }
    return list
  }, [airspaces, activeTab, scope, shapes])

  const killboxOptions = ['23AF','23AG','23AH','23AI','22AF','22AG','22AH','22AI','21AF','21AG','21AH','21AI']
  const namedAreas = shapes.filter(s => s.tags.includes('ROZ'))

  return (
    <div className="rightPanel" onClick={()=>ctx && setCtx(null)}>
      <div className="tablePanel">
        <div className="panelHeader">
          <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
            <strong>Airspace Deconfliction</strong>
            <span style={{ color:'#9fb1c5', fontSize:12 }}>Top-down keypad stack</span>
          </div>
          <div style={{ display:'flex', gap: 8 }}>
            <button className="smallBtn" onClick={()=>useAppStore.getState().setMode('KEYPAD_SELECT')}>Keypad select</button>
            <button className="smallBtn" onClick={()=>useAppStore.getState().setMode('FREEDRAW')}>Free draw</button>
          </div>
        </div>
        
        <div className="tabs">
          <button className={'tabBtn ' + (activeTab==='ACTIVE'?'active':'')} onClick={()=>setActiveTab('ACTIVE')}>Active</button>
          <button className={'tabBtn ' + (activeTab==='PLANNED'?'active':'')} onClick={()=>setActiveTab('PLANNED')}>Planned</button>
          <button className={'tabBtn ' + (activeTab==='ARCHIVED'?'active':'')} onClick={()=>setActiveTab('ARCHIVED')}>Archived</button>
        </div>

        <div className="controlsRow">
          <div>
            <label style={{ display:'block', fontSize:11, color:'#9fb1c5', marginBottom:4 }}>Scope</label>
            <select
              value={scope.kind === 'AOR' ? 'AOR' : scope.kind === 'KILLBOX' ? `K:${scope.killbox}` : `R:${scope.areaId}`}
              onChange={(e)=>{
                const v = e.target.value
                if (v === 'AOR') setScope({ kind:'AOR' })
                else if (v.startsWith('K:')) setScope({ kind:'KILLBOX', killbox: v.slice(2) })
                else if (v.startsWith('R:')) setScope({ kind:'AREA', areaId: v.slice(2) })
              }}
            >
              <option value="AOR">Entire AOR</option>
              <optgroup label="Inside Killbox">
                {killboxOptions.map(k => <option key={k} value={`K:${k}`}>{k}</option>)}
              </optgroup>
              <optgroup label="Inside Named Area (ROZ)">
                {namedAreas.length === 0 && <option disabled value="none">No ROZ areas yet</option>}
                {namedAreas.map(a => <option key={a.id} value={`R:${a.id}`}>{a.label}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, color:'#9fb1c5', marginBottom:4 }}>Conflicts</label>
            <input value={`${conflicts.length}`} readOnly />
          </div>
        </div>

        <div className="table">
          {visibleAirspaces.map((a) => {
            const conflict = conflictSet.get(a.id)
            const isOpen = openId === a.id
            const isSelected = selectedId.kind === 'AIRSPACE' && selectedId.id === a.id
            const owner = aircraft.find(x => x.callsign === a.ownerCallsign)

            return (
              <div
                key={a.id}
                className={'row ' + (conflict ? 'conflict' : '')}
                onContextMenu={(e)=>{
                  e.preventDefault()
                  setCtx({ x: e.clientX, y: e.clientY, airspaceId: a.id })
                }}
              >
                <div
                  className="rowHeader"
                  onClick={() => {
                    selectAirspace(a.id)
                    setOpenId(isOpen ? null : a.id)
                  }}
                  style={{ outline: isSelected ? '2px solid #4ba3ff' : 'none' }}
                >
                  <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
                    <strong>{a.ownerCallsign}</strong>
                    <div className="pills">
                      <span className="pill">{a.state}</span>
                      <span className="pill">{a.kind}</span>
                      <span className="pill">{fmtAlt(a.altitude)} ft</span>
                      {conflict && <span className="pill danger">CONFLICT</span>}
                    </div>
                  </div>

                  <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
                    {conflict && (
                      <button
                        className="smallBtn danger"
                        onClick={(e)=>{
                          e.stopPropagation()
                          alert(`Conflict with ${conflict.count} item(s). Overlap: ${conflict.overlap.slice(0,10).join(', ')}${conflict.overlap.length>10?'...':''}`)
                        }}
                        title="Show conflict details"
                      >
                        !
                      </button>
                    )}
                    
                    {a.state === 'COLD' && (
                      <button
                        className="smallBtn"
                        onClick={(e) => { e.stopPropagation(); updateAirspace(a.id, { showCold: !a.showCold }); }}
                      >
                        {a.showCold ? 'Hide' : 'Show'}
                      </button>
                    )}

                    <button className="smallBtn" onClick={(e)=>{ e.stopPropagation(); updateAirspace(a.id, { state: a.state==='ACTIVE' ? 'COLD' : 'ACTIVE' }) }}>
                      {a.state==='ACTIVE' ? 'Set COLD' : 'Set ACTIVE'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="rowBody">
                    <div className="field">
                      <label>Type</label>
                      <input value={owner?.type ?? ''} onChange={(e)=> owner && updateAircraft(owner.id, { type: e.target.value })} placeholder="e.g., MQ-9" />
                    </div>
                    <div className="field">
                      <label>Qty</label>
                      <input type="number" value={owner?.qty ?? 1} onChange={(e)=> owner && updateAircraft(owner.id, { qty: parseInt(e.target.value,10) || 1 })} />
                    </div>
                    <div className="field">
                      <label>Mode 2/3</label>
                      <input value={owner?.mode23 ?? ''} onChange={(e)=> owner && updateAircraft(owner.id, { mode23: e.target.value })} placeholder="e.g., 2343" />
                    </div>

                    <div className="field">
                      <label>Altitude (ft)</label>
                      <input
                        type="text"
                        defaultValue={a.altitude.kind === 'SINGLE' ? a.altitude.singleFt : `${a.altitude.minFt}-${a.altitude.maxFt}`}
                        onBlur={(e) => handleAltChange(a.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault(); 
                            handleAltChange(a.id, e.currentTarget.value);
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="e.g. 3000 or 2000-5000"
                      />
                    </div>

                    <div className="field">
                      <label>Airspace keypads</label>
                      <input
                        value={a.displayText ?? (a.keypads.map(k=>k.slice(0,4)+k.slice(4)).join(' '))}
                        onChange={(e)=>{
                          updateAirspaceKeypadString(a.id, e.target.value)
                        }}
                        disabled={a.kind !== 'KEYPAD'}
                        title={a.kind !== 'KEYPAD' ? 'Free-draw: edit geometry on map' : 'Edit keypad string'}
                      />
                    </div>

                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label>Style & Color</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px' }}>
                        
                        {/* Fill Toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 12, color: '#e6eef7', cursor: 'pointer', margin: 0 }}>
                          <input
                            type="checkbox"
                            checked={a.showFill !== false} 
                            onChange={(e) => updateAirspace(a.id, { showFill: e.target.checked })}
                          />
                          Fill airspace area
                        </label>

                        {/* NEW: Line Width Slider */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 12, color: '#e6eef7', margin: 0 }}>
                          <span>Thickness: {a.lineWidth ?? 2}</span>
                          <input
                            type="range"
                            min="1"
                            max="8"
                            step="1"
                            value={a.lineWidth ?? 2}
                            onChange={(e) => updateAirspace(a.id, { lineWidth: parseInt(e.target.value, 10) })}
                            style={{ flex: 1, cursor: 'ew-resize' }}
                          />
                        </label>

                        {/* Color Picker Swatches */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {QUICK_COLORS.map(c => (
                            <button
                              key={c.hex}
                              onClick={() => updateAirspace(a.id, { color: c.hex })}
                              style={{
                                width: 22, height: 22, borderRadius: '50%', backgroundColor: c.hex,
                                border: a.color === c.hex ? '2px solid #fff' : '2px solid transparent',
                                cursor: 'pointer', padding: 0
                              }}
                              title={c.label}
                            />
                          ))}
                          <button
                            className="smallBtn"
                            style={{ padding: '2px 8px', fontSize: 10, marginLeft: '4px' }}
                            onClick={() => updateAirspace(a.id, { color: undefined })}
                            title="Reset to default state color"
                          >
                            Reset
                          </button>
                        </div>

                      </div>
                    </div>

                    <div className="field">
                      <label>MARSA with (mutual)</label>
                      <select
                        multiple
                        value={owner?.marsaWith ?? []}
                        onChange={(e)=>{
                          if (!owner) return
                          const selected = Array.from(e.target.selectedOptions).map(o => o.value)
                          updateAircraft(owner.id, { marsaWith: selected })
                          useAppStore.getState().recomputeDerived()
                        }}
                      >
                        {aircraft.filter(x=>x.callsign!==a.ownerCallsign).map(x => (
                          <option key={x.id} value={x.callsign}>{x.callsign}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field" style={{ gridColumn:'span 2' }}>
                      <label>Notes</label>
                      <textarea value={owner?.notes ?? ''} onChange={(e)=> owner && updateAircraft(owner.id, { notes: e.target.value })} />
                    </div>

                    <div style={{ display:'flex', gap: 8, gridColumn:'span 2', justifyContent:'flex-end' }}>
                      <button className="smallBtn" onClick={()=>useAppStore.getState().startEditSelected()}>Edit (E)</button>
                      <button className="smallBtn danger" onClick={()=>useAppStore.getState().archiveSelected()}>Archive</button>
                      {activeTab === 'ARCHIVED' && (
                        <button className="smallBtn danger" onClick={()=>deleteAirspace(a.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {ctx && (
        <div
          style={{
            position:'fixed',
            left: ctx.x,
            top: ctx.y,
            background:'#0f1520',
            border:'1px solid #233041',
            borderRadius:10,
            padding:8,
            zIndex: 60,
            minWidth: 180,
          }}
          onMouseDown={(e)=>e.stopPropagation()}
        >
          <div style={{ fontSize:12, color:'#9fb1c5', marginBottom:8 }}>Row actions</div>
          <button className="smallBtn" style={{ width:'100%', marginBottom:6 }} onClick={()=>{ duplicateAirspace(ctx.airspaceId); setCtx(null) }}>Duplicate</button>
          <button className="smallBtn danger" style={{ width:'100%' }} onClick={()=>{ useAppStore.getState().updateAirspace(ctx.airspaceId, { state:'ARCHIVED' }); setCtx(null) }}>Archive</button>
        </div>
      )}
    </div>
  )
}