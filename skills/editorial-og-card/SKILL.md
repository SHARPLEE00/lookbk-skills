---
name: editorial-og-card
description: Make 1200×630 link-preview images (Open Graph / social cards, PNG) for blog posts, docs or newsletters in one editorial look - a serif headline set as real text, a byline and a generated block composition - from Markdown front matter or a list, and wire them into the site's meta tags. Use when someone wants OG images, social cards, link previews or Twitter/X cards for their posts.
---

# Editorial OG Card

One consistent link-preview image per post. Each card has:

- a top rule with a kicker (the series or section), the topic and a meta line (reading time or date),
- the headline in a large serif, set as real text so it is always spelled right, shrunk only as far as it needs to fit, with one or two words in the accent colour,
- a byline with initials or a photo, and the post's URL,
- art on the right: one of four block compositions picked from the post's slug (so a post keeps its card), an image you choose, or nothing, with the headline running wider.

A script reads your posts into `cards.json`, you review it, and a second script renders every card with the Chrome already on the machine. Nothing to install.

## What you need

- Node.js 18 or newer.
- Chrome, Chromium or Edge. The script finds it in the usual places; set `CHROME_PATH` if it doesn't.
- Internet access while rendering, for the Google Fonts stylesheet (Instrument Serif, Inter, IBM Plex Mono). See Troubleshooting to render offline.

This skill's folder is `<skill>` below: the folder this SKILL.md is in.

## Steps

### 1. Make `cards.json`

**From Markdown posts** (Astro, Hugo, Jekyll, Eleventy, Next.js MDX, anything with front matter):

```bash
node <skill>/scripts/from-posts.mjs content/blog --site=yourblog.example --path=/blog/ --out-dir=public/og
```

It reads every `.md`, `.mdx` and `.markdown` file under the folder and makes one card per post, newest first. Posts with `draft: true` are skipped. From the front matter it takes:

| Card field | From                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `slug`     | `slug`, else `permalink`, else the file name (or folder for `index.md`), without a leading date                     |
| `title`    | `og_title`, else `title`                                                                                            |
| `kicker`   | `kicker`, else `series`, else `--kicker=...`, else "Article"                                                        |
| `topic`    | `topic`, else the first `category`, else the first tag                                                              |
| `meta`     | `reading_time`, else the word count at 230 words a minute: "8 min read"                                             |
| `author`   | `author` (text, or `name` under it), else `--author=...`                                                            |
| `url`      | `--site` + `--path` + slug, shown under the author                                                                  |
| `out`      | `<out-dir>/<slug>.png`; without `--out-dir`, next to the post as `<name>.og.png` (or `og.png` beside an `index.md`) |

Run it again whenever posts are added: cards already in `cards.json` keep your edits, new posts are added and removed ones dropped.

**By hand**, for pages that aren't Markdown (a newsletter, landing pages, docs sections), write the same shape yourself:

```json
{
  "theme": { "paper": "#131313", "ink": "#f2ede4", "accent": "#ff7a45" },
  "defaults": { "kicker": "Night Desk", "author": "Ines Varga" },
  "cards": [
    {
      "slug": "issue-41",
      "title": "Why every newsroom is quietly *rebuilding its CMS*",
      "topic": "Issue 41",
      "meta": "Oct 2026",
      "url": "nightdesk.example/41",
      "tags": ["#media", "№ 41"]
    }
  ]
}
```

`defaults` fills any field a card leaves out.

### 2. Edit the cards

Open `cards.json` and go through the titles:

- Wrap the one or two words that carry the point in `*asterisks*`; they're set in italic in the accent colour. `"Shipping a design system *in a week*"`.
- Headlines read best under 70 characters; the limit is 110. Past about 80 the type gets smaller. Shorten with `og_title` in the post's front matter, or in `cards.json` directly.

All the fields a card can have:

| Field    | What it is                                                               | Limit   |
| -------- | ------------------------------------------------------------------------ | ------- |
| `title`  | The headline (required)                                                  | 110     |
| `slug`   | Names the file and picks the layout (required unless `out` is set)       | –       |
| `out`    | Where the PNG goes, relative to `cards.json` (default `og/<slug>.png`)   | –       |
| `kicker` | Top-left label, in the accent colour                                     | 24      |
| `topic`  | After the kicker; also the default hashtag on the art                    | 28      |
| `meta`   | Top-right: reading time, date, issue                                     | 20      |
| `author` | Byline name; initials go in the circle                                   | 32      |
| `avatar` | A photo for the circle instead of initials (path or URL)                 | –       |
| `url`    | Shown under the name                                                     | 48      |
| `art`    | `blocks` (default), `image` or `none`                                    | –       |
| `image`  | The picture for `"art": "image"` (path or URL); it is cropped to 390×430 | –       |
| `layout` | 1 to 4, to choose the block composition yourself                         | –       |
| `tags`   | Up to two small labels on the art, e.g. `["#css", "Part 2"]`             | 16 each |

