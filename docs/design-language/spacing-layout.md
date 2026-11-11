# Spacing and layout

## Spacing scale

The scale uses a 4px base. The board used ad-hoc values from 2 to 26px; this scale normalizes them.

| Token | px | Typical use |
| --- | --- | --- |
| `space-0.5` | 2 | Hairline nudges, nav-item gaps |
| `space-1` | 4 | Icon-to-text in badges |
| `space-1.5` | 6 | Tight gaps in small parts: a tag's icon, a key cap's padding |
| `space-2` | 8 | Icon-to-text in buttons, chip gaps |
| `space-2.5` | 10 | A control's inner gaps between 8 and 12 |
| `space-3` | 12 | Widget grid gap, card stacks |
| `space-4` | 16 | Card padding (dense), section gaps in admin |
| `space-5` | 20 | Card padding (comfortable) |
| `space-6` | 24 | Admin main padding, panel gaps |
| `space-8` | 32 | Section spacing in clients |
| `space-10` | 40 | Page top padding |
| `space-12` | 48 | Large section breaks |
| `space-16` | 64 | Page-level separation on wide screens |

`space-1.5` and `space-2.5` are Tailwind's steps of the same names, added in part E (the owner's sign-off of 2026-11-10). TV doesn't use this scale. It has its own in screen units, `tv.space`; see [TV › Layout](platforms/tv.md#layout).

## Radii

These values are locked in [direction.md](../brand/direction.md#shape). `radius-xs`, `radius-2xs` and `radius-3xs` were added below them with the owner's sign-off of 2026-11-10 (part E).

| Token | px | Use |
| --- | --- | --- |
| `radius-3xs` | 2 | The smallest marks: a legend's swatch |
| `radius-2xs` | 4 | Tags and quality badges, key caps, small photos in a list |
| `radius-xs` | 6 | Small parts inside a larger one: a sortable row's handle, the widget editor's marks |
| `radius-sm` | 8 | Every control on every platform: buttons, icon buttons, inputs, selects, segmented controls, tabs, nav items ([controls](controls.md)) |
| `radius-md` | 12 | Widgets, popovers, menus |
| `radius-lg` | 16 | Cards, panels, the admin frame |
| `radius-xl` | 28 | Sheets, large modals |
| `radius-poster` | 10 | Posters and stills (scaled on TV, see platform guide) |
| *(pill)* | 999 | Badges, chips (at the control's height), announcement pills, and the media players' own controls |

**Nesting rule:** an inner radius equals the outer radius minus the padding between them, and is never less than 4px.

## Width classes

One rule lays out every client and the admin: the form-factor rule (`form-factor.ts` in the tokens, read through `useFormFactor`, and `useRegularWindow` in the admin's parts). A window is **compact** below 768 and **regular** from 768, and the TV is its own class (the owner, 2026-11-03 and 2026-11-10). There are no other breakpoints: the admin's and the library's old 600, 1024 and 1440 left the tokens in part E.

| Class | Width | Notes |
| --- | --- | --- |
| compact | < 768 | Phones and narrow windows. One column; the admin's sidebar is a menu |
| regular | ≥ 768 | Tablets, laptops and desktops. The admin's full sidebar and 4-column widget grid; content max width applies |
| TV | 16:9 | Laid out in screen units, at any width |

A component may still lay out by what its own content needs. That is a measure of the component, kept in its token group with its reason, and not a second page width: the page is compact or regular by the rule above either way. The admin has three:

- **Settings' areas** sit beside an area's page once the window has room for the sidebar, the page's padding, the areas' column and the least the page needs beside them (`admin.settings.contentMin`, 640, which keeps Appearance's identity and themes from breaking a word): from 1136. Below that they fold into a menu above the page, beside All settings (the owner, 2026-11-10).
- **The connection kinds' grid** takes as many columns as fit at `admin.connections.kindMin` (144) each, at most five, with CSS Grid's `auto-fill`.
- **Appearance's themes** take as many cards as fit at `admin.appearance.themeMin` (192) each, at most three, the same way.

## Grids per platform

| Platform | Grid | Details |
| --- | --- | --- |
| **TV** | Screen units (`1u` = 1% of width) | 4.5u left content inset; see [TV](platforms/tv.md#layout) |
| **Mobile** | 16pt side gutters | Rows scroll horizontally edge to edge, with the first item aligned to the gutter. See [mobile](platforms/mobile.md) |
| **Desktop and web clients** | 12-column fluid | 24px gutters; rows' side margins 16px when compact and 64px when regular |
| **Admin** | Sidebar + fluid main | Sidebar 216px from 768, a menu below; main padding 24px; widget grid of 4 columns when regular and 1 when compact, with a 12px gap. See [admin](platforms/admin.md) |

## Aspect ratios

| Asset | Ratio |
| --- | --- |
| Poster | 2:3 |
| Still or episode | 16:9 |
| Hero backdrop | 16:9, cropped to fill |
| Square (album, podcast) | 1:1 |
| Book cover | 2:3, contained, not cropped |

## The scrollbar

On the web, a page and the library's scrollers hide the browser's own bar, which takes a column of its own, and draw a thin handle over the content instead (approved with 4.4a). Its measures are the `scrollbar` tokens:

| Token | Value | Use |
| --- | --- | --- |
| `scrollbar.inset` | 6 | The gap between the handle and the scroller's edges |
| `scrollbar.handle` | 6 | The handle's width at rest |
| `scrollbar.handleActive` | 8 | Its width while hovered or dragged |
| `scrollbar.reach` | 8 | How far towards the page the strip takes the pointer |
| `scrollbar.minThumb` | 32 | The shortest handle |
| `scrollbar.alpha` | 0.45 | `text-3` at this alpha at rest |
| `scrollbar.alphaActive` | 0.7 | `text-3` at this alpha while active |
