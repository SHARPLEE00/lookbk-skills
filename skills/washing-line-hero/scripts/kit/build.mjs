#!/usr/bin/env node
// Motion Heroes kit: builds an animated hero section from hero.json.
//
//   node scripts/build.mjs hero.json out
//
// Writes out/index.html (a self-contained page: CSS, script and logo
// inline), out/embed.html (the section alone, to paste into a page you
// already have) and out/assets/ (the logo as a file, for the tab icon).
//
// It checks hero.json first and lists every problem at once. This file is
// shared by every Motion Heroes package and knows nothing about any one
// effect: the effect lives in scripts/effect/ (effect.mjs describes its
// parameters, fallback picture and extras; effect.js draws it in the
// browser). See scripts/kit/KIT.md.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { contrast, isDark, isHex, lum, mix, readable } from '../color.mjs'
import { inline, plain } from '../inline.mjs'
import { h, toHtml } from '../markup.mjs'

const KIT = dirname(fileURLToPath(import.meta.url))
const SCRIPTS = dirname(KIT)
const EFFECT_DIR = join(SCRIPTS, 'effect')
const FONTS = JSON.parse(readFileSync(join(KIT, 'fonts.json'), 'utf8'))
const THREE_JSON = JSON.parse(readFileSync(join(KIT, 'three.json'), 'utf8'))

const chars = (s) => [...String(s ?? '')].length
const isUrl = (s) => /^https:\/\//.test(String(s ?? ''))
const isHref = (s) =>
  typeof s === 'string' &&
  s.length > 0 &&
  (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(s) ||
    !/^[a-z][\w+.-]*:/i.test(s))
const type = (v) => (Array.isArray(v) ? 'list' : v === null ? 'null' : typeof v)

export const MOTION = {
  speed: { type: 'number', min: 0.25, max: 2, default: 1, doc: 'How fast the scene moves; 1 is the designed pace' },
  pointer: { type: 'boolean', default: true, doc: 'The scene leans toward the pointer (and follows a slow made-up path in recordings)' },
}
export const ALIGNS = ['left', 'center', 'right']
// Where the effect's markup (.mh-extra) goes; see KIT.md.
export const EXTRA_PLACES = ['beside', 'above-copy', 'below-copy', 'overlay']
export const DRIVES = ['time', 'scroll']

/* ---------------------------------------------------------------- three.js */

// The kit's pinned three.js (scripts/kit/three.json): the bare "three"
// specifier and the "three/addons/" prefix map to it, and every file the
// catalogue lists carries its SRI hash.
export const THREE = {
  version: THREE_JSON.version,
  base: THREE_JSON.base,
  module: THREE_JSON.base + THREE_JSON.module,
  addons: THREE_JSON.base + THREE_JSON.addons,
}

/** The static imports of an ES module's source (comments stripped). */
function importsOf(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out = new Set()
  // statements only: `import … from '…'`, `export … from '…'`, `import '…'` at the start of a line
  for (const m of code.matchAll(/^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"\n]+)['"]|^[ \t]*import\s*['"]([^'"\n]+)['"]/gm)) out.add(m[1] ?? m[2])
  return [...out]
}

/** A specifier inside a three.js file → a path under THREE.base, or null if the kit doesn't map it. */
function threePath(spec, fromPath) {
  if (spec === 'three') return THREE_JSON.module
  if (spec.startsWith('three/addons/')) return THREE_JSON.addons + spec.slice('three/addons/'.length)
  if (spec.startsWith('./') || spec.startsWith('../')) return new URL(spec, THREE.base + fromPath).href.slice(THREE.base.length)
  return null
}

/**
 * Fetches three.js files from the pinned CDN and follows their static
 * imports: { files: { path: { integrity, imports } }, unmapped: [spec] }.
 * Used by `build.mjs --three-addon` to pin an add-on the catalogue lacks.
 */
