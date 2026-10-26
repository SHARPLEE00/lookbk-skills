---
name: mono-editorial-landing
description: Build a black-and-white editorial landing page - a large serif headline, a drop-cap introduction, numbered ruled columns, feature spreads with framed figures (screenshots, an app window drawn in HTML, true numbers or terminal commands), a pull quote, questions and a closing line - as one responsive HTML file, drafted from the project's README, with a waitlist form that really signs people up or buttons to get started. Checks layout, contrast and accessibility in headless Chrome. Use when someone wants a landing page, product homepage, launch page or waitlist page that looks like a magazine rather than a SaaS template.
---

# Mono Editorial Landing

A landing page set like a magazine: ink on paper, a masthead with a thin "issue" line, a headline in Instrument Serif large enough to read across a room, an introduction with a drop cap, then numbered columns divided by hairlines, feature spreads that alternate sides with framed figures and captions ("Fig. 1"), a centred italic pull quote, a list of questions, a closing line and a typewriter-style colophon. Black on warm white by default; light on near-black, or with one accent colour for the italic words, by changing three colours.

You describe the page in `page.json`, or let a script draft it from the project's README. The build checks it and writes `out/index.html`, one file with its CSS (and `out/assets/` for pictures). For a product that isn't out yet, the hero holds a real waitlist form that posts to Formspree, Netlify Forms, Buttondown or any endpoint; for one that is, two buttons.

## What you need

