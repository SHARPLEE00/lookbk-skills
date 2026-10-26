// Editorial OG Card: fills the card from window.CARD, picks readable
// colours, draws the art and shrinks the headline until it fits. Sets
// html[data-ready] when the card is finished.
;(function () {
  var c = window.CARD
  var $ = function (id) {
    return document.getElementById(id)
  }
  var card = $('card')

  // ---------- Colour ----------
  function rgb(hex) {
    hex = String(hex).trim().replace('#', '')
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1')
    return [0, 2, 4].map(function (i) {
      return parseInt(hex.slice(i, i + 2), 16)
    })
  }
  function hex(v) {
    return (
      '#' +
      v
        .map(function (x) {
          return Math.round(x).toString(16).padStart(2, '0')
        })
        .join('')
    )
  }
  function mix(a, b, k) {
    var x = rgb(a)
    var y = rgb(b)
    return hex(
      x.map(function (v, i) {
        return v + (y[i] - v) * k
      }),
    )
  }
  // WCAG relative luminance and contrast ratio.
  function lum(color) {
    var l = rgb(color).map(function (v) {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
  }
  function contrast(a, b) {
    var x = lum(a)
    var y = lum(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  // Mixes a colour toward `toward` until it reads on `bg` at `min`:1.
  function readable(color, bg, toward, min) {
    for (var k = 0; k <= 10; k++) {
      var m = mix(color, toward, k / 10)
      if (contrast(m, bg) >= min) return m
    }
    return toward
  }

  var t = c.theme
  var light = lum(t.paper) > 0.4
  var colours = {
    paper: t.paper,
    ink: t.ink,
    accent: t.accent,
    // Accent as text: the accent itself when it reads, else nudged toward ink.
    'accent-text': readable(t.accent, t.paper, t.ink, 3),
    tint: mix(t.accent, t.paper, 0.72),
    panel: light ? '#ffffff' : mix(t.paper, t.ink, 0.1),
    mute: readable(mix(t.ink, t.paper, 0.45), t.paper, t.ink, 4.5),
    serif: t.serif,
    sans: t.sans,
    mono: t.mono,
  }
  for (var k in colours) card.style.setProperty('--' + k, colours[k])

  // ---------- Text ----------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
    })
  }
  $('title').innerHTML = esc(c.title)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\\n|\n/g, '<br>')
  $('kicker').textContent = c.kicker || ''
  $('topic').textContent = c.topic ? (c.kicker ? ' · ' : '') + c.topic : ''
  $('meta').textContent = c.meta || ''
  $('author').textContent = c.author || ''
  $('url').textContent = c.url || ''
  var av = $('avatar')
  if (c.avatar) av.innerHTML = '<img alt="" src="' + esc(c.avatar) + '">'
  else if (c.author)
    av.textContent = c.author
      .split(/\s+/)
      .slice(0, 2)
      .map(function (w) {
        return w.charAt(0)
      })
      .join('')
      .toUpperCase()
  else $('byline').style.display = 'none'

  // ---------- Art ----------
  // Four compositions in the 390×430 art box: [x, y, w, h, fill, shape, content].
  var LAYOUTS = [
    [
      [0, 0, 180, 180, 'accent'],
      [200, 0, 190, 86, 'ink'],
      [200, 94, 90, 86, 'tint'],
      [300, 94, 90, 86, 'panel'],
      [0, 200, 390, 120, 'panel', '', 'specimen'],
      [0, 340, 120, 90, 'ink', 'pill'],
      [140, 340, 250, 90, 'panel', '', 'bars'],
      [110, 150, 0, 0, 'tag', '', 'tag1'],
      [262, 62, 0, 0, 'tag', '', 'tag2'],
    ],
    [
      [0, 0, 390, 150, 'panel', '', 'specimen'],
      [0, 170, 120, 120, 'accent', 'circle'],
      [140, 170, 250, 120, 'ink', '', 'lines'],
      [0, 310, 250, 120, 'tint'],
      [270, 310, 120, 120, 'panel', '', 'bars'],
      [24, 268, 0, 0, 'tag', '', 'tag1'],
      [200, 400, 0, 0, 'tag', '', 'tag2'],
    ],
    [
      [0, 0, 250, 250, 'tint', 'circle'],
      [60, 60, 130, 130, 'accent', 'circle'],
      [270, 0, 120, 250, 'ink'],
      [0, 270, 390, 160, 'panel', '', 'specimen'],
      [150, 236, 0, 0, 'tag', '', 'tag1'],
      [220, 400, 0, 0, 'tag', '', 'tag2'],
    ],
    [
      [0, 0, 180, 430, 'accent'],
      [200, 0, 190, 190, 'panel', '', 'glyph'],
      [200, 210, 190, 100, 'ink', 'pill'],
      [200, 330, 190, 100, 'tint', '', 'bars'],
      [118, 172, 0, 0, 'tag', '', 'tag1'],
      [240, 296, 0, 0, 'tag', '', 'tag2'],
    ],
  ]
  function block(cell) {
    var el = document.createElement('div')
    var fill = cell[4]
    var what = cell[6]
    el.style.left = cell[0] + 'px'
    el.style.top = cell[1] + 'px'
    if (fill === 'tag') {
      var text = tags[what === 'tag1' ? 0 : 1]
      if (!text) return null
      el.className = 'tag'
      el.textContent = text
      return el
    }
    el.style.width = cell[2] + 'px'
    el.style.height = cell[3] + 'px'
    el.style.background = 'var(--' + fill + ')'
    el.className = [cell[5], what].filter(Boolean).join(' ')
    if (what === 'specimen')
      el.innerHTML =
        '<span>Aa</span><small>' +
        esc(c.topic || c.kicker || '') +
        '<br>' +
        esc(c.meta || '') +
        '</small>'
    else if (what === 'glyph')
      el.textContent = c.title.replace(/[^\p{L}\p{N}]/gu, '').charAt(0)
    else if (what === 'bars')
      el.innerHTML =
        '<i style="width:22px;height:22px;border-radius:6px;background:var(--accent)"></i>' +
        '<i style="width:60px;height:12px;background:var(--ink)"></i>' +
        '<i style="width:40px;height:12px;background:var(--tint)"></i>'
    else if (what === 'lines')
      el.innerHTML = '<i></i><i></i><i style="width:60%"></i>'
    return el
  }
  // Up to two small labels on the art; the topic as a hashtag by default.
  var tags =
    c.tags ||
    (c.topic ? ['#' + c.topic.toLowerCase().replace(/\s+/g, '-')] : [])
  var art = $('art')
  if (c.art === 'none') {
    card.classList.add('no-art')
    art.remove()
  } else if (c.art === 'image') {
    art.innerHTML =
      '<div class="photo"><img alt="" src="' + esc(c.image) + '"></div>'
  } else {
    // render.mjs picks the layout from the post, unless the card sets one.
    LAYOUTS[(c.layout || 1) - 1].forEach(function (cell) {
      var el = block(cell)
      if (el) art.appendChild(el)
    })
  }

  // ---------- Fit ----------
  // The headline shrinks 2 px at a time until it fits above the byline.
  function fit() {
    var title = $('title')
    var maxH = 330
    var size = parseFloat(getComputedStyle(title).fontSize)
    while (
      size > 48 &&
      (title.scrollHeight > maxH || title.scrollWidth > title.clientWidth + 1)
    ) {
      size -= 2
      title.style.fontSize = size + 'px'
    }
    document.documentElement.setAttribute('data-title-size', size)
  }
  var images = Array.prototype.map.call(document.images, function (img) {
    return img.complete
      ? Promise.resolve()
      : new Promise(function (ok) {
          img.onload = img.onerror = ok
        })
  })
  Promise.all(
    [document.fonts ? document.fonts.ready : Promise.resolve()].concat(images),
  ).then(function () {
    fit()
    document.documentElement.setAttribute('data-ready', '')
  })
})()
