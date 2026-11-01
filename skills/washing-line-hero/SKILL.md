---
name: washing-line-hero
description: Build an interactive website hero where the brand's poster is printed on a cotton cloth pinned to a washing line with wooden pegs, under an open sky with drifting clouds - visitors press a soft dent into the cloth with the pointer, grab it anywhere and pull it, and when they let go it swings back and settles (a real cloth simulation, not a video), in the brand's colours, fonts, logo, headline and buttons. One self-contained HTML page plus a paste-in embed, checked for contrast and layout at four widths, with a still picture when WebGL or the network fails and for reduced motion, and a frame-perfect MP4 and poster recorded in headless Chrome in which a drawn pointer pulls the cloth. Use when someone wants a playful, touchable hero, a draggable flag or banner, a poster on a clothesline, a launch header people play with, or a hero for a textile, laundry, outdoor or "light and simple" product.
license: MIT
---

# Washing Line Hero

The first screen of a website: the brand's bar and navigation on top, a large headline with one coloured phrase, a line of introduction, one or two buttons and a small note, and beside them a washing line strung across the sky. On the line hangs a cotton cloth held by wooden pegs, printed with the brand's own poster: a name, one small line, two big words, a spec column and a little bar chart. A breeze lifts it now and then and the clouds drift behind.

It is meant to be touched. Move the pointer over the cloth and a fingertip dents it. Press and drag, and the cloth comes with your hand: pull a corner up, fold it over the line, stretch it toward you. Let go and it falls, swings and settles. On phones a finger does the same, and the page doesn't scroll while the cloth is held. The cloth is simulated (a grid of particles held together by stretch, shear and bend constraints, stepped at a fixed 120 Hz), so it behaves like fabric wherever it is grabbed, rather than playing back a canned animation.

You describe the hero and the print in `hero.json`. The build checks everything and writes `out/index.html`, a whole page in one file, and `out/embed.html`, the same section to paste into a site you already have. Because the simulation runs at a fixed step from a settled start, `record.mjs` can step it frame by frame: in the video a drawn pointer pulls a corner, lets go, then runs a fingertip across the cloth, so the clip shows what visitors can do, the same on any machine.

What it is not: the cloth doesn't tear, tangle with itself or blow off the line (it has no self-collision, so if you fold it hard through itself it passes through and falls back), and the print is drawn by the page from your words, not a photo you upload.

## What you need

