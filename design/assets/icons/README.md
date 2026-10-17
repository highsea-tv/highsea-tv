# Custom icon glyphs

Glyphs that [Lucide](https://lucide.dev) doesn't cover, drawn to its rules: a 24-unit grid, 2px padding, stroke 1.75, round caps and joins, `currentColor`. See [iconography](../../../docs/design-language/iconography.md#custom-glyphs).

| File | Glyph |
| --- | --- |
| `indexer.svg` | A result list with a magnifier |
| `seeding.svg` | An upload arrow with a leaf |
| `subtitle-sync.svg` | Captions with a waveform |
| `catalog.svg` | Tiles with a plus: the add-on catalog |

These files are the source. `bun run build` in `packages/ui-web` turns them into `src/icons/glyphs.ts`, and its tests fail when that file is stale. Keep each file to plain `path`, `circle`, `rect`, `line`, `polyline` and `ellipse` elements with no transforms or fills.

Media types use Lucide: `film` (movie), `tv` (series), `music`, `book`, `headphones` (audiobook), `podcast` and `monitor-play` (online video).
