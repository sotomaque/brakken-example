import {
  Accordion,
  AccordionGroup,
  AccordionHeader,
  AccordionPanel,
  AccordionTrigger,
  Button,
  Checkbox,
  Chip,
  OptionsItem,
  OptionsSection,
  SelectField,
  Slider,
  Tab,
  TabList,
  Tabs,
  TextAreaField,
  TextField,
} from '@accelint/design-toolkit'
import { AlertBase, Delete, Edit, Grid, PolygonTool } from '@accelint/icons'
import { type CSSProperties, type MouseEvent, memo, useCallback, useMemo, useState } from 'react'
import type { Key } from 'react-aria-components'
import { useAppStore } from './store'
import type { Aircraft, AirspaceReservation } from './types'
import { fmtAlt } from './utils'

const QUICK_COLORS = [
  { label: 'Green', hex: '#3cff9e' },
  { label: 'Blue', hex: '#4ba3ff' },
  { label: 'Yellow', hex: '#ffd24b' },
  { label: 'Red', hex: '#ff4b4b' },
  { label: 'Pink', hex: '#ff4bcf' },
  { label: 'Purple', hex: '#b24bff' },
]

// Hoisted style constants for hot-path rendering
const S_FLEX_ROW: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' }
const S_FLEX_ROW_10: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center' }
const S_FLEX_GAP8: CSSProperties = { display: 'flex', gap: 8 }
const S_SPAN2: CSSProperties = { gridColumn: 'span 2' }
const S_MUTED_SMALL: CSSProperties = { color: 'var(--muted)', fontSize: 12 }
const S_STYLE_BOX: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  background: 'rgba(0,0,0,0.2)',
  padding: '8px',
  borderRadius: '8px',
}
const S_SWATCH_ROW: CSSProperties = {
  display: 'flex',
  gap: '6px',
  alignItems: 'center',
  flexWrap: 'wrap',
}
const S_ACTIONS_ROW: CSSProperties = {
  display: 'flex',
  gap: 8,
  gridColumn: 'span 2',
  justifyContent: 'flex-end',
}
const S_ROW_BODY: CSSProperties = {
  padding: '8px 10px 10px 10px',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}
const S_SELECTED_OUTLINE: CSSProperties = { outline: '2px solid #4ba3ff' }
const S_NO_OUTLINE: CSSProperties = { outline: 'none' }
const S_TAB_LIST: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  gap: 8,
}
const S_STYLE_LABEL: CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--muted)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const S_CTX_MENU: CSSProperties = {
  position: 'fixed',
  background: 'rgba(15,21,32,0.95)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 10,
  zIndex: 60,
  minWidth: 180,
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
}
const S_CTX_LABEL: CSSProperties = {
  fontSize: 11,
  color: 'var(--muted)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const KILLBOX_OPTIONS = [
  '23AF',
  '23AG',
  '23AH',
  '23AI',
  '22AF',
  '22AG',
  '22AH',
  '22AI',
  '21AF',
  '21AG',
  '21AH',
  '21AI',
]

function handleAltChange(id: string, val: string) {
  const cleanVal = val.trim()
  if (!cleanVal) return

  let newAlt:
    | { kind: 'SINGLE'; singleFt: number }
    | { kind: 'BLOCK'; minFt: number; maxFt: number }
    | undefined

  if (cleanVal.includes('-')) {
    const [minStr, maxStr] = cleanVal.split('-')
    const minFt = parseInt(minStr, 10)
    const maxFt = parseInt(maxStr, 10)
    if (!isNaN(minFt) && !isNaN(maxFt)) {
      newAlt = { kind: 'BLOCK', minFt, maxFt }
    }
  } else {
    const singleFt = parseInt(cleanVal, 10)
    if (!isNaN(singleFt)) {
      newAlt = { kind: 'SINGLE', singleFt }
    }
  }

  if (newAlt) {
    useAppStore.getState().updateAirspace(id, { altitude: newAlt })
    useAppStore.getState().recomputeDerived()
  }
}

// ── Extracted memoized row component ──────────────────────────────────
type ConflictInfo = { count: number; others: string[]; overlap: string[] }

type AirspaceRowProps = {
  a: AirspaceReservation
  conflict: ConflictInfo | undefined
  isSelected: boolean
  owner: Aircraft | undefined
  activeTab: string
  allAircraft: Aircraft[]
  onContextMenu: (e: MouseEvent, id: string) => void
}

