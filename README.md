# Lookbk free skills

Seven free agent skills from [Lookbk](https://lookbk.dev) that make visual work: a kinetic title video, an 8-bit promo, a slide deck, link-preview images, an architecture diagram and two landing pages. Each one is a folder with a `SKILL.md` that Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, OpenCode and other agents can follow, plus the scripts and templates it runs.

Lookbk is a catalog of art-directed skills for video, slides, images and web pages. Every preview on the site, and every picture below, was rendered by the skill itself. Skills run on your own machine: none of them calls an AI model or asks for an API key.

## The skills

| | Skill | What it makes | Needs |
| --- | --- | --- | --- |
| [![Kinetic Title Drop](https://lookbk.dev/media/kinetic-title-drop/card.webp)](https://lookbk.dev/skills/kinetic-title-drop) | [`kinetic-title-drop`](skills/kinetic-title-drop) | A six-second, three-beat kinetic type video (MP4, 1080p) for openers and announcements | Node.js 22+, FFmpeg |
| [![Pixel Quest Promo](https://lookbk.dev/media/pixel-quest-promo/card.webp)](https://lookbk.dev/skills/pixel-quest-promo) | [`pixel-quest-promo`](skills/pixel-quest-promo) | A 20-second 8-bit promo where a pixel hero runs one stage per feature, on a 120 BPM grid | Node.js 22+, FFmpeg |
| [![Swiss Grid Deck](https://lookbk.dev/media/swiss-grid-deck/card.webp)](https://lookbk.dev/skills/swiss-grid-deck) | [`swiss-grid-deck`](skills/swiss-grid-deck) | A Swiss-grid slide deck from your notes: browser deck, PDF and editable PPTX with speaker notes | Node.js 18+, Chrome |
| [![Editorial OG Card](https://lookbk.dev/media/editorial-og-card/card.webp)](https://lookbk.dev/skills/editorial-og-card) | [`editorial-og-card`](skills/editorial-og-card) | 1200×630 link-preview images for every blog post, with the meta tags wired up | Node.js 18+, Chrome |
| [![Blueprint Architecture Diagram](https://lookbk.dev/media/blueprint-architecture/card.webp)](https://lookbk.dev/skills/blueprint-architecture) | [`blueprint-architecture`](skills/blueprint-architecture) | A blueprint-style system diagram from your repo or a description, as HTML, SVG and PNG | Node.js 18+, Chrome for the PNG |
| [![Mono Editorial Landing](https://lookbk.dev/media/mono-editorial-landing/card.webp)](https://lookbk.dev/skills/mono-editorial-landing) | [`mono-editorial-landing`](skills/mono-editorial-landing) | A black-and-white editorial landing page drafted from your README, with a working waitlist form | Node.js 18+, Chrome for the checks |
| [![Waitlist Glow](https://lookbk.dev/media/waitlist-glow/card.webp)](https://lookbk.dev/skills/waitlist-glow) | [`waitlist-glow`](skills/waitlist-glow) | A one-screen waitlist page with a breathing glow and a sign-up form tested end to end | Node.js 18+, Chrome, a form service |

Each skill's own `SKILL.md` lists exactly what it needs and the steps your agent follows.

## Install

A skill is installed when its folder, with `SKILL.md` directly inside it, sits in a folder your agent reads. Keep the folder name the same as the skill's name.

```bash
git clone https://github.com/SHARPLEE00/lookbk-skills.git
```

**Claude Code** reads `~/.claude/skills` (every project) and `.claude/skills` (one repository):

```bash
mkdir -p ~/.claude/skills
cp -r lookbk-skills/skills/kinetic-title-drop ~/.claude/skills/
```

**Codex** reads `~/.agents/skills` and `.agents/skills`:

```bash
mkdir -p ~/.agents/skills
cp -r lookbk-skills/skills/kinetic-title-drop ~/.agents/skills/
```

**Cursor** reads `~/.agents/skills`, `~/.cursor/skills` and `~/.claude/skills`, and the same folders inside a project, so either copy above works. Gemini CLI, GitHub Copilot and OpenCode also read `~/.agents/skills`.

Install all seven at once:

```bash
cp -r lookbk-skills/skills/* ~/.claude/skills/    # Claude Code
cp -r lookbk-skills/skills/* ~/.agents/skills/    # Codex, Cursor, Gemini CLI, Copilot, OpenCode
```

Start a new agent session afterwards so the agent loads the skills. In Claude Code, `/skills` lists what it found.

### Or use the Lookbk installer

```bash
curl -fsSL https://lookbk.dev/cli.js | node - add kinetic-title-drop
```

It writes the current version from lookbk.dev to the folders your agents read; run it again to update. The first run prints a sign-in link for a free Lookbk account. Add `--project` to install into the current repository, or `--claude` or `--shared` to write one folder only.

## Use

Ask your agent in plain words. For example:

- *Make a 6-second kinetic title drop that says "Ship / it / today." in our brand orange, 1080p, for an X post.*
- *Turn notes.md into a 12-slide Swiss Grid deck for our board meeting, with speaker notes, and export PDF and PPTX.*
- *Make Editorial OG cards for every post in /content/blog and save them next to each post.*
- *Read this repo and draw a Blueprint architecture diagram of the order service, with data flow animated.*
- *Build a Mono Editorial landing page from our README, with a waitlist form.*

The agent reads the skill's `SKILL.md`, asks for what it needs (your words, colors, notes or repository), runs the skill's own build and checks, and hands you the files.

## More skills

These seven are the free part of a larger catalog. [Lookbk Pro](https://lookbk.dev/pricing) adds 51 more, as of October 2026, including:

- **Launch films** made from your site and real screens, cut on a beat grid ([Launch Films](https://lookbk.dev/skills/series/launch-films))
- **Animated website heroes** in WebGL, canvas and scroll, with a paste-in embed and a 1080p video ([Motion Heroes](https://lookbk.dev/skills/series/motion-heroes))
- **Video background heroes** with the headline behind the subject ([Footage Heroes](https://lookbk.dev/skills/series/footage-heroes))
- Pitch, keynote, thesis and workshop decks, quote cards, infographics, product shots, docs sites and more

Browse them all at [lookbk.dev/skills](https://lookbk.dev/skills). Each one shows its rendered result before you install it.

## License

The skills in this repository were written by Lookbk and are released under the [MIT License](LICENSE).

Some skills use third-party software or fonts. Each skill's `NOTICE.md` lists them, and those parts stay under their own licenses:

- `blueprint-architecture` includes **dagre** (MIT), with its license in `vendor/LICENSE-dagre.txt`.
- `kinetic-title-drop` and `pixel-quest-promo` run **HyperFrames** (Apache License 2.0) through `npx` and load **GSAP** from a CDN under the [GSAP Standard License](https://gsap.com/standard-license). Neither is included here.
- `swiss-grid-deck` installs **PptxGenJS** (MIT) when you export a PowerPoint file.
- Fonts (Inter, Instrument Serif, IBM Plex Mono, JetBrains Mono and others, SIL Open Font License 1.1) load from Google Fonts when a skill renders. No font files are included.

The products, people, numbers and addresses in each skill's `examples/` folder are made up.

"Lookbk" and the Lookbk logo are not covered by the MIT License.
