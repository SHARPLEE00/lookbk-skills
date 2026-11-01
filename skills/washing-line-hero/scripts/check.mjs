#!/usr/bin/env node
// Checks a built page in headless Chrome at phone, tablet, laptop and
// desktop widths before it's handed off:
//
//   node scripts/check.mjs out/index.html
//   node scripts/check.mjs out              (every page in a folder)
//
// Errors (exit 1): anything wider than the screen, content cut off inside a
// box, text below WCAG AA contrast, images without alt text, form fields
// without a label, links or buttons with no name, a missing lang, viewport
// or single h1, skipped heading levels, text under 12 px.
// Warnings: placeholder links (href="#") and tap targets under 24 px
// (links inside a sentence are exempt).
//
// No packages to install. Set CHROME_PATH if Chrome isn't found.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { findChrome, inFrame } from './chrome.mjs'

const WIDTHS = [390, 768, 1024, 1440]

// Runs inside the page and returns what it found.
function inspect() {
  const errors = []
  const warnings = []
  const W = innerWidth
  const name = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
    (typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '')
  const text = (el) =>
    (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const parse = (c) => {
    const m = String(c).match(/[\d.]+/g) || [0, 0, 0, 0]
    const srgb = /^color\(srgb/.test(c)
    return {
      rgb: [0, 1, 2].map((i) => (srgb ? 255 : 1) * Number(m[i])),
      a: m.length > 3 ? Number(m[3]) : 1,
    }
  }
  const lum = (rgb) => {
    const l = rgb.map((v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
  }
  const over = (top, bottom, a) =>
    top.map((v, i) => v * a + bottom[i] * (1 - a))
  // Visible on screen: not hidden, and bigger than the 1px box that
  // screen-reader-only text is squeezed into.
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return (
      r.width * r.height > 1 &&
      cs.visibility !== 'hidden' &&
      cs.display !== 'none'
    )
  }

  // Wider than the screen.
  if (document.documentElement.scrollWidth > W + 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect()
      return (
        r.right > W + 1 &&
        r.width > 0 &&
        getComputedStyle(el).position !== 'fixed'
      )
    })
    const top = wide
      .filter((el) => !wide.includes(el.parentElement))
      .slice(0, 4)
    errors.push(
      `page is ${document.documentElement.scrollWidth}px wide on a ${W}px screen: ${top.map(name).join(', ')}`,
    )
  }

  // Contrast of every visible run of text against the colour behind it.
  const seen = new Set()
  for (const el of document.body.querySelectorAll('*')) {
    const own = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.data.trim(),
    )
    if (!own || !visible(el)) continue
    const cs = getComputedStyle(el)
    if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text')
      continue
    const fg = parse(cs.color)
    let opacity = 1
    const layers = []
    let layered = false
    for (let p = el; p; p = p.parentElement) {
      const ps = getComputedStyle(p)
      opacity *= Number(ps.opacity)
      if (ps.backgroundImage !== 'none') layered = true
      const b = parse(ps.backgroundColor)
      if (b.a > 0) layers.push(b)
      if (b.a >= 1) break
    }
    if (layered) continue // over an image or gradient: can't be measured here
    // See-through backgrounds laid over the opaque one below them (or the
    // white canvas when nothing is opaque).
    let back = [255, 255, 255]
    for (const b of layers.reverse()) back = over(b.rgb, back, b.a)
    const front = over(fg.rgb, back, fg.a * opacity)
    const [a, b] = [lum(front), lum(back)]
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    const size = parseFloat(cs.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
    const need = large ? 3 : 4.5
    const key = `${text(el)}|${ratio.toFixed(1)}`
    if (ratio < need && !seen.has(key)) {
      seen.add(key)
      errors.push(
        `contrast ${ratio.toFixed(2)}:1 (needs ${need}:1) on "${text(el)}" (${name(el)})`,
      )
    }
    if (size < 12 && !seen.has(`small|${text(el)}`)) {
      seen.add(`small|${text(el)}`)
      errors.push(`text is ${size}px, under 12px: "${text(el)}"`)
    }
  }

  // Content cut off by a box with overflow hidden (a card too small for
  // its text, say). Mark a box data-clip-ok when cropping is the point.
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (el.hasAttribute('data-clip-ok') || !visible(el)) continue
    const clips = (o) => o === 'hidden' || o === 'clip'
    for (const [axis, o, scroll, client, pad] of [
      [
        'taller',
        cs.overflowY,
        el.scrollHeight,
        el.clientHeight,
        parseFloat(cs.paddingBottom),
      ],
      [
        'wider',
        cs.overflowX,
        el.scrollWidth,
        el.clientWidth,
        parseFloat(cs.paddingRight),
      ],
    ]) {
      const extra = scroll - client
      if (
        !clips(o) ||
        extra <= 1 ||
        el === document.body ||
        el === document.documentElement
      )
        continue
      const what = text(el.querySelector('h1,h2,h3,h4') || el)
      if (extra > pad + 1)
        errors.push(
          `content is ${extra - Math.round(pad)}px ${axis} than its box and is cut off: ${name(el)} "${what}"`,
        )
      else
        warnings.push(
          `content runs into the padding by ${extra}px: ${name(el)} "${what}"`,
        )
    }
  }

  // Structure and names.
  if (!document.documentElement.lang) errors.push('<html> has no lang')
  if (!document.querySelector('meta[name=viewport]'))
    errors.push('no viewport meta tag')
  const h1 = document.querySelectorAll('h1').length
  if (h1 !== 1) errors.push(`${h1} h1 elements; a page needs exactly one`)
  let last = 0
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const level = Number(h.tagName[1])
    if (last && level > last + 1)
      errors.push(`heading jumps from h${last} to h${level} at "${text(h)}"`)
    last = level
  }
  for (const img of document.querySelectorAll('img'))
    if (!img.hasAttribute('alt'))
      errors.push(`image without alt: ${img.getAttribute('src')}`)
  for (const f of document.querySelectorAll(
    'input:not([type=hidden]),select,textarea',
  )) {
    const labelled =
      f.labels?.length ||
      f.getAttribute('aria-label') ||
      f.getAttribute('aria-labelledby')
    if (!labelled) errors.push(`form field without a label: ${name(f)}`)
  }
  for (const el of document.querySelectorAll('a,button')) {
    const label =
      text(el) ||
      el.getAttribute('aria-label') ||
      [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('')
    if (!label)
      errors.push(
        `${el.tagName.toLowerCase()} with no text or aria-label: ${name(el)}`,
      )
    if (el.tagName === 'A' && ['#', ''].includes(el.getAttribute('href') ?? ''))
      warnings.push(`placeholder link: "${text(el)}"`)
    // A link inside a sentence is exempt (WCAG 2.5.8, "inline").
    const inSentence =
      getComputedStyle(el).display === 'inline' &&
      el.parentElement.textContent.trim().length >
        el.textContent.trim().length + 1
    if (
      W < 500 &&
      visible(el) &&
      !inSentence &&
      el.getBoundingClientRect().height < 24
    )
      warnings.push(
        `small tap target (${Math.round(el.getBoundingClientRect().height)}px): "${text(el)}"`,
      )
  }
  return { errors, warnings }
}