const chipColor = (state: string) => {
  if (state === 'ACTIVE') return 'normal' as const
  if (state === 'PLANNED') return 'info' as const
  if (state === 'COLD') return 'advisory' as const
  return 'info' as const
}

const AirspaceRow = memo(function AirspaceRow({
  a,
  conflict,
  isSelected,
  owner,
  activeTab,
  allAircraft,
  onContextMenu,
}: AirspaceRowProps) {
  return (
    <Accordion
      id={a.id}
      variant="compact"
      style={
        conflict ? { borderColor: 'var(--danger2)', background: 'rgba(177,49,49,0.12)' } : undefined
      }
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault()
        onContextMenu(e as unknown as MouseEvent, a.id)
      }}
    >
      <AccordionHeader style={isSelected ? S_SELECTED_OUTLINE : S_NO_OUTLINE}>
        <AccordionTrigger>
          <div style={S_FLEX_ROW_10}>
            <strong style={{ fontSize: 14 }}>{a.ownerCallsign}</strong>
            <div style={S_FLEX_ROW}>
              <Chip color={chipColor(a.state)} size="small">
                {a.state}
              </Chip>
              <Chip size="small">{a.kind}</Chip>
              <Chip size="small">{fmtAlt(a.altitude)} ft</Chip>
              {conflict && (
                <Chip color="critical" size="small">
                  CONFLICT
                </Chip>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <div style={S_FLEX_ROW} onClick={e => e.stopPropagation()}>
          {conflict && (
            <Button
              variant="icon"
              size="xsmall"
              color="critical"
              onPress={() => {
                alert(
                  `Conflict with ${conflict.count} item(s). Overlap: ${conflict.overlap.slice(0, 10).join(', ')}${conflict.overlap.length > 10 ? '...' : ''}`,
                )
              }}
            >
              <AlertBase width={14} height={14} />
            </Button>
          )}

          {a.state === 'COLD' && (
            <Button
              variant="outline"
              size="xsmall"
              onPress={() => useAppStore.getState().updateAirspace(a.id, { showCold: !a.showCold })}
            >
              {a.showCold ? 'Hide' : 'Show'}
            </Button>
          )}

          <Button
            variant="outline"
            size="xsmall"
            onPress={() =>
              useAppStore
                .getState()
                .updateAirspace(a.id, { state: a.state === 'ACTIVE' ? 'COLD' : 'ACTIVE' })
            }
          >
            {a.state === 'ACTIVE' ? 'Set COLD' : 'Set ACTIVE'}
          </Button>
        </div>
      </AccordionHeader>

      <AccordionPanel>
        <div style={S_ROW_BODY}>
          <TextField
            label="Type"
            size="small"
            inputProps={{
              value: owner?.type ?? '',
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                owner && useAppStore.getState().updateAircraft(owner.id, { type: e.target.value }),
              placeholder: 'e.g., MQ-9',
            }}
          />
          <TextField
            label="Qty"
            size="small"
            inputProps={{
              type: 'number',
              value: String(owner?.qty ?? 1),
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                owner &&
                useAppStore
                  .getState()
                  .updateAircraft(owner.id, { qty: parseInt(e.target.value, 10) || 1 }),
            }}
          />
          <TextField
            label="Mode 2/3"
            size="small"
            inputProps={{
              value: owner?.mode23 ?? '',
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                owner &&
                useAppStore.getState().updateAircraft(owner.id, { mode23: e.target.value }),
              placeholder: 'e.g., 2343',
            }}
          />

          <TextField
            label="Altitude (ft)"
            size="small"
            inputProps={{
              type: 'text',
              defaultValue:
                a.altitude.kind === 'SINGLE'
                  ? String(a.altitude.singleFt)
                  : `${a.altitude.minFt}-${a.altitude.maxFt}`,
              onBlur: (e: React.FocusEvent<HTMLInputElement>) =>
                handleAltChange(a.id, e.target.value),
              onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAltChange(a.id, e.currentTarget.value)
                  e.currentTarget.blur()
                }
              },
              placeholder: 'e.g. 3000 or 2000-5000',
            }}
          />

          <TextField
            label="Airspace keypads"
            size="small"
            inputProps={{
              value: a.displayText ?? a.keypads.map(k => k.slice(0, 4) + k.slice(4)).join(' '),
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                useAppStore.getState().updateAirspaceKeypadString(a.id, e.target.value),
              disabled: a.kind !== 'KEYPAD',
              title: a.kind !== 'KEYPAD' ? 'Free-draw: edit geometry on map' : 'Edit keypad string',
            }}
          />

          <div style={S_SPAN2}>
            <span style={S_STYLE_LABEL}>
              Style & Color
            </span>
            <div style={S_STYLE_BOX}>
              <Checkbox
                isSelected={a.showFill !== false}
                onChange={isSelected =>
                  useAppStore.getState().updateAirspace(a.id, { showFill: isSelected })
                }
              >
                Fill airspace area
              </Checkbox>

              <Slider
                label="Thickness"
                minValue={1}
                maxValue={8}
                step={1}
                value={a.lineWidth ?? 2}
                onChange={v =>
                  useAppStore.getState().updateAirspace(a.id, { lineWidth: v as number })
                }
                showValueLabels={false}
                layout="grid"
              />

              <div style={S_SWATCH_ROW}>
                {QUICK_COLORS.map(c => (
                  <button
                    type="button"
                    key={c.hex}
                    onClick={() => useAppStore.getState().updateAirspace(a.id, { color: c.hex })}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor: c.hex,
                      border: 'none',
                      outline: a.color === c.hex ? '2px solid #fff' : '2px solid transparent',
                      outlineOffset: 1,
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'outline-color 0.12s, transform 0.12s',
                      transform: a.color === c.hex ? 'scale(1.15)' : 'scale(1)',
                    }}
                    title={c.label}
                  />
                ))}
                <Button
                  variant="outline"
                  size="xsmall"
                  onPress={() => useAppStore.getState().updateAirspace(a.id, { color: undefined })}
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>

          <SelectField
            label="MARSA with (mutual)"
            size="small"
            selectedKey={owner?.marsaWith?.[0] ?? null}
            onSelectionChange={key => {
              if (!owner) return
              const selected = key ? [String(key)] : []
              useAppStore.getState().updateAircraft(owner.id, { marsaWith: selected })
              useAppStore.getState().recomputeDerived()
            }}
          >
            {allAircraft
              .filter(x => x.callsign !== a.ownerCallsign)
              .map(x => (
                <OptionsItem key={x.callsign} id={x.callsign}>
                  {x.callsign}
                </OptionsItem>
              ))}
          </SelectField>

          <div style={S_SPAN2}>
            <TextAreaField
              label="Notes"
              size="small"
              inputProps={{
                value: owner?.notes ?? '',
                onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  owner &&
                  useAppStore.getState().updateAircraft(owner.id, { notes: e.target.value }),
              }}
            />
          </div>

          <div style={S_ACTIONS_ROW}>
            <Button
              variant="outline"
              size="small"
              onPress={() => useAppStore.getState().startEditSelected()}
            >
              <Edit width={14} height={14} /> Edit (E)
            </Button>
            <Button
              variant="outline"
              size="small"
              color="critical"
              onPress={() => useAppStore.getState().archiveSelected()}
            >
              <Delete width={14} height={14} /> Archive
            </Button>
            {activeTab === 'ARCHIVED' && (
              <Button
                variant="outline"
                size="small"
                color="critical"
                onPress={() => useAppStore.getState().deleteAirspace(a.id)}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </AccordionPanel>
    </Accordion>
  )
})

