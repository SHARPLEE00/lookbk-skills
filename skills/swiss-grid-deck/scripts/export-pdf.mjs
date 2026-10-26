#!/usr/bin/env node
// Prints a built deck to PDF, one 1920×1080 slide per page, with headless
// Chrome. No packages to install: it uses a Chrome, Chromium or Edge that is
// already on the machine.
//
//   node scripts/export-pdf.mjs out/index.html [out/deck.pdf]
//
// Set CHROME_PATH to point at a browser it doesn't find by itself. Without
// one, open the deck in Chrome and print it: the print layout is one slide
// per page (turn off headers and footers).
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chrome } from './chrome.mjs'

const input = resolve(process.argv[2] || 'out/index.html')
const output = resolve(process.argv[3] || input.replace(/\.html?$/i, '.pdf'))
if (!existsSync(input)) {
  console.error(`export-pdf: ${input} not found; run build.mjs first`)
  process.exit(1)
}

chrome(
  [
    '--no-pdf-header-footer',
    `--print-to-pdf=${output}`,
    pathToFileURL(input).href,
  ],
  'export-pdf',
)
if (!existsSync(output) || statSync(output).size === 0) {
  console.error('export-pdf: Chrome did not write the PDF')
  process.exit(1)
}
console.log(`Wrote ${output}`)
