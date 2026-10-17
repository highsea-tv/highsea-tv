# Elevation and blur

## Elevation is tone first, shadow second

Higher layers are lighter surfaces. Shadows only separate layers that float over other content.

| Level | Surface | Shadow | Examples |
| --- | --- | --- | --- |
| 0 | `bg` | none | App background |
| 1 | `s1` + `line` border | none | Cards, widgets, panels, sidebar |
| 2 | `s2`–`s3` | `0 1px 2px rgb(0 0 0 / 0.3)` | Raised controls, segmented-control thumb, toggles |
| 3 | `s3`–`s4` | `0 20px 40px -20px rgb(0 0 0 / 0.7)` | Toasts, tooltips |
| 4 | `s3`–`s4` | `0 24px 48px -16px rgb(0 0 0 / 0.75)` | Menus, popovers, sheets, dialogs |

The shadows come from the reference board: level 2 is the segmented-control thumb and active tab, level 3 the toast, level 4 the menu. Sheets and dialogs also use level 4.

**Rules**
- **Shadows are always black.** Never colored, never a glow.
- **Borders:**
  - `line` on level-1 surfaces;
  - `line-strong` on inputs and on the admin frame;
  - no border on levels 3–4 when the shadow already separates them.

## Blur

Blur is only for chrome that floats over *moving or image content*. Never blur over a flat surface.

| Use | Recipe |
| --- | --- |
| Bars over scrolling content (mobile tab bar, sticky headers) | `bg` at 82% + `blur(18–20px) saturate(140%)` |
| Pills over artwork (TV announcement pill) | `s2` at 75% + `blur(12px)` |
| Small badges over artwork (poster quality badge) | `blur(6px)` |
| Scrim behind a modal | `bg` at about 60% + `blur(6px)` |
| TV ambient backdrop (detail pages) | Artwork + `blur(2.6u)`, dimmed (from the archived spotlight layout) |

- Provide a solid fallback when blur is unavailable: the same color at 96% opacity.
- Reduced-transparency settings switch blur off and use the fallback.

## Scrims over artwork

Text over artwork sits on a scrim that fades to `bg`, never to black or a hue. For example, the TV hero uses:

- a horizontal gradient: `bg` at 6% → `bg` 60% at 42% → transparent at 70%;
- a vertical gradient from `bg` at the bottom to transparent at 45%.

Text over a scrim must still pass the [contrast policy](color.md#contrast-policy). Measure it at the darkest point the text crosses.
