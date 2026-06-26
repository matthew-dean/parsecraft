/**
 * Fast, machine-robust perf regression guard — intended for a git pre-commit hook.
 *
 * Compares the **machine-independent compiled speedup ratio** (interpreted/compiled
 * per case) against the committed baseline ratio. Because both modes are timed in
 * the same process, the ratio cancels out CPU speed — a ratio drop is a genuine
 * codegen regression, not a slow machine. Absolute µs is NOT checked here (it is
 * hardware-dependent; enable it only on the baseline machine via
 * PARSEMAN_PERF_ABSOLUTE=1 when running the full vitest perf test).
 *
 * Usage:
 *   node --import tsx/esm bench/perf-guard.ts            # css cases only (fast, ~a few s)
 *   node --import tsx/esm bench/perf-guard.ts --all      # every grammar
 *
 * Re-baseline after an intentional perf change:  pnpm bench:baseline
 *
 * Exit code 0 = no regression, 1 = regression (blocks the commit).
 */
import { runParsemanSuite, loadBaseline, findRegressions } from './parseman-perf.ts'

const all = process.argv.includes('--all')
const tolerance = Number(process.env.PARSEMAN_PERF_TOLERANCE ?? 18) // % below baseline ratio

const baseline = loadBaseline()
if (!baseline) {
  console.error('perf-guard: no baseline (run `pnpm bench:baseline`) — skipping')
  process.exit(0)
}

// CSS cases are the most codegen-sensitive (trivia + node capture); they catch a
// 2× compiled regression with far fewer samples than the full 68s suite.
const rows = runParsemanSuite({
  scale: baseline.measurement?.scale ?? 1,
  skipOptional: true,
  only: all ? undefined : ['css'],
  measure: { samples: all ? 7 : 9 },
})

const regressions = findRegressions(rows, baseline, {
  checkSpeedup: true,
  checkAbsolute: false, // machine-independent guard only
  tolerance: { speedup: tolerance },
})

// Report the ratios we measured so the dev sees the headroom.
const byId = new Map<string, { i?: number; c?: number }>()
for (const r of rows) {
  const g = byId.get(r.id) ?? {}
  if (r.mode === 'interpreted') g.i = r.medianUs
  else g.c = r.medianUs
  byId.set(r.id, g)
}
console.log(`perf-guard: compiled speedup ratio vs baseline @ ${baseline.gitRev} (tolerance ${tolerance}% drop)`)
for (const [id, { i, c }] of [...byId.entries()].sort()) {
  if (i === undefined || c === undefined) continue
  const bi = baseline.cases[`${id}/interpreted`]?.medianUs
  const bc = baseline.cases[`${id}/compiled`]?.medianUs
  const speedup = i / c
  const base = bi !== undefined && bc !== undefined ? bi / bc : NaN
  const drop = Number.isNaN(base) ? '' : `  (baseline ${base.toFixed(2)}×, ${(((base - speedup) / base) * 100).toFixed(1)}% drop)`
  console.log(`  ${id.padEnd(16)} ${speedup.toFixed(2)}×${drop}`)
}

if (regressions.length > 0) {
  console.error('\nperf-guard: REGRESSION — commit blocked:')
  for (const m of regressions) console.error(`  ${m}`)
  console.error('\nIf this is an intentional perf change, re-baseline with `pnpm bench:baseline` and commit bench/parseman-baseline.json.')
  process.exit(1)
}
console.log('perf-guard: ok')
process.exit(0)
