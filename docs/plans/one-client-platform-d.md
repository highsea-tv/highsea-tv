# One client platform, part D: the admin, drawn only with the library

- **Status:** Scoped on 2026-11-04, after part C's sign-off, and approved with [the owner's answers](#the-owners-answers) of 2026-11-04: every recommendation. Nothing is built.
- **Parent plan:** [one-client-platform.md](one-client-platform.md), part D: "Everything it draws on the library through react-native-web, its own parts made library components, and its prototype the same; every admin screen beside its old self (`compare.ts`) and the guides' screenshots retaken."

## Read first

1. [one-client-platform.md](one-client-platform.md): the Goal, "The admin, drawn only with the library (D)", the owner's change 1 (the admin's own parts become library components) and the answer to question 4's follow-up (Next.js keeps routing and serving).
2. [ADR 0061](../adr/0061-one-client-platform.md) and [ADR 0060](../adr/0060-one-design-system-one-library.md): one library, and what its web renderer still holds for the admin.
3. [ADR 0003](../adr/0003-server-runtime-custom-entry.md) (the admin is Next.js behind the custom server), [ADR 0018](../adr/0018-admin-data-through-the-api.md) (the admin reads and writes only through the public API) and [ADR 0032](../adr/0032-administrative-and-normal-access.md) (who sees the admin).
4. `packages/ui/src/shared/parity.ts`: every `BOTH` and `WEB_ONLY` entry that says "until part D".
5. `scripts/one-place-exceptions.json`: the three exceptions marked `"until": "D"`.
6. The code: `apps/server/app/` (54 pages and their layouts), `apps/server/src/admin/` (61 screen files), `apps/server/next.config.ts`, `design/prototypes/src/admin/` (48 files) and `packages/ui/src/web/` (the renderer this part retires).
7. [docs/design-language/controls.md](../design-language/controls.md) and `packages/tokens/src/form-factor.ts`: the control spec and the form-factor rule the admin moves onto.

## Goal

The admin draws nothing of its own. Every screen, page part and control it shows is the library's React Native drawing, through react-native-web, its own parts included: the sidebar, the tables, the widget grid and its editor, the command palette, the status bar, the stepper and the page header. Each of these becomes a library component a client or a companion app can use. Next.js stays the admin's host: its routes, layouts, the server, the session and `/api`, as now.

Each admin screen is written once. The admin and its prototype are the same code, the prototype running it against the mock transport, as the client's prototypes do since part B. `packages/ui/src/web`, Tailwind in the admin, and the three "until D" exceptions in `one-place` are gone. What someone sees in the admin is what the owner signed off, with every difference listed.

## Out of scope

- **The guides' drawn parts and the 143 values' tokens (part E).** The guides' site title draws the web renderer's `Lockup` today; see [question 9](#open-questions-for-the-owner).
- **Moving the admin off Next.js.** Next keeps routing and serving (the parent plan's answer to question 4's follow-up).
- **New admin features.** Shows and Music in the admin stay prototype-only screens until their phase (prototype-gaps.md's stage 6). How they move is [question 5](#open-questions-for-the-owner).
- **Dashboard customization on Homarr's level** (dashboard-customization.md). The widget grid moves as it is.
- **Android and Android TV (4.5c), copies for a device (4.6), and publishing anything.**

## Where things stand

- **The admin** is 54 Next.js pages in `apps/server/app/` and 61 screen files in `apps/server/src/admin/`, about 28,700 lines of TSX. They draw with `@highsea-tv/ui`'s web renderer (the root export's `default` condition: DOM, Radix and Tailwind) and with their own markup: about 1,740 `className`s and 900 DOM elements of their own (369 `<div>`, 295 `<span>`, 252 `<p>`, and lists, links, headings and definition lists).
- **The admin's prototype** is `design/prototypes/src/admin/`, 48 files and about 24,400 lines, a second copy of the same screens against the mock server, with 1,605 `className`s. Since stage 6 of the prototypes' gaps it also has screens the server doesn't have: Shows, a show, Add a show, and episodes on Wanted, the calendar, Activity, Manual import and Subtitles.
- **The web renderer** (`packages/ui/src/web`) has 38 components, about 5,200 lines. Since part C only the admin, its prototype, the curation preview and the guides' site title draw it. `parity.ts` keeps 42 entries alive "until part D": the `BOTH` components that the native renderer already draws (Button, Field, Select, Dialog, Tabs, Menu, Popover and the rest), and the `WEB_ONLY` admin parts (Sidebar, Table and its parts, WidgetFrame, WidgetEditor, Stat, Sparkline, StatusBar, Stepper, PageHeader, PageScrollbar, CommandPalette, SearchTrigger, ModKey, Tooltip, ConfirmDialog and Radix's parts).
- **The native renderer** (`packages/ui/src/native`) draws every client on the web through react-native-web since part A, in Metro. It imports `react-native` (53 files), `expo-image` (12), `react-native-reanimated` (8 files with animated styles), `react-native-svg`, `react-native-webview` (the Trailer), `react-native-safe-area-context`, `lucide-react-native` and `expo-haptics`.
- **Next.js** builds the admin with Turbopack (the default since Next.js 16), transpiling the workspace packages (`transpilePackages` in `apps/server/next.config.ts`). Nothing aliases `react-native` there yet.
- **The admin's breakpoints** are its own: 600, 1024 and 1440 (`scales.ts`, behind Tailwind's `medium:`), kept until part D by the owner's answer 1 at part A's review. The clients use the form-factor rule (compact below 768).
- **The checks:** `one-place` excepts `apps/server/app/**`, `apps/server/src/admin/**` and `design/prototypes/src/admin/**` until D; `controls.ts` reads the admin; `compare.ts` puts each admin screen beside its prototype; `server.ts` sweeps the admin's production build; the guides' screenshots of the admin come from `scripts/docs-shots/`.