// ── Main RightPanel ─────────────────────────────────────────────────────────
export default memo(function RightPanel() {
  // Granular selectors
  const aircraft = useAppStore(s => s.aircraft)
  const airspaces = useAppStore(s => s.airspaces)
  const conflicts = useAppStore(s => s.conflicts)
  const activeTab = useAppStore(s => s.activeTab)
  const scope = useAppStore(s => s.scope)
  const shapes = useAppStore(s => s.shapes)
  const selectedId = useAppStore(s => s.selectedId)

  const setActiveTab = useAppStore(s => s.setActiveTab)
  const setScope = useAppStore(s => s.setScope)
  const duplicateAirspace = useAppStore(s => s.duplicateAirspace)

  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(new Set())
  const [ctx, setCtx] = useState<{ x: number; y: number; airspaceId: string } | null>(null)

  const aircraftByCallsign = useMemo(
    () => new Map(aircraft.map(a => [a.callsign, a])),
    [aircraft],
  )

  const conflictSet = useMemo(() => {
    const map = new Map<string, ConflictInfo>()
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

  const namedAreas = useMemo(() => shapes.filter(s => s.tags.includes('ROZ')), [shapes])

  const scopeKey =
    scope.kind === 'AOR'
      ? 'AOR'
      : scope.kind === 'KILLBOX'
        ? `K:${scope.killbox}`
        : `R:${scope.areaId}`

  const handleRowCtx = useCallback(
    (e: MouseEvent, id: string) => setCtx({ x: e.clientX, y: e.clientY, airspaceId: id }),
    [],
  )

  return (
    <div className="rightPanel" onClick={() => ctx && setCtx(null)}>
      <div className="tablePanel">
        <div className="panelHeader">
          <div style={S_FLEX_ROW}>
            <strong>Airspace Deconfliction</strong>
            <span style={S_MUTED_SMALL}>Top-down keypad stack</span>
          </div>
          <div style={S_FLEX_GAP8}>
            <Button
              variant="outline"
              size="small"
              onPress={() => useAppStore.getState().setMode('KEYPAD_SELECT')}
            >
              <Grid width={14} height={14} /> Keypad select
            </Button>
            <Button
              variant="outline"
              size="small"
              onPress={() => useAppStore.getState().setMode('FREEDRAW')}
            >
              <PolygonTool width={14} height={14} /> Free draw
            </Button>
          </div>
        </div>

        <Tabs
          selectedKey={activeTab}
          onSelectionChange={key => setActiveTab(key as 'ACTIVE' | 'PLANNED' | 'ARCHIVED')}
        >
          <TabList style={S_TAB_LIST}>
            <Tab id="ACTIVE">Active</Tab>
            <Tab id="PLANNED">Planned</Tab>
            <Tab id="ARCHIVED">Archived</Tab>
          </TabList>
        </Tabs>

        <div className="controlsRow">
          <SelectField
            label="Scope"
            size="small"
            selectedKey={scopeKey}
            onSelectionChange={key => {
              const v = String(key)
              if (v === 'AOR') setScope({ kind: 'AOR' })
              else if (v.startsWith('K:')) setScope({ kind: 'KILLBOX', killbox: v.slice(2) })
              else if (v.startsWith('R:')) setScope({ kind: 'AREA', areaId: v.slice(2) })
            }}
          >
            <OptionsItem id="AOR">Entire AOR</OptionsItem>
            <OptionsSection header="Inside Killbox">
              {KILLBOX_OPTIONS.map(k => (
                <OptionsItem key={k} id={`K:${k}`}>
                  {k}
                </OptionsItem>
              ))}
            </OptionsSection>
            <OptionsSection header="Inside Named Area (ROZ)">
              {namedAreas.length === 0 ? (
                <OptionsItem id="none" isDisabled>
                  No ROZ areas yet
                </OptionsItem>
              ) : (
                namedAreas.map(a => (
                  <OptionsItem key={a.id} id={`R:${a.id}`}>
                    {a.label}
                  </OptionsItem>
                ))
              )}
            </OptionsSection>
          </SelectField>
          <TextField
            label="Conflicts"
            size="small"
            isReadOnly
            inputProps={{ value: `${conflicts.length}`, readOnly: true }}
          />
        </div>

        <div className="table">
          <AccordionGroup
            expandedKeys={expandedKeys}
            onExpandedChange={keys => {
              setExpandedKeys(keys)
              const arr = Array.from(keys)
              if (arr.length > 0) {
                useAppStore.getState().selectAirspace(String(arr[arr.length - 1]))
              }
            }}
          >
            {visibleAirspaces.map(a => (
              <AirspaceRow
                key={a.id}
                a={a}
                conflict={conflictSet.get(a.id)}
                isSelected={selectedId.kind === 'AIRSPACE' && selectedId.id === a.id}
                owner={aircraftByCallsign.get(a.ownerCallsign)}
                activeTab={activeTab}
                allAircraft={aircraft}
                onContextMenu={handleRowCtx}
              />
            ))}
          </AccordionGroup>
        </div>
      </div>

      {ctx && (
        <div
          style={{ ...S_CTX_MENU, left: ctx.x, top: ctx.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={S_CTX_LABEL}>
            Row actions
          </div>
          <Button
            variant="outline"
            size="small"
            onPress={() => {
              duplicateAirspace(ctx.airspaceId)
              setCtx(null)
            }}
            style={{ width: '100%', marginBottom: 6 }}
          >
            Duplicate
          </Button>
          <Button
            variant="outline"
            size="small"
            color="critical"
            onPress={() => {
              useAppStore.getState().updateAirspace(ctx.airspaceId, { state: 'ARCHIVED' })
              setCtx(null)
            }}
            style={{ width: '100%' }}
          >
            Archive
          </Button>
        </div>
      )}
    </div>
  )
})
