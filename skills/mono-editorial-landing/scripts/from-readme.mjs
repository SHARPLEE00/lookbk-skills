#!/usr/bin/env node
// Drafts page.json from a project's README, so there's a page to look at
// straight away and a list of what to write by hand:
//
//   node scripts/from-readme.mjs README.md page.json
//
// It only uses what the README (and a package.json beside it) says, and
// leaves out what a README doesn't have, such as a quote. At the end it
// lists what it cut, what it guessed and what it left out. The headline
// always needs a person.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { validate } from './build.mjs'
import { plain } from './inline.mjs'

const BADGE =
  /shields\.io|badgen|badge|travis-ci|circleci|codecov|coveralls|\/actions\/workflows|snyk\.io|bundlephobia|npm-stat|herokucdn/i
const SKIP =
  /contents|^toc$|licen[cs]e|contribut|credits|acknowledg|thanks|sponsor|backers|^support|code of conduct|changelog|release|^authors?$|maintainers|team$|star history|badges?$|^security|development|building from source|tests?$|testing|related|see also|alternatives|community|roadmap|donat|citation|^cite|^api( reference)?$|reference$|options$|configuration$|^table|^documentation$|^docs$|requirements|more info|^links$|^resources$|^status$|version|filing issues|^issues$|^help$|^contact/i
const FEATURES =
  /^(key |main )?features|highlights|^why\b|what .*(does|is)|at a glance|benefits/i
const INSTALL =
  /install|getting started|get started|quick ?start|^setup|^usage|^use\b/i
const FAQ = /faq|frequently asked|questions/i
const SHELL =
  /^(sh|bash|shell|zsh|console|terminal|shellsession|ps1|powershell)?$/i

const chars = (s) => [...String(s ?? '')].length
const isUrl = (s) => /^https?:\/\//.test(s)

/** README text without images, badges, HTML tags, emoji or reference links. */
function clean(text) {
  return String(text)
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/:[a-z0-9_+-]+:/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

const dedent = (lines) => {
  const pad = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length),
  )
  return lines.map((l) => l.slice(Number.isFinite(pad) ? pad : 0))
}

