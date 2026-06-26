import { expect } from 'vitest'
import type { Combinator, ParseResult } from '../../src/index.ts'
import { parse } from '../../src/index.ts'

export function assertParseOk<T>(r: ParseResult<T>): asserts r is Extract<ParseResult<T>, { ok: true }> {
  expect(r.ok).toBe(true)
}

export function parseValue<T>(
  combinator: Combinator<T>,
  input: string,
  opts: Parameters<typeof parse<T>>[2] = {},
): T {
  const r = parse(combinator, input, opts)
  assertParseOk(r)
  return r.value
}
