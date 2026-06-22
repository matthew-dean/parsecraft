import { writeFileSync, mkdirSync } from 'fs'

const W = 720
const PAD = 20
const LABEL_W = 210
const BAR_START_X = PAD + LABEL_W + 8
const BAR_MAX_W = W - BAR_START_X - PAD - 76
const BAR_H = 18
const ROW_H = 28

const COLORS: Record<string, string> = {
  'Parséman (macro build)':   '#534AB7',
  'Parséman (w/ .compile())': '#9B8FEF',
  'Parséman (no compile)':    '#C4BAFF',
  'Peggy':                    '#1D9E75',
  'Parsimmon':                '#E24B4A',
  'Chevrotain':               '#BA7517',
}

const COMPILE_OVERHEAD_COLOR = '#D0C8FF' // lighter segment for compile() cost within the stacked bar

const ALL_LEGEND = Object.entries(COLORS)

interface Row {
  name: string
  us: number
  // For stacked bars: us is total, parseUs is the parse-only portion (compile overhead = us - parseUs)
  parseUs?: number
}
interface ChartData { subtitle: string; rows: Row[] }

// Measured compile() cost: ~43µs JSON, ~44µs CSV
const JSON_COMPILE_US = 43
const CSV_COMPILE_US  = 44

const JSON_CHARTS: ChartData[] = [
  {
    subtitle: 'small  (52 bytes)',
    rows: [
      { name: 'Parséman (macro build)',    us: 1.93 },
      { name: 'Peggy',                     us: 2.63 },
      { name: 'Parséman (no compile)',     us: 4.00 },
      { name: 'Parsimmon',                us: 6.25 },
      { name: 'Chevrotain',               us: 7.48 },
      { name: 'Parséman (w/ .compile())', us: 46.32, parseUs: 1.93 },
    ],
  },
  {
    subtitle: 'medium  (1.8 kB)',
    rows: [
      { name: 'Parséman (macro build)',    us: 54.40 },
      { name: 'Peggy',                     us: 69.17 },
      { name: 'Parséman (w/ .compile())', us: 99.50, parseUs: 54.40 },
      { name: 'Parséman (no compile)',     us: 117.33 },
      { name: 'Parsimmon',                us: 197.25 },
      { name: 'Chevrotain',               us: 238.65 },
    ],
  },
  {
    subtitle: 'large  (12 kB)',
    rows: [
      { name: 'Parséman (macro build)',    us: 487.00 },
      { name: 'Peggy',                     us: 481.00 },
      { name: 'Parséman (w/ .compile())', us: 535.00, parseUs: 487.00 },
      { name: 'Parséman (no compile)',     us: 1030.00 },
      { name: 'Parsimmon',                us: 1530.00 },
      { name: 'Chevrotain',               us: 1840.00 },
    ],
  },
]

const CSV_CHARTS: ChartData[] = [
  {
    subtitle: 'small  (54 bytes)',
    rows: [
      { name: 'Parséman (macro build)',    us: 0.58 },
      { name: 'Parséman (no compile)',     us: 1.96 },
      { name: 'Peggy',                     us: 2.05 },
      { name: 'Parsimmon',                us: 3.59 },
      { name: 'Chevrotain',               us: 5.43 },
      { name: 'Parséman (w/ .compile())', us: 44.50, parseUs: 0.58 },
    ],
  },
  {
    subtitle: 'large  (14.8 kB)',
    rows: [
      { name: 'Parséman (macro build)',    us: 94.80 },
      { name: 'Parséman (w/ .compile())', us: 139.13, parseUs: 94.80 },
      { name: 'Parséman (no compile)',     us: 336.25 },
      { name: 'Parsimmon',                us: 449.39 },
      { name: 'Peggy',                     us: 436.51 },
      { name: 'Chevrotain',               us: 1050.87 },
    ],
  },
]

