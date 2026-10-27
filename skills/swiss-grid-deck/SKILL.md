---
name: swiss-grid-deck
description: Build a presentation in the Swiss grid style (eight-column grid, huge tight type, one accent colour) from an outline or notes, as an HTML deck that presents in the browser, a PDF, and an editable PowerPoint file (PPTX) with speaker notes. Use when someone wants slides, a deck, a pitch, a talk, a report presentation or a keynote that looks designed rather than templated.
license: MIT
---

# Swiss Grid Deck

A deck in the international typographic style: every slide sits on the same eight-column grid with 96 px margins, the type is big and tight, and one accent colour carries the emphasis. You write the content as `deck.json`, one object per slide, each with a layout. A script checks it and builds:

- **`out/index.html`**: one self-contained file that presents in any browser (arrow keys, overview, presenter notes, full screen).
- **`out/index.pdf`**: one 16:9 page per slide, for sending and printing.
- **`out/index.pptx`**: an editable PowerPoint file. Every heading and paragraph is a real text box, the bars and rules are shapes, and the notes are speaker notes. It opens in PowerPoint, Keynote and Google Slides.

## What you need

- Node.js 18 or newer. Building the HTML needs nothing else.
- Chrome, Chromium or Edge installed, for the PDF and the PPTX. The scripts find it in the usual places; set `CHROME_PATH` if they don't.
- For the PPTX only: `npm i pptxgenjs@4.0.1` in the folder you run the export from.
- Internet access when the deck is opened, built or exported, for the Google Fonts stylesheet (see Troubleshooting for offline use).

This skill's folder is `<skill>` below: the folder this SKILL.md is in.

## Steps

### 1. Plan the slides

Turn the person's material into 6 to 15 slides. One idea per slide, and most slides should say their point in the title, not in body text. Pick a layout for each:

| Layout      | Use it for                                    | Fields (limit in characters)                                                                                                                                      |
| ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`     | The opening slide                             | `title` (40), `byline` (80), `date` (60)                                                                                                                          |
| `section`   | Starting a part of the talk                   | `number` (4), `title` (60), `text` (160)                                                                                                                          |
| `statement` | One sentence that matters                     | `kicker` (40), `title` (140)                                                                                                                                      |
| `three`     | Three parallel points, steps or numbers       | `kicker` (40), `title` (80), `items`: exactly 3 of `{ "value" (6), "heading" (32), "text" (120) }`                                                                |
| `number`    | One big number and what it means              | `value` (8), `text` (140)                                                                                                                                         |
| `bars`      | A comparison or trend, 2 to 8 values          | `kicker` (40), `title` (60), `text` (220), `bars`: `{ "label" (10), "value": number }`, `highlight` (a bar's label; default the last), `prefix` (4), `suffix` (6) |
| `quote`     | A customer, user or expert in their own words | `quote` (200), `by` (80)                                                                                                                                          |
| `list`      | 2 to 6 short points, numbered                 | `kicker` (40), `title` (80), `items`: 2 to 6 strings (70 each)                                                                                                    |
| `closing`   | The last slide, dark by default               | `title` (24, default "Thank you."), `contact`: up to 3 lines                                                                                                      |

Required: `title` on every layout except `closing`, `number` on section, `value` and `text` on number, `items` on three and list, `bars` on bars, and `quote` and `by` on quote. The rest are optional. Every slide can also have:

- `label`: the running head at the top of the slide (40). Defaults to the deck title.
- `source`: bottom-right line, for a source or a footnote (80).
- `notes`: speaker notes (2000). They show with **N** in the browser and become PowerPoint speaker notes.
- `dark`: `true` or `false` to flip the slide to the dark colour.

Writing tips:

- Titles are short and declarative: "+184% since we moved to tokens", not "Results".
- Wrap one or two words in `*asterisks*` to set them in the accent colour. Use it once per slide at most.
- `\n` in a title forces a line break. The title slide looks best in two or three lines: `"Design\nsystems\nin 2026"`.
- Long text shrinks to fit its box, down to 40% of the design size. If a heading looks small, shorten it rather than splitting it across slides.
- `bars` values are plain numbers (`3.1`, not `"3.1m"`); put units in `prefix` and `suffix`. All values show the same number of decimals as the most precise one.

### 2. Write `deck.json`

```json
{
  "title": "Design systems in 2026",
  "org": "Studio Nord",
  "footer": "Design systems in 2026",
  "theme": { "paper": "#f4f4f1", "ink": "#121212", "accent": "#e3262b" },
  "slides": [
    {
      "layout": "title",
      "title": "Design\nsystems\nin 2026",
      "byline": "Presented by Lena Brandt, Head of Design",
      "date": "Zürich, 14 November 2026",
      "notes": "Welcome. Twenty minutes, then questions."
    },
    {
      "layout": "number",
      "label": "Where it's going",
      "value": "61",
      "text": "components left in the library, down from 214. Our goal for 2027 is *under 50*."
    },
    { "layout": "closing", "contact": ["lena@studionord.example"] }
  ]
}
```

Top level: `title` and `org` are required. `footer` is the bottom-left line on every slide but the first (defaults to `title`). `theme` is optional:

- `paper`, `ink`, `accent`: background, text and accent colours as hex. Keep `paper` and `ink` far apart; the accent should read on both.
- `font`: any Google Fonts family (default `Inter Tight`). Tight grotesques suit the style: Inter Tight, Archivo, Manrope, Space Grotesk.
- `fontUrl`: a stylesheet URL to load the font from instead of Google Fonts, or `""` to use a font installed on the machine.

Other optional top-level fields: `lang` (default `en`) and `grid: false` to hide the faint column lines.

Two palettes to start from: Swiss red (`#f4f4f1`, `#121212`, `#e3262b`) and harbour blue (`#eef2f3`, `#0d1b24`, `#0a7bd6`).

