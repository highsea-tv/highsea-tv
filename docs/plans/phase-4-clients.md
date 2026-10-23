# Phase 4 plan: playback and the client apps

- **Status:** Scoped on 2026-10-23. The owner answered every [open question](#open-questions-for-the-owner) the same day ([The owner's answers](#the-owners-answers)), and the plan below follows them. Nothing is built until Phase 3 is signed off.
- **Gate:** Phase 4 starts only after Phase 3 is signed off. That needs 9b's review and 9c, the full review and the sign-off ([phase-3-checkpoint-9.md](phase-3-checkpoint-9.md)). The first publish of 0.1.0 is not a prerequisite. It happens when the owner says so, and it can come before or during Phase 4.
- **Within Phase 4:** stop at each checkpoint below, report, and ask for review, as in Phase 3.
- **Source:**
  - the roadmap's [Phase 4](../roadmap.md#phase-4-later-clients) and its [streaming server](../roadmap.md#streaming-server-plex--jellyfin--emby-parity) gap analysis;
  - [ADR 0008](../adr/0008-clients-react-everywhere.md) (React everywhere);
  - [ADR 0010](../adr/0010-optional-highsea-cloud.md) (the optional cloud);
  - what Phase 3 leaves for Phase 4 ([phase-3-checkpoint-9.md › Wrap-up](phase-3-checkpoint-9.md#wrap-up-9c)).
- **Build reference:** the signed-off client prototypes C1 to C8 in [`design/prototypes`](../../design/prototypes/README.md) (`src/web`, `src/mobile`, `src/tv`, `src/client`) and their specs: [connectivity](../product/connectivity.md), [client-home](../product/client-home.md), [client-library](../product/client-library.md), [client-detail](../product/client-detail.md), [player](../product/player.md), [client-search](../product/client-search.md) and [client-settings](../product/client-settings.md).

## Read first

1. The roadmap: Phase 4, and the gap analysis's **Streaming server** and **Platform and operations** sections.
2. [phase-3-server.md](phase-3-server.md): its standing rules, architecture and decisions all carry over.
3. The ADRs, especially:
   - [0003](../adr/0003-server-runtime-custom-entry.md): `/stream` and `/ws` are reserved in the custom entry;
   - [0006](../adr/0006-public-api-openapi-sdk.md): the API and SDK;
   - [0008](../adr/0008-clients-react-everywhere.md): React everywhere;
   - [0012](../adr/0012-unified-media-item-model.md): items and versions;
   - [0023](../adr/0023-accounts-sessions-devices.md) and [0024](../adr/0024-two-step-passkeys-and-tvs.md): device tokens and pairing;
   - [0027](../adr/0027-preferences-in-layers.md): preferences in layers;
   - [0040](../adr/0040-test-media.md): test media;
   - [0048](../adr/0048-curation.md) and [0049](../adr/0049-smart-collections.md): where "playable" and the preview wait for Phase 4;
   - [0050](../adr/0050-release-and-versioning.md): one version, with 1.0.0 coming with the apps and playback.
4. The platform guides in [`docs/design-language/platforms/`](../design-language/platforms/): desktop-web, mobile and TV.
5. The client prototypes. Run `bun run prototypes` and walk each client flow on web, mobile and TV before building it.

## Standing rules

Phase 3's [standing rules](phase-3-server.md#standing-rules) and CLAUDE.md's rules from the owner all apply: gated work, decisions from official docs, git, SPDX headers, pinned and licence-checked dependencies, the locked design system and prototypes, internal and public docs kept apart, no network in tests, and copy in the brand's voice.

New for Phase 4:

- **The clients match their prototypes,** as the admin matched its own. List each change that real playback forces (a codec a platform can't play, a state the still frame couldn't show) in the checkpoint report.
- **Screens without a prototype get one first.** These are the admin's [new screens](#new-screens-that-need-a-prototype-first), approved before they're built, as for every locked layout.
- **The clients use only the public API,** through `@highsea-tv/sdk`. The server gains routes in `@highsea-tv/api-contract` like any other. A client never reaches into the server's database or files.
- **Old apps keep working.** A client installed from a store may be older than its server, or newer. The API only adds to what it has. A breaking change gets a new route, and the client reads the server's version from `system/info/public` before using anything newer ([Versions](#versions)).
- **No secrets in the apps' repositories or builds,** beyond what a distributed app has to carry (RFC 8252 § 8.5, as decided for the Trakt and OpenSubtitles keys). Signing keys and store credentials live only in an approval-gated CI environment, as the release key does.
- **No network in tests, including playback.** Streaming is tested against ADR 0040's ffmpeg clips and the Sintel fixture, served by a server in the test.
- **Store submissions, TestFlight builds and signed installers are publishing.** Each one waits for the owner's word, like the image and the catalog.

## Goal

The household watches. Someone opens highsea on a browser, a laptop, a phone or a TV, finds the server on the network or signs in to it remotely, and plays a film. Their place in it, their tracks and their subtitle timing follow them from one device to the next. The owner sees who is watching and how it's being sent.

At Phase 4's sign-off highsea is **1.0.0**, as decided at checkpoint 9 (answer 4): the server, the API and the apps make the whole product for movies.

## Scope

Playback and the clients for movies, the one media type highsea has ([answer 1](#the-owners-answers)). The roadmap's other "alongside" items (TV series, music, books, Usenet, requests and the Connect relay) become later phases, each planned on its own.

**In Phase 4:**

- **Playback on the server** (`@highsea-tv/stream`):
  - direct play, direct stream (remux) and transcode, chosen per client from its device profile;
  - HLS in fragmented MP4;
  - hardware acceleration: VAAPI and QSV (Intel and AMD on Linux), NVIDIA's NVENC and Apple's VideoToolbox ([answer 4](#the-owners-answers));
  - HDR to SDR tone mapping, audio downmix, and subtitles sent as text or burned in;
  - a transcode cache, throttling, and limits on how many transcodes run at once.
- **Watch state:**
  - positions, played and unplayed, Continue watching and Next up, synced across devices;
  - the player's per-person picks: version, audio, subtitles and the subtitle offset ([player.md › Data](../product/player.md#data)).
- **Media analysis:** trickplay tiles for the scrubber, made as a job after import.
- **Sessions:** who is playing what, how it's sent and why, shown in the admin, where an admin can stop a stream with a message.
- **The apps,** built from the prototypes C1 to C8:
  - **web** (`apps/web`);
  - **desktop** (`apps/desktop`, Tauri wrapping the web app);
  - **mobile** (`apps/mobile`, Expo, iOS and Android);
  - **TV** (`apps/tv`, Expo with react-native-tvos, tvOS and Android TV).
- **`@highsea-tv/ui-native`:** the design system's components for React Native, on the same tokens.
- **What Phase 3 left for Phase 4:**
  - "playable" means the household's client can play it, not just "has a file" (ADR 0048, 0049);
  - Continue watching filled from watch positions;
  - recommendations from watch history;
  - curation's preview drawn by the real clients (ADR 0048);
  - smart collections' watched and last-played rules, and personal collections (8d).
- **Offline downloads** on desktop and mobile (C8's Downloads), with an optional transcode for download.
- **Notifications on phones and TVs:** no push relay ([answer 7](#the-owners-answers)); the apps show what's new over SSE while they're open.

**Not in Phase 4:**

- other media types, requests, Usenet, the highsea cloud (accounts, relay, push relay, metadata proxy) and `app.highsea.tv`'s hosted client;
- webOS and Tizen (a packaged web build, after the four platforms above);
- intro, credits and recap detection, and so skip intro (player.md decided against a greyed button);
- SyncPlay, remote control of another session, Chromecast, AirPlay and DLNA;
- profiles with PINs, kids' profiles and parental controls beyond what the admin-access work set;
- library optimisation (re-encoding), rule-based cleanup, and scrobbling;
- the dashboard customization follow-up and the local AI research. The dashboard customization follows Phase 4's sign-off ([answer 11](#the-owners-answers)).

## Exit criteria

1. **Plays everywhere.** On each platform in scope, a household member finds the server (on the LAN, then remotely), signs in, and plays Sintel:
   - direct where the client can, and transcoded where it can't;
   - with its subtitles and their offset;
   - resuming on another device where the first one stopped.
2. **The decision is right and explained.** For each built-in device profile, a test matrix over ADR 0040's clips gives the expected decision (direct play, remux or transcode) and its reasons. The admin's sessions screen shows the same reasons.
3. **Transcoding holds up.**
   - Software transcoding keeps up in real time at 1080p on the owner's NAS ([answer 4](#the-owners-answers)).
   - Each hardware path in scope is checked on real hardware once, with the result written in the checkpoint report. CI can't hold the hardware, so the tests cover the command lines that are built.
   - A seek far ahead starts within the time the checkpoint sets. Leaving the player stops the transcode and frees its cache.
4. **Every client screen matches its prototype,** with real data, and passes the Phase 2 checks for its platform:
   - web and desktop: keyboard only, reduced motion, 200% text, axe clean in three themes, no horizontal overflow from 1440 to 390;
   - mobile: the platform's screen reader (VoiceOver and TalkBack), Dynamic Type and font scale, and reduced motion;
   - TV: the D-pad walk on every screen, with nothing unreachable and no focus trap, plus the screen reader.
5. **The API is still the only door.** Every route the clients use is in the contract, the OpenAPI document and the SDK. Older clients pass against a newer server ([Versions](#versions)).
6. **Stores and installers are ready, not published:** signed builds for each platform, made in CI from the approval-gated environment, and installed and run by the owner from TestFlight, Play's internal testing and the desktop installers.
7. **The guides cover the apps** in `apps/docs/content/`, with screenshots: getting each app, connecting it, playing, downloads, and the admin's new playback settings.
8. **Checks:** `bun run lint && bun run typecheck && bun run test`, the smoke test, the sweeps and the end-to-end run, extended to play through the container.
9. The owner signs off, recorded in the roadmap, this plan and CLAUDE.md, and highsea becomes 1.0.0.

## Architecture

### Packages and apps

| New | What |
| --- | --- |
| `packages/stream` | The playback engine, framework-free like the other domains: device profiles, the decision, the ffmpeg command builder, HLS sessions, the transcode cache, hardware detection, and trickplay. Subpaths as ADR 0036 sets them, e.g. `@highsea-tv/stream/profiles` and `@highsea-tv/stream/testing` |
| `packages/ui-native` | ADR 0008's second implementation: the `ui-web` components the clients use, in React Native, on `@highsea-tv/tokens`' typed output, with motion in Reanimated and the TV focus model |
| `apps/web` | The web client, a static build of React screens ported from `design/prototypes/src/web`, served by the server at `/web` ([answers 2 and 3](#the-owners-answers)): Vite and React |
| `apps/desktop` | Tauri around `apps/web`'s build, with downloads to disk and the OS's media keys |
| `apps/mobile`, `apps/tv` | Expo apps; the TV app on react-native-tvos. They share screens' logic and `ui-native`, and keep their own layouts, as the prototypes do |

Shared by every client, and growing as they need it: `@highsea-tv/sdk` (with `ServerConnection` and discovery, already built), `@highsea-tv/sdk/react`, `@highsea-tv/i18n`, and the personalization types.

Which logic is shared between the web and native apps (view models, formatting, the player's state machine) is settled at checkpoint 4.2. The rule: what isn't drawing goes in a package both can import, as the prototype's `src/client/` already does.

### Playback on the server

These choices follow the documentation named beside them. Each one is confirmed, and cited again, in the checkpoint's ADR.

- **The decision** (direct play → direct stream → transcode) compares a version's streams (ffprobe's facts, already in `media_files`) with the client's **device profile**: containers, video and audio codecs with their profiles, levels and bit depth, HDR formats, subtitle formats it can draw, and its bandwidth. Each step gives reasons, in the same style as the decision engine's `DecisionReason`s (ADR 0031), so the admin and the tests can say why.
  - Built-in profiles cover each client and platform. A client may also report what it can play: browsers through `MediaSource.isTypeSupported` and `MediaCapabilities.decodingInfo` (MDN), and native apps through the platform's player.
  - Profiles can come through the signed catalog later (the roadmap's `catalog/device-profiles`).
- **Direct play:** byte ranges over `/stream` (RFC 9110 § 14), with the file never leaving its place.
- **HLS:** a master playlist with variants, in fragmented MP4 segments (RFC 8216; Apple's HLS authoring specification for what Apple's players need).
  - Segments are made on demand by ffmpeg in a child process (ADR 0003), a few ahead of the player, and a seek far ahead restarts at the nearest keyframe.
  - Web plays HLS through hls.js over Media Source Extensions where the browser has no native HLS (hls.js's docs). Apple's platforms play it natively.
- **Transcoding:** through ffmpeg (already in the image).
  - Hardware acceleration where the host has it, detected at boot and shown in System › Health; software otherwise.
  - Tone mapping, downmix and burn-in follow ffmpeg's filter documentation.
  - Docker needs `/dev/dri` passed through for VAAPI and QSV, or NVIDIA's container toolkit for NVENC. Both are documented in the guides and the NAS templates.
- **Subtitles:**
  - text tracks (SRT, ASS converted, WebVTT) go to the client as WebVTT, or to native players in the form they take;
  - image tracks (PGS, VobSub) and styled ASS that the client can't draw are burned in, which forces a transcode, and the reason says so;
  - the person's offset (player.md) is applied by the client, so changing it never restarts a stream.
- **Who may play:** the person's session or device token, as for the API. The URLs a media element loads can't carry headers, so `/stream` takes a short-lived signed token scoped to one session and file (the same pattern as the calendar feed's key, ADR 0045). Libraries the person can't see aren't playable.
- **Limits:** concurrent transcodes, a bitrate ceiling for remote streams, and the cache's size, in a new Settings › Playback.
- **Workers:** ffmpeg runs as child processes, never in the server's thread. Segment and tile making are jobs or pool tasks, safe to repeat (ADR 0022).
- **`/ws`:** stays reserved. Positions are reported over HTTP and changes reach other devices over the existing SSE stream (`watch.updated`). WebSockets come with SyncPlay and remote control, which are later.

### Watch state

- `watch_positions` already exists. Phase 4 adds:
  - played and unplayed, with a play count and the last time played;
  - Next up for collections (player.md's open question; recommended yes);
  - the per-person playback picks (`GET|PUT /api/v1/items/{id}/prefs`, `POST /api/v1/items/{id}/progress`, from player.md › Data).
- When a film counts as watched (the share played, or the credits) is a judgement call recorded at checkpoint 4.1, following common practice.
- Smart collections' watched and last-played fields, disabled since 8d with `disabled: 'playback'`, are switched on.

### Media analysis

Trickplay tiles: thumbnails at a fixed interval, joined into tiles (player.md › Data's `trickplay/{n}.jpg`), made by a job after import and on replacement. They're kept in the data folder, never next to the film, and counted in Settings › Playback's cache.

### Sessions

The runtime keeps the live sessions: who, which device, which title and version, and the decision with its reasons, bitrate and position. The admin gets them as a dashboard widget and a screen of their own ([new screens](#new-screens-that-need-a-prototype-first)). Stopping a stream sends the person a message in their client. The history feeds the dashboard's existing activity, and a playback event joins the notifications' catalogue (ADR 0046).

### The clients

- **Connecting** is built: `ServerConnection` probes LAN then remote, fails over and keeps tokens per server. The pairing routes and `/link` are built for the TV's sign-in by code (ADR 0024).
- **Web** (`apps/web`): the prototype's screens with the mock client swapped for the SDK, as for the admin. The player is a `<video>` element with hls.js where needed.
- **Desktop** (`apps/desktop`): Tauri 2 around the web build. A system webview's codecs differ by OS: WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux (Tauri's docs). The device profile describes each one rather than assuming Chromium. Downloads write to disk through Tauri's file system plugin.
- **Mobile and TV:** Expo, with the TV app built for tvOS and Android TV through react-native-tvos and Expo's TV guide. The player is the platform's own (AVPlayer and ExoPlayer/Media3, through Expo's video module or another the docs support for TV), which plays HLS and reports what it can decode. The TV focus model is ui-web's spatial navigator's design, carried to the TV platforms' own focus engines.
- **Theme, sound and home layout** are the server's preferences in layers (ADR 0027), already built. The clients read and write them.

### Versions

ADR 0050 keeps one version, `apps/server`'s. Phase 4 adds:

- each app's version is the release's version, with store build numbers counting up separately, as the stores require;
- the API never removes or changes a field in place. A client reads `system/info/public`'s version and leaves out what its server doesn't have yet, as client-search's typed sections already do;
- a test runs the previous release's SDK against the current server.

### Tests and checks

- `packages/stream`: the decision over every profile and clip; command lines built for each hardware path (snapshots, no hardware needed); HLS playlists checked against RFC 8216's rules; a real ffmpeg run on the clips where ffmpeg is present, skipped and said so where it isn't (as the subtitle sync's tests do).
- `apps/web`: the sweeps, extended to the client routes on the real server, plus a Playwright run that plays a clip in Chromium and WebKit and checks the position is saved.
- Native apps: component tests with React Native Testing Library, and an end-to-end run on simulators (tool chosen from Expo's docs at checkpoint 4.5). TV adds the D-pad walk on the simulator.
- The end-to-end run through the container plays Sintel through `/stream` at the end of its path.

## New screens that need a prototype first

The client prototypes cover C1 to C8. Real playback needs these, which no prototype has. Each one is prototyped in `design/prototypes` and approved before it's built:

1. **Settings › Playback** (admin): hardware acceleration and its check, transcode limits, the remote bitrate ceiling, and the cache.
2. **Now playing** (admin): the sessions, each with its decision explained, and Stop with a message. Also a dashboard widget.
3. **The player's states that the still frame couldn't show:** buffering, a stream that failed and why, and "Transcoding for your connection". These are small additions to C5 rather than a new screen, approved from the prototype at checkpoint 4.2.
4. **Downloads** on mobile and desktop, if C8's reference fidelity isn't enough for building them (checked at 4.0).
5. **Additions to the clients' signed-off screens**, from the owner's [answer 9](#the-owners-answers): Next up at a film's end, Mark as watched (More on web and mobile, a long press of OK on TV), the Unwatched filter, pull to refresh on mobile Home, and "Use on all my devices" for a theme in client settings. Each one changes a locked layout, so each is prototyped and approved first.

## Order of work and checkpoints

Each checkpoint stops for the owner's review. The server's playback comes first, because every client needs it. Then come web and desktop as in the roadmap, and the TV app before the mobile app ([answer 5](#the-owners-answers)).

- **4.0, the start: prerequisites and prototypes.**
  - Move to Node 26, as checkpoint 9 decided (answer 10): `.nvmrc`, the Dockerfile's two `FROM` lines and `engines` together, then reinstall for `better-sqlite3`.
  - The prototypes of the [new screens](#new-screens-that-need-a-prototype-first), for approval.
  - The ADRs' first drafts: the playback engine, device profiles, and the clients' build and distribution.
- **4.1, playback on the server.**
  - `@highsea-tv/stream`: profiles, the decision, direct play, HLS, software transcoding, and text subtitles.
  - Watch state and the player's picks.
  - Trickplay.
  - Stream tokens.
  - The client-facing "playable".
- **4.2, the web client.**
  - Every C1 to C8 screen on the web, from the prototype.
  - The player with hls.js.
  - The sweeps on the client's routes.
  - The guides' first pages for the apps.
- **4.3, playback for real homes.**
  - Hardware acceleration through VAAPI, QSV, NVENC and VideoToolbox, with tone mapping, burn-in and downmix.
  - The cache, throttling and limits.
  - Sessions (live, with 30 days of history), Now playing and Settings › Playback.
  - Checked once on real hardware, with the results in the report. The real-time target is measured on the owner's NAS, read only.
- **4.4, the desktop app.**
  - Tauri around the web build, with downloads, media keys and signed installers for macOS (notarised), Windows and Linux.
- **4.5, `ui-native` and the TV app.**
  - The components on React Native, and Storybook's native stories if Storybook's React Native docs support them. They're built here, first for the TV, and the mobile app reuses them.
  - tvOS and Android TV, with sign-in by code and the D-pad walk.
  - Signed builds in CI, for TestFlight and Play's internal testing, uploaded only on the owner's word.
- **4.6, the mobile app.**
  - iOS and Android, with offline downloads (expiring after 30 days without seeing the server), picture in picture and pull to refresh.
- **4.7, the review and sign-off.**
  - Every client screen beside its prototype, on each platform, as 9c did for the admin.
  - What Phase 4 leaves behind, gathered for the owner.
  - The 1.0.0 release prepared with `scripts/release.ts`, and the store listings drafted.
  - The sign-off, then the first store submissions on the owner's word.

Big checkpoints can split into gated parts (a and b), as checkpoints 6 to 9 did. Each checkpoint gets its own scope document when it starts (`phase-4-checkpoint-N.md`), with its judgement calls and questions, as in Phase 3.

## ADRs to write

- **The playback engine:** the decision, HLS in fMP4, segments on demand, the cache, stream tokens, and `/ws` staying reserved (4.1).
- **Device profiles:** their shape, the built-in ones, what clients report, and their place in the catalog later (4.1).
- **Hardware acceleration:** detection, the paths in scope, and how Docker hands the devices over (4.3).
- **Clients' build and distribution:** the web build served by the server, Tauri, Expo, signing and the stores (4.2, 4.4, 4.5).
- **`ui-native`:** what's shared with `ui-web` and how the TV focus model maps onto each platform's (4.5).
- **Dated sections:** ADR 0003 (`/stream` no longer reserved), ADR 0008 (as built), ADR 0050 (the apps' versions and build numbers).

## Risks

- **Codecs differ everywhere.** Browsers, webviews, phones and TVs each decode a different set, and HEVC, HDR and Dolby Vision are the least even. Device profiles and the reasons in the admin are how highsea copes. The first profiles will be wrong somewhere, and the sessions screen shows where.
- **Hardware acceleration can't run in CI.** Its tests cover command lines, and each path is checked by hand on hardware the owner has. An untested path stays off by default.
- **Store review.** Apple and Google review media apps closely. The clients only play the owner's own server, as Plex's and Jellyfin's apps do, and never show indexers or downloads from the internet. The listings say so.
- **Accounts, cost and keys.** Apple's developer programme and Google Play's console need the owner's accounts, and macOS notarisation and Windows signing need certificates, all under the `highsea-tv` organisation ([answer 6](#the-owners-answers)).
- **Size.** This is a larger phase than Phase 3, with four platforms. 1.0.0 waits for all four apps ([answer 5](#the-owners-answers)), but each checkpoint ends in something that works, and Phase 4's server work ships as 0.x releases as it's signed off (answer 12).
- **Expo and react-native-tvos versions.** The TV fork follows React Native's releases at its own pace, and Expo's TV support follows it. Versions are pinned as everywhere, and the TV app may lag the mobile app by one React Native release.
- **Node 26.** The move at 4.0 is the first time `better-sqlite3`, the worker pool and the image change Node since Phase 3 began. It gets the full checks before anything else is built on it.

## Open questions for the owner

1. **What Phase 4 covers.**
   - **Recommended:** playback and the four clients for movies. TV series, music, books, requests, Usenet and the relay each become their own later phase.
   - Or: the roadmap as written, with all of them alongside the clients. This is much longer before anything ships.
   - Or: TV series inside Phase 4, after the web client, since households expect shows soonest.
2. **Where the web client lives.**
   - **Recommended:** served by the server at `/web`, as Jellyfin and Plex do, so the admin's addresses stay as they are. A User who signs in is sent to `/web`; the owner and admins can open either. `app.highsea.tv` stays kept for a hosted client with the cloud.
   - Or: the web client at `/` for everyone, with the admin moved to `/admin`. This is cleaner for the household and changes every admin address and guide.
3. **The web client's build.**
   - **Recommended:** Vite and React, as the prototypes are built. It gives a static build that the server serves and Tauri wraps, which is the setup Tauri's docs lead with.
   - Or: Next with a static export, matching the server and the docs site.
4. **Hardware acceleration, first.**
   - **Recommended:** Intel and AMD through VAAPI and QSV on Linux (most NASes and mini PCs), plus NVIDIA's NVENC, with software everywhere else. VideoToolbox, AMF on Windows and Rockchip come later.
   - Or: also VideoToolbox in Phase 4, for owners running highsea on a Mac.
   - Also: which machine is the reference for "keeps up in real time"? The owner's NAS, if it can be read without writing (the NAS rule stays read-only).
5. **The platforms and their order.**
   - **Recommended:** the roadmap's order: web, desktop, mobile, then TV, with 1.0.0 when all four are done.
   - Or: 1.0.0 at the web client (4.3), with desktop, mobile and TV as 1.x releases. People could watch much sooner.
   - Or: TV before mobile, since the living room is where films are watched most.
6. **Stores and signing.**
   - **Recommended:** the owner enrols in Apple's developer programme and Google Play's console under the `highsea-tv` organisation, and gets certificates for macOS notarisation and Windows signing. Everything is built and tested privately (TestFlight, Play's internal testing), and nothing is submitted until the sign-off and the owner's word.
   - Or: sideloading and unsigned builds only during Phase 4, with the accounts at the end.
7. **Notifications on phones and TVs.**
   - **Recommended:** no push relay in Phase 4, since APNs and FCM need the cloud (ADR 0010). The apps show what's new while open, over the SSE stream they already use. ntfy and the existing channels cover the owner.
   - Or: build the push relay in `cloud/` during Phase 4, self-hostable, as the first cloud service.
8. **Offline downloads.**
   - **Recommended:** in Phase 4 on mobile and desktop, with the transcode for download, and 30 days without seeing the server before a download expires (client-settings.md's current answer).
   - Or: the expiry set by the owner in Settings › Playback.
   - Or: downloads after 1.0.
9. **The client specs' open questions.** The recommendations, for the owner to take or change:
   - Next up at the end of a film in a collection: yes.
   - Audio description and commentary: labelled from the track's title and disposition.
   - Picture in picture on web and mobile: yes.
   - The version picked per device class (TV 4K, phone 1080p) rather than per title: yes, as the default, with a pick on a title still winning.
   - Trailers on the clients: no, as now.
   - Mark as watched: in More on web and mobile, and a long press of OK on TV.
   - More library filters: unwatched only, for now.
   - Recent searches: no, as now. Voice on TV: the platforms' dictation fills the field, with nothing extra designed.
   - Hero rotation on the web: never, as now. Pull to refresh on mobile: no.
   - A theme across all my devices: no, devices stay apart.
   - A TV's sign-in lasts until revoked, as other devices do.
10. **Sessions and history.**
    - **Recommended:** the live sessions and a short history (30 days) in Phase 4, with Tautulli's stats and newsletters later.
    - Or: live sessions only.
11. **The follow-ups waiting on Phase 3.**
    - **Recommended:** the dashboard customization runs after Phase 4's sign-off, so playback isn't held up. The local AI research stays unscheduled.
    - Or: the dashboard customization between 9c and Phase 4. It's smaller, and its prototype could be reviewed while 4.0 is under way.
12. **The first publish of 0.1.0.**
    - **Recommended:** publish 0.1.0 at the Phase 3 sign-off, as decided, so owners can run the server while the apps are built. Releases 0.2, 0.3 and so on carry the server's Phase 4 work as it's signed off.
    - Or: hold the first public release until 1.0.0.

## The owner's answers

On 2026-10-23 the owner answered every question, taking each recommendation except where marked:

1. **Movies only.** Playback and the four apps for movies. TV series, music, books, requests, Usenet and the relay each become a later phase of their own.
2. **The web client at `/web`** on the server. The admin's addresses stay as they are.
3. **Vite and React** for the web client.
4. **Changed by the owner:** VideoToolbox joins the first hardware paths, beside VAAPI, QSV and NVENC. AMF and Rockchip come later. The reference machine for real-time transcoding is the owner's NAS, measured read only.
5. **Changed by the owner:** the TV app comes before the mobile app. The order is web, desktop, TV, then mobile, with 1.0.0 when all four are done.
6. **Accounts under the `highsea-tv` organisation:** Apple's developer programme, Google Play's console, and the macOS and Windows signing certificates. Builds are tested privately, and nothing is submitted before the sign-off and the owner's word.
7. **No push relay in Phase 4.** The apps show what's new over SSE while they're open.
8. **Offline downloads in Phase 4,** on mobile and desktop, with transcoding for download. A download expires after 30 days without seeing the server.
9. **The client specs' open questions:**
   - Next up at the end of a film in a collection: yes.
   - Picture in picture on web and mobile: yes.
   - The version is picked per device class by default, and a pick on a title still wins.
   - Mark as watched: in More on web and mobile, and a long press of OK on TV.
   - Audio description and commentary are labelled from the track's title and disposition.
   - No trailers on the clients.
   - The Unwatched filter only. No recent searches, and on TV the platform's dictation fills the search field.
   - No hero rotation on the web, for now.
   - **Changed by the owner:** pull to refresh on mobile Home.
   - **Changed by the owner:** a theme can be applied to all of a person's devices. This amends client-settings.md's decision that devices stay apart. Devices still differ by default.
   - A TV's sign-in lasts until it's revoked.

   The additions to signed-off screens are prototyped first ([new screens](#new-screens-that-need-a-prototype-first), item 5), and client-settings.md, client-home.md, client-detail.md, client-library.md and player.md get their decisions updated when they're approved.
10. **Live sessions with 30 days of history.** Stats and newsletters come later.
11. **Dashboard customization after Phase 4's sign-off.** The local AI research stays unscheduled.
12. **0.1.0 is published at Phase 3's sign-off,** as decided. Releases 0.2, 0.3 and on carry Phase 4's server work as it's signed off.
