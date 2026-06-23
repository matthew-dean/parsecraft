/**
 * Peggy JSON parser for benchmark comparison.
 * Grammar: bench/json.pegjs  (pre-compiled → bench/json-parser.js)
 * Regenerate: npx peggy --format es -o bench/json-parser.js bench/json.pegjs
 */
import { parse } from './json-parser.js'

export function buildPeggyJSON(): (input: string) => unknown {
  return (input: string) => parse(input.trim())
}
