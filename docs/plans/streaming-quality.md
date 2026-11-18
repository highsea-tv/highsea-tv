# Plan: streaming at a quality that fits the connection

- **Status:** scoped on 2026-11-18 (HT-61), for the owner's review. Nothing is built. The open questions are at the end, each with a recommendation.
- **Gate:** the owner answers the open questions before stage 1 starts. Each stage is reviewed on its own, and the player's Quality menu (stage 2) is prototyped and approved before it's built, as for any change to a locked screen.
- **Parent plan:** [phase-5-real-use.md](phase-5-real-use.md), whose findings log has the finding this answers (2026-11-17: "a minute to resume there is mostly the choice to send the film's own picture"), and [phase-3-server.md](phase-3-server.md)'s standing rules.

## Read first

1. [ADR 0051](../adr/0051-playback-engine.md), the playback engine, with every dated section: the decision, the HLS runner, the remote ceiling, HT-46's quick start, HT-48's keyframes, HT-49's subtitles and HT-56's open GOPs.
2. [ADR 0052](../adr/0052-device-profiles.md) (device profiles) and [ADR 0056](../adr/0056-hardware-acceleration.md) (hardware acceleration).
3. [phase-4-checkpoint-3.md](phase-4-checkpoint-3.md)'s progress, for the DS1520+'s measured transcode speeds.
4. [ADR 0026](../adr/0026-network-tls.md)'s sections of 2026-11-17 and 2026-11-18, for the two supported routes and the proxy's headers.
5. The specs: [playback-settings.md](../product/playback-settings.md), [player.md](../product/player.md), [now-playing.md](../product/now-playing.md), [client-settings.md](../product/client-settings.md) › Playback and [connectivity.md](../product/connectivity.md).
6. The code: `packages/stream/src/decision/index.ts`, `packages/stream/src/hls/` (`args.ts`, `playlist.ts`, `runner.ts`), `packages/runtime/src/playback.ts` and `playback-settings.ts`, `packages/personalization/src/keys.ts` (`QUALITY_CAPS`, `capOf`), and the players in `packages/native/src/` (`playback.web.ts` for hls.js, `playback.ts` for expo-video).

## Goal

A film started away from home, on a phone over mobile data above all, begins within a few seconds and plays without stopping, at the best quality the link and the NAS can carry. At home nothing changes: the film's own picture, as now. The person can see what they're getting and choose another quality in the player, and the owner sees in Now playing what each stream is sent as and why. Every step rests on what the DS1520+ was measured to sustain, and each stage ships on its own.

## Out of scope