/** The README as headings, paragraphs, lists, code, quotes and images. */
export function blocks(md) {
  const lines = md
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
  const out = []
  let para = []
  const flush = () => {
    if (!para.length) return
    const raw = para.join(' ')
    for (const m of raw.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g))
      if (!BADGE.test(m[2])) out.push({ type: 'img', alt: m[1], src: m[2] })
    const text = clean(raw)
    if (prose(text)) out.push({ type: 'p', text })
    para = []
  }
  // HTML on its own line (centred logos, link rows) ends a paragraph.
  const html = /^\s*<\/?[a-z][^>]*>/i
  const itemRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    const fence = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)/.exec(line)
    if (fence) {
      flush()
      const body = []
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]);)
        body.push(lines[i++])
      i++
      out.push({ type: 'code', lang: fence[2], text: dedent(body).join('\n') })
      continue
    }
    const atx = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    const tag = /^\s*<h([1-6])[^>]*>(.*?)<\/h\1>\s*$/i.exec(line)
    if (atx || tag) {
      flush()
      out.push({
        type: 'h',
        level: atx ? atx[1].length : Number(tag[1]),
        text: clean(atx ? atx[2] : tag[2]),
      })
      i++
      continue
    }
    if (!line.trim()) {
      flush()
      i++
      continue
    }
    if (
      !para.length &&
      /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1] ?? '') &&
      !itemRe.test(line)
    ) {
      out.push({
        type: 'h',
        level: lines[i + 1].trim()[0] === '=' ? 1 : 2,
        text: clean(line),
      })
      i += 2
      continue
    }
    const item = itemRe.exec(line)
    if (item) {
      flush()
      const indent = item[1].length
      const items = []
      while (i < lines.length) {
        const m = itemRe.exec(lines[i])
        if (m && m[1].length <= indent + 1) {
          items.push(m[3])
          i++
        } else if (m)
          i++ // nested items are left out
        else if (!lines[i].trim()) {
          let j = i
          while (j < lines.length && !lines[j].trim()) j++
          const next = itemRe.exec(lines[j] ?? '')
          if (next && next[1].length <= indent + 1) i = j
          else break
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`
          i++
        } else break
      }
      const kept = items.map(clean).filter(Boolean)
      if (kept.length) out.push({ type: 'list', items: kept })
      continue
    }
    if (/^\s{0,3}>/.test(line)) {
      flush()
      const body = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i]))
        body.push(lines[i++].replace(/^\s{0,3}>\s?/, ''))
      const text = clean(body.join(' ').replace(/^\[!\w+\]\s*/, ''))
      if (text) out.push({ type: 'quote', text })
      continue
    }
    if (/^\s*\|/.test(line)) {
      flush()
      while (i < lines.length && /^\s*\|/.test(lines[i])) i++
      continue
    }
    if (html.test(line)) flush()
    para.push(line.trim())
    if (/>\s*$/.test(line) && html.test(line)) flush()
    i++
  }
  flush()
  return out
}

/**
 * Sentences worth putting on a page: not a row of links, a byline or a
 * stray word left over from the HTML around a logo.
 */
function prose(text) {
  const words = plain(text)
    .split(' ')
    .filter((w) => /\p{L}/u.test(w))
  const linked = [...text.matchAll(/\[([^\]]+)\]\([^)]*\)/g)]
    .map((m) => plain(m[1]).length)
    .reduce((a, b) => a + b, 0)
  return (
    words.length >= 4 &&
    chars(plain(text)) >= 24 &&
    linked < plain(text).length * 0.5 &&
    (text.match(/ [|•·] /g) ?? []).length < 2
  )
}

const sentences = (text) =>
  String(text)
    .split(/(?<=[.!?…])\s+(?=[A-Z0-9"“‘'(`*_[])/)
    .filter(Boolean)

/** Text cut to `max` characters: whole sentences if it can, whole words if not. */
function fit(text, max) {
  if (chars(plain(text)) <= max) return { text, cut: false }
  let out = ''
  for (const s of sentences(text)) {
    const next = out ? `${out} ${s}` : s
    if (chars(plain(next)) > max) break
    out = next
  }
  if (out) return { text: out, cut: true }
  const words = plain(text).split(' ')
  while (words.length && chars(`${words.join(' ')}…`) > max) words.pop()
  return { text: `${words.join(' ')}…`, cut: true }
}

const slug = (s) =>
  plain(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40)
    .replace(/-$/, '')

function repoUrl(pkg, md) {
  let r = pkg.repository
  if (r && typeof r === 'object') r = r.url
  if (typeof r === 'string') {
    r = r
      .replace(/^git\+/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/^github:/, 'https://github.com/')
      .replace(/\.git$/, '')
    if (/^[\w.-]+\/[\w.-]+$/.test(r)) r = `https://github.com/${r}`
    if (isUrl(r)) return r
  }
  for (const m of md.matchAll(
    /\]\((https:\/\/(?:github|gitlab)\.com\/[\w.-]+\/[\w.-]+)\/?\)/g,
  ))
    if (!BADGE.test(m[1])) return m[1]
  return null
}

const LICENSES =
  /\b(MIT|Apache[- ]2\.0|Apache License|BSD[- ]?[23]?-Clause|BSD|ISC|MPL[- ]?2\.0|GPL[- ]?v?[23]|LGPL|AGPL|Unlicense|CC0)\b/i