export async function crawlThree(paths) {
  const files = {}
  const unmapped = new Set()
  const queue = [...paths]
  while (queue.length) {
    const path = queue.shift()
    if (files[path]) continue
    const r = await fetch(THREE.base + path)
    if (!r.ok) throw new Error(`${THREE.base + path}: HTTP ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    const imports = []
    for (const spec of importsOf(buf.toString('utf8'))) {
      const p = threePath(spec, path)
      if (p === null) unmapped.add(`${spec} (in ${path})`)
      else imports.push(p)
    }
    files[path] = { integrity: 'sha384-' + createHash('sha384').update(buf).digest('base64'), imports }
    queue.push(...imports)
  }
  return { files, unmapped: [...unmapped] }
}

/**
 * What the page needs for the effect's three.js: null when the effect doesn't
 * use the kit's pinned three, else { addons, integrity } with every file the
 * add-ons import (from the catalogue, or the effect's own libs).
 */
function threeFor(fx) {
  const libs = fx.libs ?? []
  const named = libs.find((l) => l.name === 'three')
  const addons = fx.addons ?? []
  if (!Array.isArray(addons) || addons.some((a) => typeof a !== 'string' || !/^[\w./-]+\.js$/.test(a) || a.includes('..')))
    throw new Error("effect.mjs: addons is a list of paths under three/examples/jsm, like 'loaders/GLTFLoader.js'")
  if (named && named.url !== THREE.module) {
    if (addons.length) throw new Error(`effect.mjs: addons need the kit's pinned three.js (${THREE.module}); libs names 'three' at ${named.url}`)
    return null
  }
  if (!named && !addons.length) return null
  const own = Object.fromEntries(libs.filter((l) => l.integrity).map((l) => [l.url, l.integrity]))
  const integrity = {}
  const seen = new Set()
  const walk = (path) => {
    if (seen.has(path)) return
    seen.add(path)
    const url = THREE.base + path
    const known = THREE_JSON.files[path]
    if (known) {
      integrity[url] = known.integrity
      known.imports.forEach(walk)
    } else if (own[url]) integrity[url] = own[url]
    else
      throw new Error(
        `effect.mjs: three.js file ${path} isn't in scripts/kit/three.json or the effect's libs. Run \`node scripts/build.mjs --three-addon ${path.slice(THREE_JSON.addons.length)}\` and add the lines it prints to libs`,
      )
  }
  walk(THREE_JSON.module)
  for (const a of addons) walk(THREE_JSON.addons + a)
  return { addons, integrity }
}

/** The effect's story (a pinned scroll or a timed run), checked; null if it has none. */
function storyFor(fx, params, theme) {
  const s = typeof fx.story === 'function' ? fx.story(params, theme) : fx.story
  if (s === undefined || s === null || s === false) return null
  const bad = (m) => {
    throw new Error(`effect.mjs story: ${m}`)
  }
  const num = (k, dflt, min, max) => {
    const v = s[k] ?? dflt
    if (typeof v !== 'number' || !(v >= min && v <= max)) bad(`${k} is a number from ${min} to ${max}`)
    return v
  }
  const drive = s.drive ?? 'time'
  if (!DRIVES.includes(drive)) bad(`drive is one of ${DRIVES.join(', ')}`)
  if (s.loop !== undefined && typeof s.loop !== 'boolean') bad('loop is true or false')
  for (const k of Object.keys(s)) if (!['drive', 'pin', 'length', 'lead', 'hold', 'loop'].includes(k)) bad(`${k} isn't a field (drive, pin, length, lead, hold, loop)`)
  return {
    drive,
    pin: num('pin', 1.5, 0.25, 8),
    length: num('length', undefined, 0.1, 120),
    lead: num('lead', 1, 0, 30),
    hold: num('hold', 2, 0, 30),
    loop: s.loop ?? true,
  }
}

function extraPlaceFor(fx, params, theme) {
  const v = typeof fx.extraPlace === 'function' ? fx.extraPlace(params, theme) : fx.extraPlace
  const at = v ?? 'beside'
  if (!EXTRA_PLACES.includes(at)) throw new Error(`effect.mjs extraPlace is one of ${EXTRA_PLACES.join(', ')}`)
  return at
}

/** Loads the package's effect description (scripts/effect/effect.mjs). */
export async function loadEffect() {
  const mod = await import(pathToFileURL(join(EFFECT_DIR, 'effect.mjs')).href)
  const fx = mod.default
  const src = readFileSync(join(EFFECT_DIR, 'effect.js'), 'utf8')
  return { ...fx, source: src }
}

/* ---------------------------------------------------------------- params */

/** Checks one value against a parameter schema; returns the value to use. */
function checkParam(spec, value, at, problems, ctx) {
  const dflt = typeof spec.default === 'function' ? spec.default(ctx) : spec.default
  if (value === undefined) return dflt
  const bad = (msg) => (problems.push(`${at} ${msg}`), dflt)
  switch (spec.type) {
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || Number.isNaN(value))
        return bad(`must be a number from ${spec.min} to ${spec.max} (default ${dflt})`)
      if (spec.type === 'integer' && !Number.isInteger(value))
        return bad(`must be a whole number from ${spec.min} to ${spec.max}`)
      if (value < spec.min || value > spec.max)
        return bad(`is ${value}; it goes from ${spec.min} to ${spec.max} (default ${dflt})`)
      return value
    case 'boolean':
      return typeof value === 'boolean' ? value : bad('must be true or false')
    case 'color':
      return isHex(value) ? value.toLowerCase() : bad('must be a hex colour like #1b1830')
    case 'enum':
      return spec.values.includes(value) ? value : bad(`is one of ${spec.values.join(', ')}`)
    case 'text':
      if (typeof value !== 'string') return bad('must be text')
      if (chars(value) > spec.max) return bad(`is ${chars(value)} characters; the limit is ${spec.max}`)
      return value
    case 'list': {
      if (!Array.isArray(value)) return bad(`must be a list of ${spec.min} to ${spec.max}`)
      if (value.length < spec.min || value.length > spec.max)
        return bad(`has ${value.length}; it takes ${spec.min} to ${spec.max}`)
      return value.map((item, i) => {
        if (type(item) !== 'object') return (problems.push(`${at}[${i}] must be an object`), item)
        const out = {}
        for (const [k, s] of Object.entries(spec.item)) {
          if (s.required && item[k] === undefined) problems.push(`${at}[${i}].${k} is required`)
          out[k] = checkParam(s, item[k], `${at}[${i}].${k}`, problems, ctx)
        }
        for (const k of Object.keys(item))
          if (!spec.item[k]) problems.push(`${at}[${i}].${k} isn't a field (fields: ${Object.keys(spec.item).join(', ')})`)
        return out
      })
    }
    default:
      throw new Error(`effect.mjs: ${at} has unknown type ${spec.type}`)
  }
}

