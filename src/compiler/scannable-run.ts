/**
 * Structural recognition of "scannable" parser arms — regex shapes that lower to
 * a tight character-scan loop instead of `regex.exec` / combinator dispatch. Each
 * shape is derived from the regex STRUCTURE, not from any hardcoded knowledge
 * that a given regex "is whitespace" or "is a comment":
 *
 *   [X]+ / [X]*            → run while the char ∈ X                (chars)
 *   <lit>[^X]*             → consume <lit>, run until char ∈ X     (until)
 *   <open>(?:…)*<close>    → consume <open>, run to <close> literal (delimited)
 *
 * A `oneOrMore(choice(a, b, …))` where every arm is one of these compiles to a
 * single char-dispatch loop with one branch per arm — any count/order, because
 * the shapes dispatch on their first 1–2 chars and are checked in turn. Trivia
 * (whitespace + comments) is just the value-discarded instance of this; nothing
 * here is trivia-specific.
 */

export type ScanShape =
  | { kind: 'chars'; ranges: Array<[number, number]> }
  | { kind: 'until'; open: number[]; stop: Array<[number, number]> }
  | { kind: 'delimited'; open: number[]; close: number[] }

const CLASS_ESCAPES: Record<string, number> = { t: 9, n: 10, r: 13, f: 12, v: 11, '0': 0 }
const META = new Set('()[]{}*+?|^$.'.split(''))

/** Parse a regex char-class body (chars between `[` and `]`) to code-point ranges. */
function parseClassRanges(body: string): Array<[number, number]> | null {
  const ranges: Array<[number, number]> = []
  let i = 0
  const readCp = (): number | null => {
    const ch = body[i]
    if (ch === undefined) return null
    if (ch === '\\') {
      const e = body[i + 1]
      if (e === undefined) return null
      i += 2
      return e in CLASS_ESCAPES ? CLASS_ESCAPES[e]! : e.codePointAt(0)!
    }
    i += ch.length
    return ch.codePointAt(0)!
  }
  while (i < body.length) {
    const lo = readCp()
    if (lo === null) return null
    if (body[i] === '-' && body[i + 1] !== undefined && body[i + 1] !== ']') {
      i += 1
      const hi = readCp()
      if (hi === null) return null
      ranges.push([lo, hi])
    } else {
      ranges.push([lo, lo])
    }
  }
  return ranges.length ? ranges : null
}

/** All-literal regex fragment (`\/\*`, `\/\/`, …) → its code points, or null on an unescaped metachar. */
function literalCodePoints(frag: string): number[] | null {
  const out: number[] = []
  let i = 0
  while (i < frag.length) {
    const ch = frag[i]!
    if (ch === '\\') {
      const e = frag[i + 1]
      if (e === undefined) return null
      out.push(e in CLASS_ESCAPES ? CLASS_ESCAPES[e]! : e.codePointAt(0)!)
      i += 2
      continue
    }
    if (META.has(ch)) return null
    out.push(ch.codePointAt(0)!)
    i += 1
  }
  return out.length ? out : null
}

/**
 * Recognize one scannable arm from its regex source, or null if it isn't one of
 * the three structural shapes. Order matters: char-class run, then
 * open-until-terminator, then delimited.
 */
export function parseScanShape(source: string): ScanShape | null {
  // [X]+ / [X]* — a positive char-class run (a leading `^` negation is not one).
  let m = /^\[((?:\\.|[^\]])+)\]([+*])$/.exec(source)
  if (m) {
    if (m[1]!.startsWith('^')) return null
    const ranges = parseClassRanges(m[1]!)
    return ranges ? { kind: 'chars', ranges } : null
  }
  // <lit>[^X]* — consume a literal opener, then run until a terminator char.
  m = /^(.*?)\[\^((?:\\.|[^\]])+)\]\*$/.exec(source)
  if (m) {
    const open = literalCodePoints(m[1]!)
    const stop = parseClassRanges(m[2]!)
    if (open && stop) return { kind: 'until', open, stop }
    return null
  }
  // <open>(?:…)*<close> — delimited token scanned to its first close literal.
  // Reject escape-aware bodies (a literal `\\` in the source ⇒ string-like), where
  // "scan to first close" would wrongly stop at an escaped delimiter.
  if (!source.includes('\\\\')) {
    m = /^(.*?)\((?:\?:)?[\s\S]*\)\*(.*?)$/.exec(source)
    if (m && m[1] && m[2]) {
      const open = literalCodePoints(m[1])
      const close = literalCodePoints(m[2])
      if (open && close) return { kind: 'delimited', open, close }
    }
  }
  return null
}

const classCond = (cVar: string, ranges: Array<[number, number]>): string =>
  ranges
    .map(([lo, hi]) => (lo === hi ? `${cVar} === ${lo}` : `(${cVar} >= ${lo} && ${cVar} <= ${hi})`))
    .join(' || ')

/** Literal-match condition at `base + k` for each code point; uses `firstVar` at offset 0. */
const litCond = (base: string, cps: number[], firstVar?: string): string =>
  cps
    .map((cp, k) =>
      k === 0 && firstVar
        ? `${firstVar} === ${cp}`
        : `input.charCodeAt(${base}${k ? ` + ${k}` : ''}) === ${cp}`,
    )
    .join(' && ')

/**
 * One loop branch for a shape, dispatched on the current char `c` (= charCodeAt(_e)).
 * Each branch advances `_e` past the matched token and `continue`s the scan loop.
 */
export function scanBranch(shape: ScanShape): string {
  if (shape.kind === 'chars') {
    return `    if (${classCond('c', shape.ranges)}) { _e++; continue }`
  }
  if (shape.kind === 'until') {
    const stopCond = classCond('input.charCodeAt(j)', shape.stop)
    return [
      `    if (${litCond('_e', shape.open, 'c')}) {`,
      `      let j = _e + ${shape.open.length}`,
      `      while (j < input.length && !(${stopCond})) j++`,
      `      _e = j`,
      `      continue`,
      `    }`,
    ].join('\n')
  }
  const n = shape.close.length
  return [
    `    if (${litCond('_e', shape.open, 'c')}) {`,
    `      let j = _e + ${shape.open.length}`,
    `      while (j + ${n - 1} < input.length && !(${litCond('j', shape.close)})) j++`,
    `      _e = ${n === 1 ? 'j + 1 <= input.length ? j + 1 : input.length' : `j + ${n} <= input.length ? j + ${n} : input.length`}`,
    `      continue`,
    `    }`,
  ].join('\n')
}
