#!/usr/bin/env node
// Saves a built diagram as a PNG with headless Chrome, at its full size and
// twice the pixel density by default (still: no moving dots).
//
//   node scripts/export-png.mjs out/index.html [out/diagram.png] [--scale=1]
//
// No packages to install. Set CHROME_PATH if Chrome, Chromium or Edge isn't
// found.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
const scale = Number(
  args.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 2,
)
const input = resolve(files[0] || 'out/index.html')
const output = resolve(
  files[1] || input.replace(/index\.html?$/i, 'diagram.png'),
)
if (!existsSync(input)) {
  console.error(`export-png: ${input} not found; run build.mjs first`)
  process.exit(1)
}
const html = readFileSync(input, 'utf8')
const w = Number(/data-w="(\d+)"/.exec(html)?.[1])
const h = Number(/data-h="(\d+)"/.exec(html)?.[1])
if (!w || !h) {
  console.error(
    'export-png: rebuild the diagram with build.mjs; its size is missing',
  )
  process.exit(1)
}

const chrome = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
  .filter(Boolean)
  .find((p) => existsSync(p))
if (!chrome) {
  console.error(
    'export-png: no Chrome, Chromium or Edge found. Set CHROME_PATH, or open out/index.html and take a screenshot.',
  )
  process.exit(1)
}

try {
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      // Chrome refuses to run as root (in containers, CI) without this.
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      '--hide-scrollbars',
      '--run-all-compositor-stages-before-draw',
      // Lets the web font load before the shot.
      '--virtual-time-budget=8000',
      `--window-size=${w},${h}`,
      `--force-device-scale-factor=${scale}`,
      `--screenshot=${output}`,
      `${pathToFileURL(input).href}?still`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
} catch (e) {
  console.error(
    `export-png: ${chrome} failed:\n${String(e.stderr || e.message).trim()}`,
  )
  process.exit(1)
}
if (!existsSync(output) || statSync(output).size === 0) {
  console.error('export-png: Chrome did not write the PNG')
  process.exit(1)
}
console.log(`Wrote ${output} (${w * scale}×${h * scale})`)