/* ---------------------------------------------------------------- fonts */

// The weights the shell uses (body 400, labels and buttons 500–700) plus the
// headline weight. A Google Fonts request names exactly these.
const shellWeights = (headline) => [...new Set([400, 500, 600, 700, headline])].sort((a, b) => a - b)

const googleHref = (name, weights) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}${weights.length ? `:wght@${weights.join(';')}` : ''}&display=swap`

function fontFor(name, notes, weights) {
  if (name === false || name === 'system') return { stack: null, links: [] }
  const known = FONTS[name]
  if (known) {
    const css = [known.css].flat()
    const integrity = [known.integrity].flat()
    return { family: known.family, links: css.map((href, i) => ({ href, integrity: integrity[i] })) }
  }
  notes.push(
    `"${name}" isn't in the pinned font list (scripts/kit/fonts.json); it loads from Google Fonts, which isn't version-pinned`,
  )
  return { family: name, google: { name, weights }, links: [{ href: googleHref(name, weights) }] }
}

/**
 * Google Fonts answers HTTP 400 when any requested weight doesn't exist for a
 * family (Fredoka and Quicksand stop at 700), and the page then quietly falls
 * back to system fonts. Ask for the weights we use; if that fails, keep only
 * the weights the family has. A family that loads in no weight is an error.
 * Being offline is only a note: the build can't tell either way.
 */
async function settleGoogleFonts(fonts, problems, notes) {
  const ask = async (href) => {
    const r = await fetch(href, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' } })
    return r.ok && /@font-face/.test(await r.text())
  }
  const done = new Map()
  for (const f of Object.values(fonts)) {
    if (!f.google) continue
    const { name, weights } = f.google
    const key = `${name}|${weights}`
    if (!done.has(key)) {
      done.set(
        key,
        (async () => {
          try {
            if (await ask(googleHref(name, weights))) return { weights }
            const have = []
            for (const w of weights) if (await ask(googleHref(name, [w]))) have.push(w)
            if (have.length) return { weights: have }
            return (await ask(googleHref(name, []))) ? { weights: [] } : { fail: true }
          } catch {
            return { offline: true }
          }
        })(),
      )
    }
    const got = await done.get(key)
    if (got.fail) problems.push(`font "${name}" doesn't load from Google Fonts in any weight: check the spelling, or pick a family from scripts/kit/fonts.json`)
    else if (got.offline) notes.push(`couldn't reach Google Fonts to check "${name}"; if it doesn't exist the page shows system fonts`)
    else {
      if (got.weights.join() !== weights.join()) {
        const missing = weights.filter((w) => !got.weights.includes(w))
        notes.push(`"${name}" has no ${missing.join(', ')} weight on Google Fonts; loading ${got.weights.length ? got.weights.join(', ') : 'its default weight'} and the browser fakes the rest`)
      }
      f.links = [{ href: googleHref(name, got.weights) }]
    }
  }
}

/* ---------------------------------------------------------------- validate */

/**
 * Every problem in hero.json at once, plus the resolved document the page
 * is built from (defaults filled in, colours worked out).
 */
