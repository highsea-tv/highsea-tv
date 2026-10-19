# Custom icon glyphs

Glyphs that [Lucide](https://lucide.dev) doesn't cover, drawn to its rules: a 24-unit grid, 2px padding, stroke 1.75, round caps and joins, `currentColor`. See [iconography](../../../docs/design-language/iconography.md#custom-glyphs).

| File | Glyph |
| --- | --- |
| `indexer.svg` | A result list with a magnifier |
| `seeding.svg` | An upward arrow growing as a sprout, a leaf either side |
| `subtitle-sync.svg` | The captions frame with a waveform over a line of text |
| `catalog.svg` | Tiles with a plus: the add-on catalog |

Final as of Phase 2 (checkpoint 5): each was checked beside its Lucide neighbours at 16, 20, 24 and 72px, on dark and light. The flows needed no further glyphs; everything else they use is in Lucide.

These files are the source. `bun run build` in `packages/ui-web` turns them into `src/icons/glyphs.ts`, and its tests fail when that file is stale. Keep each file to plain `path`, `circle`, `rect`, `line`, `polyline` and `ellipse` elements with no transforms or fills.

Media types use Lucide: `film` (movie), `tv` (series), `music`, `book`, `headphones` (audiobook), `podcast` and `monitor-play` (online video).
