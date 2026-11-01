# Motion Heroes kit

Every Motion Heroes package (animated website hero sections) is the same
kit plus one effect. The kit does everything that isn't the picture: it
reads and checks `hero.json`, writes the page and the embed, runs the
clock in the browser, falls back to a still picture, and records the
video. The effect only draws.

Copy `scripts/kit/` and the shared helpers byte for byte into a new
package; write `scripts/effect/` for the new effect. Nothing in the kit
may name a particular effect.

## Files

| File | What it does |
| --- | --- |
| `scripts/build.mjs`, `scripts/record.mjs` | Two-line entry points the buyer runs; they call the kit. Identical in every package. |
| `scripts/kit/build.mjs` | Validates `hero.json` (lists every problem at once), resolves defaults and colours, writes `out/index.html` (self-contained page), `out/embed.html` (section + CSS + JS to paste into a site) and `out/assets/logo.svg`. |
| `scripts/kit/shell.css` | The section around the effect: bar, badge, headline, lede, buttons, note, scrim, layouts (`left`, `center`, `right`, phone), the intro reveal. Scoped under `.mh`, themed by `--mh-*` variables. |
| `scripts/kit/runtime.js` | Inlined into the page. Clock, `seek(t)`, pause off-screen and in hidden tabs, DPR cap (2, lowered to 1 on slow machines), reduced motion (one still frame), fallback (SVG still if WebGL, the CDN or the effect fails), the stage, the pointer, `window.MotionHero` for recording. |
| `scripts/kit/record.mjs` | Steps the clock frame by frame in headless Chrome and pipes PNG frames to ffmpeg: `out/preview.mp4` + `out/poster.png`, or one PNG with `--still T`. Says when `--seconds` stops before the effect's story ends. |
| `scripts/kit/cdp.mjs` | A tiny Chrome DevTools Protocol client over `--remote-debugging-pipe` (fd 3/4). Finds Chrome like `chrome.mjs` (plus per-user Windows installs); `CHROME_PATH` overrides. No npm packages. |
| `scripts/kit/three.json` | The pinned three.js (r180, jsDelivr): the base URL, the module the bare `three` specifier maps to, the `three/addons/` folder, and a catalogue of files (the build, and common add-ons with everything they import) with their SRI hashes and imports. See "three.js and its add-ons". |
| `scripts/kit/fonts.json` | Font families with pinned jsDelivr (Fontsource) URLs and SRI hashes; `css` and `integrity` may be lists for families shipped one file per weight. Other families fall back to Google Fonts, unpinned: the build asks for exactly the weights the hero uses, drops weights the family doesn't have, and stops with an error if the family loads in no weight. |
| `scripts/chrome.mjs`, `check.mjs`, `screenshot.mjs`, `color.mjs`, `markup.mjs`, `inline.mjs` | Lookbk's shared helpers, copied unchanged from `packages/docs-starter/scripts` and `packages/mono-editorial-landing/scripts`. |

## The effect: what a package provides

`scripts/effect/effect.mjs` (Node, read at build time) default-exports:

