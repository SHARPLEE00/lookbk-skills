#!/usr/bin/env node
// Builds a Swiss Grid Deck from deck.json into one self-contained HTML file.
//
//   node scripts/build.mjs deck.json [out-dir]     (default out-dir: ./out)
//
// Checks every slide against its layout (required fields, lengths, counts)
// and lists every problem at once. The HTML inlines the styles and the
// player, so it opens from disk, and prints one slide per page for PDF.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LAYOUTS = {
  title: { title: [true, 40], byline: [false, 80], date: [false, 60] },
  section: { number: [true, 4], title: [true, 60], text: [false, 160] },
  statement: { kicker: [false, 40], title: [true, 140] },
  three: { kicker: [false, 40], title: [true, 80], items: [true, 3, 3] },
  number: { value: [true, 8], text: [true, 140] },
  bars: {
    kicker: [false, 40],
    title: [true, 60],
    text: [false, 220],
    bars: [true, 2, 8],
    highlight: [false, 12],
    prefix: [false, 4],
    suffix: [false, 6],
  },
  quote: { quote: [true, 200], by: [true, 80] },
  list: { kicker: [false, 40], title: [true, 80], items: [true, 2, 6] },
  closing: { title: [false, 24], contact: [false, 0, 3] },
}
const COMMON = {
  layout: [true, 0],
  label: [false, 40],
  source: [false, 80],
  notes: [false, 2000],
  dark: [false, 0],
}
const ITEM_LIMITS = {
  three: { value: [true, 6], heading: [true, 32], text: [false, 120] },
  bars: { label: [true, 10] },
}

const here = dirname(fileURLToPath(import.meta.url))
const chars = (s) => [...String(s)].length

/** Every problem in a deck, as readable lines. Empty when the deck is fine. */
export function validate(deck) {
  const problems = []
  if (!deck || typeof deck !== 'object') return ['deck.json must be an object']
  for (const key of ['title', 'org'])
    if (typeof deck[key] !== 'string' || !deck[key].trim())
      problems.push(`"${key}" is required at the top level`)
  if (!Array.isArray(deck.slides) || !deck.slides.length)
    return [...problems, '"slides" must be a non-empty array']
  if (deck.slides.length > 30) problems.push('a deck has at most 30 slides')
  for (const c of ['paper', 'ink', 'accent']) {
    const v = deck.theme?.[c]
    if (v !== undefined && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v))
      problems.push(`theme.${c} must be a hex colour like #e3262b`)
  }
  deck.slides.forEach((s, i) => {
    const at = `slide ${i + 1}`
    const spec = LAYOUTS[s?.layout]
    if (!spec) {
      problems.push(
        `${at}: layout must be one of ${Object.keys(LAYOUTS).join(', ')}`,
      )
      return
    }
    const fields = { ...COMMON, ...spec }
    for (const key of Object.keys(s))
      if (!(key in fields))
        problems.push(`${at} (${s.layout}): "${key}" is not a field here`)
    for (const [key, [required, a, b]] of Object.entries(fields)) {
      const v = s[key]
      if (v === undefined || v === '') {
        if (required) problems.push(`${at} (${s.layout}): "${key}" is required`)
        continue
      }
      if (key === 'layout' || key === 'dark') continue
      if (b !== undefined) {
        if (!Array.isArray(v) || v.length < a || v.length > b)
          problems.push(
            `${at}: "${key}" needs ${a === b ? a : `${a} to ${b}`} entries`,
          )
        else if (ITEM_LIMITS[s.layout])
          v.forEach((item, j) => {
            for (const [k, [req, max]] of Object.entries(
              ITEM_LIMITS[s.layout],
            )) {
              const x = item?.[k]
              if (x === undefined || x === '') {
                if (req) problems.push(`${at}: ${key}[${j}].${k} is required`)
              } else if (chars(x) > max)
                problems.push(
                  `${at}: ${key}[${j}].${k} is ${chars(x)} characters; the limit is ${max}`,
                )
            }
            if (s.layout === 'bars' && !Number.isFinite(item?.value))
              problems.push(`${at}: bars[${j}].value must be a number`)
          })
        else
          v.forEach((x, j) => {
            if (typeof x !== 'string' || chars(x) > 70)
              problems.push(
                `${at}: ${key}[${j}] must be text of at most 70 characters`,
              )
          })
      } else if (typeof v !== 'string')
        problems.push(`${at}: "${key}" must be text`)
      else if (chars(v) > a)
        problems.push(
          `${at}: "${key}" is ${chars(v)} characters; the limit is ${a}`,
        )
    }
  })
  return problems
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
/** Escapes text; *words* become the accent colour, \n a line break. */
const rich = (s) =>
  esc(s)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')

const fit = (w, h) => ` data-fit="${w},${h}"`
const head = (s, w, h) =>
  `<div class="head">${s.kicker ? `<div class="kicker">${rich(s.kicker)}</div>` : ''}<div class="h2"${fit(w, h)}>${rich(s.title)}</div></div>`

