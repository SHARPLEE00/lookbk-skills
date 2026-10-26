// Finds a Chrome, Chromium or Edge that is already on the machine and takes
// screenshots with it, headless. No packages to install.
import { execFile } from 'node:child_process'
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

/** The browser executable, or null. */
export function findChrome() {
  return CANDIDATES.filter(Boolean).find((p) => existsSync(p)) ?? null
}

/**
 * Screenshots `url` at w×h CSS pixels into `out` (PNG), at `scale` device
 * pixels per CSS pixel. The virtual time budget lets web fonts and images
 * load and the page finish its layout first.
 */
export function screenshot(chrome, url, out, { w, h, scale = 1 }) {
  return new Promise((ok, fail) => {
    execFile(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        // Chrome refuses to run as root (in containers, CI) without this.
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
        '--hide-scrollbars',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=8000',
        `--window-size=${w},${h}`,
        `--force-device-scale-factor=${scale}`,
        `--screenshot=${out}`,
        url,
      ],
      { timeout: 60000 },
      (err, _stdout, stderr) =>
        err ? fail(new Error(String(stderr || err.message).trim())) : ok(),
    )
  })
}