// Pages to check: the files named, and every .html file in a folder named.
function pagesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'screens') return []
    const p = join(dir, e.name)
    if (e.isDirectory()) return pagesIn(p)
    return e.name.endsWith('.html') ? [p] : []
  })
}
const inputs = (process.argv.slice(2).length ? process.argv.slice(2) : ['out/index.html'])
  .filter((a) => !a.startsWith('--'))
  .map((a) => resolve(a))
for (const input of inputs)
  if (!existsSync(input)) {
    console.error(`check: ${input} not found; build the page first`)
    process.exit(1)
  }
const pages = inputs.flatMap((p) => (statSync(p).isDirectory() ? pagesIn(p).sort() : [p]))
const chrome = findChrome()
if (!chrome) {
  console.error('check: no Chrome, Chromium or Edge found; set CHROME_PATH')
  process.exit(1)
}

let failed = false
for (const page of pages) {
  if (pages.length > 1) console.log(relative(process.cwd(), page) || page)
  const pad = pages.length > 1 ? '  ' : ''
  const results = inFrame(chrome, page, WIDTHS, inspect)
  for (const [i, w] of WIDTHS.entries()) {
    if (!results[i]) {
      console.error(`${pad}${w}px: the page didn't finish loading`)
      failed = true
      continue
    }
    const unique = (list) => [...new Set(list)]
    const errors = unique(results[i].errors)
    const warnings = unique(results[i].warnings)
    console.log(
      `${pad}${w}px: ${errors.length ? `${errors.length} to fix` : 'ok'}${warnings.length ? `, ${warnings.length} to look at` : ''}`,
    )
    for (const e of errors) console.log(`${pad}  ✗ ${e}`)
    for (const e of warnings) console.log(`${pad}  · ${e}`)
    if (errors.length) failed = true
  }
}
process.exit(failed ? 1 : 0)