export function resolveDoc(doc, fx, base) {
  const problems = []
  const notes = []
  const need = (ok, msg) => ok || problems.push(msg)
  const text = (obj, key, max, at, required = false) => {
    const v = obj?.[key]
    if (v === undefined || v === null || v === '') {
      if (required) problems.push(`${at}.${key} is required`)
      return
    }
    if (typeof v !== 'string') problems.push(`${at}.${key} must be text`)
    else if (chars(plain(v.replace(/\n/g, ' '))) > max)
      problems.push(`${at}.${key} is ${chars(plain(v))} characters; the limit is ${max}`)
  }
  const link = (l, at, max) => {
    if (type(l) !== 'object') return problems.push(`${at} must be { "label", "href" }`)
    text(l, 'label', max, at, true)
    need(isHref(l.href), `${at}.href is a URL, a path like /pricing or an #anchor`)
  }
  if (type(doc) !== 'object') return { problems: ['hero.json must be an object'] }
  const known = ['brand', 'nav', 'action', 'hero', 'theme', 'effect', 'meta', 'motion', '$schema', '_']
  for (const k of Object.keys(doc))
    if (!known.includes(k)) problems.push(`"${k}" isn't a field of hero.json (fields: ${known.slice(0, 8).join(', ')})`)

  // brand
  const brand = doc.brand ?? {}
  if (!doc.brand) problems.push('brand is required')
  text(brand, 'name', 28, 'brand', true)
  if (brand.href !== undefined) need(isHref(brand.href), 'brand.href is a URL or a path')
  let logo = null
  if (brand.logo !== undefined) {
    if (typeof brand.logo !== 'string' || !brand.logo) problems.push('brand.logo is an .svg file next to hero.json, or up to 3 characters of text')
    else if (/\.svg$/i.test(brand.logo)) {
      const file = resolve(base, brand.logo)
      if (!existsSync(file)) problems.push(`brand.logo: ${brand.logo} not found next to hero.json`)
      else {
        const svg = readFileSync(file, 'utf8')
        if (!/<svg[\s>]/i.test(svg)) problems.push(`brand.logo: ${brand.logo} isn't an SVG`)
        else if (/<script|\son\w+\s*=|javascript:|<foreignObject/i.test(svg))
          problems.push(`brand.logo: ${brand.logo} has scripts or event handlers; save a plain SVG`)
        else if (!/viewBox=/i.test(svg)) problems.push(`brand.logo: ${brand.logo} needs a viewBox so it can be sized`)
        else logo = { kind: 'svg', svg: svg.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/gi, '').trim(), file }
      }
    } else if (chars(brand.logo) > 3) problems.push('brand.logo as text is at most 3 characters (a monogram); use an .svg file for a real logo')
    else logo = { kind: 'text', text: brand.logo }
  }

  // nav and action
  if (doc.nav !== undefined) {
    if (!Array.isArray(doc.nav)) problems.push('nav is a list of { "label", "href" }')
    else {
      need(doc.nav.length <= 5, `nav has ${doc.nav.length} links; the limit is 5`)
      doc.nav.forEach((l, i) => link(l, `nav[${i}]`, 18))
    }
  }
  if (doc.action !== undefined && doc.action !== false) link(doc.action, 'action', 22)

  // hero copy
  const hero = doc.hero ?? {}
  if (!doc.hero) problems.push('hero is required')
  text(hero, 'badge', 40, 'hero')
  text(hero, 'title', 72, 'hero', true)
  if (typeof hero.title === 'string') {
    need((hero.title.match(/\*/g) ?? []).length % 2 === 0, 'hero.title has an unclosed *emphasis*')
    need(hero.title.split('\n').length <= 3, 'hero.title is at most 3 lines')
  }
  text(hero, 'lede', 220, 'hero', true)
  text(hero, 'note', 90, 'hero')
  if (!Array.isArray(hero.actions) || hero.actions.length < 1 || hero.actions.length > 2)
    problems.push('hero.actions is a list of 1 or 2 { "label", "href" } (the first is the main button)')
  else hero.actions.forEach((l, i) => link(l, `hero.actions[${i}]`, 26))
  const align = hero.align ?? 'left'
  need(ALIGNS.includes(align), `hero.align is one of ${ALIGNS.join(', ')}`)

  // theme
  const theme = doc.theme ?? {}
  if (!doc.theme) problems.push('theme is required')
  for (const k of ['background', 'ink', 'accent'])
    need(isHex(theme[k]), `theme.${k} must be a hex colour like #f2f0f7`)
  const colours = isHex(theme.background) && isHex(theme.ink) && isHex(theme.accent)
  let mode = theme.mode
  if (mode !== undefined && !['light', 'dark'].includes(mode)) problems.push('theme.mode is light or dark')
  if (isHex(theme.background)) {
    const dark = isDark(theme.background) || lum(theme.background) < 0.25
    if (mode === undefined) mode = dark ? 'dark' : 'light'
    else if (['light', 'dark'].includes(mode) && (mode === 'dark') !== dark)
      problems.push(`theme.mode is ${mode} but theme.background ${theme.background} is ${dark ? 'dark' : 'light'}`)
    if (isHex(theme.ink)) {
      const r = contrast(theme.ink, theme.background)
      need(r >= 7, `theme.ink on theme.background is ${r.toFixed(1)}:1; body text needs 7:1 here`)
    }
  }
  if (theme.scrim !== undefined)
    need(typeof theme.scrim === 'number' && theme.scrim >= 0 && theme.scrim <= 1, 'theme.scrim is a number from 0 to 1')
  const f = theme.fonts ?? {}
  if (theme.fonts !== undefined && type(theme.fonts) !== 'object') problems.push('theme.fonts is { "display", "body" }')
  for (const k of ['display', 'body'])
    if (f[k] !== undefined && f[k] !== false && (typeof f[k] !== 'string' || !f[k]))
      problems.push(`theme.fonts.${k} is a font family name, or false for the system font`)
  if (f.weight !== undefined)
    need(Number.isInteger(f.weight) && f.weight >= 300 && f.weight <= 800, 'theme.fonts.weight is 300 to 800 (the headline weight)')

  // motion
  const motion = {}
  const mo = doc.motion ?? {}
  if (doc.motion !== undefined && type(doc.motion) !== 'object') problems.push('motion is { "speed", "pointer" }')
  for (const [k, s] of Object.entries(MOTION)) motion[k] = checkParam(s, mo[k], `motion.${k}`, problems, {})
  for (const k of Object.keys(mo)) if (!MOTION[k]) problems.push(`motion.${k} isn't a field (fields: speed, pointer)`)

  // meta
  const meta = doc.meta ?? {}
  if (!doc.meta) problems.push('meta is required')
  text(meta, 'title', 70, 'meta', true)
  text(meta, 'description', 170, 'meta', true)
  if (meta.url !== undefined) need(isUrl(meta.url), "meta.url is the page's full https:// address")
  if (meta.image !== undefined) need(isUrl(meta.image), 'meta.image is a full https:// address of a 1200×630 picture')
  if (meta.lang !== undefined) need(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(meta.lang), 'meta.lang is a language tag like en or pt-BR')

  // effect parameters, with defaults that may depend on the theme (checked
  // even when other fields have problems, so every problem shows at once)
  const ctx = { theme: colours ? { ...theme, mode } : { background: '#ffffff', ink: '#111111', accent: '#3355ff', mode: 'light' } }
  const params = {}
  const ef = doc.effect ?? {}
  const before = problems.length
  if (doc.effect !== undefined && type(doc.effect) !== 'object') problems.push("effect is an object of this effect's settings")
  for (const [k, s] of Object.entries(fx.params)) params[k] = checkParam(s, ef[k], `effect.${k}`, problems, ctx)
  for (const k of Object.keys(ef))
    if (!fx.params[k]) problems.push(`effect.${k} isn't a setting of ${fx.name} (settings: ${Object.keys(fx.params).join(', ')})`)
  if (colours) {
    try {
      fx.check?.(params, ctx.theme, problems)
    } catch {
      if (problems.length === before) throw new Error('effect.mjs check() failed on valid settings')
    }
  }
  if (problems.length || !colours) return { problems, notes }

  // colours: text is checked against every ground the effect says it can
  // sit on, after the scrim behind the copy has washed it toward the background
  const scrim = theme.scrim ?? (align === 'center' ? Math.max(0.85, fx.scrim ?? 0) : fx.scrim ?? 0.3)
  const grounds = [theme.background, ...(fx.grounds?.(params, ctx.theme, { align }) ?? []).map((g) => mix(g, theme.background, scrim))]
  const worst = (c) => Math.min(...grounds.map((g) => contrast(c, g)))
  if (worst(theme.ink) < 7)
    notes.push(`the headline reads at ${worst(theme.ink).toFixed(1)}:1 where the effect is brightest; raise theme.scrim for more`)
  if (worst(theme.ink) < 4.5)
    problems.push(`theme.ink falls to ${worst(theme.ink).toFixed(1)}:1 over the effect; raise theme.scrim (now ${scrim}) or pick a darker or lighter ink`)
  let emphasis = theme.accent
  if (worst(emphasis) < 4.5) {
    emphasis = readable(theme.accent, grounds, 4.6)
    notes.push(`theme.accent ${theme.accent} reads at ${worst(theme.accent).toFixed(1)}:1; the *emphasis* in the headline uses ${emphasis} instead (4.5:1)`)
  }
  const mute = readable(mix(theme.ink, theme.background, 0.28), grounds, 6)
  const weights = shellWeights(f.weight ?? 500)
  const fonts = {
    display: fontFor(f.display ?? 'Space Grotesk', notes, weights),
    body: fontFor(f.body ?? f.display ?? 'Space Grotesk', notes, weights),
  }
  return {
    problems,
    notes,
    doc: {
      brand: { name: brand.name, href: brand.href ?? '/', logo },
      nav: doc.nav ?? [],
      action: doc.action === false ? null : (doc.action ?? null),
      hero: { ...hero, align },
      theme: {
        mode,
        background: theme.background.toLowerCase(),
        ink: theme.ink.toLowerCase(),
        accent: theme.accent.toLowerCase(),
        emphasis,
        mute,
        scrim,
        weight: f.weight ?? 500,
        fonts,
      },
      params,
      motion,
      meta: { lang: 'en', ...meta },
    },
  }
}

