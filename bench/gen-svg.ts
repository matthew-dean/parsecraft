/**
 * Generate benchmark SVG charts from hardcoded results.
 * Run: node --import tsx bench/gen-svg.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`

const C = {
  macroBuild:  '#534AB7',
  compile:     '#9B8FEF',
  compileBg:   '#D0C8FF',
  noCompile:   '#C4BAFF',
  peggy:       '#1D9E75',
  parsimmon:   '#E24B4A',
  chevrotain:  '#BA7517',
  track:       '#eaeef2',
  label:       '#24292f',
  muted:       '#57606a',
  dim:         '#8c959f',
}

type Bar = {
  label: string
  us: number
  color: string
  /** for .compile() bars: show a dark overlay at the macro-build µs time */
  overlayUs?: number
  overlayColor?: string
}

type Group = { title: string; bars: Bar[] }
type Chart = { title: string; groups: Group[] }

function fmtUs(us: number): string {
  if (us >= 1000) return `${(us / 1000).toFixed(2)} ms`
  if (us >= 100) return `${Math.round(us)} µs`
  if (us >= 10) return `${us.toFixed(1)} µs`
  return `${us.toFixed(2)} µs`
}

function buildSvg(chart: Chart): string {
  const W = 720
  const BAR_X = 238
  const BAR_W = 386
  const ROW_H = 28
  const BAR_H = 18

  const lines: string[] = []
  const push = (...s: string[]) => lines.push(...s)

  // ── shared sqrt scale across all groups ─────────────────────────────────────
  // Square root compression so small values aren't invisible slivers while
  // ordering and proportional sense are preserved. Slowest bar = full width.
  const allNonCompile = chart.groups.flatMap(g => g.bars.filter(b => b.overlayUs === undefined))
  const maxUs = Math.max(...allNonCompile.map(b => b.us))
  const scalePx = (us: number) => Math.pow(us / maxUs, 0.5) * BAR_W

  // ── sort bars fastest first within each group ───────────────────────────────
  for (const group of chart.groups) {
    group.bars.sort((a, b) => a.us - b.us)
  }

  // ── layout: measure height ──────────────────────────────────────────────────
  let totalRows = 0
  for (const g of chart.groups) totalRows += g.bars.length
  const H = 20 + 50 + 30 + 30 + (chart.groups.length * 30) + (totalRows * ROW_H) + 20

  push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`)
  push(`<rect width="${W}" height="${H}" fill="white" rx="6"/>`)

  // ── legend — only include series that appear in this chart ──────────────────
  const allLabels = new Set(chart.groups.flatMap(g => g.bars.map(b => b.label)))
  const allLegend = [
    { color: C.macroBuild, label: 'Parséman (macro build)' },
    { color: C.compile,    label: 'Parséman (w/ .compile())' },
    { color: C.noCompile,  label: 'Parséman (no compile)' },
    { color: C.peggy,      label: 'Peggy' },
    { color: C.parsimmon,  label: 'Parsimmon' },
    { color: C.chevrotain, label: 'Chevrotain' },
  ].filter(e => allLabels.has(e.label))

  const row1Items = allLegend.slice(0, 3)
  const row2Items = allLegend.slice(3)

  let lx = 20
  for (const { color, label } of row1Items) {
    push(`<rect x="${lx}" y="20" width="11" height="11" rx="2" fill="${color}"/>`)
    push(`<text x="${lx + 15}" y="31" font-size="11.5" fill="${C.muted}" font-family="${FONT}">${label}</text>`)
    lx += label.length * 7 + 22
  }
  lx = 20
  for (const { color, label } of row2Items) {
    push(`<rect x="${lx}" y="40" width="11" height="11" rx="2" fill="${color}"/>`)
    push(`<text x="${lx + 15}" y="51" font-size="11.5" fill="${C.muted}" font-family="${FONT}">${label}</text>`)
    lx += label.length * 7 + 22
  }
  push(`<text x="${W - 20}" y="31" font-size="10.5" fill="${C.dim}" text-anchor="end" font-family="${FONT}">µs / parse — shorter is faster</text>`)

  // ── chart title ─────────────────────────────────────────────────────────────
  push(`<text x="20" y="86" font-size="10.5" font-weight="600" fill="${C.dim}" letter-spacing="0.06em" font-family="${FONT}">${chart.title}</text>`)

  let y = 111
  for (const group of chart.groups) {
    push(`<text x="20" y="${y}" font-size="12.5" fill="${C.muted}" font-family="${FONT}">${group.title}</text>`)
    y += 20

    for (const bar of group.bars) {
      const textY = y + BAR_H - 3
      const isCompile = bar.overlayUs !== undefined
      const px = Math.min(scalePx(bar.us), BAR_W)
      const overflowed = scalePx(bar.us) > BAR_W

      push(`<text x="${BAR_X - 8}" y="${textY}" text-anchor="end" font-size="12" fill="${C.label}" font-family="${FONT}">${bar.label}</text>`)
      push(`<rect x="${BAR_X}" y="${y}" width="${BAR_W}" height="${BAR_H}" rx="3" fill="${C.track}"/>`)

      if (isCompile) {
        // light bg = total compile+parse cost; dark overlay = parse-only (same as macro build)
        const parsePx = Math.min(scalePx(bar.overlayUs ?? 0), px)
        push(`<rect x="${BAR_X}" y="${y}" width="${px.toFixed(1)}" height="${BAR_H}" rx="3" fill="${C.compileBg}"/>`)
        if (parsePx >= 1) {
          push(`<rect x="${BAR_X}" y="${y}" width="${parsePx.toFixed(1)}" height="${BAR_H}" rx="3" fill="${bar.color}"/>`)
        }
        const valX = overflowed ? BAR_X + BAR_W + 7 : BAR_X + px + 5
        push(`<text x="${valX}" y="${textY}" font-size="11" fill="${C.muted}" font-family="${FONT}">${fmtUs(bar.us)}</text>`)
      } else {
        push(`<rect x="${BAR_X}" y="${y}" width="${px.toFixed(1)}" height="${BAR_H}" rx="3" fill="${bar.color}"/>`)
        const valX = overflowed ? BAR_X + BAR_W + 7 : BAR_X + px + 5
        push(`<text x="${valX}" y="${textY}" font-size="11" fill="${C.muted}" font-family="${FONT}">${fmtUs(bar.us)}</text>`)
      }

      y += ROW_H
    }

    y += 16
  }

  push(`</svg>`)
  return lines.join('\n')
}

// ── JSON data ────────────────────────────────────────────────────────────────

const jsonChart: Chart = {
  title: 'JSON PARSING',
  groups: [
    {
      title: 'small  (52 bytes)',
      bars: [
        { label: 'Parséman (macro build)',    us: 1e6/452648,  color: C.macroBuild },
        { label: 'Peggy',                     us: 1e6/387686,  color: C.peggy },
        { label: 'Parséman (no compile)',     us: 1e6/356308,  color: C.noCompile },
        { label: 'Parsimmon',                 us: 1e6/167527,  color: C.parsimmon },
        { label: 'Chevrotain',                us: 1e6/135195,  color: C.chevrotain },
        { label: 'Parséman (w/ .compile())', us: 1e6/22040,   color: C.compile,
          overlayUs: 1e6/452648, overlayColor: C.compile },
      ],
    },
    {
      title: 'medium  (1.8 kB)',
      bars: [
        { label: 'Parséman (macro build)',    us: 1e6/15837,  color: C.macroBuild },
        { label: 'Peggy',                     us: 1e6/14908,  color: C.peggy },
        { label: 'Parséman (no compile)',     us: 1e6/11748,  color: C.noCompile },
        { label: 'Parsimmon',                 us: 1e6/5111,   color: C.parsimmon },
        { label: 'Chevrotain',                us: 1e6/4281,   color: C.chevrotain },
        { label: 'Parséman (w/ .compile())', us: 1e6/9465,   color: C.compile,
          overlayUs: 1e6/15837, overlayColor: C.compile },
      ],
    },
    {
      title: 'large  (12 kB)',
      bars: [
        { label: 'Peggy',                     us: 1e6/2099,  color: C.peggy },
        { label: 'Parséman (macro build)',    us: 1e6/1709,  color: C.macroBuild },
        { label: 'Parséman (no compile)',     us: 1e6/1290,  color: C.noCompile },
        { label: 'Parsimmon',                 us: 1e6/675,   color: C.parsimmon },
        { label: 'Chevrotain',                us: 1e6/552,   color: C.chevrotain },
        { label: 'Parséman (w/ .compile())', us: 1e6/1586,  color: C.compile,
          overlayUs: 1e6/1709, overlayColor: C.compile },
      ],
    },
  ],
}

// ── CSV data ─────────────────────────────────────────────────────────────────

const csvChart: Chart = {
  title: 'CSV PARSING',
  groups: [
    {
      title: 'small  (54 bytes, 4 rows)',
      bars: [
        { label: 'Parséman (macro build)',    us: 1e6/1758981, color: C.macroBuild },
        { label: 'Parséman (no compile)',     us: 1e6/516933,  color: C.noCompile },
        { label: 'Peggy',                     us: 1e6/497306,  color: C.peggy },
        { label: 'Parsimmon',                 us: 1e6/278809,  color: C.parsimmon },
        { label: 'Chevrotain',                us: 1e6/184491,  color: C.chevrotain },
        { label: 'Parséman (w/ .compile())', us: 1e6/22842,   color: C.compile,
          overlayUs: 1e6/1758981, overlayColor: C.compile },
      ],
    },
    {
      title: 'large  (14.8 kB, 500 rows)',
      bars: [
        { label: 'Parséman (macro build)',    us: 1e6/10659, color: C.macroBuild },
        { label: 'Parséman (w/ .compile())', us: 1e6/7309,  color: C.compile,
          overlayUs: 1e6/10659, overlayColor: C.compile },
        { label: 'Peggy',                     us: 1e6/2316,  color: C.peggy },
        { label: 'Parsimmon',                 us: 1e6/2265,  color: C.parsimmon },
        { label: 'Parséman (no compile)',     us: 1e6/2981,  color: C.noCompile },
        { label: 'Chevrotain',                us: 1e6/955,   color: C.chevrotain },
      ],
    },
  ],
}

// ── GraphQL data ───────────────────────────────────────────────────────────

const gqlChart: Chart = {
  title: 'GRAPHQL PARSING',
  groups: [
    {
      title: 'small  (27 bytes)',
      bars: [
        { label: 'Parséman (macro build)',    us: 1e6/858385, color: C.macroBuild },
        { label: 'Peggy',                     us: 1e6/427592, color: C.peggy },
        { label: 'Chevrotain',                us: 1e6/266797, color: C.chevrotain },
        { label: 'Parséman (no compile)',     us: 1e6/263585, color: C.noCompile },
        { label: 'Parsimmon',                 us: 1e6/88860,  color: C.parsimmon },
        { label: 'Parséman (w/ .compile())', us: 1e6/3470,   color: C.compile,
          overlayUs: 1e6/858385, overlayColor: C.compile },
      ],
    },
    {
      title: 'medium  (336 bytes)',
      bars: [
        { label: 'Parséman (macro build)',    us: 1e6/140269, color: C.macroBuild },
        { label: 'Peggy',                     us: 1e6/62632,  color: C.peggy },
        { label: 'Parséman (no compile)',     us: 1e6/46789,  color: C.noCompile },
        { label: 'Chevrotain',                us: 1e6/43218,  color: C.chevrotain },
        { label: 'Parsimmon',                 us: 1e6/17759,  color: C.parsimmon },
        { label: 'Parséman (w/ .compile())', us: 1e6/3423,   color: C.compile,
          overlayUs: 1e6/140269, overlayColor: C.compile },
      ],
    },
    {
      title: 'large  (7.8 kB)',
      bars: [
        { label: 'Parséman (macro build)',    us: 1e6/5435,  color: C.macroBuild },
        { label: 'Peggy',                     us: 1e6/2702,  color: C.peggy },
        { label: 'Parséman (no compile)',     us: 1e6/1718,  color: C.noCompile },
        { label: 'Chevrotain',                us: 1e6/1526,  color: C.chevrotain },
        { label: 'Parsimmon',                 us: 1e6/647,   color: C.parsimmon },
        { label: 'Parséman (w/ .compile())', us: 1e6/2128,  color: C.compile,
          overlayUs: 1e6/5435, overlayColor: C.compile },
      ],
    },
  ],
}

// ── write ─────────────────────────────────────────────────────────────────────

const assets = new URL('../assets', import.meta.url).pathname

writeFileSync(join(assets, 'bench-json.svg'),        buildSvg(jsonChart))
writeFileSync(join(assets, 'bench-csv.svg'),         buildSvg(csvChart))
writeFileSync(join(assets, 'bench-graphql.svg'),  buildSvg(gqlChart))

console.log('SVGs written to assets/')
