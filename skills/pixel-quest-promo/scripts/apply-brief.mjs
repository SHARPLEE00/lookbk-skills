#!/usr/bin/env node
// Writes a brief into a HyperFrames project so preview, check, snapshot and
// render all use it without extra flags.
//
//   node scripts/apply-brief.mjs <project-dir> [brief.json]
//
// The brief is a flat JSON object keyed by the variable ids declared on the
// project's <html data-composition-variables>. Each value is checked against
// its declaration (type, maxLength, min/max, colour format) and written in as
// that variable's default. Unknown keys and bad values stop the script.
// A string may be empty only when its declaration has "optional": true.
// An enum may map its options to canvas sizes with "sizes"; the chosen
// size is written to the composition root too.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dir = resolve(process.argv[2] || '.')
const briefPath = resolve(process.argv[3] || join(dir, 'brief.json'))
const htmlPath = join(dir, 'index.html')

const fail = (msg) => {
  console.error(`apply-brief: ${msg}`)
  process.exit(1)
}

let brief
try {
  brief = JSON.parse(readFileSync(briefPath, 'utf8'))
} catch (e) {
  fail(`cannot read ${briefPath}: ${e.message}`)
}
if (!brief || typeof brief !== 'object' || Array.isArray(brief))
  fail('the brief must be one JSON object')

const html = readFileSync(htmlPath, 'utf8')
const match = html.match(/data-composition-variables='([\s\S]*?)'/)
if (!match) fail(`${htmlPath} declares no data-composition-variables`)
const decls = JSON.parse(match[1])
const byId = new Map(decls.map((d) => [d.id, d]))

const problems = []
for (const [id, value] of Object.entries(brief)) {
  const d = byId.get(id)
  if (!d) {
    problems.push(
      `"${id}" is not a variable here (have: ${[...byId.keys()].join(', ')})`,
    )
    continue
  }
  if (d.type === 'string') {
    if (typeof value !== 'string') problems.push(`${id} must be text`)
    else if (!value.trim() && !d.optional)
      problems.push(`${id} is empty (only optional fields may be)`)
    else if (d.maxLength && [...value].length > d.maxLength)
      problems.push(
        `${id} is ${[...value].length} characters; the limit is ${d.maxLength}`,
      )
  } else if (d.type === 'color') {
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value)))
      problems.push(`${id} must be a hex colour like #ff5b2e`)
  } else if (d.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      problems.push(`${id} must be a number`)
    else if (d.min != null && value < d.min)
      problems.push(`${id} is below ${d.min}`)
    else if (d.max != null && value > d.max)
      problems.push(`${id} is above ${d.max}`)
  } else if (d.type === 'boolean') {
    if (typeof value !== 'boolean') problems.push(`${id} must be true or false`)
  } else if (d.type === 'enum') {
    const ok = (d.options || []).map((o) => o.value)
    if (!ok.includes(value))
      problems.push(`${id} must be one of ${ok.join(', ')}`)
  }
}
if (problems.length)
  fail(`fix the brief first:\n  - ${problems.join('\n  - ')}`)

const next = decls.map((d) =>
  d.id in brief ? { ...d, default: brief[d.id] } : d,
)
const json =
  `[\n${next.map((d) => `      ${JSON.stringify(d)}`).join(',\n')}\n    ]`.replace(
    /'/g,
    '&#39;',
  )
let out = html.replace(match[0], `data-composition-variables='${json}'`)
// An enum whose declaration maps options to canvas sizes
// ("sizes": {"tall": [1080, 1920]}) also sets the composition's size.
for (const d of next) {
  const size = d.type === 'enum' && d.sizes?.[d.default]
  if (!size) continue
  const [w, h] = size
  out = out
    .replace(/(data-composition-id="main"[\s\S]*?data-width=")\d+/, `$1${w}`)
    .replace(/(data-composition-id="main"[\s\S]*?data-height=")\d+/, `$1${h}`)
    .replace(
      /content="width=\d+, height=\d+"/,
      `content="width=${w}, height=${h}"`,
    )
}
writeFileSync(htmlPath, out)

const set = Object.keys(brief)
const kept = decls.filter((d) => !(d.id in brief)).map((d) => d.id)
console.log(`Applied ${set.length} values to ${htmlPath}`)
if (kept.length)
  console.log(`Kept the template defaults for: ${kept.join(', ')}`)
