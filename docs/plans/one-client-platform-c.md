# One client platform, part C: the builds and how they ship

- **Status:** Scoped on 2026-11-04, after B3's sign-off, and approved with [the owner's answers](#the-owners-answers) of 2026-11-04: every recommendation but two. Nothing is built.
- **Parent plan:** [one-client-platform.md](one-client-platform.md), part C: "the server serving the client's web export at `/web`; the desktop app around it; `native.yml`, `desktop.yml`, the release workflow, the end-to-end run's `/web` step, and the playback sweep in Chromium and Firefox on the new web build."

## Read first

1. [one-client-platform.md](one-client-platform.md): the Goal, the architecture's "One Expo project for every client" and the owner's answers (2026-11-02 and part A's of 2026-11-03).
2. [one-client-platform-b.md](one-client-platform-b.md): its Out of scope (what B left for C) and B2's Progress (the desktop app's chrome behind one seam).
3. [ADR 0061](../adr/0061-one-client-platform.md), above all its 2026-11-04 sections: what part C must wire behind `useDesktopHost()`, and the client's identifiers "until part C ships it".
4. [ADR 0003](../adr/0003-server-runtime-custom-entry.md)'s 4.2a section (how `/web` is served), [ADR 0053](../adr/0053-clients-build-and-distribution.md) (the clients' builds), [ADR 0058](../adr/0058-desktop-app.md) (the desktop app) and [ADR 0050](../adr/0050-release-and-versioning.md) (one version, the release workflow).
5. The code: `apps/server/src/web/index.ts`, `apps/server/server.ts`, the `Dockerfile`, `apps/client/app.config.ts`, `apps/client/src/desktop/host.ts`, `packages/native/src/web-host.ts` and `server-store.web.ts`, `apps/web/src/host.ts` and `src/desktop/`, `apps/desktop/src-tauri/` (`tauri.conf.json`, `src/lib.rs`), and `.github/workflows/{ci,desktop,release,e2e}.yml`.
6. [docs/product/desktop-app.md](../product/desktop-app.md) and [connectivity.md](../product/connectivity.md): what the desktop app does, which doesn't change.

## Goal

`/web` serves the client's Expo web export, the desktop app wraps the same client, and `apps/web` is gone. Everything that builds, checks and ships the clients reads `apps/client`: the image, CI, the release workflow, the end-to-end run, the playback, server and layout sweeps, the bundle check and the guides' screenshots. The phone and the TV take highsea's shipping identifiers. A release with all of it is prepared, and published only on the owner's word.

What a person sees on `/web` and in the desktop app is what the owner approved in part B's frames. The desktop app keeps everything only an app can do (ADR 0058): its Rust side, the keychain, discovery, single sign-on through `highsea://oidc`, updates and the media keys.

## Out of scope

- **The admin (part D)** and **the guides' drawn parts and the 143 values' tokens (part E).** The guides' screenshots of `/web` and the desktop app are retaken here, because what they show changes here.
- **Copies for a device (4.6).** Kept in's folder picker and the Rust command that moves downloads stay as the seam describes, unwired, as B2's answer 2 left them.
- **Android and Android TV (4.5c).**
- **Shows, music and profiles on the server.** They stay behind `useServes`, so `/web` on a real server draws films only, as at B2.
- **Publishing anything.** No image, tag, catalog, store listing or desktop feed is published without the owner's word (checkpoint 9's rule).

## Where things stand