- Node.js 18 or newer. Nothing to install.
- Chrome, Chromium or Edge for the checks (the scripts find it; set `CHROME_PATH` if they don't).
- For a waitlist: an account with a form service, or an endpoint that takes a form post.
- Internet access when the page is opened, for its Google Fonts (Instrument Serif, Newsreader, Inter and IBM Plex Mono). Without it the page uses system fonts.

This skill's folder is `<skill>` below: the folder this SKILL.md is in.

## Steps

### 1. Draft from the README

```bash
node <skill>/scripts/from-readme.mjs README.md page.json
```

It reads the README (and `package.json` beside it, if there is one) and writes a `page.json` that already builds: the name, the tagline as a first headline, the introduction as the lede, a "Features" list whose items start with a **bold name** as columns, install and quick-start commands as a terminal figure, other sections as feature spreads (with their screenshot or code), an FAQ section as questions, and the repository as a button. It skips badges, logos, link rows, tables of contents, licence and contributing sections.

It never writes copy of its own beyond labels like "Get started", and it ends with three lists. Work through them with the person:

- **Write with the person**: always the headline, and every feature title that is still a README heading ("Install", "How it works").
- **Cut to fit**: text it shortened at a sentence or word boundary. Read each one again.
- **In the README but not on the page**: sections and features it had no room for. Swap them in if they matter more.

With no README, or a thin one, write `page.json` from the person's notes, the current site or the docs, starting from one of the examples.

### 2. Decide what the hero asks for

- **Not launched yet**: a waitlist. Ask which service collects the emails and set `hero.form`:

  | `provider`   | Set up                                                                                                                     | What to put in `form`                                                                                           |
  | ------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
  | `formspree`  | Create a form at formspree.io; its URL ends in the form's ID. Simplest on any host.                                        | `"id": "xayzbqwe"`                                                                                              |
  | `netlify`    | Only when the page is deployed on Netlify; sign-ups appear under the site's Forms tab.                                     | `"name": "waitlist"`                                                                                            |
  | `buttondown` | A Buttondown newsletter. People get Buttondown's own confirmation page.                                                    | `"username": "yourname"`                                                                                        |
  | `endpoint`   | Anything else that takes a form post: your API, or a mailing-list form's `action` URL (Mailchimp, Kit, Loops and similar). | `"url": "https://…"`, `"field"` if it isn't `email` (Mailchimp's is `EMAIL`), `"ajax": false` for list services |

  With `ajax` (the default except for Buttondown) the page sends the form with JavaScript and shows `success` or `error` in place; without JavaScript, or with `"ajax": false`, it's a normal form post. An endpoint used with `ajax` must answer 2xx and, on another domain, allow the page's origin (CORS). Every provider but Buttondown gets a hidden spam-trap field; drop sign-ups where it's filled in. Every "Join" button on the page (the bar, the closing) scrolls to the form and puts the cursor in it.

- **Already out**: `hero.actions` with a `primary` button (download, sign up, install) and an optional `secondary` (docs, source). Point them at real URLs or at `#get-started` on the page.

### 3. Write the page

Copy the closer example and replace everything: `examples/quietly/page.json` (a waitlist, light) or `examples/galley/page.json` (an open-source tool, dark, drafted from `examples/galley/README.md`).

| Field                         | What it is                                                                                                                                                                         | Limit       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `brand.name`, `brand.href`    | The name top left, set in the display serif                                                                                                                                        | 24          |
| `nav[]`                       | Up to 5 `{ "label", "href" }`. `#id` links must point at something on the page (below)                                                                                             | 16          |
| `action`                      | The button top right; default: the hero's main action. `false` for none                                                                                                            | 22          |
| `issue[]`                     | Up to 3 short lines under the bar, in small capitals: an edition, the product's parts, a launch date or version. On phones only the first and last show                            | 40 each     |
| `hero.title`                  | The headline. `*word*` sets it in italic (in `theme.accent` if set), `\n` breaks the line (up to 3 lines)                                                                          | 64          |
| `hero.lede`                   | What it is, for whom, and why, in one or two sentences. The first letter becomes a drop cap (`"dropcap": false` to turn it off)                                                    | 300         |
| `hero.form` or `hero.actions` | Step 2. Form texts: `placeholder` (32), `button` (22), `success`, `error` (120). Buttons: `{ "label", "href" }` (26)                                                               | –           |
| `hero.note`                   | A small line under the form or buttons: when invites go out, what you'll send, the licence                                                                                         | 100         |
| `columns[]`                   | 2 to 4 `{ "kicker", "title", "text" }`, numbered 01, 02… Section id `highlights`                                                                                                   | 24, 44, 220 |
| `features[]`                  | Up to 4 spreads: `kicker` (28), `title` (72, `*italic*` works), `text` (420; a blank line starts a paragraph), `points` (up to 4, 90 each), `id` (for nav links), `figure` (below) | –           |
| `quote`                       | `{ "text", "cite" }`, a real quote from a real person who agreed to it. Leave it out otherwise                                                                                     | 220, 60     |
| `faq`                         | `title` (40, default "Before you ask") and 1 to 8 `items` of `{ "q", "a" }`. Section id `faq`                                                                                      | 100, 500    |
| `closing`                     | `kicker` (28), `title` (64), `text` (220), `action` (default: the hero's main action). Section id `closing`                                                                        | –           |
| `footer.items[]`, `links[]`   | Up to 3 lines in the colophon (default "Name © year") and up to 6 links                                                                                                            | 48, 20      |
| `theme`                       | `paper` and `ink` (hex; ink must reach 7:1 on paper), optional `accent`; fonts `display`, `serif`, `sans`, `mono` (Google Fonts families); `fonts` (`""` for none, or your URL)    | –           |
| `meta`                        | `title` (70) and `description` (170) for search and link previews; `url`, `image` (an https link-preview picture), `icon`, `lang`                                                  | –           |

Text fields take inline Markdown: `code`, [links](https://…), **bold** and _italic_.

**Figures.** Each feature can have one, drawn in a frame with a hard offset shadow and an optional `caption` (90), numbered "Fig. 1", "Fig. 2" down the page. Spreads with a figure alternate sides; spreads without one set the title beside the text.

| `type`   | Fields                                                                                                                                                                                       | Use it for                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `image`  | `src` (a file next to `page.json`: png, jpg, webp, avif, gif or svg; or an https URL) and `alt` (160): what the picture shows                                                                | A real screenshot, a photo, an illustration   |
| `window` | `title` (40), `subtitle` (60), `sidebar` (up to 6 items, 20 each; `active` picks the highlighted one, default 0), `rows` (1 to 6 of `meta` (8), `label` (48), `tag` (14), `fill` true/false) | An app's main screen, drawn in the page style |
| `stats`  | `items`: 2 to 4 of `value` (10) and `label` (60)                                                                                                                                             | Numbers that are true and sourced             |
| `code`   | `code` (up to 14 lines of 64 characters; `$ ` lines get a prompt, `#` and `//` lines are dimmed) and `title` (24) for the frame's bar, e.g. "Terminal"                                       | Install and first-run commands, a config file |

Writing tips: the headline says what the reader gets, in their words, in as few words as it takes; let one word carry the italic. Column titles are short statements ("Silence by default."), not feature names. Every number, quote, customer and claim must come from the person, the README or a source they point to. A `window` figure must show what the product really does; its rows can be made-up examples, as a sample screen, so say so in the caption if names appear.

### 4. Build

```bash
node <skill>/scripts/build.mjs page.json out
```

It lists every problem in `page.json` at once (missing fields, text over its limit, a nav link to an id that isn't on the page, colours that don't contrast) and writes nothing until they're fixed. Then it says where the form posts, and lists what only the person can confirm: the quote, the numbers, the window figures.

### 5. Check and look

```bash
node <skill>/scripts/check.mjs out/index.html
node <skill>/scripts/try-form.mjs out/index.html      # with a waitlist form
node <skill>/scripts/screenshot.mjs out/index.html
```

- `check.mjs` loads the page at 390, 768, 1024 and 1440 px and must say `ok` at each: nothing wider than the screen or cut off, readable contrast everywhere, alt text, a labelled form field, one h1, no skipped heading levels. Lines marked `·` are worth a look but don't fail it.
- `try-form.mjs` signs up with `test@example.com` in headless Chrome against a stand-in for the form service on this machine (nothing reaches the real one), and shows what was sent, what the visitor sees after, and what they see when the service fails. It must end with `The form works.`
- `screenshot.mjs` saves `out/screens/desktop.png` and `mobile.png`. Look at both: does the first screen say what it is, does any headline break badly, is a spread lopsided (shorten the text or the figure)?

### 6. Put it live

Upload `out/index.html` and `out/assets/` to any static host: Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3. To keep the page in the project's repository, add the build to its scripts, e.g. `"landing": "node tools/landing/build.mjs landing/page.json public"` after copying `build.mjs`, `inline.mjs`, `markup.mjs` and `color.mjs` to `tools/landing/`.

With a waitlist, sign up once on the live page with the person's own address and confirm it reaches the service. Link a privacy policy from `footer.links` when the page collects emails; ask the person for its URL.

## Troubleshooting

- **`build: fix page.json first`**: each line names the field and what to change.
- **`points at nothing on the page`**: a nav or button link to `#something` that isn't an `id` here. Feature spreads get one with `"id"`; the page's own are `#join` (the form), `#highlights`, `#faq` and `#closing`.
- **A headline breaks into too many lines on phones**: shorten it, or break it yourself with `\n`.
- **try-form says nothing was sent**: rebuild instead of editing the HTML; the email field must stay `required`.
- **The live form fails but try-form passes**: the service rejected it. Check the Formspree form ID, the endpoint's CORS and status code, or that the Netlify site was deployed after the form was added.
- **The page is in system fonts**: Google Fonts couldn't be reached. Install the families and set `"fonts": ""`.

## Files

- `scripts/from-readme.mjs`: drafts `page.json` from a README and lists what to write by hand.
- `scripts/build.mjs`: checks `page.json` and writes the page, with its CSS and a small form script inlined, and copies pictures to `out/assets/`.
- `scripts/inline.mjs`, `scripts/markup.mjs`, `scripts/color.mjs`: inline Markdown, the HTML writer and colour maths.
- `scripts/check.mjs`, `scripts/try-form.mjs`, `scripts/screenshot.mjs`, `scripts/chrome.mjs`: the Chrome checks, the sign-up test and screenshots.
- `examples/quietly/` (a waitlist for a calendar app, light) and `examples/galley/` (an open-source command-line tool, dark, with the `README.md` and `package.json` it was drafted from): complete examples. The products, people, numbers, quotes and form IDs in them are made up. The previews on Lookbk are built from these.
- `NOTICE.md`: the fonts and software this skill uses.
