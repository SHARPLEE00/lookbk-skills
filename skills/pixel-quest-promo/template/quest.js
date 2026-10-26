// Pixel Quest Promo: draws every frame of the film from the time alone. One
// GSAP tween runs a clock for 20 seconds and render(t) places the sprites,
// so any frame HyperFrames seeks to is the same every time. Art, font, palette
// and the beat map live in quest-art.js.
;(function () {
  var Q = window.QUEST
  var vars =
    window.__hyperframes && window.__hyperframes.getVariables
      ? window.__hyperframes.getVariables()
      : {}
  var $ = function (id) {
    return document.getElementById(id)
  }
  var css = getComputedStyle(document.documentElement)
  function get(key, fallback) {
    var v = vars[key]
    if (v == null) v = css.getPropertyValue('--' + key) || fallback
    v = String(v == null ? fallback : v).trim()
    return v || fallback
  }

  var A = 8 // screen pixels per art pixel
  var GROUND = 864 // top of the ground
  var HERO_Y = GROUND - 16 * A
  var B = Q.BEAT
  var snap = function (v) {
    return Math.round(v / A) * A
  }
  var V = {
    sky: get('sky', '#1b1446'),
    ink: get('ink', '#f4f1ff'),
    accent: get('accent', '#3fb950'),
    grass: get('grass', '#2c8c3c'),
  }
  var P = Q.palette(V)
  var heroName = get('hero', 'robot')
  var copy = {
    product: get('product', 'INKWELL'),
    subtitle: get('subtitle', ''),
    headline: get('headline', 'LEVEL UP'),
    subline: get('subline', ''),
    url: get('url', ''),
    cta: get('cta', 'PRESS START'),
  }
  var levels = [1, 2, 3].map(function (n) {
    return {
      n: n,
      name: get('level' + n + 'Name', 'STAGE ' + n),
      text: get('level' + n + 'Text', ''),
      item: get('level' + n + 'Item', 'star'),
    }
  })

  // ---------- helpers ----------
  function el(tag, cls, parent, id) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (id) e.id = id
    if (parent) parent.appendChild(e)
    return e
  }
  function place(e, x, y) {
    e.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'
  }
  function show(e, on) {
    e.style.opacity = on ? '1' : '0'
  }
  function sprite(parent, svgMarkup, label) {
    var s = el('span', 'sprite', parent)
    s.innerHTML = svgMarkup
    if (label) s.setAttribute('aria-label', label)
    return s
  }
  // Text with hard drop shadows, each one art pixel (8 px) further down and
  // right, so big letters keep their counters open: the first shadow is
  // `shadow`, a second one (depth 2) is the outline colour.
  function text(parent, s, px, color, shadow, depth, bold) {
    depth = shadow ? depth || 1 : 0
    var off = Math.min(px, A)
    var e = el('span', 'sprite', parent)
    var html = ''
    for (var d = depth; d >= 1; d--)
      html +=
        '<span class="sprite" style="transform:translate(' + d * off + 'px,' + d * off + 'px)">' +
        Q.textSvg(s, px, d === 1 ? shadow : Q.K, null, 0, '', bold) +
        '</span>'
    e.innerHTML = html + '<span class="sprite">' + Q.textSvg(s, px, color, null, 0, '', bold) + '</span>'
    e.setAttribute('aria-label', Q.normalise(s))
    e.w = Q.textWidth(s, bold) * px + depth * off
    e.h = 7 * px + depth * off
    e.style.width = e.w + 'px'
    e.style.height = e.h + 'px'
    return e
  }
  // Largest pixel size (in steps of 4) at which s fits in `width`.
  function fitPx(s, width, max, min, bold) {
    for (var px = max; px > min; px -= 4) if (Q.textWidth(s, bold) * px + 2 * A <= width) return px
    return min
  }
  function rng(seed) {
    var s = seed >>> 0
    return function () {
      s = (s + 0x6d2b79f5) >>> 0
      var t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  function blank(w, h) {
    var rows = []
    for (var y = 0; y < h; y++) rows.push(Array(w + 1).join('.').split(''))
    return rows
  }
  function join(rows) {
    return rows.map(function (r) {
      return r.join('')
    })
  }
  function fillRect(g, x0, y0, w, h, c) {
    for (var y = Math.max(0, y0); y < Math.min(g.length, y0 + h); y++)
      for (var x = Math.max(0, x0); x < Math.min(g[0].length, x0 + w); x++) g[y][x] = c
  }
  function fillCircle(g, cx, cy, r, c) {
    for (var y = Math.floor(cy - r); y <= cy + r; y++)
      for (var x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r && y >= 0 && y < g.length) {
          var xx = ((x % g[0].length) + g[0].length) % g[0].length
          g[y][xx] = c
        }
  }
  // A strip repeated `times` across, as one wide SVG.
  function strip(rows, colors, times) {
    var wide = rows.map(function (r) {
      return Array(times + 1).join(r)
    })
    return Q.gridSvg(wide, colors, A)
  }

  // ---------- scenery, per scene ----------
  function farRows(land) {
    var W = 120
    var H = 60
    var g = blank(W, H)
    if (land === 'peaks') {
      ;[
        [28, 52],
        [86, 44],
        [60, 30],
      ].forEach(function (pk) {
        for (var x = 0; x < W; x++) {
          var d = Math.min(Math.abs(x - pk[0]), W - Math.abs(x - pk[0]))
          var top = H - pk[1] + d
          for (var y = Math.max(0, top); y < H; y++) g[y][x] = y < H - pk[1] + 7 + (d % 3) ? 'W' : 'F'
        }
      })
    } else {
      for (var x2 = 0; x2 < W; x2++) {
        var h =
          18 +
          10 * Math.sin((2 * Math.PI * x2) / W) +
          5 * Math.sin((2 * Math.PI * 3 * x2) / W + 1.3)
        h = Math.round(h)
        for (var y2 = H - h; y2 < H; y2++) g[y2][x2] = y2 === H - h ? 'L' : 'F'
      }
      if (land === 'castle') {
        var cx = 34
        fillRect(g, cx, 22, 52, 38, 'F')
        for (var m2 = 0; m2 < 10; m2++) fillRect(g, cx + m2 * 5 + 1, 19, 3, 3, 'F')
        for (var t = 0; t < 4; t++) {
          fillRect(g, cx - 4 + t * 17, 10, 12, 50, 'F')
          for (var m = 0; m < 3; m++) fillRect(g, cx - 4 + t * 17 + m * 5, 7, 3, 3, 'F')
          fillRect(g, cx + t * 17 + 1, 15, 2, 4, 'A')
        }
        fillRect(g, cx + 22, 44, 8, 16, 'K')
        fillRect(g, cx + 23, 42, 6, 2, 'K')
        fillRect(g, cx + 9, 30, 3, 4, 'A')
        fillRect(g, cx + 40, 30, 3, 4, 'A')
      }
    }
    return join(g)
  }
  function nearRows(land) {
    var W = 80
    var H = 24
    var g = blank(W, H)
    if (land === 'peaks') {
      ;[8, 30, 44, 66].forEach(function (x, i) {
        var h = 16 + (i % 2) * 5
        for (var y = 0; y < h; y++) {
          var half = Math.floor(y / 2) + 1
          fillRect(g, x - half, H - h + y, half * 2, 1, y % 5 === 4 ? 'D' : 'N')
        }
        fillRect(g, x - 1, H - 3, 2, 3, 'K')
      })
    } else if (land === 'castle') {
      for (var x = 0; x < W; x += 4) fillRect(g, x, H - 9, 2, 9, 'N')
      fillRect(g, 0, H - 8, W, 2, 'N')
      fillRect(g, 0, H - 4, W, 1, 'N')
      ;[20, 60].forEach(function (tx) {
        fillRect(g, tx, H - 16, 2, 16, 'D')
        fillRect(g, tx - 1, H - 19, 4, 3, 'A')
        fillRect(g, tx, H - 21, 2, 2, 'Y')
      })
    } else {
      ;[
        [10, 7],
        [17, 9],
        [24, 6],
        [52, 8],
        [60, 6],
      ].forEach(function (b) {
        fillCircle(g, b[0], H - 1, b[1], 'N')
        fillCircle(g, b[0] - 2, H - 3, Math.max(2, b[1] - 4), 'D')
      })
    }
    return join(g)
  }
  function groundRows() {
    var g = blank(16, 32)
    fillRect(g, 0, 0, 16, 32, 'd')
    fillRect(g, 0, 0, 16, 1, 'h')
    fillRect(g, 0, 1, 16, 2, 'g')
    for (var x = 0; x < 16; x += 2) g[3][x] = 'G'
    g[3][5] = 'G'
    for (var y = 4; y < 32; y++) {
      if (y % 7 === 3) fillRect(g, 0, y, 16, 1, 'D')
      var col = Math.floor((y - 4) / 7) % 2 ? 4 : 12
      if (y % 7 !== 3) g[y][col] = 'D'
    }
    g[9][2] = g[16][9] = g[23][13] = g[27][6] = 'D'
    return join(g)
  }
  function cloudRows() {
    var g = blank(160, 22)
    ;[
      [20, 10, 6],
      [28, 8, 8],
      [37, 11, 5],
      [96, 13, 5],
      [104, 11, 7],
      [112, 13, 5],
    ].forEach(function (c) {
      fillCircle(g, c[0], c[1], c[2], 'C')
    })
    for (var x = 0; x < 160; x++) {
      if (g[14][x] === 'C') g[14][x] = 'c'
      if (g[16] && g[16][x] === 'C') g[16][x] = 'c'
    }
    return join(g)
  }
  function moonRows() {
    var g = blank(20, 20)
    fillCircle(g, 9.5, 9.5, 9.5, 'M')
    fillCircle(g, 6, 7, 2, 'm')
    fillCircle(g, 12, 13, 2.4, 'm')
    fillCircle(g, 13, 5, 1.2, 'm')
    return join(g)
  }

  var sceneEls = {}
  function buildScene(id, host) {
    var s = P.scenes[id]
    var wrap = el('span', 'scene', host, 'sc-' + id)
    var sky = el('span', 'sky', wrap)
    sky.style.background = s.sky
    var parts = { wrap: wrap }
    if (s.night) {
      var r = rng(id.length * 97 + 3)
      var stars = blank(240, 100)
      var twinkle = blank(240, 100)
      for (var i = 0; i < 90; i++) {
        var x = Math.floor(r() * 240)
        var y = 12 + Math.floor(r() * 80)
        ;(i % 3 ? stars : twinkle)[y][x] = 'S'
      }
      sprite(wrap, Q.gridSvg(join(stars), { S: Q.mix(V.ink, s.sky, 0.35) }, A))
      parts.twinkle = sprite(wrap, Q.gridSvg(join(twinkle), { S: V.ink }, A))
      var moon = sprite(wrap, Q.gridSvg(moonRows(), { M: '#fff4c9', m: '#e8d79a' }, A))
      place(moon, 1704, 120)
    } else {
      // Distant clouds, kept faint so the stage name reads over them.
      parts.clouds = sprite(wrap, strip(cloudRows(), { C: Q.mix(s.sky, '#ffffff', 0.3), c: Q.mix(s.sky, '#ffffff', 0.2) }, 3))
    }
    parts.far = sprite(
      wrap,
      strip(farRows(s.land), { F: s.far, L: Q.mix(s.far, '#ffffff', 0.12), W: Q.mix(s.far, '#ffffff', 0.7), A: V.accent, K: Q.mix(s.sky, '#000000', 0.5) }, 3),
    )
    parts.near = sprite(
      wrap,
      strip(nearRows(s.land), { N: s.near, D: Q.mix(s.near, '#000000', 0.25), A: Q.mix(s.near, '#ffffff', 0.2), Y: '#ffd23f', K: Q.mix(s.near, '#000000', 0.5) }, 4),
    )
    parts.ground = sprite(
      wrap,
      strip(groundRows(), { h: s.groundLight, g: s.ground, G: s.groundDark, d: s.dirt, D: s.dirtDark }, 17),
    )
    sceneEls[id] = parts
  }

  // ---------- events on the beat grid ----------
  function levelStart(n) {
    return Q.SCENES[n].start
  }
  // Hero x inside a level (u = seconds since the level's downbeat).
  function heroX(u) {
    if (u < 2 * B) return -128 + (576 * u) / (2 * B) // runs in over two beats
    return 448 + 192 * Math.min(u - 2 * B, 4 * B) // then walks while the world scrolls
  }
  var SPEED = 192 // world scroll, px per second, while the level runs
  function scrollAt(u) {
    return SPEED * Math.min(Math.max(u, 0), Q.LEVEL.stop * B)
  }
  var coinsWorld = Q.LEVEL.coins.map(function (beat) {
    var u = beat * B
    return heroX(u) + 64 + scrollAt(u) - 32
  })
  var hitU = Q.LEVEL.hit * B
  var blockWorld = heroX(hitU) + scrollAt(hitU)

  // Score and coins collected by time t.
  function tally(t) {
    var score = 0
    var coins = 0
    for (var n = 1; n <= 3; n++) {
      var L0 = levelStart(n)
      Q.LEVEL.coins.forEach(function (beat) {
        if (t >= L0 + beat * B) {
          score += 100
          coins++
        }
      })
      if (t >= L0 + hitU) score += 1000
    }
    return { score: score, coins: coins }
  }
  function pad(n, w) {
    var s = String(n)
    while (s.length < w) s = '0' + s
    return s
  }

  // ---------- build ----------
  function build() {
    var scenesHost = $('scenes')
    Q.SCENES.forEach(function (s) {
      buildScene(s.id, scenesHost)
    })

    // World: coins, the block, power-ups, pops, the hero, fireworks.
    var world = $('world')
    var coinEls = Q.LEVEL.coins.map(function () {
      return Q.COIN.map(function (frame) {
        return sprite(world, Q.gridSvg(frame, Object.assign({ K: Q.K }, Q.COIN_COLORS), A))
      })
    })
    var blockGlyph = Q.FONT['?']
    function blockRows(used) {
      var g = blank(16, 16)
      fillRect(g, 0, 0, 16, 16, 'K')
      fillRect(g, 1, 1, 14, 14, used ? 'u' : 'q')
      fillRect(g, 1, 1, 14, 1, used ? 'u' : 'w')
      fillRect(g, 1, 1, 1, 14, used ? 'u' : 'w')
      fillRect(g, 2, 14, 13, 1, 'd')
      fillRect(g, 14, 2, 1, 13, 'd')
      ;[
        [2, 2],
        [13, 2],
        [2, 13],
        [13, 13],
      ].forEach(function (p) {
        g[p[1]][p[0]] = 'K'
      })
      if (!used)
        for (var y = 0; y < 7; y++)
          for (var x = 0; x < 5; x++)
            if (blockGlyph[y][x] === '#') {
              g[y + 5][x + 6] = 'd'
              g[y + 4][x + 5] = 'w'
            }
      return join(g)
    }
    var blockCols = { K: Q.K, q: '#e8a33d', w: '#ffe2a8', d: '#9b5a17', u: '#8a5a33' }
    // Bricks either side of the ? block, as in every platformer's first level.
    var brickGrid = blank(16, 16)
    fillRect(brickGrid, 0, 0, 16, 16, 'm')
    for (var by = 0; by < 16; by += 4) {
      var shift = (by / 4) % 2 ? 4 : 0
      for (var bx = -8; bx < 16; bx += 8) fillRect(brickGrid, bx + shift + 1, by + 1, 7, 3, 'b')
      for (var hx = -8; hx < 16; hx += 8) fillRect(brickGrid, hx + shift + 1, by + 1, 7, 1, 'l')
    }
    fillRect(brickGrid, 0, 0, 16, 1, 'K')
    fillRect(brickGrid, 0, 15, 16, 1, 'K')
    var brickSvg = Q.gridSvg(join(brickGrid), { K: Q.K, m: '#4a1d10', b: '#b5562a', l: '#e08a52' }, A)
    var bricks = [-256, -128, 128].map(function (dx) {
      var e = sprite(world, brickSvg)
      e.dx = dx
      return e
    })
    var block = sprite(world, Q.gridSvg(blockRows(false), blockCols, A), 'question block')
    var used = sprite(world, Q.gridSvg(blockRows(true), blockCols, A))
    var items = levels.map(function (L) {
      var rows = Q.ITEMS[L.item] || Q.ITEMS.star
      return sprite(world, Q.gridSvg(rows, Object.assign({ K: Q.K }, Q.ITEM_COLORS), A), L.item)
    })
    var hc = Object.assign({ K: Q.K, A: V.accent }, Q.HERO_COLORS[heroName] || Q.HERO_COLORS.robot)
    var poses = {}
    ;['idle', 'walkA', 'walkB', 'jump'].forEach(function (p) {
      poses[p] = sprite(world, Q.gridSvg(Q.hero(heroName, p), hc, A), 'hero')
    })
    var pop100 = text(world, '+100', 6, V.ink, P.textShadow)
    var pop1000 = text(world, '+1000', 6, '#ffd23f', Q.K)
    var sparks = [0, 1, 2].map(function (k) {
      var g = blank(52, 52)
      for (var i = 0; i < 12; i++) {
        var a = (i * Math.PI) / 6
        for (var d = 0; d < 3; d++) {
          var rr = 6 + d * 5 + k * 7
          var x = Math.round(25 + Math.cos(a) * rr)
          var y = Math.round(25 + Math.sin(a) * rr)
          if (k === 2 && d === 0) continue
          fillRect(g, x, y, 2, 2, d === 2 ? 'W' : i % 2 ? 'A' : 'Y')
        }
      }
      return sprite(world, Q.gridSvg(join(g), { A: V.accent, Y: '#ffd23f', W: '#ffffff' }, A))
    })

    // UI: HUD, title, stage banners, dialog, ending.
    var ui = $('ui')
    var hudShadow = P.textShadow
    var hud = {
      scoreLabel: text(ui, 'SCORE', 6, V.ink, hudShadow),
      coinIcon: sprite(ui, Q.gridSvg(Q.COIN[0], Object.assign({ K: Q.K }, Q.COIN_COLORS), 4)),
      worldLabel: text(ui, 'WORLD', 6, V.ink, hudShadow),
      timeLabel: text(ui, 'TIME', 6, V.ink, hudShadow),
    }
    place(hud.scoreLabel, 64, 40)
    place(hud.coinIcon, 760, 40)
    place(hud.worldLabel, 1120, 40)
    place(hud.timeLabel, 1580, 40)
    var cache = {}
    function dyn(key, s, px, color, x, y) {
      var e = cache[key]
      if (!e) {
        e = cache[key] = el('span', 'sprite', ui)
        e.value = null
      }
      if (e.value !== s) {
        e.innerHTML = Q.textSvg(s, px, color, hudShadow, 1)
        e.setAttribute('aria-label', s)
        e.value = s
      }
      place(e, x, y)
      return e
    }

    // Title screen, stacked from the top: logo, subtitle, prompt.
    var logoPx = fitPx(copy.product, 1400, 28, 12, true)
    var logo = text(ui, copy.product, logoPx, V.accent, P.accentDark, 2, true)
    place(logo, snap((1920 - logo.w) / 2), 176)
    var titleY = 176 + logo.h + 48
    var subtitle = copy.subtitle ? text(ui, copy.subtitle, 8, V.ink, P.textShadow) : null
    if (subtitle) {
      place(subtitle, snap((1920 - subtitle.w) / 2), titleY)
      titleY += subtitle.h + 56
    }
    var press = text(ui, copy.cta, 8, V.ink, P.textShadow)
    place(press, snap((1920 - press.w) / 2), Math.max(titleY, 576))

    var banners = levels.map(function (L) {
      var stage = text(ui, 'STAGE ' + L.n, 6, V.accent, P.textShadow)
      var name = text(ui, L.name, 12, V.ink, P.textShadow, 1)
      place(stage, snap((1920 - stage.w) / 2), 128)
      return { stage: stage, name: name }
    })
    var dialog = el('span', 'dialog', ui)
    dialog.style.background = P.panel
    dialog.style.borderColor = V.ink
    var dialogText = el('span', 'sprite', dialog)
    dialogText.typed = null

    // Ending, stacked from the top: headline, subline, prompt, link.
    var headPx = fitPx(copy.headline, 1400, 28, 12, true)
    var headline = text(ui, copy.headline, headPx, V.accent, P.accentDark, 2, true)
    var subline = copy.subline ? text(ui, copy.subline, fitPx(copy.subline, 1600, 12, 6), V.ink, P.textShadow) : null
    var endPress = text(ui, copy.cta, 8, V.ink, P.textShadow)
    var urlEl = copy.url ? text(ui, copy.url, 6, V.ink, P.textShadow) : null
    var yCursor = 152
    place(headline, snap((1920 - headline.w) / 2), yCursor)
    yCursor += headline.h + 40
    if (subline) {
      place(subline, snap((1920 - subline.w) / 2), yCursor)
      yCursor += subline.h + 48
    }
    place(endPress, snap((1920 - endPress.w) / 2), yCursor)
    yCursor += endPress.h + 24
    if (urlEl) place(urlEl, snap((1920 - urlEl.w) / 2), yCursor)

    // The pixel wipe: 16×9 squares, covering then uncovering on the diagonal.
    $('wipe').innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" shape-rendering="crispEdges"><path fill="' +
      Q.K +
      '" d=""/></svg>'
    var wipe = $('wipe').querySelector('path')

    // ---------- one frame ----------
    function render(t) {
      var sceneIdx = 0
      for (var i = 0; i < Q.SCENES.length; i++) if (t >= Q.SCENES[i].start) sceneIdx = i
      var scene = Q.SCENES[sceneIdx]
      var u = t - scene.start
      var beat = Math.floor(t / B)
      var onBeat = t / B - beat < 0.5 // first half of every beat

      // Scenery.
      Q.SCENES.forEach(function (s, k) {
        show(sceneEls[s.id].wrap, k === sceneIdx)
      })
      var parts = sceneEls[scene.id]
      var isLevel = sceneIdx >= 1 && sceneIdx <= 3
      var scroll = isLevel ? scrollAt(u) : t * 48
      place(parts.far, -snap((scroll * 0.25) % 960), GROUND - 60 * A)
      place(parts.near, -snap((scroll * 0.5) % 640), GROUND - 24 * A)
      place(parts.ground, -snap(scroll % 128), GROUND)
      if (parts.clouds) place(parts.clouds, -snap((t * 24) % 1280), 136)
      if (parts.twinkle) show(parts.twinkle, beat % 2 === 0)

      // Hero.
      var hx = 896
      var hy = HERO_Y
      var pose = 'idle'
      var walkFrame = Math.floor(t / (B / 2)) % 2 ? 'walkA' : 'walkB'
      if (sceneIdx === 0) {
        hy = HERO_Y - (onBeat ? 0 : A)
      } else if (isLevel) {
        hx = heroX(u)
        var jumpU = Q.LEVEL.jump * B
        if (u >= jumpU && u < jumpU + B) {
          var k = (u - jumpU) / B
          hy = HERO_Y - Math.sin(Math.PI * k) * 128
          pose = 'jump'
        } else if (u < Q.LEVEL.stop * B) pose = walkFrame
        else {
          hx = heroX(Q.LEVEL.stop * B)
          // A little hop on beat 7 when the power-up is out.
          var hop = (u - 7 * B) / (B / 2)
          if (hop >= 0 && hop < 1) {
            hy = HERO_Y - Math.sin(Math.PI * hop) * 48
            pose = 'jump'
          }
        }
      } else {
        // Ending: off to the right of the copy, jumping on END.jumps.
        hx = 1560
        var eb = u / B
        Q.END.jumps.forEach(function (j) {
          if (eb >= j && eb < j + 1) {
            hy = HERO_Y - Math.sin(Math.PI * (eb - j)) * 144
            pose = 'jump'
          }
        })
      }
      for (var p in poses) show(poses[p], p === pose)
      place(poses[pose], snap(hx), snap(hy))

      // Coins, block, power-up and pops (levels only).
      var lev = isLevel ? levels[sceneIdx - 1] : null
      var sc = isLevel ? scrollAt(u) : 0
      coinEls.forEach(function (frames, c) {
        var got = isLevel && u >= Q.LEVEL.coins[c] * B
        var f = Math.floor(t * 8 + c) % 4
        f = f === 3 ? 1 : f
        frames.forEach(function (e, fi) {
          show(e, isLevel && !got && fi === f)
          place(e, snap(coinsWorld[c] - sc), 704 - (onBeat ? 0 : A))
        })
      })
      var hit = isLevel && u >= hitU
      var bump = isLevel && u >= hitU && u < hitU + 0.12 ? -16 : 0
      bricks.forEach(function (e) {
        show(e, isLevel)
        place(e, snap(blockWorld - sc + e.dx), 480)
      })
      show(block, isLevel && !hit)
      show(used, isLevel && hit)
      place(block, snap(blockWorld - sc), 480)
      place(used, snap(blockWorld - sc), 480 + bump)
      items.forEach(function (e, k) {
        var on = isLevel && k === sceneIdx - 1 && hit
        show(e, on)
        if (on) {
          var rise = Math.min(1, (u - hitU) / 0.3)
          var bob = u > hitU + 0.3 && !onBeat ? -A : 0
          place(e, snap(blockWorld - sc + 16), snap(480 - 96 * rise - 8 + bob))
        }
      })
      var lastCoin = -1
      if (isLevel)
        Q.LEVEL.coins.forEach(function (beat, c) {
          if (u >= beat * B && u < beat * B + 0.4) lastCoin = c
        })
      show(pop100, lastCoin >= 0)
      if (lastCoin >= 0) {
        var pu = u - Q.LEVEL.coins[lastCoin] * B
        place(pop100, snap(coinsWorld[lastCoin] - sc - 24), snap(640 - pu * 160))
      }
      var showK = isLevel && u >= hitU && u < hitU + 0.7
      show(pop1000, showK)
      if (showK) place(pop1000, snap(blockWorld - sc - 8), snap(400 - (u - hitU) * 120))

      // Fireworks on the ending's beats.
      sparks.forEach(function (e) {
        show(e, false)
      })
      if (sceneIdx === 4) {
        Q.END.fireworks.forEach(function (fb, n) {
          var d = (u - fb * B) / (B * 1.5)
          if (d >= 0 && d < 1) {
            var stage = Math.min(2, Math.floor(d * 3))
            var pos = [
              [64, 300],
              [1432, 104],
              [216, 520],
            ][n]
            show(sparks[stage], true)
            place(sparks[stage], pos[0], pos[1])
          }
        })
      }

      // HUD: always on, counting as you go.
      var tl0 = tally(t)
      dyn('score', pad(tl0.score, 6), 6, V.ink, 64 + 6 * 36, 40)
      dyn('coins', '×' + pad(tl0.coins, 2), 6, V.ink, 760 + 44, 40)
      var worldNo = sceneIdx === 0 ? '1-1' : sceneIdx === 4 ? 'CLEAR' : '1-' + sceneIdx
      dyn('world', worldNo, 6, V.ink, 1120 + 6 * 36, 40)
      var timeLeft = Math.max(0, 300 - Math.floor(Math.min(Math.max(t - 4, 0), 12) * 4))
      dyn('time', pad(timeLeft, 3), 6, V.ink, 1580 + 5 * 36, 40)

      // Title screen.
      show(logo, sceneIdx === 0)
      if (subtitle) show(subtitle, sceneIdx === 0)
      var pressed = t >= 6 * B
      show(press, sceneIdx === 0 && (pressed ? Math.floor(t * 8) % 2 === 0 : onBeat))

      // Stage banner and dialog.
      banners.forEach(function (bn, k) {
        var on = isLevel && k === sceneIdx - 1 && u >= Q.LEVEL.banner * B
        show(bn.stage, on)
        show(bn.name, on)
        if (on) {
          var drop = Math.min(1, (u - Q.LEVEL.banner * B) / 0.25)
          place(bn.name, snap((1920 - bn.name.w) / 2), snap(184 - (1 - drop) * 120))
        }
      })
      var typing = isLevel && lev && lev.text && u >= Q.LEVEL.type * B
      show(dialog, typing)
      if (typing) {
        var full = Q.normalise(lev.text)
        var n = Math.min(full.length, Math.floor(((u - Q.LEVEL.type * B) / (Q.LEVEL.typeBeats * B)) * full.length) + 1)
        var shown = full.slice(0, n)
        var key = sceneIdx + ':' + shown
        if (dialogText.typed !== key) {
          dialogText.innerHTML = Q.textSvg(shown, 6, V.ink, null)
          dialogText.typed = key
        }
        var boxW = Q.textWidth(full) * 6 + 96
        dialog.style.width = boxW + 'px'
        place(dialog, snap((1920 - boxW) / 2), 912)
      }

      // Ending.
      var endOn = sceneIdx === 4
      show(headline, endOn && u >= 0.25)
      if (subline) show(subline, endOn && u >= B)
      show(endPress, endOn && u >= 2 * B && onBeat)
      if (urlEl) show(urlEl, endOn && u >= 2 * B)

      // The wipe between scenes: a quarter second to cover, a quarter to open.
      var cover = 0
      for (var w = 1; w < Q.SCENES.length; w++) {
        var at = Q.SCENES[w].start
        if (t >= at - 0.25 && t < at) cover = (t - (at - 0.25)) / 0.25
        else if (t >= at && t < at + 0.25) cover = -(t - at) / 0.25
      }
      var d = ''
      if (cover !== 0) {
        var frame = Math.floor(Math.abs(cover) * 6) / 6
        for (var gy = 0; gy < 9; gy++)
          for (var gx = 0; gx < 16; gx++) {
            var keyD = (gx + gy) / 23
            var on2 = cover > 0 ? keyD <= frame + 1 / 6 : keyD > frame
            if (on2) d += 'M' + gx * 120 + ' ' + gy * 120 + 'h120v120h-120z'
          }
      }
      wipe.setAttribute('d', d)
    }

    var clock = { t: 0 }
    var tl = gsap.timeline({ paused: true })
    tl.fromTo(
      clock,
      { t: 0 },
      {
        t: Q.DURATION,
        duration: Q.DURATION,
        ease: 'none',
        onUpdate: function () {
          render(clock.t)
        },
      },
      0,
    )
    render(0)
    return tl
  }
  window.buildQuest = build
})()
