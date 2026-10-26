#!/usr/bin/env node
// Checks a Pixel Quest project after apply-brief.mjs and before rendering.
// The film draws its own pixel font into SVG, so HyperFrames' text checks
// can't see it; this does those checks instead, from the same art module:
//
//   - every character can be drawn by the 5×7 font
//   - every line fits its place at the size it will be drawn
//   - text and accent colours read on every scene's sky and in the dialog box
//
//   node scripts/preflight.mjs <project-dir>
//
// Lists every problem at once and exits 1 if there are any.
import { loadProject } from './load-project.mjs'

let project
try {
  project = loadProject(process.argv[2])
} catch (e) {
  console.error(`preflight: ${e.message}`)
  process.exit(1)
}
const { values: v, Q } = project

// [field, pixels per font pixel (the smallest the film will shrink it to),
//  width it must fit in, bold]
const LINES = [
  ['product', 12, 1400, true],
  ['subtitle', 8, 1760],
  ['cta', 8, 1760],
  ['level1Name', 12, 1760],
  ['level2Name', 12, 1760],
  ['level3Name', 12, 1760],
  ['level1Text', 6, 1760],
  ['level2Text', 6, 1760],
  ['level3Text', 6, 1760],
  ['headline', 12, 1400, true],
  ['subline', 6, 1600],
  ['url', 6, 1760],
]
const problems = []
const notes = []
for (const [id, px, width, bold] of LINES) {
  const s = v[id]
  if (s == null || s === '') continue
  const bad = Q.unsupported(s)
  if (bad.length)
    problems.push(
      `${id} "${s}" has characters the pixel font can't draw: ${bad.map((c) => JSON.stringify(c)).join(' ')} (it has A-Z, 0-9, space and . , ! ? - : / ' " & + % # @ ( ) $ * > < = × ·)`,
    )
  const w = Q.textWidth(s, bold) * px + (bold ? 16 : 2 * px)
  if (w > width)
    problems.push(`${id} "${s}" is ${w} px wide at its smallest size; the space is ${width} px. Shorten it.`)
}
if (v.level1Text === '' || v.level2Text === '' || v.level3Text === '')
  notes.push('a stage has no feature line: its dialog box will not appear')
const items = [v.level1Item, v.level2Item, v.level3Item]
if (new Set(items).size < 3)
  notes.push(`two stages use the same power-up (${items.join(', ')}); one each reads better`)

for (const [what, fg, bg, min] of Q.contrastPairs(v)) {
  const c = Q.contrast(fg, bg)
  if (c < min)
    problems.push(
      `${what}: ${fg} on ${bg} is ${c.toFixed(2)}:1, needs ${min}:1. Pick a ${Q.contrast('#000000', bg) > Q.contrast('#ffffff', bg) ? 'darker' : 'lighter'} ${what.startsWith('ground') ? 'ground or sky' : what.startsWith('accent') ? 'accent' : 'text colour'}.`,
    )
}

const theme = Q.palette(v).dark ? 'night (dark sky: stars and a moon)' : 'daylight (light sky: dusk and sunset stages)'
if (problems.length) {
  console.error(`preflight: fix the brief first:\n  - ${problems.join('\n  - ')}`)
  for (const n of notes) console.error(`  note: ${n}`)
  process.exit(1)
}
console.log(`preflight: ok. ${LINES.length} lines fit and draw, ${Q.contrastPairs(v).length} colour pairs read. Theme: ${theme}.`)
for (const n of notes) console.log(`  note: ${n}`)
