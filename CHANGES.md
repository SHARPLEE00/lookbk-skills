# Changes

## 1.1.0 (2026-10-26)

### Install from more places

- **Claude Code plugin marketplace.** Added `.claude-plugin/marketplace.json` (marketplace `lookbk-skills`) and `.claude-plugin/plugin.json` (plugin `lookbk`, version 1.1.0, MIT). `/plugin marketplace add SHARPLEE00/lookbk-skills` then `/plugin install lookbk@lookbk-skills` installs all seven skills. Each skill is also listed as its own plugin (for example `swiss-grid-deck@lookbk-skills`) for people who want just one. Checked with `claude plugin validate .` (passes) and a local `marketplace add` and `install` on Claude Code 2.1.310: `lookbk` loads 7 skills, a single-skill plugin loads 1.
- **Anthropic directory fields.** `plugin.json` sets `icon` (`assets/logo.png`), `documentationUrl`, `supportUrl`, `privacyPolicyUrl` and `termsOfServiceUrl`, which the directory listing reads.
- **skills.sh.** Added `skills.sh.json`, which groups the skills on the skills.sh repo page into Video, Slides and images, and Web pages. `npx skills add SHARPLEE00/lookbk-skills` finds all 7 skills (checked with skills CLI 1.7.4 against a local copy).
- **Cursor.** Added `.cursor-plugin/plugin.json` (plugin `lookbk`), the manifest Cursor's plugin marketplace reads.

### README

- A preview GIF per skill, rendered from each skill's own output (`assets/<skill>.gif`, 640 px wide, 0.12 to 1.3 MB each), in a grid at the top and again in each skill's section.
- Install instructions for the `skills` CLI, the Claude Code plugin marketplace, Cursor, Codex and by hand, plus the existing Lookbk installer.
- Each skill now has its own section: what it makes, what it needs, a prompt to try, and a link to its page on lookbk.dev.
- A "What the skills run and fetch" section listing what runs on your machine, what is downloaded when a skill is used, and what is sent elsewhere.
- "More skills" brought up to date: 58 skills in the catalog, Roller Diner Hero as an eighth free skill on lookbk.dev, 50 in Pro, and a link to [awesome-ai-motion-videos](https://github.com/SHARPLEE00/awesome-ai-motion-videos).
- Links to lookbk.dev carry `utm_source=github&utm_medium=repo` with `utm_campaign=free-skills-readme` (skill links) or `free-skills-more` (More skills), so visits from this README show up as their own channel.

### Skills

- Every `SKILL.md` front matter now carries `license: MIT`. All seven were checked against the Agent Skills specification (agentskills.io): `name` is lowercase letters, digits and single hyphens, at most 64 characters and the same as its folder; `description` is plain text of 288 to 625 characters (the limit is 1,024) and says what the skill makes and when to use it.
- `kinetic-title-drop`: one remaining unpinned call, `npx hyperframes docs compositions`, now pins the version like every other call: `npx --yes hyperframes@0.8.192 docs compositions`.

No skill's scripts, templates or examples changed.

## 1.0.0

- First release: seven free skills (kinetic-title-drop, pixel-quest-promo, swiss-grid-deck, editorial-og-card, blueprint-architecture, mono-editorial-landing, waitlist-glow) under the MIT License.
