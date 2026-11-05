# Design system 1.1: one set of controls, everywhere

## Read first

1. [docs/design-language/README.md](../design-language/README.md), [principles.md](../design-language/principles.md), and every platform guide in [platforms/](../design-language/platforms/): admin, desktop and web, mobile, TV.
2. [spacing-layout.md](../design-language/spacing-layout.md) § Radii, [color.md](../design-language/color.md) and [accessibility.md](../design-language/accessibility.md): the locked shapes and the contrast policy that themes are audited against.
3. `packages/tokens/src/`: `scales.ts` (`control`, `controlSm`, `input`, `targets`, `tv`), `native.ts`, `themes.ts` (`ThemeSpec`) and `theme.ts` (`resolveTheme` and the contrast audit). ADR 0028 (themes) and ADR 0059 (ui-native).
4. The components: `packages/ui-web/src/components/` (`button`, `field`, `select`, `segmented`, `tabs`), `packages/ui-native/src/` (`button`, `field`, `segmented`) and `packages/ui-native/src/tv/` (`controls`, `focusable`).
5. [prototype-gaps.md](prototype-gaps.md): stage 6's three wishes for the design system, and stages 7 and 8.

## Goal

highsea has one design system and one shared component library, and every app uses them: the admin, the web client, the desktop app, the phone, the TV and the guides at `docs.highsea.tv`, in every theme. The apps differ in layout and size because their screens and inputs differ, and the library adapts to the app it's in. They never differ because a screen or an app drew a control of its own.

