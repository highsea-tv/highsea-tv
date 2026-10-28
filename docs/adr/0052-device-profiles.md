# 0052. Device profiles: what each client plays, built in and reported, in one shape

- **Status:** Accepted (2026-10-27, at checkpoint 4.1b's sign-off)
- **Date:** 2026-10-23

Drafted at Phase 4's checkpoint 4.0b ([phase-4-checkpoint-0.md › ADR drafts](../plans/phase-4-checkpoint-0.md#adr-drafts-40b)). It becomes Accepted at 4.1, which builds it.

## Context

The playback engine ([ADR 0051](0051-playback-engine.md)) decides between direct play, direct stream and a transcode by comparing a version's streams with what the client can play. That needs a description of each client: one the server can reason over, the tests can enumerate, and Now playing can turn into sentences.

Clients differ more than their names suggest. Chrome, Firefox and Safari decode different codecs, and the same browser differs by OS and hardware. A Tauri app's webview is WKWebView on macOS, WebView2 on Windows and WebKitGTK on Linux ([Tauri's webview versions](https://v2.tauri.app/reference/webview-versions/)), so the desktop app isn't Chromium everywhere. Native players report their own decoders.

Prior art: Jellyfin's `DeviceProfile` ([jellyfin/MediaBrowser.Model/Dlna/DeviceProfile.cs](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Model/Dlna/DeviceProfile.cs)) lists direct-play, transcoding, codec and subtitle profiles with conditions. It's read for what it gets right, conditions on profile, level and bit depth, and not copied: much of it serves DLNA, which highsea leaves out.

## Decision

- **One shape,** in `@highsea-tv/stream/profiles`, as zod schemas like the other shared formats (ADR 0033):
  - **containers** it plays directly (`mp4`, `mkv`, `webm`, `mpegts`);
  - **video codecs,** each with the profiles, the highest level, and the bit depths it decodes;
  - **HDR formats** it shows (HDR10, HDR10+, HLG, Dolby Vision with its profiles), and whether it shows SDR from them itself;
  - **audio codecs** with their most channels, and whether it passes a format through to a receiver;
  - **subtitle formats** it draws (WebVTT, SRT, ASS, PGS), the rest burned in;
  - **HLS:** whether it plays HLS natively, and the segment containers it takes;
  - **bandwidth:** the most it asks for, below the server's remote ceiling.
- **Built-in profiles** for each client and platform (web per engine, desktop per webview, iOS and tvOS, Android and Android TV, the TV platforms the clients reach), conservative: a codec is in a built-in profile only where the platform's own documentation says it plays.
- **Reported profiles:** a client may send what it finds it can play, narrowing or widening its built-in profile for that device:
  - browsers through [`MediaSource.isTypeSupported()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/isTypeSupported_static) and [`MediaCapabilities.decodingInfo()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo) ([W3C Media Capabilities](https://www.w3.org/TR/media-capabilities/)), which also says whether decoding is smooth and power-efficient;
  - native apps through their platform's player, at 4.4 and 4.5, from Apple's and Android's media documentation.

  The server keeps a reported profile per device, with the date it was reported, and uses the built-in one when there's none.
- **Reasons:** each comparison that rules out direct play gives a reason with its facts (the codec, the profile, the bitrate against the ceiling), worded in i18n messages for Now playing.
- **The catalog later:** profiles can come through the signed catalog (ADR 0034) as `catalog/device-profiles`, so a platform's change reaches servers without a release. Not at 4.1.

## Consequences

- The decision is a pure function of the version's streams and a profile, so its tests enumerate every built-in profile against every clip, with no device.
- A wrong built-in profile shows as a needless transcode or a stream that doesn't start. Reported profiles correct the first, and "This film didn't start" with Try again covers the second while a fix ships.
- Left to settle at 4.1: the profiles' exact contents per platform, from each platform's documentation, and how often a client reports again.

## 2026-10-27: what building it settled (checkpoint 4.1)

- **The browsers' built-in profiles** are `web-chromium`, `web-chromium-macos`, `web-firefox` and `web-safari` (`packages/stream/src/profiles/`). They're written from MDN's codec and container guides and each engine's own notes. Each takes MP4 and WebM to play directly, Safari HLS natively, and fragmented MP4 in HLS. None takes Matroska directly, so an MKV is a direct stream at best.
- **Reported profiles** are kept per device with their date (`device_profiles`). `withReport` lays a report over the device's built-in profile: what the browser says it decodes, and smoothly, narrows or widens it. A client reports again when it starts and when its report would change; 4.2's web client decides how often.
- **The variant** comes from the profile's codecs and `maxBitrate` and the remote ceiling: one per session (the plan's answer 7).
- **Subtitles:** the browsers' profiles draw WebVTT, so text tracks are sent as WebVTT and image tracks have no URL until 4.3.
- The other platforms' profiles come with their apps (4.4 to 4.6), from their platforms' documentation.

## 2026-10-28: burned-in subtitles in the decision (checkpoint 4.3a)

- The decision takes what the server can do, `server: { burnIn, toneMapping }`, so a client's profile stays what the client plays and the server's abilities are said once. 4.3a sets `burnIn`; tone mapping is 4.3b's.
- A subtitle's `delivery` is `external`, `embedded`, `burn-in` or `unavailable`. A picture track of the film's own, or ASS the client can't draw, is `burn-in` when the server can, which forces a transcode, and the reasons say so: "{client} can't draw {format} subtitles, so they're burned into the picture". Without burn-in, ASS is sent as WebVTT without its styling, and a picture track is unavailable, as in 4.1.
- The play API gives each track's delivery, so a client lists a burned-in track as choosable, loads no `<track>` for it, and leaves out its timing with a line saying why (the plan's answer 6).
