import { Button, Checkbox, TextField } from '@accelint/design-toolkit'
import { type CSSProperties, memo, useMemo } from 'react'
import { useHoverText } from '@/hooks/use-hover-text'
import { SCENARIO } from '@/lib/scenario'
import { parseTimeZ, toHHMMSS } from '@/lib/utils'
import { useAppStore } from '@/store'

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

const SORTED_EVENTS = [...SCENARIO.events].sort((a, b) => parseTimeZ(a.timeZ) - parseTimeZ(b.timeZ))

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

  const visibleEvents = useMemo(
    () => SORTED_EVENTS.filter(e => parseTimeZ(e.timeZ) <= currentTimeSec),
    [currentTimeSec],
  )

  const hoverText = useHoverText(hover, airspaces, shapes, scope)

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
              onPress={() => {
                const cur = useAppStore.getState().currentTimeSec
                setCurrentTimeSec(Math.max(0, cur - 30))
              }}
            >
              -30s
            </Button>
            <Button
              variant="outline"
              size="small"
              onPress={() => {
                const cur = useAppStore.getState().currentTimeSec
                setCurrentTimeSec(cur + 30)
              }}
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
