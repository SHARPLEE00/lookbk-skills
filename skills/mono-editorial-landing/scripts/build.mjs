#!/usr/bin/env node
// Builds the landing page from page.json:
//
//   node scripts/build.mjs page.json out     # out/index.html, out/assets/
//
// It checks page.json first and lists every problem at once. The page is
// one HTML file plus the pictures it shows. Its waitlist form posts straight
// to the service you choose and works without JavaScript; with it, the
// result shows in place.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrast, isDark, isHex, mix, readable } from './color.mjs'
import { inline, plain } from './inline.mjs'
import { h, toHtml } from './markup.mjs'

const chars = (s) => [...String(s ?? '')].length
const isUrl = (s) => /^https?:\/\//.test(s)
const stars = (s) => String(s ?? '').replace(/\*/g, '')

export const DEFAULT_THEME = {
  paper: '#f7f7f4',
  ink: '#141414',
  display: 'Instrument Serif',
  serif: 'Newsreader',
  sans: 'Inter',
  mono: 'IBM Plex Mono',
}

/**
 * Where and how each service takes the form. `honeypot` is the field bots
 * fill in and people never see; the service (or your endpoint) drops those
 * sign-ups.
 */
export const PROVIDERS = {
  formspree: {
    needs: 'id',
    action: (f) => `https://formspree.io/f/${f.id}`,
    honeypot: '_gotcha',
    ajax: true,
  },
  netlify: {
    action: (f) => f.url || '/',
    honeypot: 'bot-field',
    ajax: true,
  },
  buttondown: {
    needs: 'username',
    action: (f) =>
      `https://buttondown.com/api/emails/embed-subscribe/${f.username}`,
    honeypot: null,
    // Buttondown shows its own confirmation page and doesn't answer
    // cross-site requests, so the form posts the classic way.
    ajax: false,
  },
  endpoint: {
    needs: 'url',
    action: (f) => f.url,
    honeypot: 'website',
    ajax: true,
  },
}

export const FIGURES = ['image', 'window', 'stats', 'code']
const IMAGE_TYPES = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg']
// Ids the page gives its own sections, so nav links can point at them.
const RESERVED = ['join', 'highlights', 'faq', 'closing']

