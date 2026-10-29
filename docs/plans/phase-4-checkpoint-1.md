# Phase 4, checkpoint 4.1: playback on the server

- **Status:** Scoped on 2026-10-27, and approved the same day with [the owner's answers](#the-owners-answers) (every recommendation). 4.1a starts first.
- **Parent plan:** [phase-4-clients.md › Order of work](phase-4-clients.md#order-of-work-and-checkpoints), 4.1.
- **Gate:** 4.0 was signed off on 2026-10-27, with Next.js 16.4.1. 

## Read first

1. The parent plan: Standing rules, [Playback on the server](phase-4-clients.md#playback-on-the-server), [Watch state](phase-4-clients.md#watch-state), [Media analysis](phase-4-clients.md#media-analysis), [Tests and checks](phase-4-clients.md#tests-and-checks), and The owner's answers.
2. The ADR drafts this checkpoint builds and accepts: [0051](../adr/0051-playback-engine.md) (the playback engine) and [0052](../adr/0052-device-profiles.md) (device profiles).
3. The ADRs it builds on:
   - [0003](../adr/0003-server-runtime-custom-entry.md): `/stream` reserved in the custom entry;
   - [0012](../adr/0012-unified-media-item-model.md): items and versions;
   - [0022](../adr/0022-job-queue.md): jobs run at least once;
   - [0031](../adr/0031-quality-and-the-decision-engine.md): `DecisionReason`s, the style the playback decision follows;
   - [0040](../adr/0040-test-media.md): the test clips;
   - [0044](../adr/0044-subtitle-sync.md): ffmpeg from a worker, and tests that skip without it;
   - [0045](../adr/0045-automation.md): the calendar feed's signed key, the pattern for stream tokens;
   - [0049](../adr/0049-smart-collections.md): the watched and last-played rules, disabled until now.
4. The specs: [player.md](../product/player.md) (Data, the stream's states, Saving), [client-detail.md](../product/client-detail.md) and [client-home.md](../product/client-home.md) (Resume, Continue watching, Mark as watched), [playback-settings.md](../product/playback-settings.md) and [now-playing.md](../product/now-playing.md) for what 4.3 adds on top.

## Goal

The server can play any film in the library to a client that asks, and explains how. Given a device profile, it decides between direct play, direct stream and a transcode, with reasons. It serves the file by byte ranges or as HLS made on demand, with text subtitles as WebVTT and trickplay tiles for the scrubber. Each person's place, picks and watched state are kept and shared across their devices. At the review the owner plays real films from the library in a plain test page, on a browser, before the web client exists.

## Out of scope

- **The clients' screens:** 4.2 (web), 4.4 (desktop), 4.5 (TV) and 4.6 (mobile). 4.1's test page isn't a client ([Trying it](#trying-it-at-the-review-41a-and-41b)).
- **Hardware acceleration, tone mapping, burn-in of image subtitles, better downmixing, transcode limits, throttling, and the cache's settings:** 4.3, with its own ADR. 4.1 uses fixed defaults and the processor. Whether software tone mapping comes forward is [answer 6](#the-owners-answers).
- **Settings › Playback, Now playing and its widget, and sessions' 30-day history:** 4.3. 4.1 keeps the live sessions in memory, which 4.3 shows.
- **Reported profiles from native players:** 4.4 and 4.5. Browsers' reports are in 4.1.
- **Downloads and transcoding for download:** with the apps that have them.
- **Device profiles through the signed catalog:** later (ADR 0052).

## Where things stand

- **`/stream` and `/ws`** are reserved in `apps/server/src/http.ts` (ADR 0003): any request to them gets a 404 today.
- **Every file's probe** is in `media_files.media_info` (`packages/media/src/shared/probe.ts`: `MediaInfo`, `VideoInfo` with codec, profile, level, bit depth, HDR and Dolby Vision; `AudioInfo` with channels and layout; `SubtitleInfo`). Sidecar subtitles are `subtitle_files` (ADR 0043).
- **`watch_positions`** (`packages/db/src/schema/media.ts`) exists, read by `packages/media/src/shared/watch.ts` for the client API's Resume. Nothing writes it yet.
- **The client API's reads** are in `packages/media/src/movies/client.ts` and `packages/api-contract/src/library.ts` (items, an item, search).
- **ffmpeg and ffprobe** are in the image (Debian trixie's), and the subtitle sync already runs ffmpeg from a pool worker (ADR 0044). `HIGHSEA_FFMPEG` names another binary.
- **Test media:** `@highsea-tv/media/testing` makes short clips with ffmpeg's lavfi sources: `main` (1080p H.264, 5.1 and stereo, a forced subtitle), `hdr` (1080p HEVC 10-bit, PQ) and `sample`; `makeFeature` makes a longer one. `@highsea-tv/subtitles/testing` has the Sintel fixture and PGS samples.
- **Smart collections' watched and last-played fields** carry `disabled: 'playback'` (`packages/curation/src/collections/index.ts`). (Until 4.1a; on since 4.1a's sign-off.)
- **Events:** the SSE stream carries domain events; `watch.updated` is named in player.md but not yet raised.
- **The prototypes' mock** (`design/prototypes/src/mock/`) has `playback.prefs`, `playback.setPrefs` and `playback.progress`, the first draft of the API below.

## The size of this checkpoint, and its parts

4.1 is the engine every app depends on, and large. It's split into two gated parts, each reviewed with real films ([answer 1](#the-owners-answers)):

- **4.1a, deciding and direct play:** `packages/stream` with device profiles and the decision; stream tokens and `/stream`'s direct play by byte ranges; the play API and live sessions; watch state (positions, played, picks, Continue watching, Next up) and the smart collection rules it switches on; the test page. At its review a browser plays the films it can play as they are.
- **4.1b, HLS:** direct stream (remux) and software transcoding in fragmented-MP4 HLS made on demand, seeking far ahead, the transcode cache and its clean-up, text subtitles as WebVTT, trickplay tiles, and the end-to-end run playing Sintel through the container. At its review a browser plays every film in the library.

## Progress

- **2026-10-27, 4.1b, signed off by the owner on 2026-10-27,** which signs off checkpoint 4.1. The owner played Beetlejuice (HEVC in MKV, transcoded) in `/stream/try` with its SRT subtitles, and seeking worked. Every film in the test library plays in a browser through `/stream/try`: as it is, remuxed, or transcoded. ADRs 0051 and 0052 are now Accepted. Left open: measuring the encoder against real time on the NAS (answer 8) waits for the `0.2.0-beta.1` beta after 4.2 (answer 10), since highsea can't run there before it. What was built:
  - **`@highsea-tv/stream/hls`** (new subpath):
    - `playlist.ts`: the segments and the playlists (RFC 8216: VOD, `#EXT-X-MAP`, version 7). A transcode is cut every 6 s; a direct stream at the first source keyframe 6 s or more after the last.
    - `args.ts`: ffmpeg's and ffprobe's command lines as literal arrays: the runs, the keyframe probe, WebVTT.
    - `runner.ts`: one folder and at most one ffmpeg per session. It runs 30 s ahead and is then paused; a request 18 s past what's made, or before where it started, restarts it there; a minute idle stops it; a failure keeps its log's last lines.
    - ADR 0051's dated section has the flags and why: `-hls_time 0`, `frag_discont`, and the output `-ss` for transcodes.
  - **`@highsea-tv/stream/trickplay`** (new subpath): a frame every 10 s, 320 px wide, in 10 × 10 JPEG sheets, from the keyframes alone, at `nice` 19, moved into place when whole.
  - **The database** (migration 0015): `file_keyframes` (each file's keyframe times, by its size) and `trickplay` (each file's manifest or error, by its size).
  - **The runtime:**
    - `playback.ts`: sessions open a transcode folder and close it when they end; the playlists, segments, init and WebVTT behind each token's access check; the play response's `url` is the multivariant playlist for HLS, and its `subtitles` carry each text track's WebVTT URL (image tracks `null`).
    - `trickplay.ts`: the `media.trickplay` job (newest film first, one at a time, re-queued until none is missing; answer 9), queued after each import and at boot. It prunes orphaned and half-made folders.
    - `runtime.ts`: the cache in `transcodes/`, emptied at boot and on shutdown.
  - **The API:** `PlaySession.subtitles`; `GET /api/v1/items/{type}/{id}/trickplay` and `…/trickplay/{n}.jpg`. `openapi.json` is regenerated.
  - **`/stream`:**
    - `/stream/hls/{token}/`: `main.m3u8`, `video.m3u8`, `init.mp4`, `{n}.m4s`, and `subs/{track}.m3u8|.vtt`;
    - `/stream/subtitles/{token}/{track}.vtt`;
    - a failed run answers 500 "This film didn’t start." and is logged to System › Logs.
  - **The test page** loads hls.js 1.7.3 (a devDependency, Apache-2.0, served from `/stream/try/hls.js`) for HLS, plays Safari's natively, and adds the chosen subtitle as a `<track>`. Its CSP allows `blob:` and `data:` media, which hls.js uses.
  - **Measured** on this Mac (Apple M2 Max), answer 8's settings:

    | What | Time | Against real time |
    | --- | --- | --- |
    | A minute of HEVC 1080p, transcoded to 1080p | 6.0 s | 10× |
    | The same, to 720p | 3.6 s | 16.5× |
    | Trickplay for a 92-minute HEVC 1080p film | 16.7 s (6 sheets, 3.5 MB) | 330× |
    | A seek to 40 minutes in a transcode, to its first frame | 0.75 s | |

  - **Tried in Chromium** with hls.js:
    - Midnight in Paris remuxed to MKV: a direct stream, seeking to 50 minutes.
    - Beetlejuice, HEVC 1080p MKV, on Firefox's profile: a transcode. Its SRT shows both as a `<track>` and as the HLS rendition, with cues on time; "Barbara!" is at 1188.6 s in the WebVTT and in hls.js.
  - **Tests:**
    - `packages/stream/test/hls.test.ts`: command lines as literal arrays; playlists against RFC 8216's rules; segments from keyframes.
    - `hls-ffmpeg.test.ts`, real ffmpeg, skipped without it:
      - runs and restarts on one timeline (`tfdt`), with equal init sections;
      - the init asked for during a restart;
      - a transcode with copied audio starting on time;
      - pausing ahead, and a failure keeping ffmpeg’s last lines;
      - WebVTT and trickplay.
    - `apps/server/test/stream-hls.test.ts`, over HTTP:
      - the playlists, a segment far ahead decoded on the film's timeline, and the rendition and WebVTT;
      - the folder gone when the session ends;
      - "This film didn’t start";
      - trickplay made by the job and served, made again when the file changes, and orphans pruned.
    - The container run's step 7 plays Sintel through `/stream`: the play API, the playlists, the last segment's `tfdt`, the `.en.srt` as WebVTT, and the stream gone with its session.
  - **ADRs:** dated sections for 0051 and 0052 (Proposed until this sign-off).
  - **Checks under Node 26.11.1:**
    - lint (1,283 files), typecheck, 11,577 tests pass (6 skipped, 194 files), smoke;
    - licences (864 packages), the audit (718 packages, nothing high), the docs build;
    - the image built from this checkout (2,091 MB, budget 2,200) and the end-to-end run through it, with step 7;
    - the sweeps clean: 1,624 prototype pages, 171 keyboard walks, the D-pad walk, and the server's admin pages from the production build.
  - **Judgement calls,** in short:
    - Segments are joined from per-keyframe files rather than cut at 6 s by ffmpeg, so every run numbers them the same.
    - `CODECS` is only named when both streams are transcoded.
    - The keyframes are kept in the database by file size.
    - Trickplay records a failure and doesn't retry until the file changes.
    - The transcode encoder was measured on this Mac, not the NAS: highsea can't run there before the beta (answer 10).
    - The test page's copy isn't in i18n.
  - **Found and fixed along the way:**
    - Runs started later wrote fragments from 0 (`frag_discont`).
    - Copied audio in a transcode started at the keyframe before, so subtitles were 3.6 s late (output `-ss` and `-output_ts_offset`).
    - The init asked for during a restart failed (its waiter now follows the new run).
    - The CSP blocked hls.js's `data:` placeholder.
    - Outside the scope: the torrent engine's two-engine test read the tracker's status while the finished torrent's `completed` announce was still in flight, and failed under a full run's load. It now waits for the tracker's answer (`packages/torrent/test/engine.test.ts`; the engine is unchanged).

- **2026-10-27, 4.1a, signed off by the owner on 2026-10-27.** The owner played the copied films in `/stream/try`: the MP4s play directly; Beetlejuice (MKV) and the SRT subtitles wait for 4.1b, as planned, and the page now says so when a subtitle is chosen. At review the owner asked that adding a root folder scan it, and chose the sure-match behaviour below (the change is in this entry). What was built:
  - **`packages/stream`** (new, ADR 0036's subpaths):
    - `profiles`: ADR 0052's shape as zod schemas, and the browsers' built-in profiles (`web-chromium`, `web-chromium-macos`, `web-firefox`, `web-safari`) from MDN's codec and container guides; `ReportedProfile` and `withReport` lay a browser's report over its base.
    - `decision`: the pure decision, with reasons as i18n keys, tested over every built-in profile and kind of file.
    - `sessions`: live play sessions in memory, their tokens (an HMAC over the session, person and file, with a key made at boot, compared in constant time), 6 hours renewed by each report (answer 4), ended when left, after 5 idle minutes, or when access goes.
  - **The database** (migration 0014): `watch_history`, `playback_prefs` and `device_profiles` (`packages/db/src/schema/playback.ts`).
  - **Watch state** (ADR 0054): `createWatch` in `@highsea-tv/media/shared` and `movies.playback`: positions, watched past 90% (answer 3) once per viewing, played and unplayed, the player's picks, and Next up. Each change raises `watch.updated` to the person alone. The client API's items carry `watched`, and each version its audio tracks and detail line.
  - **The runtime's playback** (`packages/runtime/src/playback.ts`): the source, the picks, the profile (the device's report over its base), home or away (a private address after trusted proxies; away, the remote ceiling's default, 8 Mbps at 1080p), the decision and the session. Signing a device out or losing the library ends its sessions at once.
  - **The API** (`packages/api-contract/src/playback.ts`, `apps/server/src/api/playback.ts`): play, progress, stop, the device's report, picks, played and unplayed, the item's progress, and Next up. `openapi.json` is regenerated.
  - **`/stream`** (`apps/server/src/stream/`, ADR 0003's 2026-10-27 section): `GET`/`HEAD /stream/files/{token}` by byte ranges, and the test page `/stream/try` with `HIGHSEA_PLAYBACK_TRY=1` (answer 2), which lists the films, plays them, reports, saves picks, marks watched, and shows the decision, its reasons and Next up.
  - **"Playable"** is now a version with a file, for the client API, curation and smart collections; whether it can be read is checked at play and at each request.
  - **Smart collections' watch rules** (ADR 0049's 2026-10-27 section): `watched` and `lastPlayed` are on, for whoever reads the collection.
  - **Tests:** the decision matrix and sessions in `packages/stream`; watch state in `packages/media`; the SQL rules in `packages/runtime`; the service's reader in `packages/curation`; and over the real HTTP server, the decision, byte ranges (`206`, a suffix, `416`, `If-Range`, `HEAD`, `405`), tokens (another file, a changed signature, an ended session, a signed-out device, a library taken away), positions, watched at 90%, played and unplayed, picks and Next up (`apps/server/test/playback-api.test.ts`, `ranges.test.ts`). Writing them found that a range starting exactly at the end of the file was sent whole rather than refused with `416`; fixed.
  - **ADRs:** 0054 (watch state), new; dated sections for 0003 and 0049. 0051 and 0052 stay Proposed until 4.1b's sign-off.
  - **Checks under Node 26.11.1:** lint (1,274 files), typecheck, 11,543 tests pass (6 skipped), smoke, licences (863 packages), the audit (718 packages, nothing high), the docs build, and the sweeps clean (1,624 prototype pages, 171 keyboard walks, the D-pad walk, and the server's admin pages from the production build).
  - **Judgement calls,** in short: routes take `{type}/{id}`; tokens live with the sessions under a key made at boot; home is a private address after trusted proxies; the remote ceiling is fixed until 4.3; play count isn't a rule field; the admin's preview answers watch rules for the admin and its counts for no one; Mark as unwatched clears the play count; HLS decisions return no URL until 4.1b; the test page's copy isn't in i18n.
  - **Changed at review (the owner, 2026-10-27):** adding a root folder scans it, and the library scan adds the new folders it can match surely (a TMDB or IMDb id in the name, or TMDB's title and year exactly) in place; the rest wait for Library import, counted on the root folder's row in Settings › Media management (`RootFolder.waiting`). The same happens when a new folder appears later, by the 12-hourly scan or the watcher. ADR 0039's 2026-10-27 section; `addNew` in `packages/media/src/movies/library-import.ts`, the scan's new folders in `scan.ts`; the guides' Root folders and Manual import pages. Found when the owner's test folder showed no movies: the scan only looked at films already in the library.

## Device profiles and the decision (4.1a)

`packages/stream`, new, framework-free like the other domains, with subpaths per ADR 0036:

- `@highsea-tv/stream/profiles`: ADR 0052's shape as zod schemas, and the built-in profiles. 4.1 writes the browsers' profiles (Chromium, Firefox and Safari, by engine and OS where they differ) from each engine's own documentation of the codecs and containers it plays. The desktop webviews', Apple's and Android's are written with their apps, from their platforms' documentation.
- `@highsea-tv/stream/decision`: a pure function of a version's `MediaInfo`, the person's picks (audio, subtitles), the profile, and the bitrate ceiling. It returns direct play, direct stream or transcode, what's copied and what's made again for each stream, and the reasons, as i18n message keys with their facts (ADR 0031's style).
- **Reported profiles from browsers:** the client sends what `MediaSource.isTypeSupported()` and `MediaCapabilities.decodingInfo()` say ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo)). The server keeps the latest per device, with its date (a `device_profiles` table), and narrows or widens the built-in profile with it.
- **Tests:** a matrix of every built-in profile against every clip, each with its expected decision and reasons, as exit criterion 2 asks. No device and no ffmpeg needed.

## Stream tokens and direct play (4.1a)

- **Tokens:** `/stream` takes a short-lived token in its path, since a `<video>` element can't send headers. The token is an HMAC over the person, the play session, the file and its expiry, with the server's secret, as the calendar feed's key is (ADR 0045). Its lifetime is [answer 4](#the-owners-answers). Ending a session, or an admin taking away the library, makes its tokens fail at once. Tokens are left out of the logs, the same way the API's secrets are.
- **Direct play:** `GET /stream/files/{token}` serves the file with `Range` and `206 Partial Content`, `If-Range`, and `416` where the range is outside it ([RFC 9110 § 14](https://www.rfc-editor.org/rfc/rfc9110#section-14)). It also sets `Accept-Ranges` and the file's type. It streams from the file with Node's `fs.createReadStream` and its `start` and `end` ([Node's docs](https://nodejs.org/api/fs.html#fscreatereadstreampath-options)), and never holds the file in memory.
- **The route** lives in `apps/server/src/stream/`. `http.ts` hands `/stream/` to it, as it hands `/api` to Hono, and ADR 0003 gets a dated section. `/ws` stays reserved.

## The play API and live sessions (4.1a)

Declared in `@highsea-tv/api-contract` (a new `playback.ts`) and implemented in `apps/server/src/api/`, with `openapi.json` and the SDK regenerated:

- `POST /api/v1/items/{id}/play`: the device's profile (or its id, for a built-in one), the version, audio and subtitle picks, and where to start. It returns the play session's id, the decision with its reasons, and what to load: the file's URL for direct play, or the multivariant playlist's for HLS (4.1b). Libraries the person can't see answer 404, as the reads do.
- `POST /api/v1/playback/sessions/{id}/progress`: the position, paused or playing. This is player.md's `POST /api/v1/items/{id}/progress`, tied to the session so the server knows which stream it is; the item's route stays as a thin alias for clients that only save a position.
- `DELETE /api/v1/playback/sessions/{id}`: leaving the player. It ends the session, its tokens and (4.1b) its ffmpeg.
- `PUT /api/v1/devices/current/profile`: a browser's reported profile.
- **Live sessions** are the runtime's, in memory: who, which device, title and version, the decision with its reasons, bitrate and position, and when it was last heard from. A session nobody reports on for a few minutes ends by itself. 4.3's Now playing reads them. Stop and its message come with Now playing.
- **"Playable"** (ADR 0048, 0049): an item is playable for a person when they can see its library and it has a file the server can read. A transcode can always be made, so a codec no longer makes something unplayable. Curation's "playable" and the smart collections' rule switch to this.

## Watch state (4.1a)

- **Positions:** progress reports write `watch_positions`, at most every few seconds per session, and raise `watch.updated` on the SSE stream, so another device's Resume and Continue watching move at once.
- **Played and unplayed:** a new `watch_history` per person and item: played (yes or no), the play count, and the last time played. A film counts as watched when the position passes 90% ([answer 3](#the-owners-answers)); its position is then cleared, so it isn't resumed. `POST` and `DELETE /api/v1/items/{id}/played` are client-detail's Mark as watched and unwatched (answer 9 in 4.0).
- **The player's picks:** `GET|PUT /api/v1/items/{id}/prefs`, per person and title: version, audio, subtitles and the subtitle offset (player.md › Data). A device class's default version (answer 9 in Phase 4) is a preference in layers (ADR 0027); a pick on the title wins.
- **Continue watching:** started and not watched, most recent first, from the positions.
- **Next up:** `GET /api/v1/items/{id}/next`, the next film in the title's collection by release date, unwatched first (answer 9 in Phase 4). The countdown is the client's.
- **Smart collections:** the watched, play count and last-played fields lose `disabled: 'playback'`, and `collection-query.ts` reads them from `watch_history`.

## Trying it at the review (4.1a and 4.1b)

There's no client before 4.2, so the reviews use a **test page** on the server, `/stream/try`, available only when `HIGHSEA_PLAYBACK_TRY=1` is set ([answer 2](#the-owners-answers)). It lists the library, plays a film in a plain `<video>` (with hls.js in 4.1b, pinned under the dependency rules), and shows the decision and its reasons, the position being saved, and the picks. It's for review and debugging, not a product screen, so it has no prototype and is never in the image's defaults.

The films are real ones from the owner's library, read only ([answer 5](#the-owners-answers)).

## HLS: direct stream and transcoding (4.1b)

Following ADR 0051:

- **Playlists:** a multivariant playlist with one variant, and a media playlist that lists every segment from the start (`#EXT-X-PLAYLIST-TYPE:VOD`, `#EXT-X-ENDLIST`), in fragmented MP4 with `#EXT-X-MAP` and `#EXT-X-VERSION:7` ([RFC 8216](https://www.rfc-editor.org/rfc/rfc8216) § 4.3.2.5, § 4.3.3.5). One variant per session, chosen from the profile and the ceiling, is [answer 7](#the-owners-answers).
- **Segments:** 6 seconds, as [Apple's HLS authoring specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices) recommends, with a keyframe at each segment's start.
  - **A transcode** forces keyframes every 6 s (`-force_key_frames`; [ffmpeg's docs](https://ffmpeg.org/ffmpeg.html#Advanced-Video-options)), so every segment's length is known before it's made.
  - **A direct stream** copies the video, so its segments start at the source's own keyframes. The playlist is written from the keyframes' times, read once with ffprobe and kept with the file's facts.
- **On demand:** ffmpeg runs as a child process with its HLS muxer (`-hls_segment_type fmp4`; [ffmpeg-formats › hls](https://ffmpeg.org/ffmpeg-formats.html#hls-2)), a few segments ahead of the last one asked for. A request far ahead, or behind what's been made, restarts ffmpeg at that segment's start. A session that's idle stops its ffmpeg, and it starts again where it's asked to.
- **Software transcoding:** H.264 video with libx264 at a capped bitrate (`-maxrate` and `-bufsize`), from the source's size or smaller under the ceiling; AAC audio, stereo, or 5.1 where the profile takes it. A preset and quality are chosen from [x264's and ffmpeg's H.264 guide](https://trac.ffmpeg.org/wiki/Encode/H.264), measured on the owner's NAS (exit criterion 3; [answer 8](#the-owners-answers)).
- **The cache:** segments under the data folder's `transcodes/`, one folder per session, removed when the session ends, and on boot for any left behind. 4.3 adds its size limit and the setting.
- **Errors:** ffmpeg's exit and the last lines of its log go to System › Logs. The client gets "This film didn't start" (player.md), and the session records why.

## Subtitles (4.1b)

- **Text tracks,** embedded or sidecar (SRT, ASS and WebVTT), are served as WebVTT: `GET /stream/subtitles/{token}/{track}.vtt`, converted by ffmpeg once and cached with the film's session. ASS loses its styling as WebVTT. Burning in styled ASS is 4.3's.
- **For HLS,** they're also in the multivariant playlist as a subtitle rendition, so Apple's native players show them ([RFC 8216 § 4.3.4.1](https://www.rfc-editor.org/rfc/rfc8216#section-4.3.4.1)).
- **Image tracks** (PGS and VobSub) can't be sent as text. Until 4.3 burns them in, the play API lists them as not available yet, with the reason, and the test page shows it.
- **The offset** is the client's (player.md), so changing it never restarts a stream.

## Trickplay (4.1b)

- **Tiles:** a frame every 10 s, 320 px wide, in sheets of 10 × 10 JPEGs, made with ffmpeg's `fps`, `scale` and `tile` filters ([ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html#tile)). Those are Jellyfin's defaults, which suit a scrubber's preview at both TV and phone sizes.
- **The routes:** `GET /api/v1/items/{id}/trickplay` (the interval, the tile size and the sheets) and `GET /api/v1/items/{id}/trickplay/{n}.jpg` (player.md › Data).
- **When they're made:** a `media.trickplay` job after import and on replacement, safe to repeat (ADR 0022), one at a time at low priority. For films already in the library, see [answer 9](#the-owners-answers).
- **Where they're kept:** the data folder, never beside the film, and outside the cache's limit (playback-settings.md).

## Tests and checks (4.1a and 4.1b)

- **`packages/stream`:**
  - the decision matrix, over every built-in profile and clip;
  - ffmpeg's command lines for direct stream and transcode, as snapshots;
  - playlists checked against RFC 8216's rules;
  - real ffmpeg on ADR 0040's clips where it's present, skipping and saying so where it isn't, as ADR 0044's tests do.
- **The server:** byte ranges (`206`, `416`, `If-Range`), tokens (expired, the wrong file, an ended session, a library the person can't see), progress and played, picks, Next up, and the smart collection rules on watch state.
- **The end-to-end run** through the container plays Sintel through `/stream` at the end of its path (4.1b): the play API, the playlist, a segment far ahead, and the subtitle track.
- The full checks under Node 26.11, and the sweeps. The test page isn't swept, since it isn't a product screen.

## ADRs

- [0051](../adr/0051-playback-engine.md) and [0052](../adr/0052-device-profiles.md) become **Accepted** at 4.1b's sign-off, each with a dated section for what building them settled: the segment length, the token's lifetime, when a film counts as watched, the browsers' profiles, and one variant per session.
- [0003](../adr/0003-server-runtime-custom-entry.md) gets a dated section: `/stream` is served, and `/ws` stays reserved.
- [0049](../adr/0049-smart-collections.md) gets a dated section: the watched and last-played rules are on.
- **0054, watch state:** positions, played and the play count, when a film counts as watched, picks per person and title, and how they reach other devices. New, since no ADR records watch state yet.

## Risks

- **Direct stream's playlists depend on keyframes.** A file with sparse or irregular keyframes makes uneven segments. Reading them takes a pass over the file the first time, which on a NAS over the network may take some seconds. The keyframes are kept, so it's once per file.
- **Seeking far ahead in a transcode** waits for ffmpeg to restart and make a segment. On a NAS's processor that may be longer than a viewer expects. 4.1b measures it on the owner's NAS and sets the target exit criterion 3 asks for.
- **4K HDR films in software.** Transcoding 4K HEVC on a processor may not keep up in real time, and without tone mapping an HDR film made into SDR looks washed out. That's why 4.3 exists. [Question 6](#open-questions-for-the-owner) asks whether software tone mapping comes forward.
- **Browsers differ** in what they play, by version and OS. A wrong built-in profile shows as a needless transcode, or a film that doesn't start. Reported profiles correct the first.
- **Tokens in URLs** can end up in proxies' logs. They're short-lived and scoped to one session and file.
- **Debian trixie's ffmpeg** decides the HLS muxer's options and the filters. 4.1 relies only on what its documentation lists for that version.

## Open questions for the owner

1. **The parts.**
   - **Recommended:** two gated parts, 4.1a (deciding, direct play and watch state) and 4.1b (HLS, subtitles and trickplay), each reviewed with real films.
   - Or: one checkpoint, reviewed once. Fewer stops, but a longer wait before you see a film play.
2. **How to try it before the web client.**
   - **Recommended:** a plain test page on the server, `/stream/try`, on only with `HIGHSEA_PLAYBACK_TRY=1`. It shows each decision and its reasons. It isn't a product screen, so it needs no prototype.
   - Or: Play on the admin's movie page. It's nearer to real use, but it's a change to a locked screen, and it needs a prototype first.
   - Or: no page. The tests and `curl` show it works, but you can't watch anything until 4.2.
3. **When a film counts as watched.**
   - **Recommended:** at 90% of its length, as Plex and Jellyfin do by default. The position is then cleared, so the film isn't resumed during its credits.
   - Or: when the credits start. That's more exact, but it needs credits detection, which Phase 4 leaves out.
4. **How long a stream token lasts.**
   - **Recommended:** 6 hours, renewed with each progress report, and ended with its session. A long film paused for dinner still plays, and a leaked link soon dies.
   - Or: 24 hours, not renewed. Simpler, but a leaked link works for a day.
5. **Real films at the reviews.**
   - **Recommended:** the dev server with a library folder of a few films copied from the NAS to this Mac: one H.264 MP4, one HEVC MKV, one 4K HDR, one with PGS subtitles and one with DTS or TrueHD. The NAS is never written to, because nothing on it is touched.
   - Or: the NAS's `media/` folder as a library, scanned in place. That tries far more films, but the existing-library import and its jobs would have to be shown never to write there first: renaming, NFOs, artwork and subtitles all write beside the film.
6. **HDR films before 4.3.**
   - **Recommended:** keep tone mapping in 4.3, as planned. Until then, an HDR film played on a device that can't show HDR is transcoded without it, and looks washed out, which the decision's reasons say. 4.3 does it on the GPU, where it keeps up.
   - Or: software tone mapping in 4.1b (`zscale` and `tonemap`). HDR films look right at once, but at 4K a processor is unlikely to keep up in real time.
7. **Variants in a transcode.**
   - **Recommended:** one variant per session, picked from the device's profile and the remote ceiling, as Jellyfin does. A change of quality restarts the stream at the same place.
   - Or: several variants for adaptive bitrate. The player switches by itself as the connection changes, but each variant costs a transcode of its own.
8. **The software encoder's settings.**
   - **Recommended:** libx264's `veryfast` preset, capped at the profile's or the ceiling's bitrate, then checked against real time on your NAS at 1080p, as exit criterion 3 asks. Faster presets give worse pictures at the same bitrate; slower ones may not keep up.
   - Or: decide only from the measurement on your NAS, trying presets from `ultrafast` to `medium`.
9. **Trickplay for films already in the library.**
   - **Recommended:** made one film at a time, in the background at low priority, after new imports, until the whole library has them. It costs some hours of processor time once.
   - Or: only for films imported from now on, and others when they're first played. No background work, but older films' scrubbers have no previews at first.
10. **When you can run it on your NAS.**
    - **Recommended:** a beta release (`0.2.0-beta.1`, ADR 0050's beta channel) after 4.2's sign-off, when the web client can play. Nothing is published after 4.1, since there's nothing to watch with yet.
    - Or: a beta after 4.1b, to try the test page on the NAS itself. It's earlier, but the test page would have to ship, switched off, in a published image.

## The owner's answers

On 2026-10-27 the owner took every recommendation for questions 1 to 10.

1. **The parts:** two gated parts, 4.1a (deciding, direct play and watch state) and 4.1b (HLS, subtitles and trickplay), each reviewed with real films.
2. **Trying it:** the test page `/stream/try`, on only with `HIGHSEA_PLAYBACK_TRY=1`; no prototype, since it isn't a product screen.
3. **Watched:** at 90% of the film's length, when the position is cleared.
4. **Stream tokens:** 6 hours, renewed with each progress report, and ended with their session.
5. **Films for the reviews:** a few copied from the NAS to a library folder on this Mac (H.264 MP4, HEVC MKV, 4K HDR, PGS subtitles, DTS or TrueHD); nothing on the NAS is written to.
6. **HDR:** tone mapping stays in 4.3; until then the decision's reasons say an HDR film made into SDR looks washed out.
7. **Variants:** one per session, from the device's profile and the remote ceiling; a change of quality restarts the stream at the same place.
8. **The encoder:** libx264 `veryfast`, capped at the profile's or ceiling's bitrate, then measured against real time on the NAS at 1080p.
9. **Trickplay for the existing library:** made one film at a time in the background at low priority, after new imports, until every film has it.
10. **The NAS:** a beta, `0.2.0-beta.1`, after 4.2's sign-off; nothing is published after 4.1.