/* ---------------------------------------------------------------- page */

const SYSTEM = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
const stack = (f) => (f.family ? `"${f.family}", ${SYSTEM}` : SYSTEM)

/** The headline: *emphasis* → <em>, \n → a line break. */
function title(t) {
  return t.split('\n').flatMap((line, i) => {
    const parts = line.split(/\*([^*]+)\*/g).map((p, j) => (j % 2 ? h('em', null, p) : p))
    return i ? [h('br'), ...parts] : parts
  })
}

const ARROW = h(
  'svg',
  { class: 'mh-arrow', viewBox: '0 0 14 14', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'aria-hidden': 'true' },
  h('path', { d: 'M1 7h12M8 2l5 5-5 5' }),
)

// Raw HTML (an SVG) goes into the tree as a token that is swapped back in
// after the tree is printed, so markup.mjs can stay as it is.
function rawStore() {
  const list = []
  return {
    raw: (s) => `@@MHRAW${list.push(s) - 1}@@`,
    out: (htmlText) => htmlText.replace(/@@MHRAW(\d+)@@/g, (_, i) => list[Number(i)]),
  }
}

function logoMark(logo, raw) {
  if (!logo) return h('span', { class: 'mh-logo mh-logo-dot', 'aria-hidden': 'true' })
  if (logo.kind === 'text') return h('span', { class: 'mh-logo mh-logo-text', 'aria-hidden': 'true' }, logo.text)
  return h('span', { class: 'mh-logo mh-logo-svg', 'aria-hidden': 'true' }, raw(logo.svg))
}

