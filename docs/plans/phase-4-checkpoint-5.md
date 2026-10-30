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
- **2026-10-29, 4.5a, built and waiting for the owner's review:**
  - **The Expo workspace:** Expo SDK 58.0.11 and React Native 0.88.0 under Bun's isolated installs, with Metro as it comes. `expo-modules-core` 58.0.19 and `expo-modules-jsi` 58.0.14 are held together in the root `overrides`: with jsi 58.0.21 the app stopped at launch on a missing `createHostObject` (ADR 0059). `ios/` is generated by `bun run prebuild` and never committed.
  - **`@highsea-tv/ui-native`:** ui-web's components by name and shape on the tokens' native export (Badge, Banner, Brand, Button, EmptyState, Field, Icon, Poster, Pressable, Progress, Row, SegmentedControl, Sheet, Switch, Text and the theme), with Lucide through `lucide-react-native` by ui-web's names. `test/icons.test.ts` keeps the names and glyphs in step with ui-web.
  - **`apps/mobile`:** C1 in full: Choose a server, discovery in a local Expo module on `NWBrowser` (`modules/discovery`), the local-network states, Add a server by address, signing in with two-step codes, single sign-on through `ASWebAuthenticationSession` and `highsea://oidc` with PKCE, several servers (`@highsea-tv/client/servers`, `servers.json`, tokens in the keychain), and the switcher. Also C2 to C8 on Expo Router (Home, Library, Search, Collections, the item page, You and its Settings, and Offline before downloads), the player (`src/app/play/[id].tsx`, `src/lib/playback.ts`) on expo-video with the web's session flow, its own WebVTT drawing with the timing offset, trickplay, Next up, picture in picture, Now Playing and AirPlay, pairing a TV (`src/app/link/`, with expo-camera's scanner), and `highsea://` links.
  - **Shared:** `@highsea-tv/client` gains `library` (the shelves the web and the phone share, moved out of `apps/web/src/library.tsx`), `servers` and `player`'s `parseCues`, which the phone uses with `cuesAt`. `@highsea-tv/stream/profiles` gains the `ios` and `tvos` built-in profiles.
  - **Tests:** Jest 30.5.2 with `jest-expo` 58.0.11 and React Native Testing Library 14.1.0, in `*.jest.tsx` files (7 tests), run by `bun run test` after Bun's tests. Bun covers the shared logic (library, servers, cues, the profiles' decisions and the icons).
  - **CI and the audit:** `.github/workflows/native.yml` (macOS 26: types, Jest, prebuild, the licence audit with pods, and an unsigned Release build for the simulator, which also built here). `scripts/license-audit.ts` reads `Podfile.lock` and each pod's spec (121 pods). `scripts/release.ts` keeps `apps/mobile/package.json`'s version in step.
  - **Docs:** ADR 0059 (Proposed until 4.5c), with dated sections in 0009, 0020, 0024, 0050, 0052, 0053 and 0055. The guide is "The highsea app for iPhone" (`apps/docs/content/watch/iphone.mdx`).
  - **Departures:** AirPlay's state reads "Playing on another screen", because expo-video doesn't give the route's name. The Tracks panel is an iOS page sheet. The player turns with the phone rather than staying landscape. The phone sends no device report, since AVPlayer can't be asked what it decodes. `test-renderer` 1.3.0 was added by hand because `bun run pin` doesn't find it (npm has it, MIT, 2026-09-17), and `@babel/runtime` stays on 7.29.10 for Babel 7's helpers. The audit has one dated exception: zod 3.25.76, used only by Expo's CLI (GHSA-mrhx-c7xc-m3w5, until 2026-11-29).
  - **Not done:** Maestro (its install was refused in this session, for the owner to decide; done since, below); the build on the owner's iPhone; the Accessibility Inspector pass and the screens beside their prototypes from simulator screenshots.
  - **The owner's answers at review (2026-10-29):** Maestro may be installed (with Java 17 or later, which its docs require; the installer edits `~/.zshrc`); the build goes on the owner's iPhone for them to try; the three changes from the prototype (AirPlay's "Playing on another screen", the Tracks page sheet, the player turning with the phone) are accepted; the zod exception stays until 2026-11-29.
  - **Maestro, 2026-10-29:** Maestro 2.11.0 installed with Java 17, on the owner's answer. `apps/mobile/.maestro/sign-in-and-play.yaml` and its runner `scripts/sweeps/phone.ts`: from a fresh install on the simulator, add the seeded server by address, sign in as Theo, search for Sintel, play it, go back and find Resume; then the server's history must have Theo's iPhone playing it. It passes in 48 s. Running it found three things, now fixed:
    - **The app closed on Search's results.** Hermes has no `Intl.PluralRules` or `Intl.Locale` ([Hermes › Intl APIs](https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md)), so the first `{count, plural, …}` message threw and ended the app; the Debug build on Metro hadn't reached that line. FormatJS's polyfills, forced as [its docs](https://formatjs.github.io/docs/polyfills/intl-pluralrules) say for Hermes, load first in `src/lib/intl.ts`: `@formatjs/intl-locale` 5.3.12 and `@formatjs/intl-pluralrules` 6.3.15 (MIT, pinned with `bun run pin`; licences and audit clean). The build on the owner's iPhone predates this, so its Search would close the same way; it needs the new build.
    - **An unsigned simulator build can't keep a sign-in:** with `CODE_SIGNING_ALLOWED=NO`, Xcode embeds no entitlements, so the keychain refuses the token ("couldn't keep your sign-in"). `native.yml` now signs the simulator build ad hoc (`CODE_SIGN_IDENTITY=-`, no certificate).
    - **Text fields had no accessibility label:** React Native has no `<label for>`, so ui-native's `Field` hands its label to the `Input` inside, which VoiceOver reads once ([React Native › accessibilityLabel](https://reactnative.dev/docs/accessibility#accessibilitylabel)).
    - Kept out of CI on the owner's word of 2026-10-29: the flow is a local phone sweep, run before each checkpoint report (a job would need a booted simulator and the server's build on the macOS runner, about 15 minutes more a run).
  - **Fixed from the owner's tries on their iPhone (2026-10-29):** choosing a server you already use looped back to Choose a server, since a guarded route fell back to the navigator's anchor (`redirectTo` on `Stack.Protected` now names each phase's first screen); after sign-in You showed before Home (the tabs' `unstable_settings.anchor` is `(home)`, and arriving names `/`); Return in the address field sent the text a keystroke behind (it reads the field's own text).
  - **Forgetting a server (the owner's answer of 2026-10-29),** after a server restarted with a new id and the phone could no longer reach it: on Choose a server, swiping a row of Your servers left, or pressing it long, asks "Forget {name}?"; on its sign-in, **Forget this server** sits at the foot of the screen (kit.tsx's `Screen` takes a `footer`), also when the server doesn't answer. Each asks first, as You › Servers did (`src/lib/forget.ts`). The swipe asks as it opens, as Mail's full swipe does, and its red panel isn't a button. At the owner's review of it, the panel is drawn only in the gap the row leaves (`ForgetPanel` in `connect.tsx`), so nothing red shows while a row is pressed or at rest, nor past the card's corners. The panel can't be a button: in gesture handler 3.3 the panel's `pointerEvents` is an animated style that didn't take touches on iOS, and the row under it, React Native's `Pressable`, saw the finger lift as a press, so a swiped row doesn't open its server. VoiceOver has it as the row's action.
  - **Forget this server in every app that lists servers, and the danger ghost button (the owner's answers of 2026-10-29):** the button became the new `danger-ghost` variant, danger's words without its fill, in ui-web (`button.tsx`, with its story) and ui-native together; a change to the locked design system, which the owner asked for. The desktop app has it too, at the foot of its sign-in and of Unreachable before it (`apps/web/src/desktop/forget.tsx`), asking first in ui-web's `ConfirmDialog` and then calling `server_forget`, which drops the device token from the keychain and the server from the list. The web app in a browser has none, since it's served by its server. The TV gets it in 4.5b.
  - **The phone beside its prototypes (2026-10-29):** `scripts/sweeps/phone-compare.ts` and `apps/mobile/.maestro/compare.yaml` sign Theo in on the simulator and take each main screen, with the prototype's same screen from Playwright at the simulator's size: 14 pairs, `index.html` and `checklist.md`, written outside the repository. `.claude/launch.json` names the dev servers for the preview.
  - **The accessibility pass (2026-10-29):** Xcode's Accessibility Inspector audited the player, the item page and Unreachable with no warnings, and Choose a server with one, Dynamic Type on the text field, which is a false alarm: React Native scales text itself (`fontSizeMultiplier`, from `UIContentSizeCategoryDidChangeNotification`) rather than through UIKit's `adjustsFontForContentSizeCategory`, and the field visibly scales. The Inspector loses its target on each relaunch, and picking it again needs full control of the screen, so the other screens were walked at the Accessibility Large text size with screenshots and Maestro's hierarchy (every control labelled, sizes measured against Apple's 44 pt). Fixed:
    - **"1,200 sec ago" on Choose a server:** Hermes formats units on iOS through `NSMeasurementFormatter` without its unit options (`PlatformIntlApple.mm`), so Foundation converts to the locale's preferred unit and `narrow` becomes short. `@formatjs/intl-numberformat` 9.4.3 (MIT, pinned) is forced after the locale and plural polyfills in `src/lib/intl.ts`, as [its docs](https://formatjs.github.io/docs/polyfills/intl-numberformat) say.
    - **Buttons and fields at large text** ran their labels edge to edge: ui-native's `Button` and `Input` get 8 pt above and below, so the 44 pt touch height still wins at the default size.
    - **Content scrolled under the clock:** `Screen` draws a strip of the page's colour behind the status bar ([HIG › Status bars](https://developer.apple.com/design/human-interface-guidelines/status-bars)).
    - **Password under the keyboard at large text:** `Screen`'s scroller takes `automaticallyAdjustKeyboardInsets` ([React Native › ScrollView](https://reactnative.dev/docs/scrollview#automaticallyadjustkeyboardinsets-ios)).
    - **The avatar** (36 pt) gets a 44 pt target, and **Search's genre chips** keep their prototyped 36 pt with `hitSlop` to 44 pt and padding that grows with the text.
    - **The player:** Live Text is off on the video (`allowsVideoFrameAnalysis`), and the elapsed and remaining times are hidden from VoiceOver, since the scrubber already says "4:10 of 1:52:00".
    - Left as they are: a one-word title wider than a poster breaks mid-word at the largest sizes, You's "@theo · member of Harbor" ends in "…" at large text (VoiceOver reads it whole), and text re-lays out after a relaunch rather than live when the size changes, as React Native does.
  - **On the owner's iPhone (2026-10-29):** the Release build signed by the owner's team, installed over the cable with `devicectl`; the owner tried it and it works. **The tab bar's bottom (the owner's change of 2026-10-29):** the full home-indicator inset under the tabs looked loose, so the bar keeps 16 pt less of it (`tabBarBottom` in `kit.tsx`), 18 pt on a phone with a home indicator; the labels still clear the indicator. The prototype draws no space under its bar, so it's unchanged.
  - **Checks (2026-10-29, Node 26.11.1):** lint (1,439 files), typecheck, 11,997 tests pass (8 skipped) across 215 files and 7 Jest tests, smoke, licences (1,511 packages, 562 crates, 121 pods), the audit (1,123 packages and 563 crates; the zod exception until 2026-11-29), the docs build, the prototypes' sweeps (1,896 pages, 196 keyboard walks, the D-pad), the server's admin pages, the web playback run in Chromium and Firefox, `phone.ts` (45 s) and `phone-compare.ts` (14 pairs), all clean.
  - **Left open:** `@storybook/react-native` isn't set up (the components are seen in the app's screens and the compare pairs; it can come with the TV's parts in 4.5b or be dropped); the plan's playback checks on the phone with an MKV that needs HLS and a 4K HDR file from the NAS, and AirPlay to a TV, haven't been run (Sintel plays, on the simulator and the owner's iPhone); the Inspector audit of the screens past the four above waits for full control of the screen.
  - **The owner's answers at 4.5a's review (2026-10-29):**
    1. The phone's playback checks (an MKV that needs HLS and a 4K HDR file from the NAS, read only, and AirPlay to a TV) are done before 4.5a's sign-off, on the owner's iPhone, with the server's decision for each read and recorded here.
    2. **Changed from the plan:** `@storybook/react-native` is dropped. ui-native's components are seen in the apps' own screens and `phone-compare.ts`'s pairs (and the TV's screens in 4.5b).
    3. **Changed from the plan:** the Accessibility Inspector's audit stays at the four screens it covered; the walk at Accessibility Large with screenshots and Maestro's hierarchy stands for the rest, with no full-control session.
  - **The playback checks, on the simulator (2026-10-29):** the owner was away with the phone, so two films from the NAS were checked in the Release build on the iPhone 17 Pro simulator, against the sweep's seeded server. They're 10-minute excerpts cut from the NAS's files (read only) and imported by hardlink under the seed's titles, since TMDB answers from the recordings: Cobweb (2023, 1080p WEBRip, H.264 and AC-3 in MKV) as Big Buck Bunny's 1080p version, and Midsommar (2019, 2160p UHD Blu-ray, HDR10 HEVC 10-bit with 5.1 in MKV) as Sintel's 4K HDR version. The decisions on the `ios` profile:
    - **The MKV:** direct stream, `container.unsupported`, then `video.supported` and `audio.supported`: remuxed into HLS with the picture and sound copied. It plays.
    - **The 4K HDR file:** transcode, `container.unsupported`, `video.supported`, then `hdr.unsupported` and `hdr.washedOut`: H.264 at 2160p, 40 Mbps, SDR only relabelled, since the server here has no graphics chip (`HIGHSEA_HARDWARE_NONE`) and the phone sends no device report, so the `ios` profile has no HDR. It plays after the fix below, washed out as the warning says.
    - **Fixed: the iPhone refused an HDR film relabelled as SDR.** AVPlayer stopped at the first segment (CoreMedia −12927, then AVFoundation −11800), and the app showed "This film didn't start". The segments were 8-bit H.264 still labelled PQ and BT.2020: with ffmpeg 9, the encoder takes primaries and transfer from the frames, so the output options `-color_primaries` and `-color_trc` no longer relabelled them on the processor (only `-colorspace` took, through a conversion). `pictureFilters` in `packages/stream/src/hls/args.ts` now labels the frames on the processor as the GPU path already did: `scale`'s `out_color_matrix=bt709`, then `setparams` ([ffmpeg-filters › scale](https://ffmpeg.org/ffmpeg-filters.html#scale-1), [› setparams](https://ffmpeg.org/ffmpeg-filters.html#setparams)). Checked with ffprobe on the segments (bt709 for all three) and by playing the film. Browsers play either labelling, so the web sweep didn't catch it. It also changes what the web player and the desktop app get for such a film.
    - **Fixed: a subtitle showed with Subtitles off.** In the MKV's direct stream, AVPlayer turned on an HLS subtitle rendition by itself. expo-video 58.0.11 sets legible selection criteria preferring a track, and the app's choice, made before the source loaded, selected nothing. `playback.ts` now makes the choice again on each `sourceLoad`.
    - **Seen, not changed:** a server that restarts with a new identity leaves the phone's saved entry on Unreachable, not on its sign-in, until it's chosen again from Choose a server (Forget this server is there for it). The 2160p transcode on libx264 kept ahead of playback on this Mac; on a NAS without graphics it may not, and the iPhone's player gives up when the first segment's map doesn't arrive within 6 s (−12889, seen once here while two transcodes ran at once).
    - **Still to do for sign-off (answer 1):** the same two films on the owner's iPhone, and AirPlay to a TV.

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
- **Storybook:** none for React Native (the owner's answer at 4.5a's review, 2026-10-29): the components are seen in the apps' own screens and `phone-compare.ts`'s pairs.

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
  - accessibility: each screen walked at Accessibility Large with screenshots and Maestro's hierarchy (labels from the i18n catalogs, 44 pt targets), and Xcode's Accessibility Inspector where it can be pointed at the app without taking the screen (the owner's answer at 4.5a's review);
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
