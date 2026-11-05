# 0053. The clients' build and distribution: Vite at /web, Tauri for desktop, Expo for mobile and TV

- **Status:** Proposed
- **Date:** 2026-10-23

Drafted at Phase 4's checkpoint 4.0b ([phase-4-checkpoint-0.md › ADR drafts](../plans/phase-4-checkpoint-0.md#adr-drafts-40b)). It becomes Accepted in parts: the web client at 4.2, desktop at 4.4, mobile and TV at 4.5, each with a dated section.

## Context

Phase 4 ships four apps ([phase-4-clients.md › The clients](../plans/phase-4-clients.md#the-clients)), and the owner's answers settle the frameworks: the web client in Vite and React, served by the server at `/web` (answers 2 and 3); Tauri around the web build for desktop; Expo for mobile and TV, with react-native-tvos for TV. The prototypes in `design/prototypes/src/{web,mobile,tv}` are their build reference. Releases follow ADR 0050: one version, `apps/server`'s, and keyed jobs in the approval-gated `release` environment.

What has to be decided: how each app is built and served or packaged, how its version relates to the server's, and how signing keys are kept.

## Decision

- **Web (`apps/web`):** a [Vite](https://vite.dev/guide/) build of React, with [`base: '/web/'`](https://vite.dev/config/shared-options.html#base), output as static files that the server serves at `/web` from its own image, next to the admin. No second server, and the client and server always match, since they ship together. The SDK talks to the same origin.
- **Desktop (`apps/desktop`):** [Tauri 2](https://v2.tauri.app/) around `apps/web`'s build, with downloads to disk through Tauri's [file system plugin](https://v2.tauri.app/plugin/file-system/) and the OS's media keys. Bundles per [Tauri's distribution guide](https://v2.tauri.app/distribute/): DMG on macOS, MSI or NSIS on Windows, AppImage and deb on Linux. The device profile describes each OS's webview ([ADR 0052](0052-device-profiles.md)).
- **Mobile and TV (`apps/mobile`, `apps/tv`):** [Expo](https://docs.expo.dev/), the TV app on [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) following [Expo's TV guide](https://docs.expo.dev/guides/building-for-tv/). Built with [EAS Build](https://docs.expo.dev/build/introduction/) or locally from the same config; which runs in CI is settled at 4.5.
- **Versions:** every app carries the release's version (ADR 0050). Store build numbers (iOS `CFBundleVersion`, Android `versionCode`) count up on their own, as the stores require, and are recorded in the release's commit. ADR 0050 gets a dated section.
- **Compatibility:** the API never removes or changes a field in place; a client reads `system/info/public`'s version and leaves out what its server doesn't have yet. A test runs the previous release's SDK against the current server.
- **Signing:** Apple's and Google's keys, and Windows' and macOS's code signing, live only in the `release` environment's secrets ([GitHub's deployment environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)), never in the repository, and nothing is submitted to a store without the owner's word, as for the image and the catalog.

## Consequences

- The web client needs no install and no separate deploy; it updates with the server.
- Desktop's codecs depend on the OS's webview, so the desktop app can't promise Chromium's set; device profiles carry the difference.
- Store accounts (Apple Developer, Google Play) and code-signing certificates are the owner's to open; the plan lists them before 4.4 and 4.5.
- Left to settle at each checkpoint: the desktop updater (Tauri's updater plugin and its signing key), EAS or local builds in CI, and which TV platforms beyond tvOS and Android TV.

## 2026-10-27: the web client as built (checkpoint 4.2a)

`apps/web` is built as decided: Vite 8 and React 19, `base: '/web/'`, Tailwind and `@highsea-tv/ui-web` as the prototype has them, and routes as real paths under `/web` through wouter's `base` ([wouter › Router](https://github.com/molefrog/wouter#router-hook-searchhook-base-)), so each screen has an address that can be shared and reloaded. How the server serves it (the fallback, caching, the CSP) is ADR 0003's 2026-10-27 section; what it shares with the native apps is [ADR 0055](0055-clients-shared-logic.md).

- **Signing in** uses the admin's session cookie, so no token is kept where a page's script could read it ([OWASP's HTML5 Security Cheat Sheet › Local Storage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage)). As far as the server knows, the web client's session is the admin's: same device, same `admin` client type.
- **Development:** `bun run web` runs Vite's dev server on port 3200, which proxies `/api` and `/stream` to `bun run server` ([Vite › server.proxy](https://vite.dev/config/server-options.html#server-proxy)), so the cookie and the API stay on one origin.
- **The bundle** is 1.38 MB (402 kB gzipped). Most of it is zod and the API contract's schemas, which the SDK uses at run time, as the admin does.

The web part becomes Accepted at 4.2b's sign-off, with the player.

## 2026-10-28: the web player (checkpoint 4.2b)

The player is built on the browser's own `<video>`, with what each browser can play deciding how:

- **Direct play** sets the session's URL as the video's source; the server answers by byte ranges ([MDN › HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests)).
- **HLS** (a direct stream or a transcode, ADR 0051) goes through [hls.js](https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md) 1.7.3 where [Media Source Extensions](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API) are available, and to the video itself where the browser plays HLS natively and has no MSE (`canPlayType('application/vnd.apple.mpegurl')`, Safari on iPhone). hls.js is imported only when a stream needs it, so it is a chunk of its own (575 kB, 177 kB gzipped) that a direct play never loads; the main bundle stays at 1.41 MB (406 kB gzipped). hls.js's own subtitle rendering is off (`enableWebVTT`, `renderTextTracksNatively`): the playlist lists the subtitles for Apple's players, and the web player draws the session's WebVTT itself with the person's offset.
- **The device's report** (ADR 0052) is made once per browser version from `MediaSource.isTypeSupported()` and `MediaCapabilities.decodingInfo()` for HDR ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo)), kept against the user agent in `localStorage`, and `PUT` to `/api/v1/devices/current/profile`. Every play names the built-in profile it was laid over (`profile`), which the server uses until the report arrives.
- **Leaving** sends a last report to the session, paused, which the server saves at once, then ends the session, both with `fetch`'s `keepalive` so they survive the page closing ([MDN › RequestInit › keepalive](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#keepalive)). Within the app the end waits for the report.
- **The CSP** already allowed what the player needs (`media-src` and `worker-src` `blob:` for hls.js's MSE and worker, ADR 0003's 4.2a section); nothing was widened.
- **Tests:** the player's logic is a pure reducer in `@highsea-tv/client/player` (ADR 0055), tested without a DOM; the screen against a fake API in happy-dom; and the real thing by `scripts/sweeps/playback.ts`, which plays an MP4 directly and an MKV as HLS in Playwright's Chromium and Firefox against the seeded production build. Safari is tried by hand at each review.

The web part is Accepted: the owner signed off 4.2b on 2026-10-28. Desktop and the native apps stay Proposed until 4.4 and 4.5.

## 2026-10-29: the desktop app as built (checkpoint 4.4a)

Desktop is built as decided, with what building it settled in [ADR 0058](0058-desktop-app.md):

- `apps/web` builds a second time for the app (`vite build --mode desktop`, at `/` in `dist-desktop/`), and the page reaches the server through the app's Rust side rather than the same origin.
- Windows' installer is NSIS only, for the current user, with no MSI. Linux has `.rpm` as well as the AppImage and `.deb`, and the Mac app is universal, one build for Apple silicon and Intel.
- The updater is Tauri's, with highsea's own minisign key, the release key being the owner's to make. The app's version is the release's, in `tauri.conf.json`, `Cargo.toml` and `apps/desktop/package.json`, set by `scripts/release.ts prepare` ([ADR 0050](0050-release-and-versioning.md)'s 4.4 section).
- Downloads to disk come in 4.4b; the file system plugin is chosen there.

The desktop part is Accepted: the owner signed off 4.4a on 2026-10-29.

## 2026-10-29: the phone app as built (checkpoint 4.5a)

`apps/mobile` is the phone app, on Expo SDK 58, React Native 0.88 and Expo Router 58. Its iOS project is generated by `expo prebuild` and built locally or in CI's `native.yml` with `xcodebuild`, not EAS Build. The owner's iPhone gets a development build signed with their personal team, whose profile lasts seven days. C1 to C8 are ported from the prototype's mobile screens onto `@highsea-tv/ui-native`, and the player is expo-video. The decisions are in [ADR 0059](0059-native-apps.md). This ADR's mobile part is Accepted once 4.5a is signed off; the TV's waits for 4.5b.

## 2026-10-29: the TV app as built (checkpoint 4.5b)

`apps/tv` is the Apple TV app, on Expo SDK 58 and react-native-tvos 0.88, with the shared native code in `@highsea-tv/native`. Its tvOS project comes from `EXPO_TV=1 expo prebuild` and is built for the simulator in CI's `native.yml`, unsigned with a certificate, beside the phone's. There's no real Apple TV until TestFlight (the owner's answer 12), so it's checked on the tvOS simulator. C1 to C7 are ported from the prototype's TV screens onto `ui-native/tv`. The decisions are in [ADR 0059](0059-native-apps.md)'s dated section. Android TV comes from the same app in 4.5c.

## 2026-11-03: one Expo project for the clients (one client platform, part A)

The phone, the TV and the web client are now built from one Expo project, `apps/client` ([ADR 0061](0061-one-client-platform.md)). Its iPhone and Apple TV builds come from one `app.config.ts`, with `EXPO_TV=1` at prebuild choosing the TV's project, as `apps/tv` does ([Expo › Building for TV](https://docs.expo.dev/guides/building-for-tv/)). Its web build is `expo export -p web` ([Expo › Publish websites](https://docs.expo.dev/guides/publishing-websites/)): a single-page app (`web.output: 'single'`) with every address and asset under `/web` (`experiments.baseUrl`, [Expo › app config](https://docs.expo.dev/versions/latest/config/app/)), drawn with the library's React Native renderer through react-native-web. A mock build of the same export (`export:web:mock`) is what the prototypes' frames hold.

The web's player engine, the `<video>` with hls.js, moved from `apps/web/src/playback.ts` into `@highsea-tv/native/playback` as `playback.web.ts`, beside the phone's and the TV's expo-video. `apps/web` now plays through it, as that export's `default` target, and hls.js is `@highsea-tv/native`'s dependency. Its chunk is 575 kB in `apps/web`. The playback sweep passes in Chromium and Firefox.

Nothing ships from `apps/client` yet. The builds that ship stay as this ADR's dated sections describe them until part C: `apps/web`'s Vite build at `/web`, the desktop app around it, and `apps/mobile` and `apps/tv` in `native.yml`. Until then the client installs beside those apps (`tv.highsea.client.mobile`, `tv.highsea.client.tv` and the scheme `highsea-client`), its version follows the release's through `scripts/release.ts`, and `scripts/bundles.ts` checks its three bundles locally rather than in CI. The export measured 2.98 MB (661 kB gzipped) during part A, against `apps/web`'s 1.41 MB (406 kB), with Expo's tree shaking on ([Expo › Tree shaking](https://docs.expo.dev/guides/tree-shaking/)). Part C reports it again when the server serves it.

## 2026-11-04: the web ships from the client's export (one client platform, C1)

The web client that ships is `apps/client`'s web export, served at `/web` (ADR 0003's dated section of today). CI's `ci.yml` exports it and runs `scripts/bundles.ts client-web`, which checks that it carries only react-native-web's renderer and prints its first load. It measured 831 kB gzipped for the first load (5.3 MB on disk, the fonts included), against `apps/web`'s 406 kB; on the owner's answer 4 there's no budget, and it's reported at each part. The playback sweep (`scripts/sweeps/playback.ts`), the server sweep, the comparison sheet, the guides' screenshots and the end-to-end run's step all drive the export.

`bun run web` is the client's Expo dev server for the web (`apps/client`'s `web:server`), proxying `/api` and `/stream` to `bun run server` through Metro's `server.enhanceMiddleware` ([Metro › Configuration](https://metrobundler.dev/docs/configuration/#enhancemiddleware); `apps/client/dev-proxy.js`), so the page and the server share an origin and the session cookie as in production. It serves at `http://localhost:3200/`, not `/web/`: Expo's base URL "is production-only" ([Expo CLI › Hosting with sub-paths](https://docs.expo.dev/more/expo-cli/#hosting-with-sub-paths)), and expo-router strips it only outside development.

`apps/web` stays only for the desktop app, which C2 moves to a second export of the client and then removes.