- **`/web`** is `apps/web`'s Vite build (`apps/web/dist`), served by `apps/server/src/web/index.ts`. Vite's hashed `assets/` are cached for a year, `index.html` is revalidated, routes without an extension fall back to `index.html`, and the CSP allows only the origin, hls.js's `blob:` worker, and YouTube's privacy-enhanced embed (`frame-src`, ready for the client's trailer). The `Dockerfile` runs `cd apps/web && bun run build`, and `apps/server/server.ts` points the handler at `apps/web/dist`.
- **The client's web export** (`bun run --cwd apps/client export:web`) is `dist/` with `web.output: 'single'` and `experiments.baseUrl: '/web'`:
  - the scripts are content-hashed under `_expo/static/js/web/`, and the fonts and images content-hashed under `assets/__packages/…` and `assets/__node_modules/…`, as `.ttf` and `.png`;
  - `index.html` has one inline `<style>` (react-native-web's reset) and no inline script;
  - its first load is about 3.5 MB of JavaScript, 817 kB gzipped (`__common` 530 kB, `entry` 288 kB), against `apps/web`'s 1.41 MB, 406 kB gzipped; hls.js stays its own chunk (180 kB gzipped), loaded with the player.
- **The desktop app** is Tauri 2.12 around `apps/web`'s desktop build (`vite build --mode desktop`, `dist-desktop/`, served at the window's root). `apps/web/src/host.ts` and `src/desktop/` (about 1,150 lines) call its Rust commands: `app_device`, the servers (`servers_list`, `server_current`, `server_add`, `server_use`, `server_leave`, `server_forget`), `api`, `stream_open` and `stream_close` (the event stream on a channel), `discover` and `oidc_start`, plus the `server` scheme for media. It also uses the updater, process and opener plugins.
- **The client's side of the desktop app** is drawn and approved (B2): the window's chrome, Back and Forward, an update waiting, and Kept in, behind `useDesktopHost()` (`apps/client/src/desktop/host.ts`), which only the mock fills today. The player's `WebHostProvider` (`packages/native/src/web-host.ts`) is the seam for the desktop's media URLs and `keepalive` fetch. On the web the servers are one, the page's own origin (`server-store.web.ts`).
- **`native.yml`** already builds and tests `apps/client` for iOS and tvOS (moved in B2).
- **What still reads `apps/web`:** the `Dockerfile`; `ci.yml`'s web build and `bundles.ts web`; `desktop.yml`'s paths; `scripts/sweeps/playback.ts`, `server.ts` and `compare.ts` (each builds it first); `scripts/e2e/run.ts`'s step 8; `scripts/docs-shots/areas/watch.ts`; `apps/server/test/messages.test.ts`'s sources; and the one-place and controls exceptions listed until part C.
- **Routes that moved.** `apps/web`'s `/library/collections` is the client's `/collections`, and `/settings/:section` is `/settings` with its section in the page. `/movies/:id`, `/collections/:id`, `/search`, `/profile`, `/downloads` and `/play/:id[/start]` are the same.
- **The client's identifiers** are its own until this part (ADR 0061's B2 section): `tv.highsea.client.mobile` and `tv.highsea.client.tv`, the URL scheme `highsea-client`, so it installs beside the 4.5a app on the owner's iPhone rather than over it.

## The size of this part, and its batches

Two gated batches, each reviewed by the owner (question 1):

- **C1, `/web` on the client.** The server, the image, CI's web jobs, the sweeps, the end-to-end run's step and the guides' screenshots move onto the client's export. `apps/web` stays only for the desktop app.
- **C2, the desktop app on the client, and shipping.** The desktop app wraps the client, `apps/web` is removed, the phone and the TV take highsea's identifiers, and the next release is prepared.

## Progress