- Node.js 18 or newer. Nothing to install.
- Chrome, Chromium or Edge, for the checks and the recording (the scripts find it; set `CHROME_PATH` if they don't).
- ffmpeg, for the video (`brew install ffmpeg`, `winget install ffmpeg`, `apt install ffmpeg`; or set `FFMPEG_PATH`).
- Internet access when the page is opened: three.js and the fonts load from jsDelivr at pinned versions with integrity hashes. Without it, visitors see the still picture (the same line and cloth, drawn flat) and system fonts; the page still works.

This skill's folder is `<skill>` below: the folder this SKILL.md is in.

## Steps

### 1. Collect the brand and the words

Ask the person for, or find on their current site:

- **Name**, and the **logo** as an SVG file (square or nearly; a plain one, no scripts). Without one, up to three letters make a monogram.
- **Colours**: the background, which is also the sky at the horizon (the text colour must reach 7:1 on it), and one accent. A light blue gives a midday sky with dark text; a deep navy or plum gives a dusk sky with light text and a low warm sun.
- **Fonts**: a display face for the headline and the big words on the cloth, and one for the rest. These load pinned and verified: Space Grotesk, Inter, Instrument Sans, Instrument Serif, DM Sans, Manrope, Fraunces, Sora, Outfit, Bricolage Grotesque, IBM Plex Sans, JetBrains Mono, Plus Jakarta Sans, Newsreader, Playfair Display. Any other Google Fonts family works too, unpinned.
- **The words on the page**: a headline of a few words with the phrase to colour, one or two sentences on what it is and for whom, the main button and an optional second one with where they go, up to five navigation links and the button in the bar. A small badge above the headline and a note under the buttons are optional.
- **The words on the cloth**: the name to print at the top (often the product and version), one small line under it, two to four big words (two lines read best), up to six short spec pairs (label and value), a caption for the chart, and a web address for the corner.

Every name, number, claim and date must come from the person. Don't invent specs or figures; leave a spec out instead. The chart's bars are decoration drawn from the seed, not data: give it a caption that doesn't claim numbers, or turn it off.

### 2. Write hero.json

Copy the closer example folder and replace everything: `examples/paperwind/` (a notes app, light midday sky, four pegs) or `examples/halden/` (a linen brand, dusk sky, three pegs, a squarer cloth).

| Field | What it is | Limit |
| --- | --- | --- |
| `brand.name`, `brand.href` | The name top left, and where it links (default `/`) | 28 |
| `brand.logo` | An `.svg` file next to `hero.json`, inlined into the page; or up to 3 letters for a monogram | – |
| `nav[]` | Up to 5 `{ "label", "href" }` in a pill (hidden on phones) | 18 |
| `action` | The button top right, `{ "label", "href" }`; `false` for none | 22 |
| `hero.badge` | A small capitals line above the headline | 40 |
| `hero.title` | The headline. `*phrase*` sets it in the accent colour; `\n` breaks the line (up to 3 lines) | 72 |
| `hero.lede` | What it is and for whom. Inline Markdown: `code`, [links](https://…), **bold**, _italic_ | 220 |
| `hero.actions[]` | 1 or 2 `{ "label", "href" }`: the first is the solid main button with an arrow, the second an outlined one | 26 |
| `hero.note` | A small line under the buttons | 90 |
| `hero.align` | `left` (line and cloth on the right, default) or `right` (mirrored). `center` puts the cloth behind the copy; not recommended | – |
| `theme.background`, `theme.ink`, `theme.accent` | Hex colours. `ink` must reach 7:1 on `background` | – |
| `theme.mode` | `light` or `dark`; worked out from the background when left out | – |
| `theme.fonts` | `{ "display", "body", "weight" }`: family names (`false` for the system font) and the headline weight, 300–800 (default 500) | – |
| `theme.scrim` | 0–1: how strongly the sky behind the copy is washed to the background colour. Default 0.3 | – |
| `effect` | The sky, the line and the cloth, below | – |
| `motion.speed` | 0.25–2, default 1: how fast everything moves | – |
| `motion.pointer` | `true` (default) | – |
| `meta` | `title` (70) and `description` (170) for search and link previews; `url` and `image` (full https addresses), `lang` (default `en`) | – |

**The print** (`effect`): at least `printTitle` or `printHeadline`.

| Setting | Limit | Default | What it is |
| --- | --- | --- | --- |
| `printTitle` | 28 characters | none | The name at the top of the print |
| `printLine` | 64 characters | none | One small line under the name |
| `printHeadline` | 48 characters | none | The big words; `\n` breaks the line. They shrink to fit their column |
| `printSpecs` | 0 to 6 `{ "label", "value" }`, 12 and 14 characters | none | The spec column on the right; labels print in capitals |
| `printChart` | true / false | true | A small bar chart under the specs, its tallest bar in `theme.accent` |
| `printChartLabel` | 32 characters | none | Caption under the chart |
| `printFoot` | 40 characters | none | Small text in the bottom corner, e.g. a web address |
| `cloth` | colour | `#ecebe6` | The cotton |
| `printInk` | colour | `#15181d` | The print. Must reach 7:1 on `cloth` |

**The scene** (`effect`), every setting optional:

| Setting | Range | Default | What it does |
| --- | --- | --- | --- |
| `seed` | 1–9999 | 7 | Seeds the clouds and the bars of the chart |
| `skyTop` | colour | `#5f9be0` light, the background darkened when dark | The sky at the top of the hero |
| `skyBottom` | colour | `theme.background` | The sky at the horizon |
| `clouds` | 0–1 | 0.6 | How much of the sky is cloud; 0 is clear |
| `cloudColor` | colour | white (light), a soft violet grey (dark) | The clouds |
| `drift` | 0–1 | 0.35 | How fast the clouds drift |
| `light` | `day`, `dusk` | `day` for light, `dusk` for dark | Midday sun from above, or a low warm sun and a cool sky light |
| `aspect` | 0.8–1.7 | 1.35 | Width of the cloth over its height |
| `pegs` | 2–6 | 4 | Wooden pegs along the top edge |
| `peg` | colour | `#c39a64` | The pegs |
| `rope` | colour | `#6f6a62` light, `#cfc6b8` dark | The line |
| `breeze` | 0–1 | 0.45 | How hard the breeze lifts the cloth |
| `weave` | 0–1 | 0.5 | How strongly the plain weave shows up close |
| `poke` | 0–1 | 1 | How deep the dent under the pointer is; 0 turns it off |
| `drag` | true / false | true | Let visitors grab the cloth and pull it |
| `size` | 0.6–1 | 0.76 | How much of the space beside the copy the cloth fills (it leaves room to be pulled) |
| `hint` | 40 characters | "Press it · pull it · let go" | A small caption in the far bottom corner on wide screens telling visitors they can touch it; `" · "` separates its parts; empty for none |

Writing tips: the headline on the page and the big words on the cloth should say different things; the cloth reads like a poster, so keep its words few and large. Two or three spec pairs read better than six. If the brand has a playful line about being light, flying, drying or hanging, the cloth is the place for it.

### 3. Build

```bash
node <skill>/scripts/build.mjs hero.json out
```

It lists every problem in `hero.json` at once (missing fields, text over its limit, a setting out of range, colours that don't contrast, print ink too faint on the cloth) and writes nothing until they're fixed. Then it prints the settings it used and anything worth a look, such as an accent it darkened so the headline reads at 4.5:1.

It writes `out/index.html` (CSS, script, logo and the still picture inline), `out/embed.html` and `out/assets/logo.svg` (the tab icon).

### 4. Check

```bash
node <skill>/scripts/check.mjs out/index.html
```

It loads the page at 390, 768, 1024 and 1440 px and must say `ok` at each: nothing wider than the screen or cut off, readable contrast for every line of text against the sky behind it, names on every link and button, one h1. Lines marked `·` are worth a look but don't fail it.

### 5. Look at it, and touch it

```bash
node <skill>/scripts/record.mjs out/index.html --still 1.6 --size 1440x900
node <skill>/scripts/record.mjs out/index.html --still 3.5 --size 1440x900
node <skill>/scripts/record.mjs out/index.html --still 1.6 --size 390x844 --scale 2
node <skill>/scripts/screenshot.mjs out/index.html
```

The first is the cloth at rest, the second mid-pull (the scripted hand has a corner up), the third the phone. Look at them: is the whole cloth on screen with room around it, does the print read, do the pegs sit on the line? `screenshot.mjs` runs Chrome without a GPU, so it shows the **still picture** visitors get without WebGL or when the network fails (in `out/screens/`); check that it reads too.

Then open `out/index.html` in a browser and play with it: hover, press, pull a corner over the line, let go. On a phone, drag it with a finger and check that the page still scrolls when you swipe beside the cloth.

### 6. Record the video

```bash
node <skill>/scripts/record.mjs out/index.html --seconds 10
```

It steps the hero through 10 seconds at 30 fps at 1920×1080 and writes `out/preview.mp4` and `out/poster.png` (the frame at 3.5 s, mid-pull). In the video a drawn pointer grabs the lower corner at 2.2 s, pulls it up toward you, lets go at 4.4 s, and from 6 s runs a fingertip across the cloth. Options: `--size 1080x1350` (portrait), `--size 1080x1920`, `--fps 60`, `--poster 1.6`. The frames are the same on any machine, as long as the recording starts from 0 (it always does).

### 7. Put it live

- **As a page**: upload `out/index.html` and `out/assets/` to any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages, S3). Use `out/poster.png` (or a 1200×630 crop of it) as `meta.image`, uploaded with the site.
- **Into an existing site**: paste `out/embed.html` where the hero goes. Everything is scoped under `#mh-washing-line`; move the font `<link>`s into the `<head>` if you like. If the site already has a `<script type="importmap">`, merge the embed's `imports` and `integrity` entries into it. The section is the full viewport high; set `--mh-height` on it (e.g. `style="--mh-height:760px"`) for less. In React or other frameworks, put the markup in the component and the `<script>` tags in the page, or render it in an iframe.
- To change the print, edit `hero.json` and build again.

## Troubleshooting

- **`build: fix hero.json first`**: each line names the field and what to change; colour problems suggest a colour that works.
- **The cloth is cut off at the edge**: lower `size`, or make the cloth squarer (`aspect` nearer 1).
- **The big words on the cloth are small**: they shrink to fit beside the spec column. Use fewer words, a `\n`, or fewer specs and no chart (the words then take the full width).
- **The cloth won't settle, or flaps too much**: lower `breeze`.
- **The dent is too strong or too faint**: `poke` (0 turns it off; dragging still works).
- **`record: the effect didn't start`**: the page fell back to its still picture: Chrome couldn't load three.js from jsDelivr (check the connection or a proxy) or has no WebGL.
- **`ffmpeg not found`**: install it or set `FFMPEG_PATH`.
- **Visitors see a still cloth**: their browser has WebGL off or the CDN is blocked (the flat picture), or they asked for reduced motion (one frame of the live cloth at rest, which doesn't move). This is by design.
- **On a phone the page doesn't scroll**: it only stops scrolling while a finger is holding the cloth; swipe beside it. If the cloth fills the phone screen, lower `size`.

## Files

- `scripts/build.mjs`, `scripts/record.mjs`: what you run. They call the Motion Heroes kit.
- `scripts/kit/`: the kit shared by every Motion Heroes skill: the build and checks (`build.mjs`), the section's CSS (`shell.css`), the browser runtime (`runtime.js`: clock, pausing, pixel ratio, reduced motion, fallback), the recorder (`record.mjs`, `cdp.mjs`), the pinned three.js and fonts (`three.json`, `fonts.json`) and `KIT.md`, which explains them.
- `scripts/effect/`: the washing line itself: `effect.mjs` (its settings, the checks and the still picture), `effect.js` (the sky shader, the cloth simulation, the print, the pegs and line, and the pointer and touch handling), `effect.css` (the hint and the hand cursor).
- `scripts/check.mjs`, `scripts/screenshot.mjs`, `scripts/chrome.mjs`, `scripts/color.mjs`, `scripts/markup.mjs`, `scripts/inline.mjs`: Lookbk's checks, screenshots, colour maths and HTML writer.
- `examples/paperwind/` (a notes app, light) and `examples/halden/` (a linen brand, dusk): complete examples with logos. The brands, specs and copy in them are made up. The previews on Lookbk are built and recorded from these.
- `NOTICE.md`: credits for the libraries and fonts it loads.
