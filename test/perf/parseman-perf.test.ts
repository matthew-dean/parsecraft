import { describe, it, expect } from 'vitest'
import {
  runParsemanSuite,
  loadBaseline,
  findRegressions,
  measureMedianUs,
  loadHistory,
  historyAnchors,
} from '../../bench/parseman-perf.ts'
import { parseJSON, jsonDoc } from '../../examples/json/parser.ts'
import { compile } from '../../src/index.ts'
import { parseCSV } from '../../examples/csv/parser.ts'
import { parseGraphQL } from '../../examples/graphql/parser.ts'
import { parseConfig } from '../../examples/toml-ish/parser.ts'
import { parseExpr } from '../../examples/lang/parser.ts'
import { parseCss, parseCssCompiled } from '../../examples/css/parser.ts'
import { readCssFixture } from '../../bench/css-fixture.ts'
import { SMALL_JSON, SMALL_CSV, SMALL_GQL, SMALL_CONFIG, SMALL_EXPR } from '../../bench/fixtures.ts'

const compiledJSON = compile(jsonDoc)

describe('Parseman perf — correctness smoke', () => {
  it('all example grammars parse small fixtures', () => {
    expect(() => parseJSON(SMALL_JSON)).not.toThrow()
    expect(() => parseCSV(SMALL_CSV)).not.toThrow()
    expect(() => parseGraphQL(SMALL_GQL)).not.toThrow()
    expect(() => parseConfig(SMALL_CONFIG)).not.toThrow()
    expect(() => parseExpr(SMALL_EXPR)).not.toThrow()
    expect(parseCss(readCssFixture('selector.css')).errors).toEqual([])
    expect(parseCssCompiled(readCssFixture('selector.css')).errors).toEqual([])
  })

  it('compiled is faster than interpreted on JSON small (sanity)', () => {
    const interp = measureMedianUs(() => parseJSON(SMALL_JSON), 5_000, { samples: 5 })
    const comp = measureMedianUs(() => compiledJSON.parse(SMALL_JSON, 0), 5_000, { samples: 5 })
    expect(comp).toBeLessThan(interp)
  })
})

describe('Parseman perf — history', () => {
  it('history file loads and has origin anchor', () => {
    const history = loadHistory()
    expect(history.length).toBeGreaterThan(0)
    const { origin } = historyAnchors(history)
    expect(origin?.gitRev).toBeTruthy()
    expect(origin?.cases['json/small/compiled']?.medianUs).toBeGreaterThan(0)
  })
})

describe('Parseman perf — baseline regression guard', () => {
  it('no case regresses vs committed baseline', () => {
    const baseline = loadBaseline()
    if (!baseline) return

    // Same iteration scale as baseline; fewer outer samples for CI speed.
    const rows = runParsemanSuite({
      scale: baseline.measurement?.scale ?? 1,
      skipOptional: true,
      measure: { samples: 5 },
    })
    // Guard on the MACHINE-INDEPENDENT compiled speedup ratio (interp/comp): it
    // cancels out CPU speed, so it fires only on real codegen regressions and
    // stays green on any machine. Absolute-µs is hardware-dependent and only
    // checked when PARSEMAN_PERF_ABSOLUTE is set (same machine as the baseline).
    const regressions = findRegressions(rows, baseline, {
      checkSpeedup: true,
      tolerance: { speedup: 18, compiled: 25 },
    })
    if (regressions.length > 0) {
      console.log('\nParseman perf regressions vs baseline:')
      for (const m of regressions) console.log(`  ${m}`)
    }
    expect(regressions).toEqual([])
  }, 120_000)
})
