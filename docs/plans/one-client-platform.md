# One client platform: every client and its prototype on one React Native codebase

- **Status:** Scoped on 2026-11-02 at the owner's request, and approved with [the owner's answers](#the-owners-answers) of 2026-11-02: every recommendation but two, with [two changes](#the-owners-changes). Nothing is built.
- **The owner's words (2026-11-02):** "we should never have to update a design token, component, layout, element, etc. in more than one place, with very rare exceptions." Then: "this is *FOUNDATIONAL* and *PARAMOUNT* to the development and ongoing growth of the highsea application(s). the only real exception is the admin - all clients should share the exact same design system, tokens, components, packages, etc. using React Native - but even then, the admin should still make as much use of the same design system, tokens, components, packages, etc. as possible to achieve maximal parity and consistency."

## Read first

1. This plan's [Why](#why-design-system-11-didnt-get-there): what design system 1.1 left in two places, and how part C of the apps' catch-up showed it.
2. [ADR 0008](../adr/0008-clients-react-everywhere.md) (React everywhere), [ADR 0053](../adr/0053-clients-build-and-distribution.md) (the clients' builds), [ADR 0055](../adr/0055-clients-shared-logic.md) (the shared logic), [ADR 0058](../adr/0058-desktop-app.md) (desktop), [ADR 0059](../adr/0059-native-apps.md) (the native apps) and [ADR 0060](../adr/0060-one-design-system-one-library.md) (one library, two renderers). This plan replaces parts of each.
3. [design-system-1-1.md](design-system-1-1.md): the control spec, the platform rules and the owner's answers. All of these stand. What changes is how they're drawn.
4. [apps-catch-up.md](apps-catch-up.md): parts A and B (signed off) and part C (built, then found to drift). This plan replaces its parts C to E.
5. The code: `packages/ui` (`src/shared`, `src/web`, `src/native`, `src/native/tv`), `packages/client`, `packages/native`, `packages/sdk`, `apps/web`, `apps/desktop`, `apps/mobile`, `apps/tv`, and the prototypes' `design/prototypes/src/{client,web,mobile,tv,mock,chrome}`.
6. The platform guides in `docs/design-language/platforms/` and `docs/design-language/controls.md`.

## Goal

Every highsea client is one React Native codebase, with one design system, one set of tokens, one component library and one copy of each screen: the web client, the desktop app, the phone and the TV, on every OS each runs on. Each client's prototype is that same code, run in the browser against the mock server. A token, component, element or layout is defined in one place. Changing it there changes every client and every prototype. The exceptions are rare, each is listed with its reason, and a check fails on anything else.

The admin is the one exception to React Native as an app: it stays hosted by Next.js (ADR 0003). Everything it draws comes from the same library, through react-native-web, its own parts included: the tables, the sidebar, the widget grid, the command palette, the status bar and the stepper. A client or a companion app can then use any of them later (the owner's change 1). The DOM is drawn directly only where react-native-web can't do something, and each case is listed. The admin shares the tokens, the control spec, the icons, the strings, the SDK and the shared logic as it does now.

The public guides keep Fumadocs for their search, sidebar and MDX, and draw their own parts (callouts, badges, buttons and figures) from the same library.

What may still differ between clients is what design system 1.1 already allows, now applied by rule inside one codebase rather than across several:

| May differ, by a rule in the shared code | May not differ |
| --- | --- |
| A control's size by input: pointer, touch or the TV (the control spec's rules) | Which component draws anything, its props and its looks |
| Layout by form factor: columns, where the navigation sits, how many items a row shows | Which screen a destination is, its parts and its words |
| The platform's own engines: video playback, TV focus, the keychain, discovery, haptics | A colour, a size or a corner written anywhere but the tokens |

### Why design system 1.1 didn't get there

Design system 1.1 gave each component one props type, but two drawings, a web one and a React Native one. It also kept every screen in three or four copies:

- **Two drawings of each component.** `packages/ui/src/web` (DOM and Tailwind) and `packages/ui/src/native` drew the same component separately, so their measures drifted. Part C's compare sheet showed this on 2026-11-02:
  - the native Banner had a 36pt disc and 17pt text, the web's 32 and 13;
  - the native Switch was iOS's UISwitch, the web's a drawn track;
  - `usePosterWidth` took a share of the screen, the prototype's `w-[30%]` a share of the row inside its gutters, so every phone row was about 8% wide.
- **A copy of each screen per app and per prototype.** The phone prototype (`design/prototypes/src/mobile`, 23 files) is HTML drawn with the web renderer. The phone app (`apps/mobile/src`, 26 files) is a port re-typed in React Native. The same holds for the web client (`apps/web`, 21 files, beside `design/prototypes/src/web`'s 24) and the TV (`apps/tv`, 18 files, beside `design/prototypes/src/tv`'s 26). Settings on the phone ended up an iOS grouped list where the prototype draws cards.
- **No check compared what's drawn.** The parity test checks that both renderers export the same names. The controls check finds controls drawn by hand. Neither notices two drawings that disagree, and the compare sheets were read by eye.

## Out of scope

- **The admin's app moving off Next.js.** Next keeps its routing and serving (the owner's answer to question 4's follow-up). Everything it draws moves onto the library in part D.
- **Fumadocs itself.** The guides keep its search, sidebar and MDX (question 8). Their drawn parts move onto the library in part E.
- **New screens or features.** Shows, music, profiles and downloads keep their own phases (prototype-gaps.md's stages 7 and 8, 4.6). This plan moves what exists onto one codebase, and they're built on it afterwards.
- **Android and Android TV builds.** They come from the same Expo project almost for free, but are checked and released in 4.5c as planned.

## Where things stand

- **One component library with two renderers:** `@highsea-tv/ui` (ADR 0060). `src/shared` has the props, `src/web` the DOM renderer, and `src/native` the React Native renderer with the TV's rule in `src/native/tv`. The root export picks one by the `react-native` condition, and `src/shared/parity.ts` lists what each side draws.
- **One control spec,** in `@highsea-tv/tokens` (`controls.ts`, `controlMetrics`), with the pointer, touch and TV rules. This stays as it is.
- **The shared logic** is in `@highsea-tv/client` (player, library, servers, format, prefs, data; ADR 0055), and the native-only logic in `@highsea-tv/native` (servers in the keychain, discovery, the session, `playback.ts` on expo-video).
- **The clients:**
  - `apps/web`: Vite and React, served at `/web`, drawn with the web renderer and Tailwind;
  - `apps/desktop`: Tauri 2 around `apps/web`'s desktop build;
  - `apps/mobile`: Expo SDK 58 on react-native-tvos 0.88, with Expo Router;
  - `apps/tv`: the same stack, a separate Expo project.
- **The prototypes:** one Vite app (`design/prototypes`) holding the admin, the web, desktop, phone and TV screens, drawn with the web renderer, with the phone's and TV's frames setting the touch and TV rules, against an SDK-shaped mock server (`src/mock`).
- **The versions Expo SDK 58 expects** for the web (its `bundledNativeModules.json`): `react-native-web` ~0.21.4, `react-dom` 19.3.0 and `@expo/metro-runtime` ~58.0.14.
- **Part C of the apps' catch-up** is in the working tree, uncommitted. It has the native `SortableList`, `Lockup` and `Rating`, the drawn `Switch`, the web's `QualityTag`, and Settings and Choose a server redrawn from the prototype. [Question 9](#open-questions-for-the-owner) decides what happens to it.

## The architecture

### One Expo project for every client (A)

The phone, the TV and the web client become one Expo project, `apps/client`, replacing `apps/mobile`, `apps/tv` and `apps/web` (question 1):

- **The phone and the TV** are its iOS, tvOS, Android and Android TV builds. react-native-tvos builds phone and TV from one project ([Expo › Building for TV](https://docs.expo.dev/guides/building-for-tv/)), with `EXPO_TV=1` choosing the TV's native project at prebuild, as `apps/tv` does now.
- **The web client** is its web build: `expo export -p web` ([Expo › Publish websites](https://docs.expo.dev/guides/publishing-websites/)), through react-native-web, as a single-page app (`web.output: 'single'`, [app config](https://docs.expo.dev/versions/latest/config/app/)). It's served under `/web` with `experiments.baseUrl: '/web'`, which Expo documents for "a website relative to a subpath of a domain". The server serves the export as it serves `apps/web`'s `dist/` today (ADR 0003's 4.2a section): the fallback to `index.html`, the hashed assets cached for good, and the CSP.
- **The desktop app** stays Tauri 2. It wraps the client's web export instead of Vite's, with its Rust side unchanged (`proxy.rs`, the keychain, discovery, single sign-on). Tauri takes any folder of static files as its frontend ([Tauri › Frontend configuration](https://v2.tauri.app/start/frontend/)).
- **Routes:** one tree in `apps/client/src/app/` for every target. The navigation shell is one layout that picks its form by the form-factor rule (below): the tab bar on a phone, the head on a TV, the sidebar and top bar on the web and desktop.
- **The bundles stay apart.** Metro builds each platform separately. `scripts/bundles.ts` keeps checking that the web bundle carries no native module and the native ones no DOM.

### One copy of each screen, laid out by rule (B)

Each destination is one screen file, built from the library's page parts, laid out by a **form-factor rule** (question 2):

- **The rule** joins design system 1.1's input rule (pointer, touch, TV) with a width class: compact (a phone, the web below 768), regular (a tablet or the web from 768), and TV. It's defined once, in `@highsea-tv/tokens` beside the control spec, and read through one hook in the library (`useFormFactor`). A screen asks the rule, never the OS (as shared code asks `Platform.isTV` today).
- **The parts** are the library's: `Poster`, the rows, `Banner`, `FactsCard`, `PersonTile`, `NamedAction`, `LetterIndex`, `SortableList` and the TV's parts, which become form-factor forms of one part where they're the same idea (`TvRow` and `Row`, `TvPersonTile` and `PersonTile`, `TvInfoCard` and `FactsCard`).
- **Where today's three designs of a screen differ only in size or columns,** they become one layout with the rule's values. Where they differ in what the screen does (the TV's focus rows against the phone's scrolling page), the screen keeps one composition per form factor in the same file, on the same parts and the same logic, and the plan lists each one.
- **The prototypes are locked,** so every screen that converges is put beside its old prototype for each form factor, and the owner approves the changes, as design system 1.1's part C did.

### The prototypes are the clients (A, B)

The client prototypes stop being separate code (question 3):

- **The mock server becomes a transport for `@highsea-tv/sdk`:** `design/prototypes/src/mock` answers the SDK's calls in memory, as it does now, but behind the same client the real apps use. So a client running "as a prototype" is the real client with the mock in place of the network.
- **The prototypes' web, phone and TV screens are the client's web build,** run in the prototypes' chrome: the device frames, the toolbar of states and the launcher stay in `design/prototypes`, and each frame holds the client at that form factor's rule against the mock. The toolbar's states (an empty library, a failed load, an announcement that must be acknowledged) are the mock's states, as today.
- **`design/prototypes/src/{web,mobile,tv,client}`** are removed once every screen they hold is in `apps/client`. What's in `src/client` that's logic (connect, the continue menu, downloads, pairing, settings sections) moves to `@highsea-tv/client` first, as part A of the apps' catch-up began.
- **Prototyping a new screen** means building it in `apps/client` against the mock, and the owner approves it there. Wiring it to the server is then the SDK's route, with no port.

### One component library on React Native (A)

`@highsea-tv/ui` keeps one drawing of each component, in React Native, and runs on the web through react-native-web:

- **`src/native` becomes the library.** Each component's React Native drawing is the only one. On the web, the client's Metro build resolves `react-native` to `react-native-web`, as Expo does by default.
- **`src/web` goes.** The admin's own parts (the sidebar, tables, the widget grid and editor, the command palette, the status bar and the stepper) are drawn in React Native like every other component, so a client or a companion app can use them later. What react-native-web can't do (listed in `parity.ts`, each with its reason) is the only DOM left in the library.
- **The platform's engines stay platform files, behind one component:**
  - **video:** `@highsea-tv/native`'s player keeps expo-video on iOS, tvOS and Android. On the web it keeps today's engine (`<video>` with hls.js, `apps/web/src/playback.ts`), as `playback.web.ts`. expo-video's web player sets the `<video>`'s `src` directly (`VideoPlayer.web.tsx` and `VideoView.web.tsx` in expo-video 58.0.11), so it plays HLS only where the browser does, which is Safari. The same props and the same player screen sit on top;
  - **TV focus:** `Focusable` and the TV's parts keep tvOS's and Android TV's own focus engines on those devices. In a browser they take a web focus engine behind the same props, moved from the TV prototype's spatial focus (question 5). This is also what a webOS or Tizen build would use (ADR 0008);
  - **the keychain, discovery and single sign-on:** native modules on the phone and TV, the desktop's Rust side in the desktop app, and the session cookie on the web, behind `@highsea-tv/native`'s interfaces as now.
- **What react-native-web doesn't do, the library does once:** hover (react-native-web's `Pressable` reports `hovered`), the keyboard (focus rings and keys on `Pressable`), and scrollbars. Nothing is done per screen.
- **`parity.ts` becomes the list of exceptions,** each with its reason: a platform file behind a component, or a part only one form factor has. The parity test checks that list and nothing else.
- **No Storybook** (question 10). `apps/storybook` and `bun run storybook` are retired in part A, with the web renderer they show. The workbench is `apps/client` against the mock server, in the prototypes' frames, where every component is seen in the screens that use it.

### The admin, drawn only with the library (D)

The admin stays a Next.js app, and draws nothing of its own (the owner's change 1, and the answer to question 4's follow-up):

- **The same tokens, control spec, icons, strings, SDK and shared logic,** as now.
- **Every component it draws is the library's React Native drawing,** through react-native-web in its client components. That includes its own parts: the sidebar, tables, the widget grid and editor, the command palette, the status bar and the stepper. Each becomes a library component, ready for a client or a companion app. react-native-web's documented setup for a web app aliases `react-native` to `react-native-web` in the bundler ([react-native-web › Setup](https://necolas.github.io/react-native-web/docs/setup/)), and its styles are rendered on the server ([Rendering on the server](https://necolas.github.io/react-native-web/docs/rendering/)).
- **What react-native-web can't do stays DOM,** listed in `parity.ts` with its reason. Next's own pages and layouts are the host, not a drawing.
- **The admin's prototype** (`design/prototypes/src/admin`) draws with the same library, as the admin does, so the two still match.

### The guides, drawing their parts from the library (E)

The guides at `docs.highsea.tv` keep Fumadocs' search, sidebar and MDX (question 8). Their own drawn parts are the library's components through react-native-web: the callouts, badges, buttons and figures in the guides' MDX. Fumadocs' frame takes the tokens, as it does now.

### Checks that fail on drift (A to E)

- **One definition.** `scripts/one-place.ts` (new) fails when a component, a screen or a page part is defined in more than one place: a component in two renderers without a listed reason, a screen outside `apps/client`, a client screen in `design/prototypes`, or a colour, size or corner written outside the tokens. Exceptions go in a listed file with a reason, as the licence exceptions do.
- **The same screen everywhere.** Each screen is captured against the same mock data on the web at each form factor, on the iPhone simulator and on the Apple TV simulator. The script compares their layout boxes and text from the accessibility tree, not by eye. A screen whose parts differ in position or size beyond the rule's own differences fails. The screenshots stay for the owner's review.
- **Bundles, controls and the sweeps** keep their checks: `scripts/bundles.ts`, `scripts/controls.ts`, axe in three themes, overflow, 200% text, reduced motion, and the keyboard and D-pad walks. They now run against the one client's web build and its device builds.

## The size of this, and its parts

This is the largest change since Phase 3: every client screen moves once, and three apps and three prototype folders become one project. It comes in five gated parts, each reviewed by the owner:

- **A, the foundation.** `apps/client` with its phone, TV and web builds; react-native-web in the library; the form-factor rule; the mock as an SDK transport and the prototypes' chrome around the client; the web player and web TV focus as platform files; Storybook retired; and the checks. It starts from part C's uncommitted work (question 9), committed on its own first when the owner says. It's proved by one destination end to end on every target and in its prototype frame: Choose a server and its sign-in, then Settings, since part C's review found both drawn wrong.
- **B, every client screen once.** C1 to C8 and the player, moved into `apps/client` from the best of today's app and prototype code, each converged screen put beside its old prototypes for the owner. `apps/mobile`, `apps/tv`, `apps/web` and the prototypes' client folders are removed as their screens move.
- **C, the builds and how they ship.** The server serving the client's web export at `/web`; the desktop app around it; `native.yml`, `desktop.yml`, the release workflow, the end-to-end run's `/web` step, and the playback sweep in Chromium and Firefox on the new web build.
- **D, the admin.** Everything it draws on the library through react-native-web, its own parts made library components, and its prototype the same; every admin screen beside its old self (`compare.ts`) and the guides' screenshots retaken.
- **E, the guides, the specs and the full checks.** The guides' drawn parts on the library, the design language's platform guides on the form-factor rule, the product specs naming one screen per destination, the ADRs, `CLAUDE.md`, and every check.

## Progress

### 2026-11-03: part A built, waiting for the owner's review

- **`apps/client`** (`@highsea-tv/app`) is one Expo project, on SDK 58 and react-native-tvos 0.88, for the phone, the TV and the web.
  - The web is built with `expo export -p web`, `web.output: 'single'` and `experiments.baseUrl: '/web'`. `EXPO_TV=1` at prebuild makes the TV project.
  - It has one route tree and one shell, picked by the form-factor rule.
  - Its first destinations, the proof, are the gate, Choose a server, its sign-in, the signed-in shell and Settings. Their shared parts are in `src/kit.tsx`.
  - It was built and run on the iPhone simulator, the Apple TV simulator and the web.
  - `apps/mobile`, `apps/tv` and `apps/web` still build and work. Their screens move in part B.
- **The library on react-native-web.** `packages/ui/src/native` is the only drawing for the clients. Hover, the focus ring on Tab, Space on keyup, ARIA state, the drawn scrollbar and the 44 hit layer are each done once, in platform pairs (`dom.ts`/`dom.web.ts`, the scrollbar pair). 52 literal values moved onto tokens, and `parity.ts`'s `BOTH` has a reason for each of its 29 entries. `src/web` stays for the admin until part D.
- **The form-factor rule** is in `@highsea-tv/tokens` (`form-factor.ts`, with `TV_REFERENCE` in `controls.ts`) and is read through `useFormFactor`.
  - Input is pointer, touch or tv; width is compact (below 768), regular or tv.
  - ThemeProvider also takes `fontScale` and `reducedMotion`.
- **The mock as an SDK transport.** `@highsea-tv/mock` moved out of `design/prototypes`. It answers 22 routes and returns 501 for the rest. The new pure subpaths it needs are `@highsea-tv/core/errors`, `auth/codes` and `subtitles/providers/info`, and personalization's `keys.ts`.
- **The prototypes' frames hold the client.** `bun run prototypes` serves the client's mock export (`apps/client/dist-mock`) at `/web`. A stamp of its inputs means it's rebuilt only when stale, and `HIGHSEA_CLIENT_EXPORT=0` skips it. The toolbar reaches the client through `@highsea-tv/mock/frame`, a postMessage channel that checks origins. The prototype's own copies of Choose a server, sign-in and Settings were deleted once the compare sheet had been made.
- **Platform files:**
  - `@highsea-tv/native/playback` plays the web through `<video>` and hls.js (`playback.web.ts`). `apps/web` plays through it now; the playback sweep passed in Chromium and Firefox.
  - The TV's web focus engine sits behind `Focusable` (`packages/ui/src/native/tv/spatial`, `engine.web.tsx`). The D-pad walk reaches all 41 routes.
  - `apps/client/test/platform-files.test.ts` holds the pattern: every `.web` file has a native pair, with an entry under `react-native`.
- **Storybook is retired:** `apps/storybook` is removed.
- **The checks:**
  - `bun run one-place` fails when something is defined twice. It found 0 failures, with 36 listed exceptions until parts B to E.
  - `scripts/sweeps/layout.ts` compares each screen's layout boxes and text from the accessibility tree, between the web and the iPhone and Apple TV simulators (an XCUITest in `apps/client/uitest`). The tolerance is 4 pt with no allowance for text shaping. In the final run, all 8 pairs matched.
  - `bundles.ts` and `controls.ts` read `apps/client`. Wiring the client's bundles into CI is left for part C.
  - The sweeps reach the client through the frames.
- **Found and fixed on the way:**
  - `letterSpacing: 0` turned kerning off on iOS, so Text leaves it unset.
  - Fabric flattened labelled groups (`collapsable={false}`).
  - The TV's Menu key is held through `TVEventControl.enableTVMenuKey()` and let go at a screen's root.
  - expo-web-browser is loaded only off the TV.
- **ADRs:** 0061 (Proposed) and dated sections in 0003, 0008, 0053, 0055, 0058, 0059 and 0060.
- **Calls, prototype changes and questions:** these are in the checkpoint report. The owner reviews the converged screens on its compare sheet.

## ADRs

- **0061, one client platform on React Native** (new): every client and its prototype in one Expo project on one library, the web through react-native-web, the form-factor rule, the platform files allowed behind a component, the mock as an SDK transport, and the checks that hold it.
- **Dated sections:**
  - 0003: the server serves the client's Expo web export at `/web`;
  - 0008: React Native everywhere: every client, and every component the admin and the guides draw;
  - 0053: the web client's build is Expo's, and the phone, the TV and the web are one project;
  - 0055: the prototypes' client logic moved in, and the mock as a transport;
  - 0058: the desktop app around the Expo web export;
  - 0059: `apps/mobile` and `apps/tv` joined in `apps/client`;
  - 0060: one drawing per component, in React Native, superseding the two renderers.

## Risks

- **Every client screen changes.** Today's three designs of a screen become one, so each converged screen needs the owner's approval for each form factor. Part B lists them all, beside their old selves.
- **react-native-web has no CSS.** The web client's grids, `position: sticky`, `:hover` styles and media queries become flexbox, `Pressable`'s states and the form-factor rule. The web client and its prototype (about 11,000 lines between them) are rewritten, not moved.
- **The web bundle grows** with react-native-web and the library. It's measured against today's 1.41 MB (406 kB gzipped) and reported. The player's hls.js chunk stays separate.
- **`experiments.baseUrl` is under Expo's experiments.** It's documented for subpaths. If it misbehaves, the documented fallback is serving the export at `/web` with the server rewriting paths.
- **react-native-web in Next's App Router** (part D) needs its styles rendered on the server, or the admin flashes unstyled. Part D proves it on one page first.
- **The admin's dense parts in React Native.** Its tables hold thousands of rows (the 100k cases from 9a), and the web's `<table>` gives column widths and sticky headers for free. The library's table is drawn on `FlatList`'s virtualisation, which react-native-web supports, and is measured against the admin's 100k cases before any page moves.
- **Accessibility on the web** comes from react-native-web's mapping of `role` and `aria-*` props to the DOM. The axe sweep in three themes holds it to today's level on every page.
- **The TV in a browser** uses a web focus engine while the devices use their own, so a D-pad walk can pass in the browser and fail on the device. The TV's walk keeps running on the Apple TV simulator (`scripts/sweeps/tv.ts`).

## Open questions for the owner

1. **One project, or one per form factor.**
   **Recommended:** one Expo project, `apps/client`, for the phone, the TV and the web (and so the desktop app), with one route tree and one shell that picks its form by rule. Expo builds phone and TV from one project, and the web from the same with `expo export -p web`.
   Or: three Expo projects (phone, TV, web) sharing one screens package. The navigation and the app configs are then kept three times, which is the duplication this plan removes.
2. **One screen per destination.**
   **Recommended:** one screen file per destination, laid out by the form-factor rule from the library's parts. Where the form factors genuinely do different things, there's one composition per form factor in the same file, on the same parts, each listed. Today's designs converge, and the owner approves each converged screen beside its old prototypes.
   Or: one screen file per form factor, sharing parts and logic. That means fewer changes to the locked prototypes, but a layout change is again made up to three times.
3. **The client prototypes.**
   **Recommended:** the client prototypes are `apps/client` itself, run on the web against the mock server as an SDK transport, inside the prototypes' frames and toolbar. A new screen is prototyped by building it there.
   Or: keep the prototypes separate, importing `apps/client`'s screens into the Vite app through react-native-web. That's one less build to run, but Expo Router and the Expo modules the screens use don't run in Vite, so the screens would need a second navigation layer.
4. **How much the admin shares.**
   **Recommended:** every control and part the admin shares with the clients is the library's React Native drawing through react-native-web, in its client components. Only the admin's own parts (tables, the sidebar, the widget grid, the command palette, the status bar and the stepper) stay DOM, on the same tokens.
   Or: the admin keeps the DOM renderer for every component, on the same tokens and control spec, with a test measuring each shared component in both drawings. That's no react-native-web in Next, but two drawings of every control, held equal by a test rather than by being one.
5. **TV focus in the browser.**
   **Recommended:** tvOS's and Android TV's own focus engines on the devices, and a web focus engine behind the same `Focusable` in the browser, moved from the TV prototype's spatial focus. A webOS or Tizen build would use it too.
   Or: one JavaScript focus engine everywhere ([react-tv-space-navigation](https://github.com/bamlab/react-tv-space-navigation)). That's one engine, but tvOS's own focus (its parallax, its sounds and the Siri Remote's swipes) is given up on the Apple TV.
6. **The web player.**
   **Recommended:** the player screen and its controls are one, and on the web the engine underneath is today's `<video>` with hls.js, as `playback.web.ts`. expo-video's web player hands HLS to the browser, which only Safari plays.
   Or: expo-video on every platform, with the web playing HLS in Safari only and remuxed MP4 elsewhere. That's one engine, but the server must make MP4s for Chrome and Firefox that it doesn't make now.
7. **Order.**
   **Recommended:** this plan first. Prototype-gaps' stages 7 and 8, Android (4.5c) and downloads (4.6) wait and are built on it. Design system 1.1's review folds into part A's, since its spec stands and its two renderers go.
   Or: finish 4.5c first, then this. But Android would then be built on the code this plan replaces.
8. **The guides (`apps/docs`).**
   **Recommended:** they keep Fumadocs, with the tokens, as now. They're the public docs, not a client.
   Or: the guides' controls on the library through react-native-web too. That gives the most sharing, but Fumadocs' search, sidebar and MDX would be rebuilt.
9. **Part C's uncommitted work.**
   **Recommended:** keep it as part A's starting point and commit it on its own when you say, as "part C as far as it went", since its native `SortableList`, `Lockup`, `Rating`, drawn `Switch` and `QualityTag` are the drawings the one library keeps.
   Or: keep it on a branch of its own and start part A from the last commit.
10. **Storybook.**
    **Recommended:** Storybook shows the library's React Native components in the browser through react-native-web, with a Controls page per form factor and theme, as design system 1.1's part B had for the web renderer.
    Or: no Storybook; the client's own screens against the mock serve as the workbench.

## The owner's changes

On 2026-11-02, reviewing this scope, the owner made 2 changes:

1. **The admin draws everything from the library, its own parts included.** "As much as possible. There are elements of the admin that we may want to add into clients in the future or other companion apps. The entire highsea suite of applications should all share one single unified codebase, design system/language, component library, packages, etc." The admin's tables, sidebar, widget grid, command palette, status bar and stepper become library components in React Native, and the web renderer goes. Next stays its host (the follow-up below). See [the Goal](#goal), [one component library](#one-component-library-on-react-native-a) and [the admin](#the-admin-drawn-only-with-the-library-d).
2. **The guides draw their parts from the library.** Following change 1, question 8 was asked again before it was answered. Fumadocs keeps its search, sidebar and MDX, and the guides' callouts, badges, buttons and figures are the library's. See [the guides](#the-guides-drawing-their-parts-from-the-library-e).

## The owner's answers

On 2026-11-02 the owner took every recommendation for questions 1 to 10 except 4 and 10:

1. One Expo project, `apps/client`, for the phone, the TV and the web, and so the desktop app.
2. One screen file per destination, laid out by the form-factor rule, with each converged screen approved beside its old prototypes.
3. The client prototypes are `apps/client` itself, on the mock server as an SDK transport, inside the prototypes' frames.
4. **Changed by the owner:** the admin shares as much as possible, its own parts included (change 1). The follow-up: Next.js stays the admin's host, drawing only the library, with the DOM only where react-native-web can't, each listed.
5. The devices' own focus engines, and a web engine behind the same `Focusable` in the browser.
6. One player screen; on the web, today's `<video>` with hls.js as `playback.web.ts`.
7. This plan first. Prototype-gaps' stages 7 and 8, 4.5c and 4.6 wait for it, and design system 1.1's review folds into part A's.
8. Fumadocs, with the guides' drawn parts from the library (asked again after change 1).
9. Part C's uncommitted work is part A's starting point, committed on its own when the owner says.
10. **Changed by the owner:** no Storybook. `apps/storybook` is retired, and `apps/client` against the mock is the workbench.

## The owner's answers at part A's review

On 2026-11-03, reviewing part A, the owner took every recommendation for its 14 decisions, with one follow-up:

1. Compact is below 768 for every client, and `spacing-layout.md` now says so. **Follow-up:** the admin keeps its own breakpoints (600, 1024 and 1440 in `scales.ts`, behind Tailwind's `medium:`) until part D moves it onto the rule. Nothing in the admin changes now.
2. The TV's inset is 2.4u on every side (`tv.safe`). `platforms/tv.md` now says so, noting that it sits inside tvOS's 80 × 60 points by the owner's choice of 2026-10-30.
3. The web's margins, posters per row, gaps between rows, and the compact-pointer and regular-touch layouts take the prototype's values, written into the guides as part B moves each screen.
4. Pointer clients have a top bar, as prototyped. There's no sidebar.
5. The toggle's shadow blur of 2 (elevation level 2) is approved.
6. Hover on primary and danger buttons, and poster hover at 1.02, are added as library states in part B.
7. The 143 listed values get a token set proposed for approval in part E.
8. Text's mapping to the nearest style off the phone is approved.
9. The drawn scrollbar's measures become tokens in part E.
10. The TV's Theme rows take `radius-sm` through the control spec (`m.radius`), not `tv.radius.button`.
11. TV pages in a browser scroll only as focus moves.
12. Enter presses link stops in the TV's web focus engine.
13. TypeScript is pinned at 7.0.2.
14. Part A is committed now. Part C of the apps' catch-up was already committed (`c4bfed2`), so it's one commit. Nothing is pushed.
