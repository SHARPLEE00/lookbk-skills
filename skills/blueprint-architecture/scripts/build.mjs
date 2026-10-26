#!/usr/bin/env node
// Builds a blueprint architecture diagram from diagram.json:
//
//   node scripts/build.mjs diagram.json [out-dir]     (default out-dir: ./out)
//
// Writes out/index.html (the diagram with moving data-flow dots, opens from
// disk) and out/diagram.svg (the same drawing, still, for docs and slides).
// The layout comes from dagre (vendor/, MIT); everything is checked first
// and every problem is listed at once.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dagre from '../vendor/dagre.esm.js'

export const KINDS = {
  service: 'SVC',
  client: 'CLIENT',
  database: 'DB',
  queue: 'QUEUE',
  cache: 'CACHE',
  storage: 'STORE',
  function: 'FN',
  external: 'EXT',
}
export const THEMES = {
  blueprint: {
    paper: '#0b2545',
    line: '#e8f1ff',
    accent: '#5fd4ff',
    dim: '#9cc3ff',
  },
  whiteprint: {
    paper: '#f4f1e8',
    line: '#1d2b3a',
    accent: '#d9480f',
    dim: '#56687a',
  },
}
const LIMITS = { label: 28, sub: 36, edge: 24, title: 60, subtitle: 100 }
// Shapes that need room beside the text: extra width, where the text starts,
// and how far the kind tag sits in from the right edge.
const ROOM = {
  queue: { extra: 48, text: 20, tag: 60 },
  function: { extra: 32, text: 34, tag: 50 },
}
const MONO = 0.6 // JetBrains Mono: every glyph is 0.6 em wide
const chars = (s) => [...String(s ?? '')].length
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Every problem in a diagram, as readable lines. Empty when it's fine. */
export function validate(d) {
  const p = []
  if (!d || typeof d !== 'object') return ['diagram.json must be an object']
  if (!d.title?.trim()) p.push('"title" is required')
  else if (chars(d.title) > LIMITS.title)
    p.push(
      `"title" is ${chars(d.title)} characters; the limit is ${LIMITS.title}`,
    )
  if (chars(d.subtitle) > LIMITS.subtitle)
    p.push(`"subtitle" is over ${LIMITS.subtitle} characters`)
  if (d.direction && !['LR', 'TB'].includes(d.direction))
    p.push('"direction" must be LR (left to right) or TB (top to bottom)')
  if (typeof d.theme === 'string' && !THEMES[d.theme])
    p.push(`"theme" must be ${Object.keys(THEMES).join(' or ')}, or colours`)
  if (d.theme && typeof d.theme === 'object')
    for (const [k, v] of Object.entries(d.theme))
      if (!(k in THEMES.blueprint) || !HEX.test(v))
        p.push(`theme.${k} must be one of paper, line, accent, dim, as hex`)
  const groups = new Set()
  for (const [i, g] of (d.groups ?? []).entries()) {
    if (!g?.id || !g.label) p.push(`groups[${i}] needs an "id" and a "label"`)
    else if (groups.has(g.id)) p.push(`group "${g.id}" is listed twice`)
    groups.add(g?.id)
  }
  if (!Array.isArray(d.nodes) || d.nodes.length < 2)
    return [...p, '"nodes" needs at least 2 entries']
  if (d.nodes.length > 40)
    p.push('a diagram has at most 40 nodes; split it into several sheets')
  const ids = new Set()
  for (const [i, n] of d.nodes.entries()) {
    const at = `node ${n?.id ? `"${n.id}"` : i + 1}`
    if (!/^[\w-]+$/.test(n?.id ?? ''))
      p.push(`${at}: "id" must be letters, digits, - or _`)
    else if (ids.has(n.id)) p.push(`${at}: the id is used twice`)
    ids.add(n?.id)
    if (!n?.label?.trim()) p.push(`${at}: "label" is required`)
    for (const k of ['label', 'sub'])
      if (chars(n?.[k]) > LIMITS[k])
        p.push(
          `${at}: "${k}" is ${chars(n[k])} characters; the limit is ${LIMITS[k]}`,
        )
    if (n?.kind && !KINDS[n.kind])
      p.push(`${at}: "kind" must be one of ${Object.keys(KINDS).join(', ')}`)
    if (n?.group && !groups.has(n.group))
      p.push(`${at}: group "${n.group}" isn't in "groups"`)
  }
  for (const [i, e] of (d.edges ?? []).entries()) {
    const at = `edge ${i + 1} (${e?.from} → ${e?.to})`
    for (const end of ['from', 'to'])
      if (!ids.has(e?.[end])) p.push(`${at}: "${end}" isn't a node id`)
    if (e?.from === e?.to) p.push(`${at}: an edge can't point at its own node`)
    if (chars(e?.label) > LIMITS.edge)
      p.push(`${at}: "label" is over ${LIMITS.edge} characters`)
  }
  return p
}

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
const r1 = (n) => Math.round(n * 10) / 10

