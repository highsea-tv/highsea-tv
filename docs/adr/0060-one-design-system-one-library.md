# 0060. One design system and one component library, adaptive to the app it's in

- **Status:** Proposed
- **Date:** 2026-11-01

Design system 1.1 ([design-system-1-1.md](../plans/design-system-1-1.md)), approved with the owner's answers of 2026-11-01. It stays Proposed until the owner signs off part C, when every app is on it.

## Context

Measured on 2026-11-01, the apps drew the same controls differently. The web had heights from 24 to 68 and five corners for one kind of control. The TV mixed heights in three rows, and the phone's buttons were 44 while its fields were 38. Each app took sizes from its own numbers, and the two libraries, `@highsea-tv/ui-web` and `@highsea-tv/ui-native`, were kept in step by hand. The theme audit checked text, not the edges and selected states that mark a control, so a custom theme could draw a field nobody can see (WCAG 2.2's 1.4.11 asks 3:1 for both).

The owner's goal is one design system that works with theming, and one shared component library that adapts to the app it's in. Layout and size may differ by platform. Which component draws a control, its props, its states and the roles they use may not.

## Decision

- **One control spec, in the tokens** (`packages/tokens/src/controls.ts`, [controls.md](../design-language/controls.md)):
  - two sizes, `md` (36) and `sm` (30), each with its padding, gap, icon, text and the `radius-sm` corner;
  - each state as colour roles (`buttonLooks`, `controlLooks`), with an `overlay` look for controls over artwork.
- **One rule per platform, not numbers per app** (`controlMetrics`):
  - **pointer:** as specified, with the admin's 14 and 13 text;
  - **touch:** the same drawn sizes with 16 text, plus an invisible 44 hit area (`targets.touch`). The hit area is React Native's `hitSlop` ([Pressable](https://reactnative.dev/docs/pressable#hitslop)) and, on the web, an `::after` box sized by `--control-hit`. Controls in a row are at least 8 apart, so hit areas never overlap ([WCAG 2.2, 2.5.8 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html));
  - **TV:** 1.75 times the geometry in screen units, with the TV's own type scale and its minimum icon size.