/** The section's markup (shared by the page and the embed). */
function section(d, fx, id) {
  const { hero } = d
  const { raw, out } = rawStore()
  const still = fx.still(d.params, d.theme)
  const extra = fx.markup?.(d.params, d.theme, h)
  const extraAt = extraPlaceFor(fx, d.params, d.theme)
  const logoNode = logoMark(d.brand.logo, raw)
  return out(toHtml(h(
    'section',
    {
      class: 'mh',
      id,
      'data-align': hero.align,
      'data-mode': d.theme.mode,
      // centred copy hides the extra, so it has no place
      'data-extra': extra && extraAt !== 'beside' && hero.align !== 'center' ? extraAt : null,
      'aria-label': plain(d.brand.name),
    },
    h(
      'div',
      { class: 'mh-stage', 'aria-hidden': 'true', 'data-clip-ok': true },
      h('div', { class: 'mh-still' }, raw(still.backdrop)),
      still.object ? h('div', { class: 'mh-still-obj' }, raw(still.object)) : null,
      h('canvas', { class: 'mh-canvas' }),
      h('div', { class: 'mh-scrim' }),
    ),
    h(
      'header',
      { class: 'mh-bar' },
      h('a', { class: 'mh-brand', href: d.brand.href }, logoNode, h('span', null, d.brand.name)),
      d.nav.length
        ? h('nav', { class: 'mh-nav', 'aria-label': 'Main' }, d.nav.map((l) => h('a', { href: l.href }, l.label)))
        : null,
      d.action ? h('a', { class: 'mh-action', href: d.action.href }, h('i', { 'aria-hidden': 'true' }), d.action.label) : null,
    ),
    h(
      'div',
      { class: 'mh-body' },
      h(
        'div',
        { class: 'mh-copy' },
        hero.badge ? h('p', { class: 'mh-badge' }, h('i', { 'aria-hidden': 'true' }), hero.badge) : null,
        h('h1', { class: 'mh-title' }, title(hero.title)),
        h('p', { class: 'mh-lede' }, inline(hero.lede)),
        h(
          'div',
          { class: 'mh-actions' },
          hero.actions.map((a, i) =>
            h('a', { class: i ? 'mh-btn mh-btn-2' : 'mh-btn mh-btn-1', href: a.href }, a.label, i ? null : ARROW),
          ),
        ),
        hero.note ? h('p', { class: 'mh-note' }, inline(hero.note)) : null,
      ),
      extra ? h('div', { class: 'mh-extra' }, extra) : null,
    ),
  )))
}

