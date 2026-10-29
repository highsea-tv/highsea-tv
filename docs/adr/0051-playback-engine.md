# 0051. The playback engine: direct play, then direct stream, then HLS transcodes made on demand

- **Status:** Accepted (2026-10-27, at checkpoint 4.1b's sign-off)
- **Date:** 2026-10-23

Drafted at Phase 4's checkpoint 4.0b ([phase-4-checkpoint-0.md › ADR drafts](../plans/phase-4-checkpoint-0.md#adr-drafts-40b)). It becomes Accepted at 4.1, which builds it, with a dated section for whatever building it changes. Hardware acceleration has its own ADR at 4.3.

## Context

Phase 4 plays films ([phase-4-clients.md › Playback on the server](../plans/phase-4-clients.md#playback-on-the-server)). highsea's files are whatever the owner's releases are: MKV and MP4, H.264, HEVC and AV1, 8- and 10-bit, HDR10 and Dolby Vision, DTS, TrueHD, AAC and AC-3, with SRT, ASS and PGS subtitles. Its clients are a browser, a Tauri webview, AVPlayer on Apple's platforms and Media3 on Android, and each plays a different subset. The server is one Node process (ADR 0003) that already runs ffmpeg for the subtitle sync (ADR 0044) and has ffprobe's facts for every file in `media_files` (ADR 0040).

What has to be decided: how a file reaches a client that can play it as it is, how one that can't gets something it can, how a seek works in each, and who may load the media.

Alternatives:

- **Transcode everything to one format.** Simple, and wasteful: a 4K HEVC file played on a TV that decodes HEVC would be made again for nothing, at a cost in quality and in the server's processor.
- **Progressive transcodes over one HTTP response** (ffmpeg writing fragmented MP4 to the socket). No seeking past what's been made without restarting, and no switching between variants.
- **DASH.** Equally standard, but Apple's players don't play it, and HLS in fragmented MP4 now carries the same codecs (RFC 8216 § 3.3; Apple's HLS authoring specification).

## Decision

- **The decision, in order:** each play request carries the client's device profile ([ADR 0052](0052-device-profiles.md)). `@highsea-tv/stream` compares it with the version's streams and picks:
  1. **Direct play** when the container, every stream the person picked, and the bitrate all suit the client.
  2. **Direct stream** when the picture suits but the container or the audio doesn't: the video is copied, the audio converted, into HLS.
  3. **Transcode** otherwise: the video is made again, at the remote ceiling's bitrate when the person is away from home (Settings › Playback, [playback-settings.md](../product/playback-settings.md)).

  Each step writes its reasons as it goes, as the quality decision's `DecisionReason`s do (ADR 0031), in i18n messages, so Now playing ([now-playing.md](../product/now-playing.md)) and the tests say why.
- **Direct play** serves the file with byte ranges (`Range`, `206 Partial Content`; [RFC 9110 § 14](https://www.rfc-editor.org/rfc/rfc9110#section-14)). The file never moves or changes.
- **HLS** for the rest ([RFC 8216](https://www.rfc-editor.org/rfc/rfc8216)): a multivariant playlist, a media playlist per variant, and fragmented MP4 segments (§ 3.3), with the target durations and keyframe spacing [Apple's HLS authoring specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices) asks for, so AVPlayer plays it unchanged. The media playlist lists every segment from the start (`#EXT-X-PLAYLIST-TYPE:VOD`), since the film's length is known; the segments themselves are made when asked for.
- **Segments on demand:** ffmpeg runs as a child process ([Node's `child_process`](https://nodejs.org/api/child_process.html)), never in the server's thread, writing segments with its HLS muxer ([ffmpeg-formats › hls](https://ffmpeg.org/ffmpeg-formats.html#hls-2)) a few ahead of the player. A request for a segment far from what's being made restarts ffmpeg at the nearest keyframe before it. A session that's idle stops its ffmpeg.
- **The cache:** segments live under Settings › Playback's folder, kept while a film plays and a while after, removed oldest first, from films nobody is watching, when the cache passes its limit. Trickplay tiles are kept per film in the data folder and don't count.
- **Web** plays HLS through [hls.js](https://github.com/video-dev/hls.js) over Media Source Extensions where the browser has no native HLS; Safari and Apple's native players play it themselves.
- **Who may load media:** a media element can't send headers, so `/stream` takes a short-lived signed token, scoped to one person, session and file, issued by the API to someone whose session or device token may see that library. It's the calendar feed's pattern (ADR 0045), with a lifetime of hours, not months.
- **Positions** are reported over HTTP (`POST /api/v1/items/{id}/progress`), and other devices hear of them over the existing SSE stream (`watch.updated`). `/ws` stays reserved for SyncPlay and remote control, which come later.
- **Live sessions** are the runtime's: who, which device, title and version, the decision with its reasons, bitrate and position. They feed Now playing, and Stop ends a session's token and ffmpeg and tells the client why.

## Consequences

- Most plays at home cost the server nothing beyond reading the file, since direct play comes first.
- A transcode's quality and cost depend on the host. 4.3 adds hardware acceleration; until then transcodes use the processor, and Settings › Playback says so.
- Seeking far ahead in a transcode waits for ffmpeg to restart and make the first segment: a second or two on a processor. "Getting it ready" ([player.md](../product/player.md#the-streams-states-checkpoint-40b)) covers the first play.
- `packages/stream` is new, framework-free like the other domains, with subpaths as ADR 0036 sets them. Its tests build ffmpeg's command lines as snapshots, check playlists against RFC 8216's rules, and run real ffmpeg where it's present, skipping and saying so where it isn't, as ADR 0044's tests do.
- ADR 0003 gets a dated section when `/stream` stops being reserved.
- Left to settle at 4.1, from the docs: the segment length (Apple's specification recommends 6 s), how far ahead ffmpeg runs, when a film counts as watched, and the token's lifetime.

## 2026-10-27: what building it settled (checkpoint 4.1)

Built in 4.1a (the decision, direct play, tokens and sessions) and 4.1b (HLS, subtitles and trickplay), in `packages/stream` (`decision`, `sessions`, `hls`, `trickplay`), the runtime's `playback.ts` and `trickplay.ts`, and `apps/server/src/stream/`. What the draft left open, and what changed:

- **Tokens** last 6 hours, renewed by each progress report, and end with their session (the plan's answer 4). They're an HMAC over the session, person and file with a key made at boot, so a restart ends every stream; the client asks to play again.
- **Watched** is past 90% of the film's length (answer 3; ADR 0054).
- **One variant per session** (answer 7), chosen from the profile and the remote ceiling. A change of quality is a new session at the same position. The multivariant playlist names `CODECS` only when both streams are made again, since a copied stream's exact codec string isn't known without reading its bitstream.
- **Segments** are 6 s, as Apple's specification recommends.
  - A transcode forces a keyframe every 6 s (`-force_key_frames expr:gte(t,n_forced*6)`), so each segment is one file and the playlist is known before anything is made.
  - A direct stream can only be cut at the source's keyframes. ffprobe reads them once per file from the picture's packets and their flags, without decoding, and the runtime keeps them in `file_keyframes` by the file's size. A segment runs from one keyframe to the first at least 6 s later.
- **How ffmpeg is run**, from [ffmpeg-formats › hls](https://ffmpeg.org/ffmpeg-formats.html#hls-2) and [› mov, mp4](https://ffmpeg.org/ffmpeg-formats.html#Options-6):
  - `-hls_time 0` cuts a file at every keyframe, so a file's number is its keyframe's whichever run wrote it. Segments are served as their files joined.
  - `-copyts -start_at_zero` and the MP4 muxer's `movflags=+frag_discont` (through `-hls_segment_options`) write the film's own time into each fragment's `tfdt`. Runs started anywhere then make the same timeline and identical initialization sections, so a seek lands where the playlist says. Without `frag_discont` each run started its fragments at 0.
  - A transcode started after 0 also takes `-ss` and `-output_ts_offset` as output options, at the segment's start. Without them a copied audio track began at the source keyframe before it (3.6 s early on an HEVC film), and since hls.js takes its start from the earliest `tfdt`, subtitles were shown 3.6 s late.
  - `-hls_flags temp_file` makes a file appear only when it's whole.
  - ffmpeg runs 30 s ahead of the furthest segment asked for, and is then paused with `SIGSTOP` and continued with `SIGCONT`. A request more than 18 s past what's made, or before where the run started, restarts it there. A run nobody asks anything of for a minute stops.
- **The encoder** is libx264 `veryfast`, CRF 23 capped with `-maxrate` at the bitrate and `-bufsize` at twice it, High profile; AAC at 160 kb/s stereo, or 384 kb/s for 5.1 (answer 8). HDR made into SDR isn't tone mapped until 4.3 (answer 6), and the reasons say so. On an Apple M2 Max, a minute of HEVC 1080p took 6.0 s at 1080p (10× real time) and 3.6 s at 720p. The owner's NAS is measured with the beta (answer 10).
- **The cache** is the data folder's `transcodes/`, a folder per session, removed when the session ends and emptied at boot. Its size limit and Settings › Playback's folder are 4.3's.
- **Errors:** a run that fails logs its exit and its log's last 20 lines to System › Logs. The request answers 500 with "This film didn’t start."
- **Subtitles:** text tracks (embedded or sidecar SRT, ASS and WebVTT) are converted by ffmpeg to WebVTT once per session, at `/stream/subtitles/{token}/{track}.vtt`. For HLS they're also a subtitle rendition with one segment, the whole file ([RFC 8216 § 4.3.4.1](https://www.rfc-editor.org/rfc/rfc8216#section-4.3.4.1)). Their cues are on the film's timeline, so no `X-TIMESTAMP-MAP` is needed. Image tracks have no URL until 4.3 burns them in. The offset is the client's.
- **Trickplay:** a frame every 10 s, 320 px wide, in 10 × 10 JPEG sheets, made from the keyframes alone (`-skip_frame nokey` with `fps`, `scale` and `tile`; [ffmpeg-filters › tile](https://ffmpeg.org/ffmpeg-filters.html#tile)) at the lowest priority (`nice` 19). They're kept in the data folder's `trickplay/<file>/`, outside the cache. A 92-minute HEVC 1080p film took 16.7 s and made 6 sheets (3.5 MB). The `media.trickplay` job makes the newest film without them, one at a time, then queues itself again until the library has them all (answer 9). It runs after each import, and at boot when any are missing. A film that fails keeps its error until its file changes. Served at `GET /api/v1/items/{type}/{id}/trickplay` and `…/trickplay/{n}.jpg`.
- **Web:** hls.js 1.7.3 on the test page (`/stream/try`), which also plays Safari's native HLS. The web client takes it up in 4.2.

## 2026-10-28: limits, the cache, burn-in, the downmix and Now playing (checkpoint 4.3a)

Built in 4.3a in `packages/stream/src/hls/` (`args.ts`, `runner.ts`), the runtime's `playback.ts`, `playback-settings.ts` and `now-playing.ts`, and Settings › Playback and Now playing in the admin. What the plan left open, and what building it settled:

- **Settings › Playback** (`settings.get('playback')`): transcodes at once, 1 to 8 (default 3); the encoder, Faster, Balanced or Sharper (default Balanced); the most each stream is sent away from home, 4 to 40 Mbps or No limit (default 8 Mbps, 4.1's `REMOTE_CEILING`); the cache's folder and its limit, 2 to 2000 GB (default 20). They apply to sessions that start after a save. The hardware and tone-mapping settings are 4.3b's.
- **Transcodes at once:** a run that makes the picture again holds a slot while it runs; a direct stream's copy doesn't. Past the limit a run waits, first come first served, and gives up after a minute with a `limit` error (the plan's answer 7), which the player shows as Didn't start with its own line. hls.js waits up to 75 s for a segment's first byte (its `fragLoadPolicy`'s `maxTimeToFirstByteMs`), past the minute, so the 503 reaches the player. Safari's native HLS doesn't hand a segment's status to the page, so there it shows the general failure.
- **The encoder's three settings** are libx264's presets `superfast`, `veryfast` (4.1's, unchanged) and `faster` ([ffmpeg's H.264 guide](https://trac.ffmpeg.org/wiki/Encode/H.264), "Preset"); the CRF and the rate cap are unchanged.
- **The cache:** the folder defaults to `/config/transcodes` in the container (the data folder's `transcodes/`). A new folder must be a full path highsea can write, and is refused when it's inside, or holds, a root folder or the downloads folder, since highsea removes what it makes there. Sessions playing keep the old folder until they end. The limit is checked as pieces are written: past it, the pieces furthest behind the players go first, keeping the 60 s behind each player that it may seek back to, and never a piece ffmpeg may still be writing; a piece asked for again is made again. Clear removes every piece and stops nothing. `GET /api/v1/playback/status` reports the cache's use against the limit, with trickplay's size apart, and `playback.updated` follows each change.
- **Burn-in:** picture tracks of the film's own (PGS, VobSub, DVB) and ASS the client can't draw are burned in, which makes the run a transcode. A picture track is a second input to `overlay`, scaled to the source picture first and then scaled with it, so the overlay lines up whatever size is sent. ASS is taken out of the film once a session with the fonts the film carries, and drawn by `subtitles` (libass) with `fontsdir` ([ffmpeg-filters › overlay](https://ffmpeg.org/ffmpeg-filters.html#overlay-1), [› subtitles](https://ffmpeg.org/ffmpeg-filters.html#subtitles-1)). Every styled ASS track is burned in when the client can't draw ASS, since its styling is lost as WebVTT. A track that can't be read is logged and the film plays without it. A sidecar picture track isn't burned in yet.
- **The downmix:** 5.1 and 7.1 made into stereo use RFC 7845's matrices (§ 5.1.1.5, Figures 7 and 9) through `pan`, in ffmpeg's channel order. Unlike the plan, the LFE is kept, at the matrices' weight, as the RFC has it; the centre is −3 dB against the fronts and each surround is split between the sides, with the RFC's coefficients as it gives them. ffmpeg's own `-ac 2` doesn't scale the floating-point samples AAC takes (libswresample's `rematrix_maxval`), so its peaks clip; the plan's "quieter in the centre" was wrong, and the code comment says what it does. Other layouts keep `-ac 2`.
- **Speed:** ffmpeg's `-progress pipe:1` every second ([ffmpeg › Main options](https://ffmpeg.org/ffmpeg.html#Main-options)). Its own `speed=` counts from the run's start, paused time included, so the runner measures its own, the film's seconds made per second over the last few reports while not paused. Unknown until a run has reported, which Now playing shows as "starting".
- **Stop** (`POST /api/v1/sessions/{id}/stop`, staff): ends the session's token and its run at once. The person hears `playback.stopped` over their events, and their player's next request about the session is a 404 whose details say who stopped it and the message, kept for a while after; the player shows its Stopped state.
- **The history** (`playback_history`): a row per session that ended with something watched, without addresses. A restart on the same device within 2 minutes, to change the sound or subtitles, joins the row before it. The `playback.prune` job removes rows past 30 days daily, safe to repeat (ADR 0022), and a person's rows go with them.

## 2026-10-28: the graphics chip (checkpoint 4.3b)

Transcodes run on a graphics chip once its check passes, and tone map HDR there or on the processor (ADR 0056). The runner (`hls/runner.ts`) reads the path and tone mapping for each run as it reads the limits, so a new check or setting applies to the next run. 4.1's segmenting is unchanged: the GPU encoders take their keyframes from `-force_key_frames` every 6 s, as libx264 does. A run that fails on the chip before its film ends starts again on the processor from the segment it had reached, its session marked fallen back for Now playing, and the runtime marks the path's check failed. Now playing's sessions name the path a transcode runs on, or the processor.
