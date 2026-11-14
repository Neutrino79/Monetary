# Monetary brand kit

The mark is a **wallet**: a green body, a rose flap behind it and a light clasp with a dark dot. Green and rose are the same two colors
the app uses for credit and debit. Everything here is hand-built SVG; **all text is outlined to paths** (Inter, SIL OFL), so files
look identical everywhere without any font installed.

## Colors

| Role | Light surfaces | Dark surfaces |
|---|---|---|
| Green (credit, primary) | `#1f6d4c` | `#49b98b` |
| Rose / wine (debit) | `#7b2e3a` | `#e28b96` |
| Ink | `#171b22` | `#ebedf1` |
| Paper | `#fbfaf6` | `#12151c` |
| Blue (info) | `#2c6683` | `#6fb4d6` |
| Gold (warning) | `#8a6a20` | `#d9b24c` |

## Files

| File | Size | Use |
|---|---|---|
| `icon.svg` | 108×108 | Primary app icon (dark tile, rounded). Use everywhere by default. |
| `icon-on-dark.svg` | 108×108 | Same icon with a lighter tile and outline, for dark pages |
| `icon-light.svg` | 108×108 | Light tile version |
| `icon-brand.svg` | 108×108 | White wallet on the green-to-blue brand tile |
| `icon-square.svg` | 108×108 | Full-bleed square (no rounded corners) for store listings and OS masks |
| `icon-512.png`, `icon-192.png` | raster | PNG exports of `icon.svg` (PWA, store listings) |
| `mark.svg`, `mark-on-dark.svg` | 108×108 | The wallet alone, transparent, for light / dark backgrounds |
| `mark-mono.svg` | 108×108 | One color, follows `currentColor` (inline the SVG, or set the fill; an `<img>` renders it black) |
| `favicon.svg` | 108×108 | Simplified for 16-32 px (bigger wallet, no dot) |
| `logo-horizontal-{light,dark}.svg` | ~380×96 | Icon + wordmark |
| `logo-stacked-{light,dark}.svg` | ~280×194 | Icon above wordmark |
| `wordmark-{light,dark}.svg` | ~390×90 | Wordmark only |
| `android-adaptive-{foreground,background,monochrome}.svg` | 108×108 | Layers for Android adaptive and themed icons (art kept inside the 66 dp safe circle) |
| `banner-{light,dark}.svg` | 1280×320 | README header: lockup, tagline, chips and a journal card |
| `banner-dashboard-{light,dark}.svg` | 1280×360 | Header with a dashboard-style illustration (invented data, not a screenshot) |
| `banner-minimal-{light,dark}.svg` | 1280×240 | Quiet header for docs |
| `social-preview-{light,dark}.svg` / `.png` | 1280×640 | GitHub social preview (Settings → General → Social preview takes the PNG) |

## Rules

- **Clear space:** keep at least the height of the clasp (about 1/6 of the icon's edge) free on all sides.
- **Minimum size:** icon 24 px (use `favicon.svg` below that, never below 16 px); lockup 120 px wide.
- **Do:** use the files as they are; pick the dark or light version by the surface behind them.
- **Don't:** recolor the wallet, rotate or skew it, add effects, or redraw the wordmark in another typeface.
- The name "Monetary" and these marks are not licensed for use as a trademark (see `NOTICE`); the code is Apache-2.0.

## Use in the README (switches with the reader's light/dark theme)

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/branding/banner-dark.svg">
  <img alt="Monetary: expense tracking on a real double-entry ledger" src="docs/images/branding/banner-light.svg">
</picture>
```

Numbers and names in the banners are invented.
