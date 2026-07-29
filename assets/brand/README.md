# codeweb brand kit

Terminal editorial: near-black surfaces, mono type, square corners, dither texture, and one
accent. Every mark here uses the same tokens as the product's report and the site, so the
brand and the product look like one thing. `tests/brand-sync.test.mjs` enforces that.

## Files

| File | Use |
|---|---|
| `banner.png` | Wide README header (2100×450). Doto wordmark, pixel glyph, dithered mini-map. |
| `logo.svg` | Horizontal lockup — pixel glyph + mono wordmark on a dark tile. |
| `logomark.svg` | The 2×2 pixel glyph on a dark tile — favicon, avatars, marketplace icon. |
| `demo.svg` | Looping animated pipeline (`extract → cluster → overlap → render`). CSS + SMIL, plays inline via `<img>` on GitHub. |
| `pipeline.svg` | Static, labelled how-it-works diagram. |
| `proof-strip.svg` | README benchmark proof strip. Its embedded metadata names the dated evidence sources. |
| `../screens/zod-terminal-run.svg` | Condensed animated replay of a real npm-package run against pinned Zod source. |
| `social-preview.png` | 1280×640 card for **repo Settings → Social preview** (upload manually). |

The screenshots in `../screens/` are the **actual generated `report.html`**, not mockups.
`zod-terminal-run.svg` is a condensed replay of real CLI output captured on 2026-07-29 from
`@ghostlygawd/codeweb` 0.12.0 against Zod commit `912f0f5`. Its metadata records the full source
commit and the one sanitization: the absolute local workspace path is displayed as `.codeweb`.

## Palette (shared with `scripts/report-template.html` and `site/tokens.css`)

| Token | Hex | |
|---|---|---|
| bg | `#060608` | page (near-black) |
| panel | `#0D0D11` / `#131318` | surfaces |
| line | `#26242C` | borders |
| fg | `#E8E7EE` | text |
| muted | `#8A8794` | secondary text |
| accent | `#C6F24E` | the only saturated color — selection, links, "act here" |

Data never gets a second hue: domains, matrix cells, and treemap density ride luminance
ramps (grays, or panel→accent), which survive every kind of color-vision deficiency.

## Rules

- Square everything. No rounded corners, no circles, no ellipses in brand art.
- One accent, spent on meaning. Grays do the rest.
- Type is mono (`ui-monospace` stack); display numerals and the wordmark use Doto where
  fonts can be embedded (site, banner) and the mono stack where they can't (SVG marks).
- Texture is dither/halftone (pixel checkers, stippled strokes), never gradients or glow.

## Positioning

Tagline: **"Your coding agents grep. codeweb knows."**
