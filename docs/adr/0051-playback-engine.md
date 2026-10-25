# 0051. The playback engine: direct play, then direct stream, then HLS transcodes made on demand

- **Status:** Proposed
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
