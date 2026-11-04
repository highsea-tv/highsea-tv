# Mobile

Mobile clients run on iOS and Android, built with Expo and React Native ([ADR 0008](../../adr/0008-clients-react-everywhere.md)). Sizes below are in points (pt / dp).

## Home: Tabs + carousel

This layout is locked in [direction.md](../../brand/direction.md#layouts). From top to bottom:

1. **Header:**
   - on the left, the server switcher: the server's mark and name, with a chevron that opens the multi-server switcher;
   - on the right, the user's avatar, which leads to profile and settings.
2. **Announcement card:** the owner's current announcement on `s1`, with a megaphone in an `accent-soft` circle. Dismissible unless the owner requires acknowledgement.
3. **Featured carousel:**
   - large cards from the server's featured section, with the next card peeking in from the right;
   - each card shows the title, plus a kicker line such as "New · 2023 · Comedy";
   - the carousel never auto-advances (see [motion](../motion.md#choreography)).
4. **Poster rows:** row titles (for example "Recently added", or a curated "Because you watched…"), then horizontally scrolling 2:3 posters.
5. **Tab bar:**
   - five destinations: **Home, Search, Library, Offline, You**;
   - the active tab uses `accent-text` and inactive tabs use `text-3`, so the accent marks only the active destination;
   - the bar is translucent over content (see [elevation › blur](../elevation.md#blur)).

## Layout

- **Gutters:** 16pt left and right. Rows scroll edge to edge, with the first item aligned to the gutter.
- **Row gaps:** 8pt between posters, and 24pt between rows (title included).
- **Safe areas:** content respects the platform's safe-area insets. The tab bar sits above the home indicator, and content scrolls under the status bar with a `bg` scrim.
- **Posters:**
  - about 30% of the screen width in rows, so about three visible plus a peek;
  - about 78% of the width in the featured carousel.
- **Home's other rows** (the prototype's, kept when B1 moved Home to apps/client): Continue watching cards are 62% of the row, and still rows 46%, so two show with a peek. These are values in `apps/client/src/home/sizes.ts` (`HOME`), with no token yet (part E).
- **A person's page** (B1): the round portrait is centred with the words under it; the biography is 15pt on a 1.45 line, cut at four lines with More. The section headings over its rows are 17pt. Neither size is a token yet (part E).
- **Music's pages** (B3): an album's cover and an artist's mosaic are 62% of the width inside the gutters; the artist under an album's title is 17pt, the meta lines under a title 13pt, an artist's name 28pt, and a song's cover has a 6pt corner. These are values in `apps/client/src/music/sizes.ts` (`MUSIC`), with no token yet (part E).

## Touch

- **Targets:** at least 44 × 44pt. Controls keep their drawn size (36) and reach 44 with an invisible hit area (`hitSlop`), 8pt apart ([controls](../controls.md)). Posters are their own target.
- **Feedback:** press feedback is a 0.97 scale with `spring.quick`, with no highlight color.
- **Haptics:** a light haptic on `select`-class actions and a success haptic on `success`, following the platform's haptics setting. Haptics are independent of UI sound.
- **Gestures:**
  - standard platform gestures: swipe back on iOS, predictive back on Android;
  - pull to refresh on Home and Library;
  - no custom gestures without a visible alternative.

## Type

See [typography › mobile](../typography.md#mobile). Text scales with the OS text-size setting. Layouts must hold at 200%: rows grow taller, and titles wrap, then truncate.

## Sound

Off by default. When enabled, sound follows the silent switch. See [sound › defaults](../sound.md#defaults).

## Platform conventions

- **iOS:** native navigation stack and sheets, with large titles on Library and Search.
- **Android:** a Material-style predictive-back animation.
- **Visual language:** both keep highsea's components, colors and type. Platform conventions apply to *behavior*, not to look.
