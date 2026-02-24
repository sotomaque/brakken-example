import { Button, Checkbox, TextField } from '@accelint/design-toolkit'
import { type CSSProperties, memo, useMemo } from 'react'
import { SCENARIO } from './scenario'
import { useAppStore } from './store'
import { fmtAlt, parseTimeZ, toHHMMSS } from './utils'

const TIME_REGEX = /^(\d{2}):(\d{2}):(\d{2})$/
const S_CHAT_HEADER_ROW: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' }
const S_ZULU_LABEL: CSSProperties = {
  color: 'var(--muted)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const S_TIME_INPUT: CSSProperties = {
  width: 100,
  fontFamily: "'Roboto Mono Variable', monospace",
  fontSize: 12,
}

export default memo(function HoverAndChat() {
  // Granular selectors -- only re-render when these specific slices change
  const hover = useAppStore(s => s.hover)
  const airspaces = useAppStore(s => s.airspaces)
  const shapes = useAppStore(s => s.shapes)
  const currentTimeSec = useAppStore(s => s.currentTimeSec)
  const handledEventIds = useAppStore(s => s.handledEventIds)
  const scope = useAppStore(s => s.scope)

  // Actions are stable references -- never cause re-renders
  const setCurrentTimeSec = useAppStore(s => s.setCurrentTimeSec)
  const toggleHandled = useAppStore(s => s.toggleHandled)

  const events = useMemo(() => {
    return [...SCENARIO.events].sort((a, b) => parseTimeZ(a.timeZ) - parseTimeZ(b.timeZ))
  }, [])

  const visibleEvents = useMemo(
    () => events.filter(e => parseTimeZ(e.timeZ) <= currentTimeSec),
    [events, currentTimeSec],
  )

  const hoverText = useMemo(() => {
    if (hover.kind === 'NONE')
      return 'Hover a keypad / airspace / reference point to see details here.'

    if (hover.kind === 'REF') {
      return `${hover.keypadId}/${hover.label.toUpperCase()}`
    }

    if (hover.kind === 'AIRSPACE') {
      const a = airspaces.find(x => x.id === hover.airspaceId)
      if (!a) return 'Unknown airspace'
      const alt =
        a.altitude.kind === 'SINGLE'
          ? `${a.altitude.singleFt}`
          : `${a.altitude.minFt}-${a.altitude.maxFt}`
      const kp = a.keypads.slice().sort().join(' ')
      return `${a.ownerCallsign}
${a.state} ${a.kind}
ALT ${alt} ft
${kp}`
    }

    if (hover.kind === 'SHAPE') {
      const s = shapes.find(x => x.id === hover.shapeId)
      if (!s) return 'Unknown shape'
      const tags = s.tags.join(',')
      const kp = s.derivedKeypads.slice().sort().join(' ')
      return `${s.label}
${s.shapeType} [${tags}]
${kp}`
    }

    if (hover.kind === 'KEYPAD') {
      const keypadId = hover.keypadId
      const inScope = (kp: string) => {
        if (scope.kind === 'AOR') return true
        if (scope.kind === 'KILLBOX') return kp.startsWith(scope.killbox)
        if (scope.kind === 'AREA') {
          const area = shapes.find(s => s.id === scope.areaId)
          const set = new Set(area?.derivedKeypads ?? [])
          return set.has(kp)
        }
        return true
      }
      if (!inScope(keypadId))
        return `${keypadId}
(out of scope)`

      const stack: { label: string; sortAlt: number }[] = []

      for (const s of shapes) {
        if (!s.tags.includes('ROZ')) continue
        if (!s.derivedKeypads.includes(keypadId)) continue
        const alt = s.altitude ? fmtAlt(s.altitude) : 'SFC-??'
        const sortAlt =
          s.altitude?.kind === 'SINGLE' ? s.altitude.singleFt : (s.altitude?.maxFt ?? 999999)
        stack.push({ label: `${s.label} ${alt}`, sortAlt })
      }

      for (const a of airspaces.filter(a => a.state !== 'ARCHIVED')) {
        if (!a.keypads.includes(keypadId)) continue
        const alt =
          a.altitude.kind === 'SINGLE'
            ? `${a.altitude.singleFt}`
            : `${a.altitude.minFt}-${a.altitude.maxFt}`
        const sortAlt = a.altitude.kind === 'SINGLE' ? a.altitude.singleFt : a.altitude.maxFt
        stack.push({ label: `${a.ownerCallsign} ${alt}`, sortAlt })
      }

      stack.sort((x, y) => y.sortAlt - x.sortAlt)
      const lines = [keypadId, ...stack.map(s => s.label)]
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
          <div style={S_CHAT_HEADER_ROW}>
            <span style={S_ZULU_LABEL}>Zulu</span>
            <TextField
              size="small"
              label="Zulu time"
              aria-label="Zulu time"
              inputProps={{
                value: toHHMMSS(currentTimeSec),
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const m = e.target.value.match(TIME_REGEX)
                  if (!m) return
                  const sec =
                    parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
                  setCurrentTimeSec(sec)
                },
                style: S_TIME_INPUT,
              }}
            />
            <Button
              variant="outline"
              size="small"
              onPress={() => setCurrentTimeSec(Math.max(0, currentTimeSec - 30))}
            >
              -30s
            </Button>
            <Button
              variant="outline"
              size="small"
              onPress={() => setCurrentTimeSec(currentTimeSec + 30)}
            >
              +30s
            </Button>
          </div>
        </div>

        {visibleEvents.map(e => {
          const key = `${e.timeZ}::${e.text.slice(0, 18)}`
          const handled = !!handledEventIds[key]
          return (
            <div key={key} className="event">
              <div className="eventTop">
                <div className="time">{e.timeZ}</div>
                <Checkbox isSelected={handled} onChange={() => toggleHandled(key)}>
                  handled
                </Checkbox>
              </div>
              <div className="mono">{e.text}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