## The size of this part, and its batches

This is the largest part after B: two copies of every admin screen become one, drawn by a different renderer. Three gated batches, each reviewed by the owner ([question 1](#open-questions-for-the-owner)):

- **D1, the foundation.** Next.js hosting the library through react-native-web, with its styles rendered on the server; Reanimated and the library's other dependencies working there; the admin's screens in one place, shared with the prototype; the admin's own parts made library components; the admin's shell (the sidebar, the top bar, the status bar, the command palette) and one page end to end, System › Status, in the admin and its prototype frame, beside its old self.
- **D2, the library and the work.** The dashboard and its widgets, Movies, a movie, Add a movie, Discover, Collections and the collection editor, Wanted and the calendar, Activity and Downloads, Manual import, Subtitles, Now playing, Indexers and Curation with its preview.
- **D3, Settings, System and the flows.** Every Settings area, System's tabs, setup, sign-in, invites, password reset, linking a device, and the not-found page; then `packages/ui/src/web`, Tailwind in the admin and the three exceptions removed, and the guides' admin screenshots retaken.

## Progress

- **2026-11-05, D1, signed off by the owner on 2026-11-05** (with the layout changes approved, and every admin page hidden until it hydrates, answers 1 and 3 below): the admin's screens in one place, `@highsea-tv/admin`, drawn by the server and the prototype alike; Next.js hosting the library's native drawing through react-native-web with its sheet in the server's HTML; and the shell and System › Status on the native renderer.
  - **One copy of the screens:** `packages/admin` holds every admin screen and its messages, moved from `apps/server/src/admin/`, which keeps only the session, the providers and the style registry. The router is the hosts' one difference, behind `navigation.tsx`'s `NavigationProvider` (Next's in `providers.tsx`, wouter's in the prototype). The guides' source comments follow the move; their screenshots are retaken in D3.
  - **Next.js as host** (`apps/server/next.config.ts`): webpack, aliasing `react-native` to react-native-web through `@highsea-tv/ui/next`'s shims, `.web` files first, and the defines react-native-web asks of a bundler; `src/admin/style-registry.tsx` writes the sheet through `useServerInsertedHTML`; the root layout renders per request (`connection()`) and polyfills the frame scheduler Reanimated reads as it loads; Reanimated runs without its Babel plugin, its hooks given their dependency arrays.
  - **The shell and System › Status on the native renderer:** the sidebar from 768 up and a menu below it (the form-factor rule, answer 6), the top bar with the search trigger, the status bar and Status's panels, with the admin's parts as library components in `packages/ui/src/native/admin.tsx` (`Sidebar`, `NavGroups`, `NavItem`, `ServerCard`, `SearchTrigger`, `Kbd`, `PageHeader`, `StatusBar`, `StatusItem`, `Panel`, `Stat`, `TextLink`, `Details`, `Figure`, `Attribution`), each listed in `parity.ts`. The command palette and the menu's sheet stay the web renderer's until D3.
  - **Nothing shows until the page hydrates** (answer 3 below): the server's HTML carries the page, hidden, and react-native-web's sheet (91 of its rules), so a page appears once, styled and laid out at the browser's width, and with JavaScript off it's only the background (`apps/server/src/admin/providers.tsx`).
  - **The prototype holds the same screens:** `design/prototypes/src/admin/shared.tsx` draws `@highsea-tv/admin`'s shell and System › Status on an SDK client over `@highsea-tv/mock`'s transport, signed in as the toolbar's role, at `/admin/system` and `/admin/system/status`; Vite takes the same aliases and defines, with `shimMissingExports` for `expo-modules-core`'s type-only re-exports.
  - **ADRs:** dated sections in 0003 (Next.js on webpack hosting react-native-web, the sheet in the HTML, nothing shown until hydrated, and Node's timers typed beside React Native's), 0018 (the screens shared with their prototype), 0060 (the admin's parts in the native renderer, the shared glyphs and `svgName`) and 0061 (the admin on the library, shared with its prototype).
  - **Checks under Node 26.11.1:** lint (1,725 files), typecheck in every workspace, 12,568 tests pass (8 skipped, 0 fail, 249 files) and the client's 326 Jest tests, smoke, `one-place` (45 in `parity.ts`; 168 screens, 0 parts and 477 values excepted), `controls.ts` and `bundles.ts` clean (web 834 kB and desktop 843 kB gzipped), licences (1,529 packages, 562 crates, 122 pods), the audit (GHSA-mrhx-c7xc-m3w5 excepted until 2026-11-29), and the sweeps clean: pages 3,296, keyboard 319, the D-pad walk, `server.ts` (with the no-JS check) and playback (Chromium 12 s, Firefox 15 s). The comparison sheet pairs the old and new admin with the prototype for the shell and System › Status.
  - **After answer 3** (2026-11-05): lint, typecheck, the library's, the admin's and the server's 833 tests, and `server.ts` clean again, its no-JS check finding the sheet with the page hidden.
  - **Judgement calls:** webpack rather than the plan's Turbopack, whose `resolveExtensions` doesn't reach dependencies (vercel/next.js#97567); the admin's rail removed for the form-factor rule's two layouts, the menu below 768, and status items hidden by window width (`hideBelow`); every admin page rendered per request; the prototype's mock leaving the moved screens' unmocked routes at 501; only `/system` and `/system/status` shared in the prototype; the prototype signing in by itself as the toolbar's role; `shimMissingExports` in the prototypes' build; icons named through `svgName`, which changes the client's web too; the one-place exceptions for the screens still to move; `@highsea-tv/core/timers`' `unref` (and `packages/stream` depending on `core`); Jest's one `testTimeout` of 120 s; the sweeps' row check measuring a control's label (or its input) rather than its box; and the parts left for D2 and D3 (CommandPalette, Stepper, WidgetFrame, WidgetEditor, Sparkline, Tooltip, ConfirmDialog, Table, PageScrollbar).
  - **Found and fixed along the way:**
    - HLS's header race in `packages/stream/src/hls/runner.ts`; the icon glyph generator (`packages/ui/scripts/icons.ts`); the attribution's messages, now in a catalog.
    - `next build`'s type check failed on 30 `.unref()` calls once React Native's timer types joined the server's program; `@highsea-tv/core/timers`' `unref` and the subtitles' cancel functions fix it (ADR 0003). An earlier typecheck had missed it, since only the build's covers `app/`.
    - `main`'s CI has failed since the C1 merge (`37def38`): Jest's first test in each router-rendering file takes about 35 s on a cold cache, as every runner has, against files' own 30 s limits. One 120 s limit in `jest.config.js` fixes it locally, cold (326 pass in 105 s) and warm; CI confirms it only once pushed.
    - The spinners' unnamed progress bars (`aria-hidden` on the `ActivityIndicator` in the player's waiting state and the busy Button).
    - The row check compared a react-native-web control's box, which inherits the page's size, rather than its label's; and then a field's unit rather than its input.
    - The phone's first paint drew the sidebar until hydrating; answer 3 below hides every page until it has hydrated, and the no-JS check now finds the sheet with the page hidden.
  - **The owner's answers to the report's decisions (2026-11-05):**
    1. The layout changes are approved as built: no rail, the sidebar from 768 up and the menu below it, and status items hidden by window width.
    2. The branch is pushed with D1's commit, so CI confirms Jest's limit with it.
    3. **Changed by the owner:** an admin page paints nothing until it has hydrated, rather than a first paint from the server guessed for a phone. Before hydrating, and with JavaScript off, it shows only the page's background (follow-up 1). The phone guess goes (`window-hint.ts`, ThemeProvider's `serverWidth` and the no-JS layout check), while react-native-web's sheet stays in the server's HTML so the page doesn't flash unstyled as it appears (follow-up 2); ADR 0003 records it. Built on 2026-11-05.
  - **Left open:** in `library.jest.tsx`'s pointer tests each test takes a little longer than the last (0.84 s to 1.5 s); not a failure, noted for D2.

- **2026-11-05, D2, signed off by the owner on 2026-11-05:** the library and the work on the library's native renderer: the dashboard and its widgets, Movies, a movie and its versions, Add a movie, Discover, a person, Collections, a collection and its rules editor, Wanted with the cutoff list and the calendar, Activity, Downloads, Manual import and Library import, Subtitles and its tabs, Now playing with its history and Stop, Indexers and its catalog, and Curation with its announcements, sections and preview. Each is ported in `packages/admin`, not redrawn, and the prototype draws the same screens.
  - **The prototype holds them:** `design/prototypes/src/admin/shared.tsx` and `routes.tsx` draw `@highsea-tv/admin`'s screens for every D2 route over `@highsea-tv/mock`'s transport, which now answers the dashboard's, the movies', the work's, the subtitles' and curation's routes (`packages/mock/src/admin/`, with five test files). The prototype's 25 own copies are removed (`design/prototypes/src/admin/activity/` to `wanted/`, `kit/collection-art.tsx`), and with them the 32 flow tests that drove those copies; the screens' own tests are in `packages/admin/test/` (the dashboard and Wanted gained theirs).
  - **What the library gained** (ADR 0060's dated section): `Table` and its parts, `WidgetFrame`, `WidgetGrid`, `WidgetEditor` (dnd-kit on the web), `Sparkline`, `ConfirmDialog`, `Tooltip`, `Toaster`, `TitleLink`, `PageFrame`, `DateTimeInput`, `Image`, and `useClip` and `useWidth`; `Select` on a pointer as a menu under the field, `Menu`'s groups, checks and danger items, `Field`'s `end`, side sheets, and `href` on Button, ControlPress, Poster, Row and SectionHeading. Each is listed in `parity.ts`.
  - **The comparison sheet:** `compare.ts --before` puts each of the 110 admin screens' old drawing (D1's, from a worktree of `ca0dab7`), the new one and the prototype side by side at 1440 and 390, outside the repo. The A4 add dialog's prototype shot now searches for a film the mock hasn't added (Scarlet Street), since the mock's Trending is all in the library. C1's Connect a device sign-in prototype shot still times out, as before D2; it's the client's.
  - **The dense tables, timed against D1's** (5 runs, medians, on the seeded production server, which holds 2 to 9 rows each): rows drawn within 60 ms of D1's (Movies' table 275 → 278 ms, Activity 292 → 296, its History 294 → 238, Blocklist 290 → 232, Wanted 292 → 296, Cutoff 294 → 291, Downloads 253 → 296, Indexers 292 → 295); first paint 188 to 196 ms everywhere; scrolling at 17 ms a frame at the 95th percentile with no long frames; 6 to 27% more elements. Now playing's history and Subtitles have no rows in the seed, so aren't timed. A table of hundreds of rows isn't measured yet.
  - **Found by the sweeps and fixed in the library**, which the clients share:
    - expo-image's web writes `alt` only from `accessibilityLabel`, so every poster and backdrop failed axe's image-alt; the library's one `Image` is decorative unless labelled.
    - `aria-selected` on a radio (axe's aria-allowed-attr): ControlPress writes it only on the roles that take it.
    - A labelled View with no role (aria-prohibited-attr): the non-pressable Poster, FactsCard's linked card, SortableList and Tooltip's trigger are `group`s.
    - **A bordered Button was 38 rather than 36, and a field box around its input 38 too:** both take their 1pt edge out of their padding now. This is visible in the clients, 2 px shorter, and needs the owner's approval (the control spec's height is 36; they were drawn taller than it).
    - A pointer's menu taller than the window ran off it and couldn't be reached (the rules editor's field menu, 1,465 tall in a 900 window): the panel is held to the room it has, on the side with more room, and its items scroll, as Radix's content does.
    - A filled search field was 38, its clear button the control's full height inside the box's edge; it's square inside the edge now.
    - Tab rows and segmented controls too wide for a phone widened the page (Movie's tabs, Discover's): on the web they scroll sideways with the scrollbar hidden, as the web renderer's did.
    - `useSyncExternalStore` without a server snapshot (Sheet) made React give up server rendering a page, and Toaster's made a new array each time; both now give one value.
    - The native ConfirmDialog is a `dialog`, not an `alertdialog` (react-native-web's Modal writes the role), and the pointer Select a menu button: the server sweep, the end-to-end run and the guides' screenshot areas for D2's screens find them by those roles.
  - **Found in the prototype walk and fixed:** an empty string drawn into a View by three title pickers; the fixtures' `data:` SVG art never loading through React Native's Image (react-native-web re-encodes it), so the admin draws artwork with expo-image as the library does; and `@highsea-tv/ui/native` exporting `page-frame` and `date-time` with their extensions, so the bundlers never picked the `.web.tsx` files.
  - **ADRs:** dated sections of 2026-11-05 in 0018 (the library and the work shared), 0060 (what D2 added to the library, and what the sweeps changed) and 0061 (the library and the work moved, and the tables timed).
  - **Checks under Node 26.11.1:** lint (1,740 files), typecheck in every workspace, 12,595 tests pass (8 skipped, 0 fail, 258 files) and the client's 326 Jest tests, smoke, `one-place` (62 in `parity.ts`; 148 screens, 0 parts and 533 values excepted), `controls.ts` and `bundles.ts` clean (web 837 kB and desktop 846 kB gzipped), licences (1,529 packages, 562 crates, 122 pods), the audit (GHSA-mrhx-c7xc-m3w5 excepted until 2026-11-29), and the sweeps: pages admin 1,328 and web 1,272, keyboard admin 166 and web 106, mobile 360 and tv 320, keyboard mobile 45, the D-pad walk and `server.ts` clean (the mobile, tv and D-pad sweeps ran before the Menu's height limit, which only the pointer draws). The image built from this tree (`compose.dev.yaml`) and the end-to-end run through it passed, all eight steps; the image is 2,883 MB against the 2,300 MB budget (expo-image 138 MB, new in the admin with D2, and the React Native packages D1 brought). `main`'s CI image job has failed since D1's merge, with react-native-tvos in the production tree and nothing asking for it; this tree passes that check, so CI would stop at the size step instead. Playback and `layout.ts` weren't run: neither the player nor the clients changed beyond the library's shared fixes.
  - **Differences from the old admin, each visible:**
    - The movie page: the subtitle offset's readout is a status line; the decision badge opens its reasons on press (the hidden reasons text is gone); a disabled button keeps its tooltip through a focusable wrapper; Edit's two columns from the medium width.
    - Subtitles: What changed is a link in the line; forms draw only while open; a compact profile's rows stack.
    - Curation: the preview's hero is the clients' FeaturedCard and its rows the clients' Row with Poster, as the apps draw them; Enter submits only a one-line field.
    - Collections and Wanted: the rule's field menu has its group headings in the pointer Select's menu; dates are typed; the calendar's cells are a seventh wide, at least 96, with today in an accent circle; a collection's posters 144 wide (128 below 768).
    - Activity and Downloads: Add torrent's file field is a Choose a .torrent file button (react-native-web has no file input), with its message `add.fileChoose`; a file's progress bar is 5 tall; a link field is read-only; the detail sheet is 640 wide and the side sheets 416 and 320; the sheet's tabs go back to General when it closes; an import's clash is a live region.
    - The dashboard: a queued item's held reason is a tooltip on its title; the storage widget's empty icon is the inbox; Customize is on the web only.
    - Movies: the tag menu has a TAGS heading; a folder or key error is a line with an icon and a link; the play pill is a Badge with an icon; the summaries share one card.
  - **Judgement calls:** the screens kept their own small parts where the library has none yet (`table-parts.tsx`, `pick-file.ts`, the rules editor's helpers, `inline.tsx`'s runs); the mock answers D2's routes with seeded state (its calls are in `packages/mock/src/admin/`'s comments), leaving the download categories and the catalog's settings at 501 until D3; the prototype's admin person routes by TMDB id, as the server's are (Fritz Lang 98979075, Jan Morgenstern 25211212), with `mara-ellison` dropped, since she's only in a show's cast and the admin has no shows yet; Scarlet Street (1003005) left out of the library, for the add dialog's shot; expo-image a peer of `@highsea-tv/admin`; the library's `Image` decorative by default; the Button's and field's edge out of the padding rather than the spec's height raised.
  - **Left open:**
    - Shows and Music's admin: drafted in the prototype only, as the plan says; not moved.
    - Announcement › Image labels a saved image that isn't among the first 12 films with its URL (8c's behaviour; the seed's backdrop matches no film, so the prototype shows a data URI).
    - The library's gaps the screens met: a Badge that truncates, a table cell spanning columns on the web, a row's title tooltip, a number input with limits, a `MultiSelect`, a heading level for a small EmptyState, a Dialog's fade-out, and a `title` the web keeps (react-native-web drops it). Listed for part E.
    - The guides' screenshots of D2's areas are retaken in D3, with the rest (D1's entry).
    - `library.jest.tsx`'s pointer tests still slow a little, test by test (noted in D1).
  - **The owner's answers of 2026-11-05 to D2's five decisions** (every recommendation but two):
    1. The bordered Button and the field box at the spec's 36 are approved, 2 px shorter in every client.
    2. **Changed by the owner:** the image's size gate is removed. `scripts/image.ts size` reports the size and the largest folders and fails on nothing, and CI's image job reports it (`ci.yml`'s comment keeps the budget's history; ADR 0003's dated section).
    3. The pointer Menu held to the room it has, its items scrolling, stays.
    4. **Changed by the owner:** the tables are timed at a few hundred rows in D3, and D3 looks at TanStack Table for them. Its docs call it headless: "you create a table instance and use its state and APIs to render your own markup" ([Overview](https://tanstack.com/table/latest/docs/overview)), so it would hold the sorting, the column state and the row model behind the library's one native `Table`, which keeps drawing it. For thousands of rows the same page points to TanStack Virtual, whose docs list the web frameworks and not React Native ([Introduction](https://tanstack.com/virtual/latest/docs/introduction)); React Native's own `FlatList` virtualizes on react-native-web too. D3's scope names the choice, with its version under the two-week rule.
    5. The image's build context over 5 GB is fixed in D3: the native build folders go in `.dockerignore`, measured before and after.

## Next.js hosting the library (D1)

- **The alias.** `apps/server/next.config.ts` resolves `react-native` to `react-native-web` and prefers `.web.*` files, through Turbopack's `resolveAlias` and `resolveExtensions` ([Next.js › turbopack](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)), as react-native-web's setup asks of any bundler ([react-native-web › Setup](https://necolas.github.io/react-native-web/docs/setup/)). `transpilePackages` adds the library's React Native dependencies that ship untranspiled source.
- **Styles on the server.** react-native-web documents server rendering through `AppRegistry.getApplication`'s `getStyleElement` ([Rendering › Server API](https://necolas.github.io/react-native-web/docs/rendering/)). In the App Router, Next documents collecting a library's styles during a render and writing them into the HTML with `useServerInsertedHTML` in a client component at the root ([Next.js › CSS-in-JS](https://nextjs.org/docs/app/guides/css-in-js)). The admin's root layout takes one such registry around its children, so a page's first paint is styled. How is [question 3](#open-questions-for-the-owner). D1 proves it on System › Status first, with JavaScript off, before anything else moves.
- **Reanimated.** Reanimated's animated styles need the Worklets Babel plugin, which Next's SWC doesn't run. Its docs give two ways for Next.js: "Web without the Babel plugin", passing each hook its dependency array explicitly, or a Babel loader ([Reanimated › Web support](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/)). Turbopack runs Babel for files outside `node_modules` when it finds a configuration, and for packages only through a configured `babel-loader` ([Next.js › Turbopack › Language features](https://nextjs.org/docs/app/api-reference/turbopack#language-features)). Which is [question 4](#open-questions-for-the-owner).
- **The other dependencies.** `expo-image`, `react-native-svg`, `react-native-safe-area-context`, `lucide-react-native` and `react-native-webview` each run on the web in the client's Metro build. D1 checks each under Turbopack and the server render; any that can't run there gets a `.web` platform file inside the library, listed in `parity.ts` with its reason. `expo-haptics` does nothing on the web.
- **Client components only.** react-native-web's components use hooks and context, so every module that draws with the library is a client component (`'use client'`). Next's pages and layouts stay server components that fetch nothing and render the client screen, as the admin's pages do now (ADR 0018).
- **The CSP.** The admin's pages send no Content-Security-Policy today. If one is added later, the inserted `<style>` needs `style-src 'unsafe-inline'` or a nonce, which react-native-web's `getStyleElement({ nonce })` takes.

## One copy of each admin screen (D1)

- **The screens move into one place** that the admin's pages and the prototype both import ([question 2](#open-questions-for-the-owner)). They read and write only through `@highsea-tv/sdk/react`, as now.
- **The prototype runs the same screens against `@highsea-tv/mock`'s transport,** as the client's prototype does, and its admin frame keeps the prototype's chrome (the device picker, the theme, the role switcher). `design/prototypes/src/admin/` keeps only the prototype's own glue: its routes and its frame.
- **Where the two copies differ today,** the admin as built wins, since it's what the owner signed off against real data. Each difference is listed in the batch's report.
- **Screens only the prototype has** (Shows and Music's admin, stage 6) move as [question 5](#open-questions-for-the-owner) decides.

## The admin's own parts as library components (D1)

The admin's parts move into `packages/ui/src/native`, each drawn once in React Native and ready for any app:

- **Sidebar** (with NavGroup, NavItem and ServerCard), **PageHeader**, **StatusBar** (StatusItem), **CommandPalette** (SearchTrigger, ModKey), **Stepper**, **WidgetFrame**, **WidgetEditor**, **Stat**, **Sparkline**, **Tooltip** and **ConfirmDialog**.
- **Table** (TableFrame, TableToolbar, TableHeader, TableBody, TableRow, TableHead, TableCell, RowActions): drawn with React Native's views, its semantics given by `role` props (`table`, `row`, `columnheader`, `cell`), which react-native-web writes as ARIA roles ([react-native-web › Accessibility](https://necolas.github.io/react-native-web/docs/accessibility/)). Long tables keep the admin's paging; none is virtualized.
- **Radix's parts go.** The native Select, Tabs, Dialog, Sheet, Menu and Popover already take their options and their open state as props, and the admin moves onto those. Their keyboard behaviour follows WAI-ARIA's patterns, as the native Menu's does.
- **The admin's own markup** (its `<div>`s, `<p>`s, lists and definition lists) becomes the library's layout and text parts: `Text` with its roles, `Row`, `page-parts`, and the few layout parts the admin needs and the library lacks (a definition list, a stack with the spacing scale), added once.
- **PageScrollbar** is the native `Scrollbar`, which the clients already draw.

`parity.ts` then lists only what is drawn once and why, and the parity test checks it.

## Every admin screen moved (D2, D3)

- **D2:** the dashboard and its widgets, Movies, a movie and its versions, Add a movie, Discover, a person, Collections, a collection and its rules editor, Wanted, the calendar and the cutoff list, Activity, Downloads, Manual import, Subtitles and its tabs, Now playing with its history and Stop, Indexers, and Curation with its announcements, sections and preview (`curation-frame`).
- **D3:** every Settings area (General, Media management, Quality, Profiles and formats, Sizes, Naming, Download client, categories, Indexers' settings, Subtitles, Lists, Connections, Notifications, Playback, Network, VPN, Security, Users, Tags, Appearance, Backups, Migration), System's tabs (Status, Health, Logs, Updates, Tasks, Backups, Get the apps), setup, sign-in, two-factor, an invite, a password reset, linking a device, and the not-found page.
- **Each screen is ported, not redrawn:** the same parts, words and data, onto the library. `compare.ts` puts the moved screen beside the old one and beside its prototype, for the owner.

## The admin on the form-factor rule (D1)

The admin takes `useFormFactor` like the clients, with compact below 768 ([question 6](#open-questions-for-the-owner)). The sidebar collapses to its sheet below 768 rather than 600, and the wide layout begins at the rule's wide width rather than 1440. Where that moves a locked layout, the batch's report lists it.

## What's removed (D3)

- The guides' site title (`apps/docs/components/site-title.tsx`) onto the native `Lockup` through react-native-web (answer 9), then `packages/ui/src/web` and its `styles.css`, Radix, `cmdk` and the other dependencies only it uses, and the `./web` export.
- Tailwind in `apps/server` and the admin's prototype ([question 7](#open-questions-for-the-owner)), and the tokens' Tailwind theme where nothing reads it.
- The three `"until": "D"` exceptions in `scripts/one-place-exceptions.json`, the `apps/server/` entries in `scripts/control-exceptions.json`, and every "until part D" reason in `parity.ts`.
- `bundles.ts` checks the admin's client bundle for `react-native-web` and the library's native renderer only.

## Checks

- **Each batch:** lint, typecheck, the tests, smoke, `one-place`, `controls.ts`, `bundles.ts`, and the sweeps over what moved: `server.ts` over the admin's production build (axe in three themes, overflow, 200% text, reduced motion, the keyboard walk) and `pages.ts admin` over the prototype.
- **The comparison sheet** (`compare.ts`) for every moved screen: the old admin, the new admin and its prototype, side by side, for the owner.
- **The server render:** a test that loads System › Status (D1) and then every admin page (D3) with JavaScript off and finds its styles in the HTML.
- **The guides' admin screenshots** retaken in D3 (`scripts/docs-shots/run.ts`), and each guide whose page looks different updated with it.
- **The dense tables at scale (D3, the owner's answer 4 to D2):** Movies, Activity and Wanted timed with a few hundred rows against D2's numbers, with TanStack Table looked at behind the library's `Table`.
- **The image's build context (D3, the owner's answer 5 to D2):** the native build folders in `.dockerignore`, the context measured before and after.
- **The full checks** before each batch's report, under Node 26.11.1.

## ADRs

- **No new ADR:** part D carries out ADR 0061's decision for the admin. One is written only if question 3 or 4 departs from it.
- **Dated sections:**
  - 0061: the admin on the library, and where its screens live (D1); the admin's screens moved (D2, D3); the web renderer removed (D3);
  - 0060: the admin's parts as library components, and the web renderer gone (D1, D3);
  - 0003: Next.js hosting react-native-web, its alias and the styles rendered on the server (D1);
  - 0018: unchanged in substance; a note that the admin's screens are shared with the prototype through the SDK and the mock transport (D1).

## Risks

- **Server rendering in the App Router.** react-native-web documents its server render for its own `AppRegistry`, not for streamed React Server Components. A page whose styles reach the HTML after its markup flashes unstyled. D1 proves the registry on one page with JavaScript off, and on a slow stream, before moving anything else.
- **Reanimated under Turbopack.** Reanimated 4 has an open report of Next.js App Router no longer working with its Babel plugin forced ([react-native-reanimated#8254](https://github.com/software-mansion/react-native-reanimated/issues/8254)). Its documented path without the plugin needs every animated hook's dependencies written out, in the library's 8 files with animated styles. A missed dependency animates stale values on the clients too, so they're checked on every target.
- **Dense tables in React Native views.** The admin's tables are its densest screens (Activity, Wanted, Logs, the indexers). react-native-web's views are `div`s with atomic CSS, so a long table renders more DOM and more class names than today's `<table>`. Each table is measured in D2 against today's (time to first paint and scrolling), and paged as now.
- **Keyboard behaviour Radix gave for free.** Focus trapping in dialogs, typeahead in selects, roving focus in tabs and menus. The native parts already do these for the clients' pointer layout; the keyboard sweep over every admin page is what proves them.
- **Two copies drifted.** Where the admin and its prototype disagree, choosing the admin may undo prototype changes the owner approved after the admin was built (stage 5's fixes were made in both). Each difference is listed, not silently chosen.
- **Size.** About 53,000 lines of screens become about 29,000, but every line is touched. The batches keep each review to one area.

## Open questions for the owner

1. **Three batches.**
   **Recommended:** D1 (the foundation, the shell and System › Status), D2 (the library and the work) and D3 (Settings, System, the flows and the removals), each reviewed. The foundation's risks are proved on one page before 115 files move.
   Or: two batches, the foundation with the library's screens, then the rest. Fewer reviews, but the server render and Reanimated are proved alongside thirty screens.
   Or: one batch. One review of everything at once.
2. **Where each admin screen lives once.**
   **Recommended:** a new workspace package, `@highsea-tv/admin` (`packages/admin`), holding the screens, their messages and their page parts; `apps/server/app/` keeps only Next's thin pages, and the prototype imports the same screens. It's the same shape as `apps/client` and its prototype frames, with the server and the prototype both depending on a package rather than on each other.
   Or: the screens stay in `apps/server/src/admin`, and the prototype imports them from there. No new package, but the prototype reaches into an app.
   Or: the prototype keeps its own copy. That's the drift this plan exists to end, and `one-place` would keep an exception for it.
3. **Styles rendered on the server.**
   **Recommended:** Next's documented registry: a client component at the admin's root that collects react-native-web's style sheet during the render and writes it with `useServerInsertedHTML`, so each page's first paint is styled.
   Or: the admin's screens render only in the browser, behind the shell's loading state. Simpler and safe from a flash of unstyled markup, but every page shows a skeleton first, as on a cold load today.
   Or: the admin becomes an Expo web export like the client, with Next.js only serving it. That's one bundler everywhere, but reopens the parent plan's answer that Next keeps the admin's routing.
4. **Reanimated in Next.js.**
   **Recommended:** the documented "web without the Babel plugin": the library's 8 files with animated hooks pass their dependency arrays explicitly, which is valid on every platform, with ESLint's `exhaustive-deps` rule told about Reanimated's hooks so a missed one fails lint.
   Or: a `babel-loader` with the Worklets plugin for the library under Turbopack. No change to the library, but the admin's build runs Babel over it, and Reanimated's report says that path has broken in the App Router.
   Or: `.web` platform files for those parts with CSS transitions, leaving Reanimated off the web. Lighter on the web, but each animated part is then drawn twice.
5. **The admin's screens only the prototype has** (Shows and Music, from stage 6).
   **Recommended:** they move with the rest and are drawn only when public info's `sources` lists them, on drafted routes the server answers 501, as B3 did for the clients. The mock lists them; a real server's admin looks as now.
   Or: they stay in the prototype as an exception in `one-place` until their phase. Less work now, but a second copy of those screens' parts remains.
6. **The admin's breakpoints.**
   **Recommended:** the admin takes the form-factor rule (compact below 768) with the clients, ending the admin's own 600, 1024 and 1440. One rule everywhere; between 600 and 767 the admin shows its compact layout.
   Or: the admin keeps 600, 1024 and 1440 as its own form factors in the tokens. No layout moves, but two rules stay.
7. **Tailwind.**
   **Recommended:** gone from `apps/server` and the admin's prototype by the end of D3, every style coming from the library and the tokens. Next's `globals.css` keeps only the tokens' CSS variables and the document's reset.
   Or: kept for page-level layout around library components. Faster, but the admin keeps writing sizes and colours outside the library.
8. **What may look different.**
   **Recommended:** the admin matches its signed-off look, and every visible difference react-native-web brings (text rendering, focus rings, a scrollbar, a control's exact size under the control spec) is listed in its batch's report for the owner to accept or have fixed.
   Or: the library's drawing is accepted as the admin's look wherever the control spec already decides it, and only layout differences are listed. Fewer items to review, but small changes land without the owner seeing them.
9. **The guides' site title.**
   **Recommended:** in D3 the guides' `Lockup` moves onto the native one through react-native-web, so `packages/ui/src/web` is removed entirely in part D.
   Or: the web renderer keeps only `Lockup` until part E moves the guides' parts. One small exception stays for a part.

## The owner's changes

## The owner's answers

On 2026-11-04 the owner took every recommendation for questions 1 to 9:

1. Three batches, D1, D2 and D3, each reviewed.
2. The screens live once in a new workspace package, `@highsea-tv/admin` (`packages/admin`); `apps/server/app/` keeps Next's thin pages, and the prototype imports the same screens.
3. Styles reach the first paint through Next's documented registry: a client component at the admin's root writing react-native-web's style sheet with `useServerInsertedHTML`.
4. Reanimated runs without its Babel plugin, as its docs describe: the library's animated hooks pass their dependency arrays, and lint catches a missed one.
5. Shows and Music's admin screens move with the rest, drawn only when public info's `sources` lists them, on drafted routes the server answers 501.
6. The admin takes the form-factor rule, compact below 768, ending its own 600, 1024 and 1440; moved locked layouts are listed.
7. Tailwind is gone from `apps/server` and the admin's prototype by the end of D3.
8. The admin matches its signed-off look, and every visible difference is listed in its batch's report.
9. The guides' `Lockup` moves onto the native one in D3, so `packages/ui/src/web` is removed entirely in part D.