function css(d, fx, id) {
  const t = d.theme
  const base = readFileSync(join(KIT, 'shell.css'), 'utf8')
  const vars = `#${id}{--mh-bg:${t.background};--mh-ink:${t.ink};--mh-mute:${t.mute};--mh-accent:${t.accent};--mh-em:${t.emphasis};--mh-scrim:${t.scrim};--mh-weight:${t.weight};--mh-display:${stack(t.fonts.display)};--mh-body:${stack(t.fonts.body)};--mh-glass:${mix(t.background, t.mode === 'dark' ? '#ffffff' : '#ffffff', t.mode === 'dark' ? 0.06 : 0.55)};--mh-line:${mix(t.background, t.ink, 0.16)};--mh-on-ink:${t.background}}`
  return `${vars}\n${base.trim()}\n${(fx.css ?? '').trim()}`
}

function libsMap(fx) {
  const libs = fx.libs ?? []
  const three = threeFor(fx)
  if (!libs.length && !three) return ''
  const integrity = Object.fromEntries(libs.filter((l) => l.integrity).map((l) => [l.url, l.integrity]))
  const imports = {}
  if (three) {
    // bare "three" is the same URL as ctx.load('three'), so add-ons share one copy
    imports.three = THREE.module
    imports['three/addons/'] = THREE.addons
    for (const [url, hash] of Object.entries(three.integrity)) {
      if (integrity[url] && integrity[url] !== hash) throw new Error(`effect.mjs libs: ${url} has a different integrity from scripts/kit/three.json`)
      integrity[url] = hash
    }
  }
  return `<script type="importmap">${JSON.stringify({ imports, integrity })}</script>`
}

function scripts(d, fx, id) {
  const runtime = readFileSync(join(KIT, 'runtime.js'), 'utf8')
  const libs = Object.fromEntries((fx.libs ?? []).filter((l) => l.name).map((l) => [l.name, l.url]))
  const three = threeFor(fx)
  if (three && !libs.three) libs.three = THREE.module
  const story = storyFor(fx, d.params, d.theme)
  const config = {
    id,
    effect: fx.id,
    needs: fx.needs ?? 'none',
    libs,
    params: d.params,
    theme: { mode: d.theme.mode, background: d.theme.background, ink: d.theme.ink, accent: d.theme.accent, emphasis: d.theme.emphasis },
    motion: d.motion,
    stillTime: fx.stillTime ?? 3,
    posterTime: fx.posterTime ?? 3,
    stillScale: fx.stillScale ?? 0.8,
  }
  // only when used, so the page of an effect without them is unchanged
  if (three) config.three = { addons: three.addons }
  if (story) config.story = story
  const body = fx.source.replace(/^export default\s+/m, 'return ')
  return [
    `<script type="application/json" id="${id}-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>`,
    libsMap(fx),
    `<script type="module">\n${runtime.trim()}\nMotionHeroRun((() => {\n${body.trim()}\n})(), ${JSON.stringify(id)})\n</script>`,
  ]
    .filter(Boolean)
    .join('\n')
}

