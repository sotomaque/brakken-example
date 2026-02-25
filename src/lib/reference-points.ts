import type { LatLon } from './types'
import { parseLatLon } from './utils'

export type RefPoint = {
  id: string
  label: string
  kind: 'AFB' | 'FOB' | 'SHIP'
  keypad: string
  pos: LatLon
}

function must(s: string) {
  const v = parseLatLon(s)
  if (!v) throw new Error('bad latlon ' + s)
  return v
}

export const REF_POINTS: RefPoint[] = [
  {
    id: 'KHIF',
    label: 'KHIF (Hill AFB)',
    kind: 'AFB',
    keypad: '22AF6',
    pos: must('N00:33.00 E121:33.00'),
  },
  {
    id: 'KTIK',
    label: 'KTIK (Tinker AFB)',
    kind: 'AFB',
    keypad: '23AI7',
    pos: must('N00:53.00 E122:43.00'),
  },

  {
    id: 'FOB_DOLPHINS',
    label: 'FOB Dolphins',
    kind: 'FOB',
    keypad: '22AI5',
    pos: must('N00:33.00 E122:53.00'),
  },
  {
    id: 'FOB_SEAHAWKS',
    label: 'FOB Seahawks',
    kind: 'FOB',
    keypad: '23AF6',
    pos: must('N01:03.00 E121:33.00'),
  },

  {
    id: 'USS_SAN_DIEGO',
    label: 'USS San Diego',
    kind: 'SHIP',
    keypad: '21AF1',
    pos: must('N00:13.00 E121:13.00'),
  },
  {
    id: 'USS_HOUSTON',
    label: 'USS Houston',
    kind: 'SHIP',
    keypad: '21AG6',
    pos: must('N00:03.00 E122:03.00'),
  },
  {
    id: 'USS_MOBILE',
    label: 'USS Mobile',
    kind: 'SHIP',
    keypad: '21AI3',
    pos: must('N00:13.00 E123:03.00'),
  },
]
