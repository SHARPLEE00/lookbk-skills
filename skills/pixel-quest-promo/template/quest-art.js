// Pixel Quest Promo: the art, the font, the palette and the beat map, as plain
// data and pure functions. quest.js draws the film from it in the browser;
// scripts/preflight.mjs and scripts/cues.mjs read the same file in Node, so
// the checks and the cue sheet always match what renders.
;(function (root) {
  // ---------- the beat grid ----------
  // 120 BPM, 4/4: a beat every 0.5 s, a bar every 2 s, 10 bars in 20 s.
  // Every cut, jump, pickup and blink below lands on this grid.
  var BPM = 120
  var BEAT = 60 / BPM
  var DURATION = 20
  // Scenes start on bar lines. Each level is two bars.
  var SCENES = [
    { id: 'title', start: 0, end: 4 },
    { id: 'l1', start: 4, end: 8 },
    { id: 'l2', start: 8, end: 12 },
    { id: 'l3', start: 12, end: 16 },
    { id: 'end', start: 16, end: 20 },
  ]
  // Inside a level, in beats from its first downbeat.
  var LEVEL = {
    banner: 0.25, // stage name drops in
    type: 1, // feature line starts typing
    typeBeats: 2, // ...and takes two beats
    walkIn: [0, 2], // hero walks in, then the world scrolls
    coins: [2, 3, 4], // hero runs through three coins
    jump: 5, // takes off on beat 5, hits the block on the "and"
    hit: 5.5,
    stop: 6, // world stops scrolling; the power-up hovers
    wipe: 7.5, // pixel wipe to the next scene, centred on the bar line
  }
  var END = { fireworks: [1, 3, 5], jumps: [2, 4, 6] }

  // ---------- 5×7 pixel font ----------
  var F = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
    ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
    '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
    '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
    '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
    '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
    '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
    ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
    $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
    '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
    '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    '×': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  }
  // Typographic variants people paste, mapped onto the glyphs above.
  var ALIAS = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '.', '•': '·' }
  function normalise(s) {
    return String(s)
      .toUpperCase()
      .replace(/[’‘“”–—…•]/g, function (c) {
        return ALIAS[c]
      })
  }
  /** Characters in s that the font cannot draw. */
  function unsupported(s) {
    var bad = []
    Array.from(normalise(s)).forEach(function (c) {
      if (!F[c] && bad.indexOf(c) < 0) bad.push(c)
    })
    return bad
  }
  /**
   * Width of a line in font pixels: 5 wide + 1 gap per glyph, no trailing
   * gap. Bold glyphs (logo and headline) are 6 wide.
   */
  function textWidth(s, bold) {
    var n = Array.from(normalise(s)).length
    return n ? n * (bold ? 7 : 6) - 1 : 0
  }
  // Bold: every stroke doubled to the right, for the big display lines.
  function boldRow(r) {
    var out = ''
    for (var x = 0; x <= r.length; x++) out += r[x] === '#' || r[x - 1] === '#' ? '#' : '.'
    return out
  }

  // ---------- sprites (16×16 heroes, 12×12 power-ups, 8×12 coins) ----------
  var K = '#0d0a1f'
  var HERO_TOP = {
    robot: [
      '......KAAK......',
      '.......KK.......',
      '...KKKKKKKKKK...',
      '...KGGGGGGGGK...',
      '...KGKKKKKKGK...',
      '...KGKWKKWKGK...',
      '...KGKKKKKKGK...',
      '...KGGGGGGGGK...',
      '....KKKKKKKK....',
      '..KKAAAAAAAAKK..',
      '.KGKAAWWWWAAKGK.',
      '.KGKAAWDDWAAKGK.',
      '.KKKAAAAAAAAKKK.',
    ],
    cat: [
      '...KK......KK...',
      '..KOOK....KOOK..',
      '..KOOOKKKKOOOK..',
      '..KOOOOOOOOOOK..',
      '..KOWKOOOOWKOK..',
      '..KOOOOPPOOOOK..',
      '..KOOOOOOOOOOK..',
      '...KKOOOOOOKK...',
      '....KOOOOOOK...K',
      '...KOOWWWWOOK.KO',
      '...KOOWWWWOOKKOK',
      '...KOOOOOOOOOOK.',
      '...KOOOOOOOOK...',
    ],
    knight: [
      '........AA......',
      '.......AAA......',
      '....KKKKKKKK....',
      '...KGGGGGGGGK...',
      '...KGGGGGGGGK...',
      '...KKKKKKKKKK...',
      '...KGKWKKWKGK...',
      '...KGGGGGGGGK...',
      '....KKKKKKKK....',
      '..KKAAAAAAAAKK..',
      '.KGKAAWAAWAAKGK.',
      '.KGKAAAWWAAAKGK.',
      '.KKKGGGGGGGGKKK.',
    ],
  }
  // Legs are shared: L is the leg colour of each hero.
  var LEGS = {
    idle: ['...KLK....KLK...', '...KLK....KLK...', '...KKK....KKK...'],
    walkA: ['..KLK......KLK..', '.KLK........KLK.', '.KKK........KKK.'],
    walkB: ['....KLK..KLK....', '.....KLKKLK.....', '.....KKKKKK.....'],
    jump: ['..KLK......KLK..', '..KKK......KKK..', '................'],
  }
  var HERO_COLORS = {
    robot: { G: '#b9c2dc', D: '#59617f', W: '#eaf6ff', L: '#59617f' },
    cat: { O: '#f2a541', P: '#ff8fa3', W: '#fff4e2', L: '#f2a541' },
    knight: { G: '#c9cfdc', W: '#ffd8b0', L: '#7b8297' },
  }
  function hero(name, pose) {
    var top = HERO_TOP[name] || HERO_TOP.robot
    return top.concat(LEGS[pose] || LEGS.idle)
  }
  var ITEMS = {
    bolt: [
      '.....KKKKK..',
      '....KYYYYK..',
      '...KYYYYK...',
      '..KYYYYK....',
      '.KYYYYYKKK..',
      '.KKKYYYYYK..',
      '...KYYYYK...',
      '...KYYYK....',
      '..KYYYK.....',
      '..KYYK......',
      '.KYK........',
      '.KK.........',
    ],
    star: [
      '.....KK.....',
      '....KYYK....',
      '....KYYK....',
      'KKKKYYYYKKKK',
      'KYYYYYYYYYYK',
      '.KYYYYYYYYK.',
      '..KYYYYYYK..',
      '..KYYYYYYK..',
      '.KYYYKKYYYK.',
      '.KYYK..KYYK.',
      'KYYK....KYYK',
      'KKK......KKK',
    ],
    heart: [
      '............',
      '.KKK....KKK.',
      'KRRRK..KRRRK',
      'KRWRRKKRRRRK',
      'KRRRRRRRRRRK',
      'KRRRRRRRRRRK',
      '.KRRRRRRRRK.',
      '..KRRRRRRK..',
      '...KRRRRK...',
      '....KRRK....',
      '.....KK.....',
      '............',
    ],
    key: [
      '..KKKK......',
      '.KYYYYK.....',
      'KYYKKYYK....',
      'KYK..KYK....',
      'KYYKKYYK....',
      '.KYYYYK.....',
      '..KYYKKKKKKK',
      '..KYYYYYYYYK',
      '..KKKKKYYKYK',
      '.......KKKKK',
      '............',
      '............',
    ],
    gem: [
      '............',
      '...KKKKKK...',
      '..KWCCCCBK..',
      '.KWCCCCCCBK.',
      'KKKKKKKKKKKK',
      'KCWCCCCCCBBK',
      '.KCCCCCCCBK.',
      '..KCCCCCBK..',
      '...KCCCBK...',
      '....KCBK....',
      '.....KK.....',
      '............',
    ],
    shield: [
      'KKKKKKKKKKKK',
      'KWWWWWBBBBBK',
      'KWWWWWBBBBBK',
      'KWWWWWBBBBBK',
      'KBBBBBWWWWWK',
      'KBBBBBWWWWWK',
      '.KBBBBWWWWK.',
      '.KBBBBWWWWK.',
      '..KBBBWWWK..',
      '...KBBWWK...',
      '....KBWK....',
      '.....KK.....',
    ],
    clock: [
      '...KKKKKK...',
      '..KRRRRRRK..',
      '.KRWWKKWWRK.',
      'KRWWWKKWWWRK',
      'KRWWWKKWWWRK',
      'KRWWWKKKKWRK',
      'KRWWWWWWWWRK',
      'KRWWWWWWWWRK',
      '.KRWWWWWWRK.',
      '..KRRRRRRK..',
      '...KKKKKK...',
      '..KK....KK..',
    ],
    chat: [
      '............',
      '.KKKKKKKKKK.',
      'KWWWWWWWWWWK',
      'KWWWWWWWWWWK',
      'KWWKWWKWWKWK',
      'KWWKWWKWWKWK',
      'KWWWWWWWWWWK',
      '.KKWWKKKKKK.',
      '..KWK.......',
      '..KK........',
      '............',
      '............',
    ],
  }
  var ITEM_COLORS = {
    Y: '#ffd23f',
    R: '#ff4f6d',
    W: '#ffffff',
    C: '#56e0ff',
    B: '#2f7dff',
  }
  var COIN = [
    [
      '..KKKK..',
      '.KYYYYK.',
      'KYWYYYDK',
      'KYWYDYDK',
      'KYWYDYDK',
      'KYWYDYDK',
      'KYWYDYDK',
      'KYWYDYDK',
      'KYWYDYDK',
      'KYYYYYDK',
      '.KDDDDK.',
      '..KKKK..',
    ],
    [
      '...KK...',
      '..KYYK..',
      '..KWDK..',
      '..KWDK..',
      '..KWDK..',
      '..KWDK..',
      '..KWDK..',
      '..KWDK..',
      '..KWDK..',
      '..KWDK..',
      '..KDDK..',
      '...KK...',
    ],
    [
      '...KK...',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KYK..',
      '...KK...',
    ],
  ]
  var COIN_COLORS = { Y: '#ffd23f', D: '#c98a12', W: '#fff3b0' }

  // ---------- colour ----------
  function rgb(hex) {
    hex = String(hex).trim().replace('#', '')
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1')
    return [0, 2, 4].map(function (i) {
      return parseInt(hex.slice(i, i + 2), 16)
    })
  }
  function hex(c) {
    return (
      '#' +
      c
        .map(function (v) {
          return Math.max(0, Math.min(255, Math.round(v)))
            .toString(16)
            .padStart(2, '0')
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
  function lum(c) {
    var l = rgb(c).map(function (v) {
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
  /**
   * Every colour the film uses, from the brief's four. A dark sky gets night
   * scenes with stars; a light sky gets daylight, dusk and sunset instead.
   */
  function palette(v) {
    var sky = v.sky
    var grass = v.grass
    var dark = lum(sky) < 0.25
    var scenes = dark
      ? {
          title: { sky: mix(sky, '#000000', 0.3), ground: grass, night: true, land: 'hills' },
          l1: { sky: sky, ground: grass, night: false, land: 'hills' },
          l2: { sky: mix(sky, '#4a1236', 0.5), ground: mix(grass, '#9a8fb0', 0.55), night: false, land: 'peaks' },
          l3: { sky: mix(sky, '#000000', 0.5), ground: mix(grass, '#3b3550', 0.45), night: true, land: 'castle' },
          end: { sky: mix(sky, '#000000', 0.3), ground: grass, night: true, land: 'hills' },
        }
      : {
          title: { sky: mix(sky, '#ffffff', 0.25), ground: grass, night: false, land: 'hills' },
          l1: { sky: sky, ground: grass, night: false, land: 'hills' },
          l2: { sky: mix(sky, '#ffc2d4', 0.4), ground: mix(grass, '#9a8fb0', 0.5), night: false, land: 'peaks' },
          l3: { sky: mix(sky, '#ffd29a', 0.5), ground: mix(grass, '#6b5a48', 0.4), night: false, land: 'castle' },
          end: { sky: mix(sky, '#ffffff', 0.25), ground: grass, night: false, land: 'hills' },
        }
    var p = { ink: v.ink, accent: v.accent, grass: grass, outline: K, dark: dark, scenes: scenes }
    for (var id in p.scenes) {
      var s = p.scenes[id]
      s.far = mix(s.sky, s.ground, 0.32)
      s.near = mix(s.sky, s.ground, 0.6)
      s.groundDark = mix(s.ground, '#000000', 0.32)
      s.groundLight = mix(s.ground, '#ffffff', 0.25)
      s.dirt = mix('#6b4226', s.sky, 0.18)
      s.dirtDark = mix('#6b4226', '#000000', 0.35)
    }
    // Text sits on the sky with a hard drop shadow: dark under light text,
    // light under dark text. The dialog box is the sky pushed further away.
    p.textShadow = dark ? K : mix(sky, '#ffffff', 0.75)
    p.panel = dark ? mix(sky, '#000000', 0.6) : mix(sky, '#ffffff', 0.82)
    p.accentDark = mix(v.accent, '#000000', 0.45)
    return p
  }
  /** Contrast pairs the film relies on: [what, foreground, background, minimum]. */
  function contrastPairs(v) {
    var p = palette(v)
    var out = []
    var names = { title: 'title screen', l1: 'stage 1', l2: 'stage 2', l3: 'stage 3', end: 'ending' }
    ;['title', 'l1', 'l2', 'l3', 'end'].forEach(function (id) {
      out.push(['ink text on the ' + names[id] + ' sky', p.ink, p.scenes[id].sky, 4.5])
    })
    out.push(['accent logo on the title screen sky', p.accent, p.scenes.title.sky, 3])
    out.push(['accent headline on the ending sky', p.accent, p.scenes.end.sky, 3])
    ;['l1', 'l2', 'l3'].forEach(function (id) {
      out.push(['accent stage label on the ' + names[id] + ' sky', p.accent, p.scenes[id].sky, 3])
    })
    out.push(['ink text in the dialog box', p.ink, p.panel, 4.5])
    out.push(['ground against the level 1 sky', p.scenes.l1.ground, p.scenes.l1.sky, 1.6])
    return out
  }

  // ---------- SVG from grids ----------
  /**
   * A grid of characters as SVG paths, one per colour, at `px` screen pixels
   * per grid pixel. Runs of one colour on a row become one rectangle.
   */
  function gridSvg(rows, colors, px, attrs) {
    var h = rows.length
    var w = rows[0].length
    var byColor = {}
    for (var y = 0; y < h; y++) {
      var row = rows[y]
      for (var x = 0; x < w; ) {
        var c = row[x]
        var col = colors[c]
        if (!col) {
          x++
          continue
        }
        var run = 1
        while (x + run < w && row[x + run] === c) run++
        ;(byColor[col] = byColor[col] || []).push('M' + x + ' ' + y + 'h' + run + 'v1h-' + run + 'z')
        x += run
      }
    }
    var paths = ''
    for (var k in byColor) paths += '<path fill="' + k + '" d="' + byColor[k].join('') + '"/>'
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w * px + '" height="' + h * px +
      '" shape-rendering="crispEdges" ' + (attrs || '') + '>' + paths + '</svg>'
    )
  }
  /** One line of text as rows of '#' (or `mark`) for gridSvg. */
  function textRows(s, mark, bold) {
    var chars = Array.from(normalise(s))
    var rows = []
    for (var y = 0; y < 7; y++) {
      var r = ''
      chars.forEach(function (c, i) {
        var g = F[c] || F['?']
        var row = bold ? boldRow(g[y]) : g[y]
        r += row.replace(/#/g, mark || '#') + (i < chars.length - 1 ? '.' : '')
      })
      rows.push(r || '.')
    }
    return rows
  }
  /** Text with a drop shadow `depth` font pixels down and right. */
  function textSvg(s, px, color, shadow, depth, attrs, bold) {
    var rows = textRows(s, 'T', bold)
    depth = shadow ? depth || 1 : 0
    var w = rows[0].length + depth
    var h = 7 + depth
    var grid = []
    for (var y = 0; y < h; y++) grid.push(Array(w + 1).join('.').split(''))
    for (var d = depth; d >= 1; d--)
      rows.forEach(function (r, y) {
        for (var x = 0; x < r.length; x++) if (r[x] === 'T') grid[y + d][x + d] = d === 1 ? 'S' : 'Z'
      })
    rows.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r[x] === 'T') grid[y][x] = 'T'
    })
    var colors = { T: color, S: shadow, Z: K }
    return gridSvg(
      grid.map(function (r) {
        return r.join('')
      }),
      colors,
      px,
      attrs,
    )
  }

  root.QUEST = {
    BPM: BPM,
    BEAT: BEAT,
    DURATION: DURATION,
    SCENES: SCENES,
    LEVEL: LEVEL,
    END: END,
    FONT: F,
    normalise: normalise,
    unsupported: unsupported,
    textWidth: textWidth,
    HEROES: Object.keys(HERO_TOP),
    hero: hero,
    HERO_COLORS: HERO_COLORS,
    ITEMS: ITEMS,
    ITEM_COLORS: ITEM_COLORS,
    COIN: COIN,
    COIN_COLORS: COIN_COLORS,
    K: K,
    mix: mix,
    contrast: contrast,
    palette: palette,
    contrastPairs: contrastPairs,
    gridSvg: gridSvg,
    textRows: textRows,
    textSvg: textSvg,
  }
})(typeof window !== 'undefined' ? window : globalThis)
