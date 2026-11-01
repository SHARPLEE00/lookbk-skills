// Washing Line: the effect description the Motion Heroes kit reads at build
// time. The drawing itself is effect.js (runs in the browser).
//
// A printed cotton poster pinned to a washing line with wooden pegs, under
// an open sky with slow clouds. The cloth is simulated (Verlet particles
// with stretch, shear and bend constraints): a breeze lifts it, the visitor
// presses a soft dimple into it with the pointer, grabs it anywhere and
// pulls it, and when they let go it swings back and settles. The print on
// the cloth (title, line, headline, a spec column, a small chart, a footer)
// is the brand's own, drawn with its fonts. In a recording a scripted hand
// pulls a corner and lets go, then a fingertip runs across the cloth, so the
// video shows what visitors can do.
//
// three.js r180 from the kit's pinned copy, no add-ons.
import { readFileSync } from 'node:fs'
import { contrast, mix, readable } from '../color.mjs'

const here = (f) => new URL(f, import.meta.url)

export default {
  id: 'washing-line',
  name: 'Washing Line',
  needs: 'webgl',
  libs: [
    { name: 'three', url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js', integrity: 'sha384-G204cH8yiGRBsIeOd0ayBXn7MSDuf0X5To614xt+2b1ApqNUxAWn/XqL8Xilauyd' },
    { url: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.min.js', integrity: 'sha384-Aa12tAyxIBJJAFu3qP8FVQCMM0U5JQGdmu9Plhyw4kRdmajEzNw8jChNzDqgEu9x' },
  ],
  extraPlace: 'overlay',
  // the cloth at rest for reduced motion; the poster mid-pull
  stillTime: 1.6,
  posterTime: 3.5,
  scrim: 0.3,

  params: {
    seed: { type: 'integer', min: 1, max: 9999, default: 7, doc: 'Seeds the clouds and the bars of the chart' },
    skyTop: { type: 'color', default: ({ theme }) => (theme.mode === 'dark' ? mix(theme.background, '#000000', 0.35) : '#5f9be0'), doc: 'The sky at the top of the hero. Default a clear blue (light) or a deeper night (dark)' },
    skyBottom: { type: 'color', default: ({ theme }) => theme.background, doc: 'The sky at the horizon. Default theme.background' },
    clouds: { type: 'number', min: 0, max: 1, default: 0.6, doc: 'How much of the sky is cloud; 0 is clear' },
    cloudColor: { type: 'color', default: ({ theme }) => (theme.mode === 'dark' ? mix(theme.background, '#b9b4d6', 0.32) : '#ffffff'), doc: 'Colour of the clouds' },
    drift: { type: 'number', min: 0, max: 1, default: 0.35, doc: 'How fast the clouds drift' },
    light: { type: 'enum', values: ['day', 'dusk'], default: ({ theme }) => (theme.mode === 'dark' ? 'dusk' : 'day'), doc: 'Midday sun from above, or a low warm sun and a cool sky light' },
    cloth: { type: 'color', default: '#ecebe6', doc: 'Colour of the cotton' },
    printInk: { type: 'color', default: '#15181d', doc: 'Colour of the print on the cloth' },
    printTitle: { type: 'text', max: 28, default: '', doc: 'The name at the top of the print, e.g. the product. Empty for none' },
    printLine: { type: 'text', max: 64, default: '', doc: 'One small line under the name' },
    printHeadline: { type: 'text', max: 48, default: '', doc: 'The big words on the print; \\n breaks the line (two lines read best)' },
    printSpecs: {
      type: 'list',
      min: 0,
      max: 6,
      default: [],
      doc: 'A spec column on the right of the print: label and value, e.g. { "label": "Release", "value": "2.0" }',
      item: { label: { type: 'text', max: 12, required: true }, value: { type: 'text', max: 14, required: true } },
    },
    printChart: { type: 'boolean', default: true, doc: 'A small bar chart under the specs, its tallest bar in theme.accent' },
    printChartLabel: { type: 'text', max: 32, default: '', doc: 'Caption under the chart' },
    printFoot: { type: 'text', max: 40, default: '', doc: 'Small text in the bottom corner of the print, e.g. a web address' },
    aspect: { type: 'number', min: 0.8, max: 1.7, default: 1.35, doc: 'Width of the cloth over its height' },
    pegs: { type: 'integer', min: 2, max: 6, default: 4, doc: 'Wooden pegs holding the top edge' },
    peg: { type: 'color', default: '#c39a64', doc: 'Colour of the pegs' },
    rope: { type: 'color', default: ({ theme }) => (theme.mode === 'dark' ? '#cfc6b8' : '#6f6a62'), doc: 'Colour of the line' },
    breeze: { type: 'number', min: 0, max: 1, default: 0.45, doc: 'How hard the breeze lifts the cloth' },
    weave: { type: 'number', min: 0, max: 1, default: 0.5, doc: 'How strongly the plain weave shows up close' },
    poke: { type: 'number', min: 0, max: 1, default: 1, doc: 'How deep the dimple under the pointer is; 0 turns it off' },
    drag: { type: 'boolean', default: true, doc: 'Let visitors grab the cloth and pull it' },
    size: { type: 'number', min: 0.6, max: 1, default: 0.76, doc: 'How much of the stage the cloth fills' },
    hint: { type: 'text', max: 40, default: 'Press it · pull it · let go', doc: 'A small caption in the far bottom corner on wide screens telling visitors they can touch it. " · " separates its parts; empty for none' },
  },

  check(p, theme, problems) {
    const c = contrast(p.printInk, p.cloth)
    if (c < 7) problems.push(`effect.printInk ${p.printInk} is ${c.toFixed(1)}:1 on effect.cloth ${p.cloth}; the print needs 7:1 (try ${readable(p.printInk, [p.cloth], 7.2)})`)
    const s = contrast(p.cloth, p.skyBottom)
    if (s < 1.15 && contrast(p.cloth, p.skyTop) < 1.15) problems.push(`effect.cloth ${p.cloth} is the colour of the sky; pick a cloth that stands out from it`)
    if (!p.printTitle && !p.printHeadline) problems.push('effect.printTitle or effect.printHeadline: the cloth needs something printed on it')
  },

  /** What can sit behind the copy: the sky from top to horizon, and a cloud. */
  grounds(p) {
    return [p.skyTop, mix(p.skyTop, p.skyBottom, 0.5), p.skyBottom, mix(mix(p.skyTop, p.skyBottom, 0.6), p.cloudColor, 0.7 * Math.min(1, p.clouds + 0.2))]
  },

  notes(p) {
    const n = []
    if (p.printHeadline.length > 30 && !p.printHeadline.includes('\\n') && !p.printHeadline.includes('\n')) n.push('a long print headline on one line: add a \\n to break it')
    if (!p.drag && !p.poke) n.push('drag and poke are both off: the cloth only moves in the breeze')
    return n
  },

  /** Shown until the first frame and whenever the effect can't run: the sky, the line and the cloth, flat. */
  still(p, theme) {
    const W = 1600
    const H = 900
    const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="wl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.skyTop}"/><stop offset="1" stop-color="${p.skyBottom}"/></linearGradient><filter id="wl-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="38"/></filter></defs><rect width="${W}" height="${H}" fill="url(#wl-sky)"/><g fill="${p.cloudColor}" opacity="${(0.35 + 0.5 * p.clouds).toFixed(2)}" filter="url(#wl-blur)"><ellipse cx="1260" cy="560" rx="260" ry="120"/><ellipse cx="300" cy="640" rx="220" ry="90"/><ellipse cx="900" cy="760" rx="300" ry="90"/></g></svg>`
    const cw = 1000
    const ch = Math.round(cw / p.aspect)
    const x0 = 0
    const y0 = 1000 - ch
    const fs = (k) => Math.round(ch * k)
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const head = p.printHeadline.replace(/\\n/g, '\n').split('\n')
    const pegs = Array.from({ length: p.pegs }, (_, i) => x0 + 30 + (i * (cw - 60)) / (p.pegs - 1))
    const object = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="M-2000 ${y0 - 6} Q500 ${y0 + 4} 3000 ${y0 - 30}" stroke="${p.rope}" stroke-width="4" fill="none"/><rect x="${x0}" y="${y0}" width="${cw}" height="${ch}" fill="${p.cloth}"/><g fill="${p.printInk}" font-family="system-ui,sans-serif">${p.printTitle ? `<text x="${x0 + 60}" y="${y0 + fs(0.2)}" font-size="${fs(0.085)}" font-weight="600">${esc(p.printTitle)}</text>` : ''}${head.map((l, i) => `<text x="${x0 + 60}" y="${y0 + fs(0.6 + i * 0.13)}" font-size="${fs(0.115)}" font-weight="600">${esc(l)}</text>`).join('')}</g>${pegs.map((x) => `<rect x="${x - 7}" y="${y0 - 34}" width="14" height="64" rx="3" fill="${p.peg}"/>`).join('')}</svg>`
    return { backdrop, object }
  },

  markup(p, theme, h) {
    if (!p.hint) return null
    const parts = p.hint.split(' · ')
    return h('p', { class: 'wl-hint' }, h('i', { 'aria-hidden': 'true' }), ...parts.flatMap((s, i) => (i ? [h('b', { 'aria-hidden': 'true' }, '/'), h('span', null, s)] : [h('span', null, s)])))
  },

  css: readFileSync(here('./effect.css'), 'utf8'),
}
