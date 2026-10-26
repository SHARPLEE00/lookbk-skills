# Contributing

Thanks for helping. Two kinds of contributions are welcome here.

## Show what you made

Made a video, deck, card, diagram or page with one of these skills? Open a
[showcase issue](https://github.com/SHARPLEE00/lookbk-skills/issues/new?template=showcase.yml)
with a public link (an X post, a site or a video). Picked entries go into
`data/skills.json` under `showcase`, appear in both READMEs and may be featured
on lookbk.dev, always credited to you and linked to your post. We link to
your work; we don't copy your files.

## Fix a skill

- Open an issue first for anything bigger than a typo, saying which skill,
  what you asked your agent, and what came out.
- Keep fixes inside one skill's folder. Run that skill's own checks (each
  `SKILL.md` names them) before opening the pull request.
- The skills here are copies of the packages on lookbk.dev, so accepted fixes
  are made there too and come back with the next sync.

## Editing the README

`README.md` and `README.zh-CN.md` are generated. Change `data/skills.json` or
`scripts/build-readme.mjs`, then run `node scripts/build-readme.mjs`.
