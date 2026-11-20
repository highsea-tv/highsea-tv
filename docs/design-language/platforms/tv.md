# TV (10-foot)

TV clients run on Apple TV (tvOS), Android TV and Google TV, webOS and Tizen. Everything here is designed for a couch about 3 m from a 55-inch-plus screen, operated by a 5-way remote.

The TV is one of `apps/client`'s form factors ([ADR 0061](../../adr/0061-one-client-platform.md)): the same screens as the phone and the web, laid out by the form-factor rule in the TV's own class, whatever the screen's width. The Apple TV build is `tv.highsea.tv` on react-native-tvos; Android TV comes from the same project in checkpoint 4.5c. The prototypes' TV frame holds the client's mock export (`#/tv/…`).

## Units

All TV layout and type use **screen units**: `1u` is 1% of the screen width. The 16:9 screen is therefore 100u × 56.25u.

| Resolution | 1u |
| --- | --- |
| 1280 × 720 | 12.8px |
| 1920 × 1080 (reference) | 19.2px |
| 3840 × 2160 | 38.4px |

Designing in `u` makes every TV resolution render identically. The library's theme gives it as `u` (`useTheme().u`), the window's width over 100, on the devices and in a browser alike; the prototypes drew it as `1cqw` on a 16:9 container.

## Layout

