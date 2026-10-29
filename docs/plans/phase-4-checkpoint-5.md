# Phase 4, checkpoint 4.5: the native apps, on the phone and the TV

- **Status:** Scoped on 2026-10-29 and approved with [the owner's answers](#the-owners-answers) of 2026-10-29 (every recommendation but questions 9 and 12: an AirPlay button on the phone's player now, and the TV checked on the simulator only). 4.5a is next, starting with its prototypes. Nothing is built.
- **Parent plan:** [phase-4-clients.md › Order of work](phase-4-clients.md#order-of-work-and-checkpoints), 4.5 and 4.6, joined on the owner's word of 2026-10-29 (see [The owner's changes](#the-owners-changes) in the parent plan), with [install-simplicity.md › E](install-simplicity.md#e-the-apps-find-pair-and-update-without-typing-folded-into-44-46)'s phone and TV items folded in.
- **Gate:** 4.4a was signed off on 2026-10-29 and 0.3.0 is published. On 2026-10-29 the owner held 4.4b (copies for a device) for later and asked for the native apps next, mobile and TV together, Apple's platforms first and Android after, from the same code.

## Read first

1. The parent plan: Standing rules, [The clients](phase-4-clients.md#the-clients), [Versions](phase-4-clients.md#versions), [Tests and checks](phase-4-clients.md#tests-and-checks), the exit criteria and The owner's answers (5, 6, 8 and 9 above all).
2. The design language for the two platforms: [platforms/mobile.md](../design-language/platforms/mobile.md) and [platforms/tv.md](../design-language/platforms/tv.md) (screen units, the spatial focus model, scrolling by transform, the hero's binding), with [motion.md](../design-language/motion.md), [sound.md](../design-language/sound.md) and [accessibility.md](../design-language/accessibility.md).
3. The specs, each with its prototype in `design/prototypes/src/mobile` and `src/tv` (routes in `src/routes.tsx`): [connectivity.md](../product/connectivity.md) (C1, the TV's sign-in by code), [client-home.md](../product/client-home.md), [client-library.md](../product/client-library.md), [client-detail.md](../product/client-detail.md), [client-search.md](../product/client-search.md), [player.md](../product/player.md), [client-settings.md](../product/client-settings.md) and [collections.md](../product/collections.md).
4. The ADRs: [0008](../adr/0008-clients-react-everywhere.md) (Expo and react-native-tvos; `ui-native` on the same tokens), [0053](../adr/0053-clients-build-and-distribution.md) (Proposed for mobile and TV until this checkpoint), [0055](../adr/0055-clients-shared-logic.md) (`@highsea-tv/client`), [0052](../adr/0052-device-profiles.md), [0051](../adr/0051-playback-engine.md), [0054](../adr/0054-watch-state.md), [0020](../adr/0020-discovery-port.md) (mDNS `_highsea._tcp`), [0024](../adr/0024-two-step-passkeys-and-tvs.md) (device tokens and pairing by code), [0050](../adr/0050-release-and-versioning.md), [0058](../adr/0058-desktop-app.md) (what the desktop app settled about servers, tokens and sign-on that the native apps repeat).
5. The code: `packages/client` (data, format, prefs, player), `packages/sdk/src/connection.ts`, `packages/tokens/src/native.ts`, `apps/web/src/` (the screens and the player this ports from), `apps/desktop/src-tauri/src/` (servers, discovery and single sign-on as the desktop app does them), and `packages/stream/src/hls/playlist.ts`.

## Goal

People can put highsea on their iPhone and their Apple TV. The phone finds the server on the home network, signs in once, and keeps the sign-in in the keychain. The TV shows a code and a QR code, and the phone, already signed in, approves it, so nobody types on the TV. Both apps have every C1 to C8 screen as their prototypes draw them, with the design system's components built once for React Native (`@highsea-tv/ui-native`) and shared. Films play in Apple's own player, with audio and subtitle choices, subtitle timing, trickplay, Next up, and on the phone picture in picture and the lock screen's Now Playing. The TV is driven entirely by the Siri Remote, with highsea's focus model and sounds. Then the same code builds for Android phones and Android TV. Builds run in CI unsigned, and on the owner's iPhone from this Mac; nothing goes to TestFlight or a store until the Apple membership and the owner's word.

## Out of scope

- **Downloads and the Offline tab's list:** held with 4.4b, which becomes 4.6, downloads for the desktop app and the phone together, since they share the server's copies and the 30-day rule ([question 11](#open-questions-for-the-owner)). Until then the phone's Offline tab shows its heading and **Nothing downloaded**, as the desktop app does ([question 7](#open-questions-for-the-owner)).
- **TestFlight, the App Store and Google Play:** need the Apple Developer Program and a Play organisation account (the parent plan's answer 6). The owner set the Apple membership aside on 2026-10-29. CI builds for simulators and emulators, unsigned, and the owner's iPhone runs development builds signed by the personal team.
- **Universal links and `highsea.tv/open`:** Associated Domains needs the paid membership ([Apple › supported capabilities](https://developer.apple.com/help/account/reference/supported-capabilities-ios)). `highsea://` links come now; universal links come with the membership.
- **Push notifications:** none in Phase 4 (answer 7). The apps read what's new over the event stream while open.
- **Chromecast:** not in Phase 4. AirPlay comes in as a button on the phone's player ([the owner's answer 9](#the-owners-answers)); the TV is an AirPlay receiver itself and gets none.
- **The tvOS Top Shelf extension:** after 1.0. It's a separate app extension with its own target.
- **Fire TV (Vega), webOS and Tizen:** later, as the parent plan has them.

## Where things stand

- **Shared logic** is in `@highsea-tv/client` (ADR 0055): the data hooks over `@highsea-tv/sdk/react`, `format`, `prefs` and the player's reducer, all free of the DOM so React Native imports them as they are.
- **Tokens:** `@highsea-tv/tokens/native` gives React Native plain numbers, hex colours with alpha, and the shadows (`packages/tokens/src/native.ts`).
- **Servers and sign-in:** the SDK's `createServerConnection` with `KnownServer` and device tokens; `auth.signIn` with a `device` returns one per server; pairing by code and `/link` are built for the TV (ADR 0024); single sign-on from an app goes through the system browser and back with PKCE (ADR 0024's 4.4a section). The desktop app keeps tokens in the OS's keychain and servers in a file. The native apps do the same with the iOS keychain.
- **Discovery:** the server publishes `_highsea._tcp` over mDNS (ADR 0020, through the host's avahi on NAS templates) and says which address apps use (`system/info/public`).
- **Playback:** direct play by byte ranges, and HLS in fragmented MP4 whose multivariant playlist already lists the subtitles as `EXT-X-MEDIA` renditions for Apple's players (`packages/stream/src/hls/playlist.ts`); WebVTT per subtitle; trickplay sheets; device profiles with a report from each device (ADR 0052). Safari on the iPhone already plays through `/web`.
- **Prototypes** draw every mobile and TV screen, including the TV's sign-in by code with the QR. Not prototyped: the phone's side of pairing a TV (scanning the TV's QR, then approving it), the phone's local-network prompt, and Offline without downloads.
- **This Mac** has Xcode 27.1 with the iOS 26.5 and tvOS 26.5 simulators, CocoaPods and watchman, and the owner's iPhone 14 Pro Max is paired, with a personal team's "Apple Development" identity. There's no Android SDK yet.
- **Versions pinnable now** (from the npm registry, released on or before 2026-10-15; [Expo SDK 58](https://expo.dev/changelog/sdk-58)):
  - Expo SDK 58 (React Native 0.88, React 19.3.0, iOS and tvOS 16.4 at least): `expo` 58.0.11 and `react-native` 0.88.0.
  - `react-native-tvos` 0.88.0-0 (2026-10-17), pinnable on **2026-10-31**.
  - `@react-native-tvos/config-tv` 0.1.7, `react-native-reanimated` 4.7.1 with `react-native-worklets` 0.13.0, `react-native-svg` 15.16.0, `@storybook/react-native` 10.7.0, `@testing-library/react-native` 14.1.0.
  - SDK 57 (React Native 0.86, React 19.2.3) is the fallback, but its React doesn't meet `@highsea-tv/client`'s peer of `^19.3.0`.

## The size of this checkpoint, and its parts

Three gated parts, each reviewed on its own:

- **4.5a, the phone on iOS:**
  - prototypes of what isn't drawn yet;
  - the Expo workspace in the monorepo;
  - `@highsea-tv/ui-native`'s components;
  - `apps/mobile` with C1 in full: Bonjour, the keychain, several servers and single sign-on;
  - every C2 to C8 screen;
  - the player on AVPlayer, with picture in picture and Now Playing;
  - checked on the owner's iPhone.
- **4.5b, the TV on tvOS:**
  - `apps/tv` on react-native-tvos with highsea's focus model on tvOS's focus engine;
  - sign-in by code with the QR, approved from the phone;
  - every TV screen and the player on the Siri Remote;
  - sounds on by default;
  - the D-pad walk on the simulator.
- **4.5c, Android and Android TV:**
  - the same two apps on Android phones and Android TV;
  - discovery through `NsdManager`;
  - the player on Media3 through the same module;
  - the emulators in CI.

Each part ends with unsigned builds in CI and the guides for what it adds. ADR 0053's mobile and TV part is Accepted at 4.5c's sign-off.

## Progress

- **2026-10-29, 4.5a's prototypes, signed off by the owner on 2026-10-29:** the four prototypes, each with its spec updated. With them the owner approved the two new icons and left the camera-refused state described in the spec but not drawn, as recommended.
  1. **Approve a TV from the phone:** You › Servers › **Sign in a TV**, then Connect a device (scanning, or **Enter the code instead**), Sign in {device}?, signed in, and a code that isn't waiting (`design/prototypes/src/mobile/pair.tsx`; [connectivity.md › Pairing a TV from the phone](../product/connectivity.md#pairing-a-tv-from-the-phone)). The words are the server's `/link` page's.
  2. **The phone's local-network prompt:** the connect flow's asking and refused states in the iPhone's words (`ConnectFlow`'s `platform`, toolbar › Local network).
  3. **Offline before downloads:** "Nothing downloaded" until 4.6 (toolbar › Downloads; [client-settings.md › Offline](../product/client-settings.md#offline)).
  4. **AirPlay on the phone's player:** the button before Audio and subtitles, a stand-in for iOS's picker, and "Playing on {device}" ([player.md › Mobile](../product/player.md#mobile)).
  - ui-web gains two Lucide icons, `airplay` and `scan` (`ScanQrCode`): an addition to the design system's icon set, approved with the prototypes.

## Prototypes first (4.5a)

Each is prototyped in `design/prototypes` and approved before it's built, with its spec updated:

1. **Approve a TV from the phone** (connectivity.md): You › Servers' **Sign in a TV**, the camera's QR scan (with **Enter the code instead** for six characters), then "Sign in {device name} to {server}?" with **Approve** and **Cancel**, then "Approved. The TV is signing in." A `highsea://link?server=…&code=…` link from the TV's QR opens straight to the question when the phone has the app; without the app, the phone's camera opens `{server}/link` as now.
2. **The phone's local-network prompt** in C1: the state before and after iOS's question, as the Mac's is drawn (connectivity.md's states).
3. **Offline before downloads** on the phone: the heading and **Nothing downloaded**, as the desktop app's Downloads was changed on 2026-10-29, until 4.6 brings the list ([question 7](#open-questions-for-the-owner)).
4. **AirPlay on the phone's player** ([the owner's answer 9](#the-owners-answers)): the AirPlay button beside Audio and subtitles in the top bar's right, and the player's state while it plays on another screen ("Playing on {device}", the artwork, the controls kept). It changes the locked player, so player.md's Mobile layout is updated when it's approved.

The prototype's toolbar gets **Local network** for mobile, as desktop has it.

## The Expo workspace (4.5a)

- **Expo SDK 58**, React Native 0.88 and React 19.3.0, on the New Architecture, which SDK 55 and later can't turn off ([Expo › New Architecture](https://docs.expo.dev/guides/new-architecture/)) ([question 1](#open-questions-for-the-owner)).
- **Both apps on `react-native-tvos`:** "if you have more than one Expo project in a monorepo, and one of them is modified for TV, then all of them should be modified to use the React Native TV package" ([Expo › Building for TV](https://docs.expo.dev/guides/building-for-tv/)). So `apps/mobile` depends on `react-native` as `npm:react-native-tvos@0.88.0-0` from the start, and `expo.install.exclude` keeps `expo install` from undoing it. The TV app adds `@react-native-tvos/config-tv`, which retargets the native project to tvOS at `expo prebuild`.
- **Two apps, not one with a switch:** `apps/mobile` and `apps/tv`, each with its own `app.config.ts`, bundle identifier and layouts, sharing `ui-native` and `@highsea-tv/client`. A prebuild targets one platform ("Podfile only have one target", config-tv's README), and the prototypes keep separate layouts per platform ([question 2](#open-questions-for-the-owner)).
- **Native projects are generated:** `ios/` and `android/` come from `expo prebuild` (Continuous Native Generation) and are gitignored. Anything native is in config plugins or local Expo modules ([Expo › Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)).
- **The monorepo:** Metro's monorepo setup is automatic since SDK 52, with Bun ([Expo › Monorepos](https://docs.expo.dev/guides/monorepos/)). Package `exports` are on by default since Metro 0.82, and `.ts` extensions in imports resolve as written ([Metro › Configuration](https://github.com/facebook/metro/blob/main/docs/Configuration.md), [Resolution](https://github.com/facebook/metro/blob/main/docs/Resolution.md)). The repo's installs are isolated (Bun's default for workspaces), which Expo supports from SDK 54 "though not all packages work". If one doesn't, the fallback Expo documents is the hoisted linker, and it's recorded as a finding.
- **One React per app:** the web stays on 19.3.1 and the native apps take SDK 58's 19.3.0. Shared packages already declare React as a peer, so each app resolves its own.
- **Commands:** `bun run mobile` and `bun run tv` (Metro), `bun run --cwd apps/mobile ios --device` for the owner's iPhone, and `bun run --cwd apps/tv ios` for the tvOS simulator. They go in `CLAUDE.md`.
- **The house rules:**
  - every dependency through `/add-dependency`;
  - the licence audit reads CocoaPods' pods as it reads the crates: from `Podfile.lock` and each pod's spec;
  - `bun run audit` covers the new npm tree.

## `@highsea-tv/ui-native` (4.5a, with the TV's parts in 4.5b)

ADR 0008's second implementation, on `@highsea-tv/tokens/native`:

- **What it has:** the components the two apps use, named and shaped as in `ui-web`: Button, Poster, wide tile, row (a horizontal list), Badge and quality pills, the progress bar, Sheet, SegmentedControl, Field, Dialog, EmptyState, the server mark, the avatar, the tab bar, the hero, and the scrubber with its trickplay frame. Each is written for React Native, never as a web component behind a wrapper.
- **Type and units:**
  - The phone uses points and Dynamic Type, holding at 200% (`mobile.md › Type`).
  - The TV uses screen units: `1u` is 1% of the window's width from `useWindowDimensions` (`tv.md › Units`).
  - Fonts are loaded with `expo-font`, which runs on tvOS.
- **Motion:**
  - Reanimated 4 with `react-native-worklets`, which it needs ([Reanimated › Getting started](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/)).
  - The springs come from the motion tokens, and reduced motion is honoured through Reanimated's `useReducedMotion`.
- **Graphics:**
  - Icons are drawn with `react-native-svg` from the same Lucide set as `ui-web`.
  - Artwork uses `expo-image`, decoded at display size (`tv.md › Performance`).
- **Sound:** the sound packs play through `expo-audio`. Sound is off by default on the phone and follows the silent switch; it's on by default on the TV (`sound.md`).
- **Haptics:** `expo-haptics` gives a light tap on select and a success tap on success, as `mobile.md › Touch` has them.
- **Storybook:** `@storybook/react-native` in the phone build only, since it doesn't run on tvOS ([storybookjs/react-native](https://github.com/storybookjs/react-native)). TV components are seen in the TV app's own screens ([question 5](#open-questions-for-the-owner)).

## The phone app (4.5a)

`apps/mobile`, from `design/prototypes/src/mobile`:

- **C1, connecting:**
  - Choose a server, with Your servers, On this network, Add a server by address and the collapsed Find my servers.
  - Discovery is Bonjour `_highsea._tcp` only, through a local Expo module on Network framework's `NWBrowser` ([Apple › NWBrowser](https://developer.apple.com/documentation/network/nwbrowser)) ([question 3](#open-questions-for-the-owner)).
  - `Info.plist` gets `NSLocalNetworkUsageDescription` and `NSBonjourServices` (`_highsea._tcp`), which is all browsing a declared type needs. No multicast entitlement is needed ([TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)).
  - Device tokens are kept in the keychain through `expo-secure-store` ([Expo › SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)), and known servers in the app's documents.
  - Single sign-on goes through `expo-web-browser`'s auth session and back by `highsea://oidc`, with the PKCE exchange the desktop app uses.
  - The switcher is a sheet, as `connectivity.md` has it.
- **C2 to C8:**
  - Home: the announcement, the featured carousel, the rows, and pull to refresh (answer 9).
  - Library with the Unwatched filter, Search, Collections and the item page, with Mark as watched in More.
  - You: Appearance (themes, with Use on all my devices), Home's layout, Servers, About.
  - Offline as [above](#prototypes-first-45a).
  - Navigation is Expo Router, with native stacks, sheets and large titles where `mobile.md` asks for them ([Expo Router](https://docs.expo.dev/router/introduction/)).
  - Every read and write goes through `@highsea-tv/client`'s hooks.
- **The player** is described [below](#the-player-on-apples-platforms-45a-and-45b).
- **Pairing a TV:** the approved prototype, scanning with `expo-camera`'s barcode scanner, then approving through the pairing route.
- **Links:** `highsea://` (connect, link and oidc) as the app's scheme.
- **On the owner's iPhone:**
  - A development build installed with `expo run:ios --device` and signed by the personal team ([Expo › Local app development](https://docs.expo.dev/guides/local-app-development/)).
  - The profile lasts 7 days, and then the build is made again ([Apple › About your developer account](https://developer.apple.com/help/account/basics/about-your-developer-account/)).
  - Background audio and picture in picture are background modes, which a personal team may use.

## The TV app (4.5b)

`apps/tv`, from `design/prototypes/src/tv`:

- **Focus:**
  - **tvOS's own focus engine moves focus.** react-native-tvos exposes it through `Pressable`'s focus events, `TVFocusGuideView` (`destinations`, `autoFocus` and `trapFocus*`) and `useTVEventHandler`.
  - **highsea's model is laid on top of it** ([react-native-tvos › README](https://github.com/react-native-tvos/react-native-tvos)):
    - each row or region is a guide with `autoFocus`, which gives group memory, so returning to a row lands on the poster you left;
    - `tv.md`'s guides (Up from any row goes to the hero's actions, the top tab row on Up) are `destinations`.
  - **Rows and the page scroll by transform** with the springs, keeping focus at 30% from the left and 32% from the top, measured from centres (`tv.md › Scrolling`).
  - **Where tvOS's engine picks differently from the reference engine,** the guides correct it, and each difference that remains is listed in the report ([question 4](#open-questions-for-the-owner)).
- **Remote keys:**
  - Menu is Back, through `TVEventControl`'s menu key, and the home root's two-step exit.
  - Play/Pause plays the focused title.
  - A long press of OK is Mark as watched (answer 9).
  - Each plays its sound.
- **C1 on the TV:**
  - Sign in with your phone is the default: the code and the QR, waiting and approved, as prototyped.
  - The QR holds `highsea://link?server=…&code=…`, and its text falls back to `{server}/link`.
  - **Use a password** has the on-screen key grid.
  - Servers on this network come from Bonjour.
  - tvOS doesn't apply local-network privacy, so there's no prompt (TN3179).
  - A TV's sign-in lasts until it's revoked (answer 9).
- **Screens:** Home's hero and rows, with the hero bound to the featured row after 220 ms of dwell and its two layers cross-fading (ADR 0015), plus Library, the item page, Search with the system's dictation (answer 9), Collections and Settings.
- **The D-pad walk:** Maestro, Expo's documented end-to-end tool, has no tvOS support yet (its tvOS pull request is open), and neither does Detox. So the walk is an XCUITest that drives `XCUIRemote` on the tvOS simulator ([Apple › XCUIRemote](https://developer.apple.com/documentation/xctest/xcuiremote)). It is added to the generated project by a config plugin, and it checks every focusable is reachable on each screen, as `dpad.ts` does for the prototype ([question 6](#open-questions-for-the-owner)).

## The player on Apple's platforms (4.5a and 4.5b)

- **The video component:** `expo-video` on AVPlayer, on iOS and tvOS ([Expo › Video](https://docs.expo.dev/versions/v58.0.0/sdk/video/)).
  - Direct play uses the session's URL, and HLS uses the multivariant playlist, with request headers for the stream token where the URL doesn't carry it.
  - The phone gets picture in picture (`supportsPictureInPicture`), background playback, Now Playing on the lock screen with the title and artwork (`showNowPlayingNotification` and `metadata`), and AirPlay through expo-video's `VideoAirPlayButton` with `allowsExternalPlayback`, iOS only (the owner's answer 9). While AirPlay plays, positions are still reported from the player's time.
  - The TV gets none of these, as the docs say.
- **The player's logic** is `@highsea-tv/client/player`'s reducer, driven by the video's events, as the web player drives it. Positions are reported and saved as on the web, and Next up and the stream's states come from the prototype.
- **Subtitles are drawn by the app, as on the web:**
  - The session's WebVTT is drawn over the video with the person's offset, the same way for direct play and HLS.
  - expo-video has no API for sidecar tracks, and the offset couldn't be applied to tracks AVPlayer draws itself.
  - The playlist keeps listing them for other Apple players.
- **Audio tracks:** chosen through `audioTrack` on iOS. The docs list it for Android and iOS, so tvOS is checked on the simulator; if it isn't there, the server's decision picks the track, as for a transcode ([question 8](#open-questions-for-the-owner)).
- **The device's report** (ADR 0052): AVFoundation has no "can decode" query that expo-video exposes, so the apps start from built-in profiles for the iPhone and Apple TV, taken from Apple's documented formats:
  - HEVC, H.264, AAC, AC-3 and E-AC-3;
  - Dolby Vision and HDR10 on the models that have them;
  - the screen's HDR from `expo-device` and the screen's traits.
  - [Apple › HLS authoring specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices).

  A small native module that asks AVFoundation per codec comes only if the profiles prove wrong.
- **Trickplay:** the sheets drawn in the scrubber, as on the web.
- **Checked:**
  - on the owner's iPhone, its AirPlay to a TV, and the tvOS simulator (no real Apple TV until TestFlight, the owner's answer 12), with Sintel, an MKV that needs HLS, and a 4K HDR file from the NAS (read only);
  - the decision for each checked in the report.

## Android and Android TV (4.5c)

- **The SDK:** Android Studio's command-line SDK and emulators installed on this Mac (with the owner's go-ahead, since it's a large install), then `expo prebuild` for Android.
- **The TV build:** config-tv adds the leanback launcher.
- **Discovery:** `NsdManager` in the same local module. Android 17's local network permission, or the system picker, which needs no permission at all ([Android › NsdManager](https://developer.android.com/reference/android/net/nsd/NsdManager)).
- **Playback:** expo-video plays through Media3/ExoPlayer, whose `isSupported` per track feeds a real device report.
- **Back:** predictive back on the phone; Back on the remote for the TV.
- **CI:** builds and the end-to-end run on Android's emulators. Maestro covers the phone, and the TV's D-pad walk uses Maestro's key presses, which Android TV supports.
- **Not in 4.5c:** Google Play's internal testing waits for the organisation account (answer 6).

## Builds and CI (each part)

- **`.github/workflows/native.yml`:**
  - on changes to `apps/mobile`, `apps/tv`, `packages/ui-native` and what they import;
  - `expo prebuild`, then `xcodebuild` for the iOS and tvOS simulators, unsigned, on a macOS runner;
  - Android's builds from 4.5c;
  - the Jest tests and the end-to-end runs.
- **Builds are local, not EAS Build** ([question 10](#open-questions-for-the-owner)):
  - EAS makes only iOS provisioning profiles, and the TV guide says to keep tvOS's credentials local;
  - local builds keep signing in the `release` environment as the desktop app's does.
- **Versions:** each app carries the release's version, and `scripts/release.ts prepare` sets it in both `app.config.ts` files. Build numbers count up on their own (ADR 0050's dated section).
- **The release workflow** gains nothing in 4.5: no store uploads until the membership and the owner's word.

## Tests and checks

- **Tests:**
  - **Unit and component tests** use Jest with `jest-expo` and React Native Testing Library, which is what Expo documents ([Expo › Unit testing](https://docs.expo.dev/develop/unit-testing/)). Bun's runner isn't supported for React Native. `bun run test` runs them as a workspace step beside Bun's, so one command still runs everything ([question 5](#open-questions-for-the-owner)).
  - **What stays on Bun:** pure logic (the focus model's helpers, the device profiles, the units) lives in plain modules and is tested with Bun as the rest of the repo is.
  - **End-to-end on the phone:** Maestro on the iOS simulator, signing in to the sweep's seeded server and playing Sintel.
  - **End-to-end on the TV:** the XCUITest D-pad walk.
- **Before each report:**
  - the full `/checks`, plus the native workflow's jobs locally;
  - accessibility checked with Xcode's Accessibility Inspector on the main screens, and VoiceOver labels from the i18n catalogs;
  - the screens side by side with their prototypes, as `compare.ts` does for the admin, from simulator screenshots (`xcrun simctl io booted screenshot`).

## The guides

`apps/docs/content/watch/`:

- **The highsea app for iPhone (4.5a):** installing it, which until the App Store is TestFlight's or the owner's, so the page says it's coming. It also covers connecting, the local-network question, watching, picture in picture, and signing in a TV.
- **Apple TV (4.5b).**
- **Android (4.5c).**

Each says "Written for highsea 0.4.0".

## ADRs

- **0059, the native apps** (new, Proposed until 4.5c): Expo SDK 58 on react-native-tvos for both apps, generated native projects, the two-app layout, `ui-native`, focus on tvOS's engine with highsea's guides, expo-video with subtitles drawn by the app, Bonjour through a local module, the keychain, Jest beside Bun, local builds.
- **Dated sections:**
  - 0053, mobile and TV as built (each part);
  - 0052, the iPhone's and Apple TV's built-in profiles;
  - 0020, discovery from the phone and TV;
  - 0024, approving a TV from the phone;
  - 0050, the apps' versions and build numbers;
  - 0009, the audit reads pods.

## Risks

- **Version timing:** `react-native-tvos` 0.88.0-0 is pinnable on 2026-10-31. The prototypes come first, so it doesn't delay anything. Expo's versions table names "0.87-stable" for SDK 58, which looks out of date against React Native 0.88, so the pairing is taken from react-native-tvos's own release notes.
- **Isolated installs:** some React Native libraries assume a hoisted `node_modules`. Expo's documented fallback is the hoisted linker, but it changes the whole repo's layout. It's found early in 4.5a, and the owner decides if it comes to that.
- **tvOS's focus engine isn't highsea's:** geometric picks and edge cases differ. Guides close most of the gap; what's left is listed.
- **expo-video on tvOS:** the audio and subtitle track APIs aren't documented there. Subtitles don't depend on them, and audio falls back to the server's choice.
- **No D-pad end-to-end tool for tvOS:** the XCUITest is highsea's own, maintained by hand.
- **7-day profiles:** the owner's phone build stops opening after a week until it's rebuilt. TestFlight removes this with the membership.
- **HDR and Dolby Vision on the TV aren't seen on hardware:** the simulator has no HDR display, so the Apple TV's profile for them rests on Apple's documentation until a real Apple TV runs a TestFlight build.
- **Size of the work:** this is the parent plan's two biggest checkpoints in one. The parts keep each review to one platform.

## Open questions for the owner

1. **Expo SDK.** **Recommended:** SDK 58 (React Native 0.88, React 19.3.0), whose react-native-tvos is pinnable on 2026-10-31, the same React line as the web. Or: SDK 57 (React Native 0.86), pinnable today but on React 19.2.3, which `@highsea-tv/client`'s peer doesn't allow without loosening it.
2. **One app per platform, or one project.** **Recommended:** `apps/mobile` and `apps/tv`, as the parent plan has them, each with its own config and layouts, sharing `ui-native` and `@highsea-tv/client`. Or: one Expo project that builds phone or TV by `EXPO_TV=1`, as Expo's TV guide shows. That's one config, but one set of routes for two very different layouts.
3. **Discovery on Apple's platforms.** **Recommended:** a small local Expo module on `NWBrowser`, in Swift, Apple's documented API on iOS and tvOS. Or: `react-native-zeroconf`, which covers iOS, Android and tvOS but is mid-rewrite (13 releases in the last month, 1.0 at rc.3).
4. **The TV's focus.** **Recommended:** tvOS's own focus engine, with highsea's groups and guides laid over it through `TVFocusGuideView`, and the differences listed. It's what Siri Remote users expect, including its swipe and click pad. Or: highsea's own engine in JavaScript, taking every key press. It matches the reference exactly but fights tvOS on gestures and accessibility.
5. **Tests for React Native.** **Recommended:** Jest with `jest-expo` for components, beside Bun for everything else, both run by `bun run test`. Or: Bun only, keeping native components untested and their logic in plain modules. That's one runner but no component tests.
6. **The TV's D-pad walk.** **Recommended:** an XCUITest with `XCUIRemote` on the tvOS simulator, in CI. Or: walked by hand at each review until Maestro's tvOS support lands. That's less to keep up, but nothing catches a regression between reviews.
7. **Offline on the phone until downloads.** **Recommended:** the tab stays, with **Nothing downloaded**, as the desktop app's Downloads does. 4.4b then brings downloads to desktop and phone together, as 4.6. Or: hide the tab until downloads, which is a change to the locked tab bar.
8. **Audio tracks on tvOS if expo-video lacks them.** **Recommended:** the server's decision picks the person's audio track (a direct stream), as a transcode already does. Or: a small native module for AVPlayer's media selection, more work for one case.
9. **AirPlay.** **Recommended:** leave AVPlayer's own AirPlay as it is, with no button added (out of the parent plan's scope). Or: add expo-video's AirPlay button now. It's one component, but it's a change to the prototyped player.
10. **Builds in CI.** **Recommended:** local `expo prebuild` and `xcodebuild` on GitHub's macOS runners, unsigned, signing later from the `release` environment as the desktop app does. Or: EAS Build. It's managed, but it needs an Expo account and keeps tvOS credentials local anyway.
11. **Where 4.4b goes.** **Recommended:** downloads for the desktop app and the phone together as 4.6, after 4.5, since they share the server's copies and the 30-day rule. Or: 4.4b on its own as planned, then the phone's downloads later.
12. **An Apple TV to check on.** **Recommended:** the tvOS simulator for the build, and a real Apple TV at 4.5b's review if the owner has one on the network, to check the remote, HDR and Dolby Vision. Or: the simulator only until the membership allows TestFlight.

## The owner's answers

On 2026-10-29 the owner took every recommendation for questions 1 to 12 except 9 and 12:

1. **Expo SDK 58**, React Native 0.88 and React 19.3.0, with react-native-tvos 0.88.0-0 once pinnable on 2026-10-31.
2. **Two apps,** `apps/mobile` and `apps/tv`, sharing `ui-native` and `@highsea-tv/client`.
3. **Discovery through highsea's own local Expo module** on `NWBrowser`, with `NsdManager` added in 4.5c.
4. **tvOS's own focus engine,** with highsea's groups, memory and guides laid over it through `TVFocusGuideView`, and the remaining differences listed.
5. **Jest with `jest-expo` beside Bun,** both run by `bun run test`.
6. **The D-pad walk as an XCUITest** with `XCUIRemote` on the tvOS simulator, in CI.
7. **Offline stays** on the phone, with **Nothing downloaded** until downloads.
8. **The server picks the audio track on tvOS** if expo-video can't switch it there.
9. **Changed by the owner:** the phone's player gets an AirPlay button now, prototyped and approved first ([Prototypes first](#prototypes-first-45a), item 4).
10. **Local `expo prebuild` and `xcodebuild`** on GitHub's macOS runners, unsigned.
11. **4.4b becomes 4.6:** downloads for the desktop app and the phone together, after 4.5.
12. **Changed by the owner:** the TV app is checked on the tvOS simulator only, with no real Apple TV until TestFlight.
