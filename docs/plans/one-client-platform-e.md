# One client platform, part E: the guides, the specs and the full checks

- **Status:** Scoped on 2026-11-09, after the one compose file's sign-off, and approved with [the owner's answers](#the-owners-answers) of 2026-11-09: every recommendation. Nothing is built.
- **Parent plan:** [one-client-platform.md](one-client-platform.md), part E: "The guides' drawn parts on the library, the design language's platform guides on the form-factor rule, the product specs naming one screen per destination, the ADRs, `CLAUDE.md`, and every check."

## Read first

1. [one-client-platform.md](one-client-platform.md): the Goal, "The guides, drawing their parts from the library (E)", "Checks that fail on drift (A to E)", the owner's change 2 (the guides draw their parts from the library), and the answers at part A's review, of which 7 (the 143 values get a token set proposed for approval in part E) and 9 (the drawn scrollbar's measures become tokens in part E) are this part's.
2. [one-client-platform-d.md](one-client-platform-d.md): its Progress, above all D2's and D3's "Left open" lists, and what it says is "listed for part E".
3. [one-client-platform-b.md](one-client-platform-b.md) and [one-client-platform-c.md](one-client-platform-c.md): the values B1 to B3 drew without tokens, and C1's note on react-native-svg's props on the web.
4. `scripts/one-place-exceptions.json`: every exception is `"until": "E"`. `scripts/one-place.ts` (what the values rule reads) and `packages/ui/src/shared/parity.ts`.
5. The tokens: `packages/tokens/src/scales.ts`, `typography.ts`, `controls.ts` and `form-factor.ts`, with [docs/design-language/](../design-language/README.md) and [controls.md](../design-language/controls.md). Token values are locked: this part proposes, and the owner approves.
6. The guides: `apps/docs` (`components/mdx.tsx`, `site-title.tsx`, `screenshot.tsx`, `app/globals.css`, `next.config.ts`) and `apps/docs/test/content.test.ts`.
7. [ADR 0061](../adr/0061-one-client-platform.md) (still Proposed) and [ADR 0060](../adr/0060-one-design-system-one-library.md), then 0003, 0008, 0053, 0055, 0058 and 0059 for their dated sections.
8. `.claude/skills/checks/SKILL.md` and [scripts/sweeps/README.md](../../scripts/sweeps/README.md): what "every check" means.

## Goal

When part E is signed off, the one client platform is done. A colour, size or corner is written only in the tokens. The few values that stay outside them are listed with a reason that never expires: the operating systems' own window chrome, a technique's measure, a parser's pattern. `one-place-exceptions.json` has no `"until"` left.

The guides at `docs.highsea.tv` keep Fumadocs' search, sidebar, table of contents and MDX. Their callouts, cards and figures are the library's components, drawn through react-native-web as the site title already is.

The design language, the product specs, the ADRs, `docs/architecture.md`, `CLAUDE.md`, the skills and the sweeps' README describe the platform as built: one client project, one library, one screen per destination, the form-factor rule. Nothing names `apps/web`, `apps/mobile`, `apps/tv`, `ui-web`, `ui-native`, Radix or Storybook as current. Then every check runs, the simulators' too, and the owner signs off the one client platform.

## Out of scope

- **New screens and features.** Shows' and music's server work, Music in the admin (prototype-gaps.md's stage 7), and downloads (4.6) keep their own phases.
- **Android and Android TV (4.5c).** Their builds come from `apps/client` and are checked there. ADRs 0053 and 0059 stay Proposed until 4.5c ([answer 10](#the-owners-answers)).
- **Fumadocs itself.** Its search, sidebar, table of contents, code blocks, headings and page layout stay its own (the parent plan's answer 8).
- **The guides' words.** Part E changes how a guide's parts are drawn, not what any guide says. Guides change only where a screenshot they show looks different.
- **Publishing anything.** The guides go out when the owner merges `next` into `main`. Nothing is tagged or released.

## Where things stand

- **The values without tokens.** `bun run one-place` (on `next` at `9198f3b`) is clean, with 548 values excepted in 57 entries of `one-place-exceptions.json`, every one `"until": "E"`. Part A's review counted 143. B added the players' and music's measures, and D added the admin's parts. Broken down:
  - **By place:** 299 in the library (`packages/ui/src/native`) and 249 in `apps/client/src`. The media players hold 234 of them: `src/player/` and `src/music-player/`.
  - **By kind:** 510 sizes, spaces and corners, and 38 colours. Of the sizes, 32 are a 1-wide border or rule, and about 150 are the TV's measures in screen units, for which the tokens have no spacing scale.
  - **Measures:** the admin's overlays at the old web renderer's Radix measures (the menu's 224, the popover's 288, the tooltip's 256, the toaster's 420, the palette's 560), the table's 36 head, the Stepper's 22 disc, EmptyState's 56 circle, and type sizes off the scales (11, 13, 13.5, 15, 17).
  - **Colours:** the glass over artwork (`rgba(11,11,12,0.62)`, `glass.ts`), black scrims at 0.35 to 0.6, and the desktop window's Windows and macOS colours.
- **Values the check doesn't read yet.** The values rule covers `apps/client/src`, `packages/ui/src/native` and `src/shared`. Run over `packages/admin/src` and `apps/docs/components` (on 2026-11-09, with the check's list widened and then restored), it finds 347 more: 346 in the admin's screens (`widgets.tsx` 33, `setup.tsx` 32, `system.tsx` 18, `wanted.tsx` 17, `appearance.tsx` 17, then 41 files with fewer) and one in the site title (`Lockup`'s `size={17}`).
- **Constants waiting for tokens** outside the check, because they're named rather than written in place:
  - the drawn scrollbar's measures (`packages/ui/src/shared/scrollbar.ts`: the 6 inset, the 6 and 8 handle, the 8 reach, the 32 shortest handle, the 0.45 and 0.7 alphas), which the owner's answer 9 at part A makes tokens;
  - a pointer's hover (`packages/ui/src/native/lift.ts`: the poster's 1.02 scale, and the 1.08 and 1.1 brightness), which the file says wait for part E.
- **The admin's old breakpoints are still read.** `breakpoints` (600, 1024 and 1440 in `scales.ts`) is read by the library's `Banner`, `Row` and `page-parts.tsx`, and by the Stepper's test, though the admin moved onto the form-factor rule in D1. `density.sidebarRail` (64) is read by nothing since D1 removed the rail.
- **The guides** (`apps/docs`, Fumadocs UI 16.16.2 and fumadocs-mdx 15.4.6 on Next.js 16.4.1, built with `--webpack` as a static export). Since D3 the site title draws the library's native `Lockup` through react-native-web, with the library's sheet written into each exported page by `@highsea-tv/ui/next/style-registry`. What the 96 guides draw:

  | Part | Uses | Drawn by |
  | --- | --- | --- |
  | `Card` in `Cards` | 90 cards in 31 groups | Fumadocs |
  | Images (`![…](…)`, the screenshots) | 167, from 166 files in `public/images` | Fumadocs' `img`: Next's `Image`, unoptimised, with `rounded-lg` |
  | `Steps` and `Step` | 2 and 7 | Fumadocs |
  | `Tabs` and `Tab` | 2 and 6 | Fumadocs |
  | `Callout` | 1 (`settings/backups/restore-and-move.mdx`) | Fumadocs |
  | `ScreenshotToCome` | 0 | highsea's own, in Tailwind classes |
  | Code blocks, headings, tables | throughout | Fumadocs |

  There are no badges or buttons in any guide, though the parent plan names them. The frame takes the tokens as CSS variables: `app/globals.css` imports `@highsea-tv/tokens/tokens.css` and maps highsea's colour roles onto Fumadocs' (`--color-fd-*`), as Fumadocs documents for theming ([Themes › Colors](https://fumadocs.dev/docs/ui/theme#colors)). Fumadocs' styles are built on Tailwind CSS 4, so Tailwind stays in `apps/docs` (PostCSS and `@import "tailwindcss"`).
- **Docs that describe the platform before this plan:**
  - [spacing-layout.md](../design-language/spacing-layout.md) still says the admin keeps 600, 1024 and 1440 "until part D", and its breakpoint table still has the admin's icon rail;
  - [platforms/admin.md](../design-language/platforms/admin.md) has the same breakpoints, with the rail;
  - [platforms/desktop-web.md](../design-language/platforms/desktop-web.md) calls the desktop app "a Tauri wrapper around the web build" on the 12-column grid;
  - [platforms/tv.md](../design-language/platforms/tv.md) has "`@highsea-tv/ui` (TV web builds) and `ui-native` must behave identically";
  - [accessibility.md](../design-language/accessibility.md) says the sweeps take the client's web build "in part E", which C1 already did.
  - The product specs give 30 `Prototype:` lines, most of them on routes the prototypes no longer have (`#/web/…`, `#/mobile/…`, `#/tv/…`, and `#/admin/shows`, which D3 put at `/series`). Their Layout sections are split into Web and desktop, Mobile and TV, without naming the one screen file. `player.md`, `client-library.md`, `admin-shell.md` and `dashboard.md` name `ui-web` or `ui-native`, and `appearance.md` names Storybook's theme editor.
  - The sweeps' README and `lib.ts` still wait for Radix's dialogs to close, and `server.ts` explains its menus by Radix's.
- **ADRs:** 0061 is Proposed, waiting for the owner's review of the whole platform, and so is 0060. 0053 is Proposed for the phone and the TV (its web and desktop parts are Accepted), and 0059 is Proposed until 4.5c.
- **The checks:** D3 ran the full checks except the Apple TV's remote walk and `layout.ts` on the simulators (for the virtual grid), and the image with the end-to-end run. `layout.ts` last ran over the client's destinations in B3. Nothing sweeps the guides: they're checked by their build and `content.test.ts`.
- **Left for part E by the earlier parts:**
  - D2's library gaps: a Badge that truncates, a table cell spanning columns on the web, a row's title tooltip, a number input with limits, a `MultiSelect`, a heading level for a small EmptyState, a Dialog's fade-out, and a `title` the web keeps (react-native-web drops it);
  - C1's note: react-native-svg on the web passes React Native's `accessible`, `accessibilityElementsHidden` and `importantForAccessibility` to the `<svg>`, which React warns about in development;
  - prototype-gaps.md's stage 8 (the specs and the full checks), which the parent plan's answer 7 put after this plan.

## The size of this part, and its batches

Three gated batches, each reviewed by the owner ([answer 1](#the-owners-answers)):

- **E1, the tokens.** It opens with the proposed token set, every value with its family, name and where it's used, and stops for the owner's approval before anything is applied, since token values are locked. Then the approved tokens are added, the 548 excepted values and the 346 the check doesn't read yet are moved onto them, and the scrollbar's and the hover's constants become tokens. The library's old breakpoints move onto the form-factor rule. The values rule then reads the admin and the guides, and the exceptions file keeps only the reasons that never expire. Nothing should look different, except where an approved token rounds a value, and each of those is listed beside its old self.
- **E2, the guides on the library.** The callout, the cards and the figures drawn by the library through react-native-web, in Fumadocs' MDX; the unused `ScreenshotToCome` removed; `one-place` reading `apps/docs`; and a sweep over the guides' export.
- **E3, the docs and every check.** The design language's platform guides, the product specs (with prototype-gaps' stage 8's list), the ADRs, `docs/architecture.md`, `CLAUDE.md`, the skills and the sweeps' README, then every check, the simulators' included, and the parent plan's sign-off.

## Progress

### 2026-11-10: E1's proposed token values, waiting for the owner's approval

E1's first stop: the value table that [the proposed token set](#the-proposed-token-set) asks for. Nothing is applied. `packages/tokens`, the library, the admin and the guides are unchanged, `scripts/one-place-exceptions.json` still lists 548, and the shape approved with this scope (the families, the rule and where each family lives) is kept, with the few places it needs a call listed at the end.

**How it was measured.** The values rule's own reader (`literals()` in `scripts/one-place.ts`, run from a copy outside the repository so nothing in the check changed) over the three folders the check reads and the two it doesn't read yet, `packages/admin/src` and `apps/docs/components`. It finds 895 values: the 548 excepted, 346 in the admin and the site title's one, the same as [Where things stand](#where-things-stand). Each was then read in place and given a token by the plan's rule. The scrollbar's and the hover's named constants aren't literals at their use, so the reader doesn't see them; they're counted by hand from `scrollbar.ts`, `lift.ts` and `page-parts.tsx`.

**In short.**

- 324 new tokens: 313 for the 895 values and 11 for the named constants. Another 28 tokens that exist already take values written by hand.
- 27 values would round, each listed beside its old self below. Every other value keeps its exact size or colour.
- 19 values stay listed with a lasting reason, in 4 files: the window chrome, the visually hidden technique, `alpha()`'s pattern and a mirrored icon.
- 5 families come out well off the plan's estimates (line widths, the TV's spaces, icons, overlays and the component measures). The first table says why.

#### The counts, measured

| Family | Plan's estimate | Measured | Excepted now (548) | Admin (346) | Guides (1) | Where they differ |
| --- | --- | --- | --- | --- | --- | --- |
| Line widths | 35 | 134 | 47 | 87 | 0 | The estimate counted the check's 32 one-wide values. The admin adds 87 (borders, rules and the table's lines), and the 2-wides and the three −1 overlaps are here too. |
| The TV's spaces in units | 150 | 109 | 109 | 0 | 0 | 109 land on the new scale. The TV's other measures in units (cards, the players, the head) are single-component measures, so they're counted under the component groups (67) and the new `tv.radius` steps (14). |
| Type off the scales | 45 | 40 | 37 | 3 | 0 | Close: 40, of which 3 in the admin. The TV's 2.4 titles are in it (`tvText.title`), and the 22 and 18 on the phone's Now Playing round onto existing styles. |
| Icons | 20 | 72 | 27 | 45 | 0 | Higher: the admin writes its icons' sizes in place 45 times (14 fifteen times, 16 fourteen times), and the 32, 44 and 56 discs and the 1 drop are counted here. |
| Overlays over art | 10 | 33 | 32 | 1 | 0 | Higher: black itself (9: behind video, in the scrims' and masks' gradients), the backdrop's 1.1 scale (2) and the hairline inside artwork (2) are counted here with the scrims and the glass. |
| Stay listed, with a lasting reason | 19 | 19 | 19 | 0 | 0 | As estimated: the window chrome 13, the hidden heading 3, `alpha.ts` 2, and the player's mirrored icon 1. |
| Component measures, in all | 600 | 488 | 277 | 210 | 1 | Lower, because the line widths, icons and overlays above took values the estimate had here. Split below. |
| · onto tokens that exist | | 57 | 46 | 11 | 0 | |
| · new steps on locked scales | | 55 | 37 | 18 | 0 | |
| · the library's and client's groups | | 192 | 183 | 8 | 1 | |
| · the admin's screens | | 167 | 0 | 167 | 0 | |
| · one visually hidden style | | 17 | 11 | 6 | 0 | |
| Pointer hover (named, not read by the check) | 3 | 4 | | | | `lift.ts`'s three, and `page-parts.tsx`'s `PHOTO_LIFT` (1.05) for the person's photo, which the estimate missed. |
| The scrollbar (named, not read by the check) | 7 | 7 | | | | As estimated. |
| **All the values the check reads** | | **895** | **548** | **346** | **1** | Plus the 11 named constants: 906 in all. |

#### Every proposed token

Paths are shortened: `ui/` is `packages/ui/src/native/`, `ui/shared/` is `packages/ui/src/shared/`, `client/` is `apps/client/src/`, `admin/` is `packages/admin/src/`, `docs/` is `apps/docs/components/`. The number after a file is how many of its values take the token. The TV's values are in units (1u = 1% of the screen's width, [platforms/tv.md](../design-language/platforms/tv.md)).

##### Line widths (134 values)

A new `line` scale in `scales.ts`, documented in [elevation.md](../design-language/elevation.md) beside the line colours. The three −1 margins that overlap a border take `-line.thin`.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `line.thick` | 2; the line tabs' underline, a rule group's bar, the resize mark, the letter rail | scales.ts `line` | 7 | `admin/collections-rules.tsx` 1, `ui/letter-index.tsx` 1, `ui/segmented.tsx` 1, `ui/widget-editor.web.tsx` 2, `ui/widget.tsx` 2 |
| `line.thin` | 1; the 1-wide border and rule (elevation.md: `line` on level 1, `line-strong` on inputs) | scales.ts `line` | 127 | `admin/account.tsx` 2, `admin/appearance.tsx` 5, `admin/auth-card.tsx` 2, `admin/collection-art.tsx` 1, `admin/collection.tsx` 1, `admin/collections-editor.tsx` 3, `admin/collections-rules.tsx` 1, `admin/collections.tsx` 1, `admin/curation-frame.tsx` 2, `admin/curation-section.tsx` 1, `admin/curation-shared.tsx` 2, `admin/curation.tsx` 1, `admin/dashboard.tsx` 1, `admin/downloads.tsx` 3, `admin/general.tsx` 2, `admin/indexers.tsx` 3, `admin/library-import.tsx` 1, `admin/library.tsx` 1, `admin/lists.tsx` 1, `admin/media-management.tsx` 2, `admin/media-sections.tsx` 1, `admin/movie-detail.tsx` 2, `admin/now-playing.tsx` 2, `admin/playback.tsx` 2, `admin/quality-editors.tsx` 1, `admin/settings-card.tsx` 2, `admin/settings.tsx` 2, `admin/setup.tsx` 8, `admin/shows-library.tsx` 1, `admin/subtitles.tsx` 2, `admin/system.tsx` 7, `admin/tag-settings.tsx` 1, `admin/users.tsx` 2, `admin/vpn.tsx` 7, `admin/wanted.tsx` 9, `admin/widgets.tsx` 1, `client/player/parts.tsx` 4, `client/player/pointer.tsx` 1, `client/player/tv.tsx` 1, `ui/admin.tsx` 7, `ui/badge.tsx` 2, `ui/banner.tsx` 1, `ui/button.tsx` 1, `ui/chip.tsx` 1, `ui/command-palette.tsx` 1, `ui/field.tsx` 1, `ui/menu.tsx` 2, `ui/page-parts.tsx` 1, `ui/poster.tsx` 3, `ui/segmented.tsx` 2, `ui/sheet.tsx` 1, `ui/sortable-list.tsx` 1, `ui/stepper.tsx` 1, `ui/table.tsx` 4, `ui/toaster.tsx` 1, `ui/toggle.tsx` 1, `ui/widget-editor.web.tsx` 3, `ui/widget.tsx` 1 |

##### The TV's spaces in units (109 values)

A new `tv.space` scale in `scales.ts`'s `tv`, documented in [platforms/tv.md](../design-language/platforms/tv.md). It's keyed as `space` is: a step is 0.2u, so `tv.space.5` is 1u and `tv.space.12` is 2.4u. Steps no part uses yet are left out.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `tv.space.0.5` | 0.1 | scales.ts `tv.space` | 2 | `client/music-player/now-playing-tv.tsx` 1, `ui/badge.tsx` 1 |
| `tv.space.1` | 0.2 | scales.ts `tv.space` | 7 | `client/music-player/now-playing-tv.tsx` 2, `client/player/tv.tsx` 1, `ui/featured-card.tsx` 1, `ui/film-row.tsx` 1, `ui/page-parts.tsx` 1, `ui/toast.tsx` 1 |
| `tv.space.1.5` | 0.3 | scales.ts `tv.space` | 6 | `client/music-player/now-playing-tv.tsx` 2, `client/player/tv.tsx` 1, `ui/badge.tsx` 1, `ui/rating.tsx` 1, `ui/tv/cards.tsx` 1 |
| `tv.space.2` | 0.4 | scales.ts `tv.space` | 6 | `client/music-player/now-playing-tv.tsx` 2, `ui/badge.tsx` 2, `ui/film-row.tsx` 1, `ui/tv/cards.tsx` 1 |
| `tv.space.2.5` | 0.5 | scales.ts `tv.space` | 4 | `client/music-player/now-playing-tv.tsx` 1, `client/player/tv.tsx` 1, `ui/film-row.tsx` 1, `ui/page-parts.tsx` 1 |
| `tv.space.3` | 0.6 | scales.ts `tv.space` | 15 | `client/music-player/now-playing-tv.tsx` 4, `client/player/tv.tsx` 2, `ui/badge.tsx` 1, `ui/film-row.tsx` 1, `ui/notice-card.tsx` 1, `ui/page-parts.tsx` 1, `ui/tv/cards.tsx` 2, `ui/tv/controls.tsx` 1, `ui/tv/head.tsx` 2 |
| `tv.space.3.5` | 0.7 | scales.ts `tv.space` | 4 | `client/music-player/now-playing-tv.tsx` 1, `client/player/tv.tsx` 1, `ui/film-row.tsx` 1, `ui/page-parts.tsx` 1 |
| `tv.space.4` | 0.8 | scales.ts `tv.space` | 10 | `client/music-player/now-playing-tv.tsx` 2, `client/player/parts.tsx` 1, `ui/featured-card.tsx` 1, `ui/film-row.tsx` 2, `ui/notice-card.tsx` 1, `ui/row.tsx` 1, `ui/toast.tsx` 1, `ui/tv/detail.tsx` 1 |
| `tv.space.4.5` | 0.9 | scales.ts `tv.space` | 3 | `ui/page-parts.tsx` 2, `ui/tv/tiles.tsx` 1 |
| `tv.space.5` | 1 | scales.ts `tv.space` | 16 | `client/music-player/now-playing-tv.tsx` 2, `client/player/tv.tsx` 6, `ui/film-row.tsx` 3, `ui/row.tsx` 1, `ui/tv/cards.tsx` 1, `ui/tv/controls.tsx` 2, `ui/tv/tiles.tsx` 1 |
| `tv.space.6` | 1.2 | scales.ts `tv.space` | 12 | `client/music-player/now-playing-tv.tsx` 2, `client/player/tv.tsx` 2, `ui/film-row.tsx` 3, `ui/notice-card.tsx` 1, `ui/page-parts.tsx` 1, `ui/toast.tsx` 1, `ui/tv/cards.tsx` 1, `ui/tv/page.tsx` 1 |
| `tv.space.7` | 1.4 | scales.ts `tv.space` | 8 | `client/player/parts.tsx` 2, `client/player/tv.tsx` 1, `ui/film-row.tsx` 1, `ui/tv/cards.tsx` 2, `ui/tv/controls.tsx` 1, `ui/tv/head.tsx` 1 |
| `tv.space.8` | 1.6 | scales.ts `tv.space` | 8 | `client/music-player/now-playing-tv.tsx` 1, `client/player/parts.tsx` 1, `client/player/tv.tsx` 2, `ui/notice-card.tsx` 1, `ui/page-parts.tsx` 1, `ui/tv/detail.tsx` 1, `ui/tv/page.tsx` 1 |
| `tv.space.10` | 2 | scales.ts `tv.space` | 1 | `ui/tv/page.tsx` 1 |
| `tv.space.12` | 2.4 | scales.ts `tv.space` | 5 | `client/player/parts.tsx` 1, `ui/tv/cards.tsx` 2, `ui/tv/detail.tsx` 2 |
| `tv.space.20` | 4 | scales.ts `tv.space` | 2 | `client/music-player/now-playing-tv.tsx` 1, `client/player/tv.tsx` 1 |

##### Type off the scales (40 values)

In `typography.ts`, documented in [typography.md](../design-language/typography.md). The two new phone styles are iOS's Headline (17 pt, semibold) and Subheadline (15 pt, regular), from the [Human Interface Guidelines › Typography](https://developer.apple.com/design/human-interface-guidelines/typography)'s size table. Sizes that match an existing style's size move onto that style: 11 onto `webText.label`, 12 onto `adminText.figure` on a pointer and `mobileText.caption` by touch, 13 onto `adminText.ui`.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `adminText.figure.size` | 12 | exists | 5 | `admin/widgets.tsx` 1, `client/music-player/bar.tsx` 2, `client/music-player/parts.tsx` 1, `ui/widget.tsx` 1 |
| `adminText.ui.size` | 13 | exists | 5 | `admin/setup.tsx` 1, `client/music-player/mini.tsx` 1, `client/music-player/now-playing.tsx` 1, `client/player/touch.tsx` 1, `ui/command-palette.tsx` 1 |
| `mobileText.caption.size` | 12 | exists | 4 | `client/music-player/now-playing.tsx` 2, `client/player/touch.tsx` 2 |
| `mobileText.headline` | 17; 17 pt, 600: iOS Headline (HIG › Typography) | typography.ts `mobileText` | 4 | `client/music-player/now-playing.tsx` 1, `client/player/touch.tsx` 2, `ui/section-heading.tsx` 1 |
| `mobileText.subheadline` | 15; 15 pt, 400: iOS Subheadline (HIG › Typography) | typography.ts `mobileText` | 1 | `client/music-player/mini.tsx` 1 |
| `mobileText.title.size` | 20 | exists | 1 | `client/music-player/now-playing.tsx` 1 |
| `tracking.tag` | 0.04; em: the quality tag's 0.44 at 11 and 0.03u at 0.8u | typography.ts `tracking` | 2 | `ui/badge.tsx` 2 |
| `tvText.meta.size` | 1.05 | exists | 2 | `ui/featured-card.tsx` 1, `ui/film-row.tsx` 1 |
| `tvText.title` | 2.4; 2.4u, 600: tv.md's album, PIN and message titles | typography.ts `tvText` | 4 | `client/player/tv.tsx` 1, `ui/tv/cards.tsx` 2, `ui/tv/controls.tsx` 1 |
| `webText.label.size` | 11 | exists | 12 | `admin/collections-editor.tsx` 1, `client/music-player/now-playing.tsx` 1, `ui/admin.tsx` 4, `ui/badge.tsx` 1, `ui/letter-index.tsx` 1, `ui/segmented.tsx` 1, `ui/stepper.tsx` 1, `ui/waveform.tsx` 1, `ui/widget-editor.web.tsx` 1 |

##### Icons (72 values)

In `scales.ts`'s `icon`, documented in [iconography.md](../design-language/iconography.md). `icon.size.xs` (14) is `controlGeometry.sm.icon` already. The discs are the circles an icon sits in: 32 in the Banner, the Toaster and the small EmptyState, 44 in the admin's EmptyState and 56 in the client's.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `icon.disc.lg` | 56 | scales.ts `icon.disc` | 1 | `ui/empty-state.tsx` 1 |
| `icon.disc.md` | 44 | scales.ts `icon.disc` | 1 | `ui/empty-state.tsx` 1 |
| `icon.disc.sm` | 32 | scales.ts `icon.disc` | 6 | `ui/banner.tsx` 2, `ui/empty-state.tsx` 2, `ui/toaster.tsx` 2 |
| `icon.drop` | 1; an icon's 1 drop to sit on its text's first line | scales.ts `icon` | 4 | `admin/auth-card.tsx` 1, `admin/curation-preview.tsx` 1, `admin/movie-detail.tsx` 1, `admin/setup.tsx` 1 |
| `icon.dropTv` | 0.2; the same drop on the TV, in u | scales.ts `icon` | 1 | `ui/notice-card.tsx` 1 |
| `icon.size.2xs` | 12 | scales.ts `icon.size` | 9 | `admin/discover-shows.tsx` 1, `admin/discover.tsx` 1, `admin/media-sections.tsx` 2, `admin/settings-columns.tsx` 1, `admin/settings.tsx` 1, `admin/widgets.tsx` 1, `ui/badge.tsx` 1, `ui/stepper.tsx` 1 |
| `icon.size.md` | 20 | exists | 7 | `admin/curation.tsx` 1, `admin/playback.tsx` 1, `admin/settings.tsx` 1, `admin/system.tsx` 1, `admin/vpn.tsx` 1, `client/player/touch.tsx` 1, `ui/empty-state.tsx` 1 |
| `icon.size.sm` | 16 | exists | 22 | `admin/auth-card.tsx` 1, `admin/dashboard.tsx` 1, `admin/download-categories.tsx` 1, `admin/downloads.tsx` 1, `admin/login.tsx` 1, `admin/media-management.tsx` 1, `admin/playback.tsx` 2, `admin/quality-editors.tsx` 1, `admin/settings.tsx` 1, `admin/setup.tsx` 1, `admin/users.tsx` 2, `admin/vpn.tsx` 1, `client/music-player/now-playing.tsx` 2, `ui/admin.tsx` 2, `ui/empty-state.tsx` 1, `ui/toaster.tsx` 1, `ui/widget-editor.web.tsx` 1, `ui/widget.tsx` 1 |
| `icon.size.xs` | 14; = controlGeometry.sm.icon | scales.ts `icon.size` | 18 | `admin/activity.tsx` 1, `admin/add-dialog.tsx` 1, `admin/appearance.tsx` 1, `admin/curation-preview.tsx` 1, `admin/media-sections.tsx` 1, `admin/movie-detail.tsx` 2, `admin/now-playing.tsx` 2, `admin/security.tsx` 1, `admin/settings-columns.tsx` 1, `admin/setup.tsx` 2, `admin/system.tsx` 1, `admin/vpn.tsx` 1, `client/desktop/window.tsx` 1, `client/player/parts.tsx` 1, `ui/waveform.tsx` 1 |
| `icon.sizeTv.max` | 1.6 | exists | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `icon.sizeTv.min` | 1.4 | exists | 2 | `client/player/tv.tsx` 2 |

##### Overlays over art (33 values)

In `scales.ts` beside `blur`, as `art` (the plan's name `overlay` is taken by the overlays' widths below), documented in [elevation.md](../design-language/elevation.md). The glass and the hairline are written from the theme's roles, so a theme that changes `bg` or `text` changes them; black stays black, as elevation.md has the shadows. A scrim is `art.black` at an `art.alpha` step.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `art.alpha.35` | 0.35 | scales.ts `art.alpha` | 2 | `ui/page-parts.tsx` 2 |
| `art.alpha.50` | 0.5 | scales.ts `art.alpha` | 4 | `client/music-player/bar.tsx` 1, `client/music-player/now-playing-tv.tsx` 1, `client/music-player/now-playing.tsx` 1, `client/player/touch.tsx` 1 |
| `art.alpha.60` | 0.6 | scales.ts `art.alpha` | 3 | `client/player/parts.tsx` 1, `client/player/picture.web.tsx` 1, `ui/featured-card.tsx` 1 |
| `art.alpha.70` | 0.7 | scales.ts `art.alpha` | 6 | `client/player/parts.tsx` 1, `client/player/pointer.tsx` 1, `client/player/tv.tsx` 1, `ui/featured-card.tsx` 1, `ui/film-row.tsx` 1, `ui/tv/cards.tsx` 1 |
| `art.alpha.80` | 0.8 | scales.ts `art.alpha` | 3 | `client/player/pointer.tsx` 1, `client/player/touch.tsx` 1, `client/player/tv.tsx` 1 |
| `art.backdropScale` | 1.1 | scales.ts `art` | 2 | `client/music-player/now-playing-tv.tsx` 1, `ui/tv/page.tsx` 1 |
| `art.black` | #000000; black under scrims and shadows (elevation.md: shadows are always black) | scales.ts `art`, beside `blur` | 9 | `client/music/sizes.ts` 1, `client/player/pointer.tsx` 2, `client/player/touch.tsx` 1, `client/player/tv.tsx` 1, `ui/film-row.tsx` 2, `ui/tv/focusable.tsx` 1, `ui/tv/page.tsx` 1 |
| `art.edge` | `text` at 0.04; the hairline inside artwork; written white today | scales.ts `art` | 2 | `admin/collection-art.tsx` 1, `ui/poster.tsx` 1 |
| `art.glass` | `bg` at 0.62; rgba(11,11,12,0.62) in the default theme | scales.ts `art` | 2 | `client/player/parts.tsx` 1, `ui/glass.ts` 1 |

##### Component measures: onto tokens that exist (57 values)

No new token: the value is already a token's, written by hand. The `radius.pill` rows are half-height corners (a 4-high track's 2, a circle's 40), which the pill radius draws the same.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `controlGeometry.md.height` | 36 | exists | 2 | `admin/links.tsx` 1, `admin/login.tsx` 1 |
| `controlGeometry.md.inset` | 3 | exists | 1 | `ui/toggle.tsx` 1 |
| `radius.md` | 12 | exists | 1 | `client/player/parts.tsx` 1 |
| `radius.pill` | 999 | exists | 12 | `client/music-player/now-playing-tv.tsx` 2, `client/player/parts.tsx` 4, `client/player/pointer.tsx` 3, `client/player/tv.tsx` 2, `ui/toaster.tsx` 1 |
| `space.0.5` | 2 | exists | 6 | `admin/curation-preview.tsx` 1, `admin/import.tsx` 1, `admin/library-import.tsx` 1, `admin/widgets.tsx` 3 |
| `space.1` | 4 | exists | 2 | `ui/widget.tsx` 2 |
| `space.2` | 8 | exists | 4 | `client/player/parts.tsx` 2, `ui/sortable-list.tsx` 1, `ui/tooltip.tsx` 1 |
| `space.3` | 12 | exists | 2 | `client/player/parts.tsx` 1, `client/player/touch.tsx` 1 |
| `space.4` | 16 | exists | 10 | `client/player/parts.tsx` 3, `client/player/pointer.tsx` 4, `client/player/touch.tsx` 3 |
| `space.6` | 24 | exists | 2 | `client/player/parts.tsx` 1, `client/player/touch.tsx` 1 |
| `space.8` | 32 | exists | 1 | `ui/sheet.tsx` 1 |
| `targets.pointer` | 24 | exists | 3 | `client/player/pointer.tsx` 1, `ui/widget-editor.web.tsx` 2 |
| `targets.touch` | 44 | exists | 4 | `client/player/parts.tsx` 2, `client/player/picture.tsx` 2 |
| `theme.colors.accent` | #d6cfc2; the default theme's | exists | 2 | `admin/appearance.tsx` 2 |
| `theme.colors.text` | #ededee | exists | 1 | `client/player/picture.web.tsx` 1 |
| `theme.colors.text-3` | #a2a2a7; the default theme's | exists | 1 | `admin/appearance.tsx` 1 |
| `tv.radius.button` | 0.5 | exists | 1 | `client/player/tv.tsx` 1 |
| `tv.radius.pill` | 0.3 | exists | 2 | `client/player/tv.tsx` 1, `ui/badge.tsx` 1 |

##### Component measures: new steps on locked scales (55 values)

Steps added to scales that exist, which brand direction.md's shape section and spacing-layout.md lock, so each is a call for the owner (below). `space.1.5` and `space.2.5` are Tailwind's steps of the same names ([Tailwind › Spacing](https://tailwindcss.com/docs/padding)), which the space scale's keys already follow.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `radius.2xs` | 4 | scales.ts `radius` | 12 | `admin/collections-editor.tsx` 1, `admin/curation.tsx` 1, `admin/media-sections.tsx` 1, `admin/setup.tsx` 1, `client/player/parts.tsx` 3, `ui/admin.tsx` 1, `ui/badge.tsx` 1, `ui/letter-index.tsx` 1, `ui/widget-editor.web.tsx` 1, `ui/widget.tsx` 1 |
| `radius.3xs` | 2 | scales.ts `radius` | 1 | `admin/widgets.tsx` 1 |
| `radius.xs` | 6 | scales.ts `radius` | 5 | `admin/collections.tsx` 1, `admin/widgets.tsx` 1, `client/player/parts.tsx` 1, `ui/sortable-list.tsx` 1, `ui/widget-editor.web.tsx` 1 |
| `space.1.5` | 6 | scales.ts `space` (Tailwind's step 1.5) | 18 | `admin/curation-shared.tsx` 1, `admin/migration.tsx` 2, `admin/settings.tsx` 1, `admin/wanted.tsx` 3, `admin/widgets.tsx` 4, `client/player/parts.tsx` 1, `ui/badge.tsx` 2, `ui/banner.tsx` 1, `ui/command-palette.tsx` 1, `ui/rating.tsx` 1, `ui/tooltip.tsx` 1 |
| `space.2.5` | 10 | scales.ts `space` (Tailwind's step 2.5) | 5 | `client/player/parts.tsx` 1, `ui/command-palette.tsx` 1, `ui/poster.tsx` 1, `ui/row.tsx` 1, `ui/sortable-list.tsx` 1 |
| `tv.radius.md` | 0.6 | scales.ts `tv.radius` | 3 | `client/music-player/now-playing-tv.tsx` 2, `ui/featured-card.tsx` 1 |
| `tv.radius.panel` | 1; a TV dialog's or card's corner | scales.ts `tv.radius` | 5 | `client/player/parts.tsx` 1, `client/player/tv.tsx` 1, `ui/tv/cards.tsx` 2, `ui/tv/detail.tsx` 1 |
| `tv.radius.sm` | 0.4 | scales.ts `tv.radius` | 6 | `client/player/tv.tsx` 5, `ui/page-parts.tsx` 1 |

##### Component measures: the library's and client's groups (192 values)

A group per component, in `controls.ts` beside `controlGeometry` (or `scales.ts` for the TV's head, beside `tv`), as `density` is. A component's group holds the measures only that component draws; anything shared moved to a family above.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `avatar.size` | 36 | `controls.ts` | 1 | `ui/brand.tsx` 1 |
| `badge.dot` | 6 | `controls.ts` | 1 | `ui/badge.tsx` 1 |
| `badge.dotTv` | 0.4 | `controls.ts` | 1 | `ui/badge.tsx` 1 |
| `badge.iconTv` | 0.95 | `controls.ts` | 1 | `ui/badge.tsx` 1 |
| `badge.tag.height` | 20 | `controls.ts` | 1 | `ui/badge.tsx` 1 |
| `badge.tag.heightTv` | 1.04 | `controls.ts` | 1 | `ui/badge.tsx` 1 |
| `dragHandle` | 28 | `controls.ts` | 4 | `ui/sortable-list.tsx` 2, `ui/widget-editor.web.tsx` 2 |
| `emptyState.icon` | 26 | `controls.ts` | 1 | `ui/empty-state.tsx` 1 |
| `emptyState.words` | 320 | `controls.ts` | 1 | `ui/empty-state.tsx` 1 |
| `emptyState.wordsInline` | 440 | `controls.ts` | 1 | `ui/empty-state.tsx` 1 |
| `featuredCard.tagline` | 480 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.title.max` | 88 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.title.min` | 48 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.title.width` | 352 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.touchShare` | 0.78 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.height` | 40.5 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.inset` | 2.8 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.lineY` | 0.15 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.radius` | 1.4 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.skeletonMetaWidth` | 16 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.skeletonTitle` | 6 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.skeletonTitleWidth` | 22 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.tv.words` | 34 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `featuredCard.words` | 608 | `controls.ts` | 1 | `ui/featured-card.tsx` 1 |
| `filmRow.tv.captionBottom` | 1.1 | `controls.ts` | 1 | `ui/film-row.tsx` 1 |
| `filmRow.tv.skeletonLine` | 1 | `controls.ts` | 2 | `ui/film-row.tsx` 2 |
| `filmRow.tv.skeletonTitle` | 1.2 | `controls.ts` | 1 | `ui/film-row.tsx` 1 |
| `filmRow.tv.skeletonTitleWidth` | 12 | `controls.ts` | 1 | `ui/film-row.tsx` 1 |
| `filmRow.tv.title` | 1.6 | `controls.ts` | 1 | `ui/film-row.tsx` 1 |
| `filmRow.tv.titleLeading` | 1.7 | `controls.ts` | 1 | `ui/film-row.tsx` 1 |
| `letterIndex.leading` | 12 | `controls.ts` | 1 | `ui/letter-index.tsx` 1 |
| `lockup.auth` | 20 | `controls.ts` | 1 | `admin/auth-card.tsx` 1 |
| `lockup.size` | 17 | `controls.ts` | 4 | `admin/curation-frame.tsx` 1, `admin/setup.tsx` 1, `docs/site-title.tsx` 1, `ui/brand.tsx` 1 |
| `lockup.tv` | 22 | `controls.ts` | 1 | `admin/curation-frame.tsx` 1 |
| `musicPlayer.backdropScale` | 1.5 | `controls.ts` | 1 | `client/music-player/now-playing.tsx` 1 |
| `musicPlayer.bar.icon` | 18 | `controls.ts` | 3 | `client/music-player/bar.tsx` 3 |
| `musicPlayer.bar.skipIcon` | 17 | `controls.ts` | 2 | `client/music-player/bar.tsx` 2 |
| `musicPlayer.queueWidth` | 384 | `controls.ts` | 1 | `client/music-player/bar.tsx` 1 |
| `musicPlayer.tv.bars` | 1.2 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.bigIcon` | 2 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.cover` | 24 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.dot` | 0.3 | `controls.ts` | 2 | `client/music-player/now-playing-tv.tsx` 2 |
| `musicPlayer.tv.headCover` | 2 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.markWidth` | 0.2 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.pausedScale` | 0.9 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.play` | 5 | `controls.ts` | 2 | `client/music-player/now-playing-tv.tsx` 2 |
| `musicPlayer.tv.round` | 3.6 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.title` | 3 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `musicPlayer.tv.upNext` | 9 | `controls.ts` | 1 | `client/music-player/now-playing-tv.tsx` 1 |
| `overlay.menu` | 224 | `controls.ts` | 1 | `ui/menu.tsx` 1 |
| `overlay.palette.field` | 48 | `controls.ts` | 1 | `ui/command-palette.tsx` 1 |
| `overlay.palette.list` | 360 | `controls.ts` | 1 | `ui/command-palette.tsx` 1 |
| `overlay.palette.row` | 36 | `controls.ts` | 1 | `ui/command-palette.tsx` 1 |
| `overlay.palette.width` | 560 | `controls.ts` | 1 | `ui/command-palette.tsx` 1 |
| `overlay.popover` | 288 | `controls.ts` | 1 | `ui/menu.tsx` 1 |
| `overlay.toaster` | 420 | `controls.ts` | 1 | `ui/toaster.tsx` 1 |
| `overlay.tooltip` | 256 | `controls.ts` | 1 | `ui/tooltip.tsx` 1 |
| `pageParts.namedAction` | 80 | `controls.ts` | 1 | `ui/page-parts.tsx` 1 |
| `pageParts.tv.factLabel` | 9 | `controls.ts` | 1 | `ui/page-parts.tsx` 1 |
| `pageParts.tv.personName` | 20 | `controls.ts` | 1 | `ui/page-parts.tsx` 1 |
| `pageParts.tv.photo` | 13 | `controls.ts` | 1 | `ui/page-parts.tsx` 1 |
| `player.icon.2xl` | 36 | `controls.ts` | 1 | `client/player/touch.tsx` 1 |
| `player.icon.lg` | 28 | `controls.ts` | 4 | `client/player/picture.tsx` 2, `client/player/touch.tsx` 2 |
| `player.icon.md` | 22 | `controls.ts` | 5 | `client/music-player/mini.tsx` 2, `client/music-player/now-playing.tsx` 2, `client/player/parts.tsx` 1 |
| `player.icon.xl` | 34 | `controls.ts` | 4 | `client/music-player/now-playing.tsx` 3, `client/player/pointer.tsx` 1 |
| `player.menu.checkTouch` | 18 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.menu.row` | 40 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.message.maxWidth` | 448 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.panel.width` | 352 | `controls.ts` | 1 | `client/player/pointer.tsx` 1 |
| `player.pictureIcon` | 40 | `controls.ts` | 1 | `client/player/pointer.tsx` 1 |
| `player.round.lg` | 72 | `controls.ts` | 1 | `client/player/touch.tsx` 1 |
| `player.round.md` | 56 | `controls.ts` | 2 | `client/player/touch.tsx` 2 |
| `player.round.xl` | 80 | `controls.ts` | 5 | `client/player/pointer.tsx` 5 |
| `player.scrubber.hit` | 32 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.scrubber.preview` | 160 | `controls.ts` | 3 | `client/player/parts.tsx` 3 |
| `player.scrubber.previewLift` | 36 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.scrubber.thumb` | 14 | `controls.ts` | 3 | `client/player/parts.tsx` 3 |
| `player.scrubber.thumbActive` | 20 | `controls.ts` | 3 | `client/player/parts.tsx` 3 |
| `player.scrubber.track` | 4 | `controls.ts` | 2 | `client/player/parts.tsx` 2 |
| `player.subtitle.gap` | 2 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.subtitle.size` | 17 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.subtitle.sizeTv` | 1.8 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.timeMinWidth` | 96 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.touch.subtitleLift` | 84 | `controls.ts` | 1 | `client/player/touch.tsx` 1 |
| `player.tv.chipY` | 0.15 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.fade` | 6 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.next` | 30 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.nextBottom` | 14 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.nextChoices` | 46 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.play` | 6 | `controls.ts` | 4 | `client/player/tv.tsx` 4 |
| `player.tv.playIcon` | 2.6 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.preview` | 14 | `controls.ts` | 2 | `client/player/tv.tsx` 2 |
| `player.tv.scrubberHit` | 1.6 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.thumb` | 1.4 | `controls.ts` | 4 | `client/player/tv.tsx` 4 |
| `player.tv.track` | 0.5 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.trackFocused` | 0.8 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.tv.upNextStill` | 10 | `controls.ts` | 1 | `client/player/tv.tsx` 1 |
| `player.upNext.still` | 96 | `controls.ts` | 1 | `client/player/parts.tsx` 1 |
| `player.volume.track` | 6 | `controls.ts` | 2 | `client/player/pointer.tsx` 2 |
| `player.volume.width` | 80 | `controls.ts` | 1 | `client/player/pointer.tsx` 1 |
| `progress.height` | 4 | `controls.ts` | 1 | `ui/progress.tsx` 1 |
| `progress.panel` | 5 | `controls.ts` | 1 | `ui/progress.tsx` 1 |
| `rating.starTv` | 1.04 | `controls.ts` | 1 | `ui/rating.tsx` 1 |
| `searchTrigger.width` | 320 | `controls.ts` | 1 | `ui/admin.tsx` 1 |
| `sectionHeading.action` | 28 | `controls.ts` | 1 | `ui/section-heading.tsx` 1 |
| `serverCard.mark` | 26 | `controls.ts` | 1 | `ui/admin.tsx` 1 |
| `sheet.header` | 56 | `controls.ts` | 1 | `ui/sheet.tsx` 1 |
| `sidebar.itemY` | 7 | `controls.ts` | 1 | `ui/admin.tsx` 1 |
| `sortableList.row` | 56 | `controls.ts` | 1 | `ui/sortable-list.tsx` 1 |
| `sparkline.height` | 48 | `controls.ts` | 1 | `ui/sparkline.tsx` 1 |
| `sparkline.stroke` | 1.5 | `controls.ts` | 1 | `ui/sparkline.tsx` 1 |
| `statusBar.itemBasis` | 160 | `controls.ts` | 1 | `ui/admin.tsx` 1 |
| `stepper.disc` | 22 | `controls.ts` | 1 | `ui/stepper.tsx` 1 |
| `stepper.row` | 36 | `controls.ts` | 1 | `ui/stepper.tsx` 1 |
| `table.head` | 36 | `controls.ts` | 1 | `ui/table.tsx` 1 |
| `toggle.thumb` | 18 | `controls.ts` | 1 | `ui/toggle.tsx` 1 |
| `toggle.track` | 40 | `controls.ts` | 1 | `ui/toggle.tsx` 1 |
| `tv.head.account` | 3 | `scales.ts` | 1 | `ui/tv/head.tsx` 1 |
| `tv.head.avatar` | 2.2 | `scales.ts` | 1 | `ui/tv/head.tsx` 1 |
| `tv.head.dot` | 0.6 | `scales.ts` | 2 | `ui/tv/head.tsx` 2 |
| `tv.head.dotOffset` | 0.45 | `scales.ts` | 2 | `ui/tv/head.tsx` 2 |
| `tv.head.guide` | 1 | `scales.ts` | 1 | `ui/tv/head.tsx` 1 |
| `tv.head.stop` | 2.6 | `scales.ts` | 2 | `client/music-player/now-playing-tv.tsx` 1, `ui/tv/head.tsx` 1 |
| `tv.screenHeight` | 56.25 | `scales.ts` | 1 | `ui/title-backdrop.tsx` 1 |
| `tvConfirm.icon` | 1.1 | `controls.ts` | 1 | `ui/tv/cards.tsx` 1 |
| `tvConfirm.width` | 44 | `controls.ts` | 1 | `ui/tv/cards.tsx` 1 |
| `tvDetail.progressLine` | 0.3 | `controls.ts` | 1 | `ui/tv/detail.tsx` 1 |
| `tvDetail.progressWidth` | 11 | `controls.ts` | 1 | `ui/tv/detail.tsx` 1 |
| `tvDetail.sideDialog` | 32 | `controls.ts` | 1 | `ui/tv/detail.tsx` 1 |
| `tvMenu.column` | 30 | `controls.ts` | 1 | `ui/tv/cards.tsx` 1 |
| `tvMessage.keyDot` | 0.5 | `controls.ts` | 1 | `ui/tv/controls.tsx` 1 |
| `tvMessage.width` | 46 | `controls.ts` | 1 | `ui/tv/controls.tsx` 1 |
| `tvNotice.width` | 40 | `controls.ts` | 1 | `ui/tv/cards.tsx` 1 |
| `tvTiles.progress` | 0.25 | `controls.ts` | 2 | `ui/tv/tiles.tsx` 2 |
| `tvTiles.wide` | 17 | `controls.ts` | 1 | `ui/tv/tiles.tsx` 1 |
| `waveform.barMin` | 2 | `controls.ts` | 1 | `ui/waveform.tsx` 1 |
| `widget.head` | 24 | `controls.ts` | 1 | `ui/widget.tsx` 1 |
| `widget.resizeMark` | 12 | `controls.ts` | 4 | `ui/widget-editor.web.tsx` 2, `ui/widget.tsx` 2 |
| `wrapBasis` | 192 | `controls.ts` | 5 | `admin/appearance.tsx` 1, `admin/import.tsx` 1, `admin/library-import.tsx` 1, `admin/vpn.tsx` 1, `ui/admin.tsx` 1 |

##### Component measures: the admin's screens (167 values)

The admin screens' own measures, as the plan's risks section says: one `admin` group in `controls.ts`, a key per screen, with the few the screens share (`admin.measure`, `admin.table.cellX`, `admin.filterWidth` and the like) at the group's top. The skeletons' heights and widths are one `admin.skeleton` scale, since every screen's loading state repeats them.

| Token | Value | Where it lives | Values | Used by |
| --- | --- | --- | --- | --- |
| `admin.activity.blockReasonWidth` | 320 | `controls.ts` `admin` | 1 | `admin/activity.tsx` 1 |
| `admin.activity.reasonWidth` | 288 | `controls.ts` `admin` | 1 | `admin/activity.tsx` 1 |
| `admin.appearance.editorFieldsWidth` | 320 | `controls.ts` `admin` | 1 | `admin/appearance.tsx` 1 |
| `admin.appearance.hexWidth` | 128 | `controls.ts` `admin` | 1 | `admin/appearance.tsx` 1 |
| `admin.appearance.previewMark` | 28 | `controls.ts` `admin` | 1 | `admin/appearance.tsx` 1 |
| `admin.appearance.previewWidth` | 256 | `controls.ts` `admin` | 1 | `admin/appearance.tsx` 1 |
| `admin.appearance.sampleMark` | 22 | `controls.ts` `admin` | 1 | `admin/appearance.tsx` 1 |
| `admin.appearance.suggestedAccent` | #8fbfb7 | `controls.ts` `admin` | 2 | `admin/appearance.tsx` 2 |
| `admin.authCard.cardWidth` | 384 | `controls.ts` `admin` | 1 | `admin/auth-card.tsx` 1 |
| `admin.collections.art` | 56 | `controls.ts` `admin` | 1 | `admin/collections.tsx` 1 |
| `admin.collectionsEditor.artwork.column` | 160 | `controls.ts` `admin` | 1 | `admin/collections-editor.tsx` 1 |
| `admin.collectionsEditor.artwork.poster` | 112 | `controls.ts` `admin` | 1 | `admin/collections-editor.tsx` 1 |
| `admin.collectionsEditor.cell` | 64 | `controls.ts` `admin` | 1 | `admin/collections-editor.tsx` 1 |
| `admin.collectionsEditor.result.maxWidth` | 352 | `controls.ts` `admin` | 1 | `admin/collections-editor.tsx` 1 |
| `admin.collectionsEditor.result.minWidth` | 288 | `controls.ts` `admin` | 1 | `admin/collections-editor.tsx` 1 |
| `admin.collectionsRules.columns.field` | 192 | `controls.ts` `admin` | 1 | `admin/collections-rules.tsx` 1 |
| `admin.collectionsRules.columns.op` | 160 | `controls.ts` `admin` | 1 | `admin/collections-rules.tsx` 1 |
| `admin.collectionsRules.matchWidth` | 96 | `controls.ts` `admin` | 1 | `admin/collections-rules.tsx` 1 |
| `admin.curation.reachWidth` | 192 | `controls.ts` `admin` | 1 | `admin/curation.tsx` 1 |
| `admin.curation.sampleWidth` | 36 | `controls.ts` `admin` | 1 | `admin/curation.tsx` 1 |
| `admin.curationFrame.maxWidth` | 448 | `controls.ts` `admin` | 1 | `admin/curation-frame.tsx` 1 |
| `admin.curationFrame.panel` | 320 | `controls.ts` `admin` | 1 | `admin/curation-frame.tsx` 1 |
| `admin.curationFrame.spot.max` | 320 | `controls.ts` `admin` | 1 | `admin/curation-frame.tsx` 1 |
| `admin.curationFrame.spot.min` | 224 | `controls.ts` `admin` | 1 | `admin/curation-frame.tsx` 1 |
| `admin.curationPreview.bezel` | 12 | `controls.ts` `admin` | 1 | `admin/curation-preview.tsx` 1 |
| `admin.curationPreview.deviceCorner` | 56 | `controls.ts` `admin` | 1 | `admin/curation-preview.tsx` 1 |
| `admin.curationPreview.platformWidth` | 160 | `controls.ts` `admin` | 1 | `admin/curation-preview.tsx` 1 |
| `admin.curationPreview.screenCorner` | 44 | `controls.ts` `admin` | 1 | `admin/curation-preview.tsx` 1 |
| `admin.curationSection.thumb` | 40 | `controls.ts` `admin` | 1 | `admin/curation-section.tsx` 1 |
| `admin.curationSection.thumbSmall` | 32 | `controls.ts` `admin` | 1 | `admin/curation-section.tsx` 1 |
| `admin.curationShared.formWidth` | 448 | `controls.ts` `admin` | 1 | `admin/curation-shared.tsx` 1 |
| `admin.downloads.categoryWidth` | 176 | `controls.ts` `admin` | 1 | `admin/downloads.tsx` 1 |
| `admin.downloads.priorityWidth` | 160 | `controls.ts` `admin` | 1 | `admin/downloads.tsx` 1 |
| `admin.downloads.sheetWidth` | 640 | `controls.ts` `admin` | 1 | `admin/downloads.tsx` 1 |
| `admin.filterWidth` | 192 | `controls.ts` `admin` | 2 | `admin/library.tsx` 1, `admin/shows-library.tsx` 1 |
| `admin.general.keyIdWidth` | 192 | `controls.ts` `admin` | 1 | `admin/general.tsx` 1 |
| `admin.general.logLevelWidth` | 288 | `controls.ts` `admin` | 1 | `admin/general.tsx` 1 |
| `admin.import.choice` | 176 | `controls.ts` `admin` | 2 | `admin/import.tsx` 1, `admin/library-import.tsx` 1 |
| `admin.import.movie` | 240 | `controls.ts` `admin` | 2 | `admin/import.tsx` 1, `admin/library-import.tsx` 1 |
| `admin.import.name` | 288 | `controls.ts` `admin` | 2 | `admin/import.tsx` 1, `admin/library-import.tsx` 1 |
| `admin.indexers.bullet` | 20 | `controls.ts` `admin` | 1 | `admin/indexers.tsx` 1 |
| `admin.indexers.healthWidth` | 288 | `controls.ts` `admin` | 1 | `admin/indexers.tsx` 1 |
| `admin.indexers.languageWidth` | 176 | `controls.ts` `admin` | 1 | `admin/indexers.tsx` 1 |
| `admin.indexers.priorityWidth` | 112 | `controls.ts` `admin` | 1 | `admin/indexers.tsx` 1 |
| `admin.indexers.searchWidth` | 256 | `controls.ts` `admin` | 1 | `admin/indexers.tsx` 1 |
| `admin.lists.codeTracking` | 2 | `controls.ts` `admin` | 1 | `admin/lists.tsx` 1 |
| `admin.lists.profileWidth` | 224 | `controls.ts` `admin` | 1 | `admin/lists.tsx` 1 |
| `admin.measure` | 600 | `controls.ts` `admin` | 4 | `admin/collection.tsx` 1, `admin/media-sections.tsx` 1, `admin/person.tsx` 1, `admin/setup.tsx` 1 |
| `admin.mediaSections.crewPhoto.width` | 28 | `controls.ts` `admin` | 1 | `admin/media-sections.tsx` 1 |
| `admin.mediaSections.posterBlock` | 112 | `controls.ts` `admin` | 1 | `admin/media-sections.tsx` 1 |
| `admin.mediaSections.posterColumn` | 160 | `controls.ts` `admin` | 1 | `admin/media-sections.tsx` 1 |
| `admin.mediaSections.sideColumn` | 320 | `controls.ts` `admin` | 1 | `admin/media-sections.tsx` 1 |
| `admin.movieDetail.factBasis` | 96 | `controls.ts` `admin` | 1 | `admin/movie-detail.tsx` 1 |
| `admin.movieDetail.labelWidth` | 64 | `controls.ts` `admin` | 2 | `admin/movie-detail.tsx` 2 |
| `admin.movieDetail.languageWidth` | 224 | `controls.ts` `admin` | 1 | `admin/movie-detail.tsx` 1 |
| `admin.movieDetail.tableCellMaxWidth` | 10000 | `controls.ts` `admin` | 1 | `admin/movie-detail.tsx` 1 |
| `admin.nowPlaying.posterWidth` | 64 | `controls.ts` `admin` | 1 | `admin/now-playing.tsx` 1 |
| `admin.nowPlaying.selectWidth` | 176 | `controls.ts` `admin` | 1 | `admin/now-playing.tsx` 1 |
| `admin.person.departmentWidth` | 192 | `controls.ts` `admin` | 1 | `admin/person.tsx` 1 |
| `admin.person.libraryColumn` | 160 | `controls.ts` `admin` | 1 | `admin/person.tsx` 1 |
| `admin.progressWidth` | 160 | `controls.ts` `admin` | 2 | `admin/activity.tsx` 1, `admin/downloads.tsx` 1 |
| `admin.search.basis` | 256 | `controls.ts` `admin` | 1 | `admin/discover-shows.tsx` 1 |
| `admin.search.maxWidth` | 576 | `controls.ts` `admin` | 1 | `admin/discover-shows.tsx` 1 |
| `admin.security.fieldWidth` | 192 | `controls.ts` `admin` | 1 | `admin/security.tsx` 1 |
| `admin.selectWidth` | 144 | `controls.ts` `admin` | 2 | `admin/library.tsx` 1, `admin/shows-library.tsx` 1 |
| `admin.setup.header` | 56 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.setup.labelWidth` | 160 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.setup.listHeight` | 256 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.setup.moreWidth` | 224 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.setup.pageWidth` | 960 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.setup.portWidth` | 112 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.setup.rowHeight` | 36 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.shell.main.x` | 26 | `controls.ts` `admin` | 1 | `admin/shell.tsx` 1 |
| `admin.shell.main.y` | 22 | `controls.ts` `admin` | 1 | `admin/shell.tsx` 1 |
| `admin.shell.skipLinkOffset` | 80 | `controls.ts` `admin` | 1 | `admin/shell.tsx` 1 |
| `admin.showDetail.monitoredColumn` | 56 | `controls.ts` `admin` | 1 | `admin/show-detail.tsx` 1 |
| `admin.showDetail.numberColumn` | 40 | `controls.ts` `admin` | 1 | `admin/show-detail.tsx` 1 |
| `admin.showDetail.searchColumn` | 48 | `controls.ts` `admin` | 1 | `admin/show-detail.tsx` 1 |
| `admin.showDetail.statusMinWidth` | 96 | `controls.ts` `admin` | 1 | `admin/show-detail.tsx` 1 |
| `admin.showDetail.titleMaxWidth` | 320 | `controls.ts` `admin` | 1 | `admin/show-detail.tsx` 1 |
| `admin.showsLibrary.episodesWidth` | 144 | `controls.ts` `admin` | 1 | `admin/shows-library.tsx` 1 |
| `admin.sideColumn` | 208 | `controls.ts` `admin` | 2 | `admin/settings.tsx` 1, `admin/setup.tsx` 1 |
| `admin.skeleton.block` | 96 | `controls.ts` `admin` | 2 | `admin/setup.tsx` 2 |
| `admin.skeleton.card` | 128 | `controls.ts` `admin` | 2 | `admin/account.tsx` 2 |
| `admin.skeleton.field` | 40 | `controls.ts` `admin` | 7 | `admin/account.tsx` 2, `admin/links.tsx` 2, `admin/login.tsx` 2, `admin/widgets.tsx` 1 |
| `admin.skeleton.heading` | 28 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.skeleton.headingLarge` | 32 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.skeleton.item` | 64 | `controls.ts` `admin` | 2 | `admin/setup.tsx` 2 |
| `admin.skeleton.line` | 20 | `controls.ts` `admin` | 2 | `admin/setup.tsx` 1, `admin/system.tsx` 1 |
| `admin.skeleton.panel` | 160 | `controls.ts` `admin` | 1 | `admin/setup.tsx` 1 |
| `admin.skeleton.row` | 48 | `controls.ts` `admin` | 3 | `admin/loadable.tsx` 1, `admin/movie-detail.tsx` 2 |
| `admin.skeleton.title` | 24 | `controls.ts` `admin` | 3 | `admin/links.tsx` 1, `admin/login.tsx` 1, `admin/widgets.tsx` 1 |
| `admin.skeleton.width.lg` | 192 | `controls.ts` `admin` | 1 | `admin/links.tsx` 1 |
| `admin.skeleton.width.md` | 160 | `controls.ts` `admin` | 2 | `admin/login.tsx` 1, `admin/system.tsx` 1 |
| `admin.skeleton.width.sm` | 96 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.skeleton.width.xl` | 256 | `controls.ts` `admin` | 2 | `admin/setup.tsx` 1, `admin/widgets.tsx` 1 |
| `admin.subtitles.addWidth` | 224 | `controls.ts` `admin` | 1 | `admin/subtitles.tsx` 1 |
| `admin.subtitles.formWidth` | 672 | `controls.ts` `admin` | 1 | `admin/subtitles.tsx` 1 |
| `admin.subtitles.leftWidth` | 224 | `controls.ts` `admin` | 1 | `admin/subtitles.tsx` 1 |
| `admin.subtitles.ruleWidth` | 192 | `controls.ts` `admin` | 1 | `admin/subtitles.tsx` 1 |
| `admin.subtitles.short` | 128 | `controls.ts` `admin` | 1 | `admin/subtitles.tsx` 1 |
| `admin.summaryPoster.above` | 128 | `controls.ts` `admin` | 2 | `admin/collection.tsx` 1, `admin/media-sections.tsx` 1 |
| `admin.summaryPoster.beside` | 144 | `controls.ts` `admin` | 2 | `admin/collection.tsx` 1, `admin/media-sections.tsx` 1 |
| `admin.system.eventTime` | 80 | `controls.ts` `admin` | 1 | `admin/system.tsx` 1 |
| `admin.system.levelWidth` | 208 | `controls.ts` `admin` | 1 | `admin/system.tsx` 1 |
| `admin.system.measure` | 800 | `controls.ts` `admin` | 2 | `admin/system.tsx` 2 |
| `admin.system.narrow` | 640 | `controls.ts` `admin` | 1 | `admin/system.tsx` 1 |
| `admin.system.searchWidth` | 256 | `controls.ts` `admin` | 1 | `admin/system.tsx` 1 |
| `admin.system.stateWidth` | 176 | `controls.ts` `admin` | 1 | `admin/system.tsx` 1 |
| `admin.table.cellX` | 14 | `controls.ts` `admin` | 4 | `admin/library.tsx` 1, `admin/person.tsx` 1, `admin/show-detail.tsx` 1, `admin/shows-library.tsx` 1 |
| `admin.table.checkColumn` | 40 | `controls.ts` `admin` | 2 | `admin/library.tsx` 1, `admin/shows-library.tsx` 1 |
| `admin.twoFactor.qr` | 176 | `controls.ts` `admin` | 1 | `admin/two-factor.tsx` 1 |
| `admin.users.toolbarField` | 224 | `controls.ts` `admin` | 1 | `admin/users.tsx` 1 |
| `admin.vpn.labelWidth` | 128 | `controls.ts` `admin` | 1 | `admin/vpn.tsx` 1 |
| `admin.wanted.day.minHeight` | 96 | `controls.ts` `admin` | 1 | `admin/wanted.tsx` 1 |
| `admin.wanted.dot` | 10 | `controls.ts` `admin` | 2 | `admin/wanted.tsx` 2 |
| `admin.wanted.monthLabel` | 160 | `controls.ts` `admin` | 1 | `admin/wanted.tsx` 1 |
| `admin.wanted.timeColumn` | 56 | `controls.ts` `admin` | 1 | `admin/wanted.tsx` 1 |
| `admin.widgets.calendarCell` | 28 | `controls.ts` `admin` | 2 | `admin/widgets.tsx` 2 |
| `admin.widgets.dot` | 6 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.widgets.dotSmall` | 4 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.widgets.graphMin` | 48 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.widgets.legendSwatch` | 8 | `controls.ts` `admin` | 2 | `admin/widgets.tsx` 2 |
| `admin.widgets.metaMax` | 160 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.widgets.poster` | 32 | `controls.ts` `admin` | 2 | `admin/widgets.tsx` 2 |
| `admin.widgets.progressColumn` | 160 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.widgets.speedColumn` | 64 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |
| `admin.widgets.storageBar` | 8 | `controls.ts` `admin` | 1 | `admin/widgets.tsx` 1 |

##### Component measures: one visually hidden style (17 values)

Six files copy the visually hidden technique (a 1 × 1 box, −1 margin, clipped) that `ui/hidden-heading.tsx` writes. They'd draw one shared `visuallyHidden` style from the library instead of a token, and its three values stay listed in `hidden-heading.tsx` only:

`admin/profiles.tsx` 3, `admin/widgets.tsx` 3, `ui/admin.tsx` 2, `ui/command-palette.tsx` 3, `ui/sheet.tsx` 3, `ui/table.tsx` 3.

##### Named constants the check doesn't read (11)

| Token | Value | Where it lives | Now |
| --- | --- | --- | --- |
| `scrollbar.inset` | 6 | `scales.ts` `scrollbar`, documented in spacing-layout.md | `ui/shared/scrollbar.ts`, `SCROLLBAR.inset` |
| `scrollbar.handle` | 6 | `scales.ts` `scrollbar`, documented in spacing-layout.md | `ui/shared/scrollbar.ts`, `SCROLLBAR.handle` |
| `scrollbar.handleActive` | 8 | `scales.ts` `scrollbar`, documented in spacing-layout.md | `ui/shared/scrollbar.ts`, `SCROLLBAR.handleActive` |
| `scrollbar.reach` | 8 | `scales.ts` `scrollbar`, documented in spacing-layout.md | `ui/shared/scrollbar.ts`, `SCROLLBAR.reach` |
| `scrollbar.minThumb` | 32 | `scales.ts` `scrollbar`, documented in spacing-layout.md | `ui/shared/scrollbar.ts`, `SCROLLBAR.minThumb` |
| `scrollbar.alpha` | 0.45 | `scales.ts` `scrollbar`, documented in spacing-layout.md | `ui/shared/scrollbar.ts`, `SCROLLBAR.alpha` |
| `scrollbar.alphaActive` | 0.7 | `scales.ts` `scrollbar`, documented in spacing-layout.md | `ui/shared/scrollbar.ts`, `SCROLLBAR.alphaActive` |
| `hover.posterScale` | 1.02 | `motion.ts` `hover`, beside `focus`, documented in motion.md | `lift.ts`'s `POINTER_POSTER_SCALE` |
| `hover.photoScale` | 1.05 | `motion.ts` `hover`, beside `focus`, documented in motion.md | `page-parts.tsx`'s `PHOTO_LIFT` |
| `hover.brightness.soft` | 1.08 | `motion.ts` `hover`, beside `focus`, documented in motion.md | `lift.ts`'s `HOVER_BRIGHTNESS.soft` |
| `hover.brightness.strong` | 1.1 | `motion.ts` `hover`, beside `focus`, documented in motion.md | `lift.ts`'s `HOVER_BRIGHTNESS.strong` |

`SCROLLBAR.page` (0.875) stays a constant, as the plan says.

#### Each value against its token (895)

Per family, then per file: the value as written, the token it moves onto, and how many times. Files under `admin/` and `docs/` aren't read by the check yet; everything else is one of the 548 in `scripts/one-place-exceptions.json`.

- **Line widths** (134: 47 excepted, 87 admin, 0 guides)
  - `admin/account.tsx` (2): 1 → `line.thin` ×2
  - `admin/appearance.tsx` (5): 1 → `line.thin` ×5
  - `admin/auth-card.tsx` (2): 1 → `line.thin` ×2
  - `admin/collection-art.tsx` (1): 1 → `line.thin`
  - `admin/collection.tsx` (1): 1 → `line.thin`
  - `admin/collections-editor.tsx` (3): 1 → `line.thin` ×3
  - `admin/collections-rules.tsx` (2): 2 → `line.thick`; 1 → `line.thin`
  - `admin/collections.tsx` (1): 1 → `line.thin`
  - `admin/curation-frame.tsx` (2): 1 → `line.thin` ×2
  - `admin/curation-section.tsx` (1): 1 → `line.thin`
  - `admin/curation-shared.tsx` (2): 1 → `line.thin` ×2
  - `admin/curation.tsx` (1): 1 → `line.thin`
  - `admin/dashboard.tsx` (1): 1 → `line.thin`
  - `admin/downloads.tsx` (3): 1 → `line.thin` ×3
  - `admin/general.tsx` (2): 1 → `line.thin` ×2
  - `admin/indexers.tsx` (3): 1 → `line.thin` ×3
  - `admin/library-import.tsx` (1): 1 → `line.thin`
  - `admin/library.tsx` (1): 1 → `line.thin`
  - `admin/lists.tsx` (1): 1 → `line.thin`
  - `admin/media-management.tsx` (2): 1 → `line.thin` ×2
  - `admin/media-sections.tsx` (1): 1 → `line.thin`
  - `admin/movie-detail.tsx` (2): 1 → `line.thin` ×2
  - `admin/now-playing.tsx` (2): 1 → `line.thin` ×2
  - `admin/playback.tsx` (2): 1 → `line.thin` ×2
  - `admin/quality-editors.tsx` (1): 1 → `line.thin`
  - `admin/settings-card.tsx` (2): 1 → `line.thin` ×2
  - `admin/settings.tsx` (2): 1 → `line.thin` ×2
  - `admin/setup.tsx` (8): 1 → `line.thin` ×8
  - `admin/shows-library.tsx` (1): 1 → `line.thin`
  - `admin/subtitles.tsx` (2): 1 → `line.thin` ×2
  - `admin/system.tsx` (7): 1 → `line.thin` ×7
  - `admin/tag-settings.tsx` (1): 1 → `line.thin`
  - `admin/users.tsx` (2): 1 → `line.thin` ×2
  - `admin/vpn.tsx` (7): 1 → `line.thin` ×7
  - `admin/wanted.tsx` (9): 1 → `line.thin` ×9
  - `admin/widgets.tsx` (1): 1 → `line.thin`
  - `client/player/parts.tsx` (4): 1 → `line.thin` ×4
  - `client/player/pointer.tsx` (1): 1 → `line.thin`
  - `client/player/tv.tsx` (1): 1 → `line.thin`
  - `ui/admin.tsx` (7): 1 → `line.thin` ×7
  - `ui/badge.tsx` (2): 1 → `line.thin` ×2
  - `ui/banner.tsx` (1): 1 → `line.thin`
  - `ui/button.tsx` (1): 1 → `line.thin`
  - `ui/chip.tsx` (1): 1 → `line.thin`
  - `ui/command-palette.tsx` (1): 1 → `line.thin`
  - `ui/field.tsx` (1): 1 → `line.thin`
  - `ui/letter-index.tsx` (1): 2 → `line.thick`
  - `ui/menu.tsx` (2): 1 → `line.thin` ×2
  - `ui/page-parts.tsx` (1): 1 → `line.thin`
  - `ui/poster.tsx` (3): 1 → `line.thin` ×3
  - `ui/segmented.tsx` (3): 2 → `line.thick`; -1 → `line.thin`; 1 → `line.thin`
  - `ui/sheet.tsx` (1): 1 → `line.thin`
  - `ui/sortable-list.tsx` (1): 1 → `line.thin`
  - `ui/stepper.tsx` (1): 1 → `line.thin`
  - `ui/table.tsx` (4): 1 → `line.thin` ×4
  - `ui/toaster.tsx` (1): 1 → `line.thin`
  - `ui/toggle.tsx` (1): 1 → `line.thin`
  - `ui/widget-editor.web.tsx` (5): 2 → `line.thick` ×2; -1 → `line.thin` ×2; 1 → `line.thin`
  - `ui/widget.tsx` (3): 2 → `line.thick` ×2; 1 → `line.thin`
- **The TV's spaces in units** (109: 109 excepted, 0 admin, 0 guides)
  - `client/music-player/now-playing-tv.tsx` (21): 0.1 → `tv.space.0.5`; 0.2 → `tv.space.1` ×2; 0.3 → `tv.space.1.5` ×2; 0.4 → `tv.space.2` ×2; 0.5 → `tv.space.2.5`; 0.6 → `tv.space.3` ×4; 0.7 → `tv.space.3.5`; 0.8 → `tv.space.4` ×2; 1 → `tv.space.5` ×2; 1.2 → `tv.space.6` ×2; 1.6 → `tv.space.8`; 4 → `tv.space.20`
  - `client/player/parts.tsx` (5): 0.8 → `tv.space.4`; 1.4 → `tv.space.7` ×2; 1.6 → `tv.space.8`; 2.4 → `tv.space.12`
  - `client/player/tv.tsx` (18): 0.2 → `tv.space.1`; 0.3 → `tv.space.1.5`; 0.5 → `tv.space.2.5`; 0.6 → `tv.space.3` ×2; 0.7 → `tv.space.3.5`; 1 → `tv.space.5` ×6; 1.2 → `tv.space.6` ×2; 1.4 → `tv.space.7`; 1.6 → `tv.space.8` ×2; 4 → `tv.space.20`
  - `ui/badge.tsx` (5): 0.1 → `tv.space.0.5`; 0.31 → `tv.space.1.5`; 0.4 → `tv.space.2` ×2; 0.6 → `tv.space.3`
  - `ui/featured-card.tsx` (2): 0.2 → `tv.space.1`; 0.8 → `tv.space.4`
  - `ui/film-row.tsx` (14): 0.2 → `tv.space.1`; 0.4 → `tv.space.2`; 0.5 → `tv.space.2.5`; 0.6 → `tv.space.3`; 0.7 → `tv.space.3.5`; 0.8 → `tv.space.4` ×2; 1 → `tv.space.5` ×3; 1.2 → `tv.space.6` ×3; 1.4 → `tv.space.7`
  - `ui/notice-card.tsx` (4): 0.6 → `tv.space.3`; 0.8 → `tv.space.4`; 1.2 → `tv.space.6`; 1.6 → `tv.space.8`
  - `ui/page-parts.tsx` (8): 0.2 → `tv.space.1`; 0.5 → `tv.space.2.5`; 0.6 → `tv.space.3`; 0.7 → `tv.space.3.5`; 0.9 → `tv.space.4.5` ×2; 1.2 → `tv.space.6`; 1.6 → `tv.space.8`
  - `ui/rating.tsx` (1): 0.31 → `tv.space.1.5`
  - `ui/row.tsx` (2): 0.8 → `tv.space.4`; 1 → `tv.space.5`
  - `ui/toast.tsx` (3): 0.2 → `tv.space.1`; 0.8 → `tv.space.4`; 1.2 → `tv.space.6`
  - `ui/tv/cards.tsx` (10): 0.3 → `tv.space.1.5`; 0.4 → `tv.space.2`; 0.6 → `tv.space.3` ×2; 1 → `tv.space.5`; 1.2 → `tv.space.6`; 1.4 → `tv.space.7` ×2; 2.4 → `tv.space.12` ×2
  - `ui/tv/controls.tsx` (4): 0.6 → `tv.space.3`; 1 → `tv.space.5` ×2; 1.4 → `tv.space.7`
  - `ui/tv/detail.tsx` (4): 0.8 → `tv.space.4`; 1.6 → `tv.space.8`; 2.4 → `tv.space.12` ×2
  - `ui/tv/head.tsx` (3): 0.6 → `tv.space.3` ×2; 1.4 → `tv.space.7`
  - `ui/tv/page.tsx` (3): 1.2 → `tv.space.6`; 1.6 → `tv.space.8`; 2 → `tv.space.10`
  - `ui/tv/tiles.tsx` (2): 0.9 → `tv.space.4.5`; 1 → `tv.space.5`
- **Type off the scales** (40: 37 excepted, 3 admin, 0 guides)
  - `admin/collections-editor.tsx` (1): 11 → `webText.label.size`
  - `admin/setup.tsx` (1): 1 → `adminText.ui.size`
  - `admin/widgets.tsx` (1): 12 → `adminText.figure.size`
  - `client/music-player/bar.tsx` (2): 12 → `adminText.figure.size` ×2
  - `client/music-player/mini.tsx` (2): 13 → `adminText.ui.size`; 15 → `mobileText.subheadline`
  - `client/music-player/now-playing.tsx` (6): 13 → `adminText.ui.size`; 12 → `mobileText.caption.size` ×2; 18 → `mobileText.headline`; 22 → `mobileText.title.size`; 11 → `webText.label.size`
  - `client/music-player/parts.tsx` (1): 12 → `adminText.figure.size`
  - `client/player/touch.tsx` (5): 13 → `adminText.ui.size`; 12 → `mobileText.caption.size` ×2; 17 → `mobileText.headline` ×2
  - `client/player/tv.tsx` (1): 2.2 → `tvText.title`
  - `ui/admin.tsx` (4): 11 → `webText.label.size` ×4
  - `ui/badge.tsx` (3): 0.03 → `tracking.tag`; 0.44 → `tracking.tag`; 11 → `webText.label.size`
  - `ui/command-palette.tsx` (1): 13.5 → `adminText.ui.size`
  - `ui/featured-card.tsx` (1): 1.05 → `tvText.meta.size`
  - `ui/film-row.tsx` (1): 1.05 → `tvText.meta.size`
  - `ui/letter-index.tsx` (1): 11 → `webText.label.size`
  - `ui/section-heading.tsx` (1): 17 → `mobileText.headline`
  - `ui/segmented.tsx` (1): 11 → `webText.label.size`
  - `ui/stepper.tsx` (1): 11 → `webText.label.size`
  - `ui/tv/cards.tsx` (2): 2.2 → `tvText.title`; 2.4 → `tvText.title`
  - `ui/tv/controls.tsx` (1): 2.4 → `tvText.title`
  - `ui/waveform.tsx` (1): 11 → `webText.label.size`
  - `ui/widget-editor.web.tsx` (1): 11 → `webText.label.size`
  - `ui/widget.tsx` (1): 12 → `adminText.figure.size`
- **Icons** (72: 27 excepted, 45 admin, 0 guides)
  - `admin/activity.tsx` (1): 14 → `icon.size.xs`
  - `admin/add-dialog.tsx` (1): 14 → `icon.size.xs`
  - `admin/appearance.tsx` (1): 14 → `icon.size.xs`
  - `admin/auth-card.tsx` (2): 1 → `icon.drop`; 16 → `icon.size.sm`
  - `admin/curation-preview.tsx` (2): 1 → `icon.drop`; 14 → `icon.size.xs`
  - `admin/curation.tsx` (1): 18 → `icon.size.md`
  - `admin/dashboard.tsx` (1): 16 → `icon.size.sm`
  - `admin/discover-shows.tsx` (1): 11 → `icon.size.2xs`
  - `admin/discover.tsx` (1): 11 → `icon.size.2xs`
  - `admin/download-categories.tsx` (1): 16 → `icon.size.sm`
  - `admin/downloads.tsx` (1): 16 → `icon.size.sm`
  - `admin/login.tsx` (1): 16 → `icon.size.sm`
  - `admin/media-management.tsx` (1): 16 → `icon.size.sm`
  - `admin/media-sections.tsx` (3): 12 → `icon.size.2xs` ×2; 14 → `icon.size.xs`
  - `admin/movie-detail.tsx` (3): 1 → `icon.drop`; 14 → `icon.size.xs` ×2
  - `admin/now-playing.tsx` (2): 14 → `icon.size.xs` ×2
  - `admin/playback.tsx` (3): 20 → `icon.size.md`; 16 → `icon.size.sm` ×2
  - `admin/quality-editors.tsx` (1): 16 → `icon.size.sm`
  - `admin/security.tsx` (1): 14 → `icon.size.xs`
  - `admin/settings-columns.tsx` (2): 12 → `icon.size.2xs`; 14 → `icon.size.xs`
  - `admin/settings.tsx` (3): 12 → `icon.size.2xs`; 18 → `icon.size.md`; 16 → `icon.size.sm`
  - `admin/setup.tsx` (4): 1 → `icon.drop`; 16 → `icon.size.sm`; 14 → `icon.size.xs` ×2
  - `admin/system.tsx` (2): 18 → `icon.size.md`; 14 → `icon.size.xs`
  - `admin/users.tsx` (2): 16 → `icon.size.sm` ×2
  - `admin/vpn.tsx` (3): 20 → `icon.size.md`; 16 → `icon.size.sm`; 14 → `icon.size.xs`
  - `admin/widgets.tsx` (1): 12 → `icon.size.2xs`
  - `client/desktop/window.tsx` (1): 14 → `icon.size.xs`
  - `client/music-player/now-playing-tv.tsx` (1): 1.6 → `icon.sizeTv.max`
  - `client/music-player/now-playing.tsx` (2): 16 → `icon.size.sm` ×2
  - `client/player/parts.tsx` (1): 14 → `icon.size.xs`
  - `client/player/touch.tsx` (1): 20 → `icon.size.md`
  - `client/player/tv.tsx` (2): 1.2 → `icon.sizeTv.min` ×2
  - `ui/admin.tsx` (2): 16 → `icon.size.sm` ×2
  - `ui/badge.tsx` (1): 12 → `icon.size.2xs`
  - `ui/banner.tsx` (2): 32 → `icon.disc.sm` ×2
  - `ui/empty-state.tsx` (6): 56 → `icon.disc.lg`; 44 → `icon.disc.md`; 32 → `icon.disc.sm` ×2; 20 → `icon.size.md`; 16 → `icon.size.sm`
  - `ui/notice-card.tsx` (1): 0.2 → `icon.dropTv`
  - `ui/stepper.tsx` (1): 12 → `icon.size.2xs`
  - `ui/toaster.tsx` (3): 32 → `icon.disc.sm` ×2; 16 → `icon.size.sm`
  - `ui/waveform.tsx` (1): 14 → `icon.size.xs`
  - `ui/widget-editor.web.tsx` (1): 16 → `icon.size.sm`
  - `ui/widget.tsx` (1): 16 → `icon.size.sm`
- **Overlays over art** (33: 32 excepted, 1 admin, 0 guides)
  - `admin/collection-art.tsx` (1): rgba(255, 255, 255, 0.04) → `art.edge`
  - `client/music-player/bar.tsx` (1): rgba(0,0,0,0.5) → `art.alpha.50`
  - `client/music-player/now-playing-tv.tsx` (2): rgba(0,0,0,0.5) → `art.alpha.50`; 1.1 → `art.backdropScale`
  - `client/music-player/now-playing.tsx` (1): rgba(0,0,0,0.45) → `art.alpha.50`
  - `client/music/sizes.ts` (1): #000000 → `art.black`
  - `client/player/parts.tsx` (3): rgba(0,0,0,0.6) → `art.alpha.60`; rgba(0,0,0,0.72) → `art.alpha.70`; rgba(11,11,12,0.62) → `art.glass`
  - `client/player/picture.web.tsx` (1): rgba(0,0,0,0.6) → `art.alpha.60`
  - `client/player/pointer.tsx` (4): rgba(0,0,0,0.7) → `art.alpha.70`; rgba(0,0,0,0.75) → `art.alpha.80`; #000 → `art.black` ×2
  - `client/player/touch.tsx` (3): rgba(0,0,0,0.45) → `art.alpha.50`; rgba(237,237,238,0.8) → `art.alpha.80`; #000 → `art.black`
  - `client/player/tv.tsx` (3): rgba(0,0,0,0.7) → `art.alpha.70`; rgba(0,0,0,0.8) → `art.alpha.80`; #000 → `art.black`
  - `ui/featured-card.tsx` (2): rgba(0,0,0,0.6) → `art.alpha.60`; rgba(0,0,0,0.7) → `art.alpha.70`
  - `ui/film-row.tsx` (3): rgba(0,0,0,0.65) → `art.alpha.70`; rgba(0,0,0,…) → `art.black` ×2
  - `ui/glass.ts` (1): rgba(11,11,12,0.62) → `art.glass`
  - `ui/page-parts.tsx` (2): rgba(0, 0, 0, 0.35) → `art.alpha.35` ×2
  - `ui/poster.tsx` (1): rgba(255,255,255,0.04) → `art.edge`
  - `ui/tv/cards.tsx` (1): rgba(0,0,0,0.72) → `art.alpha.70`
  - `ui/tv/focusable.tsx` (1): rgba(0, 0, 0, …) → `art.black`
  - `ui/tv/page.tsx` (2): 1.1 → `art.backdropScale`; alpha(#000000, 0.55) → `art.black`
- **Component measures: onto tokens that exist** (57: 46 excepted, 11 admin, 0 guides)
  - `admin/appearance.tsx` (3): #d6cfc2 → `theme.colors.accent` ×2; #a2a2a7 → `theme.colors.text-3`
  - `admin/curation-preview.tsx` (1): 2 → `space.0.5`
  - `admin/import.tsx` (1): 2 → `space.0.5`
  - `admin/library-import.tsx` (1): 2 → `space.0.5`
  - `admin/links.tsx` (1): 36 → `controlGeometry.md.height`
  - `admin/login.tsx` (1): 36 → `controlGeometry.md.height`
  - `admin/widgets.tsx` (3): 2 → `space.0.5` ×3
  - `client/music-player/now-playing-tv.tsx` (2): 0.1 → `radius.pill`; 0.15 → `radius.pill`
  - `client/player/parts.tsx` (14): 12 → `radius.md`; 10 → `radius.pill`; 2 → `radius.pill` ×2; 999 → `radius.pill`; 8 → `space.2` ×2; 12 → `space.3`; 16 → `space.4` ×3; 24 → `space.6`; 44 → `targets.touch` ×2
  - `client/player/picture.tsx` (2): 44 → `targets.touch` ×2
  - `client/player/picture.web.tsx` (1): #ededee → `theme.colors.text`
  - `client/player/pointer.tsx` (8): 3 → `radius.pill` ×2; 40 → `radius.pill`; 16 → `space.4` ×4; 24 → `targets.pointer`
  - `client/player/touch.tsx` (5): 12 → `space.3`; 16 → `space.4` ×3; 24 → `space.6`
  - `client/player/tv.tsx` (4): 0.7 → `radius.pill`; 3 → `radius.pill`; 0.5 → `tv.radius.button`; 0.3 → `tv.radius.pill`
  - `ui/badge.tsx` (1): 0.26 → `tv.radius.pill`
  - `ui/sheet.tsx` (1): 32 → `space.8`
  - `ui/sortable-list.tsx` (1): 8 → `space.2`
  - `ui/toaster.tsx` (1): 16 → `radius.pill`
  - `ui/toggle.tsx` (1): 3 → `controlGeometry.md.inset`
  - `ui/tooltip.tsx` (1): 8 → `space.2`
  - `ui/widget-editor.web.tsx` (2): 24 → `targets.pointer` ×2
  - `ui/widget.tsx` (2): 4 → `space.1` ×2
- **Component measures: new steps on locked scales** (55: 37 excepted, 18 admin, 0 guides)
  - `admin/collections-editor.tsx` (1): 4 → `radius.2xs`
  - `admin/collections.tsx` (1): 6 → `radius.xs`
  - `admin/curation-shared.tsx` (1): 6 → `space.1.5`
  - `admin/curation.tsx` (1): 4 → `radius.2xs`
  - `admin/media-sections.tsx` (1): 4 → `radius.2xs`
  - `admin/migration.tsx` (2): 6 → `space.1.5` ×2
  - `admin/settings.tsx` (1): 6 → `space.1.5`
  - `admin/setup.tsx` (1): 4 → `radius.2xs`
  - `admin/wanted.tsx` (3): 6 → `space.1.5` ×3
  - `admin/widgets.tsx` (6): 2 → `radius.3xs`; 6 → `radius.xs`; 6 → `space.1.5` ×4
  - `client/music-player/now-playing-tv.tsx` (2): 0.6 → `tv.radius.md` ×2
  - `client/player/parts.tsx` (7): 4 → `radius.2xs` ×3; 6 → `radius.xs`; 6 → `space.1.5`; 10 → `space.2.5`; 1 → `tv.radius.panel`
  - `client/player/tv.tsx` (6): 1 → `tv.radius.panel`; 0.4 → `tv.radius.sm` ×5
  - `ui/admin.tsx` (1): 5 → `radius.2xs`
  - `ui/badge.tsx` (3): 5 → `radius.2xs`; 6 → `space.1.5` ×2
  - `ui/banner.tsx` (1): -6 → `space.1.5`
  - `ui/command-palette.tsx` (2): 6 → `space.1.5`; 10 → `space.2.5`
  - `ui/featured-card.tsx` (1): 0.6 → `tv.radius.md`
  - `ui/letter-index.tsx` (1): 4 → `radius.2xs`
  - `ui/page-parts.tsx` (1): 0.4 → `tv.radius.sm`
  - `ui/poster.tsx` (1): 10 → `space.2.5`
  - `ui/rating.tsx` (1): 6 → `space.1.5`
  - `ui/row.tsx` (1): 10 → `space.2.5`
  - `ui/sortable-list.tsx` (2): 6 → `radius.xs`; 10 → `space.2.5`
  - `ui/tooltip.tsx` (1): 6 → `space.1.5`
  - `ui/tv/cards.tsx` (2): 1 → `tv.radius.panel` ×2
  - `ui/tv/detail.tsx` (1): 1 → `tv.radius.panel`
  - `ui/widget-editor.web.tsx` (2): 5 → `radius.2xs`; 6 → `radius.xs`
  - `ui/widget.tsx` (1): 5 → `radius.2xs`
- **Component measures: the library's and client's groups** (192: 183 excepted, 8 admin, 1 guides)
  - `admin/appearance.tsx` (1): 192 → `wrapBasis`
  - `admin/auth-card.tsx` (1): 20 → `lockup.auth`
  - `admin/curation-frame.tsx` (2): 17 → `lockup.size`; 22 → `lockup.tv`
  - `admin/import.tsx` (1): 192 → `wrapBasis`
  - `admin/library-import.tsx` (1): 192 → `wrapBasis`
  - `admin/setup.tsx` (1): 17 → `lockup.size`
  - `admin/vpn.tsx` (1): 192 → `wrapBasis`
  - `client/music-player/bar.tsx` (6): 18 → `musicPlayer.bar.icon` ×3; 17 → `musicPlayer.bar.skipIcon` ×2; 384 → `musicPlayer.queueWidth`
  - `client/music-player/mini.tsx` (2): 22 → `player.icon.md` ×2
  - `client/music-player/now-playing-tv.tsx` (14): 1.2 → `musicPlayer.tv.bars`; 2 → `musicPlayer.tv.bigIcon`; 24 → `musicPlayer.tv.cover`; 0.3 → `musicPlayer.tv.dot` ×2; 2 → `musicPlayer.tv.headCover`; 0.2 → `musicPlayer.tv.markWidth`; 0.9 → `musicPlayer.tv.pausedScale`; 5 → `musicPlayer.tv.play` ×2; 3.6 → `musicPlayer.tv.round`; 3 → `musicPlayer.tv.title`; 9 → `musicPlayer.tv.upNext`; 2.6 → `tv.head.stop`
  - `client/music-player/now-playing.tsx` (6): 1.5 → `musicPlayer.backdropScale`; 22 → `player.icon.md` ×2; 34 → `player.icon.xl` ×3
  - `client/player/parts.tsx` (22): 22 → `player.icon.md`; 18 → `player.menu.checkTouch`; 40 → `player.menu.row`; 448 → `player.message.maxWidth`; 32 → `player.scrubber.hit`; 160 → `player.scrubber.preview` ×2; 80 → `player.scrubber.preview`; 36 → `player.scrubber.previewLift`; 14 → `player.scrubber.thumb` ×2; 7 → `player.scrubber.thumb`; 10 → `player.scrubber.thumbActive`; 20 → `player.scrubber.thumbActive` ×2; 4 → `player.scrubber.track` ×2; 2 → `player.subtitle.gap`; 17 → `player.subtitle.size`; 1.8 → `player.subtitle.sizeTv`; 96 → `player.timeMinWidth`; 96 → `player.upNext.still`
  - `client/player/picture.tsx` (2): 28 → `player.icon.lg` ×2
  - `client/player/pointer.tsx` (11): 34 → `player.icon.xl`; 352 → `player.panel.width`; 40 → `player.pictureIcon`; -40 → `player.round.xl` ×2; 80 → `player.round.xl` ×3; 6 → `player.volume.track` ×2; 80 → `player.volume.width`
  - `client/player/touch.tsx` (7): 36 → `player.icon.2xl`; 28 → `player.icon.lg` ×2; 72 → `player.round.lg`; 56 → `player.round.md` ×2; 84 → `player.touch.subtitleLift`
  - `client/player/tv.tsx` (20): 0.15 → `player.tv.chipY`; 6 → `player.tv.fade`; 30 → `player.tv.next`; 14 → `player.tv.nextBottom`; 46 → `player.tv.nextChoices`; -3 → `player.tv.play` ×2; 6 → `player.tv.play` ×2; 2.6 → `player.tv.playIcon`; -7 → `player.tv.preview`; 14 → `player.tv.preview`; 1.6 → `player.tv.scrubberHit`; -0.7 → `player.tv.thumb` ×2; 1.4 → `player.tv.thumb` ×2; 0.5 → `player.tv.track`; 0.8 → `player.tv.trackFocused`; 10 → `player.tv.upNextStill`
  - `docs/site-title.tsx` (1): 17 → `lockup.size`
  - `ui/admin.tsx` (5): 320 → `searchTrigger.width`; 26 → `serverCard.mark`; 7 → `sidebar.itemY`; 160 → `statusBar.itemBasis`; 192 → `wrapBasis`
  - `ui/badge.tsx` (5): 6 → `badge.dot`; 0.4 → `badge.dotTv`; 0.95 → `badge.iconTv`; 20 → `badge.tag.height`; 1.04 → `badge.tag.heightTv`
  - `ui/brand.tsx` (2): 36 → `avatar.size`; 17 → `lockup.size`
  - `ui/command-palette.tsx` (4): 48 → `overlay.palette.field`; 360 → `overlay.palette.list`; 36 → `overlay.palette.row`; 560 → `overlay.palette.width`
  - `ui/empty-state.tsx` (3): 26 → `emptyState.icon`; 320 → `emptyState.words`; 440 → `emptyState.wordsInline`
  - `ui/featured-card.tsx` (14): 480 → `featuredCard.tagline`; 88 → `featuredCard.title.max`; 48 → `featuredCard.title.min`; 352 → `featuredCard.title.width`; 0.78 → `featuredCard.touchShare`; 40.5 → `featuredCard.tv.height`; 2.8 → `featuredCard.tv.inset`; 0.15 → `featuredCard.tv.lineY`; 1.4 → `featuredCard.tv.radius`; 16 → `featuredCard.tv.skeletonMetaWidth`; 6 → `featuredCard.tv.skeletonTitle`; 22 → `featuredCard.tv.skeletonTitleWidth`; 34 → `featuredCard.tv.words`; 608 → `featuredCard.words`
  - `ui/film-row.tsx` (7): 1.1 → `filmRow.tv.captionBottom`; 1 → `filmRow.tv.skeletonLine` ×2; 1.2 → `filmRow.tv.skeletonTitle`; 12 → `filmRow.tv.skeletonTitleWidth`; 1.6 → `filmRow.tv.title`; 1.7 → `filmRow.tv.titleLeading`
  - `ui/letter-index.tsx` (1): 12 → `letterIndex.leading`
  - `ui/menu.tsx` (2): 224 → `overlay.menu`; 288 → `overlay.popover`
  - `ui/page-parts.tsx` (4): 80 → `pageParts.namedAction`; 9 → `pageParts.tv.factLabel`; 20 → `pageParts.tv.personName`; 13 → `pageParts.tv.photo`
  - `ui/progress.tsx` (2): 4 → `progress.height`; 5 → `progress.panel`
  - `ui/rating.tsx` (1): 1.04 → `rating.starTv`
  - `ui/section-heading.tsx` (1): 28 → `sectionHeading.action`
  - `ui/sheet.tsx` (1): 56 → `sheet.header`
  - `ui/sortable-list.tsx` (3): 28 → `dragHandle` ×2; 56 → `sortableList.row`
  - `ui/sparkline.tsx` (2): 48 → `sparkline.height`; 1.5 → `sparkline.stroke`
  - `ui/stepper.tsx` (2): 22 → `stepper.disc`; 36 → `stepper.row`
  - `ui/table.tsx` (1): 36 → `table.head`
  - `ui/title-backdrop.tsx` (1): 56.25 → `tv.screenHeight`
  - `ui/toaster.tsx` (1): 420 → `overlay.toaster`
  - `ui/toggle.tsx` (2): 18 → `toggle.thumb`; 40 → `toggle.track`
  - `ui/tooltip.tsx` (1): 256 → `overlay.tooltip`
  - `ui/tv/cards.tsx` (4): 1.1 → `tvConfirm.icon`; 44 → `tvConfirm.width`; 30 → `tvMenu.column`; 40 → `tvNotice.width`
  - `ui/tv/controls.tsx` (2): 0.5 → `tvMessage.keyDot`; 46 → `tvMessage.width`
  - `ui/tv/detail.tsx` (3): 0.3 → `tvDetail.progressLine`; 11 → `tvDetail.progressWidth`; 32 → `tvDetail.sideDialog`
  - `ui/tv/head.tsx` (8): 3 → `tv.head.account`; 2.2 → `tv.head.avatar`; 0.6 → `tv.head.dot` ×2; 0.45 → `tv.head.dotOffset` ×2; 1 → `tv.head.guide`; 2.6 → `tv.head.stop`
  - `ui/tv/tiles.tsx` (3): 0.25 → `tvTiles.progress` ×2; 17 → `tvTiles.wide`
  - `ui/waveform.tsx` (1): 2 → `waveform.barMin`
  - `ui/widget-editor.web.tsx` (4): 28 → `dragHandle` ×2; 12 → `widget.resizeMark` ×2
  - `ui/widget.tsx` (3): 24 → `widget.head`; 12 → `widget.resizeMark` ×2
- **Component measures: the admin's screens** (167: 0 excepted, 167 admin, 0 guides)
  - `admin/account.tsx` (4): 128 → `admin.skeleton.card` ×2; 40 → `admin.skeleton.field` ×2
  - `admin/activity.tsx` (3): 320 → `admin.activity.blockReasonWidth`; 288 → `admin.activity.reasonWidth`; 160 → `admin.progressWidth`
  - `admin/appearance.tsx` (7): 320 → `admin.appearance.editorFieldsWidth`; 128 → `admin.appearance.hexWidth`; 28 → `admin.appearance.previewMark`; 256 → `admin.appearance.previewWidth`; 22 → `admin.appearance.sampleMark`; #8fbfb7 → `admin.appearance.suggestedAccent` ×2
  - `admin/auth-card.tsx` (1): 384 → `admin.authCard.cardWidth`
  - `admin/collection.tsx` (3): 600 → `admin.measure`; 128 → `admin.summaryPoster.above`; 144 → `admin.summaryPoster.beside`
  - `admin/collections-editor.tsx` (5): 160 → `admin.collectionsEditor.artwork.column`; 112 → `admin.collectionsEditor.artwork.poster`; 64 → `admin.collectionsEditor.cell`; 352 → `admin.collectionsEditor.result.maxWidth`; 288 → `admin.collectionsEditor.result.minWidth`
  - `admin/collections-rules.tsx` (3): 192 → `admin.collectionsRules.columns.field`; 160 → `admin.collectionsRules.columns.op`; 96 → `admin.collectionsRules.matchWidth`
  - `admin/collections.tsx` (1): 56 → `admin.collections.art`
  - `admin/curation-frame.tsx` (4): 448 → `admin.curationFrame.maxWidth`; 320 → `admin.curationFrame.panel`; 320 → `admin.curationFrame.spot.max`; 224 → `admin.curationFrame.spot.min`
  - `admin/curation-preview.tsx` (4): 12 → `admin.curationPreview.bezel`; 56 → `admin.curationPreview.deviceCorner`; 160 → `admin.curationPreview.platformWidth`; 44 → `admin.curationPreview.screenCorner`
  - `admin/curation-section.tsx` (2): 40 → `admin.curationSection.thumb`; 32 → `admin.curationSection.thumbSmall`
  - `admin/curation-shared.tsx` (1): 448 → `admin.curationShared.formWidth`
  - `admin/curation.tsx` (2): 192 → `admin.curation.reachWidth`; 36 → `admin.curation.sampleWidth`
  - `admin/discover-shows.tsx` (2): 256 → `admin.search.basis`; 576 → `admin.search.maxWidth`
  - `admin/downloads.tsx` (4): 176 → `admin.downloads.categoryWidth`; 160 → `admin.downloads.priorityWidth`; 640 → `admin.downloads.sheetWidth`; 160 → `admin.progressWidth`
  - `admin/general.tsx` (2): 192 → `admin.general.keyIdWidth`; 288 → `admin.general.logLevelWidth`
  - `admin/import.tsx` (3): 176 → `admin.import.choice`; 240 → `admin.import.movie`; 288 → `admin.import.name`
  - `admin/indexers.tsx` (5): 20 → `admin.indexers.bullet`; 288 → `admin.indexers.healthWidth`; 176 → `admin.indexers.languageWidth`; 112 → `admin.indexers.priorityWidth`; 256 → `admin.indexers.searchWidth`
  - `admin/library-import.tsx` (3): 176 → `admin.import.choice`; 240 → `admin.import.movie`; 288 → `admin.import.name`
  - `admin/library.tsx` (4): 192 → `admin.filterWidth`; 144 → `admin.selectWidth`; 14 → `admin.table.cellX`; 40 → `admin.table.checkColumn`
  - `admin/links.tsx` (4): 40 → `admin.skeleton.field` ×2; 24 → `admin.skeleton.title`; 192 → `admin.skeleton.width.lg`
  - `admin/lists.tsx` (2): 2 → `admin.lists.codeTracking`; 224 → `admin.lists.profileWidth`
  - `admin/loadable.tsx` (1): 48 → `admin.skeleton.row`
  - `admin/login.tsx` (4): 40 → `admin.skeleton.field` ×2; 24 → `admin.skeleton.title`; 160 → `admin.skeleton.width.md`
  - `admin/media-sections.tsx` (7): 600 → `admin.measure`; 28 → `admin.mediaSections.crewPhoto.width`; 112 → `admin.mediaSections.posterBlock`; 160 → `admin.mediaSections.posterColumn`; 320 → `admin.mediaSections.sideColumn`; 128 → `admin.summaryPoster.above`; 144 → `admin.summaryPoster.beside`
  - `admin/movie-detail.tsx` (7): 96 → `admin.movieDetail.factBasis`; 64 → `admin.movieDetail.labelWidth` ×2; 224 → `admin.movieDetail.languageWidth`; 10000 → `admin.movieDetail.tableCellMaxWidth`; 48 → `admin.skeleton.row` ×2
  - `admin/now-playing.tsx` (2): 64 → `admin.nowPlaying.posterWidth`; 176 → `admin.nowPlaying.selectWidth`
  - `admin/person.tsx` (4): 600 → `admin.measure`; 192 → `admin.person.departmentWidth`; 160 → `admin.person.libraryColumn`; 14 → `admin.table.cellX`
  - `admin/security.tsx` (1): 192 → `admin.security.fieldWidth`
  - `admin/settings.tsx` (1): 208 → `admin.sideColumn`
  - `admin/setup.tsx` (17): 600 → `admin.measure`; 56 → `admin.setup.header`; 160 → `admin.setup.labelWidth`; 256 → `admin.setup.listHeight`; 224 → `admin.setup.moreWidth`; 960 → `admin.setup.pageWidth`; 112 → `admin.setup.portWidth`; 36 → `admin.setup.rowHeight`; 208 → `admin.sideColumn`; 96 → `admin.skeleton.block` ×2; 32 → `admin.skeleton.headingLarge`; 64 → `admin.skeleton.item` ×2; 20 → `admin.skeleton.line`; 160 → `admin.skeleton.panel`; 256 → `admin.skeleton.width.xl`
  - `admin/shell.tsx` (3): 26 → `admin.shell.main.x`; 22 → `admin.shell.main.y`; -80 → `admin.shell.skipLinkOffset`
  - `admin/show-detail.tsx` (6): 56 → `admin.showDetail.monitoredColumn`; 40 → `admin.showDetail.numberColumn`; 48 → `admin.showDetail.searchColumn`; 96 → `admin.showDetail.statusMinWidth`; 320 → `admin.showDetail.titleMaxWidth`; 14 → `admin.table.cellX`
  - `admin/shows-library.tsx` (5): 192 → `admin.filterWidth`; 144 → `admin.selectWidth`; 144 → `admin.showsLibrary.episodesWidth`; 14 → `admin.table.cellX`; 40 → `admin.table.checkColumn`
  - `admin/subtitles.tsx` (5): 224 → `admin.subtitles.addWidth`; 672 → `admin.subtitles.formWidth`; 224 → `admin.subtitles.leftWidth`; 192 → `admin.subtitles.ruleWidth`; 128 → `admin.subtitles.short`
  - `admin/system.tsx` (9): 20 → `admin.skeleton.line`; 160 → `admin.skeleton.width.md`; 80 → `admin.system.eventTime`; 208 → `admin.system.levelWidth`; 800 → `admin.system.measure` ×2; 640 → `admin.system.narrow`; 256 → `admin.system.searchWidth`; 176 → `admin.system.stateWidth`
  - `admin/two-factor.tsx` (1): 176 → `admin.twoFactor.qr`
  - `admin/users.tsx` (1): 224 → `admin.users.toolbarField`
  - `admin/vpn.tsx` (1): 128 → `admin.vpn.labelWidth`
  - `admin/wanted.tsx` (5): 96 → `admin.wanted.day.minHeight`; 10 → `admin.wanted.dot` ×2; 160 → `admin.wanted.monthLabel`; 56 → `admin.wanted.timeColumn`
  - `admin/widgets.tsx` (18): 40 → `admin.skeleton.field`; 28 → `admin.skeleton.heading`; 24 → `admin.skeleton.title`; 96 → `admin.skeleton.width.sm`; 256 → `admin.skeleton.width.xl`; 28 → `admin.widgets.calendarCell` ×2; 6 → `admin.widgets.dot`; 4 → `admin.widgets.dotSmall`; 48 → `admin.widgets.graphMin`; 8 → `admin.widgets.legendSwatch` ×2; 160 → `admin.widgets.metaMax`; 32 → `admin.widgets.poster` ×2; 160 → `admin.widgets.progressColumn`; 64 → `admin.widgets.speedColumn`; 8 → `admin.widgets.storageBar`
- **Component measures: one visually hidden style** (17: 11 excepted, 6 admin, 0 guides)
  - `admin/profiles.tsx` (3): -1 → `HIDDEN`; 1 → `HIDDEN` ×2
  - `admin/widgets.tsx` (3): -1 → `HIDDEN`; 1 → `HIDDEN` ×2
  - `ui/admin.tsx` (2): 1 → `HIDDEN` ×2
  - `ui/command-palette.tsx` (3): -1 → `HIDDEN`; 1 → `HIDDEN` ×2
  - `ui/sheet.tsx` (3): -1 → `HIDDEN`; 1 → `HIDDEN` ×2
  - `ui/table.tsx` (3): -1 → `HIDDEN`; 1 → `HIDDEN` ×2
- **Stay listed, with a lasting reason** (19: 19 excepted, 0 admin, 0 guides)
  - `client/desktop/window.tsx` (13): #28c840 → `LASTING:window`; #c42b1c → `LASTING:window`; #febc2e → `LASTING:window`; #ff5f57 → `LASTING:window`; #ffffff → `LASTING:window`; -2 → `LASTING:window`; 1 → `LASTING:window`; 10 → `LASTING:window` ×2; 14 → `LASTING:window`; 46 → `LASTING:window`; 5 → `LASTING:window` ×2
  - `client/player/parts.tsx` (1): -1 → `LASTING:mirror`
  - `ui/alpha.ts` (2): hsl() → `LASTING:alpha`; hsla(… … … / …) → `LASTING:alpha`
  - `ui/hidden-heading.tsx` (3): -1 → `LASTING:hidden`; 1 → `LASTING:hidden` ×2

#### Values that would round (27)

Each moves onto the nearest token rather than getting one of its own (the rule, and answer 8 at part A for type). Everything else keeps its value exactly.

| Where | Draws | Old | New |
| --- | --- | --- | --- |
| `client/music-player/now-playing.tsx:210` | Now Playing's cover shadow, by touch | rgba(0,0,0,0.45) | 0.5 (`art.alpha.50`) |
| `client/music-player/now-playing.tsx:227` | Now Playing's title, by touch | 22 | 20 (`mobileText.title.size`) |
| `client/music-player/now-playing.tsx:239` | Now Playing's artist, by touch | 18 | 17 (`mobileText.headline`) |
| `client/player/parts.tsx:58` | the player's scrim behind its controls | rgba(0,0,0,0.72) | 0.7 (`art.alpha.70`) |
| `client/player/pointer.tsx:247` | the pointer player's bottom gradient | rgba(0,0,0,0.75) | 0.8 (`art.alpha.80`) |
| `client/player/touch.tsx:33` | the touch player's scrim | rgba(0,0,0,0.45) | 0.5 (`art.alpha.50`) |
| `client/player/tv.tsx:122` | the TV player's previous chevron | 1.2 | 1.4 (`icon.sizeTv.min`) |
| `client/player/tv.tsx:126` | the TV player's next chevron | 1.2 | 1.4 (`icon.sizeTv.min`) |
| `client/player/tv.tsx:409` | the TV player's title | 2.2 | 2.4 (`tvText.title`) |
| `ui/admin.tsx:333` | the admin's key caps (`Kbd`, in the search trigger) | 5 | 4 (`radius.2xs`) |
| `ui/badge.tsx:37` | the TV quality tag's side padding | 0.31 | 0.3 (`tv.space.1.5`) |
| `ui/badge.tsx:37` | the TV quality tag's corner | 0.26 | 0.3 (`tv.radius.pill`) |
| `ui/badge.tsx:37` | the TV quality tag's tracking: 0.03u at 0.8u is 0.0375 em | 0.03u | 0.04 em, 0.032u (`tracking.tag`) |
| `ui/badge.tsx:109` | the quality tag's corner off the TV | 5 | 4 (`radius.2xs`) |
| `ui/command-palette.tsx:137` | the command palette's row text | 13.5 | 13 (`adminText.ui.size`) |
| `ui/film-row.tsx:540` | the film row's caption gradient | rgba(0,0,0,0.65) | 0.7 (`art.alpha.70`) |
| `ui/rating.tsx:28` | the gap between a TV rating's stars | 0.31 | 0.3 (`tv.space.1.5`) |
| `ui/tv/cards.tsx:63` | a TV card's scrim | rgba(0,0,0,0.72) | 0.7 (`art.alpha.70`) |
| `ui/tv/cards.tsx:157` | a TV card's title | 2.2 | 2.4 (`tvText.title`) |
| `ui/tv/page.tsx:187` | the TV page's dim over its backdrop | `#000000` at 0.55 | `art.black` at 0.6 (`art.alpha.60`) |
| `ui/widget-editor.web.tsx:574` | the widget editor's resize mark corner | 5 | 4 (`radius.2xs`) |
| `ui/widget.tsx:201` | a widget's resize mark corner | 5 | 4 (`radius.2xs`) |
| `admin/curation.tsx:228` | curation's severity icon | 18 | 20 (`icon.size.md`) |
| `admin/discover-shows.tsx:162` | the stars on Discover Shows | 11 | 12 (`icon.size.2xs`) |
| `admin/discover.tsx:77` | the stars on Discover | 11 | 12 (`icon.size.2xs`) |
| `admin/settings.tsx:96` | Settings' section icons | 18 | 20 (`icon.size.md`) |
| `admin/system.tsx:539` | System's link icons | 18 | 20 (`icon.size.md`) |

#### Lasting exceptions, `"until": null` (19)

| File | Values | Reason |
| --- | --- | --- |
| `client/desktop/window.tsx` | 13: 46, #c42b1c, #ffffff, #ff5f57, #febc2e, #28c840, 1, 10, 10, 5, 5, -2, 14 | The operating systems' window chrome: Windows' 46-wide caption buttons and Close red, macOS's three traffic-light colours and their measures. They copy Windows and macOS, not highsea's design. |
| `client/player/parts.tsx` | 1: -1 | `scaleX: -1` mirrors an icon (the forward-by button draws the replay arrow mirrored): a transform, not a measure. |
| `ui/alpha.ts` | 2: hsla(… … … / …), hsl() | `alpha()`'s `hsl()` and `hsla(… / …)` patterns: a parser's text, not a colour. |
| `ui/hidden-heading.tsx` | 3: 1, 1, -1 | The visually hidden technique's 1 × 1 box and −1 margin, which the shared style keeps. |

#### Calls for the owner

Each is a judgement this table makes, with the recommendation first. The first two touch values the brand locks.

1. **New steps on locked scales (55 values).** The table adds `space.1.5` (6) and `space.2.5` (10), Tailwind's steps of the same names; `radius.xs` (6), `radius.2xs` (4) and `radius.3xs` (2) below the locked radii in [direction.md › Shape](../brand/direction.md#shape), which says any change there needs a new sign-off; and `tv.radius.sm` (0.4), `tv.radius.md` (0.6) and `tv.radius.panel` (1) beside the TV's 0.3 and 0.5. Recommended: add them, since 6, 10 and 4 each recur across the library and the admin (23, 5 and 12 values) and rounding them would move 55 values. `radius.3xs` (2) has one use, the Widgets legend's swatch, so it could be that widget's own instead. The other way is to round each onto the nearest existing step and list all 55.
2. **The scrims (7 values round).** Five steps, `art.alpha` 35, 50, 60, 70 and 80, replace the ten alphas written today (0.35, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.72, 0.75, 0.8). Recommended: five steps, which rounds 0.45 to 0.5 twice and 0.55, 0.65, 0.72 twice and 0.75 by 0.05 or less. The other way is a step for each alpha as written, ten in all, and nothing rounds.
3. **The family's name.** The plan's "Overlays over art" is named `art` (`art.black`, `art.alpha`, `art.glass`, `art.edge`, `art.backdropScale`), because the component measures' group for the menus' and popovers' widths is `overlay`, as the plan names it. Recommended: `art`. The other way is `scrim` for this family.
4. **The hairline inside artwork** (`poster.tsx` and `collection-art.tsx`) is written white at 0.04 today. Recommended: `art.edge` as the `text` role at 0.04, so it follows a theme as the glass follows `bg`; at 4% the default theme's `#ededee` and white can't be told apart. The other way is to keep it white, as black stays black.
5. **Type that rounds (6 values), under answer 8 at part A.** The TV quality tag's tracking: 0.03u onto the new `tracking.tag` (0.04 em, 0.032u at its 0.8u size). Now Playing by touch: the title's 22 onto `mobileText.title` (20) and the artist's 18 onto `mobileText.headline` (17). The TV player's and a TV card's titles: 2.2u onto the new `tvText.title` (2.4u, the size tv.md gives the album, PIN and message titles). The command palette's rows: 13.5 onto `adminText.ui` (13). Recommended: round as listed.
6. **13 on the phone.** The phone's 13s (the mini player, Now Playing, the touch player) move onto `adminText.ui`, as the approved shape says. iOS's own size there is Footnote, 13 pt ([HIG › Typography](https://developer.apple.com/design/human-interface-guidelines/typography)). Recommended: keep the approved shape now; a `mobileText.footnote` can come with the phone's type review if it's wanted.
7. **Icons that round (7 values).** The TV player's chevrons at 1.2u onto the TV's smallest icon, 1.4u ([iconography.md](../design-language/iconography.md)); the admin's 18 icons in Curation, Settings and System onto 20; the stars on the two Discover pages at 11 onto the new `icon.size.2xs` (12). Recommended: round. Two TV icons stay under 1.4u as their components' own measures, as drawn: the TV badge's 0.95u and the acknowledgement card's 1.1u announcement icon (`badge.iconTv`, `tvConfirm.icon`). The other way is to raise both to 1.4u.
8. **One visually hidden style (17 values).** Six files copy the technique `hidden-heading.tsx` writes. Recommended: one shared style in the library, with its 3 values the only lasting exception. The other way is 6 more lasting exceptions.
9. **The admin's own group (128 tokens).** The rule puts a measure used by one screen in that screen's group, so the admin's screens get 128 keys under `admin`, 14 of them a skeleton scale every loading state shares. Recommended: as listed. One of them, Movie detail's `maxWidth={10000}` on the expanded release row, stands in for "wrap without a limit", which D2's "table cell spanning columns" gap names; recommended: no token, and it goes when that gap is closed in E1.
10. **The admin shell's padding.** `shell.tsx` pads the main area 26 across and 22 down, beside `density.mainPadding` (24). Recommended: keep both as `admin.shell.main.x` and `.y`, since rounding them to 24 moves every admin page by 2. The other way is 24 and a listed change.
11. **The person photo's hover.** `page-parts.tsx`'s `PHOTO_LIFT` (1.05) is a fourth hover constant the plan didn't count. Recommended: `hover.photoScale` beside the other three in `motion.ts`. It equals the TV poster focus's 1.05, but a pointer's hover and the TV's focus are separate decisions.
12. **The mirrored icon.** The player's forward-by button draws the replay arrow with `scaleX: -1`. Recommended: a lasting exception (a transform, not a measure). The other way is a `fast-forward` glyph of its own in the icon set.
13. **Appearance's suggested accent** (`#8fbfb7`, twice in `appearance.tsx`) is the colour offered when the owner turns a custom accent on. Recommended: `admin.appearance.suggestedAccent`, since it's a suggestion rather than a theme's colour. The other way is a theme preset in `themes.ts`.
14. **Small roundings in corners and TV spaces (7 values).** The 4 corners (the admin's key caps, the quality tag off the TV, the two widgets' resize marks) onto `radius.2xs` (4), the TV quality tag's 0.26u corner onto `tv.radius.pill` (0.3u), and the 0.31u padding and star gap onto `tv.space.1.5` (0.3u). Recommended: round; each moves by 1 or by 0.04u or less.

## The tokens (E1)

### The proposed token set

The owner's answer 7 at part A asked for a token set proposed for approval. It's written in two steps:

1. **The shape, approved with this scope** ([answer 2](#the-owners-answers)): the families below, the rule for which value gets a token, and where each family lives.
2. **The values, approved at E1's first stop:** a table in this plan's Progress listing every proposed token (its family, name, value and the files that use it), each excepted value against the token it moves onto, and every value that would round. Nothing is applied before the owner approves it.

**The rule:** a value gets a token when it names a design decision used in more than one place, or a measure the specs or the design language name. A measure used by a single component goes into that component's group in the tokens, beside the control spec, as `density` and `controlGeometry` already are. Where a value sits within one step of an existing token and the owner's answer 8 at part A applies (Text's mapping to the nearest style), it moves onto that token rather than getting a new one, and the change is listed.

**The families** (the counts are E1's estimate from the check's output, and the table gives the exact ones):

| Family | What it holds | About | Where |
| --- | --- | --- | --- |
| Line widths | The 1-wide border and rule, and the 2-wide underline of the line tabs | 35 | `scales.ts`, a new `line` scale, documented in [elevation.md](../design-language/elevation.md) beside the line colours |
| The TV's spaces in units | The steps the TV's parts repeat (0.2, 0.3, 0.4, 0.6, 0.8, 1.2, 1.6, 2.4 and so on) as a TV spacing scale, beside `tv` | 150 | `scales.ts`'s `tv`, documented in [platforms/tv.md](../design-language/platforms/tv.md) |
| Type off the scales | The phone's 17 headings and 15 biography as `mobileText` styles, at iOS's Headline and Subheadline sizes ([Human Interface Guidelines › Typography](https://developer.apple.com/design/human-interface-guidelines/typography)); 11 and 13 onto the existing `label` and `mono` or `ui` styles; 13.5 rounded to 13 | 45 | `typography.ts`, documented in [typography.md](../design-language/typography.md) |
| Icons | Sizes off the icon scale (12, 14, 22) as `xs` and the like, and the 56 of EmptyState's circle | 20 | `scales.ts`'s `icon`, documented in [iconography.md](../design-language/iconography.md) |
| Overlays over art | The dark glass (`bg` at 0.62), and the black scrims (0.35, 0.5, 0.55, 0.6) as a few named steps | 10 | `scales.ts` beside `blur`, documented in elevation.md |
| Component measures | The players' (the 44 to 80 circles, the scrubber, the queue's 384), the overlays' widths (menu 224, popover 288, tooltip 256, toaster 420, palette 560, side sheets 320 and 416), the table's 36 head, the Stepper's disc, the widget's head, the admin screens' own | 600 | `controls.ts` and `scales.ts`, a group per component (`overlay`, `table`, `player`, `musicPlayer`, `widget`), as `density` is |
| Pointer hover | The poster's 1.02 scale, and the 1.08 and 1.1 brightness (`lift.ts`) | 3 | `motion.ts` beside `focus`, documented in [motion.md](../design-language/motion.md) |
| The scrollbar | The inset, the handle at rest and active, the reach, the shortest handle and the two alphas (answer 9 at part A) | 7 | `scales.ts`'s `scrollbar`, documented in [spacing-layout.md](../design-language/spacing-layout.md) |
| Stay listed, with a lasting reason | The desktop window's Windows and macOS chrome (Windows' 46 caption buttons and its Close red, macOS's three colours), which copy the operating systems rather than highsea's design; the visually hidden heading's 1 × 1 box and −1 margin (the technique's); `alpha.ts`'s hsl() pattern | 19 | `one-place-exceptions.json`, `"until": null` |

The colours in the families above are written from the theme's roles where they are one (`bg` at 0.62 is the glass), so a theme that changes `bg` changes the glass. Black stays black, as elevation.md has the shadows.

### What else moves (E1)

- **The scrollbar** (`scrollbar.ts`) and **the hover** (`lift.ts`) read their new tokens. `scrollbar.ts`'s `page` (0.875 of the view per click on the track) is the browser's behaviour, not a measure, and stays a constant.
- **The library's old breakpoints** ([answer 5](#the-owners-answers)): `Banner`, `Row` and `page-parts.tsx` take the form-factor rule, `breakpoints` and `density.sidebarRail` leave the tokens, and spacing-layout.md's breakpoint table goes. A layout that moves is put beside its old self for the owner.
- **The check reads everything** ([answer 3](#the-owners-answers)): `scripts/one-place.ts`'s values rule adds `packages/admin/src` and `apps/docs/components`, and `one-place.test.ts` covers both.
- **The exceptions file** keeps only the lasting entries. `one-place.ts` then fails on any exception whose `until` names a part, so a part can't end with one open.

### The library's gaps (E1)

By [answer 8](#the-owners-answers), two of D2's list are built and the rest wait:

- **Fixes, built in E1:** react-native-svg's React Native props reaching the `<svg>` on the web (C1's note), so React's development warnings stop; and a `title` the web keeps where the library already passes one (react-native-web drops it).
- **New parts, left until a screen needs them:** a truncating Badge, a table cell spanning columns, a row's title tooltip, a number input with limits, a `MultiSelect`, a heading level for a small EmptyState and a Dialog's fade-out. They're listed in [roadmap.md](../roadmap.md)'s follow-ups so they aren't lost.

## The guides on the library (E2)

The guides keep Fumadocs' MDX. MDX lets a page's elements and named components be replaced by passing a `components` map ([MDX › Using MDX › Components](https://mdxjs.com/docs/using-mdx/#components)), and Fumadocs builds its own defaults that way: "The default MDX components include Cards, Callouts, Code Blocks and Headings" ([Fumadocs › Components](https://www.fumadocs.dev/docs/ui/components)). `apps/docs/components/mdx.tsx` already spreads Fumadocs' defaults and adds its own, so the guides' parts are replaced there, and no guide's MDX changes.

What's drawn by the library ([answer 6](#the-owners-answers)):

- **`Callout`** becomes the library's `Banner` (its card variant, its tone from the callout's `type`: `info`, `warning`, `success`, and `error` as `danger`), which already draws the clients' notices.
- **`Card` and `Cards`** become a library link card and its grid: a title, a description and the whole card as one link, on the panel's look. It's new in the library, ready for any app (the settings index and Get the apps draw much the same). The cards keep Next's `Link` for client-side navigation inside the static export, passed in as the card's link, as `@highsea-tv/admin`'s `NavigationProvider` does for the admin.
- **Figures** (`img`) become a library figure: the screenshot drawn with the library's `Image`, at the width and height fumadocs-mdx's Remark Image plugin adds to every image at build ([Remark Image](https://www.fumadocs.dev/docs/headless/mdx/remark-image)), on a corner from the radius scale, with its alt text as the image's label. React Native's `Image` needs a size, so the plugin's width and height give its aspect ratio.
- **`ScreenshotToCome`** goes. No guide uses it, and `content.test.ts`'s check of it goes with it.
- **Fumadocs keeps** code blocks (with their copy button and the include from the one compose file), headings and their anchors, tables, `Steps`, `Tabs`, the search dialog, the sidebar and the table of contents. Each is in `parity.ts`'s sense a host's part, not a drawing, and the guides' entry in `one-place.ts`'s host rules says so, as the admin's does.

**How they're drawn.** Each library part is a client component (`'use client'`), since react-native-web's components use hooks and context ([Next.js › use client](https://nextjs.org/docs/app/api-reference/directives/use-client)). The MDX body stays a server component that renders them, as the site title already is. The site's root layout already writes the library's sheet into each exported page through `useServerInsertedHTML` ([Next.js › CSS-in-JS](https://nextjs.org/docs/app/guides/css-in-js)), as react-native-web's server rendering asks ([Rendering on the server](https://necolas.github.io/react-native-web/docs/rendering/)), so the export's pages are styled before any script runs. The static export stays as it is ([Next.js › Static Exports](https://nextjs.org/docs/app/guides/static-exports)).

**Tailwind** ([answer 7](#the-owners-answers)) stays in `apps/docs` only as Fumadocs' frame needs it. highsea's own components in the guides write no Tailwind class.

**Checks for the guides:**

- `one-place` reads `apps/docs/components` for values and parts. The guides' components draw from the library only, as the admin's hosts do.
- A sweep over the guides' static export ([answer 11](#the-owners-answers)): `scripts/sweeps/docs.ts` builds the guides, serves `out/` and loads every page at 1440 and 390, with axe, overflow and the keyboard walk, in the site's one theme.
- Every guide page beside its old self at 1440 and 390, for the owner: the cards, the callout and the figures.
- `content.test.ts` and the guides' build, as now.

## The docs and every check (E3)

### The design language

- [spacing-layout.md](../design-language/spacing-layout.md): one rule for every client and the admin, compact below 768, with the admin's table and "until part D" gone; the scrollbar's tokens.
- [platforms/admin.md](../design-language/platforms/admin.md): the admin's layouts by the form-factor rule, as D1 built them (the sidebar from 768, the menu below it, no rail).
- [platforms/desktop-web.md](../design-language/platforms/desktop-web.md): the desktop app around the client's desktop export, and the web's columns as the form-factor rule lays them out.
- [platforms/tv.md](../design-language/platforms/tv.md) and [platforms/mobile.md](../design-language/platforms/mobile.md): the values E1 gave tokens, named by their tokens, and the TV's focus engines as part A built them (the devices' own, and the web engine behind `Focusable`).
- [accessibility.md](../design-language/accessibility.md): the sweeps as they run.
- The new tokens in elevation.md, typography.md, iconography.md and motion.md.

### The product specs

Each client spec names the one screen per destination ([answer 9](#the-owners-answers)):

- **A `Screen:` line** naming the file in `apps/client/src/app/` (or `packages/admin/src/` for the admin), beside the `Prototype:` line.
- **The `Prototype:` lines** on the routes the prototypes serve now: the client at `/web` inside the frames, the admin at `/admin/…`, and Shows' admin at `/series`.
- **The Layout sections** keep their form factors as headings, since the specs describe what each form factor shows, and say that it's one screen laid out by the rule, with the compositions part B listed.
- **`ui-web`, `ui-native` and Storybook** go from `player.md`, `client-library.md`, `admin-shell.md`, `dashboard.md` and `appearance.md`, each sentence saying what's true now.
- **Prototype-gaps' stage 8's specs:** client-settings.md's TV navigation (Settings in the head), client-detail.md's long press of OK and linked cast, player.md's episodes, Skip intro and the music player, and client-home.md's rows and featured card, each checked against the client as built.

### The ADRs and the project's docs

- **Dated sections:** 0060 (the tokens E1 adds, the library's link card and figure, and the breakpoints gone), 0061 (part E, and the platform done), 0008 (the guides' parts on React Native), 0003 (the guides' build, if E2 changes it).
- **Their status** ([answer 10](#the-owners-answers)): 0060 and 0061 Accepted at part E's sign-off; 0053's phone and TV part and 0059 stay Proposed until 4.5c.
- **The index** and its list of which work added which.
- **`docs/architecture.md`** (the guides' row, the tokens' new groups), **`CLAUDE.md`** (Now, and "Tailwind is left only in…"), **the `checks` skill**, **the sweeps' README** (Radix's waits gone, the guides' sweep added) and `scripts/sweeps/lib.ts` and `server.ts`' Radix comments.

### Every check

"Every check" goes as far as [answer 12](#the-owners-answers) says, under Node 26.11.1:

- `/checks full`: lint, typecheck, the tests and the client's Jest tests, smoke, `one-place`, `controls.ts` and `bundles.ts`, licences, the audit, the docs build, and the sweeps (`pages.ts`, `keyboard.ts`, `dpad.ts`, `server.ts`, `playback.ts`, and the guides' new one).
- **The simulators:** `layout.ts` over every destination on the web, the iPhone and the Apple TV, last run in B3; `tv.ts`'s remote walk and `phone.ts`, which D3 left.
- **Packaging:** the image from `docker/compose.dev.yaml`, the end-to-end run through it, and `image.ts size` reported.
- **The comparison sheet** (`compare.ts --before`) over every admin screen, against D3's drawing, since E1 moves the admin's values.
- **CI:** the branch's pull request with the `full-ci` label, so every heavy job runs once on part E.

## ADRs

- **No new ADR.** Part E finishes ADR 0061's decision. The token rules the owner approved (answer 2) sit within 0060's, so its dated section records them.
- **Dated sections:**
  - 0060: the tokens added in E1, the library's link card and figure, and the old breakpoints removed (E1, E2);
  - 0061: the tokens and the check over the admin and the guides (E1), the guides on the library (E2), and the platform's sign-off (E3);
  - 0008: the guides draw their parts in React Native (E2);
  - 0003: only if the guides' build changes (E2).
- **Status:** 0060 and 0061 Accepted at part E's sign-off; 0053's phone and TV part and 0059 stay Proposed until 4.5c (answer 10).

## Risks

- **The token set is large.** About 900 values become tokens or move onto them. The rule keeps one-off measures in their component's group rather than growing the shared scales, and the value table is approved before anything moves. Moving the values is mechanical; the review is the table.
- **Rounding moves pixels.** Wherever a value moves onto a nearby token it changes by a point or two, in screens that are signed off. Each one is listed beside its old self, and the owner can keep a value as its own token instead.
- **The admin's 346 values** were never checked, so some are layout written for one screen. Those go into the screen's own group (`packages/admin`'s, in the tokens) rather than becoming shared tokens.
- **react-native-web in an MDX page.** The guides render their pages on the server at build. The library's parts render there already (the site title), but the cards and figures sit inside Fumadocs' prose styles, which reach into `img` and `a`. E2 checks a guide with its cards, callout and figures, with JavaScript off, before changing the rest, and the guides' sweep checks overflow.
- **The images' sizes.** The library's `Image` lays out from a size, and Remark Image gives it one for local images. A guide that uses an image Remark Image can't size fails the build rather than drawing at no size.
- **The simulators' runs are long.** `layout.ts` over every destination and the TV's remote walk take hours. Each is preflighted (the first entries land, and the output shows progress) before it's left to run.

## Open questions for the owner

1. **Three batches.**
   **Recommended:** E1 (the tokens), E2 (the guides on the library) and E3 (the docs and every check), each reviewed. The tokens come first, so the guides' parts and the docs describe the final values.
   Or: two batches, the tokens with the guides, then the docs and the checks. One review fewer, but the token table's approval and the guides' look are reviewed together.
   Or: the guides first, since they're small, then the tokens. The guides' parts would then be drawn on values that move again in E1.
2. **The token set's shape** (the owner's answer 7 at part A).
   **Recommended:** approve the families and the rule above now (a token for a decision used in more than one place, a component's own group for a one-off measure, the nearest existing token within one step, a few lasting exceptions), and approve the values themselves at E1's first stop, from a table of every token, its value and its users.
   Or: approve the values from this plan's estimates now, without a stop in E1. Faster, but the plan's counts are estimates, and a rounded value would be seen only in the built screens.
   Or: keep the measures as listed exceptions for good, with lasting reasons, and add tokens only for line widths, the scrollbar and hover. Far less work, but `one-place` would keep about 500 values outside the tokens, against the parent plan's goal.
3. **The admin's and the guides' values.**
   **Recommended:** the values rule reads `packages/admin/src` and `apps/docs/components` from E1, and their 347 values move onto the same token set.
   Or: the admin's screens stay outside the values rule, as the dense pro tool, with the reason listed. Less work, but a colour or size could again be written in an admin screen and in the library.
4. **The scrollbar's tokens** (the owner's answer 9 at part A).
   **Recommended:** a `scrollbar` group in `scales.ts` at today's measures (approved with 4.4a), documented in spacing-layout.md; the 0.875 page stays a constant, since it's the browser's behaviour.
   Or: the scrollbar's handle on the control spec's sizes per input, so a touch screen's handle grows. The web's bar is pointer-only today, so this changes nothing anyone sees now.
5. **The library's old breakpoints.**
   **Recommended:** `Banner`, `Row` and the page parts take the form-factor rule, and `breakpoints` (600, 1024, 1440) and `density.sidebarRail` leave the tokens. Any layout that moves is put beside its old self for your approval.
   Or: keep 600, 1024 and 1440 as the pointer's column steps, renamed and documented in spacing-layout.md. Nothing moves, but two width rules stay.
6. **Which guide parts the library draws.**
   **Recommended:** the callout (the library's `Banner`), the cards (a new library link card and grid) and the figures (a library figure on `Image`). Fumadocs keeps its code blocks, headings, tables, `Steps`, `Tabs`, search, sidebar and table of contents, listed as the host's parts.
   Or: also `Steps` and `Tabs`, on the library's `Stepper` and `Segmented`. More sharing, but `Tabs` would lose Fumadocs' remembered choice across pages, and `Steps` is only Fumadocs' counters in CSS.
   Or: the callout and the figures only, leaving the cards to Fumadocs. Less work, but the guides' most-used part stays drawn twice.
7. **Tailwind in the guides.**
   **Recommended:** it stays only because Fumadocs' frame is built on it; highsea's own components in the guides write no class, and `ScreenshotToCome`, the one that does, goes as unused.
   Or: draw `ScreenshotToCome` with the library and keep it for future guides. It's ready when a screenshot is missing, but nothing uses it now.
8. **D2's library gaps.**
   **Recommended:** build the two fixes in E1 (react-native-svg's props on the `<svg>`, and a `title` the web keeps), and leave the new parts (truncating Badge, spanning cell, row title tooltip, number input with limits, `MultiSelect`, small EmptyState's heading, Dialog fade-out) until a screen needs them, listed in the roadmap's follow-ups.
   Or: build them all in E1. The library is complete sooner, but parts would be built before any screen uses them.
9. **The specs, and prototype-gaps' stage 8.**
   **Recommended:** each client spec gains a `Screen:` line and its current `Prototype:` routes, its layouts say they're one screen by the rule, and stage 8's four spec items are done in the same pass, so stage 8 has nothing left but its checks, which E3 runs.
   Or: the specs only get their routes and names fixed, with stage 8 kept apart for later. Smaller, but the same specs are opened twice.
10. **The ADRs' status.**
    **Recommended:** 0060 and 0061 become Accepted at part E's sign-off, since everything they decide is built. 0053's phone and TV part and 0059 stay Proposed until 4.5c checks Android.
    Or: all four stay Proposed until 4.5c. One change of status later, but the platform's own decision stays Proposed after it's finished.
11. **A sweep for the guides.**
    **Recommended:** `scripts/sweeps/docs.ts` over the guides' static export: axe, overflow and the keyboard walk on every page at 1440 and 390.
    Or: no sweep; the guides' build and `content.test.ts` as now. Nothing would catch a library part that overflows or fails axe inside a guide.
12. **What "every check" covers.**
    **Recommended:** `/checks full`, the simulators (`layout.ts` over every destination, `tv.ts` and `phone.ts`), the image with the end-to-end run, the admin's comparison sheet, and CI's heavy jobs once through `full-ci`.
    Or: `/checks full` and CI only, as D3 ran. Hours shorter, but the TV's remote walk and the layout check over every destination haven't run since B3, and part E ends the platform.

## The owner's answers

On 2026-11-09 the owner took every recommendation for questions 1 to 12.

1. Three batches, E1 (the tokens), E2 (the guides on the library) and E3 (the docs and every check), each reviewed, the tokens first.
2. The token set's families and rule are approved now; every value is approved at E1's first stop, from a table of each token, its value and its users, before anything moves.
3. The values rule reads `packages/admin/src` and `apps/docs/components` from E1, and their 347 values move onto the same token set.
4. A `scrollbar` group in `scales.ts` at today's measures, documented in spacing-layout.md; the 0.875 page stays a constant.
5. `Banner`, `Row` and the page parts take the form-factor rule, and `breakpoints` and `density.sidebarRail` leave the tokens, with any moved layout put beside its old self.
6. The library draws the guides' callout (`Banner`), cards (a new link card and grid) and figures (on `Image`); Fumadocs keeps its code blocks, headings, tables, `Steps`, `Tabs`, search, sidebar and table of contents.
7. Tailwind stays in the guides only for Fumadocs' frame, and `ScreenshotToCome` goes as unused.
8. E1 builds the two fixes (react-native-svg's props on the `<svg>`, and a `title` the web keeps); the new parts wait until a screen needs them, listed in the roadmap's follow-ups.
9. Each client spec gains a `Screen:` line and its current `Prototype:` routes, with stage 8's four spec items done in the same pass.
10. 0060 and 0061 become Accepted at part E's sign-off; 0053's phone and TV part and 0059 stay Proposed until 4.5c.
11. `scripts/sweeps/docs.ts` sweeps the guides' static export: axe, overflow and the keyboard walk on every page at 1440 and 390.
12. Every check means `/checks full`, the simulators (`layout.ts` over every destination, `tv.ts` and `phone.ts`), the image with the end-to-end run, the admin's comparison sheet, and CI's heavy jobs once through `full-ci`.
