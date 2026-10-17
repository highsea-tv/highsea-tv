# Typography

## Families

| Family | Use |
| --- | --- |
| **Geist** | Display, UI and body, everywhere |
| **Geist Mono** | Figures and machine text: sizes, rates, ETAs, durations, release names, paths, keyboard hints, labels |

Both are licensed under SIL OFL 1.1 and are bundled with the apps by `@highsea/brand`. Self-hosted clients must not depend on a font CDN.

## Weights and tracking

| Weight | Use |
| --- | --- |
| 400 | Body and UI text |
| 500 | Buttons (secondary), nav items, the wordmark's `tv` |
| 600 | Display, headings, titles, filled-button labels, badges |

- 700 isn't used. Hierarchy comes from size and color first.
- **Display and heading** use −0.035em tracking. **Titles** use −0.01em.
- **The wordmark** uses −0.045em. It is a drawn lockup, not a text style.
- **Labels** (small uppercase mono, such as section kickers and table headers) use 11px, +0.06em tracking and `text-3`.

## Figures

- Every number that can change or be compared uses **tabular figures**: sizes, speeds, counts, timestamps, progress.
- Data figures in admin use Geist Mono. Headline stats (for example "18.4 MB/s") use Geist 600 for the value and Geist 400 in `text-2` for the unit.

## Scales

### Web and desktop

Taken from the reference board:

| Style | Size / line height | Weight | Color |
| --- | --- | --- | --- |
| Display | 40 / 1.05 | 600 | `text` |
| Heading | 28 / 1.15 | 600 | `text` |
| Title | 19 / 1.3 | 600 | `text` |
| Body | 15 / 1.6 | 400 | `text-2` |
| Caption | 12.5 / 1.4 | 400 | `text-3` |
| Mono | 13 | 400 | `text`, `text-2` |
| Label | 11, uppercase, +0.06em | 400 (mono) | `text-3` |

### Admin (dense)

- **Base size** is 13px, for nav, tables and widgets. Forms and dialogs use body 14px.
- **Table cells:**
  - text cells are 13px, and numeric cells are mono 12px in `text-2`;
  - headers are Geist 500 at 11.5px in `text-3`;
  - the release name sits under the title in mono 11px `text-3`, truncated.
- **Widget titles** are 13px at 600. Widget values use the headline stat style at 24–28px.

### TV

TV type is sized in screen units, where `1u` is 1% of screen width (19.2px at 1080p). See [TV › Type](platforms/tv.md#type).

### Mobile

These sizes are in points. They are derived from the board's scaled phone frame (13px at 300px wide, about 17pt at real 390pt width).

| Style | Size / line height | Weight |
| --- | --- | --- |
| Large title | 30 / 36 | 600 |
| Title | 20 / 26 | 600 |
| Body | 16 / 22 | 400 |
| Callout (cards, metadata) | 14 / 19 | 400 |
| Caption | 12 / 16 | 400 |
| Tab label | 10.5 | 500 |

Mobile text follows the platform's text-size setting (Dynamic Type or Android font scale), up to at least 200%.

## Line length and truncation

- **Body text** runs 45–72 characters per line. Synopses on TV are capped at 38u wide.
- **Titles** truncate at the end with an ellipsis after two lines. On TV, poster titles wrap to two lines, then truncate.
- **Release names and paths** truncate at the end on one line, with the full value available on hover or in details. Never wrap a release name.
