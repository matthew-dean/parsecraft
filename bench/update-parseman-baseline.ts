/**
 * Refresh bench/parseman-baseline.json from current timings.
 * Appends to bench/parseman-history.jsonl (time series — commit this to see the needle move).
 * Run: pnpm bench:baseline
 */
import {
  runParsemanSuite,
  writeBaseline,
  printParsemanReport,
  printHistoryIndex,
  loadBaseline,
  loadHistory,
} from './parseman-perf.ts'

const priorBaseline = loadBaseline()
const rows = runParsemanSuite()
printParsemanReport(rows, priorBaseline)
const baseline = writeBaseline(rows, { scale: 1, samples: 15 })
printHistoryIndex('css/bootstrap4')
console.log(
  `Wrote baseline (${Object.keys(baseline.cases).length} cases) · history now ${loadHistory().length} snapshot(s)`,
)