- **The web takes the rule from CSS.** The tokens write `--control-*` for a pointer on `:root`, for touch under `@media (pointer: coarse)` ([Media Queries Level 4, `pointer`](https://www.w3.org/TR/mediaqueries-4/#pointer)), and for any element that sets `data-platform`. The prototypes' phone and TV frames set it, so they draw the library's real components at the phone's and the TV's rules.
- **One package, two renderers.** `@highsea-tv/ui` joins ui-web and ui-native:
  - each component has one props type (`src/shared/controls.ts`), a web renderer (`src/web`, DOM and Tailwind) and a React Native renderer (`src/native`);
  - the package's root export picks the renderer by the `react-native` condition, which Metro asserts ([Metro, Package Exports](https://metrobundler.dev/docs/package-exports)). This is also how Expo's TypeScript base and `jest-expo` resolve. Vite, Next and Bun take `default`, the web;
  - this follows React Native's documented way of sharing code with the web ([Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code));
  - `src/shared/parity.ts` lists what both renderers draw, and why any component is on one side only.
- **One React per app.** In a workspace, Expo's Metro keeps `react`, `react-native` and the native modules to the app's own copies (`@expo/cli`'s autolinking resolver). The library's tests keep the web's React, so the phone's Jest maps `react` to the app's copy, as Metro does.
- **Theming holds controls too.** The audit gains checks for a field's edge, a chosen segment and the focus ring at 3:1 on every surface, and for a chosen segment's label. They're met by derived roles, as the badge roles are. `control-edge` and `control-selected` are lightened from `line-strong` and `s4` only as far as 3:1 needs, and a custom accent's focus ring the same way. A theme author's own colours stay as they are.
- **Checks keep it.** The sweeps check that controls in a row share one height, corner and text size. A source test finds raw sizes, corners and colours on controls in the apps and the prototypes, with a listed exception file. A bundle test checks that the web build carries no React Native and the phone's no DOM renderer.

## Consequences

- A control is changed in one place for every app and theme. Apps still lay themselves out for their screen.
- Every screen in every app changes a little: the phone's buttons come down from 44 to 36, fields to 36, and pills become `radius-sm`. The prototypes are locked, so part C lists each changed screen beside its old self.
- Edges and selected states are visibly stronger than before in the built-in themes, since they now reach 3:1.
- The library depends on both the DOM's and React Native's packages, with React Native's as optional peers. Each app installs only its own.
- ADR 0008 and ADR 0059 get dated sections for the joined library.

## 2026-11-02: the TV's own parts, and Chip's end icon (apps-catch-up.md › part B)

The TV's page parts (the head, the page that scrolls by focus, the rows, a title's page and the side dialog; [ADR 0059's 2026-11-02 section](0059-native-apps.md)) are in the library as the React Native renderer's `tv` subpath, listed in `parity.ts` as native-only with their reasons. They draw their controls with the library's `Button` and `Chip`, at the TV rule's sizes, so the control spec still holds on the TV. `Chip` gains `iconEnd` on both renderers, for a choice that opens a menu (the TV library's Genre). It's drawn after the label, at the chip's icon size.

## 2026-11-02: the phone's page parts (apps-catch-up.md › part C)

The phone's page parts join the React Native renderer as the TV's did: `NamedAction` (a round icon named under it, a toggle with `pressed`), `PersonTile` (a round portrait, the name and the role), `FactsCard` (a title's facts under a heading) and `LetterIndex` (the A–Z index down a list sorted by name, as iOS's section index, VoiceOver reading it as an adjustable control). They take data and callbacks only, so any touch app (CarPlay's and the Watch's included, when they come) can use them. They are native-only in `parity.ts`, with their reasons: the web draws these pages with its own layouts. `Poster` gains `longPressLabel`, `longPressMs` and `progressBelow`, for Continue watching's menu and its bar under the art. `scripts/bundles.ts` checks the TV's bundle as it does the phone's.

At part C's review the owner found the phone still drawn as an iOS grouped list where the prototype draws the web's controls, so the native renderer caught up with the web's in these, each by the same name and props:

- **`Switch` is drawn, not iOS's UISwitch:** the web's round 40 × 24 track in `control-edge`, `accent-fill` when on, with an 18 thumb 3 in, before its words, as the prototype's `Field inline` puts it. The TV draws the same at its rule's size. `SwitchRow` stays as its old name.
- **`SortableList`, `Lockup` and `Rating` join `BOTH`** in `parity.ts`. The native `SortableList` is built on React Native's own PanResponder and Animated (no gesture library, so the TV's bundle can carry it), with a drag handle that VoiceOver moves by Move up and Move down. `Lockup` is the mark and wordmark, as on the web. `Rating` draws five stars, cut to the value.
- **`QualityTag`** is the web's pill (mono, uppercase, a `line-strong` edge, or glass over art); `Mark` takes `paint: 'mono'` for a nearby server, as the web's does; `Icon` takes `filled`.

Settings' rows and Choose a server are drawn as the prototype draws them, as separate cards on `s1` with their controls first, inside the kit's `Flow` card for C1's steps.

## 2026-11-03: one drawing replaces the two renderers (one client platform, part A)

The control spec, the platform rules and the theme audit stand. What changes is how they're drawn: [ADR 0061](0061-one-client-platform.md) makes the React Native renderer, `src/native`, the one drawing of each component for every client, on the web through react-native-web. This supersedes "one package, two renderers". Design system 1.1's review folds into part A's (the plan's answer 7), so this ADR stays Proposed with it.

- **`src/web` stays only for the admin**, `apps/web` and the prototypes' screens that haven't moved, and goes in part D, when the admin draws with the library through react-native-web. It lost the exports nothing drew. Its spatial focus moved to `src/native/tv/spatial/`, the web's TV focus engine behind `Focusable` (`@highsea-tv/ui/focus` points there now).
- **What react-native-web leaves to the page, the native renderer does once:** the focus ring at `:focus-visible` and Space on checkboxes, radios, switches, tabs, options and the menu's checkable items (`dom.web.ts`), hover from `Pressable`, touch's hit area drawn as a layer where react-native-web drops `hitSlop`, and the web's scrollbar drawn over a `ScrollView` (`scrollbar.web.tsx`, in `PageScrollbar`'s measures from `src/shared/scrollbar.ts`). `Text` takes each input's own type scale, a pointer's from the web's.
- **The form factor replaces the platform.** ThemeProvider resolves the form-factor rule's input and width class once (`input.ts` decides the device's input), and controls read it through `useControl` and screens through `useFormFactor`. On touch on the web, the control spec's `(pointer: coarse)` is how the rule finds a phone's browser.
- **`parity.ts` is now the list of exceptions.** `BOTH` names each component drawn twice with its reason: the web renderer's copy kept until part D, or a platform pair such as `Scrollbar` and the TV's `FocusGuide`. `WEB_ONLY` and `NATIVE_ONLY` give the reason each side has something the other doesn't. `test/parity.test.ts` and `scripts/one-place.ts` hold the lists to what's drawn, and fail when a list drifts.
- **About 50 literals in the native renderer moved onto existing tokens.** The ones left wait for values the owner approves, and are listed in `scripts/one-place-exceptions.json`.

The bundle check's rule from this ADR stands, with the client's three bundles added: the web export carries no React Native of its own and none of `src/web`, and the iPhone's and the Apple TV's carry no `.web` file of the library's.

## 2026-11-03: the films' parts, merged by form factor (one client platform, part B1)

B1 merged the films' parts that existed per platform into one component each, laid out by the form factor:
- the rows: `Row`, `FilmRow`, `SectionHeading` and `RowSkeleton`, with the pointer's row on `CarouselRow`'s keys over a ScrollView;
- the page parts: `NamedAction`, `PersonTile`, `FactsCard` and `LetterIndex`;
- `Poster`, with its title size, actions, mosaic and skeleton.

The TV's names stay as aliases (`src/native/tv/aliases.ts`) until B2.

**New parts:** `FeaturedCard` (with tags), `Pager`, `InlineText`, `NoticeCard`, `TvAcknowledge`, `TvRadioGroup`, `Menu` (closing says how, and holds the focus's return), `Popover` (align, padded), `Skeleton`, `Certification`, `PersonPortrait`, `TitleBackdrop`, `Bloom` and `FocusGuide` (the TV), `HiddenHeading`, the TV's `Toast` with inline runs in one status region, and the library's own words (`uiMessages`, so `@highsea-tv/ui` now depends on `@highsea-tv/i18n`).

**New props:**
- `Button`: `hasPopup`, `expanded`, a ref, and its pressed state as `accessibilityState`.
- `Chip`: `hasPopup`, `current` and the radio rule.
- `Sheet`: `footer` and `onDismiss`.
- `Dialog`: `size`; the pointer's is capped at 560.
- `Text`: `leading`.
- `Row`: `itemGap` and `titleHidden`.

**Changes in meaning:**
- The TV's `Badge`, `QualityTag` and `Rating` were drawn far too large and now take the TV's units.
- Hover scales are 1.08 on a card, 1.1 on a small one, and 1.02 on a poster.
- react-native-web drops `experimental_backgroundImage`, so gradients use `backgroundImage` there ([react-native-web's styles](https://necolas.github.io/react-native-web/docs/styling/)).

**Not tokens yet:** the values B1 drew without tokens wait for part E and the owner's approval. They are the home and Alerts sizes in `apps/client/src/home/sizes.ts` and `src/alerts/sizes.ts`, the phone's 17 section heading, and the 15 / 1.45 biography.

**Found by B1's compare sheet and fixed in the library:**
- Text on the web is antialiased (`smoothing()` in `src/native/fonts.ts`, through react-native-web's `WebkitFontSmoothing` and `MozOsxFontSmoothing`), as the prototypes' `html` is; a label on an accent or danger fill keeps `auto`, as the web renderer's buttons do. The devices don't change.
- Text fields draw no browser outline on the web: react-native-web's TextInput resets the border but not the outline, and an `auto` outline ignores a width, so only `outline-style: none` removes it ([CSS UI 4 § outline-style](https://www.w3.org/TR/css-ui-4/#outline-style)). The field's own edge shows focus.
- `Rating`'s stars sit in boxes of their own size, since an `<svg>` shrinks in a CSS flex row where a View doesn't ([flexShrink](https://reactnative.dev/docs/layout-props#flexshrink)).
- `TvTile` takes `artwork` and `status`, so the TV's collection tiles draw Poster's mosaic and the Smart mark.
- `UNCHOSEN_ALPHA` (0.65, in `src/native/alpha.ts`) dims what isn't chosen in the TV head and the client's top bar, as the prototypes' `text-text/65`.

**After B1's review (2026-11-03):**
- `FactsCard`'s labels take the widest label's width as a minimum and don't shrink, rather than a fixed width. React Native Web's `onLayout` reports `offsetWidth`, which is rounded to a whole pixel (its UIManager's `getRect`), so a fixed width could fall a fraction short and wrap the widest label ("Directed by" at 390).
- `FactsCard` takes `says`, the words its children draw. On the TV they're read with the title as the card's one stop, because a focusable view on tvOS is one accessibility element that VoiceOver reads by its label ([`accessible`](https://reactnative.dev/docs/accessibility#accessible)). The About card's synopsis was drawn but wasn't read.

## 2026-11-04: what B2 added to the library (one client platform, part B2)

B2 added no new parts; the player's round controls, scrubber, cue line and Next up card are the player's own (`apps/client/src/player/parts.tsx`), as [controls.md](../design-language/controls.md) lets the media players keep their shape. It added:

- `MenuOption.detail`, a caption line under an option's label (Restart to update);
- `ProgressBar`'s `tone` (`accent` or `neutral`) and `showValue`, as the web renderer's Progress has them;
- the `folder` and `copy` icons, matching ui-web's.

The TV's old names (`src/native/tv/aliases.ts`) and `ThemeProvider`'s `platform` prop, kept for `apps/tv` and `apps/mobile`, went with those apps.

**Not tokens yet,** excepted in `scripts/one-place-exceptions.json` until part E and the owner's approval: the player's 163 measures (its 44 to 80 circles, the scrims, the scrubber, the TV's units, the `::cue` colours), and the desktop window's system measures (Windows' 46 buttons and Close red, macOS's three colours, the glyphs), which stand in for the operating systems' own chrome.

## 2026-11-04: what B3 added to the library (one client platform, part B3)

Shows, music and profiles needed these parts, each drawn once in the native renderer and listed in `src/shared/parity.ts` with why the web renderer has none:

- **New:** `EpisodeRow` (a season's episode by touch and with a pointer; the TV lists stills in a `Row`), `Waveform` and `PlayingBars` (the music player's scrubber as the song's loudness, and the playing mark), and `Slider` (0 to 1 by press, drag, the arrow keys and VoiceOver's adjust, as [React Native's accessibility actions](https://reactnative.dev/docs/accessibility#accessibility-actions) document `increment` and `decrement`), for the music player's volume.
- **Changed:** `Avatar` takes a profile's `tone` (one of the tokens' soft pairs, the contract's `PROFILE_TONES`) and a `ring` for the one watching now; `Poster` and the TV's tiles take `square` (music's covers) and `round` (an artist, words centred); `SortableList` takes `look: 'line'`, rows touching over a hairline, for a playlist; the TV's head takes `avatarTone`; and the icons gain `users`, `series`, `music` and `edit`.
- **`Certification` has no accessibility label of its own.** On iOS an `accessible` view with a label is one element whose words replace its text's, so VoiceOver and the web's tree read it differently (React Native's [`accessible`](https://reactnative.dev/docs/accessibility#accessible) groups its children into one element). Its words are its text now, as `QualityTag`'s are.
- **The web focus engine refocuses the first preferred stop that takes focus.** A navigator keeps the screen beneath in the document, inert and undisplayed, and an inert or undisplayed element isn't a focusable area ([HTML › The `inert` attribute](https://html.spec.whatwg.org/multipage/interaction.html#the-inert-attribute), [focusable area](https://html.spec.whatwg.org/multipage/interaction.html#focusable-area)), so the first `[data-initial]` in the document took nothing when the TV's announcement closed. `refocusIfGone` now tries each in order until one takes it, with a test.
- **Sheets and dialogs give way to a link on iOS (`yieldToLink`).** React Native's Modal is a view controller react-native-screens doesn't own, and a screen it presents while such a Modal is still going away isn't shown (react-native-screens' `RNSScreenStack.mm` says so of "other (not managed by us) modal controllers"; [software-mansion/react-native-screens#2048](https://github.com/software-mansion/react-native-screens/issues/2048)). `Sheet` and `Dialog` register while they're up. `yieldToLink()` closes them and resolves once each Modal's [`onDismiss`](https://reactnative.dev/docs/modal#ondismiss-ios) has come, or after a second. `apps/client` calls it from its [`+native-intent.ts`](https://docs.expo.dev/router/advanced/native-intent/)'s `redirectSystemPath`, which expo-router awaits before it follows a link.
- **On the web, a `Sheet` starts below the top inset.** react-native-web's Modal ignores `presentationStyle` and fills the window, so the sheet keeps iOS's page sheet's gap at the top over the page's background.

## 2026-11-04: the admin's parts in the native renderer (one client platform, part D1)

D1 draws the admin's shell and System › Status with the native renderer ([ADR 0061](0061-one-client-platform.md)'s section of today), so its parts are library components there, in `src/native/admin.tsx`: `Sidebar`, `NavGroups` (the hairline between groups, which the web renderer's `NavGroup` draws with a sibling selector React Native doesn't have), `NavItem`, `ServerCard`, `SearchTrigger` with `Kbd` and `useModKey`, `PageHeader`, `StatusBar` and `StatusItem` (with `hideBelow`, read through `useWindowAtLeast`), `Panel`, `Stat`, `TextLink`, `Details`, `Figure` and `Attribution`. `parity.ts` lists each, and says the web renderer's copies stay only for the prototype's screens that haven't moved, until D3 removes `src/web`. Alongside them:

- `ProgressBar` takes `look: 'panel'` (5 tall on `s3`, the web renderer's `sm`) and the status tones `success`, `warning` and `danger`.
- The icon glyphs moved to `src/shared/glyphs.ts`, generated by `scripts/icons.ts`, so both renderers draw the same paths from one place.
- Icons and the Mark on the web take their name through `svgName`: react-native-svg's web build passes React Native's `accessible` and `accessibilityLabel` to the DOM, where they mean nothing (React warns), so on the web an icon with a label is `role="img"` with `aria-label` and one without is `aria-hidden`, as ARIA has it ([WAI-ARIA 1.2 › `img`](https://www.w3.org/TR/wai-aria-1.2/#img), [`aria-hidden`](https://www.w3.org/TR/wai-aria-1.2/#aria-hidden)). This also fixes the client's web export, which had the same warnings.
- `@highsea-tv/ui/next` holds the shims a Next.js or Vite host aliases (`react-native`, `codegenNativeComponent`, the asset registry) and the sheet's server text ([ADR 0003](0003-server-runtime-custom-entry.md)'s section of today); `@highsea-tv/ui/testing/react-native-web` lets a DOM test draw with the native renderer.

## 2026-11-05: what D2 added to the library (one client platform, part D2)

D2's screens ([ADR 0061](0061-one-client-platform.md)'s section of today) brought these into the native renderer, each listed in `parity.ts`:

- **New:** `Table` and its parts (`TableFrame`, `TableToolbar`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `RowActions`), `WidgetFrame`, `WidgetGrid`, `Sparkline`, `ConfirmDialog`, `Tooltip`, `Toaster`, `TitleLink` and `TitleButton`, and `useClip` and `useWidth` in `measure.ts`.
- **Pairs of platform files:** `WidgetEditor` (dnd-kit's drag, keyboard and resize on the web, the grid alone elsewhere, [dnd-kit › Keyboard sensor](https://docs.dndkit.com/api-documentation/sensors/keyboard)), `PageFrame` (an inert, scaled iframe on the web, for Curation's preview) and `DateTimeInput` (the browser's `datetime-local` on the web, [MDN › `<input type="datetime-local">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local)).
- **Changed:** `Select` on a pointer hangs a list from the field, as the web renderer's Radix Select and a desktop browser's `<select>` do: the pointer `Menu`, at least the field's width, under group headings, in mono where asked (WAI-ARIA's [menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)). `Menu` items take `group`, `checked`, `keepsOpen`, `mono` and `danger`. `Field`'s Input takes `end`, a unit inside the field. `Sheet` takes `side`, `width`, `description` and `hideTitle` for the pointer's side sheets, and Dialog a description. `Button`, `ControlPress`, `Poster`, `Row` (`titleHref`) and `SectionHeading` take `href`, which react-native-web draws as a link ([react-native-web › Accessibility](https://necolas.github.io/react-native-web/docs/accessibility/)). `EmptyState` takes `size: 'sm'`, `SegmentedControl` options a `count`, `Banner` a `tone`, a `variant` and `onAcknowledge`, and `SortableList` picks a row up from the keyboard on the web.
- **Found by the sweeps, and changed for every client:**
  - The library's one `Image` (`image.tsx`), expo-image's, decorative unless labelled. expo-image's web writes `alt` from `accessibilityLabel` only, so an unlabelled image is `<img alt="">` ([WAI › Decorative images](https://www.w3.org/WAI/tutorials/images/decorative/)). Every part and the admin draw through it.
  - `ControlPress` writes `aria-selected` only on the roles that take it ([WAI-ARIA 1.2 › aria-selected](https://www.w3.org/TR/wai-aria-1.2/#aria-selected)); a radio says it with `aria-checked`.
  - A bordered `Button` is the spec's height, as one without a border is: its 1pt edge comes out of the padding, so it's 36 rather than 38 at the pointer's size. This is visible in the clients too.
  - A field box drawn around its input (`Input` with `end`, `SearchField`) is marked as one control for the sweeps' row check (`dataSet`, written as `data-control`).
  - A labelled View is a `group` (the non-pressable `Poster`, `FactsCard`'s linked card, `SortableList`, `Tooltip`'s focusable trigger). ARIA forbids naming an element with no role, and `group` is React Native's role too ([React Native › View › role](https://reactnative.dev/docs/view#role)).
  - A pointer's `Menu` and `Popover` are never taller than the room the window has: on the side of the trigger with more room when they don't fit, their items scrolling, as Radix's content is held to its available height ([Radix › Dropdown Menu › Constrain the content size](https://www.radix-ui.com/primitives/docs/components/dropdown-menu#constrain-the-contentsub-content-size)).
  - `Tabs` and `SegmentedControl` scroll sideways on the web when there are too many to fit, with the scrollbar hidden, as the web renderer's did.
  - `Toaster` and `Sheet` give `useSyncExternalStore` a server snapshot that's always the same value ([React › useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering)).
- **Measures without tokens** (the borders, the table's head height, the editor's handles) are counted in `scripts/one-place-exceptions.json` until part E gives them tokens, which need the owner's approval.

## 2026-11-05: the web renderer removed, and what D3 added (one client platform, part D3)

With the admin's last screens on the native renderer ([ADR 0061](0061-one-client-platform.md)'s section of today), nothing imports the web renderer, so it's gone: `packages/ui/src/web`, its `styles.css`, the `./web` and `./styles.css` exports, and the dependencies only it used (Radix, cmdk, motion, lucide-react, clsx, tailwind-merge, and Tailwind as a peer). The root export is the native renderer on every target, without the `react-native` condition. `parity.ts` no longer lists two drawings per component: it lists only the pairs of platform files (`name.web.tsx` beside `name.tsx`), eight of them, each with its reason, and `one-place` and `test/parity.test.ts` hold the pairs to it.

D3's screens brought these into the library:

- **New:** `CommandPalette`, with `useCommandPaletteShortcut` (⌘K or Ctrl K) and `rankCommands`: a field that's a combobox over a listbox, its groups and options, ↑ and ↓ looping, Home, End and Enter, as WAI-ARIA's [combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) has it. The ranking is cmdk's (its command-score, ported with its MIT notice in `command-score.ts`), so the admin's palette finds the same commands in the same order. `Stepper`: "Step x of y" over a progress bar when compact, a list with `aria-current="step"` from the expanded width ([WAI-ARIA 1.2 › aria-current](https://www.w3.org/TR/wai-aria-1.2/#aria-current)). `GetTheApps` and `GetTheAppsDialog`, which the client and the admin's Status both draw.
- **Pairs of platform files:** `ColorWell` (the browser's `<input type="color">` in the field's look on the web, [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/color); the colour named elsewhere) and `createSoundPlayer` (the sound pack through Web Audio on the web, [MDN › Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API); silent elsewhere until the apps' sounds come).
- **Changed:** `Button` and `ControlPress` take `follow: 'download' | 'external'`, written as the link's `download` or `target` and `rel` through react-native-web's `hrefAttrs`; `TextLink`'s `href` is optional, a button without it; `DateTimeInput` takes `mode: 'time'`; `Sheet` takes `padding` for a pointer's side sheet; `Input` takes a leading `icon`; and a `Dialog`'s body scrolls between its title and its footer when it's taller than the window, as Radix's dialog content did.
- **Measures without tokens** in the palette and the Stepper (the palette's card and rows, the Stepper's discs) are counted in `scripts/one-place-exceptions.json` until part E, as D2's are.

The Next.js hosts' wiring moved into the library too (`@highsea-tv/ui/next/webpack` and `/next/style-registry`, ADR 0003's section of today), since the server and the guides both draw it.

## 2026-11-06: `Virtual`, the library's one virtualizer (part D3)

The library gains `Virtual` and `useScrollSource` (`src/native/virtual.tsx`), on TanStack Virtual's core, and every library `ScrollView` reports itself as a scroll source to what it holds. `TableBody` virtualizes past 60 rows inside one, and the phone's `Row` is virtual; ADR 0061's section of today has the decision and the docs it rests on. One drawing still serves every target: the spacers are plain aria-hidden views, and a table's are rows in CSS table layout.

## 2026-11-10: every value on the tokens, and one width rule (one client platform, part E1)

The owner approved E1's value table on 2026-11-10 ([one-client-platform-e.md](../plans/one-client-platform-e.md)), and the library, the admin, the client and the guides now draw every colour, size and corner from `@highsea-tv/tokens`:

- **Added to the tokens:** `space` 1.5 and 2.5; `radius` `3xs`, `2xs` and `xs` below the locked radii ([direction.md › Shape](../brand/direction.md#shape)); `line` (thin 1, thick 2); `art` (black under scrims and video, its alpha steps, the glass as `bg` at 0.62, the hairline inside artwork as `text` at 0.04, the backdrop's scale); `icon.size` `2xs` and `xs`, `icon.disc` and the icon drops; the TV's `tv.space`, `tv.radius` `sm`, `md` and `panel`, `tv.head` and `tv.screenHeight`; `scrollbar` (approved with 4.4a, until now a constant in the library); `hover` (the poster's and the photo's lift and the fills' brightness, until now constants); `tracking.tag`, `mobileText.headline` and `subheadline` (iOS's styles of the same names, [HIG › Typography](https://developer.apple.com/design/human-interface-guidelines/typography)) and `tvText.title`; and each component's own measures in `controls.ts`, with the admin's in a group of its own.
- **Removed:** `breakpoints` (600, 1024, 1440) and `density.sidebarRail`. Every client and the admin lay out by the form-factor rule's one split, compact below 768 and regular from it (the owner's answer of 2026-11-10); the library's `useRegularWindow` is the admin's reading of it, and the Tailwind theme writes only `--breakpoint-regular`.
- **In the library:** `glassOf`, `artEdgeOf` and `scrimOf` draw the `art` tokens in a theme's colours; one `visuallyHidden` style replaces six copies; `Icon`, `Mark` and `QrCode` name themselves in ARIA's terms on the web (react-native-svg hands React Native's accessibility props to the `<svg>` as they are); a Figure's title is written as the web's `title` attribute; the player's forward button draws Lucide's `rotate-cw` (`forward`) instead of a mirrored `replay`; and `TableCell`'s `span` lays its content across the table on the web, where CSS gives a table cell no span of its own ([CSS 2.2 › Tables](https://www.w3.org/TR/CSS22/tables.html#table-display)), with `aria-colspan` ([WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/#aria-colspan)).
- **The check:** `bun run one-place` reads the admin (`packages/admin/src`) and the guides' components (`apps/docs/components`) for values, and `scripts/one-place-exceptions.json` keeps only the 18 values with lasting reasons (the desktop window's operating-system chrome, `alpha()`'s `hsl()` patterns and the visually hidden technique's box). An exception whose `until` names a part fails.
