import { useMemo } from 'react'
import type { Conflict } from '@/store'

export type ConflictInfo = { count: number; others: string[]; overlap: string[] }

export function buildConflictMap(conflicts: Conflict[]): Map<string, ConflictInfo> {
  const map = new Map<string, ConflictInfo>()
  const overlapSets = new Map<string, Set<string>>()

  for (const c of conflicts) {
    const add = (id: string, otherId: string) => {
      let info = map.get(id)
      if (!info) {
        info = { count: 0, others: [], overlap: [] }
        map.set(id, info)
      }
      info.count += 1
      info.others.push(otherId)
      let s = overlapSets.get(id)
      if (!s) {
        s = new Set()
        overlapSets.set(id, s)
      }
      for (const kp of c.overlappingKeypads) s.add(kp)
    }
    add(c.aId, c.bId)
    add(c.bId, c.aId)
  }

  for (const [id, info] of map) {
    info.overlap = Array.from(overlapSets.get(id)!)
  }

  return map
}

export function useConflictMap(conflicts: Conflict[]): Map<string, ConflictInfo> {
  return useMemo(() => buildConflictMap(conflicts), [conflicts])
}
