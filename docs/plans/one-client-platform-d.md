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