- A control is specified once, in the tokens.
- Each platform gets its values from that spec by a documented rule (a pointer, touch or the TV's units), never from numbers of its own.
- Each component is written once: one name, one set of props, variants and states. It is drawn for the web or for React Native, at the platform's size, and in the active theme.
- A theme can't break it.
- Checks in CI fail when an app, a component or a theme strays.

### Adaptive, not identical

What may differ between apps, and what may not:

| May differ, by the platform's rule | May not differ |
| --- | --- |
| Layout: columns, navigation, where a control sits | Which component draws a control |
| A control's height, padding and text size: pointer, touch or the TV | The component's name, props, variants and states |
| Input: hover, touch targets, the TV's focus and its scale | The colour roles each state uses, and so how it follows a theme |
| Density: the small size where a platform has dense views | Within one app, the sizes of controls in one row, and the shape of each kind of control |

The measurements below are read against the right-hand column. A TV button that is larger than a web button is correct. A TV Play button that is larger than the buttons beside it is not, and neither is a chip with two designs.

## Out of scope

- New colours or themes. Themes stay colour-only (ADR 0028); this adds checks to the audit and may add derived roles, not new choices for a theme's author.
- The dashboard customization follow-up.

## Where things stand

Measured in the prototypes on 2026-11-01 (every interactive control with a box, in the pages listed in `routes.tsx`), and read from the components:

| App | Pages | Control heights (px) | Corners | Text sizes | Pages with mixed heights in one row |
| --- | --- | --- | --- | --- | --- |
| Admin (prototype; `apps/server` matches it) | 38 | 22, 24, 28, 30, 32, 34, 36, 38, 40 | 5, 8, pill | 12, 13, 14 | 15 |
| Web and desktop (prototype at 1440 × 900, 768 and 390, the announcement dismissed; `apps/web` matches it) | 51 | 24, 30, 32, 34, 36, 38, 40, 44, 48, 56, 68 | 0, 8, 10, 12, pill | 13, 14, 15, 16, 20 | 0 in height; 7 rows mix shape or text (below) |
| Phone (prototype at 390 × 844, the announcement dismissed) | 16 | 24, 30, 36, 38, 40, 44, 48, 72 | 8, pill | 13, 14, 15, 16 | 1 (Library › Music: View at 38 beside Sort and filter at 30) |
| Phone (`apps/mobile`) | | ui-native's `Button` and `Field` at 44; its own `kit.tsx` and screens set the rest by hand (chips 36, Back 40, rows 52 and 56) | 8, 10, 18, 20, 28, pill | 16, 20 | |
| TV (prototype at 1600 × 900, the announcement dismissed) | 35 | 13, 37, 42, 46, 48, 52, 58, 70, 80 | 0, 6, 8, 22, pill | 15.2, 16, 17.6, 24 | 3 (a film or show's Play at 52 beside 46 round buttons) |
| TV (`apps/tv`, ui-native's `tv/`) | | `2.2u` and `3u`, written in the components | `1.1u`, `0.4u` | | |
| Guides (`apps/docs`) | | Fumadocs' own controls | Fumadocs' | Fumadocs' | |

In the owner's screenshot of Movies (2026-11-01), five controls in two rows come in five heights: Grid and Table (`SegmentedControl` `sm`) at 32 with 24 inside, the status tabs (`Tabs` `segmented`) at 34 with 28 inside, Save as smart collection (`Button` `sm`) at 30, Add movie (`Button`) at 36, and Filter and Sort (`Input`, `Select`) at 38.

### The phone, measured properly

The phone prototype was measured again at an iPhone's size (390 × 844), with the announcement dismissed as the sweeps do (`acknowledge` in `scripts/sweeps/lib.ts`). The first pass had measured it filling a 1,700px window, with the dialog over every screen.

- **Every target reaches 44pt,** through invisible hit areas (an `::after` 44 tall, from stage 4). What's drawn varies:
  - **a page's main action:** Resume and Play on a film or episode at 48, Play and Shuffle on an album at 36, on a playlist at 44;
  - **secondary actions:** at the admin's small size, 30px with 13px text (Sort and filter, Pause, Cancel, Try again, Download season, Mark season as unwatched). Download is 44 on an album but 30 for a season;
  - **fields:** 38px with 14px text (Search, the server's address), beside a 36px Connect;
  - **choices:** 36px pills (the library's kinds, genres, seasons), 40px round Back buttons, a 36px avatar.
- **Library › Music stacks three selector designs:** pill chips for the library's kinds, an 8px segmented control for Albums to Playlists, and a 30px outlined button for Sort and filter.
- **The app copies the prototype by hand, not from the system.** `apps/mobile/src/kit.tsx` has its own `Chip` (36, pill), `Back` and `Row` (52), and its screens set heights and corners in numbers (Back 40 with a 20 corner, the code's boxes at 56 with a 28 corner, a field with an 18 corner) and raw colours. ui-native's `Button` and `Field` are at 44, so the app's own controls and the library's disagree on the same screen.

### Web and TV, measured properly

Measured again the way the page sweep loads them (`screenUrl`, `settle`, `acknowledge`, the sweep's widths and heights), with layout sizes, so the TV's focus zoom doesn't count. The first pass had measured too few pages, in a window of the wrong size.

- **Web (51 pages; 768 is the same as 1440):**
  - **a page's actions mix two shapes:** Resume, Play and More info are 36 with an 8px corner, and beside them Trailer, Audio and subtitles and Mark as watched are 36 pills. On an album, Play and Shuffle are rectangles beside a round More with 16px text. This happens on every film, show and album page (7 rows);
  - **fields and selects are 38** (the server's address, Show, Genre, Sort, Search), buttons 36, so a field and its button never line up exactly;
  - **choices come in four looks:** Search's chips are 38 pills with 15px text, the View tabs a 34 segmented control, a show's seasons a 40 line of tabs with no corner, and the nav's links (at 390) 32 pills;
  - **Settings' row actions** (Sign out, Change password, Try again) are the admin's small 30; its links are 44 and 68 rows with a 12 corner;
  - **text in controls** is 13, 14, 15, 16 or 20, with no rule for which.
- **TV (35 pages at 1600):**
  - **the main action is larger than its row:** Resume or Play is 52 with an 8px corner, beside round buttons at 46 (a film, a show, Saltmarsh);
  - **two chip designs:** genres are 52 with an 8px corner, while seasons, A to Z and the music library's filters are 37 pills, often on the same screen;
  - **the on-screen keyboard's keys** are 48 and 58 with a 6px corner, the Colour choice 42 with no corner, Now playing 42 and Pause 80 pills;
  - **text in controls** is 15.2, 16, 17.6 or 24, and a person's page puts 24 beside 17.6 in one row.
- **On every platform, round icon buttons sit beside rectangular buttons** (web, phone and TV). Question 3 settles which shape an icon button takes.
- **Height alone isn't the check.** Web has no row of mixed heights, but seven rows of mixed shapes and text. The sweeps' row check (part B) compares height, corner and text size.

### Components kept outside the design system

Every app keeps a kit of its own controls that the design system doesn't have:
- **the phone:** `apps/mobile/src/kit.tsx` (`Chip`, `Back`, `Row`, `Group`);
- **the TV:** `apps/tv/src/kit.tsx` (`GlobalNav`, `AnnouncementPill`, `LibraryHeader`);
- **the prototypes:** `tv/kit.tsx` (`TvButton`, `TvRow`), `web/detail.tsx` (`RoundButton`), `web/music-lists.tsx` (`SongButton`), `mobile/song-menu.tsx` (`MoreButton`), and rows per app (`WebFilmRow`, `MobileRow`, `TvFilmRow`).

Each one draws its own sizes, so the same control looks different from app to app, and fixing the design system can't reach them. Part B moves every one of these into ui-web or ui-native, or onto their components, and the source test keeps app-level controls out.

### Why

- **There's no one spec for a control.** Each platform defines its own sizes:
  - ui-web has `--size-control` (36), `--size-control-sm` (30) and `--size-input` (38), which can never line up;
  - ui-native sizes buttons and fields from `targets.touch` and `Segmented` from `touch - 6`;
  - the TV's controls write their sizes inside `tv/controls.tsx`;
  - the guides use none of them.
- **The rules disagree.**
  - admin.md locks buttons at 36 and inputs at 38;
  - spacing-layout.md gives buttons and inputs `radius-sm` but segmented controls a pill;
  - ui-native gives `Segmented` 10px.
- **Two libraries, kept in step by hand.** ui-web and ui-native each define their components and props, so a change to one doesn't reach the other. The apps' own kits (below) fill the gaps between them.
- **One idea is drawn twice.** `SegmentedControl` and `Tabs`' `segmented` variant look different and use no size token. ui-native's `Segmented` is a third look.
- **The phone's reference isn't the phone.** The phone prototype draws ui-web at pointer sizes with hit areas around them, while `apps/mobile` draws ui-native's controls at 44. The two don't show the same thing.
- **No rule says controls in a row share a size.**
- **Screens hand-roll controls.** Raw height classes (`h-7` to `h-11`) appear on controls in the prototypes (51), `apps/server` (20) and `apps/web` (12).
- **Nothing checks any of this.** The sweeps measure overflow, axe, text size and the keyboard. They don't check sizes, and no test checks that ui-web and ui-native match.

### Theming

A theme sets colours only (`ThemeSpec`: the themeable roles, the badge mix, the focus ring's scale), and the audit in `theme.ts` checks text and fills. Nothing checks a control's edge or its selected state:

| Theme | An input's edge (`line-strong` on `s1`) | Selected segment (`s4` on `s2`) |
| --- | --- | --- |
| Abyss Neutral | 1.44:1 | 1.21:1 |
| OLED | 1.39:1 | 1.14:1 |
| High contrast | 2.68:1 | 1.21:1 |

WCAG 2.2's 1.4.11 (Non-text Contrast) asks for 3:1 on what identifies a control and its state. Every built-in theme falls short, and a custom theme could go lower without the audit noticing. Controls also use raw colours that no theme reaches: 6 in ui-web, 8 in ui-native, and more in the apps (13 in `apps/server`, 11 in `apps/web`, 20 in `apps/mobile`, 9 in `apps/tv`, 84 in the prototypes). Some are scrims over artwork, which is correct; the rest move to roles.

## The parts

Three gated parts, each reviewed by the owner.

### Part A: the one spec (design system 1.1)

1. **The control spec in the tokens** (`packages/tokens/src/controls.ts`, new, exported to CSS, Tailwind and `native.ts`). It's one table:
   - **sizes**, each with a height, inner padding, gap, text size, icon size and corner;
   - **states**, each named by colour roles: rest, hover, pressed, focused, selected, disabled and invalid;
   - **the controls it covers:** button, icon button, text field, select, segmented, tabs, search field, checkbox, radio and switch.
2. **One rule per platform.** Each platform's values come from the spec by a rule, written in the design language and in code, never as numbers of its own:
   - **pointer** (the admin, the web client and the desktop app with a mouse);
   - **touch** (the phone, and the web client on a coarse pointer): the same drawn sizes as a pointer, with 16px text. An invisible hit area around each control reaches 44 (`targets.touch`) without changing its size or the layout. In React Native this is `Pressable`'s `hitSlop`; on the web it's the `::after` box from stage 4, moved into the components under `@media (pointer: coarse)`. Controls in a row keep at least an 8px gap, so 36px controls' 44px hit areas never overlap;
   - **TV:** the spec in screen units, with the TV's focus scale.
   - `--size-input` goes, and the TV's numbers move out of `tv/controls.tsx` into the tokens.
   - ui-native's `Button` and `Field` come down from 44 to the spec's sizes, with the hit area making up the difference.
3. **The design language.** One "Controls" page, `docs/design-language/controls.md`, with:
   - the spec;
   - the platform rules;
   - **controls in one row share one size;**
   - **one shape:** `radius-sm` for every control on every platform, icon buttons, segmented controls and tabs included. Pills are kept for badges, chips (at the control's height) and the TV's announcement pill. The media players' own controls (play and pause, skip, the scrubber's buttons, volume) may stay round, since they sit over the picture rather than in a row of controls;
   - one segmented look;
   - which shape is a control's and which is a badge's or a chip's.
   The platform guides link to it instead of keeping their own control sizes. spacing-layout.md's radius table and accessibility.md (non-text contrast) change to match.
4. **Theming** (`theme.ts`, `roles.ts`, ADR 0028's dated section):
   - the audit gains checks for a control's edge, its selected state and its focus ring, against every surface a control sits on, for every built-in theme and any custom one;
   - where today's roles can't pass, a derived role (for example `control-edge`, derived as `badge-*` is) keeps theme authors' choices as they are;
   - the native theme (`ui-native`'s `theme.tsx`) reads the same resolved theme.

### Part B: the components

1. **One library, adaptive to the app it's in** (question 8). Each component is one folder with:
   - one props type, its variants and states, and the size it takes from the spec;
   - a web renderer (DOM and Tailwind) and a React Native renderer.
   The package's `exports` pick the renderer with the `react-native` condition, which Metro asserts by default since 0.82 (React Native 0.79; [Metro, Package Exports](https://metrobundler.dev/docs/package-exports)). Vite and Next take `default`. This follows React Native's documented way of sharing code with the web ([Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code), native-specific extensions). An app imports `Button` from one place, whatever it is. The platform rule comes from the app:
   - on the web, from the tokens' CSS (`@media (pointer: coarse)`) and the app's density;
   - in React Native, from `Platform.isTV`, or the touch rule's text size and `hitSlop` otherwise.
   Screens never pass a size of their own.
   The web renderer also takes the platform from a provider, so a frame can set it whatever the pointer. The prototypes' phone and TV frames set touch and TV, which lets them draw the library's real components at the phone's and the TV's rules.
2. **The controls first:** `Button` (icon buttons included), the text field, `Select`, `Textarea`, the segmented control, `Tabs`, the search field, `Checkbox`, `Radio`, `Switch` and the chip. The two segmented looks and the TV's two chip designs each become one. ui-native's TV controls in `tv/` become the TV rule of the same components, not components of their own.
3. **What can't be shared stays a renderer, not a component.** Focus on the TV, haptics and the sheet are drawn per platform inside the component, behind the same props. A test checks that every component has both renderers, or a listed reason why one platform has none (a `Table` has no phone renderer, for example). The icon test that keeps their icons in step folds into it.
4. **The guides:** the docs site's Fumadocs controls (search, buttons, the sidebar's items) mapped onto the same tokens in `apps/docs/app/globals.css`.
5. **The three wishes from stage 6:** a **Disclosure** (an accordion row), a **square** title cell for songs and albums, and a **multi-select**. Each is in both libraries, shown in Storybook first.
6. **Storybook:** a Controls page showing every control at every size in one row, for each platform's rule and each built-in theme.
7. **Checks that keep it:**
   - **the sweeps** (`scripts/sweeps/lib.ts`): in every row, interactive siblings share one height, one corner and one text size. This runs for every platform in `pages.ts`, for the admin on the server in `server.ts`, and for the phone and TV apps in `phone.ts` and `tv.ts`;
   - **a source test:** no raw size, corner or colour on a control in any app or prototype, whether as Tailwind classes in the web apps or style numbers in the native apps. Exceptions go in a listed file with a reason, as licences do.

### Part C: every app

Every app moves onto part B's components, with no hand-rolled controls:

- **the prototypes:** admin, web, desktop, phone and TV, on the same packages the apps use (`@highsea-tv/ui`, the tokens, `@highsea-tv/client`), with no controls of their own. Their kits move into the library or onto its components: `tv/kit.tsx`'s `TvButton` and `TvRow`, `RoundButton`, `SongButton`, `MoreButton`, and the rows per app. The phone and TV prototypes draw the library's web renderer at the touch and TV rules, so they show what `apps/mobile` and `apps/tv` draw: the same components, sizes, 16px text on the phone and the 44 hit areas. They're locked, so each changed screen is listed for the owner beside its old self (`compare.ts`, `phone-compare.ts`, `tv-compare.ts`);
- **the built apps:** `apps/server`'s admin, `apps/web` and the desktop app, `apps/mobile` and `apps/tv`;
- **the guides:** `apps/docs`, with every admin screenshot retaken (`bun scripts/docs-shots/run.ts`).

Every sweep, the source test and the parity test pass before the owner's review.

## ADRs

- **A new ADR, one design system and one component library:** the control spec as the one source, the platform rules, one component with a web and a React Native renderer chosen by the `react-native` export condition, and the checks that hold apps to it.
- **Dated sections:**
  - ADR 0028 (theming): what the audit checks for controls, and any derived role;
  - ADR 0059 (ui-native): ui-native and ui-web joined as one library's two renderers.

## Risks

- **Every screen in every app changes a little.** The compare sweeps put each beside its old self, and part C lists them.
- **Contrast can change the look.** 3:1 edges are visibly stronger than today's. Question 6 decides how.
- **Coarse pointers on the web** get larger controls, which moves the web client's phone layouts. The sweeps at 390px catch what no longer fits.
- **Joining the two libraries touches every import** in every app. It's done one component at a time, with both old names re-exported until the last screen moves.
- **A web bundle mustn't pull in React Native, nor a native one the DOM.** Each renderer imports only its platform. A test builds `apps/web` and `apps/mobile` and checks neither carries the other's renderer.

## Open questions for the owner

1. **The default control height (pointer).**
   **Recommended:** 36px for every control, inputs and selects included (down from 38), as shadcn/ui's `h-9` buttons and inputs share. Buttons don't move, which keeps the most screens as they are.
   Or: 38px for every control. Or: 40px, roomier, as Radix Themes' size 3.
2. **The small size.**
   **Recommended:** keep 30px, for dense places only (table rows, cards, a widget's header), and never in a row with the default size.
   Or: 32px, as shadcn/ui's `h-8`. Or: no small size.
3. **The shape of controls.**
   **Recommended:** `radius-sm` for every control on every platform, segmented controls, tabs and icon buttons included, so a round icon button no longer sits beside a rectangular Play. Pills stay for badges, chips and the TV's announcement pill, and chips take the control's height. This changes spacing-layout.md's locked radius table.
   Or: `radius-sm` everywhere except icon buttons, which stay round at the control's height. Or: pills for segmented controls, as v1.0 says. Or: pills for every control.
4. **Touch.**
   **Recommended:** the phone, and the web client on a coarse pointer, take the spec's sizes raised to 44 (`targets.touch`), and the phone prototype draws at those sizes.
   Or: touch only in the native app, so the web client keeps pointer sizes on phones.
5. **Text in controls.**
   **Recommended:** one text size for each control size on each platform, the same for labels, typed text and tab labels: 14px at the default size and 13px small with a pointer, 16px on touch (iOS doesn't zoom into a field at 16), and the TV's button text.
   Or: the admin at its base 13px everywhere.
6. **The edges and selected state in every theme.**
   **Recommended:** add 3:1 checks for a control's edge, its selected state and its focus ring to the audit, met with a derived role, so every theme passes and theme authors choose nothing new.
   Or: count a control's fill and label as what identifies it, so only the selected state is checked. Or: no new checks.
7. **Order.**
   **Recommended:** parts A to C before stages 7 and 8 of the prototypes' gaps, and before `apps/tv` is built in 4.5b, so Music and the TV are drawn on the new controls once.
   Or: finish stages 7 and 8 first, then this.
8. **One library, or two kept in step.**
   **Recommended:** one package, `@highsea-tv/ui`, in which each component has one props type and two renderers, chosen by the `react-native` export condition, as Metro and React Native document. ui-web and ui-native become its two halves, and their old names are re-exported until every app has moved. An app can't use a control that the library doesn't have.
   Or: keep ui-web and ui-native as two packages, with shared props types in the tokens and a parity test. That means less moving now, but two places to change every component. Or: React Native for Web, so the web apps draw React Native's components. That means one renderer, but it rewrites the admin and the web client off Tailwind and Next's server components.

## The owner's changes

On 2026-11-01, reviewing this scope, the owner made 4 changes:

1. **The apps adapt; they aren't identical.** Layout and sizes differ between apps because their screens and inputs do. The goal is one design system that works with theming, and one shared component library that adapts to the app it's in. This changed the [Goal](#goal), added [Adaptive, not identical](#adaptive-not-identical), and made [part B](#part-b-the-components) one library with two renderers (question 8).
2. **The media players' controls are excepted from the one shape** (question 3). Every other control takes `radius-sm`. See [part A](#part-a-the-one-spec-design-system-11), item 3.
3. **Touch keeps the drawn size** (question 4). Controls on the phone and on coarse pointers stay at the default size, with an invisible 44 hit area that doesn't change the layout. See [part A](#part-a-the-one-spec-design-system-11), item 2.
4. **The prototypes use the apps' packages.** They draw the same design language and components, from the same packages the real apps use, so the prototypes and the apps stay in step. The phone and TV prototypes draw the library's components at the touch and TV rules, and their own kits move into the library. The source test covers the prototypes. See [part B](#part-b-the-components), item 1, and [part C](#part-c-every-app).

## The owner's answers

On 2026-11-01 the owner took every recommendation for questions 1 to 8 except 3 and 4:

1. 36px for every control with a pointer, inputs and selects included.
2. 30px kept as the small size, for dense places only, and never in a row with the default size.
3. **Changed by the owner:** `radius-sm` for every control on every platform, icon buttons included, except the media players' own controls. Pills stay for badges, chips and the TV's announcement pill.
4. **Changed by the owner:** on the phone and coarse pointers, controls keep the default size, and an invisible box around each reaches 44 (`hitSlop` in React Native, the `::after` box on the web), without changing size or layout.
5. 14px at the default size and 13px small with a pointer, and 16px on touch for every control in a row. The TV's text comes by its rule.
6. 3:1 checks for a control's edge, its selected state and its focus ring, met with a derived role.
7. Parts A to C before stages 7 and 8 of the prototypes' gaps and before `apps/tv`.
8. One package, `@highsea-tv/ui`, in which each component has one props type and a web and a React Native renderer, chosen by the `react-native` export condition.

## Progress

### 2026-11-01: parts A to C built, waiting for the owner's review

On the owner's word of 2026-11-01 ("do not stop until the new design system plan has been fully implemented"), the three parts were built together and are reviewed together.

- **Part A, the spec:**
  - `packages/tokens/src/controls.ts`: the two sizes (36 and 30, each with its padding, gap, icon, text and the `radius-sm` corner), the looks as colour roles, and `controlMetrics`, the rule for each platform (pointer, touch, the TV at 1.75 times in screen units). The tokens' CSS writes `--control-*` for a pointer, for `@media (pointer: coarse)` and for any element with `data-platform`. `--size-input` is gone.
  - The derived roles `control-edge` and `control-selected` (and a custom accent's ring), lightened only as far as 3:1 needs. The theme audit checks a field's edge, a chosen segment and its label, and the focus ring on every surface, in every built-in theme and any custom one.
  - [controls.md](../design-language/controls.md) in the design language. The platform guides, spacing-layout.md's radius table and accessibility.md link to it.
- **Part B, the components:**
  - `@highsea-tv/ui` joins ui-web and ui-native: `src/web` and `src/native`, one props type each in `src/shared/controls.ts`, the renderer picked by the `react-native` condition. `@highsea-tv/ui/tv` is the TV rule of the same components. `src/shared/parity.ts` lists what each side draws, and `test/parity.test.ts` checks it, with the icons.
  - Every control on the spec: Button (icon buttons and the `overlay` and `danger-ghost` looks), Input, Textarea, Select, SearchField, SegmentedControl, Tabs, Chip, Checkbox, Radio and Switch, each marked `data-control`. On touch each keeps its drawn size inside a 44 hit area (`--control-hit` on the web, `hitSlop` in React Native).
  - The three wishes from stage 6: Disclosure, the square TitleCell and MultiSelect, in both renderers.
  - The guides' Fumadocs controls on the same variables (`apps/docs/app/globals.css`): search 36, icon buttons 30, sidebar items 36, every corner `radius-sm`.
  - Storybook's Controls page: every control at both sizes in one row, for each platform's rule and each built-in theme.
  - The checks: the sweeps' row check (`mixedRows` in `scripts/sweeps/lib.ts`), the source test (`scripts/controls.ts`, with its reasons in `scripts/control-exceptions.json`), and the bundle test (`scripts/bundles.ts`, in `ci.yml` and `native.yml`).
- **Part C, every app:** the admin (prototype and `apps/server`), the web client and the desktop app (prototype, `apps/web` and `apps/desktop`), the phone (prototype and `apps/mobile`), the TV (prototype and `apps/tv`) and the guides draw only the library's controls. The phone and TV prototypes' frames set `touch` and `tv` through `PlatformScope`. `TvButton` is a thin wrapper over Button that keeps the TV's focus attributes, and the prototypes' `hitSlop` helper is gone.
- **Exceptions:** 110 in `scripts/control-exceptions.json`, each with its reason. They are rows of a list (a sheet's actions, songs, servers, settings options), tiles, keyboard and PIN keys, letter rails, and the players' own controls (`data-player-controls`).
- **Gaps in the library, for later:** no slider (volume and scrubbers) and no colour field; no link-look button; no pressed look for an icon toggle; Chip has no `asChild`, no trailing icon and no radio mode, since its chosen look reads `aria-pressed`; no look over the picture that stays light in a light theme; Tabs have no fill mode for four tabs at 16px on a phone; no large code or PIN field (`/link` and the PIN step are 36 now); Button and Chip have no TV focus shadow or scale of their own (the TV adds them); the switch keeps its own 24 × 40 track; and in a scrolling segmented control or tabs, the touch hit area is clipped by the scroller.
- **The sweeps' first full run** found 333 problems, fixed on 2026-11-01:
  - **Mixed rows:**
    - the admin's search trigger at 13px;
    - Movies' and Shows' View and Save as smart collection at 30 (the owner's screenshot), and other small controls beside 36s: Preview on, Encoder, Privacy, and the Remove buttons in rules, format conditions and subtitle profiles;
    - the web's avatar at 32;
    - segmented tracks and fields with an icon that took the page's text size rather than the control's.
  - **Overflows at 390 with 200% text:** the owner's banners, the editors, the calendar, Appearance, VPN and the imports in the admin; the connect screen (Disclosure's title now wraps), the music tabs (segmented tabs scroll when too wide) and the desktop app's top bar (it wraps) in the clients.
  - **Contrast:** a tab's count on the chosen tab, now `text` there.
- **The row check now:**
  - counts text only where a control shows it;
  - lets chips and avatars be round;
  - leaves out switches, `data-item` (a list's items, tiles and keys) and `data-player-controls`;
  - groups only controls on the same layer, so a sticky save bar isn't a row with the page behind it.
- **Checks on 2026-11-01:** lint, typecheck and 12,721 tests pass (8 skipped); smoke, licences, audit and the docs build pass. The controls scan and both bundle checks are clean. Every sweep is clean: the pages sweep (3,408 pages), the keyboard walk (329 pages), the D-pad walk, the server's pages and keyboard, and playback in Chromium and Firefox. `phone.ts`, `tv.ts` and the phone and TV compare sheets weren't run: they need the apps built and signed in on a simulator, and `apps/tv` isn't built until 4.5b.

### 2026-11-01: after the build, the phone and TV on the simulators

- **The missing padding and gaps** the owner saw were stale dev servers started before `@highsea-tv/ui`, whose Tailwind never scanned the library. Restarting them, and rebuilding the desktop build and Storybook, brought them back; nothing in the code changed for it.
- **The phone crashed at launch** ("Tried to register two views with the same name RCTText"): Bun's isolated installs gave `@highsea-tv/ui` its own copy of `react-native-tvos`, for its web side's React 19.3.1, so the bundle had two. `apps/mobile/metro.config.js` and `apps/tv/metro.config.js` resolve `react-native` from the app wherever it's imported (Metro's `resolveRequest`; Expo doesn't support duplicate React Native copies). The bundle has no duplicate packages now, and `phone.ts` signs in and plays Sintel.
- **The admin's sidebar sat off the left edge:** the skip link's Button `relative` overrode `sr-only` (tailwind-merge doesn't group them), so it took room in the row. It's now fixed above the screen and slides in when focused, in the prototype and `apps/server`.
- **The phone and TV compare sheets** were run. The apps are behind the prototypes' stages 2 to 6, which they haven't been brought up to yet; their controls are drawn to the spec. One TV bug beyond that: Library's tab bar covers its header and the letter rail sits on the first column of posters.
