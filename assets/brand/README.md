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

| Token | Hex | |
|---|---|---|
| bg | `#0d1117` | page |
| surface | `#161b22` / `#1c2330` | panels |
| line | `#30363d` | borders, idle edges |
| fg | `#e6edf3` | text |
| muted | `#8b949e` | secondary text |
| accent | `#58a6ff` | primary / links / hub node |
| severity | `#ff5c5c` `#ffb65c` `#c9d11f` `#3fb950` | high → good |

Node colours echo the report's domain hues (green/amber/red/purple/teal). Wordmark font is the
system UI stack (`ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial`).

## Positioning

Tagline: **"the system map for your codebase."** Deliberately outcome-level, not a feature list —
it stays true as features are added on top of the graph.
