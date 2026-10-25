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
