import type { Altitude } from './types'

/**
 * Parse an altitude string like "5000" or "3000-7000" into an Altitude object.
 * Returns null if the input is empty or unparseable.
 */
export function parseAltitudeString(val: string): Altitude | null {
  const cleanVal = val.trim()
  if (!cleanVal) return null

  if (cleanVal.includes('-')) {
    const [minStr, maxStr] = cleanVal.split('-')
    const minFt = parseInt(minStr, 10)
    const maxFt = parseInt(maxStr, 10)
    if (!Number.isNaN(minFt) && !Number.isNaN(maxFt)) {
      return { kind: 'BLOCK', minFt, maxFt }
    }
  } else {
    const singleFt = parseInt(cleanVal, 10)
    if (!Number.isNaN(singleFt)) {
      return { kind: 'SINGLE', singleFt }
    }
  }

  return null
}
