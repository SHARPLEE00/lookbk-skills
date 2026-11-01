// Motion Heroes kit: the browser runtime. The build inlines this file into
// the page, followed by the effect, and calls MotionHeroRun(effect, id).
//
// It owns everything that isn't the picture itself:
// - the clock. The effect is drawn as a pure function of time, seek(t), so
//   the same t always gives the same frame and a recording can step it.
// - pausing when the hero is off-screen or the tab is hidden,
// - the device pixel ratio (capped at 2, lowered on slow machines),
// - prefers-reduced-motion: one still frame, no loop,
// - the fallback: a still picture (SVG) shows until the first frame is
//   drawn, and stays if WebGL, the CDN or the effect fails. Never a blank hero.
// - where the effect can draw without running under the text (the stage),
// - the pointer, smoothed, or on a slow made-up path when recording,
// - an effect's story (cfg.story): the scene played as 0–1 progress, by the
//   clock (drive "time") or by the visitor scrolling through the section,
//   pinned for a few screen heights (drive "scroll"; a recording scrolls
//   the page itself on a scripted path, so it is the same on every machine),
// - window.MotionHero, which scripts/record.mjs drives frame by frame.
function MotionHeroRun(effect, id) {
  const root = document.getElementById(id)
  if (!root) return
  const cfg = JSON.parse(document.getElementById(id + '-config').textContent)
  const recording = /[?&]mh-record\b/.test(location.search)
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
  let reduced = reducedQuery.matches && !recording
  const canvas = root.querySelector('.mh-canvas')
  const bar = root.querySelector('.mh-bar')
  const body = root.querySelector('.mh-body')
  const copy = root.querySelector('.mh-copy')
  const extra = root.querySelector('.mh-extra')
  const extraAt = root.dataset.extra || 'beside'
  const story = cfg.story || null
  const speed = cfg.motion.speed
  const MAX_DPR = 2
  let dprCap = MAX_DPR
  let view = null
  let started = false
  let failed = false
  let raf = 0
  let last = null
  let time = 0 // real seconds the hero has been on screen
  let inView = true
  const pointer = { x: 0, y: 0 }
  const smooth = { x: 0, y: 0 }
  let slow = 0
  let frames = 0
  let resolveReady
  // the story, when the effect has one: progress 0–1 (sp smoothed toward target)
  let pin = null
  let target = 0
  let sp = 0
  const ready = new Promise((r) => (resolveReady = r))

  root.classList.add('mh-live')
  if (recording) root.classList.add('mh-record')

  const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3)
  // The pointer path used in recordings: a slow figure, starting at rest.
  const path = (t) => {
    const k = ease(t / 1.8)
    return { x: (Math.sin(t * 0.7) * 0.55 + 0.18) * k, y: Math.sin(t * 1.13 + 0.6) * 0.38 * k }
  }

  /** Where the effect can draw without sitting under the copy. */
  function measure() {
    const W = root.clientWidth
    const H = root.clientHeight
    const top = bar.offsetTop + bar.offsetHeight
    const bx = body.offsetLeft
    const by = body.offsetTop
    let c = { x: bx + copy.offsetLeft, y: by + copy.offsetTop, w: copy.offsetWidth, h: copy.offsetHeight }
    const shown = !!(extra && extra.offsetWidth)
    // layout boxes (offsets), so the intro's transform doesn't move them
    const extraRect = shown ? { x: bx + extra.offsetLeft, y: by + extra.offsetTop, w: extra.offsetWidth, h: extra.offsetHeight } : null
    // beside: the extra takes its own column. Above or below the copy: the
    // column is as wide as the wider of the two. Overlay: it sits on the stage.
    let ex = null
    if (shown && extraAt === 'beside') ex = { x: bx + extra.offsetLeft, w: extra.offsetWidth }
    else if (shown && (extraAt === 'above-copy' || extraAt === 'below-copy')) {
      const x0 = Math.min(c.x, extraRect.x)
      c = { x: x0, y: c.y, w: Math.max(c.x + c.w, extraRect.x + extraRect.w) - x0, h: c.h }
    }
    const align = root.dataset.align
    const gap = 24
    let stage
    // stacked (phones, tablets, portrait frames): the effect goes above the copy
    const stacked = W < 900 || W / H < 5 / 6
    if (stacked) stage = { x: 0, y: top, w: W, h: Math.max(160, c.y - top) }
    else if (align === 'center') stage = { x: 0, y: top, w: W, h: H - top }
    else if (align === 'right') {
      const x0 = ex ? ex.x + ex.w + gap : 0
      stage = { x: x0, y: top, w: c.x - gap - x0, h: H - top }
    } else {
      const x0 = c.x + c.w + gap
      stage = { x: x0, y: top, w: (ex ? ex.x - gap : W) - x0, h: H - top }
    }
    // never under the copy: if the room beside it is thin, use all of that side
    if (!stacked && align !== 'center' && stage.w < 200)
      stage = align === 'right' ? { x: 0, y: top, w: Math.max(120, c.x - gap), h: H - top } : { x: c.x + c.w + gap, y: top, w: Math.max(120, W - c.x - c.w - gap), h: H - top }
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
    return { width: W, height: H, dpr, stage, mobile: W < 760, stacked, align, extra: shown, extraAt, extraRect }
  }

  /* ---- the story ---- */
  const clamp01 = (x) => Math.min(Math.max(x, 0), 1)
  const smoothstep = (x) => ((x = clamp01(x)), x * x * (3 - 2 * x))
  // The scripted scroll of a recording (and the reduced-motion still of a
  // scroll story): rest for `lead`, glide through the story, rest. Real
  // seconds in, progress out. The effect may give its own: script(seconds, story).
  function script(seconds) {
    if (effect.script) {
      try {
        return clamp01(Number(effect.script(seconds, story)) || 0)
      } catch (e) {
        console.warn('[motion hero] script():', e)
      }
    }
    return smoothstep((seconds * speed - story.lead) / story.length)
  }
  // drive "time": the clock (scene seconds) → progress, looping after `hold`
  function timed(seconds) {
    let c = seconds * speed
    if (story.loop) {
      const period = story.lead + story.length + story.hold
      c = ((c % period) + period) % period
    }
    return clamp01((c - story.lead) / story.length)
  }
  // drive "scroll": wrap the section in a box `pin` screen heights taller
  // and make it sticky, so it holds still while the page scrolls past.
  function setupPin() {
    const wrap = document.createElement('div')
    wrap.className = 'mh-pin'
    wrap.style.position = 'relative'
    root.parentNode.insertBefore(wrap, root)
    wrap.appendChild(root)
    root.style.position = 'sticky'
    const p = {
      wrap,
      layout() {
        const vh = innerHeight
        const rh = root.offsetHeight
        root.style.top = Math.min(0, vh - rh) + 'px'
        wrap.style.height = Math.round(rh + story.pin * vh) + 'px'
        p.read()
      },
      // scroll position → progress (exact: no smoothing here)
      read() {
        const vh = innerHeight
        const pre = Math.max(0, root.offsetHeight - vh)
        target = clamp01((-wrap.getBoundingClientRect().top - pre) / (story.pin * vh))
        return target
      },
      // the page scroll at which progress is `k`
      scrollFor(k) {
        const vh = innerHeight
        const pre = Math.max(0, root.offsetHeight - vh)
        return wrap.getBoundingClientRect().top + scrollY + pre + k * story.pin * vh
      },
    }
    addEventListener('scroll', () => p.read(), { passive: true })
    addEventListener('resize', () => p.layout())
    p.layout()
    return p
  }
  /** The progress of the frame on screen (0 without a story). */
  function progressNow() {
    if (!story) return 0
    return reduced ? progressAt(cfg.stillTime, true) : progressAt(time)
  }
  /** Progress 0–1 for the frame at real seconds t. */
  function progressAt(t, still) {
    if (story.drive === 'scroll') return pin && !still ? sp : script(t)
    return still ? clamp01((t * speed - story.lead) / story.length) : timed(t)
  }

  // Places the still picture's object: where the effect says (its optional
  // place(view, params), which must not need init), or the stage's middle.
  function place(v) {
    const s = v.stage
    let at = { x: s.x + s.w / 2, y: s.y + s.h / 2, size: Math.min(s.w, s.h) * (cfg.stillScale || 0.8) }
    try {
      if (effect.place) at = effect.place(v, cfg.params) || at
    } catch (e) {
      console.warn('[motion hero] place():', e)
    }
    root.style.setProperty('--mh-sx', at.x + 'px')
    root.style.setProperty('--mh-sy', at.y + 'px')
    root.style.setProperty('--mh-ss', at.size + 'px')
  }

  function fail(err) {
    if (failed) return
    failed = true
    cancelAnimationFrame(raf)
    root.classList.remove('mh-ready')
    root.classList.add('mh-fallback')
    const reason = String((err && err.message) || err)
    console.warn('[motion hero] showing the still picture:', reason)
    resolveReady({ ok: false, reason })
  }

  function draw(t, still) {
    try {
      const state = { pointer: still ? { x: 0, y: 0 } : smooth, time: t, still: !!still }
      if (!story) effect.seek(t * speed, state)
      else {
        // with a story, seek gets story time: progress × length
        state.progress = progressAt(t, still)
        state.drive = story.drive
        effect.seek(state.progress * story.length, state)
      }
      if (!root.classList.contains('mh-ready')) root.classList.add('mh-ready')
    } catch (e) {
      fail(e)
    }
  }

  function resize() {
    if (pin) pin.layout()
    if (!started || failed) {
      place(measure())
      return
    }
    view = measure()
    place(view)
    try {
      effect.resize(view)
    } catch (e) {
      return fail(e)
    }
    if (reduced) draw(cfg.stillTime, true)
    else if (!raf && !recording) draw(time)
  }

  function tick(now) {
    raf = 0
    if (failed || reduced || recording) return
    if (!inView || document.hidden) {
      last = null
      return // the observers start it again
    }
    raf = requestAnimationFrame(tick)
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1)
    last = now
    time += dt
    const k = 1 - Math.exp(-dt * 3)
    const aim = cfg.motion.pointer ? pointer : { x: 0, y: 0 }
    smooth.x += (aim.x - smooth.x) * k
    smooth.y += (aim.y - smooth.y) * k
    if (pin) {
      sp += (target - sp) * (1 - Math.exp(-dt * 9))
      if (Math.abs(target - sp) < 0.0005) sp = target
    }
    draw(time)
    // Slow machine: draw fewer pixels rather than drop frames.
    if (dt > 0) {
      frames++
      if (dt > 1 / 40) slow++
      if (frames >= 60) {
        if (slow > 30 && dprCap > 1) {
          dprCap = Math.max(1, dprCap - 0.5)
          resize()
        }
        frames = 0
        slow = 0
      }
    }
  }
  const run = () => {
    if (!raf && started && !failed && !reduced && !recording) raf = requestAnimationFrame(tick)
  }

  function hasWebGL() {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2') || c.getContext('webgl')
      if (!gl) return false
      const lose = gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
      return true
    } catch {
      return false
    }
  }

  async function start() {
    view = measure()
    place(view)
    if (cfg.needs === 'webgl' && !hasWebGL()) return fail(new Error('WebGL is not available'))
    const ctx = {
      root,
      canvas,
      params: cfg.params,
      theme: cfg.theme,
      recording,
      reduced,
      view,
      load: (name) => {
        if (cfg.libs[name]) return import(cfg.libs[name])
        // three.js add-ons through the import map (declared in effect.mjs addons, so they carry SRI)
        if (cfg.three && name.startsWith('three/addons/')) {
          if (!cfg.three.addons.includes(name.slice(13))) throw new Error(name + ' is not in the effect\'s addons')
          return import(name)
        }
        throw new Error('unknown library ' + name)
      },
      // An effect's own controls (a finish picker, say) call this so a
      // reduced-motion page still redraws when they're used.
      redraw: () => {
        if (reduced) draw(cfg.stillTime, true)
      },
      now: () => (reduced ? cfg.stillTime : time) * speed,
      story,
      /** The story's progress now (0–1); 0 without a story. */
      progress: () => progressNow(),
    }
    let timer
    const timeout = new Promise((_, no) => {
      timer = setTimeout(() => no(new Error('the effect took too long to load')), recording ? 45000 : 12000)
    })
    try {
      await Promise.race([effect.init(ctx), timeout])
    } catch (e) {
      return fail(e)
    } finally {
      clearTimeout(timer)
    }
    started = true
    view = measure()
    place(view)
    try {
      effect.resize(view)
    } catch (e) {
      return fail(e)
    }
    if (reduced) draw(cfg.stillTime, true)
    else draw(recording ? 0 : time)
    if (!failed) resolveReady({ ok: true })
    run()
  }

  // pin first, before the copy's intro starts; not in reduced motion (the page scrolls normally)
  if (story && story.drive === 'scroll' && !reduced) pin = setupPin()

  addEventListener('pointermove', (e) => {
    if (recording) return
    const r = root.getBoundingClientRect()
    pointer.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
    pointer.y = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)))
  })
  new ResizeObserver(() => resize()).observe(root)
  if ('IntersectionObserver' in window)
    new IntersectionObserver((es) => {
      inView = es[es.length - 1].isIntersecting
      run()
    }).observe(root)
  document.addEventListener('visibilitychange', run)
  reducedQuery.addEventListener?.('change', (e) => {
    reduced = e.matches && !recording
    if (reduced) {
      cancelAnimationFrame(raf)
      raf = 0
      if (started && !failed) draw(cfg.stillTime, true)
    } else run()
  })

  // Driven by scripts/record.mjs: seek(seconds) draws that moment of the
  // intro and the effect, and resolves once it is on screen.
  const api = {
    ready,
    posterTime: cfg.posterTime,
    stillTime: cfg.stillTime,
    /** The effect's story ({ drive, pin, length, lead, hold, loop }) or null. */
    story,
    /** Real seconds until a recording reaches the end of the story (lead + length, at motion.speed). */
    storySeconds: story ? (story.lead + story.length) / speed : 0,
    /** The story's progress (0–1) in the last frame drawn by seek, or the live one. */
    progress: () => progressNow(),
    /** Seconds the hero has run (it doesn't advance off-screen or in a hidden tab). */
    time: () => time,
    state: () => (failed ? 'fallback' : !started ? 'loading' : reduced ? 'still' : recording ? 'recording' : raf ? 'running' : 'paused'),
    seek(seconds) {
      if (failed) return Promise.reject(new Error('the effect failed; the still picture is showing'))
      for (const a of root.getAnimations({ subtree: true })) {
        a.pause()
        a.currentTime = seconds * 1000
      }
      const p = cfg.motion.pointer ? path(seconds) : { x: 0, y: 0 }
      smooth.x = p.x
      smooth.y = p.y
      if (pin) {
        // scroll the page itself along the script, then read progress back from it
        scrollTo(0, pin.scrollFor(script(seconds)))
        sp = pin.read()
      }
      time = seconds
      draw(seconds)
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))
    },
  }
  window.MotionHeroes = Object.assign(window.MotionHeroes || {}, { [id]: api })
  window.MotionHero = api
  start()
}
