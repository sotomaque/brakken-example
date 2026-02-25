import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  OptionsItem,
  SelectField,
  TextField,
} from '@accelint/design-toolkit'
import { type CSSProperties, memo, useEffect, useState } from 'react'
import type { AirspaceState, Altitude } from '@/lib/types'

const S_MODAL_GRID: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
const S_NOTE: CSSProperties = { margin: '0 0 12px 0' }

type Props = {
  open: boolean
  title: string
  defaultCallsign?: string
  onClose: () => void
  onCreate: (payload: { callsign: string; altitude: Altitude; state: AirspaceState }) => void
  note?: string
}

export default memo(function CreateAirspaceModal({
  open,
  title,
  defaultCallsign,
  onClose,
  onCreate,
  note,
}: Props) {
  const [callsign, setCallsign] = useState(defaultCallsign ?? '')
  const [state, setState] = useState<AirspaceState>('PLANNED')
  const [altMode, setAltMode] = useState<'SINGLE' | 'BLOCK'>('SINGLE')
  const [singleFt, setSingleFt] = useState(3000)
  const [minFt, setMinFt] = useState(0)
  const [maxFt, setMaxFt] = useState(22000)

  // Reset form state when modal opens (fix 1.8: state persists since component stays mounted)
  useEffect(() => {
    if (open) {
      setCallsign(defaultCallsign ?? '')
      setState('PLANNED')
      setAltMode('SINGLE')
      setSingleFt(3000)
      setMinFt(0)
      setMaxFt(22000)
    }
  }, [open, defaultCallsign])

  // Compute inline instead of useMemo -- trivial conditional (fix 5d)
  const altitude: Altitude =
    altMode === 'SINGLE'
      ? { kind: 'SINGLE', singleFt: Number(singleFt) }
      : { kind: 'BLOCK', minFt: Number(minFt), maxFt: Number(maxFt) }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={isOpen => {
        if (!isOpen) onClose()
      }}
      isDismissable
      size="small"
    >
      {({ close }) => (
        <>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            {note ? (
              <p className="fg-primary-muted text-body-s" style={S_NOTE}>
                {note}
              </p>
            ) : null}
            <div style={S_MODAL_GRID}>
              <TextField
                label="Callsign / Name"
                inputProps={{
                  value: callsign,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCallsign(e.target.value),
                  placeholder: 'e.g., Rambo11',
                }}
                size="medium"
              />
              <SelectField
                label="State"
                selectedKey={state}
                onSelectionChange={key => setState(key as AirspaceState)}
                size="medium"
              >
                <OptionsItem id="PLANNED">PLANNED</OptionsItem>
                <OptionsItem id="ACTIVE">ACTIVE</OptionsItem>
                <OptionsItem id="COLD">COLD</OptionsItem>
              </SelectField>

              <SelectField
                label="Altitude mode"
                selectedKey={altMode}
                onSelectionChange={key => setAltMode(key as 'SINGLE' | 'BLOCK')}
                size="medium"
              >
                <OptionsItem id="SINGLE">Single (ft)</OptionsItem>
                <OptionsItem id="BLOCK">Block (ft)</OptionsItem>
              </SelectField>

              {altMode === 'SINGLE' ? (
                <TextField
                  label="Altitude (ft)"
                  inputProps={{
                    type: 'number',
                    value: String(singleFt),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      setSingleFt(parseInt(e.target.value, 10) || 0),
                  }}
                  size="medium"
                />
              ) : (
                <>
                  <TextField
                    label="Min ft"
                    inputProps={{
                      type: 'number',
                      value: String(minFt),
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        setMinFt(parseInt(e.target.value, 10) || 0),
                    }}
                    size="medium"
                  />
                  <TextField
                    label="Max ft"
                    inputProps={{
                      type: 'number',
                      value: String(maxFt),
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        setMaxFt(parseInt(e.target.value, 10) || 0),
                    }}
                    size="medium"
                  />
                </>
              )}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button
              variant="outline"
              size="small"
              onPress={() => {
                close()
                onClose()
              }}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              color="accent"
              size="small"
              isDisabled={!callsign.trim()}
              onPress={() => {
                if (!callsign.trim()) return
                onCreate({ callsign: callsign.trim(), altitude, state })
                close()
                onClose()
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  )
})