/** Node and label positions from dagre, in diagram units (px). */
export function layout(d) {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  g.setGraph({
    rankdir: d.direction || 'LR',
    nodesep: 56,
    ranksep: 150,
    edgesep: 24,
    marginx: 24,
    marginy: 24,
  })
  for (const grp of d.groups ?? [])
    g.setNode(`group:${grp.id}`, { label: grp.label, paddingTop: 44 })
  for (const n of d.nodes) {
    // The text is monospaced, so its width is exact.
    const w = Math.max(chars(n.label) * 22 * MONO, chars(n.sub) * 15 * MONO)
    g.setNode(n.id, {
      width:
        Math.min(360, Math.max(200, Math.ceil(w + 52))) +
        (ROOM[n.kind]?.extra ?? 0),
      height: n.sub ? 112 : 84,
    })
    if (n.group) g.setParent(n.id, `group:${n.group}`)
  }
  for (const [i, e] of (d.edges ?? []).entries())
    g.setEdge(
      e.from,
      e.to,
      e.label
        ? { width: chars(e.label) * 14 * MONO + 16, height: 24, labelpos: 'c' }
        : {},
      `e${i}`,
    )
  dagre.layout(g)
  return g
}

/** A smooth path through dagre's bend points (a uniform B-spline). */
function curve(points) {
  if (points.length < 3)
    return `M${points.map((q) => `${r1(q.x)},${r1(q.y)}`).join('L')}`
  let path = `M${r1(points[0].x)},${r1(points[0].y)}`
  const pts = [points[0], ...points, points[points.length - 1]]
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2] = [pts[i - 1], pts[i], pts[i + 1]]
    path += `C${r1((2 * p0.x + p1.x) / 3)},${r1((2 * p0.y + p1.y) / 3)} ${r1((p0.x + 2 * p1.x) / 3)},${r1((p0.y + 2 * p1.y) / 3)} ${r1((p0.x + 4 * p1.x + p2.x) / 6)},${r1((p0.y + 4 * p1.y + p2.y) / 6)}`
  }
  const [a, b] = [pts[pts.length - 3], pts[pts.length - 2]]
  path += `C${r1((2 * a.x + b.x) / 3)},${r1((2 * a.y + b.y) / 3)} ${r1((a.x + 2 * b.x) / 3)},${r1((a.y + 2 * b.y) / 3)} ${r1(b.x)},${r1(b.y)}`
  return path
}

