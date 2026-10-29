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