- **A relay, a tunnel or a VPN.** highsea is reached on the local network or at an address the owner controls (the phase 5 plan's change 3, ADR 0026's section of 2026-11-17).
- **HEVC or AV1 output.** The J4125 can't encode HEVC 10-bit at all, and HEVC 8-bit only through shaders ([Intel's media driver](https://github.com/intel/media-driver/blob/master/README.md#decodingencoding-features), Gemini Lake is in its `BXTx` column: AVC `D/E/Es`, HEVC 8-bit `D/Es`, HEVC 10-bit `D`). Every client plays H.264 (ADR 0056's Consequences).
- **HDR kept as HDR in a transcode.** HDR is tone mapped to SDR when the picture is made again, as today; Jellyfin does the same ("doesn't support HDR to HDR tone-mapping", [Jellyfin: Transcoding](https://jellyfin.org/docs/general/post-install/transcoding/)).
- **Downloads for offline at a chosen quality.** client-settings.md already draws "Quality for new downloads"; it comes with Downloads (C8), after stage 3, and reuses its ladder.
- **Music.** Songs direct play or become AAC (the phase 5 plan's part D); they're small enough not to need this.
- **Per-user caps set by an admin.** The household is the owner and their profiles; [question 9](#open-questions-for-the-owner) keeps it for later.

## Where things stand

More of this exists than the finding suggests. What's missing is mostly the proof that it's applied, a way to choose, and a ladder.

- **The decision** (`packages/stream/src/decision/index.ts`): direct play, direct stream, then transcode, in ADR 0051's order. A file whose bitrate (its size over its length, an average) is above the ceiling, or whose picture is taller than it, is transcoded: H.264 at `min(ceiling, tier)`, where the tiers are 2, 4, 12 and 40 Mbit/s at 480p, 720p, 1080p and 4K (`transcodeBitrate`).
- **The remote ceiling** (Settings › Playback, `playback-settings.ts`): "The most each stream is sent" away from home, 4 to 40 Mbit/s or No limit, **default 8 Mbit/s at 1080p**, per stream. At home there is none.
- **The person's own caps** (`client-settings.md` › Playback, `keys.ts`): **Quality at home** and **Quality away from home**, each Original, 20, 8, 4 or 2 Mbit/s (`QUALITY_CAPS`), default Original, laid under the server's ceiling (`under` in `playback.ts`). Built and in every app's Settings (`apps/client/src/app/(in)/settings.tsx`).
- **Home or away** (`playback.ts`): an address in `PRIVATE_RANGES` (RFC 1918, RFC 4193, loopback) is home. The address is the one `resolveClient` gives (`packages/network/src/proxies.ts`): the peer, or, from a trusted proxy with **Use X-Forwarded-For and X-Forwarded-Proto** on, the first untrusted address in `X-Forwarded-For`.
- **One variant per session** (ADR 0051, answer 7). The multivariant playlist lists one `EXT-X-STREAM-INF` with `BANDWIDTH` and, for a transcode, `CODECS` (`hls/playlist.ts`). A change of quality is a new session at the same position.
- **Transcodes** force a keyframe every 6 s, so their playlist is known before anything is made; direct streams are cut at the source's keyframes (HT-48's index), with short first segments where the source allows (HT-46). On the GPU, `h264_vaapi` with `-rc_mode VBR`, `-b:v` and `-maxrate` at the bitrate and `-bufsize` twice it (`hardware/index.ts`).
- **Limits:** Transcodes at once, 1 to 8, default 3. A run past the limit waits up to a minute, then fails with `limit`, which the player shows as Didn't start (ADR 0051's 4.3a section).
- **The DS1520+'s measured speeds** (phase-4-checkpoint-3.md, 2026-10-28, one run at a time, with Emby and Jellyfin running beside it): 1080p H.264 to 1080p on VAAPI 5.4× real time, to 720p 9.7×; 4K HEVC 10-bit HDR10 to 1080p, tone mapped on the chip, 3.4×, to 720p 4.5×; the processor 1.18× and 0.53×. A seek's first piece: 1.43 s and 2.56 s on VAAPI. VAAPI's check passed at 134 frames a second without low power.
- **Now playing** (now-playing.md) already shows Sent as, Network (At home or Away from home, with the address), Transcoded by with its speed, the reasons in words, Can't keep up, and Waiting for a slot.
- **The players:** hls.js 1.7.3 on the web and in the desktop app's webview (`playback.web.ts`, hls.js wherever Media Source Extensions exist, Safari's own HLS otherwise), with no ABR options set; expo-video 58.0.11 over AVPlayer on the iPhone and the Apple TV (`playback.ts`).

### Why the owner's plays were all sent at full bitrate

Not verified on the NAS, and the first thing stage 1 checks. The likeliest cause is the network setting, not the decision:

- On 2026-11-17 Settings › Network wasn't yet set for DSM's reverse proxy; the owner set it by hand on 2026-11-18 (the findings log's HT-53 entry). Until then highsea didn't read `X-Forwarded-For`, so every request through the proxy came from the proxy's own address, which is private, so every play counted as home and had no ceiling. A 20 to 80 Mbit/s Blu-ray rip then direct streams, which is what the log shows.
- With the setting on, a play from a phone on mobile data should come from the carrier's public address, count as away, meet the 8 Mbit/s ceiling and be transcoded to 1080p. Whether DSM's proxy sends `X-Forwarded-For` is what highsea's guide says (`apps/docs/content/settings/network/reverse-proxy-and-tls.mdx`); it isn't confirmed from Synology's documentation here.
- At home through `watch.highsea.tv`, the address highsea sees depends on how the router loops the request back (its LAN address, the phone's, or the home's public one). Not verified; a phone at home could be treated as away.

## The stages, and their size

Four stages, each shippable alone and each a task of its own. Stage 1 is the smallest step that makes mobile data watchable; the rest raise the quality and the choice.

| Stage | What it gives | Rough size | Touches |
| --- | --- | --- | --- |
| **1. Away, proved, and mobile data** | Away plays transcoded, proved on the NAS; a lower ceiling on mobile data; the log and Now playing say why | 1 to 2 days | `playback.ts`, the decision, the play request, the phone's network kind, Settings › Playback, Now playing's reasons |
| **2. Quality in the player, and the upload** | A Quality menu in every player; the owner's upload speed as a total budget; a full house of transcodes offers the original | 3 to 4 days, after a prototype | the prototypes, player.md, the clients' player, Settings › Playback, the runtime's budget |
| **3. An adaptive ladder** | Automatic quality that follows the link while playing, within a ladder made on demand | 1 to 2 weeks | `hls/playlist.ts`, `runner.ts`, `args.ts`, the session, hls.js and expo-video options, sweeps |
| **4. Later** | The original in the ladder with its measured peak; I-frame playlists; downloads at a quality | each its own task | the keyframe index, playlists, Downloads (C8) |

## Progress

Nothing yet.

## The model

Three ways to set quality, from the documents and from what highsea already has:

- **A fixed quality per play.** The server picks one variant when the play starts, from the route, the network kind and the person's choice; the player plays it; a change is a new session at the same position. It's what highsea does today, and what Jellyfin does: the client sends its profiles with a "target output bitrate", and the server transcodes to it ([Jellyfin: Transcoding](https://jellyfin.org/docs/general/post-install/transcoding/)).
- **An adaptive ladder.** The multivariant playlist lists several variants, each with `BANDWIDTH` (the peak segment bit rate) and `AVERAGE-BANDWIDTH` ([RFC 8216 § 4.3.4.2](https://www.rfc-editor.org/rfc/rfc8216#section-4.3.4.2)), and the player switches between them as its measure of the link changes, segment by segment. hls.js and AVPlayer both do this by themselves. Plex's Automatically Adjust Quality is this, for transcodes only: "videos will start at the quality that you have selected … then increase or decrease quality based on your connection speed", after 20 to 60 seconds, and "if a video starts with Play Original Quality … it will not automatically change" ([Plex: Automatically Adjust Quality](https://support.plex.tv/articles/115007570148-automatically-adjust-quality-when-streaming/)).
- **The first now, the second later.** Recommended ([question 1](#open-questions-for-the-owner)).

**Why not the ladder first.** A ladder made ahead is what Apple's specification assumes, and a NAS can't make one: every variant at once would be several transcodes for one viewer. Made on demand, only the variant the player asks for is transcoded at a time, and a switch restarts ffmpeg on the new variant at the next segment, as a seek does now (1.4 to 2.6 s to a first piece on the NAS). That works, but it needs the variants' segments on one grid, playlists with honest `BANDWIDTH` figures, and a player tuned not to switch on every wobble: a week or two of work and testing that a fixed quality doesn't need to make mobile data watchable.

**What the J4125 can sustain.** Intel documents what Gemini Lake encodes, not how many streams: "there is no concurrent encoding sessions limit on Intel iGPU" ([Jellyfin: Intel GPU](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/intel)), and Jellyfin's guide puts UHD 600 in its entry tier, "adequate for personal use", with no figure. highsea's own measurements are of one run at a time: 3.4× real time for the hardest case (4K HDR to 1080p, tone mapped) and 5.4× for 1080p to 1080p. Speed shared between runs isn't documented and isn't linear, so it's measured before any default changes (stage 1):

- two and three runs at once, each 4K HDR to 1080p and 1080p to 720p, each run's speed from Now playing, beside the owner's other containers;
- the NAS's processor while they run (Resource Monitor), since audio, subtitles and the HTTP sending stay on the processor.

A run must stay above 1× with headroom for seeks; 1.5× is a working floor for "keeps up". If three 4K HDR runs at once fall below it, Transcodes at once becomes 2 for this NAS, set by the owner or, later, from the measurement by itself.

**One thing the documents and the NAS disagree on.** Intel's feature table leaves HDR10 tone mapping blank for Gemini Lake (`BXTx`, "HDR10 TM", [Intel's media driver](https://github.com/intel/media-driver/blob/master/README.md#video-processing-features)), yet `tonemap_vaapi` passed highsea's check on the DS1520+ and its output was BT.709 (phase-4-checkpoint-3.md). The output's look wasn't judged by eye. Stage 1 compares a frame tone mapped on the chip with the processor's (`zscale` and `tonemap`) on one HDR film, and the plan treats the chip's tone mapping as measured to work but not documented, so a driver update could change it. ADR 0056's fallback to the processor (0.53× for 4K HDR on this NAS, so not real time) already covers a run that fails.

## Choosing the quality (1, 2, 3)

### From the route (stage 1)

The two supported routes already tell highsea most of what it needs: the local network is fast, and anything through `watch.highsea.tv` from outside is the home's upload, shared, then whatever the viewer has. Home and away stay decided by the server from the address, as now.

- **At home:** Original. Most plays cost the server nothing (ADR 0051's Consequences), and the LAN carries any film.
- **Away:** the remote ceiling, 8 Mbit/s at 1080p per stream by default. Plex's per-stream "Limit remote video quality" is the same setting ([Plex: Bandwidth and Transcoding Limits](https://support.plex.tv/articles/227715247-server-settings-bandwidth-and-transcoding-limits/)).

### From the network kind (stage 1)

A phone knows whether it's on mobile data, and the server doesn't. The apps send it with the play request, and the server applies a lower ceiling for it.

- **iPhone:** Apple's `NWPath.isExpensive` ("an interface that is considered expensive, such as Cellular or a Personal Hotspot") and `isConstrained` (Low Data Mode) ([Apple: NWPath](https://developer.apple.com/documentation/network/nwpath/isexpensive)). In Expo, `expo-network`'s network state names the connection's type; it isn't a dependency yet, and whether its version exposes `isExpensive` is not verified. Adding it follows the `add-dependency` skill.
- **Web:** the Network Information API (`navigator.connection`) is Chromium's only ([MDN: Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API), its compatibility table); Safari and Firefox don't have it, so the web sends nothing and the route alone decides.
- **Apple TV and the desktop app:** sent nothing; they're on a fixed network.
- **The ceiling on mobile data:** a new setting beside the remote ceiling, default **4 Mbit/s at 720p** ([question 4](#open-questions-for-the-owner)). For scale: Apple's example ladder has 1280 × 720 at 3,000 and 4,500 kbit/s in H.264, and asks a cellular default variant of 730 kbit/s average ([HLS authoring specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices), 1.25 and iOS 1.32b); Plex's apps cap cellular at 0.7 Mbit/s by default ("Limit Cellular Data"). A fixed quality has no way down when the signal drops, so stage 1 picks one that a weak 4G link usually carries; stage 3's ladder can then start lower and climb.
- **The person's own cap** still applies under both, as now.

### Measured, not assumed (stage 3)

Three ways to measure the link, and why the plan uses the player's:

- **The player's own estimate.** hls.js keeps one (`hls.bandwidthEstimate`, "the current bandwidth estimate in bits/s"), starts from `abrEwmaDefaultEstimate` (500,000 by default) and switches up only when `abrBandWidthUpFactor × average > level.bitrate` (0.7) ([hls.js 1.7.3 API](https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md)). AVPlayer measures its own and chooses a variant by itself. This is what a ladder relies on.
- **A server-side probe** (timing the segments as highsea sends them) doesn't measure the viewer's link behind a proxy: nginx, with `proxy_buffering` on by default, "receives a response from the proxied server as soon as possible" into its own buffers ([nginx: proxy_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)), so highsea sees the LAN to the proxy. That DSM's reverse proxy is nginx with its defaults isn't confirmed from Synology's documentation.
- **A speed test before Play** adds a wait to every start, which HT-46 just removed, and measures one moment of a link that changes.

### By hand (stage 2)

A **Quality** choice in the player: **Automatic** (the route and network kind; from stage 3, the ladder), **Original**, and the caps highsea already names: 20, 8, 4 and 2 Mbit/s, shown as 4K, 1080p, 720p and 480p with their bitrates, as Settings › Playback names its ceilings. Only the choices at or under the server's ceiling are offered away. A choice is a new session at the same position (ADR 0051), so the picture holds while it starts. It's for this play; the person's lasting default stays in Settings › Playback (client-settings.md), which the menu links to. Plex's player has the same per-play choice ("Convert" instead of "Play Original Quality", [Plex: Automatically Adjust Quality](https://support.plex.tv/articles/115007570148-automatically-adjust-quality-when-streaming/)).

## Limits and fairness (stage 2)

- **The upload as a whole.** A per-stream ceiling doesn't stop three away streams at 8 Mbit/s filling a 20 Mbit/s upload. Settings › Playback gains **Your upload speed** (Mbit/s, unset by default), as Plex's "Internet upload speed": "the total used won't exceed the value set here", using 80% of it for streams ([Plex: Bandwidth and Transcoding Limits](https://support.plex.tv/articles/227715247-server-settings-bandwidth-and-transcoding-limits/)). A new away stream gets the lesser of its ceiling and what's left of the budget, with a reason saying so; streams already playing aren't lowered (a fixed quality can't be, before stage 3). The owner's real upload speed is theirs to give ([question 6](#open-questions-for-the-owner)); highsea doesn't run a speed test against a third party.
- **Transcodes at once** stays the one processing limit (1 to 8). Its default for this NAS is set from stage 1's measurement.
- **When it's reached:** today the play waits a minute and fails. With quality in the player, the failed state offers **Play original quality** when the original would reach the person at all (a direct stream holds no slot), with its line ("Every transcode is in use. The original may pause on a slow connection."). Recommended in [question 7](#open-questions-for-the-owner).
- **Per user:** no admin caps now (the household is one account with profiles). Plex has "Remote streams allowed per user"; highsea can add it with sharing to people outside the home.

## What transcoding costs (1 to 3)

- **Seeking and resuming.** HT-46's short first segments, HT-48's keyframe index and HT-56's fixes are for copies. A transcode forces its own keyframes every 6 s, so its playlist is known at once and a seek lands on its grid; `-ss` before the input seeks by the container's index, and the decoder starts at the keyframe before, so a transcode shouldn't meet HT-56's open-GOP fault: ffmpeg decodes and discards what comes before the seek point when transcoding ([ffmpeg § Main options](https://ffmpeg.org/ffmpeg.html#Main-options), `-ss`). Not yet tried on an open-GOP film; stage 1's sweep adds it. Its first segment is a full 6 s, made at 3.4× to 5.4× on the NAS, so about 1.1 to 1.8 s of encoding after the seek. Shorter first segments for transcodes (a second grid near the start, 2 s, as HT-46 did for copies) are possible because the server sets the grid per session; left until the NAS shows the start is too slow. HT-59's work isn't on this branch, so this plan doesn't account for it.
- **Subtitles.** Text subtitles are unchanged: HT-49's WebVTT segments follow the picture's segments, whatever the grid. Picture subtitles (PGS, VobSub, DVB) are burned in already whenever the picture is made again (ADR 0051's 4.3a section), drawn on the processor (download, overlay, upload) even on the GPU path, so they cost speed: measured in stage 1 alongside the rest.
- **Sound.** A transcode's sound becomes AAC, 160 kb/s stereo or 384 kb/s 5.1 (ADR 0051). At 2 and 4 Mbit/s that 384 kb/s is a tenth to a fifth of the stream; below 8 Mbit/s the plan downmixes to stereo at 128 kb/s with RFC 7845's matrices already built ([question 8](#open-questions-for-the-owner)). A separate lower-bitrate audio rendition belongs to the ladder (stage 3), where Apple's ladder shares one audio group across variants (1.23, 8.16).
- **HDR and Dolby Vision.** Away, a 4K HDR film is tone mapped to SDR 1080p on the chip (3.4× measured). Dolby Vision profiles 7 and 8 carry an HDR10 or HLG base layer that the chip tone maps; profile 5 has none ([Dolby](https://professionalsupport.dolby.com/s/article/What-is-Dolby-Vision-Profile)), and only libplacebo maps it (ADR 0056), which this NAS doesn't use. A profile 5 film away would show wrong colours; the decision says so as a reason, and where the film has another version that isn't profile 5 or isn't HDR, the plan prefers it away (a decision across versions, stage 1's last item, [question 5](#open-questions-for-the-owner)).
- **Trickplay** is unaffected: its sheets are made from the file, once, and served apart.
- **Downloads** are later (out of scope), and reuse stage 3's variants.

## The adaptive ladder (3)

Stage 3 adds a new ADR (0069) and changes ADR 0051's "one variant per session".

- **The variants:** 1080p at 8 Mbit/s, 720p at 4, 480p at 1.5, each H.264 at or under the source's height, under the ceilings that apply to this play (route, network kind, person, budget). Apple's own example ladder is close (1920 × 1080 at 6,000 and 7,800; 1280 × 720 at 3,000 and 4,500; 960 × 540 at 2,000; 1.25). Its cellular rule of a variant at 192 kbit/s or less (iOS 9.21) is for the App Store's apps; a film at 192 kbit/s isn't watchable, so the ADR records the departure.
- **One grid for every variant.** Every transcode variant forces keyframes at the same times, so segment `n` covers the same film in each: Apple's 8.22 ("SHOULD have segment boundaries at the same points in time"; a MUST on tvOS), and what lets a player switch at any segment. The 6 s grid already does this for transcodes.
- **Made on demand, one at a time.** The multivariant playlist lists them all; only the variant the player asks for runs. A request for another variant's segment stops the old run and starts the new one there, as a seek does. Segments already made are kept per variant under the cache's rules.
- **Honest figures.** `BANDWIDTH` is the peak segment bit rate and `AVERAGE-BANDWIDTH` the average (RFC 8216 § 4.3.4.2), and Apple asks both, within 10% for VOD (1.26, 1.27, 9.13, 9.14). A capped VBR encode's peak is known from `-maxrate` and `-bufsize`; the ADR sets how they're declared and the tests measure real segments against them. `CODECS` and `RESOLUTION` are known for transcodes.
- **The first variant** is the one Automatic would have chosen in stage 1 (Apple: "Defaults are the first variant listed", 1.32), so a start is no slower than a fixed quality.
- **The players:**
  - hls.js: automatic level selection is its default. Set `startLevel` to the first variant, `capLevelToPlayerSize` on phones ("limit levels usable in auto-quality by the HTML video element dimensions"), and `hls.autoLevelCapping` from the person's choice; the Quality menu sets `hls.nextLevel` for a fixed choice, `-1` for Automatic ([hls.js 1.7.3 API](https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md)). The desktop app plays through the same code.
  - AVPlayer through expo-video: AVPlayer switches by itself. expo-video exposes `maxResolution` ("a soft preference that applies only to HLS sources" on iOS), `availableVideoTracks` with each track's bitrates, `videoTrackChange`, and `bufferOptions` ([expo-video](https://docs.expo.dev/versions/latest/sdk/video/)), but not AVPlayerItem's `preferredPeakBitRate` or `preferredPeakBitRateForExpensiveNetworks` ([Apple: preferredPeakBitRate](https://developer.apple.com/documentation/avfoundation/avplayeritem/preferredpeakbitrate)). So a cap is applied by the server, which lists only the variants under it, and a fixed choice is a playlist with one variant: no native code. The Apple TV follows the same rules.
- **The original isn't in the ladder** in stage 3: a copy is cut at the source's keyframes, which aren't on the 6 s grid. Choosing Original is a fixed, separate session, as Plex's auto quality never moves between the original and a transcode.

## Every client

| Client | Player | At home | Away | What changes |
| --- | --- | --- | --- | --- |
| Web | hls.js 1.7.3 (MSE), Safari's own HLS without MSE | Original | the ceiling; route only, no network kind outside Chromium | stage 2's menu; stage 3's ABR options |
| Desktop app | the web's player in Tauri's webview | Original | as the web | as the web |
| iPhone | AVPlayer via expo-video 58.0.11 | Original | the ceiling, lower on mobile data | sends the network kind (stage 1); menu (2); ladder needs no native code (3) |
| Apple TV | AVPlayer via expo-video | Original | rare; the ceiling | menu with the remote (2) |

HT-46 left AVPlayer's wait for several segments before its first frame (`bufferOptions`) untried; stage 1 tries a shorter forward buffer on the iPhone over mobile data, since a lower bitrate makes each segment smaller anyway.

## The admin (1, 2)

- **Settings › Playback** (playback-settings.md, Away from home): stage 1 adds **On mobile data** under "The most each stream is sent"; stage 2 adds **Your upload speed**. Both copy in the house voice, for example "Set it to your home's upload speed. highsea uses up to 80% of it for streams away from home."
- **Now playing** already shows Sent as, Network and Transcoded by. Its Why gains the new reasons: "On mobile data, so it's sent as 720p at 4 Mbps.", "Chosen in the player.", "Your upload is shared by 3 streams, so this one is sent at 5 Mbps." From stage 3, Sent as shows the variant playing now, from the segments asked for, and the history row keeps the lowest and highest.
- **The `playback` log's** `play session started` line gains `away`, the address it was decided from, the network kind and the ceiling, so the NAS's log answers this plan's first question for every play.
- The prototypes change for both screens (Settings › Playback's two rows, Now playing's lines) and for the player's Quality menu; listed in each stage's report as locked-screen changes for the owner's approval.

## Stage 1 in full: away, proved, and mobile data

The smallest step that makes mobile data watchable, built on what exists:

1. **The log line** above, then on the NAS, a play from the iPhone on mobile data: Now playing says Away from home with the carrier's address, and the stream is a transcode at 1080p and 8 Mbit/s. If it says At home, find the documented cause (the proxy's headers, the trusted proxies, the router's loop-back) and fix it before anything else.
2. **The network kind** from the iPhone in the play request (`PlayRequest`, `@highsea-tv/api-contract`, `bun run openapi`), and **On mobile data** in Settings › Playback, default 4 Mbit/s at 720p, laid under the remote ceiling.
3. **Stereo AAC at 128 kb/s** for transcodes under 8 Mbit/s.
4. **A lighter version away**, where a film has more than one: the decision prefers the version that needs no transcode, then the one with the least work (SDR over HDR, 1080p over 4K), and says so.
5. **Measured on the NAS:** two and three transcodes at once (as above), a frame tone mapped on the chip against the processor's, the iPhone's first frame on mobile data at 4 and 8 Mbit/s with and without a shorter forward buffer.

**Tests:** the decision against the network kind, the new ceiling and a choice of versions (pure, every profile); the play request's schema; the log line; `scripts/sweeps/start-times.ts` through a link held at 6 Mbit/s, a 25 Mbit/s film away (a test address outside `PRIVATE_RANGES`), showing a transcode and its first frame time.

**Only the owner's NAS and phone prove:** the address through DSM's proxy, a carrier's real link, the chip's speed with runs side by side, and the look of a tone-mapped frame.

## Stages 2 and 3, tests

- **Stage 2:** the prototype's Quality menu on all three form factors (the TV's with the D-pad), approved before building; the runtime's budget with three sessions; the failed state's offer; the clients' sweeps for the player. On the NAS: three away streams under a set upload speed, with Now playing's reasons.
- **Stage 3:** the multivariant playlist against RFC 8216's rules and Apple's (snapshots plus a checker for `BANDWIDTH`, `AVERAGE-BANDWIDTH`, `CODECS`, `RESOLUTION`); real ffmpeg making two variants of a test film and ffprobe showing their keyframes at the same times; a switch mid-film restarting the run on the new variant; hls.js in Chromium and Firefox through a link that drops from 20 to 3 Mbit/s and back, the level following (`playback.ts` sweep); AVPlayer the same through `avplayer.swift`. On the NAS and the iPhone: a walk with the phone from Wi-Fi to mobile data, and Now playing following the variant.

## ADRs

- **ADR 0051, a dated section at stage 1:** the network kind in the play request, the mobile-data ceiling, stereo below 8 Mbit/s, a version chosen for the route, and the log's fields. **At stage 2:** the upload budget and the original offered when transcodes are full.
- **ADR 0052, a dated section at stage 1:** the network kind beside the profile in a play request, as a fact about this play, not the device.
- **ADR 0056, a dated section at stage 1:** what the DS1520+ sustains with runs side by side, and the tone-mapping finding against Intel's table.
- **New ADR 0069, at stage 3: an adaptive ladder made on demand.** The variants, one grid, one run per session, the figures declared, and the departures from Apple's specification (no 192 kbit/s variant, no I-frame playlists until stage 4).
- **I-frame playlists** (Apple's 6.1 asks for them, a MUST, for its own scrubbing UI) aren't needed by highsea's players, which draw trickplay themselves; stage 4 adds them if the Apple TV's native scrubbing is wanted. ADR 0051's current stream doesn't have them either.

## Risks

- **The NAS's capacity is guessed from one run at a time.** Stage 1 measures runs side by side before any default changes.
- **Tone mapping on Gemini Lake isn't in Intel's table.** It passed on this NAS; a driver update may change that, and the processor can't keep up with 4K HDR (0.53×). The fallback says so in Now playing.
- **The home's upload speed is unknown.** If it's under about 10 Mbit/s, one 8 Mbit/s stream fills it; [question 3](#open-questions-for-the-owner) and stage 2's budget answer it.
- **Average bitrate isn't peak.** The decision compares a file's average with the ceiling. Plex notes spikes of "3x, 4x, or even more the average" and assumes twice the average until its deep analysis has run ([Plex: Bandwidth and Transcoding Limits](https://support.plex.tv/articles/227715247-server-settings-bandwidth-and-transcoding-limits/)). For Blu-ray rips at 20 Mbit/s and up it doesn't matter (they're transcoded away anyway); a 6 Mbit/s file sent as it is to a phone could stall. Stage 4 measures peaks from the index, as Plex does.
- **A wrong home or away.** The router's loop-back may make a phone at home look away (a needless transcode) or the reverse. The log line shows it; the person's own choice in the player overrides it.
- **A fixed quality can't follow the signal** (stages 1 and 2). A train through a tunnel still stalls. Stage 3 answers it.
- **Switching variants restarts ffmpeg.** If players switch often, the NAS spends its time starting runs. hls.js's up-switch factor (0.7) damps it; the sweep measures switches per minute on a varying link.
- **Dolby Vision profile 5** away looks wrong without libplacebo; the reason says so, and another version is preferred.

## Open questions for the owner

Each has a recommendation; the first option is it.

1. **The model.**
   - **Recommended:** a fixed quality per play now (stages 1 and 2), the adaptive ladder after (stage 3). Mobile data becomes watchable in days, and the ladder waits for the NAS's measured capacity.
   - Or: the adaptive ladder first. The best result, but a week or two before mobile data improves at all.
   - Or: a fixed quality only. The least to build and keep; a signal that drops mid-film still stalls.
2. **The first stage.**
   - **Recommended:** stage 1 as written: prove away on the NAS, the mobile-data ceiling, stereo below 8 Mbit/s, a lighter version away, and the NAS's measurements. No new screen.
   - Or: stage 1 with the player's Quality menu in it. Choice by hand sooner, but it waits for a prototype.
   - Or: only prove away on the NAS and stop there. The least work; the phone stays at 8 Mbit/s on mobile data.
3. **Away from home's default.**
   - **Recommended:** keep 8 Mbit/s at 1080p per stream, and set it lower in Settings › Playback once you know your upload speed. Close to Apple's top H.264 variant (7.8 Mbit/s).
   - Or: 4 Mbit/s at 720p. Safer on a modest upload and a weak link; softer on a laptop away.
   - Or: 12 Mbit/s at 1080p. Better picture on a strong link; more stalls on a weak one.
4. **On mobile data.**
   - **Recommended:** 4 Mbit/s at 720p. Watchable on a phone's screen, and most 4G links carry it.
   - Or: 2 Mbit/s at 480p. Fewer stalls and less data; visibly soft.
   - Or: the same as away (no separate setting). Simpler; the phone gets 8 Mbit/s on mobile data.
5. **A lighter version away.**
   - **Recommended:** yes: where a film has more than one version, away prefers the one that needs the least work, and says so. Free where it applies.
   - Or: always the version the person picked, transcoded down.
6. **Your upload speed.**
   - **Recommended:** a setting in stage 2, unset by default, which you fill in from your provider's figure or a speed test; highsea then shares 80% of it between away streams.
   - Or: per-stream ceilings only, as now. Nothing to set; several away streams can fill the upload.
7. **When every transcode is in use.**
   - **Recommended:** the player's failed state offers Play original quality, with a line that it may pause on a slow connection.
   - Or: wait a minute and fail, as now.
   - Or: lower Transcodes at once's default and leave the rest.
8. **Sound in a low-bitrate transcode.**
   - **Recommended:** stereo AAC at 128 kb/s below 8 Mbit/s, 5.1 kept above. A phone plays stereo anyway, and the bits go to the picture.
   - Or: keep 5.1 at 384 kb/s whenever the client takes it, as now.
9. **Caps per user in the admin.**
   - **Recommended:** not now; the household is one account with profiles, and each person's own caps already exist.
   - Or: an admin cap per user, away from home, in stage 2, as Plex's per-user limits.
10. **Transcodes at once on your NAS.**
    - **Recommended:** keep 3 until stage 1 has measured two and three at once, then set it from the result (likely 2 for 4K HDR).
    - Or: set it to 2 now, before measuring.

## The owner's changes

None yet.

## The owner's answers

None yet.
