// Swiss Grid Deck player. Scales the 1920×1080 slides to the window, fits
// long text to its box, and handles the keys:
//   → ← Space PageUp PageDown Home End   move
//   O   overview of every slide (click one to open it)
//   N   presenter notes
//   F   full screen
// #5 at the end of the URL opens slide 5.
;(function () {
  var deck = document.querySelector('.deck')
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'))
  var panel = document.querySelector('.notes-panel')
  var current = 0

  function scale() {
    var s = Math.min(innerWidth / 1920, innerHeight / 1080)
    deck.style.transform = 'translate(-50%, -50%) scale(' + s + ')'
  }

  // Elements with data-fit="width,height" shrink until they fit that box.
  function fitText() {
    document.querySelectorAll('[data-fit]').forEach(function (el) {
      var box = el.getAttribute('data-fit').split(',').map(Number)
      var size = parseFloat(getComputedStyle(el).fontSize)
      var min = size * 0.4
      while (
        size > min &&
        (el.scrollWidth > box[0] + 1 || el.scrollHeight > box[1] + 1)
      ) {
        size -= 2
        el.style.fontSize = size + 'px'
      }
    })
  }

  function show(n) {
    current = Math.max(0, Math.min(slides.length - 1, n))
    slides.forEach(function (s, i) {
      s.classList.toggle('on', i === current)
    })
    var notes = slides[current].querySelector('.notes')
    panel.innerHTML =
      '<small>Slide ' +
      (current + 1) +
      ' of ' +
      slides.length +
      '</small>' +
      (notes ? notes.innerHTML : 'No notes for this slide.')
    if (history.replaceState)
      history.replaceState(null, '', '#' + (current + 1))
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    var k = e.key
    if (
      k === 'ArrowRight' ||
      k === 'ArrowDown' ||
      k === ' ' ||
      k === 'PageDown'
    )
      show(current + 1)
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp')
      show(current - 1)
    else if (k === 'Home') show(0)
    else if (k === 'End') show(slides.length - 1)
    else if (k === 'o' || k === 'O') document.body.classList.toggle('overview')
    else if (k === 'n' || k === 'N') document.body.classList.toggle('notes')
    else if (k === 'f' || k === 'F') {
      if (document.fullscreenElement) document.exitFullscreen()
      else document.documentElement.requestFullscreen()
    } else return
    e.preventDefault()
  })
  slides.forEach(function (s, i) {
    s.addEventListener('click', function () {
      if (!document.body.classList.contains('overview')) return
      document.body.classList.remove('overview')
      show(i)
    })
  })
  addEventListener('resize', scale)

  // ---------- ?measure: the layout as data, for export-pptx.mjs ----------
  // Every slide becomes a list of rectangles (fills, borders, the dot) and
  // text boxes with their rendered lines, in 1920×1080 pixels and solid
  // colours. Chrome's --dump-dom hands the JSON to the exporter.
  function parse(c) {
    var m = String(c).match(/[\d.]+/g) || [0, 0, 0, 0]
    var srgb = /^color\(srgb/.test(c)
    return {
      rgb: [0, 1, 2].map(function (i) {
        return (srgb ? 255 : 1) * Number(m[i])
      }),
      a: m.length > 3 ? Number(m[3]) : /transparent/.test(c) ? 0 : 1,
    }
  }
  function solid(c, bg, opacity) {
    var x = parse(c)
    var k = x.a * opacity
    return x.rgb
      .map(function (v, i) {
        var h = Math.round(v * k + bg[i] * (1 - k)).toString(16)
        return h.length < 2 ? '0' + h : h
      })
      .join('')
  }
  function measureSlide(slide) {
    var origin = slide.getBoundingClientRect()
    var bg = parse(getComputedStyle(slide).backgroundColor).rgb
    var items = []
    function box(r) {
      return {
        x: r.left - origin.left,
        y: r.top - origin.top,
        w: r.width,
        h: r.height,
      }
    }
    function rect(r, fill, ellipse) {
      var b = box(r)
      if (b.w > 0.5 && b.h > 0.5) {
        b.type = ellipse ? 'ellipse' : 'rect'
        b.fill = fill
        items.push(b)
      }
    }
    function text(el, cs, opacity) {
      var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
      var lines = [[]]
      var top = null
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_ALL)
      for (var n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeName === 'BR') {
          lines.push([])
          top = null
        }
        if (n.nodeType !== 3) continue
        var color = solid(getComputedStyle(n.parentNode).color, bg, opacity)
        var parts = n.data.split(/(\s+)/)
        var at = 0
        parts.forEach(function (part) {
          var range = document.createRange()
          range.setStart(n, at)
          range.setEnd(n, (at += part.length))
          if (!part) return
          var r = range.getClientRects()[0]
          part = part.replace(/\s+/g, ' ')
          if (r && /\S/.test(part)) {
            if (top !== null && r.top - top > lh / 2) lines.push([])
            top = r.top
          }
          var line = lines[lines.length - 1]
          var last = line[line.length - 1]
          if (last && last.color === color) last.t += part
          else line.push({ t: part, color: color })
        })
      }
      lines = lines
        .map(function (line) {
          if (line.length) {
            line[0].t = line[0].t.replace(/^\s+/, '')
            line[line.length - 1].t = line[line.length - 1].t.replace(
              /\s+$/,
              '',
            )
          }
          return line.filter(function (run) {
            return run.t
          })
        })
        .filter(function (line, i, all) {
          return line.length || (i > 0 && i < all.length - 1)
        })
      if (!lines.length) return
      var b = box(el.getBoundingClientRect())
      b.type = 'text'
      b.lines = lines
      b.size = parseFloat(cs.fontSize)
      b.weight = parseInt(cs.fontWeight, 10)
      b.font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      b.spacing = parseFloat(cs.letterSpacing) || 0
      b.lh = lh
      b.align =
        cs.textAlign === 'right' || cs.textAlign === 'end'
          ? 'right'
          : cs.textAlign === 'center'
            ? 'center'
            : 'left'
      b.upper = cs.textTransform === 'uppercase'
      b.nowrap = cs.whiteSpace === 'nowrap'
      items.push(b)
    }
    function walk(el, opacity) {
      var cs = getComputedStyle(el)
      if (cs.display === 'none') return
      opacity *= parseFloat(cs.opacity)
      var r = el.getBoundingClientRect()
      if (el !== slide && parse(cs.backgroundColor).a > 0)
        rect(
          r,
          solid(cs.backgroundColor, bg, opacity),
          /%$/.test(cs.borderTopLeftRadius)
            ? parseFloat(cs.borderTopLeftRadius) >= 50
            : parseFloat(cs.borderTopLeftRadius) >= r.width / 2 - 1,
        )
      ;['Top', 'Right', 'Bottom', 'Left'].forEach(function (side) {
        var w = parseFloat(cs['border' + side + 'Width'])
        if (!w || cs['border' + side + 'Style'] === 'none') return
        var fill = solid(cs['border' + side + 'Color'], bg, opacity)
        var top = side === 'Bottom' ? r.bottom - w : r.top
        var left = side === 'Right' ? r.right - w : r.left
        var horizontal = side === 'Top' || side === 'Bottom'
        rect(
          {
            left: left,
            top: top,
            width: horizontal ? r.width : w,
            height: horizontal ? w : r.height,
          },
          fill,
        )
      })
      var hasText = Array.prototype.some.call(el.childNodes, function (n) {
        return n.nodeType === 3 && /\S/.test(n.data)
      })
      if (hasText) return text(el, cs, opacity)
      Array.prototype.forEach.call(el.children, function (child) {
        if (!child.classList.contains('notes')) walk(child, opacity)
      })
    }
    walk(slide, 1)
    var notes = slide.querySelector('.notes')
    if (notes) {
      notes = notes.cloneNode(true)
      notes.querySelectorAll('br').forEach(function (br) {
        br.replaceWith('\n')
      })
    }
    return {
      bg: solid(getComputedStyle(slide).backgroundColor, [0, 0, 0], 1),
      items: items,
      notes: notes ? notes.textContent : '',
    }
  }
  function measure() {
    deck.style.transform = 'none'
    slides.forEach(function (s) {
      s.classList.add('on')
    })
    var data = {
      title: document.title,
      lang: document.documentElement.lang,
      slides: slides.map(measureSlide),
    }
    var out = document.createElement('script')
    out.type = 'application/json'
    out.id = 'measure'
    out.textContent = JSON.stringify(data).replace(/</g, '\\u003c')
    document.body.appendChild(out)
  }

  scale()
  show((parseInt(location.hash.slice(1), 10) || 1) - 1)
  // Fit once the fonts are in, so the measurements are real. data-ready
  // tells the PDF export the deck is laid out.
  ;(document.fonts ? document.fonts.ready : Promise.resolve()).then(
    function () {
      fitText()
      if (/[?&]measure\b/.test(location.search)) measure()
      document.documentElement.setAttribute('data-ready', '')
    },
  )
})()