function fmtUs(us: number): string {
  if (us < 10)   return us.toFixed(2) + ' µs'
  if (us < 100)  return us.toFixed(1) + ' µs'
  if (us < 1000) return Math.round(us) + ' µs'
  return (us / 1000).toFixed(2) + ' ms'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const TEXT_DARK  = '#24292f'
const TEXT_MED   = '#57606a'
const TEXT_LIGHT = '#8c959f'
const TRACK_BG   = '#eaeef2'

function buildSVG(
  sectionLabel: string,
  charts: ChartData[],
  legendEntries: [string, string][],
): string {
  const els: string[] = []
  let y = PAD

  // Legend — two rows of 3
  const row1 = legendEntries.slice(0, 3)
  const row2 = legendEntries.slice(3)

  function legendRow(items: [string, string][], startY: number) {
    let lx = PAD
    for (const [name, color] of items) {
      els.push(`<rect x="${lx}" y="${startY - 11}" width="11" height="11" rx="2" fill="${color}"/>`)
      els.push(`<text x="${lx + 15}" y="${startY}" font-size="11.5" fill="${TEXT_MED}" font-family="${FONT}">${esc(name)}</text>`)
      lx += name.length * 6.5 + 24
    }
  }

  legendRow(row1, y + 11)
  y += 20
  if (row2.length) {
    legendRow(row2, y + 11)
    y += 20
  }

  // "shorter = faster" note — top-right
  els.push(`<text x="${W - PAD}" y="${PAD + 11}" font-size="10.5" fill="${TEXT_LIGHT}" text-anchor="end" font-family="${FONT}">µs / parse — shorter is faster</text>`)

  y += 14

  // Section label
  els.push(`<text x="${PAD}" y="${y + 12}" font-size="10.5" font-weight="600" fill="${TEXT_LIGHT}" letter-spacing="0.06em" font-family="${FONT}">${esc(sectionLabel.toUpperCase())}</text>`)
  y += 24

  for (const chart of charts) {
    els.push(`<text x="${PAD}" y="${y + 13}" font-size="12.5" fill="${TEXT_MED}" font-family="${FONT}">${esc(chart.subtitle)}</text>`)
    y += 22

    const maxUs = Math.max(...chart.rows.map(r => r.us))

    for (const row of chart.rows) {
      const totalW = Math.max(3, (row.us / maxUs) * BAR_MAX_W)
      const color  = COLORS[row.name] || '#888'
      const barY   = y + (ROW_H - BAR_H) / 2

      els.push(`<text x="${PAD + LABEL_W}" y="${y + ROW_H / 2 + 4}" text-anchor="end" font-size="12" fill="${TEXT_DARK}" font-family="${FONT}">${esc(row.name)}</text>`)
      els.push(`<rect x="${BAR_START_X}" y="${barY}" width="${BAR_MAX_W}" height="${BAR_H}" rx="3" fill="${TRACK_BG}"/>`)

      if (row.parseUs !== undefined) {
        // Stacked bar: parse portion (solid) + compile overhead (lighter)
        const parseW   = Math.max(3, (row.parseUs / maxUs) * BAR_MAX_W)
        const overheadW = totalW - parseW
        // Full bar in overhead color first (rounded ends), then parse portion on top
        els.push(`<rect x="${BAR_START_X}" y="${barY}" width="${totalW.toFixed(1)}" height="${BAR_H}" rx="3" fill="${COMPILE_OVERHEAD_COLOR}"/>`)
        els.push(`<rect x="${BAR_START_X}" y="${barY}" width="${parseW.toFixed(1)}" height="${BAR_H}" rx="3" fill="${color}"/>`)
      } else {
        els.push(`<rect x="${BAR_START_X}" y="${barY}" width="${totalW.toFixed(1)}" height="${BAR_H}" rx="3" fill="${color}"/>`)
      }

      els.push(`<text x="${BAR_START_X + totalW + 7}" y="${y + ROW_H / 2 + 4}" font-size="11" fill="${TEXT_MED}" font-family="${FONT}">${fmtUs(row.us)}</text>`)

      y += ROW_H
    }

    y += 18
  }

  const H = y + PAD - 10

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="white" rx="6"/>
${els.join('\n')}
</svg>`
}

mkdirSync('assets', { recursive: true })

writeFileSync(
  'assets/bench-json.svg',
  buildSVG('JSON parsing', JSON_CHARTS, ALL_LEGEND),
)
writeFileSync(
  'assets/bench-csv.svg',
  buildSVG('CSV parsing', CSV_CHARTS, ALL_LEGEND),
)

console.log('Generated assets/bench-json.svg and assets/bench-csv.svg')
