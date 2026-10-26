# Notices

Swiss Grid Deck is a Lookbk skill. The layouts, styles, player, scripts,
examples and this documentation were written for Lookbk.

It uses third-party software and fonts that are fetched or installed when you
use it, not shipped in this package:

- **PptxGenJS** 4.0.1, MIT License, © 2015-2022 Brent Ely.
  https://github.com/gitbrent/PptxGenJS
  Installed with `npm i pptxgenjs@4.0.1` and used by `scripts/export-pptx.mjs`
  to write the PowerPoint file.
- **Inter Tight**, SIL Open Font License 1.1, © 2022 The Inter Project Authors.
  https://github.com/rsms/inter-tight
  The default typeface, loaded from Google Fonts when the deck is opened.
- **Chrome, Chromium or Edge**, already installed on your machine, runs
  headless to print the PDF and to measure the layout for the PPTX.
