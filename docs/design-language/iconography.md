# Iconography

## Base set

[Lucide](https://lucide.dev) (ISC license) is the base set. Its geometry is drawn on a 24-unit grid.

- **Stroke width** is **1.75** at every size, a little lighter than Lucide's default of 2 to match Geist. On TV, icons ≥ 1.4u use stroke 2, for 10-foot legibility.
- **Caps and joins** are round, as in Lucide.
- **Color:** icons take `currentColor`. At rest they use `text-2` (admin nav, toolbars) or `text` (buttons). The active state uses `accent-text`.

## Sizes

| Size | Use |
| --- | --- |
| 12 (`2xs`) | Beside a caption or inside a tag: a rating's stars, a done step's check |
| 14 (`xs`) | Small controls (`controlGeometry.sm`) |
| 16 | Inline with 13–14px text: admin nav, tables, small buttons |
| 20 | Default buttons, inputs, menu items |
| 24 | Mobile tab bar, toolbar actions |
| 1.4–1.6u | TV buttons and the announcement pill |

- **Discs.** An icon that stands for a message sits in a circle: `icon.disc.sm` (32) in a Banner, a toast and a small EmptyState, `md` (44) in a dense one (the admin's) and `lg` (56) in the clients'.
- **Drop.** An icon beside text that may wrap sits on its first line, dropped by `icon.drop` (1px), or `icon.dropTv` (0.2u) on the TV.
- Two TV icons stay under 1.4u as their components' own measures: the TV badge's (0.95u) and the acknowledgement card's announcement icon (1.1u).

## Custom glyphs

These are drawn to Lucide's rules (24 grid, 2px padding, the same stroke, round caps) only where Lucide has no fitting icon:

- **Domain:** indexer (a list with a magnifier), seeding (an upward arrow growing as a sprout), subtitle sync (captions with a waveform over the text), catalog (tiles with a plus).
- **Devices and owner tools use Lucide** too: `tv`, `smartphone` (phone), `laptop`, `key-round` (API keys), `palette` (themes), `scroll-text` (logs), `archive` (backups) and `file-input` (manual import).
- **The player's skips use Lucide:** `rotate-ccw` (`replay`) and its clockwise twin `rotate-cw` (`forward`), so neither is mirrored.
- **Media types use Lucide**, which covers them: `film` (movie), `tv` (series), `music`, `book`, `headphones` (audiobook), `podcast` and `monitor-play` (online video).

Sources live in `design/assets/icons`. `@highsea-tv/ui` ships them with the Lucide subset through one `Icon` component, by semantic name (`<Icon name="seeding" />`), so a glyph can be redrawn or swapped without touching product code.

## Not icons

- **Quality markers** (4K, HDR, DV, 1080p, CC) are text pills, not icons: mono or 600-weight caps in a `line-strong` outline.
- **The highsea mark** is a logo, not an icon. It never appears inline in UI text, and it isn't redrawn at icon stroke weights.
