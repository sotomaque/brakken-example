import React, { useMemo } from 'react'
import { useAppStore } from './store'
import { SCENARIO } from './scenario'
import { parseTimeZ, toHHMMSS, fmtAlt } from './utils'
import { REF_POINTS } from './referencePoints'

export default function HoverAndChat() {
  const {
    hover, airspaces, shapes, aircraft,
    currentTimeSec, setCurrentTimeSec,
    handledEventIds, toggleHandled,
    scope,
  } = useAppStore()

  // ensure scenario is loaded once
  React.useEffect(() => {
    useAppStore.setState({ scenario: SCENARIO })
  }, [])

  const events = useMemo(() => {
    // sort by timeZ
    const sorted = [...SCENARIO.events].sort((a,b)=>parseTimeZ(a.timeZ)-parseTimeZ(b.timeZ))
    return sorted
  }, [])

  const visibleEvents = useMemo(() => events.filter(e => parseTimeZ(e.timeZ) <= currentTimeSec), [events, currentTimeSec])

  const hoverText = useMemo(() => {
    if (hover.kind === 'NONE') return 'Hover a keypad / airspace / reference point to see details here.'

    if (hover.kind === 'REF') {
      return `${hover.keypadId}/${hover.label.toUpperCase()}`
    }

    if (hover.kind === 'AIRSPACE') {
      const a = airspaces.find(x=>x.id===hover.airspaceId)
      if (!a) return 'Unknown airspace'
      const alt = a.altitude.kind==='SINGLE' ? `${a.altitude.singleFt}` : `${a.altitude.minFt}-${a.altitude.maxFt}`
      const kp = a.keypads.slice().sort().join(' ')
      return `${a.ownerCallsign}
${a.state} ${a.kind}
ALT ${alt} ft
${kp}`
    }

    if (hover.kind === 'SHAPE') {
      const s = shapes.find(x=>x.id===hover.shapeId)
      if (!s) return 'Unknown shape'
      const tags = s.tags.join(',')
      const kp = s.derivedKeypads.slice().sort().join(' ')
      return `${s.label}
${s.shapeType} [${tags}]
${kp}`
    }

    if (hover.kind === 'KEYPAD') {
      const keypadId = hover.keypadId
      // stack list within scope (optional)
      const inScope = (kp: string) => {
        if (scope.kind === 'AOR') return true
        if (scope.kind === 'KILLBOX') return kp.startsWith(scope.killbox)
        if (scope.kind === 'AREA') {
          const area = shapes.find(s=>s.id===scope.areaId)
          const set = new Set(area?.derivedKeypads ?? [])
          return set.has(kp)
        }
        return true
      }
      if (!inScope(keypadId)) return `${keypadId}
(out of scope)`

      const stack: { label: string; sortAlt: number }[] = []

      // ROZ-like shapes: any shape tagged ROZ with altitude
      for (const s of shapes) {
        if (!s.tags.includes('ROZ')) continue
        if (!s.derivedKeypads.includes(keypadId)) continue
        const alt = s.altitude ? fmtAlt(s.altitude) : 'SFC-??'
        const sortAlt = s.altitude?.kind==='SINGLE' ? s.altitude.singleFt : (s.altitude?.maxFt ?? 999999)
        stack.push({ label: `${s.label} ${alt}`, sortAlt })
      }

      for (const a of airspaces.filter(a=>a.state!=='ARCHIVED')) {
        if (!a.keypads.includes(keypadId)) continue
        const alt = a.altitude.kind==='SINGLE' ? `${a.altitude.singleFt}` : `${a.altitude.minFt}-${a.altitude.maxFt}`
        const sortAlt = a.altitude.kind==='SINGLE' ? a.altitude.singleFt : a.altitude.maxFt
        stack.push({ label: `${a.ownerCallsign} ${alt}`, sortAlt })
      }

      stack.sort((x,y)=>y.sortAlt-x.sortAlt)
      const lines = [keypadId, ...stack.map(s=>s.label)]
      return lines.join('\n')
    }

    return ''
  }, [hover, airspaces, shapes, scope])

  return (
    <div className="bottomRight">
      <div className="block">
        <h3>Hover Info</h3>
        <div className="mono">{hoverText}</div>
      </div>

      <div className="chat">
        <div className="chatHeader">
          <h3>Scenario Prompts</h3>
          <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
            <span style={{ color:'#9fb1c5', fontSize:12 }}>Zulu</span>
            <input
              style={{ width: 110 }}
              value={toHHMMSS(currentTimeSec)}
              onChange={(e)=>{
                const m = e.target.value.match(/^(\d{2}):(\d{2}):(\d{2})$/)
                if (!m) return
                const sec = parseInt(m[1],10)*3600 + parseInt(m[2],10)*60 + parseInt(m[3],10)
                setCurrentTimeSec(sec)
              }}
            />
            <button className="smallBtn" onClick={()=>setCurrentTimeSec(Math.max(0, currentTimeSec-30))}>-30s</button>
            <button className="smallBtn" onClick={()=>setCurrentTimeSec(currentTimeSec+30)}>+30s</button>
          </div>
        </div>

        {visibleEvents.map((e) => {
          const key = `${e.timeZ}::${e.text.slice(0,18)}`
          const handled = !!handledEventIds[key]
          return (
            <div key={key} className="event">
              <div className="eventTop">
                <div className="time">{e.timeZ}</div>
                <label>
                  <input type="checkbox" checked={handled} onChange={()=>toggleHandled(key)} />
                  handled
                </label>
              </div>
              <div className="mono">{e.text}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