/** The outline of a node, by kind, inside its box. */
function shape(kind, x, y, w, h) {
  const rect = (extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"${extra}/>`
  switch (kind) {
    case 'database': {
      const ry = 14
      return `<path d="M${x},${y + ry} a${w / 2},${ry} 0 0 0 ${w},0 v${h - 2 * ry} a${w / 2},${ry} 0 0 1 ${-w},0 z"/><path d="M${x},${y + ry} a${w / 2},${ry} 0 0 1 ${w},0"/>`
    }
    case 'storage':
      return `<path d="M${x},${y + 14} h${w * 0.38} l12,-14 h${w * 0.62 - 12} v${h} h${-w} z"/>`
    case 'queue':
      return `${rect()}${[18, 30, 42].map((o) => `<line x1="${x + w - o}" y1="${y + 8}" x2="${x + w - o}" y2="${y + h - 8}" class="thin"/>`).join('')}`
    case 'client':
      return `${rect()}<line x1="${x}" y1="${y + 14}" x2="${x + w}" y2="${y + 14}" class="thin"/>`
    case 'cache':
      return `<path d="M${x + 14},${y} h${w - 14} v${h} h${-w} v${-(h - 14)} z"/>`
    case 'function':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`
    case 'external':
      return rect(' stroke-dasharray="10 7"')
    default:
      return rect()
  }
}

/** The finished drawing as SVG markup, plus its size. */
export function draw(d) {
  const theme = {
    ...THEMES.blueprint,
    ...(typeof d.theme === 'string' ? THEMES[d.theme] : d.theme),
  }
  const g = layout(d)
  const gw = g.graph().width
  const gh = g.graph().height
  const HEAD = 190
  const FOOT = 130
  const W = Math.ceil(Math.max(1600, gw + 160))
  const H = Math.ceil(Math.max(900, gh + HEAD + FOOT))
  const ox = Math.round((W - gw) / 2)
  const oy = Math.round(HEAD + (H - HEAD - FOOT - gh) / 2)
  const byId = new Map(d.nodes.map((n) => [n.id, n]))
  const out = []

  for (const grp of d.groups ?? []) {
    const b = g.node(`group:${grp.id}`)
    if (!b?.width) continue
    const x = r1(ox + b.x - b.width / 2)
    const y = r1(oy + b.y - b.height / 2)
    out.push(
      `<g class="group"><rect x="${x}" y="${y}" width="${r1(b.width)}" height="${r1(b.height)}" rx="10"/><text x="${x + 16}" y="${y + 26}">${esc(grp.label).toUpperCase()}</text></g>`,
    )
  }

  const edges = (d.edges ?? []).map((e, i) => {
    const pts = g
      .edge({ v: e.from, w: e.to, name: `e${i}` })
      .points.map((q) => ({ x: ox + q.x, y: oy + q.y }))
    return {
      e,
      i,
      d: curve(pts),
      label: g.edge({ v: e.from, w: e.to, name: `e${i}` }),
    }
  })
  for (const { e, i, d: path } of edges)
    out.push(
      `<path id="e${i}" class="edge${e.async ? ' async' : ''}" d="${path}" marker-end="url(#arrow)"/>`,
    )
  // Data-flow dots, one per edge, drawn under the labels and nodes in the
  // HTML version. A negative begin starts each part-way along its edge.
  const pulses = edges
    .map(
      ({ i }) =>
        `<circle class="pulse" r="5"><animateMotion dur="2.6s" begin="-${((i * 0.37) % 2.6).toFixed(2)}s" repeatCount="indefinite"><mpath href="#e${i}"/></animateMotion></circle>`,
    )
    .join('')
  const under = out.splice(0)
  for (const { e, label } of edges) {
    if (!e.label) continue
    const w = chars(e.label) * 14 * MONO + 16
    const x = r1(ox + label.x)
    const y = r1(oy + label.y)
    out.push(
      `<g class="elabel"><rect x="${r1(x - w / 2)}" y="${y - 12}" width="${r1(w)}" height="24" rx="4"/><text x="${x}" y="${y + 5}" text-anchor="middle">${esc(e.label)}</text></g>`,
    )
  }

  for (const id of g.nodes()) {
    const n = byId.get(id)
    if (!n) continue
    const b = g.node(id)
    const x = r1(ox + b.x - b.width / 2)
    const y = r1(oy + b.y - b.height / 2)
    const kind = n.kind || 'service'
    const top = kind === 'database' ? 30 : kind === 'client' ? 22 : 8
    const mid = y + top + (b.height - top) / 2
    const room = ROOM[kind] ?? { text: 20, tag: 12 }
    const tx = x + room.text
    out.push(
      `<g class="node${n.focus ? ' focus' : ''}">${shape(kind, x, y, b.width, b.height)}<text class="kind" x="${r1(x + b.width - room.tag)}" y="${y + (kind === 'database' ? 50 : top + 18)}" text-anchor="end">${KINDS[kind]}</text><text class="label" x="${tx}" y="${r1(n.sub ? mid - 4 : mid + 8)}">${esc(n.label)}</text>${n.sub ? `<text class="sub" x="${tx}" y="${r1(mid + 24)}">${esc(n.sub)}</text>` : ''}</g>`,
    )
  }

  const legend = `<g class="legend" transform="translate(80 ${H - 64})"><line x1="0" y1="0" x2="44" y2="0" class="edge"/><text x="56" y="5">request</text><line x1="170" y1="0" x2="214" y2="0" class="edge async"/><text x="226" y="5">event / async</text></g>`
  // The drawing's title block: name and sheet number, bottom right.
  const sheet = `SHEET ${d.sheet ?? '01 / 01'}`
  const cell = (text) => Math.ceil(chars(text) * 14 * (MONO + 0.06) + 28)
  const [nameW, sheetW] = [cell(d.title), cell(sheet)]
  const block = `<g class="titleblock" transform="translate(${W - 80 - nameW - sheetW} ${H - 100})"><rect width="${nameW + sheetW}" height="56"/><line x1="${nameW}" y1="0" x2="${nameW}" y2="56"/><text x="14" y="34">${esc(d.title).toUpperCase()}</text><text x="${nameW + 14}" y="34">${esc(sheet)}</text></g>`
  const svg = (
    animated,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'JetBrains Mono', ui-monospace, monospace">
<style>
.paper{fill:${theme.paper}}
.node>*:not(text){fill:${theme.paper};stroke:${theme.line};stroke-width:2.5}
.node .thin{stroke-width:1.5}
.node.focus>*:not(text){stroke:${theme.accent};stroke-width:3}
.node.focus .label{fill:${theme.accent}}
.label{fill:${theme.line};font-size:22px;font-weight:600}
.sub{fill:${theme.dim};font-size:15px}
.kind{fill:${theme.dim};font-size:11px;letter-spacing:.12em}
.edge{fill:none;stroke:${theme.accent};stroke-width:2.5}
.edge.async{stroke-dasharray:8 6}
.elabel rect{fill:${theme.paper}}
.elabel text{fill:${theme.accent};font-size:14px}
.group rect{fill:none;stroke:${theme.dim};stroke-width:1.5;stroke-dasharray:4 6}
.group text{fill:${theme.dim};font-size:13px;letter-spacing:.14em}
.title{fill:${theme.line};font-size:40px;font-weight:700}
.subtitle{fill:${theme.dim};font-size:18px}
.legend text{fill:${theme.dim};font-size:14px}
.titleblock rect,.titleblock line{fill:none;stroke:${theme.dim};stroke-width:2}
.titleblock text{fill:${theme.line};font-size:14px;letter-spacing:.06em}
.pulse{fill:${theme.accent}}
${animated ? `.edge.async{animation:flow 1.2s linear infinite}@keyframes flow{to{stroke-dashoffset:-28}}html.still .pulse{display:none}html.still .edge.async{animation:none}` : ''}
</style>
<defs>
<pattern id="minor" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="${theme.dim}" stroke-opacity=".1" stroke-width="1"/></pattern>
<pattern id="major" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#minor)"/><path d="M100 0H0V100" fill="none" stroke="${theme.dim}" stroke-opacity=".2" stroke-width="1"/></pattern>
<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10z" fill="${theme.accent}"/></marker>
</defs>
<rect class="paper" width="${W}" height="${H}"/>
<rect width="${W}" height="${H}" fill="url(#major)"/>
<text class="title" x="80" y="104">${esc(d.title)}</text>
${d.subtitle ? `<text class="subtitle" x="80" y="140">${esc(d.subtitle)}</text>` : ''}
${under.join('\n')}
${animated ? pulses : ''}
${out.join('\n')}
${legend}
${block}
</svg>`
  return { W, H, theme, svg }
}

/** The HTML page: the animated drawing, scaled to the window. */
export function page(d, drawing) {
  const { W, H, theme, svg } = drawing
  return `<!doctype html>
<html lang="en" data-w="${W}" data-h="${H}" data-paper="${theme.paper}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=block">
<style>
html,body{margin:0;background:${theme.paper}}
svg{display:block;width:100%;height:auto;max-width:${W}px;margin:0 auto}
html.still svg{width:${W}px;max-width:none}
</style>
<script>if (/[?&]still\\b/.test(location.search)) document.documentElement.className = 'still'</script>
</head>
<body>
${svg(true)}
</body>
</html>
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = resolve(process.argv[2] || 'diagram.json')
  const outDir = resolve(process.argv[3] || 'out')
  let d
  try {
    d = JSON.parse(readFileSync(input, 'utf8'))
  } catch (e) {
    console.error(`build: cannot read ${input}: ${e.message}`)
    process.exit(1)
  }
  const problems = validate(d)
  if (problems.length) {
    console.error(
      `build: fix diagram.json first:\n  - ${problems.join('\n  - ')}`,
    )
    process.exit(1)
  }
  const drawing = draw(d)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), page(d, drawing))
  writeFileSync(join(outDir, 'diagram.svg'), drawing.svg(false) + '\n')
  console.log(
    `Built ${d.nodes.length} nodes and ${(d.edges ?? []).length} edges at ${drawing.W}×${drawing.H} into ${outDir}`,
  )
}