### 3. Build and look

```bash
node <skill>/scripts/build.mjs deck.json out
```

It checks every slide against its layout and lists every problem at once (a missing field, a title over its limit, a bar value that isn't a number). Fix them all and run it again.

Open `out/index.html` and step through it:

| Key                        | What it does                                  |
| -------------------------- | --------------------------------------------- |
| → ← Space PageUp/Down      | Next and previous slide                       |
| Home / End                 | First and last slide                          |
| O                          | Overview of every slide; click one to open it |
| N                          | Presenter notes                               |
| F                          | Full screen                                   |
| `#5` at the end of the URL | Opens slide 5                                 |

Check each slide for headings that shrank a lot (shorten them), bars whose labels collide (shorter labels or fewer bars), and the accent words.

### 4. Export the PDF

```bash
node <skill>/scripts/export-pdf.mjs out/index.html
```

It writes `out/index.pdf`, one 1920×1080 page per slide.

### 5. Export the PowerPoint file

```bash
npm i pptxgenjs@4.0.1
node <skill>/scripts/export-pptx.mjs out/index.html
```

It writes `out/index.pptx` on PowerPoint's widescreen page (13.33×7.5 in). Chrome lays the deck out first, so every text box gets the same position, size and line breaks as the HTML.

The file names the font (Inter Tight by default) rather than embedding it. To see it as designed, install the font on the computer that opens the file: it is free from [Google Fonts](https://fonts.google.com/specimen/Inter+Tight). Without it, PowerPoint substitutes another font and long lines may wrap differently. Google Slides offers it under More fonts.

### 6. Hand it off

Give the person the three files: `index.html` to present from a browser, `index.pdf` to send, and `index.pptx` to edit or present from PowerPoint, Keynote or Google Slides. To change the content later, edit `deck.json` and run steps 3 to 5 again; edits made in PowerPoint don't flow back into the HTML.

## Troubleshooting

- **`build: fix deck.json first`**: each line names the slide, the field and the limit. Character limits keep the type large; shorten rather than raise them.
- **The PDF or PPTX step says no Chrome was found.** Set `CHROME_PATH` to the browser's executable. For the PDF you can also open the deck in Chrome and print it: the print layout is one slide per page (turn off headers and footers, and set margins to none).
- **The PPTX step says PptxGenJS is not installed.** Run `npm i pptxgenjs@4.0.1` in the folder you run the command from.
- **Text in PowerPoint is a different font or wraps onto an extra line.** The font isn't installed on that computer; see step 5.
- **Headings in PowerPoint look a little lighter.** PowerPoint offers regular and bold; the deck's extra-bold headings come out as bold.
- **No internet when presenting.** Install the font on the machine and set `"fontUrl": ""` in the theme, then build again; the deck then uses the installed font and needs no network.

## Files

- `scripts/build.mjs`: checks `deck.json` and builds `out/index.html`. No dependencies.
- `scripts/export-pdf.mjs`: prints the deck to PDF with headless Chrome. No dependencies.
- `scripts/export-pptx.mjs`: writes the editable PowerPoint file with PptxGenJS, from the layout Chrome measures.
- `scripts/chrome.mjs`: finds and runs Chrome for both exports.
- `assets/deck.css`, `assets/deck.js`: the slide styles and the browser player, inlined into every build.
- `examples/studio-nord/` (a design talk, Swiss red) and `examples/field-report/` (a council report, harbour blue): finished `deck.json` files. The previews on Lookbk are built from these.
- `NOTICE.md`: third-party software and fonts this skill uses.
