# codeweb brand kit

All marks are hand-authored SVG in codeweb's own report palette, so the brand and the product
look like one thing.

## Files

| File | Use |
|---|---|
| `logo.svg` | **Primary** lockup — node-web glyph + wordmark on a dark surface. Reads on any GitHub theme. |
| `logomark.svg` | Square glyph only — favicon, social avatar, plugin-marketplace icon. |
| `hero.svg` | Wide README header banner. |
| `demo.svg` | Looping animated pipeline (`extract → cluster → overlap → render`). CSS + SMIL, so it plays inline via `<img>` on GitHub. |
| `pipeline.svg` | Static, labelled how-it-works diagram. |
| `social-preview.png` | 1280×640 card for **repo Settings → Social preview** (upload manually). |
| `logo-b-wordmark.svg`, `logo-c-badge.svg` | Alternate lockups kept for reference. |

The screenshots in `../screens/` are the **actual generated `report.html`**, not mockups.

## Palette (from `scripts/report-template.html`)

Crafted Dark — warm ink + electric chartreuse. Red is reserved for risk / blast radius.

| Token | Hex | |
|---|---|---|
| bg | `#100E14` | page (warm near-black) |
| surface | `#1A1820` / `#232029` | panels |
| line | `#322E3A` | borders, idle edges |
| fg | `#ECECEE` | text |
| muted | `#9C99A6` | secondary text |
| accent | `#C6F24E` | primary / links / hub node (chartreuse) |
| severity | `#FF5D5D` `#FFB14E` `#E8C44E` `#5BD17A` | high → good |

Domain node colours echo the report's ramp (chartreuse → purple → teal → amber → pink → green).
Wordmark font is the system UI stack (`ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial`).

## Positioning

Tagline: **"the system map for your codebase."** Deliberately outcome-level, not a feature list —
it stays true as features are added on top of the graph.