function fontLinks(d) {
  const seen = new Set()
  return Object.values(d.theme.fonts)
    .flatMap((f) => f.links)
    .filter((l) => l && !seen.has(l.href) && seen.add(l.href))
    .map((l) =>
      l.integrity
        ? `<link rel="stylesheet" href="${l.href}" integrity="${l.integrity}" crossorigin="anonymous">`
        : `<link rel="stylesheet" href="${l.href}">`,
    )
    .join('\n')
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function page(d, fx) {
  const id = 'mh-' + fx.id
  const m = d.meta
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escAttr(m.title)}</title>`,
    `<meta name="description" content="${escAttr(m.description)}">`,
    `<meta name="theme-color" content="${d.theme.background}">`,
    `<meta property="og:title" content="${escAttr(m.title)}">`,
    `<meta property="og:description" content="${escAttr(m.description)}">`,
    `<meta property="og:type" content="website">`,
    m.url ? `<meta property="og:url" content="${escAttr(m.url)}">\n<link rel="canonical" href="${escAttr(m.url)}">` : '',
    m.image ? `<meta property="og:image" content="${escAttr(m.image)}">\n<meta name="twitter:card" content="summary_large_image">` : '',
    d.brand.logo?.kind === 'svg' ? '<link rel="icon" href="assets/logo.svg" type="image/svg+xml">' : '',
    fontLinks(d),
  ].filter(Boolean)
  const markup = section(d, fx, id)
  const style = css(d, fx, id)
  const pageCss = `html{background:${d.theme.background};color-scheme:${d.theme.mode}}body{margin:0;background:${d.theme.background};color:${d.theme.ink}}`
  const index = `<!doctype html>
<html lang="${escAttr(m.lang)}">
<head>
${head.join('\n')}
<style>
${pageCss}
${style}
</style>
</head>
<body>
${markup}
${scripts(d, fx, id)}
</body>
</html>
`
  const embed = `<!-- ${d.brand.name} motion hero (${fx.name}). Paste into your page where the hero goes.
     Fonts: move the <link> lines into your <head> if you prefer. The section is scoped under #${id}.
     If your site already has an <script type="importmap">, merge the "integrity" entries into it.${threeFor(fx) ? ' Merge the "imports" too (three, three/addons/).' : ''} -->
${fontLinks(d)}
<style>
${style}
</style>
${markup}
${scripts(d, fx, id)}
`
  return { index, embed }
}

/* ---------------------------------------------------------------- main */

export async function main() {
  const at = process.argv.indexOf('--three-addon')
  if (at > 0) return threeAddon(process.argv.slice(at + 1).filter((a) => !a.startsWith('--')))
  const [input, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!input) {
    console.error('usage: node scripts/build.mjs hero.json [out]')
    process.exit(1)
  }
  const file = resolve(input)
  if (!existsSync(file)) {
    console.error(`build: ${input} not found`)
    process.exit(1)
  }
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`build: ${input} isn't valid JSON: ${e.message}`)
    process.exit(1)
  }
  const fx = await loadEffect()
  const n = (fx.source.match(/^export default\s/gm) ?? []).length
  if (n !== 1 || /^\s*import\s/m.test(fx.source))
    throw new Error('scripts/effect/effect.js must have one `export default` and no static imports (load libraries with ctx.load)')
  const { problems, notes, doc: d } = resolveDoc(doc, fx, dirname(file))
  if (d) await settleGoogleFonts(d.theme.fonts, problems, notes)
  if (problems.length) {
    console.error(`build: fix ${relative(process.cwd(), file) || file} first`)
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  const out = resolve(outArg ?? join(dirname(file), 'out'))
  mkdirSync(join(out, 'assets'), { recursive: true })
  const { index, embed } = page(d, fx)
  writeFileSync(join(out, 'index.html'), index)
  writeFileSync(join(out, 'embed.html'), embed)
  if (d.brand.logo?.kind === 'svg') writeFileSync(join(out, 'assets', 'logo.svg'), d.brand.logo.svg + '\n')
  const shown = (p) => {
    const r = relative(process.cwd(), p)
    return r.startsWith('..') ? p : r
  }
  const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)} KB`
  console.log(`built ${shown(join(out, 'index.html'))} (${kb(index)}) and embed.html (${kb(embed)})`)
  console.log(`  ${fx.name}: ${Object.entries(d.params).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : v}`).join(', ')}`)
  console.log(`  text on the effect: ink ${d.theme.ink}, scrim ${d.theme.scrim}`)
  for (const note of new Set([...notes, ...(fx.notes?.(d.params, d.theme) ?? [])])) console.log(`  · ${note}`)
}


/** node scripts/build.mjs --three-addon loaders/FBXLoader.js: prints libs entries for an add-on the catalogue lacks. */
async function threeAddon(names) {
  if (!names.length) {
    console.error('usage: node scripts/build.mjs --three-addon <path under three/examples/jsm> [...]')
    process.exit(1)
  }
  const { files, unmapped } = await crawlThree(names.map((n) => THREE_JSON.addons + n.replace(/^three\/addons\//, '')))
  // every file the add-ons pull in (the build itself is always pinned), so
  // the hashes reach the page even where the catalogue doesn't know the importer
  const list = Object.entries(files).filter(([p]) => !p.startsWith('build/'))
  const fresh = list.filter(([p]) => !THREE_JSON.files[p])
  if (!fresh.length) console.log('// nothing to add: scripts/kit/three.json pins all of it; just list the add-ons in addons')
  else {
    console.log(`// three.js ${THREE.version}: add these to the effect's libs, and the add-on names to addons`)
    for (const [p, f] of list) console.log(`{ url: '${THREE.base + p}', integrity: '${f.integrity}' },`)
  }
  for (const u of unmapped) console.log(`// not mapped by the kit's import map, so it won't load: ${u}`)
}