/** Every problem in page.json, as readable lines. */
export function validate(doc, dir = '.') {
  const problems = []
  const need = (ok, msg) => ok || problems.push(msg)
  const text = (obj, key, max, at, required = false, count = plain) => {
    const v = obj?.[key]
    if (v === undefined || v === null || v === '') {
      if (required) problems.push(`${at}.${key} is required`)
      return
    }
    if (typeof v !== 'string') problems.push(`${at}.${key} must be text`)
    else if (chars(count(v)) > max)
      problems.push(
        `${at}.${key} is ${chars(count(v))} characters; the limit is ${max}`,
      )
  }
  const link = (l, at, max, required) => {
    if (!l)
      return required && problems.push(`${at} is required: { "label", "href" }`)
    text(l, 'label', max, at, true)
    text(l, 'href', 400, at, true)
  }
  const list = (v, at, min, max) => {
    if (v === undefined) {
      if (min > 0) problems.push(`${at} is required`)
      return []
    }
    if (!Array.isArray(v)) {
      problems.push(`${at} must be a list`)
      return []
    }
    need(
      v.length >= min && v.length <= max,
      `${at} has ${v.length} items; it takes ${min === max ? min : `${min} to ${max}`}`,
    )
    return v
  }
  const strings = (v, at, min, max, limit) =>
    list(v, at, min, max).forEach((s, i) => {
      if (typeof s !== 'string') problems.push(`${at}[${i}] must be text`)
      else if (chars(plain(s)) > limit)
        problems.push(
          `${at}[${i}] is ${chars(plain(s))} characters; the limit is ${limit}`,
        )
    })
  if (!doc || typeof doc !== 'object') return ['page.json must be an object']

  text(doc.brand, 'name', 24, 'brand', true)
  list(doc.nav, 'nav', 0, 5).forEach((l, i) => link(l, `nav[${i}]`, 16, true))
  if (doc.action !== false && doc.action !== undefined)
    link(doc.action, 'action', 22, true)
  strings(doc.issue, 'issue', 0, 3, 40)

  // Hero
  const hero = doc.hero ?? {}
  if (!doc.hero) problems.push('hero is required')
  text(hero, 'title', 64, 'hero', true, stars)
  need(
    (String(hero.title ?? '').match(/\*/g) ?? []).length % 2 === 0,
    'hero.title has an unclosed *italic*',
  )
  need(
    String(hero.title ?? '').split('\n').length <= 3,
    'hero.title is at most 3 lines',
  )
  text(hero, 'lede', 300, 'hero', true)
  text(hero, 'note', 100, 'hero')
  if (hero.dropcap !== undefined)
    need(typeof hero.dropcap === 'boolean', 'hero.dropcap is true or false')
  need(
    Boolean(hero.form) !== Boolean(hero.actions),
    'hero has either a waitlist "form" or "actions" (buttons), not both',
  )
  const f = hero.form
  if (f) {
    const p = PROVIDERS[f.provider]
    need(p, `hero.form.provider is one of ${Object.keys(PROVIDERS).join(', ')}`)
    if (p?.needs) text(f, p.needs, 200, 'hero.form', true)
    if (f.provider === 'formspree' && f.id)
      need(
        /^[a-z0-9]{6,12}$/i.test(f.id),
        'hero.form.id is the code at the end of your Formspree form URL, e.g. "xayzbqwe"',
      )
    if (f.provider === 'buttondown' && f.username)
      need(
        /^[\w-]+$/.test(f.username),
        'hero.form.username is your Buttondown username',
      )
    if (f.url)
      need(
        isUrl(f.url) || f.url.startsWith('/'),
        'hero.form.url is an https:// URL or a path on this site',
      )
    if (f.field !== undefined)
      need(
        /^[\w[\]-]+$/.test(f.field),
        'hero.form.field is the name your service expects, e.g. "email" or "EMAIL"',
      )
    text(f, 'placeholder', 32, 'hero.form')
    text(f, 'button', 22, 'hero.form')
    text(f, 'success', 120, 'hero.form')
    text(f, 'error', 120, 'hero.form')
    if (f.ajax !== undefined)
      need(typeof f.ajax === 'boolean', 'hero.form.ajax is true or false')
  }
  if (hero.actions) {
    link(hero.actions.primary, 'hero.actions.primary', 26, true)
    link(hero.actions.secondary, 'hero.actions.secondary', 26, false)
  }

  // Columns
  list(doc.columns, 'columns', 0, 4).forEach((c, i) => {
    text(c, 'kicker', 24, `columns[${i}]`)
    text(c, 'title', 44, `columns[${i}]`, true)
    text(c, 'text', 220, `columns[${i}]`, true)
  })
  need(
    !Array.isArray(doc.columns) || doc.columns.length !== 1,
    'columns takes 2 to 4 items; put a single point in a feature instead',
  )

  // Features
  const ids = new Set(
    [
      hero.form && 'join',
      doc.columns?.length && 'highlights',
      doc.faq && 'faq',
      doc.closing && 'closing',
    ].filter(Boolean),
  )
  list(doc.features, 'features', 0, 4).forEach((ft, i) => {
    const at = `features[${i}]`
    text(ft, 'kicker', 28, at)
    text(ft, 'title', 72, at, true, stars)
    text(ft, 'text', 420, at, true)
    strings(ft.points, `${at}.points`, 0, 4, 90)
    if (ft.id !== undefined) {
      need(
        /^[a-z][a-z0-9-]*$/.test(ft.id),
        `${at}.id is lower-case letters, digits and dashes, e.g. "how-it-works"`,
      )
      need(
        !RESERVED.includes(ft.id) && !ids.has(ft.id),
        `${at}.id "${ft.id}" is already used on the page`,
      )
      ids.add(ft.id)
    }
    if (ft.figure) figure(ft.figure, `${at}.figure`)
  })

  function figure(fg, at) {
    need(
      FIGURES.includes(fg.type),
      `${at}.type is one of ${FIGURES.join(', ')}`,
    )
    text(fg, 'caption', 90, at)
    if (fg.type === 'image') {
      text(fg, 'src', 400, at, true)
      text(fg, 'alt', 160, at, true)
      if (fg.src && !isUrl(fg.src)) {
        need(
          existsSync(resolve(dir, fg.src)),
          `${at}.src: no file at ${fg.src} (paths are relative to page.json)`,
        )
        need(
          IMAGE_TYPES.includes(extname(fg.src).toLowerCase()),
          `${at}.src is a picture: ${IMAGE_TYPES.join(', ')}`,
        )
      }
    }
    if (fg.type === 'window') {
      text(fg, 'title', 40, at, true)
      text(fg, 'subtitle', 60, at)
      strings(fg.sidebar, `${at}.sidebar`, 0, 6, 20)
      if (fg.active !== undefined)
        need(
          Number.isInteger(fg.active) &&
            fg.active >= -1 &&
            fg.active < (fg.sidebar?.length ?? 0),
          `${at}.active is the number of the highlighted sidebar item, from 0 (or -1 for none)`,
        )
      list(fg.rows, `${at}.rows`, 1, 6).forEach((r, i) => {
        text(r, 'meta', 8, `${at}.rows[${i}]`)
        text(r, 'label', 48, `${at}.rows[${i}]`, true)
        text(r, 'tag', 14, `${at}.rows[${i}]`)
        if (r.fill !== undefined)
          need(
            typeof r.fill === 'boolean',
            `${at}.rows[${i}].fill is true or false`,
          )
      })
    }
    if (fg.type === 'stats')
      list(fg.items, `${at}.items`, 2, 4).forEach((s, i) => {
        text(s, 'value', 10, `${at}.items[${i}]`, true)
        text(s, 'label', 60, `${at}.items[${i}]`, true)
      })
    if (fg.type === 'code') {
      text(fg, 'title', 24, at)
      if (typeof fg.code !== 'string' || !fg.code.trim())
        problems.push(`${at}.code is required: the lines, joined with \\n`)
      else {
        const lines = fg.code.replace(/\n+$/, '').split('\n')
        need(
          lines.length <= 14,
          `${at}.code has ${lines.length} lines; the limit is 14`,
        )
        lines.forEach((l, i) =>
          need(
            chars(l) <= 64,
            `${at}.code line ${i + 1} is ${chars(l)} characters; the limit is 64 (break it with a \\ or shorten it)`,
          ),
        )
      }
    }
  }

  // Quote, questions, closing, footer
  if (doc.quote) {
    text(doc.quote, 'text', 220, 'quote', true)
    text(doc.quote, 'cite', 60, 'quote', true)
  }
  if (doc.faq) {
    text(doc.faq, 'title', 40, 'faq')
    list(doc.faq.items, 'faq.items', 1, 8).forEach((q, i) => {
      text(q, 'q', 100, `faq.items[${i}]`, true)
      text(q, 'a', 500, `faq.items[${i}]`, true)
    })
  }
  if (doc.closing) {
    text(doc.closing, 'kicker', 28, 'closing')
    text(doc.closing, 'title', 64, 'closing', true, stars)
    text(doc.closing, 'text', 220, 'closing')
    link(doc.closing.action, 'closing.action', 26, false)
  }
  strings(doc.footer?.items, 'footer.items', 0, 3, 48)
  list(doc.footer?.links, 'footer.links', 0, 6).forEach((l, i) =>
    link(l, `footer.links[${i}]`, 20, true),
  )

  // Links to places on the page must have somewhere to land.
  const anchors = [
    ...(doc.nav ?? []).map((l, i) => [l?.href, `nav[${i}]`]),
    [doc.action?.href, 'action'],
    [hero.actions?.primary?.href, 'hero.actions.primary'],
    [hero.actions?.secondary?.href, 'hero.actions.secondary'],
    [doc.closing?.action?.href, 'closing.action'],
  ]
  for (const [href, at] of anchors)
    if (typeof href === 'string' && /^#./.test(href))
      need(
        ids.has(href.slice(1)),
        `${at}.href "${href}" points at nothing on the page; ids here: ${[...ids].map((i) => `#${i}`).join(', ') || 'none'}`,
      )

  const theme = { ...DEFAULT_THEME, ...doc.theme }
  for (const k of ['paper', 'ink'])
    need(isHex(theme[k]), `theme.${k} must be a hex colour like #f7f7f4`)
  if (theme.accent !== undefined)
    need(isHex(theme.accent), 'theme.accent must be a hex colour')
  if (isHex(theme.paper) && isHex(theme.ink))
    need(
      contrast(theme.paper, theme.ink) >= 7,
      `theme.ink on theme.paper is ${contrast(theme.paper, theme.ink).toFixed(1)}:1; it needs 7:1`,
    )

  text(doc.meta, 'title', 70, 'meta', true)
  text(doc.meta, 'description', 170, 'meta', true)
  if (doc.meta?.url)
    need(isUrl(doc.meta.url), "meta.url is the page's full https:// address")
  if (doc.meta?.image)
    need(isUrl(doc.meta.image), 'meta.image is a full https:// address')
  return problems
}

/** The page colours, every text colour derived from paper and ink. */
export function palette(theme) {
  const { paper, ink } = theme
  const dark = isDark(paper)
  // The sheet is the face of the framed pictures: a little whiter than the
  // paper, or on dark paper a little lighter.
  const sheet = dark ? mix(paper, ink, 0.07) : mix(paper, '#ffffff', 0.75)
  const grounds = [paper, sheet]
  return {
    dark,
    paper,
    ink,
    sheet,
    body: readable(mix(ink, paper, 0.14), grounds, 7),
    mute: readable(mix(ink, paper, 0.42), grounds, 4.6),
    rule: mix(paper, ink, dark ? 0.24 : 0.17),
    em: theme.accent ? readable(theme.accent, grounds, 4.5) : ink,
  }
}

function css(p, theme) {
  const font = (name, fallback) => `"${name.replace(/"/g, '')}", ${fallback}`
  return `:root {
  color-scheme: ${p.dark ? 'dark' : 'light'};
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: ${p.paper};
}
.me {
  --paper: ${p.paper};
  --ink: ${p.ink};
  --body: ${p.body};
  --mute: ${p.mute};
  --rule: ${p.rule};
  --sheet: ${p.sheet};
  --em: ${p.em};
  --display: ${font(theme.display, 'Georgia, "Times New Roman", serif')};
  --serif: ${font(theme.serif, 'Georgia, "Times New Roman", serif')};
  --sans: ${font(theme.sans, 'system-ui, -apple-system, "Segoe UI", sans-serif')};
  --mono: ${font(theme.mono, 'ui-monospace, SFMono-Regular, Menlo, monospace')};
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.me :where(h1, h2, p, ul, figure, blockquote, pre) {
  margin: 0;
}
.me a {
  color: inherit;
}
.me ::selection {
  background: var(--ink);
  color: var(--paper);
}
.me :focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
}
.wrap {
  margin-inline: max(40px, calc((100% - 1160px) / 2));
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.label,
.issue,
.colophon {
  color: var(--mute);
  font: 500 12px/1.5 var(--mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.me :where(p, li) code {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  padding: 0.05em 0.3em;
  border: 1px solid var(--rule);
  background: var(--sheet);
  font: 0.86em var(--mono);
}
.me :where(p, li) a {
  text-underline-offset: 3px;
}

/* Masthead */
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 32px;
  padding: 24px 0;
  border-bottom: 1px solid var(--ink);
}
.brand {
  font: 400 30px/1 var(--display);
  letter-spacing: -0.01em;
  text-decoration: none;
}
.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 30px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.nav a {
  display: inline-block;
  padding: 6px 0;
  text-decoration: none;
}
.nav a:hover {
  text-decoration: underline;
  text-underline-offset: 5px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 46px;
  padding: 0 20px;
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  font: 500 14px/1.2 var(--sans);
  text-decoration: none;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.btn:hover {
  background: var(--paper);
  color: var(--ink);
}
.btn.ghost {
  background: transparent;
  color: var(--ink);
}
.btn.ghost:hover {
  background: var(--ink);
  color: var(--paper);
}
.me a.btn {
  color: var(--paper);
}
.me a.btn:hover,
.me a.btn.ghost {
  color: var(--ink);
}
.me a.btn.ghost:hover {
  color: var(--paper);
}
.issue {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 24px;
  margin: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--rule);
  list-style: none;
}

/* Hero */
.hero {
  display: grid;
  grid-template-columns: 1.35fr 0.65fr;
  gap: 56px;
  align-items: end;
  padding: 72px 0 64px;
  border-bottom: 1px solid var(--ink);
}
.me h1 {
  font: 400 clamp(60px, 9.6vw, 138px) / 0.9 var(--display);
  letter-spacing: -0.035em;
  text-wrap: balance;
  overflow-wrap: break-word;
}
.me :where(h1, h2) em {
  color: var(--em);
  font-style: italic;
}
.lede {
  color: var(--body);
  font: 400 23px/1.45 var(--serif);
  text-wrap: pretty;
}
.lede.cap::first-letter {
  float: left;
  padding: 8px 10px 0 0;
  color: var(--ink);
  font: 400 78px/0.8 var(--display);
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}
.join {
  position: relative;
  display: flex;
  margin-top: 30px;
  border: 1px solid var(--ink);
}
.join:focus-within {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
}
.join input[type='email'] {
  flex: 1;
  min-width: 0;
  min-height: 52px;
  padding: 0 18px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: 16px var(--sans);
  outline: none;
}
.join input::placeholder {
  color: var(--mute);
  opacity: 1;
}
.join button {
  flex: none;
  min-height: 52px;
  border: 0;
  border-left: 1px solid var(--ink);
  white-space: nowrap;
}
.join button:focus-visible {
  outline-offset: -5px;
  outline-color: var(--paper);
}
.join[data-state='sending'] button {
  opacity: 0.6;
  cursor: progress;
}
.join[data-state='done'] {
  display: none;
}
.hp {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.status:empty {
  display: none;
}
.status {
  margin-top: 14px;
  font-size: 15px;
}
.status.done {
  margin-top: 30px;
  padding: 16px 18px;
  border: 1px solid var(--ink);
  background: var(--sheet);
  font: 400 19px/1.4 var(--serif);
}
.note {
  margin-top: 14px;
  color: var(--mute);
  font: 500 12px/1.6 var(--mono);
}

/* Columns */
.cols {
  display: grid;
  grid-template-columns: repeat(var(--n), minmax(0, 1fr));
  border-bottom: 1px solid var(--ink);
}
.col {
  padding: 34px 34px 40px 0;
}
.col + .col {
  padding-left: 34px;
  border-left: 1px solid var(--rule);
}
.col h2 {
  margin: 18px 0 12px;
  font: 400 38px/1 var(--display);
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.col p:not(.label) {
  color: var(--body);
  font: 18px/1.5 var(--serif);
}

/* Features */
.feature {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 56px;
  align-items: center;
  padding: 64px 0;
  border-bottom: 1px solid var(--ink);
  scroll-margin-top: 24px;
}
.feature.flip {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
}
.feature.flip .copy {
  order: 2;
}
.feature.solo,
.faq {
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  align-items: start;
}
.solo .copy {
  display: contents;
}
.feature h2,
.faq h2 {
  margin-top: 14px;
  font: 400 clamp(44px, 5vw, 72px) / 0.95 var(--display);
  letter-spacing: -0.025em;
  text-wrap: balance;
}
.feature .text {
  max-width: 460px;
  margin-top: 22px;
}
.solo .text {
  max-width: 640px;
  margin-top: 0;
}
.feature .text p {
  color: var(--body);
  font: 19px/1.5 var(--serif);
  text-wrap: pretty;
}
.feature .text p + p {
  margin-top: 14px;
}
.points {
  margin: 22px 0 0;
  padding: 0;
  border-top: 1px solid var(--rule);
  list-style: none;
}
.points li {
  position: relative;
  padding: 10px 0 10px 30px;
  border-bottom: 1px solid var(--rule);
  font-size: 15px;
}
.points li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: var(--mute);
  font-family: var(--mono);
}

/* Figures */
.fig {
  min-width: 0;
}
.fig figcaption {
  margin-top: 26px;
  color: var(--mute);
  font: 500 12px/1.5 var(--mono);
}
.fig figcaption b {
  margin-right: 8px;
  color: var(--ink);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.frame {
  border: 1px solid var(--ink);
  background: var(--sheet);
  box-shadow: 14px 14px 0 var(--ink);
}
.frame img {
  display: block;
  width: 100%;
  height: auto;
}
.wbar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ink);
}
.wbar i {
  width: 10px;
  height: 10px;
  border: 1px solid var(--ink);
  border-radius: 50%;
}
.wbar span {
  margin-left: 8px;
  color: var(--mute);
  font: 500 12px/1 var(--mono);
}
.wbody {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  min-height: 300px;
}
.wbody.plain {
  grid-template-columns: minmax(0, 1fr);
}
.side {
  margin: 0;
  padding: 16px;
  border-right: 1px solid var(--rule);
  font-size: 13px;
  list-style: none;
}
.side li {
  padding: 8px 10px;
  color: var(--mute);
}
.side li.on {
  background: var(--ink);
  color: var(--paper);
}
.day {
  min-width: 0;
  padding: 22px 26px;
}
.wtitle {
  font: 400 30px/1.1 var(--display);
}
.wsub {
  margin: 6px 0 16px;
}
.slot {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--rule);
  font-size: 14px;
}
.slot.bare {
  grid-template-columns: 56px minmax(0, 1fr);
}
.slot .t {
  color: var(--mute);
  font: 500 12px var(--mono);
}
.slot b {
  font-weight: 500;
}
.tag {
  padding: 4px 8px;
  border: 1px solid var(--ink);
  font: 500 12px/1.2 var(--mono);
  font-style: normal;
  white-space: nowrap;
}
.tag.fill {
  background: var(--ink);
  color: var(--paper);
}
.stats {
  display: grid;
  grid-template-columns: repeat(var(--n), minmax(0, 1fr));
  border-top: 1px solid var(--ink);
}
.stat {
  padding: 26px 24px 30px 0;
  border-bottom: 1px solid var(--rule);
}
.stat b {
  display: block;
  font: 400 clamp(52px, 5.6vw, 80px) / 0.9 var(--display);
  letter-spacing: -0.03em;
  font-variant-numeric: lining-nums;
}
.stat span {
  display: block;
  max-width: 260px;
  margin-top: 12px;
  color: var(--body);
  font: 17px/1.4 var(--serif);
}
.code pre {
  padding: 22px 24px 24px;
  overflow-x: auto;
  font: 14px/1.7 var(--mono);
  tab-size: 2;
}
.code .c {
  color: var(--mute);
}

/* Quote */
.quote {
  padding: 80px 0;
  border-bottom: 1px solid var(--ink);
  text-align: center;
}
.quote p {
  max-width: 980px;
  margin: 0 auto;
  font: italic 400 clamp(38px, 4.6vw, 64px) / 1.05 var(--display);
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.quote figcaption {
  margin-top: 26px;
}

/* Questions */
.faq {
  display: grid;
  gap: 56px;
  padding: 64px 0;
  border-bottom: 1px solid var(--ink);
  scroll-margin-top: 24px;
}
.qs details {
  border-top: 1px solid var(--rule);
}
.qs details:last-child {
  border-bottom: 1px solid var(--rule);
}
.qs summary {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 0;
  font: 400 26px/1.2 var(--display);
  list-style: none;
  cursor: pointer;
}
.qs summary::-webkit-details-marker {
  display: none;
}
.qs summary::after {
  content: '+';
  flex: none;
  color: var(--mute);
  font: 400 22px/1.2 var(--mono);
}
.qs details[open] summary::after {
  content: '−';
}
.qs .a {
  max-width: 620px;
  padding: 0 0 22px;
}
.qs .a p {
  color: var(--body);
  font: 18px/1.55 var(--serif);
}
.qs .a p + p {
  margin-top: 12px;
}

/* Closing */
.closing {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.65fr);
  gap: 56px;
  align-items: end;
  padding: 80px 0;
  border-bottom: 1px solid var(--ink);
}
.closing h2 {
  margin-top: 14px;
  font: 400 clamp(52px, 7vw, 104px) / 0.92 var(--display);
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.closing .text {
  margin-bottom: 24px;
  color: var(--body);
  font: 19px/1.5 var(--serif);
}

/* Colophon */
.colophon {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 24px;
  padding: 30px 0 44px;
}
.colophon ul {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.colophon a {
  display: inline-block;
  padding: 4px 0;
  text-underline-offset: 3px;
}

@media (max-width: 900px) {
  .hero,
  .feature,
  .feature.flip,
  .feature.solo,
  .faq,
  .closing {
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
  }
  .feature.flip .copy {
    order: 0;
  }
  .solo .text,
  .feature .text {
    max-width: 620px;
  }
}
@media (max-width: 760px) {
  .wrap {
    margin-inline: 20px;
  }
  .nav {
    order: 3;
    width: 100%;
    gap: 2px 20px;
  }
  .issue li:not(:first-child):not(:last-child) {
    display: none;
  }
  .hero {
    padding: 48px 0 44px;
  }
  .lede {
    font-size: 20px;
  }
  .lede.cap::first-letter {
    font-size: 66px;
  }
  .cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .col,
  .col + .col {
    padding: 28px 0 32px;
    border-left: 0;
  }
  .col + .col {
    border-top: 1px solid var(--rule);
  }
  .feature,
  .faq {
    padding: 48px 0;
  }
  .frame {
    box-shadow: 8px 8px 0 var(--ink);
  }
  .wbody {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .side {
    display: none;
  }
  .day {
    padding: 18px;
  }
  .slot {
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: 10px;
  }
  .slot.bare {
    grid-template-columns: 48px minmax(0, 1fr);
  }
  .quote {
    padding: 56px 0;
  }
  .closing {
    padding: 56px 0;
  }
  .qs summary {
    font-size: 23px;
  }
}
@media (max-width: 560px) {
  .stats {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 440px) {
  .join {
    flex-direction: column;
  }
  .join button {
    width: 100%;
    border-top: 1px solid var(--ink);
    border-left: 0;
  }
  .acts .btn {
    flex: 1 1 auto;
  }
  .slot {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .slot .t {
    display: none;
  }
  .slot.bare {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .btn {
    transition: none;
  }
}
`
}

// Runs in the page: posts the waitlist form in place when it can, and puts
// the cursor in the email field when a "Join" link is followed. Without
// JavaScript the form still posts and the links still scroll to it.
const SCRIPT = `(() => {
  const form = document.querySelector('.join')
  if (!form) return
  const status = document.querySelector('.status')
  const email = form.querySelector('input[type=email]')
  if (form.dataset.ajax !== undefined) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (form.dataset.state === 'sending') return
      form.dataset.state = 'sending'
      form.setAttribute('aria-busy', 'true')
      status.className = 'status'
      status.textContent = ''
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new URLSearchParams(new FormData(form)),
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        form.dataset.state = 'done'
        status.className = 'status done'
        status.textContent = form.dataset.success
      } catch (err) {
        form.dataset.state = 'error'
        status.textContent = form.dataset.error
      }
      form.removeAttribute('aria-busy')
    })
  }
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  for (const a of document.querySelectorAll('a[href="#join"]'))
    a.addEventListener('click', (e) => {
      e.preventDefault()
      const done = form.dataset.state === 'done'
      ;(done ? status : email).scrollIntoView({
        block: 'center',
        behavior: smooth ? 'smooth' : 'auto',
      })
      if (!done) email.focus({ preventScroll: true })
      history.replaceState(null, '', '#join')
    })
})()`

/** A title with *italic* words and line breaks kept. */
function title(text) {
  return String(text)
    .split('\n')
    .flatMap((line, i) => [
      i > 0 && h('br', null),
      line
        .split(/(\*[^*]+\*)/)
        .filter(Boolean)
        .map((part) =>
          /^\*.+\*$/.test(part) ? h('em', null, part.slice(1, -1)) : part,
        ),
    ])
}

/** Text with blank lines between paragraphs, as paragraphs. */
const paras = (text, attrs) =>
  String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => h('p', attrs, inline(p)))

