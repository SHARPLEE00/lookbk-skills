#!/usr/bin/env node
// Builds the waitlist page from waitlist.json:
//
//   node scripts/build.mjs waitlist.json out     # out/index.html
//
// It checks waitlist.json first and lists every problem at once. The page
// is one HTML file; its form posts straight to the service you choose and
// works without JavaScript, and with it shows the result in place.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrast, isDark, isHex, mix, readable } from './color.mjs'
import { h, toHtml } from './markup.mjs'

const chars = (s) => [...String(s ?? '')].length
const isUrl = (s) => /^https?:\/\//.test(s)
const plain = (s) => String(s ?? '').replace(/[*]/g, '')

export const DEFAULT_THEME = {
  bg: '#0b0b10',
  fg: '#f4f5f8',
  glow: ['#ffb37a', '#ff7ab6', '#7a9bff'],
  serif: 'Fraunces',
  sans: 'Manrope',
  mono: 'JetBrains Mono',
}

/**
 * Where and how each service takes the form. `honeypot` is the field bots
 * fill in and people never see; the service (or your endpoint) drops
 * those sign-ups.
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

/** Every problem in waitlist.json, as readable lines. */
export function validate(doc) {
  const problems = []
  const need = (ok, msg) => ok || problems.push(msg)
  const text = (obj, key, max, at, required = false) => {
    const v = obj?.[key]
    if (v === undefined || v === null || v === '') {
      if (required) problems.push(`${at}.${key} is required`)
      return
    }
    if (typeof v !== 'string') problems.push(`${at}.${key} must be text`)
    else if (chars(plain(v)) > max)
      problems.push(
        `${at}.${key} is ${chars(plain(v))} characters; the limit is ${max}`,
      )
  }
  if (!doc || typeof doc !== 'object')
    return ['waitlist.json must be an object']
  text(doc.brand, 'name', 24, 'brand', true)
  text(doc.brand, 'note', 36, 'brand')
  text(doc, 'eyebrow', 28, 'page')
  text(doc, 'title', 60, 'page', true)
  need(
    (String(doc.title ?? '').match(/\*/g) ?? []).length % 2 === 0,
    'title has an unclosed *accent*',
  )
  need(
    String(doc.title ?? '').split('\n').length <= 3,
    'title is at most 3 lines',
  )
  text(doc, 'text', 180, 'page', true)
  text(doc, 'proof', 48, 'page')
  text(doc, 'fine', 90, 'page')

  const f = doc.form ?? {}
  if (!doc.form) problems.push('form is required')
  const p = PROVIDERS[f.provider]
  need(p, `form.provider is one of ${Object.keys(PROVIDERS).join(', ')}`)
  if (p?.needs) text(f, p.needs, 200, 'form', true)
  if (f.provider === 'formspree' && f.id)
    need(
      /^[a-z0-9]{6,12}$/i.test(f.id),
      'form.id is the code at the end of your Formspree form URL, e.g. "xayzbqwe"',
    )
  if (f.provider === 'buttondown' && f.username)
    need(
      /^[\w-]+$/.test(f.username),
      'form.username is your Buttondown username',
    )
  if (f.url)
    need(
      isUrl(f.url) || f.url.startsWith('/'),
      'form.url is an https:// URL or a path on this site',
    )
  if (f.field !== undefined)
    need(
      /^[\w[\]-]+$/.test(f.field),
      'form.field is the name your service expects, e.g. "email" or "EMAIL"',
    )
  text(f, 'placeholder', 32, 'form')
  text(f, 'button', 24, 'form')
  text(f, 'success', 120, 'form')
  text(f, 'error', 120, 'form')
  if (f.ajax !== undefined)
    need(typeof f.ajax === 'boolean', 'form.ajax is true or false')

  if (doc.launch !== undefined)
    need(
      typeof doc.launch === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?(Z|[+-]\d\d:\d\d)$/.test(
          doc.launch,
        ) &&
        !Number.isNaN(Date.parse(doc.launch)),
      'launch is a date and time with its zone, e.g. "2026-12-01T17:00:00Z"',
    )
  for (const [i, l] of (doc.links ?? []).entries()) {
    text(l, 'label', 20, `links[${i}]`, true)
    text(l, 'href', 400, `links[${i}]`, true)
  }

  const theme = { ...DEFAULT_THEME, ...doc.theme }
  for (const k of ['bg', 'fg'])
    need(isHex(theme[k]), `theme.${k} must be a hex colour like #0b0b10`)
  need(
    Array.isArray(theme.glow) &&
      theme.glow.length === 3 &&
      theme.glow.every(isHex),
    'theme.glow is three hex colours',
  )
  if (theme.accent !== undefined)
    need(isHex(theme.accent), 'theme.accent must be a hex colour')
  if (theme.opacity !== undefined)
    need(
      typeof theme.opacity === 'number' &&
        theme.opacity > 0 &&
        theme.opacity <= 0.8,
      'theme.opacity is a number from 0.05 to 0.8',
    )
  if (isHex(theme.bg) && isHex(theme.fg))
    need(
      contrast(theme.bg, theme.fg) >= 7,
      `theme.fg on theme.bg is ${contrast(theme.bg, theme.fg).toFixed(1)}:1; it needs 7:1`,
    )

  text(doc.meta, 'title', 70, 'meta', true)
  text(doc.meta, 'description', 170, 'meta', true)
  if (doc.meta?.url)
    need(isUrl(doc.meta.url), "meta.url is the page's full https:// address")
  if (doc.meta?.image)
    need(isUrl(doc.meta.image), 'meta.image is a full https:// address')
  return problems
}

