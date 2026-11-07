# Notices

Blueprint Architecture Diagram is a Lookbk skill. The drawing style, node
shapes, scripts, examples and this documentation were written for Lookbk.

Third-party software included in this package:

- **dagre** 3.1.1 with graphlib, MIT License, © 2012-2014 Chris Pettitt.
  https://github.com/dagrejs/dagre
  `vendor/dagre.esm.js` is the package's own unminified build
  (`@dagrejs/dagre` `dist/dagre.js`) with ES module exports added at the
  end and the source-map comment removed, so every line is readable; the licence is in
  `vendor/LICENSE-dagre.txt`. It lays out the nodes and edges.

Fetched or already installed when you use it, not shipped here:

- **JetBrains Mono**, SIL Open Font License 1.1, © 2020 The JetBrains Mono
  Project Authors. https://github.com/JetBrains/JetBrainsMono
  Loaded from Google Fonts when the diagram is opened or exported.
- **Chrome, Chromium or Edge**, already installed on your machine, runs
  headless to save the PNG.
