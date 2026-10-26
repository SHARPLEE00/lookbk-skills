#!/usr/bin/env node
// Signs up once through the built page, in headless Chrome, against a
// stand-in for your form service running on this machine, and reports what
// the form sent and what the visitor saw. Then does it again with the
// stand-in failing, to show the error message works too:
//
//   node scripts/try-form.mjs out/index.html
//
// Nothing is sent to Formspree, Netlify, Buttondown or your endpoint. Set
// CHROME_PATH if Chrome isn't found.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { findChrome } from './chrome.mjs'

const input = resolve(process.argv[2] || 'out/index.html')
if (!existsSync(input)) {
  console.error(`try-form: ${input} not found; build the page first`)
  process.exit(1)
}
const bin = findChrome()
if (!bin) {
  console.error('try-form: no Chrome, Chromium or Edge found; set CHROME_PATH')
  process.exit(1)
}

const original = readFileSync(input, 'utf8')
const action = /<form class="join" action="([^"]*)"/.exec(original)?.[1]
if (!action) {
  console.error('try-form: no waitlist form found in the page')
  process.exit(1)
}
const ajax = /<form class="join"[^>]* data-ajax[ >]/.test(original)
const field = /<input id="wl-email" type="email" name="([^"]+)"/.exec(
  original,
)?.[1]

// Fills in the address and submits like a visitor, then reports the state
// the page settles in. A form that posts the classic way would leave the
// page, so for those the probe sends exactly what the browser would (the
// same fields, URL-encoded) and stops there.
const probe = `<script>addEventListener('load', () => setTimeout(() => {
  const form = document.querySelector('.join')
  form.querySelector('input[type=email]').value = 'test@example.com'
  if (form.dataset.ajax === undefined) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) })
        .then((r) => (form.dataset.state = r.ok ? 'done' : 'error'))
        .catch(() => (form.dataset.state = 'error'))
    })
  }
  form.requestSubmit()
  const t0 = Date.now()
  const poll = () => {
    const state = form.dataset.state
    if (state === 'done' || state === 'error' || Date.now() - t0 > 5000) {
      const out = document.createElement('script')
      out.type = 'application/json'
      out.id = 'lookbook-form'
      out.textContent = JSON.stringify({
        state: state || 'nothing happened',
        message: document.querySelector('.status').textContent,
        formShown: getComputedStyle(form).display !== 'none',
      })
      document.body.appendChild(out)
    } else setTimeout(poll, 50)
  }
  poll()
}, 300))</script>`
const page = original
  .replace(`action="${action}"`, 'action="/__lookbook/submit"')
  .replace('</body>', `${probe}</body>`)

let fail = false
const received = []
const TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.css': 'text/css',
  '.js': 'text/javascript',
}
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__lookbook/submit') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      received.push({
        type: req.headers['content-type'],
        accept: req.headers.accept,
        fields: Object.fromEntries(new URLSearchParams(body)),
      })
      const json = String(req.headers.accept).includes('application/json')
      res.writeHead(fail ? 500 : 200, {
        'content-type': json ? 'application/json' : 'text/html',
      })
      res.end(json ? JSON.stringify({ ok: !fail }) : '<p>Thanks</p>')
    })
    return
  }
  const path = req.url.split('?')[0]
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(page)
  }
  const file = normalize(join(dirname(input), decodeURIComponent(path)))
  if (file.startsWith(dirname(input)) && existsSync(file)) {
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
    })
    return res.end(readFileSync(file))
  }
  res.writeHead(404)
  res.end()
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const url = `http://127.0.0.1:${server.address().port}/`

const visit = () =>
  new Promise((ok, fail) =>
    execFile(
      bin,
      [
        '--headless=new',
        '--disable-gpu',
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
        '--virtual-time-budget=10000',
        '--window-size=1280,900',
        '--dump-dom',
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return fail(err)
        const found =
          /<script type="application\/json" id="lookbook-form">([\s\S]*?)<\/script>/.exec(
            stdout,
          )
        ok(found ? JSON.parse(found[1]) : null)
      },
    ),
  )

let ok = true
try {
  console.log(
    `The form posts to ${action} (${ajax ? 'in place, with JavaScript' : 'as a normal form post'}); trying it against a local stand-in.\n`,
  )
  const good = await visit()
  const sent = received.at(-1)
  if (!sent) {
    ok = false
    console.log(
      '✗ Submitting sent nothing. Is the email field required and the button type="submit"?',
    )
  } else {
    const shown = Object.entries(sent.fields)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ')
    console.log(`✓ Sent ${shown}`)
    console.log(`  as ${sent.type}${ajax ? `, asking for ${sent.accept}` : ''}`)
    if (sent.fields[field] !== 'test@example.com') {
      ok = false
      console.log(`✗ The address wasn't in the "${field}" field`)
    }
    const trap = Object.entries(sent.fields).find(([k]) =>
      ['_gotcha', 'bot-field', 'website'].includes(k),
    )
    if (trap)
      console.log(
        `✓ Spam trap "${trap[0]}" went along empty, as it should for a person`,
      )
  }
  if (!good || good.state !== 'done') {
    ok = false
    console.log(
      `✗ After a successful post the page shows: ${good ? `${good.state}, "${good.message}"` : 'nothing'}`,
    )
  } else if (ajax)
    console.log(
      `✓ Visitor then sees: "${good.message}"${good.formShown ? '' : ' (the form is replaced)'}`,
    )
  else console.log("✓ Visitor then goes to the service's own confirmation page")

  if (ajax) {
    fail = true
    const bad = await visit()
    if (!bad || bad.state !== 'error' || !bad.formShown) {
      ok = false
      console.log(
        `✗ When the service fails the page shows: ${bad ? `${bad.state}, "${bad.message}"` : 'nothing'}`,
      )
    } else
      console.log(
        `✓ When the service fails, they see: "${bad.message}" and can try again`,
      )
  }
} finally {
  server.close()
}
console.log(ok ? '\nThe form works.' : '\nThe form needs fixing.')
process.exit(ok ? 0 : 1)
