#!/usr/bin/env node
// Renders every card in cards.json to a 1200×630 PNG with headless Chrome,
// and writes og-preview.html next to cards.json to look them over.
//
//   node scripts/render.mjs cards.json [--only=slug,slug] [--scale=2] [--jobs=4]
//
// Paths in cards.json (out, image, avatar) are relative to cards.json.
// Set CHROME_PATH if Chrome, Chromium or Edge isn't found.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findChrome, screenshot } from './chrome.mjs'

const W = 1200
const H = 630
const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = join(here, '..', 'template')

export const THEME = {
  paper: '#fafaf7',
  ink: '#17181c',
  accent: '#2433e8',
  serif: 'Instrument Serif',
  sans: 'Inter',
  mono: 'IBM Plex Mono',
}
const LIMITS = {
  title: 110,
  kicker: 24,
  topic: 28,
  meta: 20,
  author: 32,
  url: 48,
}
const chars = (s) => [...String(s)].length
const isUrl = (s) => /^https?:\/\//.test(s)

function rgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
function contrast(a, b) {
  const lum = (c) => {
    const l = rgb(c).map((v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
  }
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Every card with the deck defaults filled in, and every problem found. */
export function prepare(doc, dir) {
  const problems = []
  if (!doc || !Array.isArray(doc.cards) || !doc.cards.length)
    return { problems: ['cards.json needs a non-empty "cards" array'] }
  const theme = { ...THEME, ...doc.theme }
  for (const c of ['paper', 'ink', 'accent'])
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(theme[c]))
      problems.push(`theme.${c} must be a hex colour like #2433e8`)
  if (!problems.length && contrast(theme.ink, theme.paper) < 4.5)
    problems.push(
      `theme.ink on theme.paper is ${contrast(theme.ink, theme.paper).toFixed(1)}:1; it needs at least 4.5:1`,
    )
  const seen = new Set()
  const cards = doc.cards.map((raw, i) => {
    const c = { ...doc.defaults, ...raw }
    const at = `card ${i + 1}${c.slug ? ` (${c.slug})` : ''}`
    if (!c.title?.trim()) problems.push(`${at}: "title" is required`)
    for (const [k, max] of Object.entries(LIMITS))
      if (c[k] !== undefined && typeof c[k] !== 'string')
        problems.push(`${at}: "${k}" must be text`)
      else if (c[k] && chars(c[k]) > max)
        problems.push(
          `${at}: "${k}" is ${chars(c[k])} characters; the limit is ${max}`,
        )
    if (!c.out && !/^[a-z0-9][a-z0-9-_]*$/i.test(c.slug || ''))
      problems.push(
        `${at}: give it a "slug" (letters, digits, -) or an "out" path`,
      )
    const out = resolve(dir, c.out || join('og', `${c.slug}.png`))
    if (!out.endsWith('.png')) problems.push(`${at}: "out" must end in .png`)
    if (seen.has(out)) problems.push(`${at}: another card also writes ${out}`)
    seen.add(out)
    c.art ??= 'blocks'
    if (!['blocks', 'image', 'none'].includes(c.art))
      problems.push(`${at}: "art" must be blocks, image or none`)
    if (c.layout !== undefined && ![1, 2, 3, 4].includes(c.layout))
      problems.push(`${at}: "layout" must be 1, 2, 3 or 4`)
    if (c.tags !== undefined)
      if (
        !Array.isArray(c.tags) ||
        c.tags.length > 2 ||
        c.tags.some((t) => typeof t !== 'string' || chars(t) > 16)
      )
        problems.push(`${at}: "tags" is up to 2 labels of 16 characters`)
    for (const k of ['image', 'avatar']) {
      if (!c[k]) continue
      if (isUrl(c[k])) continue
      const file = resolve(dir, c[k])
      if (!existsSync(file)) problems.push(`${at}: ${k} ${file} not found`)
      else c[k] = pathToFileURL(file).href
    }
    if (c.art === 'image' && !c.image)
      problems.push(`${at}: "art": "image" needs an "image" path`)
    return { ...c, out, theme }
  })
  // Block layouts come from the slug, so a post keeps its card when others
  // are added. Working from the end of the list (the oldest posts, as
  // from-posts.mjs writes it), a card never repeats the layout of the one
  // after it.
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i]
    if (c.art !== 'blocks' || c.layout) continue
    let n = (seed(c.slug || c.title) % 4) + 1
    if (n === cards[i + 1]?.layout) n = (n % 4) + 1
    c.layout = n
  }
  return { cards, theme, problems }
}

/** A stable number from text (FNV-1a with a final mix). */
function seed(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  return h >>> 0
}

