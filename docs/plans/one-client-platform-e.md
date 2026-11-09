# One client platform, part E: the guides, the specs and the full checks

- **Status:** Scoped on 2026-11-09, after the one compose file's sign-off. Waiting for the owner's answers to [the open questions](#open-questions-for-the-owner). Nothing is built.
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
- **Android and Android TV (4.5c).** Their builds come from `apps/client` and are checked there. ADRs 0053 and 0059 keep what 4.5c decides ([question 10](#open-questions-for-the-owner)).
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

Three gated batches, each reviewed by the owner ([question 1](#open-questions-for-the-owner)):

- **E1, the tokens.** It opens with the proposed token set, every value with its family, name and where it's used, and stops for the owner's approval before anything is applied, since token values are locked. Then the approved tokens are added, the 548 excepted values and the 346 the check doesn't read yet are moved onto them, and the scrollbar's and the hover's constants become tokens. The library's old breakpoints move onto the form-factor rule. The values rule then reads the admin and the guides, and the exceptions file keeps only the reasons that never expire. Nothing should look different, except where an approved token rounds a value, and each of those is listed beside its old self.
- **E2, the guides on the library.** The callout, the cards and the figures drawn by the library through react-native-web, in Fumadocs' MDX; the unused `ScreenshotToCome` removed; `one-place` reading `apps/docs`; and a sweep over the guides' export.
- **E3, the docs and every check.** The design language's platform guides, the product specs (with prototype-gaps' stage 8's list), the ADRs, `docs/architecture.md`, `CLAUDE.md`, the skills and the sweeps' README, then every check, the simulators' included, and the parent plan's sign-off.

## Progress

Nothing yet.

## The tokens (E1)

### The proposed token set

The owner's answer 7 at part A asked for a token set proposed for approval. It's written in two steps:

1. **The shape, approved with this scope** ([question 2](#open-questions-for-the-owner)): the families below, the rule for which value gets a token, and where each family lives.
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
- **The library's old breakpoints** ([question 5](#open-questions-for-the-owner)): `Banner`, `Row` and `page-parts.tsx` take the form-factor rule, `breakpoints` and `density.sidebarRail` leave the tokens, and spacing-layout.md's breakpoint table goes. A layout that moves is put beside its old self for the owner.
- **The check reads everything** ([question 3](#open-questions-for-the-owner)): `scripts/one-place.ts`'s values rule adds `packages/admin/src` and `apps/docs/components`, and `one-place.test.ts` covers both.
- **The exceptions file** keeps only the lasting entries. `one-place.ts` then fails on any exception whose `until` names a part, so a part can't end with one open.

### The library's gaps (E1)

[Question 8](#open-questions-for-the-owner) decides which of D2's list are built:

- **Fixes, built in E1:** react-native-svg's React Native props reaching the `<svg>` on the web (C1's note), so React's development warnings stop; and a `title` the web keeps where the library already passes one (react-native-web drops it).
- **New parts, left until a screen needs them:** a truncating Badge, a table cell spanning columns, a row's title tooltip, a number input with limits, a `MultiSelect`, a heading level for a small EmptyState and a Dialog's fade-out. They're listed in [roadmap.md](../roadmap.md)'s follow-ups so they aren't lost.

## The guides on the library (E2)

The guides keep Fumadocs' MDX. MDX lets a page's elements and named components be replaced by passing a `components` map ([MDX › Using MDX › Components](https://mdxjs.com/docs/using-mdx/#components)), and Fumadocs builds its own defaults that way: "The default MDX components include Cards, Callouts, Code Blocks and Headings" ([Fumadocs › Components](https://www.fumadocs.dev/docs/ui/components)). `apps/docs/components/mdx.tsx` already spreads Fumadocs' defaults and adds its own, so the guides' parts are replaced there, and no guide's MDX changes.

What's drawn by the library ([question 6](#open-questions-for-the-owner)):

- **`Callout`** becomes the library's `Banner` (its card variant, its tone from the callout's `type`: `info`, `warning`, `success`, and `error` as `danger`), which already draws the clients' notices.
- **`Card` and `Cards`** become a library link card and its grid: a title, a description and the whole card as one link, on the panel's look. It's new in the library, ready for any app (the settings index and Get the apps draw much the same). The cards keep Next's `Link` for client-side navigation inside the static export, passed in as the card's link, as `@highsea-tv/admin`'s `NavigationProvider` does for the admin.
- **Figures** (`img`) become a library figure: the screenshot drawn with the library's `Image`, at the width and height fumadocs-mdx's Remark Image plugin adds to every image at build ([Remark Image](https://www.fumadocs.dev/docs/headless/mdx/remark-image)), on a corner from the radius scale, with its alt text as the image's label. React Native's `Image` needs a size, so the plugin's width and height give its aspect ratio.
- **`ScreenshotToCome`** goes. No guide uses it, and `content.test.ts`'s check of it goes with it.
- **Fumadocs keeps** code blocks (with their copy button and the include from the one compose file), headings and their anchors, tables, `Steps`, `Tabs`, the search dialog, the sidebar and the table of contents. Each is in `parity.ts`'s sense a host's part, not a drawing, and the guides' entry in `one-place.ts`'s host rules says so, as the admin's does.

**How they're drawn.** Each library part is a client component (`'use client'`), since react-native-web's components use hooks and context ([Next.js › use client](https://nextjs.org/docs/app/api-reference/directives/use-client)). The MDX body stays a server component that renders them, as the site title already is. The site's root layout already writes the library's sheet into each exported page through `useServerInsertedHTML` ([Next.js › CSS-in-JS](https://nextjs.org/docs/app/guides/css-in-js)), as react-native-web's server rendering asks ([Rendering on the server](https://necolas.github.io/react-native-web/docs/rendering/)), so the export's pages are styled before any script runs. The static export stays as it is ([Next.js › Static Exports](https://nextjs.org/docs/app/guides/static-exports)).

**Tailwind** ([question 7](#open-questions-for-the-owner)) stays in `apps/docs` only as Fumadocs' frame needs it. highsea's own components in the guides write no Tailwind class.

**Checks for the guides:**

- `one-place` reads `apps/docs/components` for values and parts. The guides' components draw from the library only, as the admin's hosts do.
- A sweep over the guides' static export ([question 11](#open-questions-for-the-owner)): `scripts/sweeps/docs.ts` builds the guides, serves `out/` and loads every page at 1440 and 390, with axe, overflow and the keyboard walk, in the site's one theme.
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

Each client spec names the one screen per destination ([question 9](#open-questions-for-the-owner)):

- **A `Screen:` line** naming the file in `apps/client/src/app/` (or `packages/admin/src/` for the admin), beside the `Prototype:` line.
- **The `Prototype:` lines** on the routes the prototypes serve now: the client at `/web` inside the frames, the admin at `/admin/…`, and Shows' admin at `/series`.
- **The Layout sections** keep their form factors as headings, since the specs describe what each form factor shows, and say that it's one screen laid out by the rule, with the compositions part B listed.
- **`ui-web`, `ui-native` and Storybook** go from `player.md`, `client-library.md`, `admin-shell.md`, `dashboard.md` and `appearance.md`, each sentence saying what's true now.
- **Prototype-gaps' stage 8's specs:** client-settings.md's TV navigation (Settings in the head), client-detail.md's long press of OK and linked cast, player.md's episodes, Skip intro and the music player, and client-home.md's rows and featured card, each checked against the client as built.

### The ADRs and the project's docs

- **Dated sections:** 0060 (the tokens E1 adds, the library's link card and figure, and the breakpoints gone), 0061 (part E, and the platform done), 0008 (the guides' parts on React Native), 0003 (the guides' build, if E2 changes it).
- **Their status** ([question 10](#open-questions-for-the-owner)): 0060 and 0061 Accepted at part E's sign-off.
- **The index** and its list of which work added which.
- **`docs/architecture.md`** (the guides' row, the tokens' new groups), **`CLAUDE.md`** (Now, and "Tailwind is left only in…"), **the `checks` skill**, **the sweeps' README** (Radix's waits gone, the guides' sweep added) and `scripts/sweeps/lib.ts` and `server.ts`' Radix comments.

### Every check

[Question 12](#open-questions-for-the-owner) says how far "every check" goes. Recommended, under Node 26.11.1:

- `/checks full`: lint, typecheck, the tests and the client's Jest tests, smoke, `one-place`, `controls.ts` and `bundles.ts`, licences, the audit, the docs build, and the sweeps (`pages.ts`, `keyboard.ts`, `dpad.ts`, `server.ts`, `playback.ts`, and the guides' new one).
- **The simulators:** `layout.ts` over every destination on the web, the iPhone and the Apple TV, last run in B3; `tv.ts`'s remote walk and `phone.ts`, which D3 left.
- **Packaging:** the image from `docker/compose.dev.yaml`, the end-to-end run through it, and `image.ts size` reported.
- **The comparison sheet** (`compare.ts --before`) over every admin screen, against D3's drawing, since E1 moves the admin's values.
- **CI:** the branch's pull request with the `full-ci` label, so every heavy job runs once on part E.

## ADRs

- **No new ADR.** Part E finishes ADR 0061's decision. One is written only if the owner's answer to question 2 departs from the token rules in 0060.
- **Dated sections:**
  - 0060: the tokens added in E1, the library's link card and figure, and the old breakpoints removed (E1, E2);
  - 0061: the tokens and the check over the admin and the guides (E1), the guides on the library (E2), and the platform's sign-off (E3);
  - 0008: the guides draw their parts in React Native (E2);
  - 0003: only if the guides' build changes (E2).
- **Status:** see [question 10](#open-questions-for-the-owner).

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

## The owner's changes

## The owner's answers
