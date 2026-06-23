/**
 * JSONL (newline-delimited JSON) parser.
 *
 * Extends the base JSON parser with one combinator:
 * one value per line, lines separated by '\n'.
 *
 * Format: https://jsonlines.org
 *
 * Uses horizontal-only trivia (spaces and tabs) so that '\n' stays available
 * as the line separator rather than being consumed by whitespace skipping.
 */
import { regex, sepBy, trivia, literal, parser, parse } from '../../src/index.ts'
import { jsonValue, type JSONValue } from './parser.ts'

const lineWs = trivia(regex(/[ \t]*/))

export const jsonl = parser({ trivia: lineWs }, sepBy(jsonValue, literal('\n')))

export function parseJSONL(input: string): JSONValue[] {
  const result = jsonl.parse(input.trim())
  if (!result.ok) throw new SyntaxError(`JSONL parse error at offset ${result.span.start}`)
  return result.value
}