The home screen uses the **Hero + rows** layout, locked in [direction.md](../../brand/direction.md#layouts). Since the owner's change of 2026-11-18, when the featured section is Home's first section, its hero is a title's hero (`TvHero`, as a film's page has it): the section's first title's art across the first screen behind the head, the logo (its name when there's none), meta and tagline low on the left, then **Play** or **Resume**, which takes the focus, and **More info**; then the rows. Otherwise, as since the owner's change of 2026-10-30, it is the **featured card**: the featured section's first title as one large card under the head, then the rows ([client-home.md › TV](../../product/client-home.md#tv-locked)). The table gives the head and the card as built (`apps/client/src/home/tv.tsx`, `@highsea-tv/ui`'s `FeaturedCard` and `TvHead`).

| Region | Position / size |
| --- | --- |
| The head | One line across the top inside the safe area: the server's mark and name at the left, Search as its icon, then Home, Collections and Movies centred (Shows and Music where the server has them), Alerts and the account at the right (`tv.head`); it scrolls away with the page |
| Featured card | Across the page inside the safe area, 40.5u high with a 1.4u corner (`featuredCard.tv`), 1u above and below it; the title (5.2u), meta and tagline low on the left, 2.8u in, no wider than 34u |
| Rows | Under the featured card, left inset 2.4u, bleeding off the right edge, continuing down the page |
| Poster | 11.7u wide in rows (2:3), with a 1.2u gap; the title (1.05u, 600) and the year (0.95u, `text-3`) under the art, on one line. A grid is six across the safe area (`TV_GRID_COLUMNS`), each tile filling its share (14.9u). Until the owner asked for a little bigger cards on every client (2026-11-19, HT-115) a poster was 10.5u and a grid seven across; the parts measured in that width (the sign-in's QR and keyboard, Settings' columns, a page's Play) keep it as `tv.column` |
| Wide tile (continue watching) | 16:9 with a progress bar 7% in from the edges |
| Continue watching | Cards 22u wide, larger than a poster row's (the owner, 2026-10-30) |
| Alerts | A list up to 60u wide, 1.2u between announcements; with none, 1.4u between the words and the button back to Home |
| A person | The portrait 13u round, beside the name and words, the biography cut at four lines; then a film row per department |
| A show's episodes | Stills 24u wide in a season's row; Cast and crew tiles 8u, as a film's page has them |
| An album or a playlist | A left column 24u wide with an 18u cover and a 2.4u title, 4u from the songs |
| Who's watching | Circles 9.5u, 2.8u apart, under a 3.2u title; at the opening, 11u circles 3u apart under a 3.6u title |
| A PIN | A pad 17u wide with 0.8u between keys, under a 5.6u circle and a 2.4u title |
| Radii | Posters 0.5u (≈ 10px at 1080p); controls by the TV rule, `radius-sm` at 1.75 times (≈ 0.73u, [controls](../controls.md)); quality pills 0.3u; small parts 0.4u (`tv.radius.sm`), cards and notes 0.6u (`tv.radius.md`), panels and dialogs 1u (`tv.radius.panel`) |

The rows from Continue watching to A PIN are the prototypes' values, kept when B1 and B3 moved the screens to apps/client. They're each screen's own measures, named once beside the screen (`apps/client/src/home/sizes.ts`'s `HOME`, `alerts/sizes.ts`'s `TV_ALERTS`, `shows/sizes.ts`'s `SHOW`, `music/sizes.ts`'s `TV_MUSIC`, `profiles/sizes.ts`'s `TV_WHO`, `TV_LAUNCH` and `TV_PIN`, `library/sizes.ts`'s `TV_LIBRARY`, `detail/layout.ts`'s `FILM_TV` and `PERSON_TV`, and `@highsea-tv/ui`'s `PersonPortrait`), so `bun run one-place` reads no value written in a screen. Part E's value table left them there, as the rule keeps a measure one screen uses in that screen's group.

**Spacing.** The TV's spaces are `tv.space`, keyed as the clients' scale is but in screen units: a step is 0.2u, so `tv.space.5` is 1u and `tv.space.12` is 2.4u (part E). The head's measures (the account's 3u circle, its 2.2u avatar, the 0.6u dots and the 2.6u stops) are `tv.head`, and the screen's height, 56.25u, is `tv.screenHeight`.

**Safe area.**
- Text and focusable items stay at least 2.4u (≈ 46px at 1080p) from every edge (`tv.safe` in the tokens). The owner tightened it from 4.5u and 3.2u on 2026-10-30, inside tvOS's guideline of 80 × 60 points, and confirmed it on 2026-11-03.
- Artwork and rows may bleed past the safe area to the screen edge.
- On platforms with overscan, the safe area grows to 5% on every side.

**Global navigation.** The head is the TV's top-level navigation, on every screen but the player (the owner, 2026-10-30): Search, Home, Collections and Movies (with Shows and Music where served), Alerts, and the account, which opens Settings. Focus reaches it by **Up** from the featured card or a screen's top stops, through a focus guide across the screen's width that lands on the stop for where the person is (`packages/ui/src/native/tv/head.tsx`); **Down** returns to the page. It isn't pinned: it's the first thing in the page and scrolls away with it.

## Type

| Style | Size | ≈ px at 1080p | Weight / notes |
| --- | --- | --- | --- |
| Hero title (the featured card's, `tvText.heroTitle`) | 5.2u | 100 | 600, −0.035em, line height 0.95 |
| Synopsis | 1.15u | 22 | 400, `text-2`, line height 1.45 |
| Row title | 1.2u | 23 | 600; the curated-by suffix in `text-2` |
| Button label | 1.1u | 21 | 600 |
| Meta (year, runtime, genre) | 1.05u | 20 | 400, `text-2` |
| Server name | 1.05u | 20 | 600 |
| Eyebrow | 0.95u | 18 | 600, uppercase, +0.14em, `accent-text` |
| Quality pills (4K HDR, CC) | 0.8u | 15 | 600, outlined, +0.04em (`tracking.tag`) |
| A dialog's or a player's title (album, PIN, message, player) | 2.4u | 46 | 600 (`tvText.title`) |

**Minimum.** Nothing on TV is smaller than 0.8u (≈ 15px at 1080p). Anything the user must read to act is at least 0.95u.

## Focus appearance

- **Ring:** 0.2u (≈ 4px at 1080p) in `text` (`#ededee`), with a soft dark drop shadow. There is no colored halo.
- **Scale:** focused posters scale to 1.05 and buttons to 1.07, both with `spring.base`. The focused item rises above its neighbors.
- **Action rows** (a film's page, the player, dialogs): the primary action (Play) is the primary look; round actions and secondary buttons take the overlay look, `control-overlay` (`text` at 12%) with a `text` label. Every button in a row is the same size ([controls](../controls.md)). Focus adds the ring and scale; it doesn't change the fill. The featured card has no buttons: it's one focus stop, which lifts only slightly, since at its size a poster's lift would push it off the screen.
- **Select feedback:** a brightness pulse (1 → 1.35 → 1, 280ms) plus the `select` sound.
- **Focus leaving the app:** the visible focus state is removed when the app loses focus, and restored to the same item when it returns.

## Spatial focus model

The reference implementation is the focus engine in `design/explorations/shared/board.js`. What moves focus differs by where the client runs; what a stop draws on focus doesn't. Every focus stop is the library's `Focusable` (`packages/ui/src/native/tv/focusable.tsx`), which lifts and draws the ring the same way everywhere, over one engine behind the same names (`tv/engine.tsx` and `tv/engine.web.tsx`, a platform pair):

- **On tvOS and Android TV,** the platform's own engine, through react-native-tvos: a stop asks for focus with `hasTVPreferredFocus` or `requestTVFocus()`, regions steer it with `TVFocusGuideView` (its `autoFocus` remembers a group's last stop, its `destinations` are the focus guides below), and the remote's presses arrive through `useTVEventHandler` ([react-native-tvos](https://github.com/react-native-tvos/react-native-tvos#readme)). The platform's engine scores candidates its own way; the guides and group memory keep the moves below.
- **In a browser** (the client's web build on the TV's form factor, and webOS and Tizen builds), the spatial focus engine below (`packages/ui/src/native/tv/spatial`, `@highsea-tv/ui/focus`), which behaves as the board's does. The stops and regions mark themselves in the DOM (`data-focusable`, `data-group`, `data-trap`, `data-guide`), and one navigator moves focus by the arrow keys, Enter, Escape and Backspace.

`scripts/sweeps/dpad.ts` checks that every stop is reachable in a browser, and `scripts/sweeps/tv.ts` walks the Apple TV build with the remote (an XCUITest on `XCUIRemote`).

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

If no candidate qualifies, the engine looks for a **focus guide** on an ancestor of the current item: a declaration that says "pressing this direction from here goes to group X." It then focuses that group's remembered item, or the group's first item. Layouts use guides wherever regions don't line up geometrically. For example, Up from the featured card or a page's top stops goes to the head.

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
  - on Home, the page moves as one (the library's `TvPage`): it rests at the top while focus is on the hero's actions or the featured card, and on any row below it lifts so that row's title sits at the safe area's top. The head and the hero or the featured card scroll away with it; nothing stays pinned over the rows.
- **Clamping:** a track is clamped at its start and end, so it never scrolls past its content. Centered carousels are the exception, and the Hero + rows layout doesn't use them.
- **Measurement:** positions are measured from item and track centers, so in-flight transforms and focus scaling don't cause drift.

## Hero behavior

- **Nothing binds the featured card** since the owner's change of 2026-10-30: it shows the featured section's first title, and OK opens that film. [ADR 0015](../../adr/0015-tv-hero-binds-featured-row.md)'s binding to a featured row, with its 220ms dwell and the two artwork layers that cross-fade, went with the featured row ([client-home.md › Decisions](../../product/client-home.md#decisions)).
- **Bloom:** while the page rests at its top, a glow in the art's colour sits behind the card.

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
- Target 60fps on the lowest supported device class (roughly a 2019 streaming stick). Decode artwork at display size.
- Prefetch artwork for the next three or four items in the focused row once dwell completes.
