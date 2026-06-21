import type { CharRange, FirstSet } from '../types.ts'

export function union(a: FirstSet, b: FirstSet): FirstSet {
  if (a.kind === 'any' || b.kind === 'any') return { kind: 'any' }
  if (a.kind === 'empty') return b
  if (b.kind === 'empty') return a
  return { kind: 'ranges', ranges: mergeRanges([...a.ranges, ...b.ranges]) }
}

export function intersects(a: FirstSet, b: FirstSet): boolean {
  if (a.kind === 'any' || b.kind === 'any') return true
  if (a.kind === 'empty' || b.kind === 'empty') return false
  for (const ra of a.ranges) {
    for (const rb of b.ranges) {
      if (ra.lo <= rb.hi && rb.lo <= ra.hi) return true
    }
  }
  return false
}

export function fromChar(code: number): FirstSet {
  return { kind: 'ranges', ranges: [{ lo: code, hi: code }] }
}

export function fromRange(lo: number, hi: number): FirstSet {
  return { kind: 'ranges', ranges: [{ lo, hi }] }
}

export function any(): FirstSet {
  return { kind: 'any' }
}

export function empty(): FirstSet {
  return { kind: 'empty' }
}

function mergeRanges(ranges: CharRange[]): CharRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.lo - b.lo)
  // Always copy — never alias input objects
  const out: CharRange[] = [{ lo: sorted[0]!.lo, hi: sorted[0]!.hi }]
  for (let i = 1; i < sorted.length; i++) {
    const top = out[out.length - 1]!
    const cur = sorted[i]!
    if (cur.lo <= top.hi + 1) {
      if (cur.hi > top.hi) top.hi = cur.hi
    } else {
      out.push({ lo: cur.lo, hi: cur.hi })
    }
  }
  return out
}
