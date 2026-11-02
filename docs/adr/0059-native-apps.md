# 0059. The native apps: Expo on React Native, two apps sharing ui-native and the client

- **Status:** Proposed
- **Date:** 2026-10-29

Scoped at Phase 4's checkpoint 4.5 ([phase-4-checkpoint-5.md](../plans/phase-4-checkpoint-5.md)) and started in 4.5a, the phone app on iOS. It stays Proposed until 4.5c, when the TV app and Android have tested it too.

## Context

[ADR 0053](0053-clients-build-and-distribution.md) chose React Native with Expo for the phone and the TV, sharing logic with the web through `@highsea-tv/client` ([ADR 0055](0055-clients-shared-logic.md)). The owner joined the TV and phone checkpoints on 2026-10-29, Apple's platforms first. What 0053 left open: how the apps are laid out in the monorepo, how their native projects are made and built, how they draw the design system, how they find servers and keep tokens, how they play, and how they're tested, all under the owner's rules (exact versions at least two weeks old, AGPL-compatible licences, no network in tests).

## Decision

- **Expo SDK 58 and React Native 0.88**, with Expo Router 58 for the screens as files (`apps/mobile/src/app/`), its protected routes for the gate (C1 before the tabs; [Expo › Protected routes](https://docs.expo.dev/router/advanced/protected/)), and its tab navigator with highsea's own tab bar. The phone app is on `react-native` 0.88.0. The TV app goes on `react-native-tvos` in 4.5b, which can be pinned from 2026-10-31.
- **Two apps, not one with a switch:** `apps/mobile` now and `apps/tv` in 4.5b, each with its own `app.config.ts`, bundle identifier (`tv.highsea.mobile`) and layouts. A prebuild targets one platform, and the prototypes keep separate layouts.
- **Generated native projects:** `ios/` is made by `expo prebuild` from `app.config.ts` and its config plugins, and is never committed ([Expo › Prebuild](https://docs.expo.dev/workflow/prebuild/)). Builds are local and in CI with `xcodebuild`, not EAS Build. Signing stays on the owner's Mac now, and in the `release` environment once there's a membership.
- **Bun's isolated installs work with Metro** as they are. Two of Expo's native packages had to be held together in the root `package.json`'s `overrides`: `expo-modules-core` 58.0.19 with `expo-modules-jsi` 58.0.14. With jsi 58.0.21 the app stops at launch with a missing `createHostObject` symbol, because core 58.0.19 was built against jsi 58.0.14's headers.
- **`@highsea-tv/ui-native`:** the design system for React Native. It has the same components as ui-web, by name and shape, on `@highsea-tv/tokens`' native export. Icons are Lucide through `lucide-react-native`, by ui-web's names, and a test keeps both the names and the glyphs in step. Motion uses Reanimated and respects Reduce Motion.
- **The servers it knows:** `@highsea-tv/client/servers` holds the pure list, as the desktop app's `servers.rs` does. The phone keeps names and addresses in `servers.json` in its documents, and each server's device token in the iOS keychain through expo-secure-store ([Expo › SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)). Each server gets an SDK `ServerConnection`, which probes its addresses and fails over, over Expo's streaming `fetch`, so the event stream works.
- **Discovery:** a local Expo module (`apps/mobile/modules/discovery`) browses for `_highsea._tcp` with Network framework's `NWBrowser`, and resolves each result with an `NWConnection`. The local-network prompt shows as `NWBrowser` waiting with `PolicyDenied`, and the app explains it as the approved prototype does ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)).
- **Single sign-on** opens the server's OIDC start in `ASWebAuthenticationSession` (expo-web-browser's `openAuthSessionAsync`) with PKCE from expo-crypto, back through `highsea://oidc` (RFC 8252, [ADR 0024](0024-sign-in-methods-and-sessions.md)).
- **Playback** is expo-video, which is AVPlayer on iOS ([Expo › Video](https://docs.expo.dev/versions/latest/sdk/video/)):
  - The player is driven by `@highsea-tv/client/player`'s reducer, with the same session flow as the web's (`apps/mobile/src/lib/playback.ts`).
  - It uses the `ios` built-in profile from `@highsea-tv/stream/profiles` ([ADR 0052](0052-device-profiles.md)'s dated section). AVPlayer has no way to ask what it decodes, so the phone doesn't report.
  - The stream is loaded with the device token in a header.
  - Subtitles are fetched as the session's WebVTT and drawn by the app with the person's offset, through `parseCues` and `cuesAt`.
  - Now Playing and the lock screen come from `showNowPlayingNotification`, with the source's title and artwork.
  - AirPlay is `VideoAirPlayButton` with `allowsExternalPlayback`. Picture in picture is AVKit's.
- **Tests:**
  - Jest with `jest-expo` and React Native Testing Library, as [Expo › Unit testing](https://docs.expo.dev/develop/unit-testing/) documents, for components and screens. Its files end in `.jest.tsx`, which Bun's runner leaves alone, and `bun run test` runs Bun's tests, then Jest's.
  - Reanimated uses its Jest resolver and `setUpTests()`, and worklets use their mock, as their testing guides say.
  - Under Bun's isolated installs, `node_modules/.bun` is let through to Babel, and `@babel/runtime` is mapped for the workspace's packages.
  - Logic stays in plain modules tested by Bun.
- **The licence audit** reads the pods: each pod in `Podfile.lock` gets its licence from its spec in `Pods/Local Podspecs` ([CocoaPods › license](https://guides.cocoapods.org/syntax/podspec.html#license)). CI's `native.yml` runs it after a prebuild.

## Consequences

- One codebase gives two apps' layouts, and the TV and Android follow from the same packages. The cost is two configs and two prebuilds.
- Nothing native is committed, so a new Expo SDK is a version bump and a prebuild. The cost is that a local module, like discovery, is the only Swift highsea keeps.
- The phone can't say what it decodes, so its profile is Apple's documented formats. A future report from AVFoundation's asset checks could refine it.
- Expo's native packages have to be held in step by hand when their releases disagree, as core and jsi did. Each override is listed, and dropped once the pinnable versions agree.
- The end-to-end run on the simulator (Maestro) and the TV's D-pad walk (XCUITest) are the plan's, and wait on the owner's word to install Maestro (4.5a's report).

## 2026-10-29: the TV app (checkpoint 4.5b)

- **`apps/tv` is on `react-native-tvos` 0.88.0-0,** pinned two days before it was two weeks old on the owner's word of 2026-10-29, as the phone already was ([Expo › Building for TV](https://docs.expo.dev/guides/building-for-tv/)). `@react-native-tvos/config-tv` 0.1.7 retargets the prebuild to tvOS 16.4 (`EXPO_TV=1 expo prebuild`), with the brand's Apple TV icons from an inline config plugin. Its bundle identifier is `tv.highsea.tv`. The app is written for Android TV too: shared code asks `Platform.isTV`, never the OS, and only discovery and the player have a part per platform.
- **`@highsea-tv/native`** holds what the phone and the TV share beyond drawing, moved out of `apps/mobile`: the servers and their keychain, discovery (the local module is now `packages/native/ios`), the session, media, the player (`playback.ts`) and the interface sounds (`sound.ts`, the sound packs rendered to WAV and played with expo-audio). Its `plugins/` hands CocoaPods `NODE_PATH` and `REACT_NATIVE_NODE_MODULES_DIR`, since Bun's isolated store hides `react-native` from the Podfile's scripts.
- **Focus is tvOS's engine,** reached through react-native-tvos's `Pressable` focus events, `TVFocusGuideView` (`autoFocus` for each row's memory, `destinations` and `trapFocus*` for `tv.md`'s guides) and `useTVEventHandler` for the keys ([react-native-tvos › README](https://github.com/react-native-tvos/react-native-tvos)). `ui-native/tv` lays highsea's model over it: the units, the hero's dwell, the page's lift, Back, and Play/Pause playing the focused title. UIKit's focus engine skips views under 0.01 alpha, hidden views and views without user interaction, so controls that fade keep a trace of opacity or take `pointerEvents` away on purpose ([Apple › About focus interactions](https://developer.apple.com/documentation/uikit/about-focus-interactions-for-apple-tv)).
- **Back** is the Menu key through `TVEventControl`. react-native-screens 4.30.0 took it for UIKit's own back gesture on a pushed screen, so the Menu key never reached JavaScript ([react-native-screens#4618](https://github.com/software-mansion/react-native-screens/issues/4618)). The fix, #4665, is merged and not yet released, so it's backported in `patches/react-native-screens@4.30.0.patch` through Bun's `patchedDependencies`, always on for tvOS. The patch goes when a pinnable release has it.
- **The player** is the phone's engine without picture in picture, Now Playing or AirPlay, which expo-video doesn't list for tvOS. Audio is picked by the server's decision in a new session, as for a transcode, the same on both platforms, so `audioTrack` isn't needed on tvOS (the plan's question 8).
- **The D-pad walk** is an XCUITest on `XCUIRemote` (`apps/tv/uitest/DpadWalk.swift`, run by `scripts/sweeps/tv.ts`). The plan had it added to the generated project by a config plugin; the `xcode` package the plugins edit with has no UI-testing target type, so the test is its own project, generated with XcodeGen from `apps/tv/uitest/project.yml`, and launches the installed app by its bundle identifier ([Apple › XCUIApplication(bundleIdentifier:)](https://developer.apple.com/documentation/xctest/xcuiapplication/init(bundleidentifier:))). `ui-native`'s focus stops carry test ids (`tv:`, the row and index, then the label), which tvOS exposes as accessibility identifiers.
- **The licence audit** also reads pods from CocoaPods' trunk (expo-image's SDWebImage and codecs), from the specs `pod install` keeps in `~/.cocoapods/repos/trunk`, and the TV's pods beside the phone's.

## 2026-11-01: ui-native joined with ui-web (design system 1.1)

[ADR 0060](0060-one-design-system-one-library.md) joins `@highsea-tv/ui-native` and `@highsea-tv/ui-web` as one package, `@highsea-tv/ui`, chosen by the `react-native` export condition. The phone and the TV import `@highsea-tv/ui` (and `@highsea-tv/ui/tv`) and get the React Native renderer. Its controls take their sizes from the tokens' control spec: touch draws 36, with `hitSlop` making up 44, and the TV's controls are the TV rule of the same components rather than components of their own. The phone's Jest maps `react` to the app's copy, as Expo's Metro does in a workspace.