| Field | Required | Meaning |
| --- | --- | --- |
| `id`, `name` | yes | `id` names the section (`#mh-<id>`); `name` is printed. |
| `needs` | yes | `'webgl'`, `'canvas'` or `'none'`. With `'webgl'` the runtime checks for WebGL before `init` and shows the still without it. |
| `libs` | no | `[{ name, url, integrity }]`. Entries with a `name` can be loaded in the browser with `ctx.load(name)`; every entry with `integrity` goes into the page's import map so dynamic imports are verified (list a module's own imports too, without a name). Pin exact versions. A `three` entry at the kit's pinned URL (`three.json`) also turns on the bare `three` and `three/addons/` mappings. |
| `addons` | no | three.js add-ons the effect loads, as paths under `three/examples/jsm`: `['loaders/GLTFLoader.js', 'postprocessing/EffectComposer.js']`. The build maps `three` and `three/addons/` in the import map and adds the SRI hash of each add-on and of everything it imports. `ctx.load('three')` works without a `libs` entry. See "three.js and its add-ons". |
| `story` | no | `{ drive, pin, length, lead, hold, loop }` or a function of `(params, theme)` returning one (or `null` for none): the scene as a story with a beginning and an end, driven by the clock or by scrolling. See "Stories: pinned scroll". |
| `extraPlace` | no | Where the `markup` goes: `'beside'` (default: its own column beside the copy), `'above-copy'`, `'below-copy'` (in the copy's column) or `'overlay'` (on the effect, at the far bottom corner). A string or a function of `(params, theme)`. |
| `params` | yes | The `effect` settings: `{ key: { type, min, max, default, doc } }`. Types: `number`, `integer`, `boolean`, `color`, `enum` (`values`), `text` (`max`), `list` (`min`, `max`, `item`: an object of field specs, fields may be `required`). `default` may be a function of `{ theme }`. The kit checks ranges and reports unknown keys. Every parameter needs a range and a default, and SKILL.md documents them. |
| `check(params, theme, problems)` | no | Extra rules; push readable lines onto `problems`. |
| `grounds(params, theme, { align })` | no | Colours the effect can put behind the text. The kit washes them with the scrim and requires `theme.ink` ≥ 4.5:1 on all of them (7:1 on the background), darkens the headline's emphasis colour if needed, and derives the muted text colour from them. |
| `scrim` | no | 0–1, how strongly the copy's backdrop is washed toward the background (default 0.3; at least 0.85 when `align` is `center`). `theme.scrim` overrides. |
| `still(params, theme)` | yes | `{ backdrop, object? }`: SVG strings. `backdrop` covers the hero (use `preserveAspectRatio="xMidYMid slice"`); `object` is placed where `effect.js`'s `place()` says (or the stage's middle). Shown until the first frame and whenever the effect can't run. Prefix SVG ids with something unique to the effect. |
| `markup(params, theme, h)` | no | An element tree (`h` from `markup.mjs`) placed in `.mh-extra` (where `extraPlace` says) on screens ≥ 1180 px that aren't stacked: a picker, a legend. Hidden when `align` is `center`. Its text is checked like the rest. |
| `css` | no | CSS for the effect's markup, scoped under `.mh`. |
| `stillTime`, `posterTime` | no | Seconds: the frame for reduced motion, and the poster. |
| `stillScale` | no | Size of the still `object` as a share of the stage's short side, when `effect.js` has no `place()`. |
| `notes(params, theme)` | no | Lines the build prints as worth a look. |

`scripts/effect/effect.js` (browser) has exactly one `export default` and
no static `import`s; the build inlines it. It exports:

```js
export default {
  async init(ctx) {},        // once. Throw or reject to fall back to the still.
  resize(view) {},           // the hero changed size (also called once after init)
  seek(t, state) {},         // draw the frame at scene time t, synchronously
  place(view, params) {},    // optional, pure: { x, y, size } for the still object
  script(seconds, story) {}, // optional, pure: the recording's scroll, 0–1 progress (story effects)
}
```

