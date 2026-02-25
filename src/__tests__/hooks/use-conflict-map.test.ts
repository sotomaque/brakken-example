import { describe, expect, test } from 'bun:test'
import { buildConflictMap } from '@/hooks/use-conflict-map'
import type { Conflict } from '@/store'

describe('buildConflictMap', () => {
  test('empty conflicts returns empty map', () => {
    const result = buildConflictMap([])
    expect(result.size).toBe(0)
  })

  test('single conflict creates entries for both sides', () => {
    const conflicts: Conflict[] = [
      { aId: 'a1', bId: 'a2', reason: 'altitude overlap', overlappingKeypads: ['23AF5'] },
    ]
    const result = buildConflictMap(conflicts)
    expect(result.size).toBe(2)
    expect(result.get('a1')?.count).toBe(1)
    expect(result.get('a1')?.others).toEqual(['a2'])
    expect(result.get('a1')?.overlap).toEqual(['23AF5'])
    expect(result.get('a2')?.others).toEqual(['a1'])
  })

  test('multiple conflicts accumulate', () => {
    const conflicts: Conflict[] = [
      { aId: 'a1', bId: 'a2', reason: 'r1', overlappingKeypads: ['23AF5'] },
      { aId: 'a1', bId: 'a3', reason: 'r2', overlappingKeypads: ['23AF6'] },
    ]
    const result = buildConflictMap(conflicts)
    const a1 = result.get('a1')!
    expect(a1.count).toBe(2)
    expect(a1.others).toEqual(['a2', 'a3'])
    expect(a1.overlap.sort()).toEqual(['23AF5', '23AF6'])
  })

  test('overlapping keypads are deduplicated', () => {
    const conflicts: Conflict[] = [
      { aId: 'a1', bId: 'a2', reason: 'r1', overlappingKeypads: ['23AF5', '23AF6'] },
      { aId: 'a1', bId: 'a3', reason: 'r2', overlappingKeypads: ['23AF5', '23AF7'] },
    ]
    const result = buildConflictMap(conflicts)
    const a1 = result.get('a1')!
    // 23AF5 appears in both conflicts but should be deduplicated
    expect(a1.overlap.sort()).toEqual(['23AF5', '23AF6', '23AF7'])
  })
})
