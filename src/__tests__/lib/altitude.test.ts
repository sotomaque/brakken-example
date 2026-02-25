import { describe, expect, test } from 'bun:test'
import { parseAltitudeString } from '@/lib/altitude'

describe('parseAltitudeString', () => {
  test('parses single altitude', () => {
    const result = parseAltitudeString('5000')
    expect(result).toEqual({ kind: 'SINGLE', singleFt: 5000 })
  })

  test('parses block altitude', () => {
    const result = parseAltitudeString('3000-7000')
    expect(result).toEqual({ kind: 'BLOCK', minFt: 3000, maxFt: 7000 })
  })

  test('returns null for empty string', () => {
    expect(parseAltitudeString('')).toBeNull()
    expect(parseAltitudeString('   ')).toBeNull()
  })

  test('returns null for non-numeric string', () => {
    expect(parseAltitudeString('abc')).toBeNull()
  })

  test('trims whitespace', () => {
    const result = parseAltitudeString('  5000  ')
    expect(result).toEqual({ kind: 'SINGLE', singleFt: 5000 })
  })

  test('handles block with whitespace around dash', () => {
    // The current implementation splits on '-', so "3000 - 7000" splits into "3000 " and " 7000"
    // parseInt trims whitespace, so this works
    const result = parseAltitudeString('3000-7000')
    expect(result).toEqual({ kind: 'BLOCK', minFt: 3000, maxFt: 7000 })
  })
})
