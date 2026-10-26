// Finds a Chrome, Chromium or Edge that is already on the machine and runs
// it headless. Shared by export-pdf.mjs and export-pptx.mjs.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

const CANDIDATES = [
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

/** Runs headless Chrome with `args` and returns its stdout, or exits with a readable error. */
export function chrome(args, name) {
  const bin = CANDIDATES.filter(Boolean).find((p) => existsSync(p))
  if (!bin) {
    console.error(
      `${name}: no Chrome, Chromium or Edge found. Install one, or set CHROME_PATH to its executable.`,
    )
    process.exit(1)
  }
  try {
    return execFileSync(
      bin,
      [
        '--headless=new',
        '--disable-gpu',
        // Chrome refuses to run as root (in containers, CI) without this.
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
        '--run-all-compositor-stages-before-draw',
        // Lets web fonts load and the deck fit its text before Chrome acts.
        '--virtual-time-budget=8000',
        ...args,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    ).toString()
  } catch (e) {
    console.error(
      `${name}: ${bin} failed:\n${String(e.stderr || e.message).trim()}`,
    )
    process.exit(1)
  }
}