- **2026-11-04, C1, signed off by the owner on 2026-11-04** (with `bun run web` at `localhost:3200/` as built, the report's one decision): `/web` serves `apps/client/dist`, the client's Expo export, from the server, the image and CI, and `apps/web` is built only for the desktop app until C2.
  - **The server and the image:** `apps/server/src/web/index.ts` and `server.ts` serve the export (hashed `_expo/static/` and `assets/` cached for good, `.ttf` as `font/ttf`, `metadata.json` answering 404, routes falling back to `index.html` under the same CSP; 12 tests in `web.test.ts`). The `Dockerfile` exports the client and `scripts/image.ts` copies only its `dist/`. The image is 2,110 MB (2,287 MB at 4.3b, against the soft 2,300 MB budget).
  - **The bundle:** `scripts/bundles.ts client-web` checks the export in CI and prints its first load, 831 kB gzipped (5.3 MB on disk, against `apps/web`'s 406 kB), with no budget (answer 4).
  - **Development:** `bun run web` is the client's Expo dev server at `http://localhost:3200/`, proxying `/api` and `/stream` to `bun run server` (`apps/client/dev-proxy.js`, through Metro's `enhanceMiddleware`).
  - **The sweeps, the comparison sheet and the end-to-end run** run on the client's export: `playback.ts` in Chromium (11 s) and Firefox (15 s), `server.ts` over `/web`'s pages (Settings by `?section=` from `SETTINGS_SECTIONS`), `compare.ts` pairing `/web/collections` and Settings' sections, and the e2e run's step 8 signing in on `/web` and playing Sintel through the image (4.0 s).
  - **The guides:** `apps/docs/content/watch/index.mdx` and `playing.mdx` rewritten for the client as built (0.4.0), with their four screenshots retaken from the client's export by `scripts/docs-shots/areas/watch.ts`.
  - **ADRs:** dated sections in 0003 (the export served, and the image's two fixes), 0053 (the web ships from the export, and `bun run web`) and 0061 (what the move found).
  - **Checks under Node 26.11.1:** lint (1,734 files), typecheck, 12,594 tests pass (8 skipped, 0 fail, 251 files) and the app's 326 Jest tests, smoke, licences (1,529 packages, 562 crates, 122 pods), the audit (1,137 packages; GHSA-mrhx-c7xc-m3w5 excepted until 2026-11-29), `one-place` and `controls.ts` clean, the docs build, actionlint, and the sweeps clean: pages 3,296 (then web 1,272, mobile 360 and TV 320 again after the library's fixes), keyboard 319 (web 106 and mobile 45 again), the D-pad walk, `server.ts` and playback. The image built, the end-to-end run passed through it, and `image.ts hardware` found 2 encoders and 3 filters on arm64.
  - **Judgement calls:** the dev server is at `localhost:3200/` rather than answer 5's `/web/`, since Expo's base URL "is production-only" ([Expo CLI › Hosting with sub-paths](https://docs.expo.dev/more/expo-cli/#hosting-with-sub-paths)); the moved addresses draw the not-found page (answer 3); `apps/web` stays only for the desktop app until C2.
  - **Found and fixed along the way:**
    - react-native-web reads only `aria-*` for state and value, never `accessibilityState` or `accessibilityValue`. The player's tracks and Settings' theme cards had no `aria-checked`, so `Press` now writes it from `accessibilityState.checked` for the roles that take it. Every slider (the player's position and volume, `Slider`, `Waveform`, `LetterIndex`, `SortableList`'s handle) and `ProgressBar` now pass React Native's `aria-value*` props, which the phone reads too ([View › aria-valuenow](https://reactnative.dev/docs/view#aria-valuenow)); the sort handle and the letter index gained a value they never had.
    - Settings' theme cards nested a second radio inside the card's own; the library's new `RadioMark` draws the mark alone.
    - The player's tracks panel had lost its `blur.scrim` backdrop on the web, so the top bar read through it.
    - The playback sweep reads subtitles from the showing text track's active cues, since the client draws them through `<track>`.
    - The image hadn't built since 4.5b: the manifests stage dropped `patches/`, and Bun's isolated install linked `@highsea-tv/ui`'s optional React Native peers into production (587 store entries). The stage keeps the patches, and `scripts/image.ts`'s `pruneOptionalPeers` (with a test) leaves the unused peers out.
- **2026-11-04, C2, signed off by the owner on 2026-11-04, so part C is signed off:** the desktop app wraps `apps/client`'s desktop export, `apps/web` is removed, the phone and the TV take highsea's identifiers, and 0.4.0 is prepared (not tagged or published).
  - **The desktop export:** `export:desktop` (into `dist-desktop/`) and `web:desktop` (Expo's dev server on `:3201`, for `tauri dev`) set `EXPO_PUBLIC_HIGHSEA_APP=desktop`, and `experiments.baseUrl` is empty there and `/web` otherwise (`app.config.ts`). `src/desktop/app.ts` requires `./tauri.tsx` only behind the flag, so Metro folds it out of every other build. `tauri.conf.json`'s build section runs them, with `frontendDist` at `../../client/dist-desktop`; the CSP is unchanged.
  - **The desktop host** (`apps/client/src/desktop/tauri.tsx`, about 540 lines, where the plan said `tauri.ts`): `DesktopRoot` provides `DesktopHostProvider` (the window's buttons, updates at start and every 6 hours in production, resuming after a restart), `WebHostProvider` (the `server` scheme's media and the `api` command's fetch) and `@highsea-tv/native/servers`' context over the Rust commands (now exported as `ServersContext`), so Choose a server, sign-in, Forget and several servers are the client's own. Single sign-on is `oidc_start` then `highsea://oidc`; `highsea://connect?server=` opens Choose a server with the address filled in; macOS's local-network prompt is waited out (looking every 2 s for a minute after the first refusal). `host.web.ts`, `browser.ts`, `sign-in.tsx` and `connect.tsx` read the desktop host.
  - **The Rust side** gains one command, `server_info` (a server's public info at an address, without remembering it). Nothing else changes: the same keychain entries and `servers.json`. `cargo fmt`, `clippy -D warnings` and its 11 tests pass; `tauri build --debug --no-bundle` builds with the export inside.
  - **`apps/web` removed,** with its 10 control exceptions and its one-place exception (`one-place` has no "until C" exceptions left), `controls.ts`' and `one-place.ts`' folders, `messages.test.ts`' source, `desktop.yml`'s paths (now `apps/client/**`), CLAUDE.md's table and commands, and comments that pointed at it. `bundles.ts` checks four builds: `client-web` with no `@tauri-apps` (831 kB gzipped first load), `client-desktop` with it (839 kB), and the phone and the TV with neither the web renderer nor Tauri; CI runs `client-web client-desktop`.
  - **The identifiers:** `tv.highsea.mobile`, `tv.highsea.tv` and the scheme `highsea` in `app.config.ts`, with `phone.ts`, `tv.ts`, `layout.ts`, the Maestro flow and the two XCUITests launching them (their own runner projects keep the `tv.highsea.client` prefix). Installing over the 4.5a app on the owner's iPhone waits for the owner.
  - **The release:** `bun scripts/release.ts prepare 0.4.0 --date 2026-11-04` wrote the changelog's section (from notes written for C2), the versions in `apps/server`, `apps/client` and `apps/desktop`, `releases.json`, the catalog's 2026.11.4 and the seed, and `openapi.json`; `release.ts check 0.4.0` says it's ready. Nothing is tagged, pushed or published.
  - **The guide** `apps/docs/content/watch/desktop-app.mdx` is written for 0.4.0: its sources name the client's files, switching servers goes through Choose a server, and an update waiting shows on the profile and in Settings › About. It has no screenshots to retake.
  - **ADRs:** dated sections in 0058 (the window shows the client's desktop export), 0059 (the shipping identifiers) and 0061 (the desktop app on the client, and `apps/web` removed).
  - **Checks under Node 26.11.1:** lint (1,708 files), typecheck, 12,567 tests pass (8 skipped, 0 fail, 249 files) and the app's 326 Jest tests, smoke, licences (1,529 packages, 562 crates, 122 pods), the audit (GHSA-mrhx-c7xc-m3w5 excepted until 2026-11-29), `one-place` and `controls.ts` clean, `bundles.ts` clean on all four builds, the docs build, actionlint, and the sweeps clean: pages 3,296, keyboard 319, the D-pad walk, the server's admin pages, and playback in Chromium (11 s) and Firefox (15 s). The layout check, with both simulator builds made under the new identifiers, compared 45 pairs, and 44 were the same. Songs on the TV differed once: the Albums chip and the first song were drawn at their focused size on the device, as if focus had landed there before the snapshot. Run alone twice more, songs matched 430 of 430 both times, so it's reported as a focus race in the check, not a layout change; C2 didn't touch that screen.
  - **Tried in the app:** `tauri dev` under `tv.highsea.desktop.test` against the sweep's seeded server on `:3160` booted and drew Choose a server with no errors beyond React's dev-only warnings below. Signing in, playing, the media keys, single sign-on, an update and the YouTube trailer in the window weren't driven from here: macOS gave no screen capture of the window, System Events timed out, and a script-running driver in the page was refused by this session's permission check. They wait for the owner's hands, as at 4.4a. At sign-off these by-hand checks in the Mac app, installing `tv.highsea.mobile` on the owner's iPhone, and publishing 0.4.0 stay with the owner.
  - **Judgement calls:** `server_info` in Rust, where the plan said the Rust side doesn't change; the desktop's own `ServersContext` provider rather than a second store; `connect.tsx` reads `server` (the documented `highsea://connect?server=`) as well as `address`; sign-out in the desktop app shows its failure when the server can't be reached, since Rust deletes the token only when the server heard; the Forget question says "This computer" in the desktop app (a copy change, `forgetMessages.detail`); the test runners keep their bundle prefix; the guide has no screenshots.
  - **Found and fixed along the way:** `host-web.jest.tsx` still marked the desktop app by Tauri's global, which the build flag replaced; it mocks `desktop/app.ts` now. Found and left: react-native-svg on the web passes React Native's `accessible`, `accessibilityElementsHidden` and `importantForAccessibility` to the `<svg>` (`Mark`, `Disclosure`'s icon, and the library's hidden decorations), which React warns about in development; nothing reaches assistive tech wrongly in production, and it's for part E's pass over the library.

## `/web` serves the client's export (C1)

- **The server** (`apps/server/src/web/index.ts`, `server.ts`): the handler points at `apps/client/dist`.
  - `_expo/static/` and `assets/` are content-hashed by Expo's export, so both are cached as Vite's `assets/` were (`immutable`); `index.html`, `favicon.ico` and `metadata.json` are revalidated. `metadata.json` is Expo's build manifest, which nothing at `/web` reads, so it isn't served.
  - `.ttf` joins the types (`font/ttf`, [RFC 8081](https://www.rfc-editor.org/rfc/rfc8081)) and is compressed.
  - The CSP stays as it is: the export loads its scripts from the origin, and react-native-web writes its styles into the page at run time, which `style-src 'unsafe-inline'` already allows ([react-native-web › Styling](https://necolas.github.io/react-native-web/docs/styling/)). The trailer's `frame-src` comment no longer says "until part C".
  - The message shown when the export is missing names `bun run --cwd apps/client export:web`.
- **Addresses that moved** (question 3): `/web/library/collections` and `/web/settings/:section` aren't redirected. They draw the client's not-found page with its way home, and the server keeps no list of the client's routes.
- **The image** (`Dockerfile`): the build stage exports the client (`bun run --cwd apps/client export:web`) instead of building `apps/web`, and the runtime stage copies only `apps/client/dist`. `scripts/image.ts size` reports the change against the soft budget.
- **The web bundle's size** (question 4): `scripts/bundles.ts` reads `apps/client/dist` and keeps its checks (no native module, no mock, hls.js in its own chunk). It prints the first load's gzipped size for the report, with no budget: the owner doesn't consider the size to matter.
- **CI** (`ci.yml`): the web job exports the client and runs `bundles.ts web` on it (part A left wiring the client's bundles into CI for this part). The playback job runs on the client's player.
- **Development** (question 5): `bun run web` becomes the client's Expo dev server for the web at `http://localhost:3200/` (at the root, since Expo's base URL "is production-only": [Expo CLI › Hosting with sub-paths](https://docs.expo.dev/more/expo-cli/#hosting-with-sub-paths); the answer said `/web/`, which only the export has), proxying `/api` and `/stream` to `bun run server`, so a page and the server share an origin as in production. Metro's server takes middleware for this (`server.enhanceMiddleware`, [Metro › Configuration](https://metrobundler.dev/docs/configuration/#enhancemiddleware)), which `apps/client/metro.config.js` adds only when the dev server is asked for the real server.
- **The sweeps and the end-to-end run:**
  - `scripts/sweeps/playback.ts` plays the seeded films in the client's player in Chromium and Firefox: the same checks (the decision, seeking, subtitles, trickplay, Next up, the stream's states), with the client's selectors.
  - `scripts/sweeps/server.ts` sweeps `/web`'s pages from the client's export: axe in three themes, overflow, 200% text, reduced motion and the keyboard walk, as part B's frames did on the mock.
  - `scripts/sweeps/compare.ts` exports the client instead of building `apps/web`.
  - `scripts/e2e/run.ts`'s step 8 signs in on `/web` and plays Sintel through the image, with the client's routes.
- **The guides** (`apps/docs/content/watch/`): `index.mdx` and `playing.mdx` describe the client as built, their comments name `apps/client`'s files, and `scripts/docs-shots/areas/watch.ts` retakes their screenshots from the client's export (question 8).
- **ADRs:** dated sections in 0003 (`/web` serves the Expo export, and what's cached) and 0053 (the web client's build, as built).

## The desktop app wraps the client (C2)

- **A desktop export** (question 2): `export:desktop` exports the client with its base at the window's root and `EXPO_PUBLIC_HIGHSEA_APP=desktop` into `dist-desktop/`, as `apps/web` built `--mode desktop`. Tauri serves a folder of static files at the window's root ([Tauri › Frontend configuration](https://v2.tauri.app/start/frontend/)). Expo inlines `EXPO_PUBLIC_` variables at build time ([Expo › Environment variables](https://docs.expo.dev/guides/environment-variables/)), so the Tauri modules are imported only behind that flag, and Metro drops them from the browser's export. `bundles.ts` checks that `/web`'s bundle carries no `@tauri-apps`.
- **The desktop host** (`apps/client/src/desktop/tauri.ts`, new): `apps/web/src/host.ts` and `src/desktop/` moved behind the client's seams, not re-drawn:
  - `useDesktopHost()`'s real host: the window's buttons through `getCurrentWindow()` ([Tauri › window](https://v2.tauri.app/reference/javascript/api/namespacewindow/)), and updates through the updater and process plugins, checked at start and every 6 hours as `apps/web/src/desktop/updates.ts` does ([Tauri › Updater](https://v2.tauri.app/plugin/updater/));
  - the servers: a server store over the Rust commands, so the client's own Choose a server, its sign-in, Forget and several servers run on the keychain and discovery exactly as the phone's do on `@highsea-tv/native`;
  - the SDK's transport through the `api` command, the event stream through `stream_open` on a channel, and the player's `WebHostProvider` with the `server` scheme's media URLs and its `keepalive` fetch;
  - single sign-on through `oidc_start` and `highsea://oidc`, which the client's sign-in already offers on the phone.
- **The Rust side doesn't change** (ADR 0058): the same commands, the same keychain entries and `servers.json`, so an updated app keeps the servers it knew. The owner's own Mac's saved server is never touched by the checks; they run on a test profile.
- **`tauri.conf.json`:** `beforeDevCommand` and `devUrl` run the client's Expo dev server, `beforeBuildCommand` runs `export:desktop`, and `frontendDist` is `../../client/dist-desktop`. Its CSP gains nothing: the export needs what the Vite build needed.
- **The media keys and Now Playing:** the client's web player sets the Media Session's metadata and actions, as `apps/web`'s did ([Media Session API](https://www.w3.org/TR/mediasession/)); they're checked again in the Mac app, since the owner confirmed them there at 4.4a.
- **`apps/web` is removed,** with its exceptions in `scripts/one-place-exceptions.json` and `scripts/control-exceptions.json`, `messages.test.ts`'s source, `desktop.yml`'s paths, and `CLAUDE.md`'s table and commands. `bun run one-place` then has no "until C" exceptions.
- **CI:** `desktop.yml` builds the app from `apps/client` on macOS, Windows and Linux, with its paths on `apps/client/**` and `apps/desktop/**`. The release workflow's `desktop` and `desktop-feed` jobs need no change beyond the build command Tauri runs.
- **The guide** `apps/docs/content/watch/desktop-app.mdx` names the client's files, and its screenshots are retaken.
- **ADRs:** dated sections in 0058 (the desktop app around the client's export, and the host behind its seams) and 0061 (part C as built).

## The phone and the TV take highsea's identifiers (C2)

On question 6: `apps/client/app.config.ts` takes `tv.highsea.mobile` and `tv.highsea.tv`, and the URL scheme `highsea`, which connectivity.md's links (`highsea://connect`, `link` and `oidc`) already use. The client then installs over the 4.5a app on the owner's iPhone rather than beside it. A keychain item belongs to the app's bundle identifier and access group ([Apple › Sharing access to keychain items](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)), so the servers the 4.5a app knew are kept. `scripts/sweeps/phone.ts`, `tv.ts`, `layout.ts` and the Maestro flow take the new app ids. ADR 0059 gets a dated section.

## The release (C2)

On question 7: `bun scripts/release.ts prepare 0.4.0` makes the release's commit at the end of C2: the changelog's section (the one client on `/web`, in the desktop app, on the phone and on the TV), the version in `apps/server`, `apps/client` and `apps/desktop`, `releases.json`, and the rest the script writes (ADR 0050). Its tag, image, catalog and desktop feed wait for the owner's word.

## ADRs

- No new ADR: part C carries out decisions already made (ADR 0061, and 0053's and 0058's).
- **Dated sections:**
  - 0003: `/web` serves the client's Expo export (C1);
  - 0053: the web client's build as built, with its size (C1);
  - 0058: the desktop app around the client's export, with its host behind the client's seams (C2);
  - 0059: the phone and the TV take `tv.highsea.mobile`, `tv.highsea.tv` and `highsea` (C2);
  - 0061: part C as built, and `apps/web` removed (C1 and C2);
  - 0050: only if the release changes what the workflow does.

## Risks

- **The first load doubles.** About 817 kB gzipped against 406 kB, mostly react-native-web, the library and the screens B3 added. On a home network that's well under a second, but on a phone over the internet it's felt. The owner doesn't consider it to matter (question 4), so C1 reports it and sets no budget.
- **The playback sweep and the end-to-end run were written against `apps/web`'s page.** Their checks stay the same, but every selector changes, and a check that passes on the wrong element proves nothing. Each is preflighted on one film first, with its output showing which element it found.
- **The desktop app in three webviews.** react-native-web hasn't run in WebView2 or WebKitGTK yet; Safari's WebKit (the Mac) is the web sweeps' WebKit. C2 runs the app on all three in CI's builds, and by hand on the Mac.
- **Metro's middleware for the dev proxy.** `server.enhanceMiddleware` is documented, but Expo's CLI owns Metro's server. If Expo doesn't pass it through, the documented fallback is the dev server talking to `bun run server` across origins with CORS allowed for `localhost:3200` in development only.
- **The identifiers.** Installing over the 4.5a app is a one-way step on the owner's iPhone. It's done only after C2's checks, and the owner does it.

## Open questions for the owner

1. **Two batches.**
   **Recommended:** C1 (`/web` on the client) and C2 (the desktop app, removing `apps/web`, the identifiers and the release), each reviewed. `/web` can be checked in a browser on its own, and the desktop app has its own risks.
   Or: one batch. That's one review, but a larger one, and `/web`'s change waits for the desktop app's.
2. **The desktop app's build.**
   **Recommended:** a second export of the same client for the desktop app, with its base at the window's root and the Tauri code behind a build-time flag, so the browser's bundle carries no `@tauri-apps`, as `apps/web`'s two builds did.
   Or: one export for both, telling the desktop app apart at run time (`__TAURI_INTERNALS__`) and serving it under `/web` inside the window too. That's one build, but every browser downloads the desktop app's code.
3. **Addresses that moved.**
   **Recommended:** Expo Router's `redirects` take `/web/library/collections` and `/web/settings/:section` to the client's places, so bookmarks and old links keep working.
   Or: the server answers them with 301s. The server then keeps a list of the client's routes.
   Or: nothing; they show the client's not-found page with its way home.
4. **The web bundle's size.**
   **Recommended:** accept the client's first load (about 817 kB gzipped), report it, and have `bundles.ts` fail above a budget set from C1's export, with shrinking it planned on its own.
   Or: shrink it to near `apps/web`'s 406 kB before `/web` switches. That holds the web back for work that doesn't change what anyone sees.
5. **Developing against a real server.**
   **Recommended:** `bun run web` is the client's Expo dev server at `localhost:3200/web/`, proxying `/api` and `/stream` to `bun run server`, as Vite did.
   Or: no dev server against a real server; the client is developed on the mock and checked on the server's `/web` from an export. That's simpler, but every change to a real server's page waits for an export.
6. **The phone's and TV's identifiers.**
   **Recommended:** in C2, the client takes `tv.highsea.mobile`, `tv.highsea.tv` and `highsea://`, so it replaces the 4.5a app and keeps its servers.
   Or: keep `tv.highsea.client.*` until the App Store submission. Two highsea apps stay on the owner's iPhone until then, and the links still open the old one.
7. **A release.**
   **Recommended:** prepare 0.4.0 at the end of C2 (never published until the owner says), since `/web`, the desktop app and the phone all change.
   Or: no release in part C; the next release waits for part D or E.
8. **The Watching guides.**
   **Recommended:** in the same batch as the change, as the guides' rule asks: C1 for `/web` and the player, C2 for the desktop app, screenshots included.
   Or: in part E with the rest of the guides' work. The guides would then show `apps/web` for a while after it's gone.

## The owner's changes

## The owner's answers

On 2026-11-04 the owner took every recommendation for questions 1 to 8 except 3 and 4:

1. Two batches, C1 and C2, each reviewed.
2. A second export for the desktop app, with the Tauri code behind a build-time flag.
3. **Changed by the owner:** no redirects. The moved addresses draw the client's not-found page with its way home.
4. **Changed by the owner:** the size doesn't matter. It's reported, with no budget in `bundles.ts`.
5. `bun run web` is the client's Expo dev server at `localhost:3200/web/`, proxying `/api` and `/stream` to `bun run server`.
6. In C2 the phone and the TV take `tv.highsea.mobile`, `tv.highsea.tv` and `highsea://`, replacing the 4.5a app; the owner installs it after C2's checks.
7. 0.4.0 is prepared at the end of C2, published only on the owner's word.
8. The Watching guides and their screenshots are updated with each batch: C1 for `/web` and the player, C2 for the desktop app.
