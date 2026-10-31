# Fonts

Served locally (no CDN). Both are under the SIL Open Font License 1.1, which allows commercial use, embedding and
redistribution with the game as long as the licence text travels with the fonts and the fonts are not sold on
their own.

| Family | Use | Source | Version | Licence |
|---|---|---|---|---|
| Pretendard | all UI text: Medium 500 (general, tips), SemiBold 600 (buttons), Bold 700 (level, chapter, HUD numbers) | npm `pretendard@1.3.9` (github.com/orioncactus/pretendard, release v1.3.9), `dist/web/static/woff2-dynamic-subset` | 1.3.9 (font version 1.309) | `pretendard/LICENSE.txt` |
| Jua (BM 주아체) | the two-line title logo, result popup titles, stage and chapter card titles | github.com/google/fonts `ofl/jua/Jua-Regular.ttf` (upstream github.com/googlefonts/jua, Woowahan Brothers) | 1.001 | `jua/OFL.txt` |

- Pretendard: the author's own dynamic subset, unchanged; only the three weights in use, and the CSS lists woff2 only.
  All 11,172 Hangul syllables are covered; the browser downloads only the `unicode-range` blocks on screen.
- Jua: converted from TTF to woff2 and split into the same `unicode-range` blocks as Pretendard (fontTools). Every
  glyph of the original is kept (2,519 code points: 2,367 Hangul syllables, KS X 1001 and a few more). Jua has no
  Reserved Font Name. Text set in Jua falls back to Pretendard per character, so a syllable Jua lacks still shows.
- Checksums of the downloads: `pretendard-1.3.9.tgz` sha512 matches the npm registry integrity
  (`sha512-PaQAADyLY5v4kYFwkpSJHbSSYIkiriY/1xXw75TKoZ9UQQqeU+tvP05yTdZAWibiIYoo8ZKtRv8PM7w0IaywSw==`);
  `Jua-Regular.ttf` sha256 `769677aef240bfc3b9965f2b50748075bff885e6c6992fc591a3fb268279f898`.