/**
 * The page colours. The glow can sit behind any text, so text colours are
 * checked against the ground at the glow's brightest (each glow colour at
 * full strength), and the glow is dimmed until the main text reads at 7:1.
 */
export function palette(theme) {
  const { bg, fg } = theme
  const dark = isDark(bg)
  // The orb breathes up to 1.2× its opacity; grain adds a little more.
  const peak = (o) => Math.min(1, o * 1.2 * 1.1)
  let opacity = theme.opacity ?? (dark ? 0.5 : 0.55)
  const grounds = (o) => [bg, ...theme.glow.map((c) => mix(bg, c, peak(o)))]
  while (opacity > 0.05 && grounds(opacity).some((g) => contrast(fg, g) < 7))
    opacity = Math.round((opacity - 0.02) * 100) / 100
  const on = grounds(opacity)
  const accent = theme.accent ?? theme.glow[1]
  return {
    dark,
    bg,
    fg,
    opacity,
    dimmed: theme.opacity !== undefined && opacity < theme.opacity,
    glow: theme.glow,
    mute: readable(mix(fg, bg, 0.3), on, 4.6),
    faint: readable(mix(fg, bg, 0.45), on, 4.6),
    em: readable(
      dark ? mix(accent, '#ffffff', 0.55) : mix(accent, '#000000', 0.25),
      on,
      4.5,
    ),
    dot: accent,
    field: dark ? '#ffffff12' : '#ffffffb3',
    fieldLine: dark ? '#ffffff24' : mix(bg, fg, 0.16),
    ring: dark ? '#ffffff12' : `${fg}14`,
    face: bg,
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
  background: ${p.bg};
}
.wl {
  --bg: ${p.bg};
  --fg: ${p.fg};
  --mute: ${p.mute};
  --faint: ${p.faint};
  --em: ${p.em};
  --dot: ${p.dot};
  --field: ${p.field};
  --field-line: ${p.fieldLine};
  --ring: ${p.ring};
  --g1: ${p.glow[0]};
  --g2: ${p.glow[1]};
  --g3: ${p.glow[2]};
  --o: ${p.opacity};
  --serif: ${font(theme.serif, 'Georgia, "Times New Roman", serif')};
  --sans: ${font(theme.sans, 'system-ui, -apple-system, "Segoe UI", sans-serif')};
  --mono: ${font(theme.mono, 'ui-monospace, SFMono-Regular, Menlo, monospace')};
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.wl :where(h1, p) {
  margin: 0;
}
.wl a {
  color: inherit;
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

/* The glow */
.sky {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.orb {
  position: absolute;
  left: 50%;
  top: 46%;
  width: min(820px, 150vw);
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 35%, var(--g1), transparent 55%),
    radial-gradient(circle at 70% 40%, var(--g2), transparent 55%),
    radial-gradient(circle at 50% 75%, var(--g3), transparent 60%);
  filter: blur(80px);
  opacity: var(--o);
  transform: translate(-50%, -50%);
  animation: breathe 9s ease-in-out infinite alternate;
}
@keyframes breathe {
  to {
    opacity: calc(var(--o) * 1.2);
    transform: translate(-50%, -50%) scale(1.08);
  }
}
.ring {
  position: absolute;
  left: 50%;
  top: 46%;
  aspect-ratio: 1;
  border: 1px solid var(--ring);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.ring:nth-of-type(1) {
  width: 620px;
}
.ring:nth-of-type(2) {
  width: 900px;
}
.ring:nth-of-type(3) {
  width: 1180px;
}
.grain {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* Bar */
.bar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
  padding: 28px 48px;
  color: var(--mute);
  font-size: 14px;
}
.mark {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--fg);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none;
}
.mark i {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, var(--g2) 60%, var(--g3));
}

/* Stage */
.stage {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px 64px;
  text-align: center;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--mute);
  font-size: 13px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.eyebrow i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dot);
  box-shadow: 0 0 12px var(--dot);
}
.wl h1 {
  max-width: 1000px;
  margin: 26px auto 22px;
  font-family: var(--serif);
  font-size: clamp(52px, 9vw, 112px);
  font-weight: 300;
  line-height: 0.95;
  letter-spacing: -0.045em;
  text-wrap: balance;
}
.wl h1 em {
  color: var(--em);
  font-style: italic;
  font-weight: 300;
}
.sub {
  max-width: 520px;
  color: var(--mute);
  font-size: clamp(17px, 1.5vw, 19px);
  line-height: 1.55;
  text-wrap: pretty;
}
.join {
  position: relative;
  display: flex;
  width: min(520px, 100%);
  margin-top: 40px;
  padding: 6px;
  border: 1px solid var(--field-line);
  border-radius: 999px;
  background: var(--field);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
.join:focus-within {
  border-color: var(--mute);
}
.join input[type='email'] {
  flex: 1;
  min-width: 0;
  padding: 0 20px;
  border: 0;
  background: transparent;
  color: var(--fg);
  font: 16px var(--sans);
  outline: none;
}
.join input::placeholder {
  color: var(--faint);
  opacity: 1;
}
.join button {
  flex: none;
  min-height: 48px;
  padding: 0 24px;
  border: 0;
  border-radius: 999px;
  background: var(--fg);
  color: var(--bg);
  font: 600 15px var(--sans);
  cursor: pointer;
  transition: opacity 0.2s;
}
.join button:hover {
  opacity: 0.88;
}
.join button:focus-visible {
  outline: 2px solid var(--fg);
  outline-offset: 3px;
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
  max-width: 520px;
  margin-top: 18px;
  font-size: 15px;
}
.status.done {
  margin-top: 40px;
  padding: 16px 24px;
  border: 1px solid var(--field-line);
  border-radius: 999px;
  background: var(--field);
  color: var(--fg);
  font-size: 17px;
}
.proof {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 22px;
  color: var(--mute);
  font-size: 14px;
  text-align: left;
  text-wrap: balance;
}
.faces {
  display: flex;
}
.faces b {
  width: 26px;
  height: 26px;
  margin-left: -7px;
  border: 2px solid var(--bg);
  border-radius: 50%;
}
.faces b:first-child {
  margin-left: 0;
}
.fine {
  max-width: 440px;
  margin-top: 14px;
  color: var(--mute);
  font-size: 13px;
  text-wrap: balance;
}
.fine a,
.links a {
  text-underline-offset: 3px;
}

/* Countdown */
.count {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 46px;
  padding: 0 24px 44px;
  color: var(--mute);
  font: 500 13px var(--mono);
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
}
.count[hidden] {
  display: none;
}
.count b {
  display: block;
  margin-bottom: 6px;
  color: var(--fg);
  font: 300 40px var(--serif);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.links {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 20px;
  margin: 0;
  padding: 0 24px 28px;
  color: var(--mute);
  font-size: 13px;
  list-style: none;
}
.links a {
  display: inline-block;
  padding: 4px 0;
}

@media (max-width: 640px) {
  .bar {
    padding: 20px;
  }
  .stage {
    padding: 32px 18px 48px;
  }
  .count {
    gap: 22px;
  }
  .count b {
    font-size: 28px;
  }
}
@media (max-width: 440px) {
  .join {
    flex-direction: column;
    gap: 6px;
    border-radius: 24px;
  }
  .join input[type='email'] {
    min-height: 48px;
  }
  .join button {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .orb {
    animation: none;
  }
}
`
}

// Runs in the page: posts the form in place when it can, and runs the
// countdown. Without JavaScript the form still posts and the countdown
// stays hidden.
const SCRIPT = `(() => {
  const form = document.querySelector('.join')
  const status = document.querySelector('.status')
  if (form && form.dataset.ajax !== undefined) {
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
  const count = document.querySelector('.count')
  if (!count) return
  const end = Date.parse(count.dataset.launch)
  const cells = count.querySelectorAll('b')
  const tick = () => {
    const left = end - Date.now()
    if (left <= 0) {
      count.hidden = true
      return clearInterval(timer)
    }
    const parts = [86400000, 3600000, 60000, 1000].map((unit, i, all) =>
      Math.floor((i ? left % all[i - 1] : left) / unit),
    )
    parts.forEach((n, i) => (cells[i].textContent = String(n).padStart(2, '0')))
    count.hidden = false
  }
  const timer = setInterval(tick, 1000)
  tick()
})()`

/** title with *accent* words in italics and line breaks kept. */
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

const launchText = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })

/** The page as an element tree. */
export function tree(doc, pal) {
  const f = doc.form
  const provider = PROVIDERS[f.provider]
  const ajax = f.ajax ?? provider.ajax
  const field = f.field || 'email'
  const success =
    f.success || "You're on the list. We'll email you when it's your turn."
  const error =
    f.error || "That didn't go through. Check the address and try again."
  const netlify = f.provider === 'netlify'
  const faces = [
    pal.glow[0],
    pal.glow[1],
    pal.glow[2],
    mix(pal.glow[0], pal.fg, 0.6),
  ]

  const form = h(
    'form',
    {
      class: 'join',
      action: provider.action(f),
      method: 'post',
      name: netlify ? f.name || 'waitlist' : null,
      'data-netlify': netlify ? 'true' : null,
      'netlify-honeypot': netlify ? 'bot-field' : null,
      'data-ajax': ajax ? true : null,
      'data-success': success,
      'data-error': error,
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
      name: field,
      required: true,
      autocomplete: 'email',
      inputmode: 'email',
      spellcheck: 'false',
      placeholder: f.placeholder || 'Your email address',
    }),
    h('button', { type: 'submit' }, f.button || 'Join the waitlist'),
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
  )

  return h(
    'div',
    { class: 'wl' },
    h(
      'div',
      { class: 'sky', 'aria-hidden': 'true', 'data-clip-ok': true },
      h('div', { class: 'orb' }),
      h('i', { class: 'ring' }),
      h('i', { class: 'ring' }),
      h('i', { class: 'ring' }),
      h('div', { class: 'grain' }),
    ),
    h(
      'header',
      { class: 'bar' },
      h(
        'a',
        { class: 'mark', href: doc.brand.href || '/' },
        h('i', { 'aria-hidden': 'true' }),
        doc.brand.name,
      ),
      doc.brand.note && h('p', null, doc.brand.note),
    ),
    h(
      'main',
      { class: 'stage' },
      doc.eyebrow &&
        h(
          'p',
          { class: 'eyebrow' },
          h('i', { 'aria-hidden': 'true' }),
          doc.eyebrow,
        ),
      h('h1', null, title(doc.title)),
      h('p', { class: 'sub' }, doc.text),
      form,
      h('p', { class: 'status', role: 'status', 'aria-live': 'polite' }),
      doc.proof &&
        h(
          'p',
          { class: 'proof' },
          h(
            'span',
            { class: 'faces', 'aria-hidden': 'true' },
            faces.map((c) => h('b', { style: { background: c } })),
          ),
          doc.proof,
        ),
      doc.fine && h('p', { class: 'fine' }, doc.fine),
      doc.launch &&
        h('p', { class: 'sr' }, `Launches ${launchText(doc.launch)}.`),
    ),
    doc.launch &&
      h(
        'div',
        {
          class: 'count',
          hidden: true,
          'aria-hidden': 'true',
          'data-launch': doc.launch,
        },
        ['days', 'hours', 'minutes', 'seconds'].map((u) =>
          h('span', null, h('b', null, '00'), u),
        ),
      ),
    doc.links?.length &&
      h(
        'ul',
        { class: 'links' },
        doc.links.map((l) => h('li', null, h('a', { href: l.href }, l.label))),
      ),
  )
}

const escAttr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// One stylesheet per family, so a family without a weight doesn't stop the
// others loading. The serif is asked for in light (300) and, as a
// fallback for families without it, in its regular weight.
function fontLinks(theme) {
  const css = (name, axes) =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}${axes}&display=swap`
  return [
    css(theme.serif, ':ital,wght@0,300;1,300'),
    css(theme.serif, ':ital@0;1'),
    css(theme.sans, ':wght@400;500;600'),
    css(theme.mono, ':wght@500'),
  ]
}

export function page(doc) {
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
    `<meta name="theme-color" content="${pal.bg}">`,
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
  const html = `<!doctype html>
<html lang="${escAttr(m.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head.filter(Boolean).join('\n')}
<style>
${css(pal, theme)}</style>
</head>
<body>
${toHtml(tree(doc, pal))}
<script>
${SCRIPT}
</script>
</body>
</html>
`
  return { html, pal }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const input = resolve(files[0] || 'waitlist.json')
  const out = resolve(files[1] || 'out')
  let doc
  try {
    doc = JSON.parse(readFileSync(input, 'utf8'))
  } catch (e) {
    console.error(`build: cannot read ${input}: ${e.message}`)
    process.exit(1)
  }
  const problems = validate(doc)
  if (problems.length) {
    console.error(
      `build: fix waitlist.json first:\n  - ${problems.join('\n  - ')}`,
    )
    process.exit(1)
  }
  const { html, pal } = page(doc)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'index.html'), html)
  const f = doc.form
  const provider = PROVIDERS[f.provider]
  console.log(`Wrote ${relative(process.cwd(), join(out, 'index.html'))}`)
  console.log(
    `The form posts "${f.field || 'email'}" to ${provider.action(f)} (${f.provider}, ${(f.ajax ?? provider.ajax) ? 'in place with JavaScript, a normal post without' : 'a normal post'}).`,
  )
  if (pal.dimmed)
    console.log(
      `The glow was dimmed to opacity ${pal.opacity} so the text stays readable on it.`,
    )
  console.log(
    `Next: node ${relative(process.cwd(), join(dirname(fileURLToPath(import.meta.url)), 'check.mjs'))} ${relative(process.cwd(), join(out, 'index.html'))}`,
  )
}