- `ctx`: `{ root, canvas, params, theme: { mode, background, ink, accent, emphasis }, recording, reduced, view, load(name), redraw(), now(), story, progress() }`. `canvas` fills the hero; `load('three')` imports a library from `libs`, `load('three/addons/…')` an add-on listed in `addons`; `recording` asks for `preserveDrawingBuffer`; `redraw()` repaints the still in reduced motion after the effect's own controls change something; `now()` is the current scene time; `story` is the resolved story (or `null`) and `progress()` its progress now.
- `view`: `{ width, height, dpr, stage: { x, y, w, h }, mobile, stacked, align, extra, extraAt, extraRect }` in CSS pixels. The stage is the part of the hero the copy (and the effect's `markup`) doesn't cover: beside the copy on wide screens, above it when `stacked` (narrower than 900 px, or a portrait frame taller than 6:5, like a 1080×1350 recording), all of it when centred on a wide screen. `mobile` is narrower than 760 px; `extra` is true when the effect's `markup` is showing. With `extraAt` `'beside'` the stage ends at it; `'above-copy'`/`'below-copy'` widen the copy's column to the wider of the two; with `'overlay'` it sits on the stage, so keep the subject off `extraRect` (`{ x, y, w, h }`, or `null` when hidden). Draw the subject there; size the drawing buffer as `width × dpr`.
- `seek(t, state)`: `t` is scene seconds (real seconds × `motion.speed`); with a `story`, it is story time instead, `progress × length`. `state`: `{ pointer: { x, y } in −1…1, time (real seconds), still (true for the reduced-motion frame) }`, plus `progress` (0–1) and `drive` with a story. **Everything drawn must be a function of `t` and `state`**: no `Math.random()` at draw time (seed it in `init`), no accumulating deltas. That is what lets `record.mjs` produce the same frames on any machine.

## three.js and its add-ons

The kit pins one three.js, r180 on jsDelivr (`scripts/kit/three.json`).
When an effect uses it (a `libs` entry named `three` at that URL, or any
`addons`), the page's import map gets

```json
{ "imports": { "three": ".../three@0.180.0/build/three.module.min.js",
               "three/addons/": ".../three@0.180.0/examples/jsm/" },
  "integrity": { "<url>": "sha384-…", … } }
```

so add-ons, which `import … from 'three'`, share the one copy the effect
loads. To use one:

```js
// effect.mjs
addons: ['geometries/RoundedBoxGeometry.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js'],
// effect.js, in init (no static imports: the file is inlined)
const THREE = await ctx.load('three')
const { RoundedBoxGeometry } = await ctx.load('three/addons/geometries/RoundedBoxGeometry.js')
```

`ctx.load` refuses an add-on that isn't in `addons`, so nothing loads
without its hash. Effects that load three with `ctx.load('three')` and a
`libs` entry keep working as they are.

The build takes hashes from `three.json`, which pins the build and these
add-ons with everything they import: `geometries/RoundedBoxGeometry`,
`loaders/GLTFLoader`, `environments/RoomEnvironment`,
`utils/BufferGeometryUtils`, `postprocessing/{EffectComposer, RenderPass,
ShaderPass, MaskPass, Pass, UnrealBloomPass, OutputPass, AfterimagePass,
FilmPass}`, `shaders/{Copy, LuminosityHighPass, Output, FXAA, RGBShift,
GammaCorrection, Afterimage, Film}Shader`, `math/{SimplexNoise,
ImprovedNoise}`, `lines/{Line2, LineSegments2, LineGeometry,
LineSegmentsGeometry, LineMaterial}`. For any other add-on, run
`node scripts/build.mjs --three-addon loaders/FBXLoader.js`: it fetches the
add-on and follows its imports, prints `{ url, integrity }` lines for all
of them (paste them into the effect's `libs`; the add-on's name also goes in
`addons`) and names any import the map can't resolve. The build stops if an add-on or one of its
catalogued imports has no hash.

What the integrity covers, and what it doesn't:

- Covered: every JavaScript module fetched through the import map or by
  URL: `three.module.min.js`, `three.core.min.js`, each add-on and its
  static imports. A file that doesn't match its hash doesn't run, and the
  page keeps its still picture. Import-map integrity is checked by browsers that
  support it (Chrome/Edge 127+ and current Safari and Firefox); older ones
  ignore it and load the files unchecked.
- Not covered: the inline script (it's in the page); modules an add-on
  loads with a dynamic `import()` of its own, or `three/webgpu` and
  `three/tsl` (not mapped, so they fail to load); and anything an add-on
  fetches that isn't a module: a `.glb`/`.gltf` model, textures, HDR files,
  Draco/Basis/KTX2 decoders (workers and WebAssembly). Serve those from
  your own site, or pin them some other way.
- Fonts have their own `integrity` on the `<link>` (`fonts.json`); Google
  Fonts fallbacks aren't pinned.
- In the embed, the import map must reach the page before any module
  script. If the site already has one, merge both `imports` and `integrity`.

## Stories: pinned scroll

An effect with a beginning and an end (a route drawing on, a product
assembling) declares a `story` in `effect.mjs`:

| Field | Default | Meaning |
| --- | --- | --- |
| `drive` | `'time'` | `'time'`: it plays by the clock, and the page scrolls normally. `'scroll'`: the section pins (`position: sticky` inside a `.mh-pin` box) while the visitor scrolls `pin` screen heights, and the scroll is the story. |
| `pin` | 1.5 | Screen heights of scrolling for the whole story (0.25–8). |
| `length` | required | Story time, in scene seconds: `seek` gets `t = progress × length`. |
| `lead` | 1 | Scene seconds before the story starts (the copy rises in meanwhile). |
| `hold` | 2 | With `drive: 'time'`, scene seconds the end holds before it loops. |
| `loop` | true | With `drive: 'time'`, start again after `hold`; false stays at the end. |

Make it a function of `(params, theme)` to expose `drive` or `pin` as
`effect` settings in `hero.json`.

Progress, 0–1, by case:

- **drive `time`**: from the clock: `(scene seconds − lead) / length`, looping.
- **drive `scroll`, live page**: from the page's scroll through the pinned
  section, smoothed by the kit. Off-screen pausing still applies.
- **Recording** (`?mh-record`, either drive): a pure function of the
  recording time, so every machine gets the same frames. With drive
  `scroll` the runtime really scrolls the page along the script (rest for
  `lead`, an eased glide over `length`, at `motion.speed`) and reads the
  progress back from the scroll position, so the pinning is in the video
  too. `effect.js` may export `script(seconds, story)` to choose its own
  path (glide to each station, pause). `record.mjs` says when the story
  ends: `MotionHero.storySeconds`.
- **Reduced motion**: no pinning; one frame at `stillTime`, the frame the
  recording shows at that second.

`seek(t, state)` gets story time as `t`, `state.progress` and
`state.drive`; use `state.time` (real seconds, also deterministic in a
recording) for anything that moves on its own, like an intro.
`MotionHero.progress()` and `ctx.progress()` read the progress now.

## What the kit guarantees

- **Never a blank hero**: the SVG still is in the HTML; the canvas fades in over it after the first frame. If WebGL is missing, the CDN fails, `init` throws or takes over 12 s, or `seek` throws, the still stays (`.mh-fallback`) and `MotionHero.ready` resolves `{ ok: false, reason }`.
- **Pauses**: no frames while the hero is off-screen (IntersectionObserver) or the tab is hidden; the clock doesn't advance meanwhile.
- **DPR**: `min(devicePixelRatio, 2)`, dropping by 0.5 (to 1) when most frames take longer than 25 ms.
- **Reduced motion**: one frame at `stillTime`, no loop, no intro; redrawn on resize.
- **Contrast**: `theme.ink` ≥ 7:1 on `theme.background`; text colours ≥ 4.5:1 on every `grounds` colour after the scrim. The section and the page body have the scene's base colour, so `check.mjs` measures text against what is really behind it; the scrim keeps the effect faint where text sits. The intro reveals text with a clip, never a fade, so it is never shown at low contrast.
- **Recording**: `?mh-record` stops the clock; `MotionHero.seek(seconds)` pauses the CSS intro at that time, draws the effect at `seconds × speed` (or the story at its scripted progress, scrolling the page for drive `scroll`) with the pointer on a slow made-up path (when `motion.pointer`), and resolves after the frame is on screen.
- **Defaults change nothing**: without `addons`, `story` and `extraPlace`, the page is laid out and driven exactly as before; the three.js mappings only add names to the import map.

## A new package

1. Copy `scripts/kit/` (including `three.json`), `scripts/build.mjs`, `scripts/record.mjs` and the six shared helpers unchanged. Check with `md5` against this package.
2. Write `scripts/effect/effect.mjs`, `effect.js` (and `effect.css` if it has markup).
3. Two examples in `examples/<name>/hero.json` (+ `logo.svg`), clearly different palettes and copy.
4. SKILL.md in the Lookbk shape; document every `effect` parameter with its range and default. NOTICE.md credits the effect's source.
5. `scripts/previews/<slug>.mjs` can reuse this package's preview file, changing only the slug's examples and still times.

If a kit change is needed, make it in every package at once, and keep the kit free of effect names.
