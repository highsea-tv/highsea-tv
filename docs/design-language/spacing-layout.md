# Spacing and layout

## Spacing scale

The scale uses a 4px base. The board used ad-hoc values from 2 to 26px; this scale normalizes them.

| Token | px | Typical use |
| --- | --- | --- |
| `space-0.5` | 2 | Hairline nudges, nav-item gaps |
| `space-1` | 4 | Icon-to-text in badges |
| `space-2` | 8 | Icon-to-text in buttons, chip gaps |
| `space-3` | 12 | Widget grid gap, card stacks |
| `space-4` | 16 | Card padding (dense), section gaps in admin |
| `space-5` | 20 | Card padding (comfortable) |
| `space-6` | 24 | Admin main padding, panel gaps |
| `space-8` | 32 | Section spacing in clients |
| `space-10` | 40 | Page top padding |
| `space-12` | 48 | Large section breaks |
| `space-16` | 64 | Page-level separation on wide screens |

TV doesn't use this scale. It uses screen units; see [TV › Layout](platforms/tv.md#layout).

## Radii

These values are locked in [direction.md](../brand/direction.md#shape).

| Token | px | Use |
| --- | --- | --- |
| `radius-sm` | 8 | Buttons, inputs, nav items, small controls |
| `radius-md` | 12 | Widgets, popovers, menus |
| `radius-lg` | 16 | Cards, panels, the admin frame |
| `radius-xl` | 28 | Sheets, large modals |
| `radius-poster` | 10 | Posters and stills (scaled on TV, see platform guide) |
| *(pill)* | 999 | Badges, chips, segmented controls, announcement pills |

**Nesting rule:** an inner radius equals the outer radius minus the padding between them, and is never less than 4px.

## Breakpoints

| Name | Width | Notes |
| --- | --- | --- |
| compact | < 600 | Phones. One column |
| medium | 600–1023 | Tablets, narrow windows. The admin sidebar collapses to an icon rail |
| expanded | 1024–1439 | Laptops. Full admin sidebar; 4-column widget grid |
| wide | ≥ 1440 | Desktops. Content max width applies |

TV doesn't use breakpoints. It is always laid out at 16:9 in screen units.

## Grids per platform

| Platform | Grid | Details |
| --- | --- | --- |
| **TV** | Screen units (`1u` = 1% of width) | 4.5u left content inset; see [TV](platforms/tv.md#layout) |
| **Mobile** | 16pt side gutters | Rows scroll horizontally edge to edge, with the first item aligned to the gutter. See [mobile](platforms/mobile.md) |
| **Desktop and web clients** | 12-column fluid | 24px gutters, 32–64px side margins by breakpoint |
| **Admin** | Sidebar + fluid main | Sidebar 216px; main padding 24px; widget grid of 4 columns (expanded+), 2 (medium) or 1 (compact) with a 12px gap. See [admin](platforms/admin.md) |

## Aspect ratios

| Asset | Ratio |
| --- | --- |
| Poster | 2:3 |
| Still or episode | 16:9 |
| Hero backdrop | 16:9, cropped to fill |
| Square (album, podcast) | 1:1 |
| Book cover | 2:3, contained, not cropped |