const arrow = h('span', { 'aria-hidden': 'true' }, '→')

/** The label and target of the "join" links: the form, or the hero's first button. */
function mainAction(doc) {
  const f = doc.hero.form
  return f
    ? { label: f.button || 'Join the waitlist', href: '#join' }
    : doc.hero.actions.primary
}

function figure(fg, n, asset) {
  const caption =
    fg.caption &&
    h('figcaption', null, h('b', null, `Fig. ${n}`), inline(fg.caption))
  let body
  if (fg.type === 'image')
    body = h(
      'div',
      { class: 'frame' },
      h('img', {
        src: asset(fg.src),
        alt: fg.alt,
        loading: 'lazy',
        decoding: 'async',
      }),
    )
  if (fg.type === 'window') {
    const sidebar = fg.sidebar ?? []
    const active = fg.active ?? 0
    body = h(
      'div',
      { class: 'frame win' },
      h(
        'div',
        { class: 'wbar', 'aria-hidden': 'true' },
        h('i', null),
        h('i', null),
        h('i', null),
      ),
      h(
        'div',
        { class: `wbody${sidebar.length ? '' : ' plain'}` },
        sidebar.length > 0 &&
          h(
            'ul',
            { class: 'side' },
            sidebar.map((s, i) =>
              h('li', { class: i === active ? 'on' : null }, s),
            ),
          ),
        h(
          'div',
          { class: 'day' },
          h('p', { class: 'wtitle' }, fg.title),
          fg.subtitle && h('p', { class: 'wsub label' }, fg.subtitle),
          fg.rows.map((r) =>
            h(
              'div',
              { class: `slot${r.tag ? '' : ' bare'}` },
              h('span', { class: 't' }, r.meta || '—'),
              h('b', null, r.label),
              r.tag && h('i', { class: `tag${r.fill ? ' fill' : ''}` }, r.tag),
            ),
          ),
        ),
      ),
    )
  }
  if (fg.type === 'stats')
    body = h(
      'div',
      {
        class: 'stats',
        style: { '--n': fg.items.length === 4 ? 2 : fg.items.length },
      },
      fg.items.map((s) =>
        h(
          'p',
          { class: 'stat' },
          h('b', null, s.value),
          h('span', null, s.label),
        ),
      ),
    )
  if (fg.type === 'code') {
    const lines = fg.code.replace(/\n+$/, '').split('\n')
    body = h(
      'div',
      { class: 'frame code' },
      h(
        'div',
        { class: 'wbar' },
        h('i', { 'aria-hidden': 'true' }),
        h('i', { 'aria-hidden': 'true' }),
        h('i', { 'aria-hidden': 'true' }),
        fg.title && h('span', null, fg.title),
      ),
      h(
        'pre',
        { tabindex: '0' },
        h(
          'code',
          null,
          lines.map((l, i) => [
            i > 0 && '\n',
            /^\s*(#|\/\/)/.test(l)
              ? h('span', { class: 'c' }, l)
              : /^\$ /.test(l)
                ? [h('span', { class: 'c' }, '$ '), l.slice(2)]
                : l,
          ]),
        ),
      ),
    )
  }
  return h('figure', { class: `fig is-${fg.type}` }, body, caption)
}

/** The page as an element tree. `asset` turns a picture's path into its address on the page. */
export function tree(doc, asset = (s) => s) {
  const hero = doc.hero
  const f = hero.form
  const main = mainAction(doc)
  const action = doc.action === false ? null : (doc.action ?? main)
  const year = new Date().getFullYear()

  let form = null
  if (f) {
    const provider = PROVIDERS[f.provider]
    const ajax = f.ajax ?? provider.ajax
    const netlify = f.provider === 'netlify'
    form = h(
      'div',
      { id: 'join', class: 'signup' },
      h(
        'form',
        {
          class: 'join',
          action: provider.action(f),
          method: 'post',
          name: netlify ? f.name || 'waitlist' : null,
          'data-netlify': netlify ? 'true' : null,
          'netlify-honeypot': netlify ? 'bot-field' : null,
          'data-ajax': ajax ? true : null,
          'data-success':
            f.success ||
            "You're on the list. We'll email you when it's your turn.",
          'data-error':
            f.error ||
            "That didn't go through. Check the address and try again.",
        },
        netlify &&
          h('input', {
            type: 'hidden',
            name: 'form-name',
            value: f.name || 'waitlist',
          }),
        h('label', { class: 'sr', for: 'wl-email' }, 'Email address'),
        h('input', {
          id: 'wl-email',
          type: 'email',
          name: f.field || 'email',
          required: true,
          autocomplete: 'email',
          inputmode: 'email',
          spellcheck: 'false',
          placeholder: f.placeholder || 'you@example.com',
        }),
        h('button', { class: 'btn', type: 'submit' }, main.label),
        provider.honeypot &&
          h(
            'div',
            { class: 'hp', 'aria-hidden': 'true', 'data-clip-ok': true },
            h(
              'label',
              null,
              'Leave this empty',
              h('input', {
                name: provider.honeypot,
                tabindex: '-1',
                autocomplete: 'off',
              }),
            ),
          ),
      ),
      h('p', { class: 'status', role: 'status', 'aria-live': 'polite' }),
      hero.note && h('p', { class: 'note' }, inline(hero.note)),
    )
  }

  const buttons = (primary, secondary) =>
    h(
      'div',
      { class: 'acts' },
      h('a', { class: 'btn', href: primary.href }, primary.label, arrow),
      secondary &&
        h('a', { class: 'btn ghost', href: secondary.href }, secondary.label),
    )

  let figN = 0
  const features = (doc.features ?? []).map((ft, i) => {
    const flip = ft.figure && i % 2 === 1
    return h(
      'section',
      {
        id: ft.id || null,
        class: `feature wrap${ft.figure ? (flip ? ' flip' : '') : ' solo'}`,
      },
      h(
        'div',
        { class: 'copy' },
        h(
          'div',
          { class: 'head' },
          ft.kicker && h('p', { class: 'label' }, ft.kicker),
          h('h2', null, title(ft.title)),
        ),
        h(
          'div',
          { class: 'text' },
          paras(ft.text),
          ft.points?.length > 0 &&
            h(
              'ul',
              { class: 'points' },
              ft.points.map((p) => h('li', null, inline(p))),
            ),
        ),
      ),
      ft.figure && figure(ft.figure, ++figN, asset),
    )
  })

  const closing = doc.closing
  const closeAction = closing && (closing.action ?? main)

  return h(
    'div',
    { class: 'me' },
    h(
      'header',
      { class: 'wrap' },
      h(
        'nav',
        { class: 'bar', 'aria-label': 'Main' },
        h('a', { class: 'brand', href: doc.brand.href || '/' }, doc.brand.name),
        doc.nav?.length > 0 &&
          h(
            'ul',
            { class: 'nav' },
            doc.nav.map((l) =>
              h('li', null, h('a', { href: l.href }, l.label)),
            ),
          ),
        action &&
          h('a', { class: 'btn', href: action.href }, action.label, arrow),
      ),
      doc.issue?.length > 0 &&
        h(
          'ul',
          { class: 'issue' },
          doc.issue.map((s) => h('li', null, inline(s))),
        ),
    ),
    h(
      'main',
      null,
      h(
        'section',
        { class: 'hero wrap' },
        h('h1', null, title(hero.title)),
        h(
          'div',
          { class: 'side-copy' },
          h(
            'p',
            { class: `lede${hero.dropcap === false ? '' : ' cap'}` },
            inline(hero.lede),
          ),
          form ?? buttons(hero.actions.primary, hero.actions.secondary),
          !form && hero.note && h('p', { class: 'note' }, inline(hero.note)),
        ),
      ),
      doc.columns?.length > 0 &&
        h(
          'section',
          {
            id: 'highlights',
            class: 'cols wrap',
            style: { '--n': doc.columns.length },
          },
          doc.columns.map((c, i) =>
            h(
              'div',
              { class: 'col' },
              h(
                'p',
                { class: 'label' },
                String(i + 1).padStart(2, '0'),
                c.kicker && ` / ${c.kicker}`,
              ),
              h('h2', null, inline(c.title)),
              h('p', null, inline(c.text)),
            ),
          ),
        ),
      features,
      doc.quote &&
        h(
          'figure',
          { class: 'quote wrap' },
          h('blockquote', null, h('p', null, `“${doc.quote.text}”`)),
          h('figcaption', { class: 'label' }, `— ${doc.quote.cite}`),
        ),
      doc.faq &&
        h(
          'section',
          { id: 'faq', class: 'faq wrap' },
          h(
            'div',
            null,
            h('p', { class: 'label' }, 'Questions'),
            h('h2', null, doc.faq.title || 'Before you ask'),
          ),
          h(
            'div',
            { class: 'qs' },
            doc.faq.items.map((q) =>
              h(
                'details',
                null,
                h('summary', null, inline(q.q)),
                h('div', { class: 'a' }, paras(q.a)),
              ),
            ),
          ),
        ),
      closing &&
        h(
          'section',
          { id: 'closing', class: 'closing wrap' },
          h(
            'div',
            null,
            closing.kicker && h('p', { class: 'label' }, closing.kicker),
            h('h2', null, title(closing.title)),
          ),
          h(
            'div',
            null,
            closing.text && h('p', { class: 'text' }, inline(closing.text)),
            h(
              'a',
              { class: 'btn', href: closeAction.href },
              closeAction.label,
              arrow,
            ),
          ),
        ),
    ),
    h(
      'footer',
      { class: 'colophon wrap' },
      (doc.footer?.items?.length
        ? doc.footer.items
        : [`${doc.brand.name} © ${year}`]
      ).map((s) => h('p', null, inline(s))),
      doc.footer?.links?.length > 0 &&
        h(
          'ul',
          null,
          doc.footer.links.map((l) =>
            h('li', null, h('a', { href: l.href }, l.label)),
          ),
        ),
    ),
  )
}

const escAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// One stylesheet per family, so a family without one of the weights doesn't
// stop the others loading. Each serif is also asked for in its plain
// regular and italic, for families without the weights.
function fontLinks(theme) {
  const css = (name, axes) =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}${axes}&display=swap`
  return [
    css(theme.display, ':ital@0;1'),
    css(theme.serif, ':ital@0;1'),
    css(theme.serif, ':ital,wght@0,400;0,500;1,400'),
    css(theme.sans, ':wght@400;500;600'),
    css(theme.mono, ':wght@400;500'),
  ]
}

export function page(doc, asset) {
  const theme = { ...DEFAULT_THEME, ...doc.theme }
  const pal = palette(theme)
  const m = doc.meta
  const head = [
    `<title>${escAttr(m.title)}</title>`,
    `<meta name="description" content="${escAttr(m.description)}">`,
    m.url && `<link rel="canonical" href="${escAttr(m.url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escAttr(m.title)}">`,
    `<meta property="og:description" content="${escAttr(m.description)}">`,
    m.url && `<meta property="og:url" content="${escAttr(m.url)}">`,
    m.image && `<meta property="og:image" content="${escAttr(m.image)}">`,
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="theme-color" content="${pal.paper}">`,
    m.icon && `<link rel="icon" href="${escAttr(m.icon)}">`,
    ...(theme.fonts === ''
      ? []
      : [
          '<link rel="preconnect" href="https://fonts.googleapis.com">',
          '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
          ...(theme.fonts ? [theme.fonts] : fontLinks(theme)).map(
            (href) => `<link rel="stylesheet" href="${escAttr(href)}">`,
          ),
        ]),
  ]
  return `<!doctype html>
<html lang="${escAttr(m.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head.filter(Boolean).join('\n')}
<style>
${css(pal, theme)}</style>
</head>
<body>
${toHtml(tree(doc, asset))}
${doc.hero.form ? `<script>\n${SCRIPT}\n</script>\n` : ''}</body>
</html>
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const input = resolve(files[0] || 'page.json')
  const out = resolve(files[1] || 'out')
  const dir = dirname(input)
  let doc
  try {
    doc = JSON.parse(readFileSync(input, 'utf8'))
  } catch (e) {
    console.error(`build: cannot read ${input}: ${e.message}`)
    process.exit(1)
  }
  const problems = validate(doc, dir)
  if (problems.length) {
    console.error(`build: fix page.json first:\n  - ${problems.join('\n  - ')}`)
    process.exit(1)
  }

  // Local pictures are copied to out/assets/.
  const copied = new Map()
  const asset = (src) => {
    if (isUrl(src)) return src
    const from = resolve(dir, src)
    if (!copied.has(from)) {
      let name = basename(from)
      const used = new Set(copied.values())
      for (let n = 2; used.has(name); n++)
        name = `${basename(from, extname(from))}-${n}${extname(from)}`
      copied.set(from, name)
      mkdirSync(join(out, 'assets'), { recursive: true })
      copyFileSync(from, join(out, 'assets', name))
    }
    return `assets/${copied.get(from)}`
  }

  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'index.html'), page(doc, asset))
  const rel = (p) => relative(process.cwd(), p) || p
  console.log(
    `Wrote ${rel(join(out, 'index.html'))}${copied.size ? ` and ${copied.size} picture${copied.size > 1 ? 's' : ''} in ${rel(join(out, 'assets'))}/` : ''}`,
  )
  const f = doc.hero.form
  if (f) {
    const provider = PROVIDERS[f.provider]
    console.log(
      `The form posts "${f.field || 'email'}" to ${provider.action(f)} (${f.provider}, ${(f.ajax ?? provider.ajax) ? 'in place with JavaScript, a normal post without' : 'a normal post'}).`,
    )
  }
  // Things only a person can vouch for.
  const confirm = [
    doc.quote && `the quote from ${doc.quote.cite} is real and theirs to use`,
    doc.features?.some((ft) => ft.figure?.type === 'stats') &&
      'every number in a stats figure is true',
    doc.features?.some((ft) => ft.figure?.type === 'window') &&
      'the window figures show what the product really does',
  ].filter(Boolean)
  if (confirm.length)
    console.log(
      `Before it goes live, confirm with the person that:\n  - ${confirm.join('\n  - ')}`,
    )
  const scripts = dirname(fileURLToPath(import.meta.url))
  console.log(
    `Next: node ${rel(join(scripts, 'check.mjs'))} ${rel(join(out, 'index.html'))}${f ? `\n      node ${rel(join(scripts, 'try-form.mjs'))} ${rel(join(out, 'index.html'))}` : ''}`,
  )
}
