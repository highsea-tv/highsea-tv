# Iconography

## Base set

[Lucide](https://lucide.dev) (ISC license) is the base set. Its geometry is drawn on a 24-unit grid.

- **Stroke width** is **1.75** at every size, a little lighter than Lucide's default of 2 to match Geist. On TV, icons ≥ 1.4u use stroke 2, for 10-foot legibility.
- **Caps and joins** are round, as in Lucide.
- **Color:** icons take `currentColor`. At rest they use `text-2` (admin nav, toolbars) or `text` (buttons). The active state uses `accent-text`.

## Sizes

| Size | Use |
| --- | --- |
| 16 | Inline with 13–14px text: admin nav, tables, small buttons |
| 20 | Default buttons, inputs, menu items |
| 24 | Mobile tab bar, toolbar actions |
| 1.4–1.6u | TV buttons and the announcement pill |

## Custom glyphs

These are drawn to Lucide's rules (24 grid, 2px padding, the same stroke, round caps) only where Lucide has no fitting icon:

- **Domain:** indexer, seeding (an upload with a leaf), subtitle sync (captions with a waveform), catalog.
- **Devices and owner tools use Lucide** too: `tv`, `smartphone` (phone), `laptop`, `key-round` (API keys), `palette` (themes), `scroll-text` (logs), `archive` (backups) and `file-input` (manual import).
- **Media types use Lucide**, which covers them: `film` (movie), `tv` (series), `music`, `book`, `headphones` (audiobook), `podcast` and `monitor-play` (online video).

Sources live in `design/assets/icons`. `@highsea/ui-web` ships them with the Lucide subset through one `Icon` component, by semantic name (`<Icon name="seeding" />`), so a glyph can be redrawn or swapped without touching product code.

## Not icons

- **Quality markers** (4K, HDR, DV, 1080p, CC) are text pills, not icons: mono or 600-weight caps in a `line-strong` outline.
- **The highsea mark** is a logo, not an icon. It never appears inline in UI text, and it isn't redrawn at icon stroke weights.
