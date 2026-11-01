// Washing Line: the browser half. The Motion Heroes kit inlines this file
// and calls init(ctx) once, resize(view) when the hero changes size, and
// seek(t, state) for every frame.
//
// A printed cotton poster hangs from a washing line by wooden pegs, under a
// sky with drifting clouds (a screen-space shader behind the scene). The
// cloth is a grid of Verlet particles held together by stretch, shear and
// bend constraints; the top row under each peg is pinned. A breeze pushes
// along the surface normals. The visitor presses a dimple into the cloth
// with the pointer (hover) and grabs a patch of it to pull (press and drag);
// let go and it swings back.
//
// The simulation is stepped at a fixed 1/120 s from a settled start, so the
// frame at time t is the same on every machine as long as the frames before
// it were asked for in order, which is how record.mjs asks. Going back in
// time starts again from the settled cloth. In a recording a scripted hand
// does what a visitor would: pulls a corner and lets go, then runs a
// fingertip across the cloth.

export default {
  async init(ctx) {
    const THREE = await ctx.load('three')
    const P = ctx.params
    this.ctx = ctx
    this.THREE = THREE
    const C = (hex) => new THREE.Color(hex)
    const live = !ctx.recording && !ctx.reduced

    // the print is drawn with the hero's own fonts, so wait for them (briefly)
    const css = getComputedStyle(ctx.root)
    const display = css.getPropertyValue('--mh-display').trim() || 'system-ui, sans-serif'
    const body = css.getPropertyValue('--mh-body').trim() || 'system-ui, sans-serif'
    try {
      await Promise.race([
        Promise.all([document.fonts.load(`600 80px ${display}`), document.fonts.load(`400 30px ${body}`), document.fonts.load(`500 30px ${body}`)]),
        new Promise((r) => setTimeout(r, 3000)),
      ])
    } catch {}

    // seeded, so every machine draws the same chart and clouds
    let seed = (P.seed * 7919) % 2147483647 || 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

    const renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true, alpha: false, preserveDrawingBuffer: ctx.recording })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer = renderer
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200)
    Object.assign(this, { scene, camera })

    /* ---- the sky: gradient and slow fbm clouds, behind everything ---- */
    const sky = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: C(P.skyTop) },
        uBottom: { value: C(P.skyBottom) },
        uCloud: { value: C(P.cloudColor) },
        uAmt: { value: P.clouds },
        uTime: { value: 0 },
        uSeed: { value: rnd() * 50 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthWrite: false,
      depthTest: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
uniform vec3 uTop, uBottom, uCloud; uniform float uAmt, uTime, uSeed; uniform vec2 uRes;
varying vec2 vUv;
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float n2(vec2 x){ vec2 i = floor(x); vec2 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 6; i++){ s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  float y = vUv.y;
  vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, pow(y, 0.8)));
  vec2 p = vec2(vUv.x * uRes.x / uRes.y, y) * vec2(1.6, 3.2) + vec2(uTime + uSeed, uSeed * 0.37);
  float n = (fbm(p) + 0.35 * fbm(p * 2.7 - uTime * 0.6)) / 1.35;
  float band = 1.0 - smoothstep(0.2, 0.95, y) * 0.35; // more cloud toward the horizon
  float th = 0.68 - 0.3 * uAmt;
  float c = smoothstep(th, th + 0.16, n * band) * step(0.001, uAmt);
  float lit = 0.84 + 0.16 * smoothstep(0.35, 0.65, fbm(p * 1.3 + vec2(0.0, 0.12)));
  col = mix(col, uCloud * lit, c * 0.92);
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.006;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
    })
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sky)
    bg.frustumCulled = false
    bg.renderOrder = -100
    scene.add(bg)
    this.sky = sky

    /* ---- light ---- */
    const dusk = P.light === 'dusk'
    scene.add(new THREE.HemisphereLight(dusk ? C(P.skyTop).lerp(C('#8c8fb8'), 0.6) : 0xcfe3ff, dusk ? 0x2a2533 : 0x9aa7b4, dusk ? 0.9 : 1.25))
    const sun = new THREE.DirectionalLight(dusk ? 0xffcfa8 : 0xfff3e2, dusk ? 1.5 : 2.2)
    sun.position.set(dusk ? -5 : 2, dusk ? 1.6 : 4, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.02
    sun.shadow.radius = 4
    scene.add(sun)
    this.sun = sun

    /* ---- the cloth ---- */
    const Hc = 2
    const Wc = Hc * P.aspect
    const NY = 36
    const NX = Math.max(28, Math.min(60, Math.round(NY * P.aspect)))
    const N = NX * NY
    const rx = Wc / (NX - 1)
    const ry = Hc / (NY - 1)
    const ox = -Wc / 2
    const oy = Hc / 2
    const X = new Float32Array(N * 3)
    const PREV = new Float32Array(N * 3)
    const ACC = new Float32Array(N * 3)
    const pinned = new Uint8Array(N)
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i
        X[k * 3] = ox + i * rx
        X[k * 3 + 1] = oy - j * ry
        X[k * 3 + 2] = 0.05 * Math.sin(i * 0.35) * (j / NY) // never perfectly flat
      }
    const pegCols = Array.from({ length: P.pegs }, (_, k) => Math.round(1 + (k * (NX - 3)) / (P.pegs - 1)))
    for (const c of pegCols) for (let d = -1; d <= 1; d++) pinned[c + d] = 1
    const C3 = []
    const link = (a, b) => C3.push(a, b, Math.hypot(X[a * 3] - X[b * 3], X[a * 3 + 1] - X[b * 3 + 1], X[a * 3 + 2] - X[b * 3 + 2]))
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i
        if (i < NX - 1) link(k, k + 1)
        if (j < NY - 1) link(k, k + NX)
        if (i < NX - 1 && j < NY - 1) (link(k, k + NX + 1), link(k + 1, k + NX))
        if (i < NX - 2) link(k, k + 2)
        if (j < NY - 2) link(k, k + 2 * NX)
      }
    PREV.set(X)
    Object.assign(this, { Hc, Wc, NX, NY, N, X, PREV, ACC, pinned, CON: new Float32Array(C3), REST: new Float32Array(X) })

    const geo = new THREE.BufferGeometry()
    const uv = new Float32Array(N * 2)
    const idx = []
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i
        uv[k * 2] = i / (NX - 1)
        uv[k * 2 + 1] = 1 - j / (NY - 1)
      }
    for (let j = 0; j < NY - 1; j++)
      for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i
        idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1)
      }
    geo.setIndex(idx)
    geo.setAttribute('position', new THREE.BufferAttribute(X, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    this.geo = geo

    const canvasTex = (w, h, draw) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      draw(c.getContext('2d'), w, h)
      const t = new THREE.CanvasTexture(c)
      t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
      return t
    }
    // the plain weave: warp and weft threads passing over and under each other
    const weave = canvasTex(64, 64, (g, w, h) => {
      const img = g.createImageData(w, h)
      const T = 4
      const height = (x, y) => {
        x = ((x % w) + w) % w
        y = ((y % h) + h) % h
        const u = (x / w) * T
        const v = (y / h) * T
        const over = (Math.floor(u) + Math.floor(v)) % 2
        const warp = Math.sin(Math.PI * (u % 1))
        const weft = Math.sin(Math.PI * (v % 1))
        return over ? 0.55 + 0.45 * warp * (0.6 + 0.4 * weft) : 0.55 + 0.45 * weft * (0.6 + 0.4 * warp)
      }
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const dx = height(x + 1, y) - height(x - 1, y)
          const dy = height(x, y + 1) - height(x, y - 1)
          const n = [-dx * 1.4, -dy * 1.4, 1]
          const l = Math.hypot(...n)
          const o = (y * w + x) * 4
          img.data[o] = (n[0] / l) * 127 + 128
          img.data[o + 1] = (n[1] / l) * 127 + 128
          img.data[o + 2] = (n[2] / l) * 127 + 128
          img.data[o + 3] = 255
        }
      g.putImageData(img, 0, 0)
    })
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping
    weave.repeat.set(Math.round(26 * Wc), Math.round(26 * Hc))

    const TW = 2048
    const TH = Math.round(TW / P.aspect)
    const bars = Array.from({ length: 8 }, () => 0.25 + rnd() * 0.75)
    const top = bars.indexOf(Math.max(...bars))
    const print = canvasTex(TW, TH, (g, w, h) => {
      g.fillStyle = P.cloth
      g.fillRect(0, 0, w, h)
      // a faint uneven dye so it reads as cotton, not paper
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + rnd() * 0.012})`
        g.fillRect(rnd() * w, 0, 1 + rnd() * 3, h)
      }
      const s = Math.min(h, w / 1.35)
      const m = s * 0.11
      const ink = P.printInk
      const right = P.printSpecs.length > 0 || P.printChart
      const colX = w * 0.64
      const fit = (text, weight, size, family, maxW) => {
        let px = size
        g.font = `${weight} ${px}px ${family}`
        while (px > size * 0.4 && g.measureText(text).width > maxW) {
          px *= 0.94
          g.font = `${weight} ${px}px ${family}`
        }
        return px
      }
      g.textBaseline = 'alphabetic'
      g.fillStyle = ink
      let y = m + s * 0.09
      if (P.printTitle) {
        fit(P.printTitle, 600, s * 0.085, display, (right ? colX - m * 1.4 : w - m * 2))
        g.fillText(P.printTitle, m, y)
        y += s * 0.06
      }
      if (P.printLine) {
        g.globalAlpha = 0.72
        fit(P.printLine, 400, s * 0.028, body, right ? colX - m * 1.4 : w - m * 2)
        g.fillText(P.printLine, m, y)
        g.globalAlpha = 1
      }
      const lines = P.printHeadline.replace(/\\n/g, '\n').split('\n').filter(Boolean)
      if (lines.length) {
        const maxW = right ? colX - m * 1.2 : w - m * 2
        let px = s * 0.115
        for (const l of lines) px = Math.min(px, fit(l, 600, s * 0.115, display, maxW))
        g.font = `600 ${px}px ${display}`
        const lead = px * 1.06
        const base = h - m - s * 0.13
        lines.forEach((l, i) => g.fillText(l, m - px * 0.04, base - (lines.length - 1 - i) * lead))
      }
      let ry0 = m + s * 0.03
      if (P.printSpecs.length) {
        g.font = `500 ${s * 0.024}px ${body}`
        P.printSpecs.forEach((r, i) => {
          const yy = ry0 + i * s * 0.047
          g.globalAlpha = 0.7
          g.fillText(r.label.toUpperCase(), colX, yy)
          g.globalAlpha = 1
          g.fillText(r.value, colX + s * 0.17, yy)
        })
        ry0 += P.printSpecs.length * s * 0.047 + s * 0.02
        g.globalAlpha = 0.5
        g.fillRect(colX, ry0, w - m - colX, Math.max(2, s * 0.002))
        g.globalAlpha = 1
        ry0 += s * 0.05
      }
      if (P.printChart) {
        const cw = w - m - colX
        const ch = s * 0.13
        const bw = cw / bars.length
        bars.forEach((b, i) => {
          g.fillStyle = i === top ? ctx.theme.accent : ink
          g.globalAlpha = i === top ? 1 : 0.22
          g.fillRect(colX + i * bw, ry0 + ch * (1 - b), bw * 0.62, ch * b)
        })
        g.globalAlpha = 1
        if (P.printChartLabel) {
          g.fillStyle = ink
          g.globalAlpha = 0.7
          g.font = `500 ${s * 0.02}px ${body}`
          g.fillText(P.printChartLabel.toUpperCase(), colX, ry0 + ch + s * 0.04)
          g.globalAlpha = 1
        }
      }
      if (P.printFoot) {
        g.fillStyle = ink
        g.globalAlpha = 0.6
        g.font = `400 ${s * 0.022}px ${body}`
        g.fillText(P.printFoot, m, h - m * 0.7)
        g.globalAlpha = 1
      }
      g.fillStyle = ctx.theme.accent
      g.beginPath()
      g.arc(w - m - s * 0.02, h - m * 0.7 - s * 0.008, s * 0.02, 0, Math.PI * 2)
      g.fill()
    })
    print.colorSpace = THREE.SRGBColorSpace

    const mat = new THREE.MeshPhysicalMaterial({
      map: print,
      normalMap: weave,
      normalScale: new THREE.Vector2(0.9 * P.weave, 0.9 * P.weave),
      roughness: 0.92,
      sheen: 0.6,
      sheenRoughness: 0.7,
      sheenColor: C(P.cloth).multiplyScalar(0.5),
      side: THREE.DoubleSide,
    })
    // thin cotton lets a little of the sun through
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.06;')
    }
    const cloth = new THREE.Mesh(geo, mat)
    cloth.castShadow = cloth.receiveShadow = true
    cloth.frustumCulled = false
    scene.add(cloth)
    this.cloth = cloth

    /* ---- the line and the pegs ---- */
    const lineY = oy + 0.02
    const far = Wc * 8
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-far, lineY + 0.5, -0.05),
      new THREE.Vector3(-Wc * 1.1, lineY + 0.06, 0),
      new THREE.Vector3(0, lineY - 0.01, 0),
      new THREE.Vector3(Wc * 1.1, lineY + 0.06, 0),
      new THREE.Vector3(far, lineY + 0.5, -0.05),
    ])
    const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.009, 8), new THREE.MeshStandardMaterial({ color: C(P.rope), roughness: 0.8 }))
    rope.castShadow = true
    scene.add(rope)
    const wood = new THREE.MeshStandardMaterial({ color: C(P.peg), roughness: 0.65 })
    const spring = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 0.9, roughness: 0.35 })
    const leg = new THREE.BoxGeometry(0.03, 0.2, 0.022)
    for (const c of pegCols) {
      const peg = new THREE.Group()
      for (const z of [0.017, -0.017]) {
        const m = new THREE.Mesh(leg, wood)
        m.position.set(0, -0.03, z)
        m.castShadow = true
        peg.add(m)
      }
      const s = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 16), spring)
      s.rotation.y = Math.PI / 2
      peg.add(s)
      peg.position.set(ox + c * rx, lineY + 0.03, 0)
      scene.add(peg)
    }
    sun.target.position.set(0, 0, 0)
    scene.add(sun.target)
    const sc = sun.shadow.camera
    sc.left = -Wc
    sc.right = Wc
    sc.top = Hc
    sc.bottom = -Hc
    sc.updateProjectionMatrix()

    /* ---- settle, and keep that as time 0 ---- */
    this.input = { held: false, target: new THREE.Vector3(), poke: false, at: new THREE.Vector3() }
    this.grab = { set: [], off: new Float32Array(N * 3), held: new THREE.Vector3() }
    this.pokeAmt = 0
    this.dir = new THREE.Vector3(0, 0, -1)
    for (let i = 0; i < 360; i++) {
      this.step(1 / 120, -3 + i / 120, null)
      if (i % 4 === 3) geo.computeVertexNormals()
    }
    geo.computeVertexNormals()
    this.REST.set(X)
    this.simT = 0
    this.PREV.set(X)

    /* ---- the visitor's hands ---- */
    this.ray = new THREE.Raycaster()
    this.ndc = new THREE.Vector2()
    this.plane = new THREE.Plane()
    this.hp = new THREE.Vector3()
    if (live) this.listen(ctx, P)
    if (ctx.recording) {
      // a pointer drawn on the page, so the video shows a hand doing it
      const hand = document.createElement('div')
      hand.setAttribute('aria-hidden', 'true')
      hand.style.cssText = 'position:absolute;left:0;top:0;z-index:5;width:30px;height:30px;pointer-events:none;opacity:0;transition:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))'
      hand.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 2.5v16.2l4.1-3.9 2.7 6.1 2.8-1.2-2.7-6h5.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
      ctx.root.appendChild(hand)
      this.hand = hand
    }
  },

  listen(ctx, P) {
    const root = ctx.root
    const skip = (e) => e.target.closest && e.target.closest('a,button,input,textarea,select,label,.mh-bar,.mh-copy,.mh-extra')
    const cast = (e) => {
      const r = ctx.canvas.getBoundingClientRect()
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      this.ray.setFromCamera(this.ndc, this.camera)
      return this.ray.intersectObject(this.cloth)[0]
    }
    const inp = this.input
    const release = () => {
      inp.held = false
      root.classList.remove('wl-held')
    }
    root.addEventListener('pointerdown', (e) => {
      if (!P.drag || e.button > 0 || skip(e)) return
      const hit = cast(e)
      if (!hit) return
      e.preventDefault()
      this.startGrab(this.nearest(hit.point))
      this.camera.getWorldDirection(this.dir)
      this.plane.setFromNormalAndCoplanarPoint(this.dir.clone().negate(), hit.point)
      inp.target.copy(hit.point)
      inp.held = true
      inp.poke = false
      try {
        root.setPointerCapture(e.pointerId)
      } catch {}
      root.classList.add('wl-held')
    })
    root.addEventListener('pointermove', (e) => {
      if (inp.held) {
        cast(e)
        if (this.ray.ray.intersectPlane(this.plane, this.hp)) inp.target.copy(this.hp)
        return
      }
      if (e.pointerType === 'touch') return
      const hit = skip(e) ? null : cast(e)
      inp.poke = !!hit && P.poke > 0
      if (hit) inp.at.copy(hit.point)
      root.classList.toggle('wl-over', !!hit && P.drag)
    })
    root.addEventListener('pointerup', release)
    root.addEventListener('pointercancel', release)
    root.addEventListener('pointerleave', () => {
      inp.poke = false
      root.classList.remove('wl-over')
    })
    // while the cloth is held, a finger pulls it instead of scrolling the page
    const hold = (e) => {
      if (inp.held && e.cancelable) e.preventDefault()
    }
    root.addEventListener('touchstart', hold, { passive: false })
    root.addEventListener('mousedown', (e) => inp.held && e.preventDefault()) // no text selection while pulling
    root.addEventListener('touchmove', hold, { passive: false })
  },

  nearest(p) {
    const { X, pinned, N } = this
    let best = 1e9
    let bk = -1
    for (let k = 0; k < N; k++) {
      if (pinned[k]) continue
      const dx = X[k * 3] - p.x
      const dy = X[k * 3 + 1] - p.y
      const dz = X[k * 3 + 2] - p.z
      const d = dx * dx + dy * dy + dz * dz
      if (d < best) (best = d), (bk = k)
    }
    return bk
  },

  /** Takes hold of a small patch around particle k, the way fingers pinch cloth. */
  startGrab(k) {
    const { X, pinned, N } = this
    const G = this.grab
    G.held.set(X[k * 3], X[k * 3 + 1], X[k * 3 + 2])
    G.set = []
    const R = 0.1
    for (let q = 0; q < N; q++) {
      if (pinned[q]) continue
      const dx = X[q * 3] - G.held.x
      const dy = X[q * 3 + 1] - G.held.y
      const dz = X[q * 3 + 2] - G.held.z
      const d = Math.hypot(dx, dy, dz)
      if (d > R) continue
      G.set.push(q, 0.5 * (1 - d / R) + 0.1)
      G.off[q * 3] = dx
      G.off[q * 3 + 1] = dy
      G.off[q * 3 + 2] = dz
    }
  },

  /** In a recording: what the scripted hand is doing at time t. */
  gesture(t) {
    const { NX, NY, REST } = this
    const g = { held: false, poke: false, k: -1, target: null, at: null }
    if (t >= 2.2 && t < 4.4) {
      const k = Math.round(NY * 0.82) * NX + Math.round(NX * 0.78)
      const e = Math.min(1, (t - 2.2) / 1.1)
      const s = e * e * (3 - 2 * e)
      g.held = true
      g.k = k
      g.target = [REST[k * 3] - 0.42 * s, REST[k * 3 + 1] + 0.55 * s, REST[k * 3 + 2] + 0.75 * s]
    } else if (t >= 6 && t < 9) {
      const u = (t - 6) / 3
      g.poke = true
      g.at = [-this.Wc * 0.36 + u * this.Wc * 0.72, 0.18 * Math.sin(u * Math.PI) - 0.15, 0]
    }
    return g
  },

  step(h, t, gest) {
    const { X, PREV, ACC, pinned, N, CON } = this
    const P = this.ctx.params
    const nA = this.geo.attributes.normal.array
    const b = P.breeze / 0.45
    const breeze = 0.35 + 0.35 * Math.sin(t * 0.6) * Math.sin(t * 0.17 + 2.0)
    const wx = 0.3 * Math.sin(t * 0.4) * b
    const wz = 1.6 * breeze * b
    ACC.fill(0)
    for (let k = 0; k < N; k++) {
      const d = nA[k * 3] * wx + nA[k * 3 + 2] * wz
      ACC[k * 3] = nA[k * 3] * d
      ACC[k * 3 + 1] = nA[k * 3 + 1] * d - 9.8 * 0.45
      ACC[k * 3 + 2] = nA[k * 3 + 2] * d
    }
    const h2 = h * h
    const VMAX = 0.06
    for (let k = 0; k < N; k++) {
      if (pinned[k]) continue
      const i = k * 3
      for (let a = 0; a < 3; a++) {
        const x = X[i + a]
        X[i + a] += (X[i + a] - PREV[i + a]) * 0.982 + ACC[i + a] * h2
        PREV[i + a] = x
      }
      // fast hands never tear the cloth apart: cap each point's speed
      const vx = X[i] - PREV[i]
      const vy = X[i + 1] - PREV[i + 1]
      const vz = X[i + 2] - PREV[i + 2]
      const v = Math.sqrt(vx * vx + vy * vy + vz * vz)
      if (v > VMAX) {
        const s = VMAX / v
        PREV[i] = X[i] - vx * s
        PREV[i + 1] = X[i + 1] - vy * s
        PREV[i + 2] = X[i + 2] - vz * s
      }
    }

    // who is touching it: the scripted hand in a recording, the visitor live
    const G = this.grab
    let held = false
    let target = null
    let poke = false
    let at = null
    if (gest) {
      if (gest.held) {
        if (!this.gHeld) this.startGrab(gest.k)
        held = true
        target = gest.target
      }
      this.gHeld = gest.held
      poke = gest.poke
      at = gest.at
    } else if (this.input) {
      held = this.input.held
      if (held) target = [this.input.target.x, this.input.target.y, this.input.target.z]
      poke = this.input.poke && !held
      if (poke) at = [this.input.at.x, this.input.at.y, this.input.at.z]
    }
    if (held) {
      // the held point follows the hand at a limited speed, so it never jumps
      const dx = target[0] - G.held.x
      const dy = target[1] - G.held.y
      const dz = target[2] - G.held.z
      const d = Math.hypot(dx, dy, dz)
      const m = Math.min(1, 0.05 / (d || 1))
      G.held.x += dx * m
      G.held.y += dy * m
      G.held.z += dz * m
    }
    this.pokeAmt += ((poke ? 1 : 0) - this.pokeAmt) * Math.min(1, h * 8)
    if (at) this.pokeAt = at

    for (let it = 0; it < 16; it++) {
      for (let c = 0; c < CON.length; c += 3) {
        const a = CON[c] * 3
        const bb = CON[c + 1] * 3
        const r = CON[c + 2]
        const dx = X[bb] - X[a]
        const dy = X[bb + 1] - X[a + 1]
        const dz = X[bb + 2] - X[a + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
        const wa = pinned[CON[c]] ? 0 : 1
        const wb = pinned[CON[c + 1]] ? 0 : 1
        const s = (d - r) / d / (wa + wb || 1)
        X[a] += dx * s * wa
        X[a + 1] += dy * s * wa
        X[a + 2] += dz * s * wa
        X[bb] -= dx * s * wb
        X[bb + 1] -= dy * s * wb
        X[bb + 2] -= dz * s * wb
      }
      if (held)
        for (let q = 0; q < G.set.length; q += 2) {
          const g = G.set[q] * 3
          const w = G.set[q + 1]
          X[g] += (G.held.x + G.off[g] - X[g]) * w
          X[g + 1] += (G.held.y + G.off[g + 1] - X[g + 1]) * w
          X[g + 2] += (G.held.z + G.off[g + 2] - X[g + 2]) * w
        }
      if (this.pokeAmt > 0.01 && this.pokeAt) {
        // a fingertip pressing in: points under it are kept at least a dimple's
        // depth behind where the pointer touched, so it dents but never shoves
        const R = 0.26
        const depth = 0.22 * this.pokeAmt * P.poke
        const [px, py, pz] = this.pokeAt
        const v = this.dir
        for (let k = 0; k < N; k++) {
          if (pinned[k]) continue
          const i = k * 3
          const dx = X[i] - px
          const dy = X[i + 1] - py
          const d2 = dx * dx + dy * dy
          if (d2 > R * R) continue
          const want = depth * Math.pow(1 - Math.sqrt(d2) / R, 2)
          const s = dx * v.x + dy * v.y + (X[i + 2] - pz) * v.z
          if (s >= want) continue
          const f = (want - s) * 0.5
          X[i] += v.x * f
          X[i + 1] += v.y * f
          X[i + 2] += v.z * f
        }
      }
    }
  },

  resize(view) {
    const { THREE, renderer, camera } = this
    const { width: w, height: h } = view
    renderer.setPixelRatio(view.dpr)
    renderer.setSize(w, h, false)
    this.sky.uniforms.uRes.value.set(w, h)
    const s = view.stage
    const P = this.ctx.params
    // CSS pixels per world unit, so the cloth (and the room it swings in) fits the stage
    const k = Math.min((P.size * s.w) / (this.Wc * 1.08), (P.size * s.h) / (this.Hc + 0.55))
    const cx = s.x + s.w / 2
    const cy = s.y + s.h / 2 + (view.stacked ? 0.06 : 0.02) * this.Hc * k
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const D = h / k / (2 * tan)
    camera.aspect = w / h
    camera.position.set(0.04 * this.Wc, 0.2, D)
    camera.lookAt(0, 0, 0)
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h)
    camera.updateProjectionMatrix()
    camera.getWorldDirection(this.dir)
    this.view = view
    if (this.last && this.ctx.recording) this.seek(this.last.t, this.last.state)
  },

  seek(t, state) {
    this.last = { t, state }
    const rec = this.ctx.recording
    const H = 1 / 120
    if (t < this.simT - 1e-6) {
      // back in time: start again from the settled cloth
      this.X.set(this.REST)
      this.PREV.set(this.REST)
      this.simT = 0
      this.pokeAmt = 0
      this.gHeld = false
    }
    if (!rec && !state.still && t - this.simT > 0.25) this.simT = t - 0.25 // a long pause: don't fast-forward minutes
    let n = 0
    while (this.simT + H <= t + 1e-9 && n++ < 20000) {
      this.step(H, this.simT, rec || state.still ? this.gesture(this.simT) : null)
      this.simT += H
    }
    // the breeze pushes along the normals of the frame before: refreshed once a frame
    this.geo.computeVertexNormals()
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.normal.needsUpdate = true
    this.sky.uniforms.uTime.value = t * 0.02 * this.ctx.params.drift

    if (this.hand) {
      // the drawn pointer sits on the grabbed point or the fingertip
      const g = this.gesture(t)
      const v = this.THREE && (g.held ? this.grab.held.clone() : g.poke ? new this.THREE.Vector3(...g.at) : null)
      const show = g.held || g.poke ? 1 : 0
      this.handFade = show
      if (v) {
        v.project(this.camera)
        const x = ((v.x + 1) / 2) * this.view.width
        const y = ((1 - v.y) / 2) * this.view.height
        this.hand.style.transform = `translate(${(x - 6).toFixed(1)}px,${(y - 3).toFixed(1)}px) scale(${g.held ? 0.9 : 1})`
      }
      this.hand.style.opacity = String(show)
    }
    this.renderer.render(this.scene, this.camera)
  },
}