const BODY = {
  title: (s) =>
    `<div class="dot"></div><h1${fit(1150, 610)}>${rich(s.title)}</h1>`,
  section: (s) =>
    `<div class="num">${esc(s.number)}</div><div class="h2"${fit(1500, 240)}>${rich(s.title)}</div>${s.text ? `<div class="copy muted">${rich(s.text)}</div>` : ''}`,
  statement: (s) =>
    `${s.kicker ? `<div class="kicker">${rich(s.kicker)}</div>` : ''}<div class="h2"${fit(1560, 560)}>${rich(s.title)}</div>`,
  three: (s) =>
    `${head(s, 1300, 240)}<div class="cols">${s.items
      .map(
        (it) =>
          `<div><b>${esc(it.value)}</b><h3>${rich(it.heading)}</h3>${it.text ? `<p class="muted">${rich(it.text)}</p>` : ''}</div>`,
      )
      .join('')}</div>`,
  number: (s) =>
    `<div class="big"${fit(1720, 380)}>${esc(s.value)}</div><div class="copy"${fit(1100, 240)}>${rich(s.text)}</div>`,
  bars: (s) => {
    const max = Math.max(...s.bars.map((b) => b.value), 1)
    const want = (s.highlight || '').toLowerCase()
    let hi = s.bars.findIndex((b) => b.label.toLowerCase() === want)
    if (hi < 0) hi = s.bars.length - 1
    // Every value shows the same number of decimals as the most precise one.
    const decimals = Math.min(
      2,
      Math.max(
        ...s.bars.map((b) => (String(b.value).split('.')[1] || '').length),
      ),
    )
    const fmt = (v) =>
      `${s.prefix || ''}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${s.suffix || ''}`
    return `${head(s, 760, 300)}${s.text ? `<div class="copy"${fit(760, 260)}>${rich(s.text)}</div>` : ''}<div class="chart">${s.bars
      .map(
        (b, i) =>
          `<div${i === hi ? ' class="hi"' : ''} style="height:${((Math.max(0, b.value) / max) * 100).toFixed(1)}%"><b>${esc(fmt(b.value))}</b><span>${esc(b.label)}</span></div>`,
      )
      .join('')}</div>`
  },
  quote: (s) =>
    `<div class="mark">“</div><blockquote${fit(1560, 500)}>${rich(s.quote)}</blockquote><cite>${rich(s.by)}</cite>`,
  list: (s) =>
    `${head(s, 1300, 240)}<ol>${s.items
      .map(
        (it, i) =>
          `<li><b>${String(i + 1).padStart(2, '0')}</b><span>${rich(it)}</span></li>`,
      )
      .join('')}</ol>`,
  closing: (s) =>
    `<div class="thanks"${fit(1700, 520)}>${rich(s.title || 'Thank\n*you*.')}</div>${
      s.contact?.length
        ? `<div class="contact">${s.contact.map(rich).join('<br>')}</div>`
        : ''
    }`,
}
const CLASS = {
  title: 'l-title',
  section: 'l-section',
  statement: 'l-statement',
  three: 'l-three',
  number: 'l-number',
  bars: 'l-bars',
  quote: 'l-quote',
  list: 'l-list',
  closing: 'l-closing',
}

/** The finished HTML for a valid deck. */
export function render(deck) {
  const theme = {
    paper: '#f4f4f1',
    ink: '#121212',
    accent: '#e3262b',
    font: 'Inter Tight',
    ...deck.theme,
  }
  const fontUrl =
    deck.theme?.fontUrl ??
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.font).replace(/%20/g, '+')}:wght@400;500;600;700;800&display=swap`
  const css = readFileSync(join(here, '..', 'assets', 'deck.css'), 'utf8')
  const js = readFileSync(join(here, '..', 'assets', 'deck.js'), 'utf8')
  const grid =
    deck.grid === false ? '' : `<div class="grid">${'<i></i>'.repeat(8)}</div>`
  const slides = deck.slides
    .map((s, i) => {
      const dark = s.dark ?? s.layout === 'closing'
      const left =
        s.layout === 'title' ? s.byline || '' : deck.footer || deck.title
      const right = s.layout === 'title' ? s.date || '' : s.source || ''
      return `<section class="slide ${CLASS[s.layout]}${dark ? ' dark' : ''}">
${grid}<div class="meta"><span>${esc(deck.org)}</span><span>${esc(s.label || deck.title)}</span><span>${String(i + 1).padStart(2, '0')}</span></div>
${BODY[s.layout](s)}
<div class="foot"><span>${rich(left)}</span><span>${rich(right)}</span></div>${
        s.notes ? `\n<aside class="notes">${rich(s.notes)}</aside>` : ''
      }
</section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="${esc(deck.lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deck.title)}</title>
${fontUrl ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${esc(fontUrl)}">` : ''}
<style>
:root { --paper: ${theme.paper}; --ink: ${theme.ink}; --accent: ${theme.accent}; --font: "${theme.font.replace(/"/g, '')}", "Helvetica Neue", Helvetica, Arial, sans-serif; }
${css}</style>
</head>
<body>
<div class="deck">
${slides}
</div>
<div class="notes-panel"></div>
<script>
${js}</script>
</body>
</html>
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = resolve(process.argv[2] || 'deck.json')
  const outDir = resolve(process.argv[3] || 'out')
  let deck
  try {
    deck = JSON.parse(readFileSync(input, 'utf8'))
  } catch (e) {
    console.error(`build: cannot read ${input}: ${e.message}`)
    process.exit(1)
  }
  const problems = validate(deck)
  if (problems.length) {
    console.error(`build: fix deck.json first:\n  - ${problems.join('\n  - ')}`)
    process.exit(1)
  }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), render(deck))
  console.log(
    `Built ${deck.slides.length} slides into ${join(outDir, 'index.html')}`,
  )
}