function fontLinks(theme) {
  if (theme.fonts !== undefined)
    return theme.fonts ? `<link rel="stylesheet" href="${theme.fonts}" />` : ''
  const fam = (name, axes = '') =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}${axes}&display=block`
  // One stylesheet per family, so a family without italics or a weight
  // doesn't stop the others loading.
  return [
    fam(theme.serif),
    fam(theme.serif, ':ital@1'),
    fam(theme.sans, ':wght@400;500;600'),
    fam(theme.mono, ':wght@500;600'),
  ]
    .map((href) => `<link rel="stylesheet" href="${href}" />`)
    .join('\n    ')
}

/** The finished HTML for one prepared card. */
export function html(card) {
  const page = readFileSync(join(TEMPLATE, 'card.html'), 'utf8')
  const css = readFileSync(join(TEMPLATE, 'card.css'), 'utf8')
  const js = readFileSync(join(TEMPLATE, 'card.js'), 'utf8')
  const { out: _out, ...data } = card
  const quote = (name) => `"${name.replace(/"/g, '')}"`
  data.theme = {
    ...card.theme,
    serif: `${quote(card.theme.serif)}, Georgia, serif`,
    sans: `${quote(card.theme.sans)}, system-ui, sans-serif`,
    mono: `${quote(card.theme.mono)}, ui-monospace, monospace`,
  }
  return page
    .replace('<!--FONTS-->', () => fontLinks(card.theme))
    .replace('/*CSS*/', () => css)
    .replace('{} // DATA', () => JSON.stringify(data).replace(/</g, '\\u003c'))
    .replace('/*JS*/', () => js)
}

function pngSize(file) {
  const b = readFileSync(file)
  return b.toString('ascii', 12, 16) === 'IHDR'
    ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
    : null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = (name, fallback) =>
    args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
  const input = resolve(args.find((a) => !a.startsWith('--')) || 'cards.json')
  const dir = dirname(input)
  const scale = Number(flag('scale', 1))
  const jobs = Math.max(1, Number(flag('jobs', 4)))
  const only = flag('only', '').split(',').filter(Boolean)

  let doc
  try {
    doc = JSON.parse(readFileSync(input, 'utf8'))
  } catch (e) {
    console.error(`render: cannot read ${input}: ${e.message}`)
    process.exit(1)
  }
  const { cards, problems } = prepare(doc, dir)
  if (problems.length) {
    console.error(
      `render: fix cards.json first:\n  - ${problems.join('\n  - ')}`,
    )
    process.exit(1)
  }
  if (![1, 2, 3].includes(scale)) {
    console.error('render: --scale is 1, 2 or 3')
    process.exit(1)
  }
  const chrome = findChrome()
  if (!chrome) {
    console.error(
      'render: no Chrome, Chromium or Edge found. Install one, or set CHROME_PATH to its executable.',
    )
    process.exit(1)
  }

  const todo = only.length ? cards.filter((c) => only.includes(c.slug)) : cards
  if (!todo.length) {
    console.error(`render: no card has the slug ${only.join(', ')}`)
    process.exit(1)
  }
  const t0 = Date.now()
  const work = await mkdtemp(join(tmpdir(), 'og-cards-'))
  const failed = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(jobs, todo.length) }, async () => {
      while (next < todo.length) {
        const i = next++
        const card = todo[i]
        const page = join(work, `card-${i}.html`)
        writeFileSync(page, html(card))
        mkdirSync(dirname(card.out), { recursive: true })
        try {
          await screenshot(chrome, pathToFileURL(page).href, card.out, {
            w: W,
            h: H,
            scale,
          })
          const size = existsSync(card.out) ? pngSize(card.out) : null
          if (!size || size.w !== W * scale || size.h !== H * scale)
            throw new Error(
              `wrote ${size ? `${size.w}×${size.h}` : 'nothing'}, expected ${W * scale}×${H * scale}`,
            )
          console.log(`  ${relative(process.cwd(), card.out)}`)
        } catch (e) {
          failed.push(`${card.slug || card.out}: ${e.message}`)
        }
      }
    }),
  )
  await rm(work, { recursive: true, force: true })

  // A page with every card, to check them side by side.
  const preview = join(dir, 'og-preview.html')
  writeFileSync(
    preview,
    `<!doctype html><meta charset="utf-8"><title>OG cards</title>
<style>body{margin:0;padding:32px;background:#e9e9e4;font:14px/1.4 system-ui,sans-serif;color:#222}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:28px}figure{margin:0}img{width:100%;display:block;border-radius:10px;box-shadow:0 10px 30px -18px #0008}figcaption{margin-top:8px;color:#555}</style>
<main>${cards
      .map(
        (c) =>
          `<figure><img src="${relative(dir, c.out).split('\\').join('/')}?${Date.now()}" alt=""><figcaption>${c.title.replace(/[*<>&]/g, '')}<br><code>${relative(dir, c.out)}</code></figcaption></figure>`,
      )
      .join('\n')}</main>\n`,
  )
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(
    `Rendered ${todo.length - failed.length} of ${todo.length} cards at ${W * scale}×${H * scale} in ${secs}s. Preview: ${relative(process.cwd(), preview)}`,
  )
  if (failed.length) {
    console.error(`These failed:\n  - ${failed.join('\n  - ')}`)
    process.exit(1)
  }
}
