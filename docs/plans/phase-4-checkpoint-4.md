# Phase 4, checkpoint 4.4: the desktop app

- **Status:** Scoped on 2026-10-29 and approved with [the owner's answers](#the-owners-answers) of 2026-10-29 (every recommendation but question 6: the Windows installer stays unsigned until 1.0). 4.4a is next, starting with its prototypes. Nothing is built.
- **Parent plan:** [phase-4-clients.md › Order of work](phase-4-clients.md#order-of-work-and-checkpoints), 4.4, with [install-simplicity.md › E](install-simplicity.md#e-the-apps-find-pair-and-update-without-typing-folded-into-44-46)'s desktop items folded in.
- **Gate:** 4.3 was signed off on 2026-10-28, and 4.3c (with part D) on 2026-10-29, so the web player plays every film, the server says which address apps use (ADR 0020's 2026-10-28 section), and 0.2.0 is published.

## Read first

1. The parent plan: Standing rules, [The clients](phase-4-clients.md#the-clients), [Versions](phase-4-clients.md#versions), the exit criteria, Risks, and The owner's answers (6 and 8 above all: signing accounts under `highsea-tv`, and offline downloads with 30 days' expiry).
2. [install-simplicity.md](install-simplicity.md), part E and the owner's answers (9: no self-updater for the *server*; the desktop app's own updater is separate).
3. The ADRs: [0053](../adr/0053-clients-build-and-distribution.md) (Tauri around the web build; Proposed for desktop until this checkpoint), [0055](../adr/0055-clients-shared-logic.md) (`@highsea-tv/client`), [0052](../adr/0052-device-profiles.md) (a webview reports what it plays), [0051](../adr/0051-playback-engine.md) (sessions, transcodes and the cache), [0054](../adr/0054-watch-state.md) (positions and watched), [0020](../adr/0020-discovery-port.md) (UDP 7368 and mDNS, with its two 2026-10-28 sections), [0024](../adr/0024-two-step-passkeys-and-tvs.md) (device tokens and pairing), [0050](../adr/0050-release-and-versioning.md) (one version, the `release` environment).
4. [phase-4-checkpoint-2.md](phase-4-checkpoint-2.md): what `/web` left to the desktop app (its answer 3: choosing, discovery and adding servers), and its Progress entries.
5. The specs, each with its prototype: [connectivity.md](../product/connectivity.md) (C1, `#/web/connect`), [client-settings.md › Offline](../product/client-settings.md#offline) (`#/web/downloads?app=desktop`), [client-detail.md › Download](../product/client-detail.md#download) (`#/web/movies/4?app=desktop`), [now-playing.md](../product/now-playing.md) (download rows and **Cancel**), and the platform guide [desktop-web.md › Desktop app specifics](../design-language/platforms/desktop-web.md).
6. The code: `apps/web` (its `main.tsx`, routes and the player in `src/player.tsx` and `playback.ts`), `packages/sdk/src/connection.ts` and `discovery.ts`, `packages/client`, `packages/runtime/src/playback.ts`, and the release workflow `.github/workflows/release.yml`.

## Goal

People can install highsea on their Mac, Windows or Linux computer from an installer, open it, and see their server listed without typing an address. They sign in once, switch between servers, and play films with the computer's media keys and its Now Playing controls. They can download a film to a folder they choose, at the quality they choose, and watch it with no network for 30 days after the app last saw the server. The owner sees each download in Now playing while it's made, and can cancel it. The app updates itself, with updates signed by highsea's key. Installers for every platform are built in CI from the `release` environment, signed and notarised on macOS (Windows stays unsigned until 1.0), and nothing is published until the owner says so.

## Out of scope

- **A TV paired from the phone, a QR on the TV, `highsea.tv/open` and universal links:** with the TV app (4.5) and the mobile app (4.6). The desktop app registers `highsea://` now, since a link from `/web` or an email can open it.
- **The Microsoft Store, the Mac App Store and Flathub:** after 1.0. Each needs its own sandboxing and review, which fights downloads to a chosen folder and discovery. Direct downloads, Homebrew and winget come first ([question 8](#open-questions-for-the-owner)).
- **A beta channel for the app's updates:** stable only, as GitHub's latest release is (ADR 0050). A beta feed waits until a beta is published.
- **Windows and Linux on Arm:** later. macOS ships one universal app (Apple silicon and Intel).
- **Running the server inside the desktop app:** after 1.0 ([install-simplicity.md › F](install-simplicity.md#f-native-server-installers-after-10)). This app is a client only.
- **Downloads on mobile:** 4.6. The server's side built here is what mobile uses too.
- **highsea cloud's "Find my servers":** stays collapsed and explained, as C1 prototypes it.

## Where things stand

- **`apps/web`** is Vite 8 and React 19, served by the server at `/web`. It signs in with the admin's session cookie, uses the server it came from, and shows Downloads as "Downloads live in the desktop app" (4.2a). Its player is `<video>` with hls.js, and the device's report comes from `MediaSource.isTypeSupported()` and `MediaCapabilities` (4.2b).
- **The SDK** has `createServerConnection` (LAN then remote, by latency, retrying once on failure) and `KnownServer` with a device token. `discover()` sends the UDP broadcast but needs `node:dgram`, which a webview doesn't have. Without a token the SDK uses the cookie.
- **Device tokens** exist for apps (ADR 0024): `auth.signIn` with a `device` returns one per server, and pairing by code is built for the TV.
- **The server says which address apps use** (`system/info/public`, and mDNS from the host's avahi on NAS templates, ADR 0020's 2026-10-28 sections).
- **The prototypes** cover C1 in full, the desktop app's Downloads (`?app=desktop`), Download on the item page, and Now playing's download rows with **Cancel**. Not prototyped: the **Kept in** folder with **Change** (client-settings.md says so), the custom title bar on Windows and Linux (desktop-web.md describes it), an update waiting to install, and "Get the apps".
- **The contract** already has `StreamSession.kind: 'stream' | 'download'` and the `download` permission (`accounts.ts`), unused so far.
- **This Mac** has Rust 1.98.1 through rustup. The Tauri packages pinnable today: `@tauri-apps/cli` 2.12.3, `@tauri-apps/api` 2.12.4, `@tauri-apps/plugin-updater` 2.14.0, `@tauri-apps/plugin-http` 2.8.3, `@tauri-apps/plugin-deep-link` 2.6.2 (all 2026-10-14, MIT or Apache-2.0).

## The size of this checkpoint, and its parts

Two gated parts, each reviewed on its own:

- **4.4a, the app:** prototypes of what isn't designed yet, then `apps/desktop` with Tauri 2 around `apps/web`; C1 in full (discovery, adding by address, several servers, the switcher, device tokens kept in the OS's keychain); playback in each OS's webview with its own device profile; media keys and Now Playing; the window's chrome; `highsea://` links; signed installers and the updater built in CI (not published); the Rust side brought under the dependency rules.
- **4.4b, downloads:** the server making a copy for a device (direct or transcoded, as a session Now playing shows, with **Cancel**); the app downloading it to disk with pause, resume and the queue; the Downloads page and Download on the item page; offline playback with subtitles; positions kept offline and sent when the server is seen; the 30 days; the guides; Homebrew and winget prepared; "Get the apps" in `/web` and the admin.

4.4b's server work ships in the release after it (0.3.0), together with the first desktop app, on the owner's word.

## Progress

- **2026-10-29, 4.4a's prototypes, approved by the owner on 2026-10-29:** the window's chrome on macOS, Windows and Linux (`web/window.tsx`, in the top bar and the player), an update waiting (the profile's dot and menu item, Settings › About), Get the apps (`client/get-the-apps.tsx`, in About and Downloads in a browser, and beside System › Status › Addresses in the admin), Kept in with Change and moving downloads (`web/kept-in.tsx`), and C1's local network permission on a Mac. The toolbar has **OS**, **Update** and **Local network** for the desktop app. Their spec is [desktop-app.md](../product/desktop-app.md), with client-settings.md's Kept in and connectivity.md's states. Lint, typecheck, the prototype's 1,057 tests and the web (696 pages, 58 walked by keyboard) and admin (928 pages) sweeps are clean.
- **2026-10-29, 4.4a, signed off by the owner on 2026-10-29.** At review the owner tried the app on their Mac and confirmed that the media keys and macOS's Now Playing work while a film plays, so WKWebView passes the Media Session on and souvlaki isn't needed there. The owner's notes from trying it, fixed below, change the design system (ui-web's Poster and the new `PageScrollbar`) and locked prototypes (the web shell's top bar and scrollbar, and the browser's Downloads copy); they were made on the owner's notes and signed off with the part. ADR 0058 and desktop's part of 0053 are Accepted.
  - **The app:** `apps/desktop` on Tauri 2.12.4 around `apps/web` built with `--mode desktop` (`dist-desktop/`, at `/`). The page knows it's in the app only through `apps/web/src/host.ts`; `src/desktop/` has C1 (Choose a server with discovery and the local-network states, adding by address, sign-in with Back, Unreachable with Try again and Switch server), the window's chrome and the updates. The Rust side (`src-tauri/src/`) reaches the server for the page: the `api` command, the event stream on a channel, and the `server` scheme for posters, trickplay, subtitles and streams, each with the device's token from the keychain (keyring 4.2); known servers are `servers.json`. Discovery runs the broadcast and mDNS together; single sign-on goes through the system browser and back by `highsea://oidc`, with a PKCE-checked one-time code (`POST /api/v1/auth/oidc/exchange`, challenge kind `oidc-app`). Links out open in the browser through the opener plugin.
  - **Playback:** built-in profiles `desktop-macos` (Safari's), `desktop-windows` (Chromium's) and `desktop-linux` (narrower, GStreamer's common codecs), named by the app through `baseProfile(userAgent, os)`. Media keys are the player's Media Session: documented to reach MPRIS on WebKitGTK and unchanged from Edge on WebView2; WKWebView isn't documented; the owner checked it on a Mac at review, and it works.
  - **Installers and updates:** `.github/workflows/desktop.yml` (fmt, clippy, tests and an unsigned build on macOS, Windows and Linux); the release workflow's `desktop` and `desktop-feed` jobs (signed updater artifacts, `latest.json`, `SHA256SUMS`, all attached to the GitHub release); `scripts/release.ts` sets the app's version with the rest and gains `desktop-key` and `feed`. The updater trusts a development key until the owner makes the release key (`apps/desktop/keys/README.md`, with the Apple secrets for when the membership is there).
  - **The house rules for Rust:** the licence audit reads 561 crates from `cargo metadata` and parses SPDX expressions in full (Unicode-3.0 allowed; `webpki-root-certs` excepted); `bun run audit` runs `cargo audit` too. The updater's `zip` feature is off, which removed `zip` 4.6.1 and three advisories.
  - **Checked:** the debug bundle opens on this Mac at Choose a server, with macOS's local-network prompt. Under Node 26.11.1: lint (1,366 files), typecheck, 11,914 tests pass (8 skipped: no libass or zscale in this ffmpeg), the Rust side's fmt, clippy and 11 tests, smoke, licences (870 packages and 561 crates), the audit (723 packages and 562 crates, 5 allowed warnings in the GTK stack), the prototypes' sweeps (1,840 pages, 189 walked by keyboard, every D-pad focusable), the server's admin pages, and playback in Chromium and Firefox. actionlint is clean on both workflows.
  - **Found and fixed:** the opener's `allow-open-url` needs a scope, without which every link was refused; Biome now ignores Tauri's generated `gen/schemas`.
  - **The owner's notes from trying the app (2026-10-29), fixed in the app, the web client and the prototype alike:** the top bar's clear state drew a line under it: its gradient tiled into its transparent border, now sized to the border box (`bg-origin-border`). macOS's buttons sat 8px above the bar's middle (`trafficLightPosition.y` 26 to 34). ui-web's Poster faded its row of actions, which is a backdrop root, so the glass Play button's blur popped in at the end of the fade. Each action now fades itself, and only the actions take clicks, so the top of a poster opens the film again. Downloads in the app no longer shows the browser's pointer to the app; it's a heading and **Nothing downloaded** until 4.4b brings the approved list. The browser's copy drops "A browser can't keep films for offline" for "To keep films for offline, use the highsea app for macOS, Windows or Linux." The Poster and the copy are changes to the design system and a locked prototype, made on the owner's notes. Then, on the owner's requests, the page's scrollbar is thin and drawn over the page, in the browser and the app: a classic scrollbar takes a column of its own, which showed as a dark strip beside the hero and the glass bar, and no CSS lays it over the page (`overflow: overlay` is an alias of `auto`). ui-web's `PageScrollbar`, beside the top bar, hides the native bar (`scrollbar-width: none`) and draws a thin one that follows the scroll, drags and pages on a click; scrolling itself stays the browser's. The handle keeps the same gap from the window's edges on every side, 6px, and 10px in a Mac window so its ends clear the rounded corners. The keyboard sweep's walk now waits for the focused element's own transitions before judging it, since a Poster's actions now fade themselves in on focus and start at opacity 0 (`scripts/sweeps/lib.ts`). The owner tried starting the bar below the header and chose to keep the whole page scrolling.

## Prototypes first (4.4a)

Each is a small addition to signed-off screens or platform chrome, prototyped in `design/prototypes` and approved before it's built:

1. **The title bar on Windows and Linux:** desktop-web.md's custom title bar in `bg` with the top bar's drag region and the window's buttons; on macOS the traffic lights over the top bar, with the top bar's left padding moved to clear them. The toolbar's **App** choice gains the OS (macOS, Windows, Linux) to show each.
2. **Kept in:** the folder under Offline's settings, with **Change**, and what happens to downloads already there (they move, with progress, or stay and play from where they are; recommended: they move).
3. **An update waiting:** a quiet line in the account menu and Settings › About ("highsea 0.3.1 is ready · Restart to update"), never a dialog over a film.
4. **"Get the apps":** in `/web`'s Settings › About and the admin's account menu, a short list (macOS, Windows, Linux) with each download link and the server's address to type if discovery can't find it. QR codes for the phone stores wait for 4.6.
5. **Local network permission (macOS 15 and later):** the line C1 shows while the system's prompt is open, and what it says when it was refused ("highsea can't look on this network. Allow it in System Settings › Privacy & Security › Local Network, or add the server by address.").

## The app (4.4a)

- **`apps/desktop`:** a Tauri 2 project whose frontend is `apps/web`'s build (`frontendDist`), as [Tauri's Vite guide](https://v2.tauri.app/start/frontend/vite/) sets it up, with `bun run desktop` for development against Vite's dev server. The Rust side (`apps/desktop/src-tauri/`) stays small: discovery, the keychain, downloads, media controls if the webview can't do them, and the plugins.
- **One build, two hosts.** `apps/web` learns which host it's in from a single module (`src/host.ts`): in a browser at `/web` it keeps the cookie and the server it came from; in the app it uses C1, device tokens and the `KnownServer` list. Nothing else in the screens forks; the prototype's `useDesktopApp()` becomes this.
- **Reaching a server** ([question 2](#open-questions-for-the-owner)): the app's page isn't served by the server, so calls from it are cross-origin, and a LAN server is plain `http://`. Recommended: the SDK's `fetch` is [Tauri's HTTP plugin](https://v2.tauri.app/plugin/http-client/) (Rust's client, so no CORS on the server and no mixed-content rule), scoped by the app's capabilities to the servers the person added; and the player's media comes from the server's address directly, with stream tokens in the URL as now (ADR 0051). Each webview's mixed-content rule for `<video>` and hls.js's requests is read in its docs before building, and if one blocks them, `/stream` goes through a custom URI scheme the Rust side answers ([Tauri: register_uri_scheme_protocol](https://docs.rs/tauri/latest/tauri/struct.Builder.html#method.register_uri_scheme_protocol)).
- **Device tokens** are kept in the OS's keychain (Keychain on macOS, Credential Manager on Windows, the Secret Service on Linux) through the Rust [`keyring`](https://docs.rs/keyring/) crate, never in the page's storage, matching 4.2a's reason for cookies. The list of known servers (names, addresses, last seen) is plain app data through [Tauri's store plugin](https://v2.tauri.app/plugin/store/).
- **C1 in full:** Choose a server with Your servers, On this network (appearing as they answer, never reordering), Add by address and its errors; Sign in with username and password, two-step and OIDC (through the system browser and the `highsea://` link back, [question 4](#open-questions-for-the-owner)); the top bar's switcher; Unreachable with **Try again** and **Switch server**, and "Downloads still play" once 4.4b is in.
- **Discovery** runs on the Rust side: the UDP broadcast of ADR 0020 and mDNS `_highsea._tcp` through the [`mdns-sd`](https://docs.rs/mdns-sd/) crate, answers merged by server id as `discover()` does now. macOS 15 asks for local-network permission ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)), so `Info.plist` gets `NSLocalNetworkUsageDescription` and `NSBonjourServices`.
- **Playback** in three webviews: WKWebView (macOS), WebView2 (Windows, Chromium) and WebKitGTK (Linux, GStreamer), per [Tauri's webview versions](https://v2.tauri.app/reference/webview-versions/). The player is unchanged; each webview's report is made as a browser's is (4.2b), and `packages/stream` gets built-in profiles for the three, used until the report arrives (ADR 0052's dated section). WebKitGTK's codecs depend on the GStreamer plugins installed, so the Linux packages depend on the good, bad and libav sets, and the guide says so.
- **Media keys and Now Playing:** the [Media Session API](https://www.w3.org/TR/mediasession/) in `apps/web`'s player (title, poster, play, pause, seek), which a browser at `/web` benefits from too. Where a webview doesn't hand it to the OS (each is checked against its docs first), the Rust side drives the OS's controls through [`souvlaki`](https://docs.rs/souvlaki/) (MPNowPlayingInfoCenter, SMTC, MPRIS) from the player's events.
- **The window:** size and position kept ([window state plugin](https://v2.tauri.app/plugin/window-state/)), one instance ([single instance plugin](https://v2.tauri.app/plugin/single-instance/)), full screen from the player, and the title bar as approved.
- **Links:** `highsea://connect?server=…` opens C1 with that server, and OIDC's return comes back the same way ([deep linking plugin](https://v2.tauri.app/plugin/deep-linking/)).
- **The device's name and type:** the app signs in as client type `desktop` with the computer's name, so Your devices and Now playing say "Sebastian's MacBook Pro · highsea for Mac" rather than a browser's.

## Signed installers and updates (4.4a)

- **Bundles,** per [Tauri's distribution guide](https://v2.tauri.app/distribute/): a universal DMG on macOS; NSIS on Windows (recommended over MSI: per-user without admin rights, and what the updater handles best); AppImage and `.deb` on Linux, plus `.rpm`.
- **Signing,** with every key only in the `release` environment's secrets:
  - **macOS:** built unsigned until the owner has the Apple Developer membership, then signed in CI from then on ([answer 7](#the-owners-answers)), with a Developer ID Application certificate and notarisation through an App Store Connect API key ([Tauri: macOS signing](https://v2.tauri.app/distribute/sign/macos/): `APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY`).
  - **Windows:** unsigned until 1.0 ([answer 6](#the-owners-answers)). [Tauri's Windows signing guide](https://v2.tauri.app/distribute/sign/windows/) notes that an unsigned installer downloaded from a browser can meet a SmartScreen warning, and that Windows 11's Smart App Control can block it; the install guide says so and shows **More info › Run anyway**. The NSIS installer is built so a `signCommand` can be added at 1.0 without other changes. The updater's own signature still checks every Windows update.
  - **Linux:** the AppImage is signed for the updater only; the `.deb` and `.rpm` are checked by their SHA-256 on the release.
- **The updater:** [Tauri's updater plugin](https://v2.tauri.app/plugin/updater/), whose signature check can't be turned off. Its key is made once with `tauri signer generate`; the public half is in `tauri.conf.json`, the private half (`TAURI_SIGNING_PRIVATE_KEY`) only in the `release` environment, with a backup the owner keeps, since losing it strands every install. The feed is a static `latest.json` attached to each stable release (`releases/latest/download/latest.json`), as the Synology package's manifest is. The app checks at start and every 6 hours, downloads in the background, and offers Restart as prototyped. The owner's answer 9 in install-simplicity.md is about the server; this is the app's.
- **CI:** `desktop.yml` builds the app on macOS, Windows and Ubuntu runners for every pull request that changes it (unsigned, nothing uploaded). The release workflow gains a job in the `release` environment that builds, signs and attaches the installers and `latest.json` to the release, dry unless switched off, as the image's is. `scripts/release.ts` sets `tauri.conf.json`'s version with the rest.

## The Rust side under the house rules (4.4a)

The rules were written for npm. The Rust side gets the same, decided in the ADR:

- **Exact versions at least two weeks old:** `=x.y.z` in `Cargo.toml` and `Cargo.lock` committed; `scripts/pin.ts` learns crates.io's API so `bun run pin --crate tauri` works as it does for npm.
- **Licences:** `bun run licenses` also reads `cargo metadata` and checks every crate against the same allow list ([ADR 0009](../adr/0009-license-agpl.md)), with the same exceptions file.
- **Advisories:** `bun run audit` also runs [`cargo audit`](https://rustsec.org/) against the RustSec database, with dated exceptions as for npm.
- **The toolchain:** `rust-toolchain.toml` pins the Rust version, as `.nvmrc` pins Node.
- **The SPDX header** on every `.rs` file (`// SPDX-License-Identifier: AGPL-3.0-only`) and `#` in TOML.

## Copies for a device (4.4b)

- **The API:** `POST /api/v1/offline` with the movie, version and quality (Original, High · 1080p, Data saver · 720p) starts a copy for this device; `GET /api/v1/offline/{id}` says how it's going; `GET /stream/offline/{token}` serves the finished file by byte ranges, so the app resumes; `DELETE` cancels. Needs the `download` permission (staff hold it by role). "offline" rather than "downloads", since `/downloads` is the torrent queue.
- **The copy:** Original is the file itself when the device's profile plays it directly; otherwise, and for High and Data saver, a transcode to one MP4 (H.264, AAC stereo plus the original's best audio where the device plays it), made by the same runner and hardware as streams (ADR 0051, 0056), not HLS. Text subtitles go with it as WebVTT files. The copy waits in `transcodes/offline/` until the device has it, or 24 hours.
- **A session of kind `download`:** it counts against Settings › Playback's transcode limit, shows in Now playing as prototyped ("52% made"), and **Cancel** ends it with the prototyped dialog; the app shows "The download stopped" with the owner's message.
- **Renewing:** each time the app reaches the server, it tells it which copies it holds (`PUT /api/v1/offline/held`), so Now playing's history and a revoked device are known; the 30 days count on the device from the last time it saw its server, as client-settings.md decides.

## Downloads in the app (4.4b)

- **To disk on the Rust side,** with pause, resume (HTTP ranges), one at a time and the queue, as the prototype has it, into the **Kept in** folder (the OS's Movies or Videos folder by default). Files are named `{Title} ({Year}).mp4` with their subtitles beside them, so they can be found outside highsea. Progress reaches the page through Tauri's events.
- **The Downloads page and Download on the item page** as prototyped in 4.0b, from `@highsea-tv/client`'s download logic (shared with mobile at 4.6; ADR 0055's dated section).
- **Playing offline:** the player gets the file through Tauri's asset protocol ([convertFileSrc](https://v2.tauri.app/reference/javascript/api/namespacecore/#convertfilesrc)), with its WebVTT, and the Unreachable screen offers the downloads.
- **Positions offline** are kept on the device and sent when the server is seen, each with when it was made, and the server keeps the newer (ADR 0054's dated section).
- **Expiry:** past 30 days unseen, a download says "Connect to {server} to keep watching it" and doesn't play; the file stays until seeing the server renews it or the person removes it.

## Getting the app (4.4b)

- **The guides** in `apps/docs/content/watch/`: installing on each OS (with Gatekeeper, SmartScreen and the Linux packages' GStreamer note), connecting, downloads, and updates. Screenshots of the real app on this Mac.
- **"Get the apps"** in `/web` and the admin, as approved, linking to the release's installers.
- **Homebrew and winget,** prepared in `templates/` like the store listings: a cask in highsea's own tap (`highsea-tv/homebrew-tap`) and a winget manifest. Each is submitted only on the owner's word, after the release. winget's review scans every installer; whether it accepts an unsigned one is read in its policies before submitting.

## Tests and checks (4.4a and 4.4b)

- `apps/web`'s tests run in both hosts (a fake Tauri bridge for the app's), and the sweeps cover the app's routes (C1's steps, Downloads with `?app=desktop` already).
- Rust: `cargo test` for discovery (against a local UDP answerer and an mDNS responder on loopback), downloads (resume, pause, a server that drops), and the keychain behind a trait with a memory fake. In CI on all three OSes.
- **The app end to end:** [Tauri's WebDriver support](https://v2.tauri.app/develop/tests/webdriver/) runs on Windows and Linux (not macOS), so a run there signs in to the seeded server, plays the MP4 and the MKV, and downloads one film; on macOS it's tried by hand at each review.
- **The server:** the offline API, the copy's transcode on the clips (skipped without ffmpeg), Cancel, the permission, and the guard table.
- **Hand checks at review:** the app on this Mac, a Windows machine or VM, and Ubuntu in a VM, against the DS1520+'s server for discovery (read only, as always).

## ADRs

- **0058, the desktop app** (new; desktop's part of 0053 then becomes Accepted): Tauri around the web build, how the app reaches servers (the HTTP plugin and media directly), tokens in the keychain, discovery in Rust, the updater and its key, the bundles and signing, and the Rust side's dependency rules.
- **0059, copies for a device** (new): the offline API, the copy's formats, sessions of kind `download`, renewing and expiry, and positions made offline.
- **Dated sections:** 0053 (desktop as built, Accepted), 0050 (desktop installers and `latest.json` on each stable release, the signing secrets, the app's version), 0052 (the three webviews' built-in profiles), 0020 (discovery from the app, and macOS's local-network prompt), 0024 (the `desktop` client type and OIDC through the system browser), 0054 (positions made offline), 0055 (the download logic in `@highsea-tv/client`), 0009 (the licence audit covers crates).

## Risks

- **WebKitGTK plays least.** Its codecs come from the GStreamer plugins on the machine, and some distributions ship without the ones for H.264 and AAC. The decision copes (the report says what plays), but a bare system may transcode everything. The packages depend on the plugins; the AppImage can't bundle them all.
- **Mixed content and cross-origin rules in each webview** are the biggest unknown in 4.4a: a LAN server is `http://` and the app's page isn't. The plan reads each webview's rule first and has a fallback (a custom scheme in Rust for `/stream`), but the fallback adds a proxy in the path of every stream.
- **Media keys in a webview** aren't documented the same way on each OS. The Media Session API may reach the OS on WebView2 and not on WKWebView; `souvlaki` is the fallback, which adds a native piece to keep in step with the player.
- **Accounts and certificates** are the owner's (answer 6): an Apple Developer membership for macOS. Windows ships unsigned until 1.0 ([answer 6](#the-owners-answers)), so some people meet SmartScreen's warning, and Smart App Control may block the installer outright. The macOS app ships only once it's signed and notarised.
- **The updater's key** is a single point of failure: lose it and every install has to be reinstalled by hand. It's kept in the `release` environment and in the owner's own backup.
- **Copies cost transcodes.** A household downloading a season's worth of films at once would fill the transcode limit; copies wait their turn behind streams, which is right but slow.
- **The Rust supply chain** is new to the repository: a second lockfile, a second audit and a compiler toolchain in CI.

## Open questions for the owner

1. **The parts.**
   - **Recommended:** two gated parts, 4.4a (the app, connecting, playback, signing and updates) and 4.4b (downloads, the guides and getting the app), as above.
   - Or: one checkpoint. One review, but a long time before anything is looked at.
2. **How the app reaches a server.**
   - **Recommended:** API calls through Tauri's HTTP plugin (no CORS on the server, no mixed-content rule), media directly from the server's address, with a custom scheme for `/stream` only if a webview's docs say it blocks it.
   - Or: the server allows the app's origin (CORS) and the page calls it directly. Simpler in the app, but every server opens its API to another origin, and mixed content still has to be solved.
   - Or: the app's window opens the server's own `/web`, as Jellyfin's desktop app does. Always the server's version, but C1 can't run before a server is chosen, downloads can't play without the server, and a remote page gets the app's native powers.
3. **Where the token is kept.**
   - **Recommended:** the OS's keychain, through Rust's `keyring` crate. The page never holds it.
   - Or: Tauri's store plugin, in the app's data folder. Simpler, but the token is a plain file any program run by the person can read.
4. **Signing in with OIDC in the app.**
   - **Recommended:** the system browser, coming back through `highsea://`, as [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) asks of native apps, so the person's password manager and existing sign-in work.
   - Or: inside the app's own window. No browser switch, but RFC 8252 advises against it and some providers refuse embedded views.
5. **Windows installer.**
   - **Recommended:** NSIS only: per-user, no admin rights, and what the updater handles best.
   - Or: NSIS and MSI, for organisations that deploy with Group Policy. Two to sign and test.
6. **Windows signing.**
   - **Recommended:** Azure Artifact Signing (a monthly fee, no hardware token, works from CI), under the `highsea-tv` organisation.
   - Or: an OV certificate from a certificate authority on a hardware token or cloud HSM. A yearly fee and more setup in CI.
   - Or: unsigned on Windows until 1.0. SmartScreen warns, and Smart App Control may block it.
7. **When the accounts are needed.**
   - **Recommended:** build and test 4.4a unsigned, and sign in CI as soon as the owner has the Apple Developer membership and the Windows signing account; 4.4a's review can happen either way.
   - Or: wait for the accounts before starting 4.4a's signing work, so it's checked signed from the start.
8. **Where the app is listed.**
   - **Recommended:** the release's installers, linked from the guides, highsea's own Homebrew tap and winget, prepared now and submitted on the owner's word after the release.
   - Or: also the Microsoft Store and Flathub now. Wider reach, but their sandboxes fight the download folder and discovery.
   - Or: the release's installers only, until 1.0.
9. **Downloads' formats.**
   - **Recommended:** Original as the file when it plays directly, otherwise one MP4 transcoded at the chosen quality, with WebVTT subtitles beside it.
   - Or: always the file itself, with no transcode. Faster and free for the server, but many films won't play in the webview, and a 4K remux won't fit a laptop.
10. **The download folder's files.**
    - **Recommended:** readable names (`Title (Year).mp4` with subtitles beside them), so a person can find and play them outside highsea.
    - Or: opaque names in the app's data folder. Tidier, but the films are hidden from the person who owns the computer.
11. **Linux packages.**
    - **Recommended:** AppImage (with the updater), `.deb` and `.rpm`.
    - Or: AppImage and `.deb` only, as ADR 0053 drafted. One fewer to test; Fedora users take the AppImage.
12. **The first desktop release.**
    - **Recommended:** 0.3.0 carries 4.4's server work and the first desktop app together, published on the owner's word after 4.4b's sign-off.
    - Or: publish 4.4a's app as `0.3.0-beta.1` for the owner to install, with no downloads, and 0.3.0 after 4.4b.

## The owner's changes

## The owner's answers

On 2026-10-29 the owner took every recommendation for questions 1 to 12 except question 6.

1. Two gated parts: 4.4a (the app, connecting, playback, signing and updates) and 4.4b (downloads, the guides and getting the app).
2. API calls go through Tauri's HTTP plugin; media comes from the server's address directly, with a custom scheme for `/stream` only if a webview's docs say it blocks it.
3. Device tokens live in the OS's keychain, through Rust's `keyring` crate.
4. OIDC signs in through the system browser and comes back through `highsea://` (RFC 8252).
5. NSIS only on Windows.
6. **Changed by the owner:** the Windows installer stays unsigned until 1.0. The updater's signature still covers every update, and the install guide explains SmartScreen's warning.
7. 4.4a is built and tested unsigned, and macOS signing switches on in CI once the owner has the Apple Developer membership.
8. The release's installers, linked from the guides, plus highsea's own Homebrew tap and winget, prepared now and submitted on the owner's word after the release.
9. A download is the original file when it plays directly, otherwise one MP4 transcoded at the chosen quality, with WebVTT subtitles beside it.
10. Downloads have readable names (`Title (Year).mp4`, subtitles beside them).
11. AppImage, `.deb` and `.rpm` on Linux.
12. 0.3.0 carries 4.4's server work and the first desktop app, published on the owner's word after 4.4b's sign-off.
