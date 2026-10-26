#!/usr/bin/env node
// Turns a built deck into an editable PowerPoint file: every heading,
// paragraph and label is a real text box, and the bars, rules and dot are
// shapes. Speaker notes come along.
//
//   npm i pptxgenjs@4.0.1        (once, in the folder you run this from)
//   node scripts/export-pptx.mjs out/index.html [out/deck.pptx]
//
// Headless Chrome lays the deck out with its real fonts (the same as the
// HTML and the PDF), and the measured positions, sizes and line breaks are
// written into the slides with PptxGenJS. Set CHROME_PATH if Chrome isn't
// found.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chrome } from './chrome.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const input = resolve(process.argv[2] || 'out/index.html')
const output = resolve(process.argv[3] || input.replace(/\.html?$/i, '.pptx'))
if (!existsSync(input)) {
  console.error(`export-pptx: ${input} not found; run build.mjs first`)
  process.exit(1)
}

// PptxGenJS is looked up from the folder you run this in, then next to the skill.
async function loadPptxGenJS() {
  for (const base of [`${process.cwd()}/`, `${here}/`]) {
    try {
      const path = createRequire(base).resolve('pptxgenjs')
      const mod = await import(pathToFileURL(path).href)
      return mod.default?.default ?? mod.default ?? mod
    } catch {
      // try the next place
    }
  }
  console.error(
    'export-pptx: PptxGenJS is not installed. Run `npm i pptxgenjs@4.0.1` in this folder, then try again.',
  )
  process.exit(1)
}
const PptxGenJS = await loadPptxGenJS()

const dom = chrome(
  ['--dump-dom', `${pathToFileURL(input).href}?measure`],
  'export-pptx',
)
const found = dom.match(
  /<script type="application\/json" id="measure">([\s\S]*?)<\/script>/,
)
if (!found) {
  console.error(
    'export-pptx: the deck did not report its layout. Rebuild it with this version of build.mjs.',
  )
  process.exit(1)
}
const deck = JSON.parse(found[1])

// Slides are 1920×1080 px on PowerPoint's 13.333×7.5 in widescreen page:
// 144 px to the inch, and 1 px of type is half a point.
const IN = (px) => +(px / 144).toFixed(4)
const PT = (px) => +(px / 2).toFixed(2)

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.title = deck.title
if (deck.lang) pptx.lang = deck.lang

for (const measured of deck.slides) {
  const slide = pptx.addSlide()
  slide.background = { color: measured.bg }
  for (const item of measured.items) {
    if (item.type !== 'text') {
      slide.addShape(
        item.type === 'ellipse' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect,
        {
          x: IN(item.x),
          y: IN(item.y),
          w: IN(item.w),
          h: IN(item.h),
          fill: { color: item.fill },
        },
      )
      continue
    }
    // Line breaks are the ones Chrome rendered. The box gets a little extra
    // width so PowerPoint's own wrapping never adds a line.
    const extra = item.w * 0.06 + 4
    const x =
      item.align === 'center'
        ? item.x - extra / 2
        : item.align === 'right'
          ? item.x - extra
          : item.x
    const runs = []
    item.lines.forEach((line, i) => {
      if (!line.length) line = [{ t: ' ', color: item.lines[0][0].color }]
      line.forEach((run, j) => {
        runs.push({
          text: item.upper ? run.t.toUpperCase() : run.t,
          options: {
            color: run.color,
            breakLine: j === line.length - 1 && i < item.lines.length - 1,
          },
        })
      })
    })
    // PowerPoint sets exact line spacing from the top of the line, CSS
    // centres the text in it; for tight or loose spacing the box moves by half
    // the difference (1.12 em is where Inter Tight's lines sit the same).
    const y = item.y + (1.12 * item.size - item.lh) / 2
    slide.addText(runs, {
      x: IN(x),
      y: IN(y),
      w: IN(item.w + extra),
      h: IN(Math.max(item.h, item.lh)),
      margin: 0,
      valign: 'top',
      align: item.align,
      wrap: !item.nowrap,
      fit: 'none',
      fontFace: item.font,
      fontSize: PT(item.size),
      bold: item.weight >= 600,
      charSpacing: PT(item.spacing),
      lineSpacing: PT(item.lh),
      paraSpaceBefore: 0,
      paraSpaceAfter: 0,
    })
  }
  if (measured.notes) slide.addNotes(measured.notes)
}

await pptx.writeFile({ fileName: output })
console.log(`Wrote ${deck.slides.length} slides to ${output}`)
