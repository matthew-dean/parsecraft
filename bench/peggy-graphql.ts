/**
 * Peggy graphql parser for benchmark comparison.
 * Grammar: bench/graphql.pegjs  (pre-compiled → bench/graphql-parser.js)
 * Regenerate: npx peggy --format es -o bench/graphql-parser.js bench/graphql.pegjs
 */
import { parse } from './graphql-parser.js'

export function buildPeggyGraphQL(): (input: string) => unknown {
  return (input: string) => parse(input)
}
