# TV (10-foot)

TV clients run on Apple TV (tvOS), Android TV and Google TV, webOS and Tizen. Everything here is designed for a couch about 3 m from a 55-inch-plus screen, operated by a 5-way remote.

## Units

All TV layout and type use **screen units**: `1u` is 1% of the screen width. The 16:9 screen is therefore 100u × 56.25u.

| Resolution | 1u |
| --- | --- |
| 1280 × 720 | 12.8px |
| 1920 × 1080 (reference) | 19.2px |
| 3840 × 2160 | 38.4px |

Designing in `u` makes every TV resolution render identically. On web builds this is `1cqw` on a 16:9 container. Native builds compute it from the window width.

## Layout

The home screen uses the **Hero + rows** layout, locked in [direction.md](../../brand/direction.md#layouts).

| Region | Position / size |
| --- | --- |
| Server identity (mark + server name) | Top 3.2u, left 4.5u |
| Announcement pill | Top 3.2u, right 4.5u |
| Hero artwork | Full width, top 62% of the screen; two layers that cross-fade |
| Hero copy (eyebrow, title, meta, synopsis, actions) | Left 4.5u, top 7.5u, max width 38u |
| Rows | Bottom 47% of the screen, left inset 4.5u, bleeding off the right edge; below the featured row they continue down the page |
| Poster | 10.5u wide (2:3), with a 1.2u gap; the title (1.05u, 600) and the year (0.95u, `text-3`) under the art |
| Wide tile (continue watching) | 16:9 with a progress bar 7% in from the edges |
| Radii | Posters and buttons 0.5u (≈ 10px at 1080p); quality pills 0.3u |

**Safe area.**
- Text and focusable items stay at least 4.5u (≈ 86px) from the left and right edges, and 3.2u (≈ 61px) from the top and bottom. This meets the tvOS guideline of 80 × 60px.
- Artwork and rows may bleed past the safe area to the screen edge.
- On platforms with overscan, the safe area grows to 5% on every side.

**Global navigation (designed in Phase 2).** Top-level navigation (Home, Search, Library, Settings) is a top tab row that appears when focus moves Up from the hero actions, as on tvOS. It is a focus guide target, and hidden otherwise.

## Type

| Style | Size | ≈ px at 1080p | Weight / notes |
| --- | --- | --- | --- |
| Hero title | 5.2u | 100 | 600, −0.035em, line height 0.95 |
| Synopsis | 1.15u | 22 | 400, `text-2`, line height 1.45 |
| Row title | 1.2u | 23 | 600; the curated-by suffix in `text-2` |
| Button label | 1.1u | 21 | 600 |
| Meta (year, runtime, genre) | 1.05u | 20 | 400, `text-2` |
| Server name | 1.05u | 20 | 600 |
| Eyebrow | 0.95u | 18 | 600, uppercase, +0.14em, `accent-text` |
| Announcement pill | 0.95u | 18 | 400, `text-2` |
| Quality pills (4K HDR, CC) | 0.8u | 15 | 600, outlined |

**Minimum.** Nothing on TV is smaller than 0.8u (≈ 15px at 1080p). Anything the user must read to act is at least 0.95u.

## Focus appearance

- **Ring:** 0.2u (≈ 4px at 1080p) in `text` (`#ededee`), with a soft dark drop shadow. There is no colored halo.
- **Scale:** focused posters scale to 1.09 and buttons to 1.07, both with `spring.base`. The focused item rises above its neighbors.
- **Hero buttons:** the primary action (Play) is a solid `text` fill with a `bg` label. Secondary actions (Details) are a translucent `text` fill at 12% with a `text` label. Focus adds the ring and scale; it doesn't change the fill.
- **Select feedback:** a brightness pulse (1 → 1.35 → 1, 280ms) plus the `select` sound.
- **Focus leaving the app:** the visible focus state is removed when the app loses focus, and restored to the same item when it returns.

## Spatial focus model

The reference implementation is the focus engine in `design/explorations/shared/board.js`. `@highsea/ui-web` (TV web builds) and `ui-native` must behave identically.

### Picking the next item

When a direction is pressed, the engine considers every focusable item. A candidate must:

1. **Be ahead** in that direction. Its center must be more than 2px past the current item's center on that axis.
2. **Line up with the current item:**
   - **Left / Right:** the candidate must overlap the current item's vertical band. Focus never slides diagonally into another region.
   - **Up / Down:** the candidate must overlap the current item horizontally, or lie within a 45° cone (vertical distance ≥ horizontal distance).
3. **Not be inside an isolated region** (`isolate`) that the current item is outside of. Isolated regions, such as a navigation rail, are entered only through a focus guide.

Among valid candidates, the **lowest score** wins:

```
score = edge gap along the axis + orthogonal center offset × (3 for left/right, 1 for up/down)
```

The heavier orthogonal weight for left and right keeps horizontal moves within the same row.

### Focus guides

If no candidate qualifies, the engine looks for a **focus guide** on an ancestor of the current item: a declaration that says "pressing this direction from here goes to group X." It then focuses that group's remembered item, or the group's first item. Layouts use guides wherever regions don't line up geometrically. For example, Up from any row goes to the hero actions.

### Group memory

- Every row or region is a **group**, and the engine remembers the last focused item in each one.
- When a move lands in a different group, and that group's remembered item is still ahead in the pressed direction, focus returns to the remembered item instead of the geometric best.
- **Result:** moving down to the next row and back up returns you to the poster you left, not the one nearest the cursor.

### Edges

When nothing qualifies and no guide applies, focus stays where it is. Sound and visual feedback follow [sound › edge of a list](../sound.md#event-taxonomy).

## Scrolling

- **Tracks:** rows scroll horizontally, and the row stack scrolls vertically. Both scroll **by transform**, with `spring.base`, never by native scroll.
- **Nested tracks:** each scrolls on its own axis.
- **Positioning:** the focused item is kept at a fixed fraction of the viewport (`keep`):
  - horizontal rows keep focus at 30% from the left;
  - the vertical row stack keeps the focused row at 32% from the top;
  - on Home, the page moves as one: it rests at the top while focus is on the hero or the featured row, and on any row below it lifts so that row's title sits at the safe area's top. The hero, the server identity and the announcement pill scroll away with it; nothing stays pinned over the rows.
- **Clamping:** a track is clamped at its start and end, so it never scrolls past its content. Centered carousels are the exception, and the Hero + rows layout doesn't use them.
- **Measurement:** positions are measured from item and track centers, so in-flight transforms and focus scaling don't cause drift.

## Hero behavior

- **Focus binds the hero** ([ADR 0015](../../adr/0015-tv-hero-binds-featured-row.md)): when focus lands on a title in the **featured row** (the hero's own titles), the hero shows that title (artwork, eyebrow, title, meta and synopsis). The rows below don't bind it: their titles carry their own names and years, and the hero is out of view while they have focus.
- **Dwell:** the change waits for 220ms of focus dwell, so fast scrolling through a row doesn't thrash.
- **Transition:** artwork cross-fades between two layers. Copy leaves over 140ms and returns with `spring.base`. See [motion › content swap](../motion.md#choreography).
- **Focus leaves the rows:** when focus moves to the hero actions, the hero keeps the last bound title, so Play acts on what's shown.

## Remote keys

| Key | Action |
| --- | --- |
| D-pad | Move focus (spatial model above); plays `navigate` |
| OK / Enter | Activate; plays `select` |
| Back / Escape | Go up one level; plays `back`. At the home root, the first Back returns focus to the first item of the top row, and a second Back exits (with platform confirmation where required). |
| Play/Pause | Play the focused title directly, without opening details |
| Long-press OK / Menu | Context actions for the focused item (mark watched, add to list) |

## Performance

- Animate only `transform` and `opacity`. No layout-triggering animation.
- Target 60fps on the lowest supported device class (roughly a 2019 streaming stick). Decode artwork at display size, and keep the hero to two layers.
- Prefetch artwork for the next three or four items in the focused row once dwell completes.