export function draft(md, pkg = {}, { dir = '.', outDir = '.' } = {}) {
  const notes = { write: [], cut: [], left: [] }
  const all = blocks(md)
  const h1 = all.findIndex((b) => b.type === 'h' && b.level === 1)
  const body = all.slice(h1 + 1)
  const first = body.findIndex((b) => b.type === 'h')
  const intro = first === -1 ? body : body.slice(0, first)
  const top = Math.min(
    ...body.filter((b) => b.type === 'h').map((b) => b.level),
  )

  // Name and tagline
  let heading = h1 >= 0 ? all[h1].text : ''
  let tagline = null
  const split = /^(.{2,40}?)\s+(?:[—–:|-])\s+(.+)$/.exec(heading)
  if (split) [, heading, tagline] = split
  let name = plain(heading) || pkg.name || 'Untitled'
  if (chars(name) > 24) {
    notes.cut.push(`brand.name "${name}" is over 24 characters`)
    name = fit(name, 24).text.replace(/…$/, '')
  }
  tagline ??= intro.find((b) => b.type === 'quote')?.text
  tagline ??= pkg.description
  const paras = intro.filter((b) => b.type === 'p').map((b) => b.text)

  // Sections at the top heading level, each with what's under it.
  const sections = []
  for (const b of body) {
    if (b.type === 'h' && b.level === top)
      sections.push({ title: b.text, blocks: [] })
    else if (sections.length) sections.at(-1).blocks.push(b)
  }
  const used = new Set()
  const ofType = (s, t) => s.blocks.filter((b) => b.type === t)
  const ids = new Set(['join', 'highlights', 'faq', 'closing'])
  const idFor = (title) => {
    let id = slug(title) || 'section'
    for (let n = 2; ids.has(id); n++) id = `${slug(title)}-${n}`
    ids.add(id)
    return id
  }

  // Columns: the features list, when its items lead with a short name.
  let columns
  const featSection = sections.find(
    (s) => FEATURES.test(s.title) && ofType(s, 'list').length,
  )
  if (featSection) {
    const items = ofType(featSection, 'list')[0].items
    const led = items
      .map(
        (it) =>
          /^\*\*(.+?)\*\*\s*[:.\-–—]?\s*(.*)$/.exec(it) ??
          /^__(.+?)__\s*[:.\-–—]?\s*(.*)$/.exec(it) ??
          /^([^:.]{3,40}):\s+(.+)$/.exec(it),
      )
      .filter(Boolean)
    if (led.length >= 2 && led.length >= items.length * 0.6) {
      used.add(featSection)
      const n = led.length === 4 ? 4 : Math.min(3, led.length)
      columns = led.slice(0, n).map(([, lead, rest], i) => {
        const t = fit(plain(lead).replace(/[.:]$/, ''), 44)
        const x = fit(rest || plain(lead), 220)
        if (t.cut) notes.cut.push(`columns[${i}].title`)
        if (x.cut) notes.cut.push(`columns[${i}].text`)
        if (!rest) notes.write.push(`columns[${i}].text: one sentence on it`)
        return {
          title: t.text,
          text: x.text.replace(/^./, (c) => c.toUpperCase()),
        }
      })
      if (led.length > n)
        notes.left.push(
          `${led.length - n} more features from "${featSection.title}": ${led
            .slice(n)
            .map(([, l]) => plain(l))
            .join(', ')}`,
        )
    }
  }

  const features = []

  // Getting started: the install and usage commands, as one terminal.
  const install = sections.filter(
    (s) => INSTALL.test(s.title) && ofType(s, 'code').length,
  )
  if (install.length) {
    const lines = []
    let dropped = 0
    for (const s of install) {
      used.add(s)
      for (const c of ofType(s, 'code')) {
        if (!SHELL.test(c.lang)) continue
        const add = c.text
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => (/^\s*(#|\$|>|\/\/)/.test(l) ? l : `$ ${l}`))
        if (lines.length && lines.length + add.length + 1 > 14) continue
        if (lines.length) lines.push('')
        for (const l of add)
          if (chars(l) <= 64) lines.push(l)
          else dropped++
      }
    }
    if (dropped)
      notes.cut.push(
        `${dropped} command line(s) over 64 characters left out of the terminal`,
      )
    const text = install.flatMap((s) => ofType(s, 'p').map((p) => p.text))
    const t = fit(text.slice(0, 2).join('\n\n'), 420)
    if (t.cut) notes.cut.push('the "get started" text')
    if (lines.length) {
      features.push({
        id: 'get-started',
        kicker: 'Get started',
        title: install[0].title,
        text: t.text || `${name} from the command line.`,
        figure: { type: 'code', title: 'Terminal', code: lines.join('\n') },
      })
      ids.add('get-started')
      notes.write.push(
        `features[0].title is the README heading "${install[0].title}": say what the reader can do in how little time${t.text ? '' : ', and write its text'}`,
      )
    }
  }

  // Other sections, in order, until there are four features.
  const faqSection = sections.find((s) => FAQ.test(s.title))
  for (const s of sections) {
    if (used.has(s) || s === faqSection || SKIP.test(s.title)) continue
    const ps = ofType(s, 'p').map((p) => p.text)
    const list = ofType(s, 'list')[0]?.items ?? []
    if (!ps.length && !list.length) continue
    if (features.length === 4) {
      notes.left.push(`the "${s.title}" section`)
      continue
    }
    used.add(s)
    const i = features.length
    const title = fit(s.title, 72)
    const text = fit(
      ps.length ? ps.slice(0, 2).join('\n\n') : `${s.title}:`,
      420,
    )
    if (text.cut) notes.cut.push(`features[${i}].text`)
    if (!ps.length) notes.write.push(`features[${i}].text: a sentence or two`)
    const ft = { id: idFor(s.title), title: title.text, text: text.text }
    if (list.length) {
      ft.points = list.slice(0, 4).map((p, j) => {
        const f = fit(p, 90)
        if (f.cut) notes.cut.push(`features[${i}].points[${j}]`)
        return f.text
      })
      if (list.length > 4)
        notes.left.push(`${list.length - 4} list items from "${s.title}"`)
    }
    const code = ofType(s, 'code').find((c) => {
      const ls = c.text.split('\n')
      return ls.length <= 14 && ls.every((l) => chars(l) <= 64) && c.text.trim()
    })
    const img = ofType(s, 'img').find(
      (m) => isUrl(m.src) || existsSync(resolve(dir, m.src)),
    )
    if (img) {
      ft.figure = {
        type: 'image',
        src: isUrl(img.src)
          ? img.src
          : relative(outDir, resolve(dir, img.src)) || img.src,
        alt: fit(img.alt || s.title, 160).text,
      }
      if (!img.alt)
        notes.write.push(`features[${i}].figure.alt: what the picture shows`)
    } else if (code)
      ft.figure = {
        type: 'code',
        title: SHELL.test(code.lang) ? 'Terminal' : code.lang,
        code: code.text,
      }
    notes.write.push(
      `features[${i}].title is the README heading "${s.title}": make it a line about what the reader gets`,
    )
    features.push(ft)
  }

  // Questions: ### headings or **bold** lines, each with the text under it.
  let faq
  if (faqSection) {
    used.add(faqSection)
    const items = []
    let q = null
    for (const b of faqSection.blocks) {
      const bold = b.type === 'p' && /^\*\*(.+?)\*\*\s*(.*)$/.exec(b.text)
      if (b.type === 'h' || bold) {
        q = { q: plain(b.type === 'h' ? b.text : bold[1]), a: [] }
        if (bold?.[2]) q.a.push(bold[2])
        items.push(q)
      } else if (q && b.type === 'p') q.a.push(b.text)
      else if (q && b.type === 'list') q.a.push(b.items.join('; '))
    }
    const kept = items.filter((x) => x.a.length).slice(0, 8)
    if (kept.length)
      faq = {
        items: kept.map((x, i) => {
          const qq = fit(x.q, 100)
          const a = fit(x.a.join('\n\n'), 500)
          if (qq.cut || a.cut) notes.cut.push(`faq.items[${i}]`)
          return { q: qq.text, a: a.text }
        }),
      }
  }

  // Hero
  const repo = repoUrl(pkg, md)
  const home =
    pkg.homepage && !/#readme$/.test(pkg.homepage) ? pkg.homepage : null
  const leadSentence = sentences(paras[0] ?? '')[0]
  let headline = [tagline, leadSentence, name]
    .filter(Boolean)
    .map((s) => plain(s))
    .find((s) => chars(s) <= 64)
  headline ??= fit(plain(tagline ?? leadSentence), 64).text
  notes.write.unshift(
    `hero.title: "${headline}" comes from the README. Write the headline with the person: what the reader gets, in a few words, with one *italic* word`,
  )
  let ledeParas = paras
  if (plain(paras[0] ?? '') === headline) ledeParas = paras.slice(1)
  else if (leadSentence && plain(leadSentence) === headline) {
    const rest = plain(paras[0]).slice(chars(headline)).trim()
    ledeParas = rest
      ? [paras[0].slice(leadSentence.length).trim(), ...paras.slice(1)]
      : paras.slice(1)
  }
  let lede = fit(ledeParas.join(' ') || tagline || pkg.description || '', 300)
  if (!lede.text) {
    lede = { text: `${name}.`, cut: false }
    notes.write.push('hero.lede: the README has no introduction to use')
  }
  if (lede.cut) notes.cut.push('hero.lede')
  if (plain(lede.text) === headline)
    notes.write.push(
      'hero.lede repeats the headline: say what it is, for whom, and why',
    )

  const start = features.find((f) => f.id === 'get-started')
  const primary = start
    ? { label: 'Get started', href: '#get-started' }
    : home
      ? { label: 'Get started', href: home }
      : repo
        ? {
            label: repo.includes('gitlab')
              ? 'View on GitLab'
              : 'View on GitHub',
            href: repo,
          }
        : null
  const secondary =
    repo && primary?.href !== repo
      ? { label: repo.includes('gitlab') ? 'GitLab' : 'GitHub', href: repo }
      : undefined
  if (!primary)
    notes.write.push(
      'hero.actions.primary: no install steps, homepage or repository found; point it at the real download or sign-up',
    )

  const license =
    (typeof pkg.license === 'string' && pkg.license) ||
    LICENSES.exec(
      sections
        .filter((s) => /licen[cs]e/i.test(s.title))
        .flatMap((s) => s.blocks.map((b) => b.text ?? ''))
        .join(' '),
    )?.[1]

  const nav = [
    ...features.filter((f) => f.id !== 'get-started'),
    ...(faq ? [{ id: 'faq', title: 'Questions' }] : []),
  ]
    .map((f) => ({ label: plain(f.title), href: `#${f.id}` }))
    .filter((l) => chars(l.label) <= 16)
    .slice(0, 3)
  if (repo)
    nav.push({
      label: repo.includes('gitlab') ? 'GitLab' : 'GitHub',
      href: repo,
    })

  const page = {
    brand: { name, href: '/' },
    nav,
    issue: [
      license && `Open source · ${license}`,
      pkg.version && `Version ${pkg.version}`,
    ].filter(Boolean),
    hero: {
      title: headline,
      lede: lede.text,
      actions: {
        primary: primary ?? { label: 'Get started', href: '/' },
        ...(secondary && { secondary }),
      },
    },
    ...(columns && { columns }),
    features,
    ...(faq && { faq }),
    ...(start && {
      closing: {
        title: `Get started with ${name}.`,
        action: { label: 'Get started', href: '#get-started' },
      },
    }),
    footer: {
      items: [
        `${name} © ${new Date().getFullYear()}`,
        license && `${license} licence`,
      ].filter(Boolean),
      ...(repo && {
        links: [{ label: 'Source', href: repo }],
      }),
    },
    meta: {
      title: fit(tagline ? `${name}: ${plain(tagline)}` : name, 70).text,
      description: fit(plain(lede.text), 170).text,
    },
  }
  if (!page.issue.length) delete page.issue
  if (start)
    notes.write.push(
      'closing.title: the line people read last, above the button',
    )
  notes.write.push(
    'meta.url: the page’s address once it’s live',
    'theme: paper and ink colours, if not black on white paper',
  )
  for (const s of sections)
    if (
      !used.has(s) &&
      !SKIP.test(s.title) &&
      !notes.left.some((l) => l.includes(`"${s.title}"`))
    )
      notes.left.push(`the "${s.title}" section`)
  return { page, notes }
}

if (process.argv[1] === resolve(new URL(import.meta.url).pathname)) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const input = resolve(files[0] || 'README.md')
  const output = resolve(files[1] || 'page.json')
  if (!existsSync(input)) {
    console.error(`from-readme: ${input} not found`)
    process.exit(1)
  }
  const dir = dirname(input)
  const pkgFile = join(dir, 'package.json')
  let pkg = {}
  if (existsSync(pkgFile))
    try {
      pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
    } catch {}
  if (existsSync(output) && !process.argv.includes('--force')) {
    console.error(
      `from-readme: ${relative(process.cwd(), output)} exists; pass --force to replace it`,
    )
    process.exit(1)
  }
  const { page, notes } = draft(readFileSync(input, 'utf8'), pkg, {
    dir,
    outDir: dirname(output),
  })
  writeFileSync(output, `${JSON.stringify(page, null, 2)}\n`)
  console.log(
    `Wrote ${relative(process.cwd(), output)}: a draft from the README.`,
  )
  const problems = validate(page, dirname(output))
  if (problems.length)
    console.log(
      `\nThe build will want these fixed:\n  - ${problems.join('\n  - ')}`,
    )
  const show = (title, list) =>
    list.length && console.log(`\n${title}\n  - ${list.join('\n  - ')}`)
  show('Write with the person:', notes.write)
  show('Cut to fit (read them again):', notes.cut)
  show('In the README but not on the page:', notes.left)
}
