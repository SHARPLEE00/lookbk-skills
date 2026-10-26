#!/usr/bin/env node
// Writes cards.json from a folder of Markdown posts: one card per post, from
// its front matter (title, slug, date, tags or category, author, series) and
// its reading time (reading_time in the front matter, else words / 230).
//
//   node scripts/from-posts.mjs content/blog --site=yourblog.example [options]
//
//   --site=yourblog.example   shown on each card, before the post's path
//   --path=/blog/         the path posts live under on the site (default /)
//   --kicker="Field notes"  the small label top left (default: the post's
//                         series, else "Article")
//   --author="Mara Reyes" for posts with no author in their front matter
//   --out-dir=public/og   write every card to <out-dir>/<slug>.png; without
//                         it each card goes next to its post as <name>.og.png
//   -o cards.json         where to write (default ./cards.json)
//
// Run it again after new posts: cards already in cards.json, with any edits
// you made to them, are kept; new posts are added and deleted ones dropped.
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const oAt = args.indexOf('-o')
const output = resolve(oAt >= 0 ? args[oAt + 1] : 'cards.json')
const root = args.find(
  (a, i) => !a.startsWith('-') && (oAt < 0 || i !== oAt + 1),
)
if (!root || !existsSync(root)) {
  console.error(
    'usage: node scripts/from-posts.mjs <posts-folder> --site=yourblog.example [--path=/blog/] [--out-dir=public/og] [-o cards.json]',
  )
  process.exit(1)
}
const site = flag('site', '')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')
const basePath = `/${flag('path', '/').replace(/^\/|\/$/g, '')}/`.replace(
  '//',
  '/',
)
const outDir = flag('out-dir')

/** Markdown files under dir, skipping dependencies and hidden folders. */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name === 'node_modules') return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(md|mdx|markdown)$/i.test(name) ? [path] : []
  })
}

const unquote = (v) => {
  v = v.trim()
  if (/^(['"]).*\1$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"')
  return v
}
/** The YAML front matter most blogs use: scalars, lists and one level of nesting. */
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return [{}, text]
  const data = {}
  let key = null
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const item = /^\s+-\s+(.*)$/.exec(line)
    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line)
    const top = /^([\w-]+):\s*(.*)$/.exec(line)
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = []
      data[key].push(unquote(item[1]))
    } else if (nested && key) {
      if (typeof data[key] !== 'object' || Array.isArray(data[key]))
        data[key] = {}
      data[key][nested[1]] = unquote(nested[2])
    } else if (top) {
      key = top[1]
      const v = top[2].trim()
      if (v.startsWith('[') && v.endsWith(']'))
        data[key] = v.slice(1, -1).split(',').map(unquote).filter(Boolean)
      else data[key] = v === '' ? '' : unquote(v)
    }
  }
  return [data, text.slice(m[0].length)]
}

function slugOf(file, fm) {
  if (fm.slug) return String(fm.slug)
  if (fm.permalink) return String(fm.permalink).split('/').filter(Boolean).pop()
  const name = basename(file, extname(file))
  const id = /^(index|_index|readme)$/i.test(name)
    ? basename(dirname(file))
    : name
  return id
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const first = (v) => (Array.isArray(v) ? v[0] : v)
const minutes = (body) =>
  Math.max(
    1,
    Math.ceil(
      body
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .split(/\s+/)
        .filter(Boolean).length / 230,
    ),
  )

const outBase = dirname(output)
const existing = existsSync(output)
  ? JSON.parse(readFileSync(output, 'utf8'))
  : {}
const kept = new Map((existing.cards || []).map((c) => [c.slug, c]))
const warnings = []
const posts = []
for (const file of walk(resolve(root))) {
  const [fm, body] = frontMatter(readFileSync(file, 'utf8'))
  if (fm.draft === 'true' || fm.published === 'false') continue
  if (!fm.title) {
    warnings.push(`${relative(process.cwd(), file)}: no title, skipped`)
    continue
  }
  const slug = slugOf(file, fm)
  const author =
    typeof fm.author === 'object'
      ? fm.author.name
      : first(fm.author || fm.authors)
  const name = basename(file, extname(file))
  const out = outDir
    ? join(relative(outBase, resolve(outDir)), `${slug}.png`)
    : relative(
        outBase,
        /^(index|_index)$/i.test(name)
          ? join(dirname(file), 'og.png')
          : join(dirname(file), `${name}.og.png`),
      )
  const card = {
    slug,
    title: String(fm.og_title || fm.title).trim(),
    kicker: fm.kicker || fm.series || flag('kicker', 'Article'),
    topic:
      fm.topic || first(fm.category || fm.categories) || first(fm.tags) || '',
    meta: `${parseInt(fm.reading_time || fm.readingTime, 10) || minutes(body)} min read`,
    author: author || flag('author', ''),
    url: site ? `${site}${basePath}${slug}` : '',
    out: out.split('\\').join('/'),
    date: fm.date || fm.pubDate || fm.published || '',
  }
  for (const [k, max] of Object.entries({
    title: 110,
    kicker: 24,
    topic: 28,
    url: 48,
  }))
    if ([...String(card[k])].length > max)
      warnings.push(
        `${slug}: ${k} is ${[...String(card[k])].length} characters (limit ${max}); shorten it in cards.json`,
      )
  if (!card.author) delete card.author
  if (!card.topic) delete card.topic
  if (!card.url) delete card.url
  posts.push(kept.get(slug) ?? card)
}
posts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

const doc = {
  theme: existing.theme ?? {
    paper: '#fafaf7',
    ink: '#17181c',
    accent: '#2433e8',
  },
  ...(existing.defaults ? { defaults: existing.defaults } : {}),
  cards: posts,
}
writeFileSync(output, JSON.stringify(doc, null, 2) + '\n')
const added = posts.filter((p) => !kept.has(p.slug)).length
console.log(
  `Wrote ${posts.length} cards to ${relative(process.cwd(), output)} (${added} new, ${posts.length - added} kept).`,
)
if (warnings.length) console.warn(`Check:\n  - ${warnings.join('\n  - ')}`)
