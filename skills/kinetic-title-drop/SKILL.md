---
name: kinetic-title-drop
description: Make a 6-second 1080p kinetic-type title video (MP4) from three short lines, a chip, a footer and three colours. Use for launch openers, release announcements, social posts and reel intros when someone asks for an animated title, title drop, kinetic typography or a short type-only video.
---

# Kinetic Title Drop

A six-second, 1920×1080 type-only film in three beats:

1. A huge first word opens the frame with a hairline slash through it, then settles into the top left.
2. A second word drops in as an outline and fills with the accent colour.
3. A payoff line whips in from the right with a motion smear, and an accent bar wipes under it. A chip and a footer fade in, everything holds, then exits cleanly.

The template is a [HyperFrames](https://github.com/heygen-com/hyperframes) composition. You fill in a brief, a script writes it into the template, and HyperFrames checks and renders the MP4 locally. Text is measured in the real font and sized to fill the frame, so short and long words both land in the same space.

## What you need

- Node.js 22 or newer and FFmpeg on the PATH.
- HyperFrames runs through `npx`, pinned to the version this template was tested with: `npx --yes hyperframes@0.8.192`.
- The first render downloads a headless Chrome. If `render` says Chrome is missing, run `npx --yes hyperframes@0.8.192 browser ensure` once.
- Network access to `cdn.jsdelivr.net`, which serves GSAP to the template. See Troubleshooting if it is blocked.

This skill's folder is `<skill>` below: the folder this SKILL.md is in.

## Steps

### 1. Get the copy

Ask for anything you can't infer. Every field has a limit; the script rejects values over it.

| Field       | What it is                                         | Limit | Good example               |
| ----------- | -------------------------------------------------- | ----- | -------------------------- |
| `line1`     | First word. Opens huge, then sits top left.        | 10    | `Ship`                     |
| `line2`     | Second word. Drops in outlined, fills with accent. | 6     | `it`                       |
| `line3`     | The payoff. Biggest line, with the bar under it.   | 12    | `today.`                   |
| `chip`      | Small pill, top right. Version, date or status.    | 24    | `v2.0 · Out now`           |
| `metaLeft`  | Footer, left. What it is, in a few words.          | 60    | `Release notes · 14 fixes` |
| `metaRight` | Footer, right. Usually a URL or handle.            | 40    | `relay.example/changelog`      |

Writing tips:

- Lines 1 and 2 share the top row, so together they should read as the start of one phrase ("Ship / it", "Notes / that", "Meet / the"). Line 3 finishes it.
- Everything is set in capitals. Single words read best; line 3 can be two short words.
- Keep `line1 + line2` under about 12 characters or the top row gets small next to the payoff.
- The footer holds for about 2 seconds, so keep it scannable.

### 2. Pick colours

Three hex colours: `ground` (background), `ink` (text) and `accent` (outline, fill, bar, chip). Use the brand's colours if you have them. Otherwise start from a preset:

| Preset    | ground    | ink       | accent    |
| --------- | --------- | --------- | --------- |
| Ember     | `#0f1013` | `#f5f4ef` | `#ff5b2e` |
| Fieldnote | `#f1ede4` | `#18201c` | `#2f6b4f` |
| Cobalt    | `#0b1020` | `#eef1ff` | `#5b7cff` |
| Paper     | `#fbfaf7` | `#111111` | `#e8462b` |
| Lime      | `#101410` | `#f2f5ee` | `#b6f23a` |

`ink` needs strong contrast with `ground`; `accent` needs at least 3:1 against `ground`, because line 2 is drawn in it. `check` measures both and tells you if either fails.

### 3. Make the project and apply the brief

```bash
cp -r <skill>/template ./title-drop
cd title-drop
```

Write `brief.json` in the project with the fields from steps 1 and 2:

```json
{
  "line1": "Ship",
  "line2": "it",
  "line3": "today.",
  "chip": "v2.0 · Out now",
  "metaLeft": "Release notes · 14 fixes · 3 new features",
  "metaRight": "relay.example/changelog",
  "ground": "#0f1013",
  "ink": "#f5f4ef",
  "accent": "#ff5b2e"
}
```

Then write it into the template:

```bash
node <skill>/scripts/apply-brief.mjs . brief.json
```

It checks every value against the template's declared variables (type, length, colour format) and lists every problem at once if anything is off. Fix the brief and run it again. You can leave fields out to keep the current value.

Two finished briefs are in `<skill>/examples/`.

### 4. Check

```bash
npx --yes hyperframes@0.8.192 check --json
```

`check` lints the file, plays it in a browser, measures the layout over time and tests contrast. `"ok": true` with no findings means it is ready. Fix any finding before rendering. The ones copy can cause:

- `contrast_aa_failure`: a colour pair is too close. Use the `suggestedColor` it gives, or pick a darker or lighter shade.
- `text_box_overflow`, `clipped_text` or `content_overlap`: a value is longer than the template expects, usually a footer or chip running into its neighbour. Shorten it.

Don't change the template's structure to silence a finding. Fix the brief instead.

### 5. Look before you render

```bash
npx --yes hyperframes@0.8.192 snapshot --at 0.3,1.6,3.6,5.2 -o snapshots
```

This writes PNG frames to `snapshots/`. Open them and check the opening frame, the second word landing, and the held end frame. Look for words that collide with the chip, a footer that runs into the bar, or an accent that disappears on the background.

### 6. Render

```bash
npx --yes hyperframes@0.8.192 render --quality delivery -o renders/title-drop.mp4
```

The project's `package.json` has the same commands as `npm run check` and `npm run render`. Use `--quality draft` for a fast test, and `--fps 60` for a smoother result on social.

### 7. Hand it off

Give the person the path to `renders/title-drop.mp4` and one still from step 5. Tell them which fields to change for another version: they only need to edit `brief.json` and rerun steps 3 to 6.

## Timing map

| Time (s)  | What happens                                                    |
| --------- | --------------------------------------------------------------- |
| 0.00      | `line1` is already on screen, large and centred, as a thumbnail |
| 0.00–0.42 | Accent hairline slashes through it, then fades                  |
| 0.80–1.35 | `line1` moves to the top left                                   |
| 1.35–1.77 | `line2` drops in as an outline                                  |
| 1.90–2.06 | `line2` fills with the accent                                   |
| 2.05–2.55 | `line3` whips in from the right                                 |
| 2.60–3.05 | Accent bar wipes in under `line3`                               |
| 3.10–3.50 | Chip, footer and corner marks fade in                           |
| 3.50–5.45 | Hold                                                            |
| 5.45–5.80 | Everything exits upwards with a short blur                      |

## Several versions at once

To render many variants (one per language, product or date), write a JSON array of briefs and render them in one go. Each object is a full or partial brief, merged over the values already applied:

```bash
npx --yes hyperframes@0.8.192 render --batch variants.json --quality delivery -o "renders/{index}.mp4"
```

`--batch` sets variables per render, so you don't need `apply-brief` for each one. The output path needs a placeholder such as `{index}` or a field like `{line3}`, or the files overwrite each other. Run `check` on one representative brief first, and look at the longest copy in a snapshot.

## Troubleshooting

- **Render hangs, then shows a static frame, or reports `sub_timeline_script_failure`.** GSAP didn't load. If your network blocks `cdn.jsdelivr.net`, run `npm i gsap@3.14.2` in the project, copy `node_modules/gsap/dist/gsap.min.js` to `assets/vendor/`, and point the `<script src>` in `index.html` at `assets/vendor/gsap.min.js`.
- **Words look like the wrong font.** The template uses League Gothic and JetBrains Mono, which HyperFrames bundles. If you swap fonts, use another bundled family (`npx hyperframes docs compositions` lists them) or add an `@font-face`, or `check` fails.
- **Colours didn't change.** Run `apply-brief` from step 3 again and check it printed `Applied N values`. Editing the CSS `:root` colours has no effect; the variables win.
- **Want a different length?** Keep it at 6 s. The beats are timed to land in that window; stretching the root duration only lengthens the hold.

## Files

- `template/`: the HyperFrames project (`index.html`, `hyperframes.json`, `package.json`).
- `scripts/apply-brief.mjs`: validates a brief and writes it into the template. No dependencies.
- `examples/relay-v2/` and `examples/fieldnote-beta/`: finished briefs. The previews on Lookbk are rendered from these.
- `NOTICE.md`: third-party software this skill uses.