The theme sets the look for every card: `paper` (background), `ink` (text) and `accent`, as hex, plus `serif`, `sans` and `mono` for other Google Fonts families. The accent is used as is for the blocks; for text the card darkens or lightens it until it reads. Two themes to start from: the default ink blue (`#fafaf7`, `#17181c`, `#2433e8`) and night (`#131313`, `#f2ede4`, `#ff7a45`).

### 3. Render

```bash
node <skill>/scripts/render.mjs cards.json
```

It checks every card first and lists every problem at once, then renders the cards four at a time (a second or so each) and checks every PNG is 1200×630. Add `--scale=2` for 2400×1260 images (sharper on high-density screens, about twice the file size), or `--only=slug,slug` to redo some cards.

### 4. Look

Open `og-preview.html`, written next to `cards.json`: every card side by side. Check for headlines that shrank a lot (shorten them), accent words that landed on the wrong phrase, and that neighbouring cards look different enough. Change `layout` on a card to pick another composition.

### 5. Wire them into the site

The cards only show up in previews once each page points at its image with an **absolute** URL. In the page's `<head>`:

```html
<meta
  property="og:image"
  content="https://yourblog.example/og/design-system-in-a-week.png"
/>
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Shipping a design system in a week" />
<meta name="twitter:card" content="summary_large_image" />
```

Do it once in the post layout or template, built from the slug, not per post:

- **Next.js (App Router)**: in the post route's `generateMetadata`, return ``openGraph: { images: [{ url: `/og/${slug}.png`, width: 1200, height: 630 }] }`` and `twitter: { card: 'summary_large_image' }`, with `metadataBase` set in the root layout so the URL becomes absolute.
- **Astro, Eleventy, Jekyll, Hugo**: add the tags to the base layout's head, using the site URL plus `/og/` plus the page's slug.
- **Images next to the post** (no `--out-dir`): use the path your framework serves co-located files from.

After deploying, paste a post URL into a link-preview checker, or into a draft on X, LinkedIn or Slack, to see the card. Platforms cache previews; a changed image can take a while to show.

### 6. Keep it running (optional)

To make cards for new posts on every build, copy this skill's `scripts/` and `template/` folders into the repo (say `tools/og/`) and run both scripts before the build, for example as a `prebuild` script in `package.json`:

```json
"prebuild": "node tools/og/scripts/from-posts.mjs content/blog --site=yourblog.example --path=/blog/ --out-dir=public/og && node tools/og/scripts/render.mjs cards.json"
```

The build machine needs Chrome; most CI images have it, or set `CHROME_PATH`.

## Troubleshooting

- **`render: fix cards.json first`**: each line names the card, the field and the limit.
- **No Chrome found**: install Chrome or Chromium, or set `CHROME_PATH` to the executable.
- **The headline is in a plain serif or the labels in a system font**: the Google Fonts stylesheet didn't load. To render offline, install Instrument Serif, Inter and IBM Plex Mono (all free from Google Fonts) and set `"fonts": ""` in the theme. `"fonts"` can also be your own stylesheet URL for other families.
- **The preview on a platform shows the old image or none**: check the `og:image` URL opens in a browser and is absolute (with `https://` and your domain), then ask the platform to re-scrape the page or wait for its cache to expire.

## Files

- `scripts/from-posts.mjs`: front matter to `cards.json`, keeping your edits on later runs. No dependencies.
- `scripts/render.mjs`: checks `cards.json`, renders the PNGs and writes `og-preview.html`. No dependencies.
- `scripts/chrome.mjs`: finds Chrome and takes the screenshots.
- `template/`: the card itself. `card.html` and `card.css` are the layout, `card.js` fills in the text, picks readable colours, draws the art and fits the headline.
- `examples/field-notes/`: a small blog (`posts/`) and the `cards.json` made from it with `from-posts.mjs`, accent words added. `examples/night-desk/`: a hand-written `cards.json` for a newsletter, dark. The previews on Lookbk are rendered from these.
- `NOTICE.md`: the fonts and software this skill uses.
