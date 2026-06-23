/**
 * Peggy CSV parser for benchmark comparison.
 * Grammar: bench/csv.pegjs  (pre-compiled → bench/csv-parser.js)
 * Regenerate: npx peggy --format es -o bench/csv-parser.js bench/csv.pegjs
 */
import { parse } from './csv-parser.js'

export function buildPeggyCSV(): (input: string) => string[][] {
  return (input: string) => parse(input) as string[][]
}
