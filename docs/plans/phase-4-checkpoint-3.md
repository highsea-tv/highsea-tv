# Phase 4, checkpoint 4.3: playback for real homes

- **Status:** Scoped on 2026-10-28 and approved with [the owner's answers](#the-owners-answers) of 2026-10-28 (every recommendation but question 3: AMD tone maps on its GPU, with the image's budget raised to 2,300 MB). 4.3a is next.
- **Parent plan:** [phase-4-clients.md › Order of work](phase-4-clients.md#order-of-work-and-checkpoints), 4.3.
- **Gate:** 4.2 was signed off on 2026-10-28, so the web player plays every film in the library, with the processor doing any transcoding.

## Read first

1. The parent plan: Standing rules, [Playback on the server](phase-4-clients.md#playback-on-the-server), [Sessions](phase-4-clients.md#sessions), exit criterion 3, Risks, and The owner's answers (4 and 10 above all).
2. The ADRs it builds on: [0051](../adr/0051-playback-engine.md) (the playback engine, with its 2026-10-27 section on how ffmpeg is run, the encoder and the cache), [0052](../adr/0052-device-profiles.md) (device profiles and the decision's reasons), [0003](../adr/0003-server-runtime-custom-entry.md) (the image, and ffmpeg as a child process), [0022](../adr/0022-job-queue.md) (jobs safe to repeat), [0046](../adr/0046-notifications.md) (the event catalogue) and [0054](../adr/0054-watch-state.md) (what counts as watched).
3. [phase-4-checkpoint-1.md](phase-4-checkpoint-1.md): its Progress entries, the answers on HDR (6), the encoder (8) and the NAS (10), and what it left for 4.3.
4. The specs, each with its prototype from 4.0b: [playback-settings.md](../product/playback-settings.md) (`#/admin/settings/playback`), [now-playing.md](../product/now-playing.md) (`#/admin/now-playing` and the dashboard's widget), and [player.md › The stream's states](../product/player.md#the-streams-states-checkpoint-40b) for Stopped.
5. The code: `packages/stream/src/hls/args.ts` (ffmpeg's command lines), `hls/runner.ts` (runs, throttling and the cache), `decision/` (the decision and its reasons), `packages/runtime/src/playback.ts` (sessions, the remote ceiling, `REMOTE_CEILING`), and `apps/web/src/player.tsx` (the Stopped state, built and waiting).

## Goal

highsea plays well in a real home. On a NAS or a mini PC with an Intel or AMD chip, or with an NVIDIA card, transcodes run on the graphics chip, which highsea finds and checks with a real transcode. Where there's none, the processor carries on, and Settings › Playback says what's missing and how to pass the chip to the container. HDR films sent to a screen that can't show HDR are tone mapped, picture subtitles and styled ASS are burned in, and 5.1 sound made into stereo keeps the dialogue clear. The owner sets how many transcodes run at once, what's sent away from home, and the cache's folder and size. Now playing and its widget show who is watching what and why it's sent that way, with 30 days of history, and the owner can stop a stream with a message that the player shows.

## Out of scope

- **Downloads made for a device** (C8's Downloads): they come with the desktop app (4.4) and the mobile app (4.6). Now playing's download rows and **Cancel** are built then. Until then it shows streams only.
- **AMF on Windows, Rockchip's RKMPP and Vulkan video encoding:** later, as answer 4 decided.
- **Choosing among several GPUs:** highsea uses the first render node, as the spec's open question leaves it, until someone has two to test with.
- **A graph of bandwidth over time, stats and newsletters:** after 1.0 (answer 10, and now-playing.md's open question).
- **Quality choices in the clients** ("People can choose less in their apps"): the play API already takes a lower ceiling from the client. A picker in the player needs a prototype, so it waits for the native apps' scopes unless the owner moves it.
- **Running highsea on macOS outside Docker as a supported install:** it waits until after 1.0, scoped on its own ([answer 4](#the-owners-answers)). VideoToolbox is built and checked outside Docker on this Mac, as development runs.

## Where things stand

- **Playback** (4.1, ADR 0051): `@highsea-tv/stream`'s decision gives direct play, direct stream or transcode with reasons in words; HLS in fragmented MP4 is made on demand by ffmpeg in a child process, 30 s ahead of the player, then paused with `SIGSTOP` (`hls/runner.ts`); the encoder is libx264 `veryfast` with AAC; each session's segments live in the data folder's `transcodes/<session>/`, removed when the session ends and at boot.
- **HDR made into SDR** is only relabelled BT.709, and looks washed out; the reason says so (4.1's answer 6). **Image subtitles** (PGS, VobSub) have no URL, and the web player's panel says "This subtitle is a picture, which a browser can't show yet." **Stereo from 5.1** is ffmpeg's default `-ac 2`.
- **Live sessions** are the runtime's, in memory (`packages/stream/src/sessions`, `packages/runtime/src/playback.ts`): who, device, title, version, the decision, position and when last heard from. Nothing is kept after a session ends, apart from the watch state.
- **The remote ceiling** is fixed at 8 Mbps · 1080p (`REMOTE_CEILING`) for anyone away from home.
- **The player's Stopped state** is built and tested in `apps/web`, waiting for a stop to arrive over SSE.
- **The prototypes** (approved at 4.0b): Settings › Playback with its mock `transcoding` API (`src/mock/playback.ts`), Now playing with its two tabs, the Stop dialog and the widget (`src/admin/now-playing/`, `src/mock/sessions.ts`, `src/admin/dashboard/widgets.tsx`), and the sidebar's count.
- **The image's ffmpeg** is Debian trixie's 7.1.5 (`ffmpeg` in the Dockerfile's runtime stage). Asked on 2026-10-28, the amd64 build already has every encoder and filter this checkpoint needs: `h264_vaapi`, `hevc_vaapi`, `h264_qsv` (Debian's rules turn on libvpl for amd64 only), `h264_nvenc` (loaded from the driver at run time), `tonemap_vaapi`, `vpp_qsv`, `scale_cuda`, `overlay_vaapi`, `overlay_cuda`, `libplacebo`, `tonemap_opencl` and the processor's `zscale` and `tonemap`. What it lacks is the drivers: the image has no VA driver and no QSV runtime.
- **The image** is 2,093 MB against its 2,200 MB budget, which 4.3b raises to 2,300 MB for the drivers ([answer 3](#the-owners-answers)).
- **The owner's NAS** is the Synology DS1520+ that 9a's Synology guide was followed on: an Intel Celeron J4125 (Gemini Lake Refresh, UHD Graphics 600, Gen9.5). The real-time measurement on it, left open in 4.1, still waits.

## The size of this checkpoint, and its parts

Two gated parts ([answer 1](#the-owners-answers)). The first needs nothing beyond this Mac. The second needs the hardware.

- **4.3a, sessions and settings:** first, the panel's line for a burned-in subtitle prototyped in C5 for approval; then Settings › Playback without its hardware section (transcodes at once, the encoder, away from home, the cache's folder, limit and Clear); the transcode limit and the cache's limit; burned-in subtitles and the better downmix, on the processor; Now playing, its widget, the sidebar's count, 30 days of history, and Stop with a message reaching the player; the playback notification event; the guides for both pages. At its review the owner watches on `/web` while Now playing shows the stream and its reasons, stops it with a message, plays a film with PGS subtitles, and fills the cache past a small limit.
- **4.3b, hardware acceleration:** detection, the checks, and transcoding through VAAPI, QSV, NVENC and VideoToolbox; tone mapping; the drivers in the image; Settings › Playback's hardware section; the compose lines, the NAS templates and the install guides; the checks on real hardware and the real-time measurement on the NAS; ADR 0056; and `0.2.0-beta.2`'s release commit, published only on the owner's word after the sign-off ([answer 8](#the-owners-answers)). At its review the owner plays an HDR film on the NAS's GPU and reads the measurements in the report.

## Progress

- **2026-10-28, 4.3a, signed off by the owner on 2026-10-28,** with the C5 line approved as prototyped and Now playing leading the dashboard's first arrangement at 2 × 4:
  - **C5's line for a burned-in subtitle,** prototyped in `design/prototypes/src/web/player.tsx` (and the TV's tracks panel) and sent to the owner. The web player was built to it before the approval came, so the line can still change at review.
  - **Settings › Playback** without its hardware section (`apps/server/src/admin/playback.tsx`, `packages/runtime/src/playback-settings.ts`): transcodes at once, the encoder, the most sent away from home, and the cache's folder, limit and Clear; `GET /api/v1/playback/status`, `DELETE /api/v1/playback/cache` and `playback.updated`.
  - **The limits** in `packages/stream/src/hls/runner.ts`: transcode slots that wait a minute and then fail with their own line in the player; the cache's limit, removing the pieces furthest behind the players first.
  - **Burn-in and the downmix** (`args.ts`): picture tracks through `overlay`, styled ASS through libass with the film's fonts; RFC 7845's stereo matrices through `pan`. The decision says why (ADR 0052's dated section), and the web player lists burned-in tracks with the timing line in place of the controls.
  - **Now playing** (`apps/server/src/admin/now-playing.tsx`), its widget, the sidebar's count and the palette's keywords; `GET /api/v1/sessions`, `…/history` and `POST …/{id}/stop`; `playback_history` with the daily `playback.prune` job; Stop reaching the player through `playback.stopped` and the 404's details.
  - **Playback started,** off for every connection until ticked (ADR 0046's dated section).
  - **The guides** `now-playing.mdx` and `settings/playback.mdx` with their screenshots, and the rows they add to events, tasks and the dashboard's guide.
  - **Tests:** the playback run burns in a PGS track made by `pgsBox` (now `@highsea-tv/stream/testing`) and stops Sintel with a message, in Chromium and Firefox; the end-to-end run's step 8 finds Sintel on Now playing; the server sweep covers Now playing's states and `compare.ts` both pages.
  - **ADRs:** dated sections in 0046, 0051 and 0052.
  - **Checks under Node 26.11.1:** lint (1,337 files), typecheck, 11,712 tests pass (7 skipped, 0 failed, 204 files), smoke, licences (864 packages), audit (719 packages, no advisories), the docs build, the sweeps (1,624 prototype pages, 171 keyboard walks, the D-pad, the server's admin pages), the playback run in Chromium and Firefox, and the end-to-end run through `highsea:dev` (2,095 MB against 2,200 MB).
  - **Found and fixed along the way:** `openapi.json` was stale after the new event; the server sweep's passes run 12 at once, so Now playing waits for the first Sintel row; the second browser in the playback run starts Elephants Dream with the subtitle the first chose, which the server remembers; the end-to-end run's step 8 brings the player's hidden controls back before choosing Back.
  - Judgement calls, in short: the downmix keeps the LFE, as RFC 7845 does; the cache's default shown as `/config/transcodes`; a cache folder inside a root or downloads folder is refused; hls.js waits 75 s for a segment so the limit's 503 reaches it, while Safari shows the general failure; the speed is measured by highsea, not taken from ffmpeg's `speed=`; Waiting has a line and a link, and an unmeasured speed shows "starting"; a title gone from the library isn't linked; history joins restarts within 2 minutes and leaves out sessions that played nothing, and Playback started isn't sent for those restarts; the counts leave out stopped rows; the prototype's widget registry is now the package's.
  - **The owner's decisions at review (2026-10-28):** the C5 line for a burned-in subtitle is approved as prototyped; Now playing leads the owner's and admins' first arrangement (`ownerDefault` in `@highsea-tv/personalization/widgets`), placed 2 × 4 there so Network, Storage and Indexers fill its side and the grid has no gap (at its own 2 × 3 a cell beside Subtitles stayed empty); saved layouts keep their own order, and the dashboard's guide and screenshots show it first. In the checks after that change, `hls-ffmpeg.test.ts`'s copied-sound test failed once in the full run (the sound's decode time missing from piece 2) and passed in 8 runs on its own, 5 of them with the processor saturated; its cause isn't found yet, so nothing was changed for it.
- **2026-10-28, 4.3b started.** Asked at its start (answer 5): the owner has no NVIDIA or AMD machine, so NVENC and AMD are built with their command lines tested as snapshots, stay off unless their check passes on an owner's own host, and the report says they weren't checked on real hardware. The DS1520+ is reached as on 2026-10-22, through DSM's Container Manager in the browser with the owner signing in, and the project, image and test folder are deleted afterwards.
- **2026-10-28, 4.3b, signed off by the owner on 2026-10-28,** with the review's decisions and change below, so checkpoint 4.3 is signed off. At the same review the owner asked for installing to need no configuration, scoped in [install-simplicity.md](install-simplicity.md) and approved as checkpoint 4.3c:
  - **Hardware acceleration** (`@highsea-tv/stream/hardware`, the runtime's `hardware.ts`, ADR 0056): VAAPI, Intel Quick Sync, NVENC and VideoToolbox, detected from what ffmpeg reports, each used only after its check on this host passes; Automatic takes the first that passed. Each path's command line in `hls/args.ts` decodes, scales and encodes on the device, with 4.1's keyframes every 6 s; tone mapping on the chip (`tonemap_vaapi`, `vpp_qsv`, `libplacebo`, `scale_vt`) and on the processor (`zscale` and `tonemap`); a run that fails on the chip goes on on the processor from the segment it reached, with a reason, and the path's check is marked failed.
  - **Settings › Playback's hardware section** and its routes, the check's results and why a path can't be used, in the screen's words; the guide's hardware section and screenshot.
  - **The image:** Intel's non-free media driver, oneVPL's runtime, and Mesa's VA and Vulkan drivers on amd64 (ADR 0003's dated section, `docker/NOTICE`); the entrypoint joins the PUID user to the render node's group and switches with `setpriv --init-groups`; `bun scripts/image.ts hardware` checks the encoders, filters and drivers. **2,287 MB against the 2,300 MB budget.**
  - **Passing the chip in:** the lines in `compose.yaml`, `compose.bridge.yaml` and the TrueNAS and Synology files, commented out, `/dev/dri` as an optional device in Unraid's template, and the guide `install/hardware-acceleration.mdx`.
  - **Checked on real hardware:**
    - **VideoToolbox** on this Mac (M2 Max), outside Docker: its check passed at 166 frames a second.
    - **VAAPI on the DS1520+** (J4125, Intel iHD 25.2.3, `/dev/dri/renderD128`, owned by group 937, which the node process joined as uid 1026): its check passed at 134 frames a second, decoding 10-bit HEVC and tone mapping on the chip, without low power.
    - **Quick Sync on the DS1520+** failed with `MFX_ERR_NOT_FOUND` (-9): oneVPL's GPU runtime starts at Tiger Lake ([vpl-gpu-rt](https://github.com/intel/vpl-gpu-rt)), and Media SDK's runtime for older chips (`libmfx1`) isn't in trixie. The check now says so in its own line and points to VAAPI, and Automatic chose VAAPI.
    - **NVENC and AMD** weren't checked on real hardware (answer 5): their command lines are snapshot tests, and they stay off unless their check passes on an owner's host.
  - **Measured on the DS1520+,** with highsea's own command lines (balanced, 60 s of film from 10 minutes in, stereo AAC), the films mounted read only, and the owner's Emby and Jellyfin running beside it:

    | Run | Time for 60 s | Against real time |
    | --- | --- | --- |
    | Beanpole, 1080p H.264, to 1080p on VAAPI | 11.05 s | 5.4× |
    | Beanpole to 720p on VAAPI | 6.19 s | 9.7× |
    | Iron Man 2, 4K HEVC 10-bit HDR10, to 1080p on VAAPI, tone mapped on the chip | 17.51 s | 3.4× |
    | Iron Man 2 to 720p on VAAPI | 13.31 s | 4.5× |
    | Beanpole to 1080p on the processor | 50.69 s | 1.18× |
    | Iron Man 2 to 1080p on the processor, tone mapped | 113.26 s | 0.53× |

    A seek to 100 minutes, to the first piece: 1.43 s (Beanpole) and 2.56 s (Iron Man 2) on VAAPI, inside the 3 s target; 5.16 s and 15.93 s on the processor, against 5 s. The 4K HDR output was H.264 High 4.1, 1920 × 818, with BT.709 transfer and primaries.
  - **Checks under Node 26.11.1:** lint (1,342 files), typecheck, 11,763 tests pass (8 skipped, 0 failed, 206 files; after the owner's change at review), smoke, licences (864 packages), audit (no advisories), the docs build, the prototypes' admin sweeps (928 pages, 116 keyboard walks; the pages again after the change), the server sweep (again after the change), the release check for `0.2.0-beta.2`, and `bun scripts/image.ts hardware` on `highsea:amd64`. Not run again for 4.3b: the playback run in Chromium and Firefox, and the end-to-end run through the image.
  - **`0.2.0-beta.2` is prepared** (`bun scripts/release.ts prepare 0.2.0-beta.2`, and its check passes; prepared again after the review's change, with the first changelog note split to stay within System › Updates' 300 characters), not committed or published; it waits for the owner's word after the sign-off (answer 8).
  - **The NAS was left as found:** the test project, the image and `/docker/highsea-test` are deleted, and only the owner's own projects and `/docker/acme` remain.
  - Judgement calls, in short: the check's clip is made the first time a check runs, not at boot; `setpriv --init-groups` in the entrypoint instead of `group_add`, which reaches only the container's first process; the screen's link for passing the chip in goes to the install guide; picture subtitles are drawn on the processor (download, overlay, upload) on every path; the NAS run was ffmpeg with highsea's command lines and the check through the admin, not a film played in the web player, since setup's TMDB step was skipped on the test server.
  - **The owner's decisions at review (2026-10-28):** every recommendation taken: `CopyBlock`'s focus is approved; Quick Sync before Tiger Lake stays as built, with VAAPI doing the work; the processor's seek target stays at 5 s for 1080p, and 4K HDR needs a graphics chip. **The owner's change:** detecting, checking and choosing the hardware happen by themselves, in the background, as part of installing, with Settings › Playback left for changing them. Built the same day: at boot, after detection, every path found without a check on its device and driver is checked, one at a time (`checkNew` in `packages/runtime/src/hardware.ts`), and Automatic, the default, takes the first that passed; a server that only restarts checks nothing, and a failed check isn't run again by itself. Two lines of the screen's copy follow it, in the admin and its prototype ("highsea checks the graphics it finds by itself, and uses them once a check passes." and "…then restart it, and highsea checks the chip as it starts."), with the guides, the spec's decisions, ADR 0056 and the changelog.
  - **Found and fixed along the way:** a session's `hardware()` read the live run, so once ffmpeg reached a film's end Now playing would have said the processor made it; it now keeps the last run's path (`runner.ts`), which also ends the VideoToolbox test's failures under load (4 runs in 8 before, none in 8 after, the processor saturated); Quick Sync's -9 had no line of its own; the hardware screenshot needed a taller window; the changelog had no notes for 4.3a; "a minute ago" used the plural; the hardware section reuses VPN's `CopyBlock` for the compose lines, which scroll sideways, and axe asks that a scrolling region can be reached by keyboard, so `CopyBlock` takes focus (`tabIndex={0}`) in the admin and its prototype, which needs the owner's approval.

## Settings › Playback (4.3a, and its hardware section in 4.3b)

Ported from `design/prototypes/src/admin/settings/playback.tsx` with `/port-screen`, matching the prototype, as every admin page:

- **Settings:** a `playback` section in the settings store (`packages/api-contract/src/settings.ts`), read and saved with `settings.get('playback')` and `settings.save('playback', …)` as every page: hardware (`automatic`, a path, or `processor`), tone mapping (on by default), transcodes at once (1 to 8, default 3), the encoder (Faster, Balanced or Sharper, default Balanced), the remote ceiling (default 8 Mbps · 1080p, or No limit), and the cache's folder (default the data folder's `transcodes/`, shown as `/config/cache/transcodes` in the container) and limit (default 20 GB). `REMOTE_CEILING` becomes the setting's default.
- **The status route:** `GET /api/v1/playback/status` (staff only): the paths found with their devices or why they can't be used, each path's last check, the path in use, and the cache's use, limit and trickplay's size. `POST /api/v1/playback/checks/{path}` and `DELETE /api/v1/playback/cache`. The event `playback.updated` when a check ends or the cache changes. The prototype calls this namespace `transcoding`; the server keeps `playback`, beside the clients' routes, with the staff-only routes marked in `access.test.ts`.
- **The encoder's three settings** map to each encoder's own speed setting: libx264's `superfast`, `veryfast` and `faster` ([ffmpeg's H.264 guide](https://trac.ffmpeg.org/wiki/Encode/H.264)), NVENC's `p2`, `p4` and `p6`, QSV's `veryfast`, `medium` and `slow`, and VAAPI's and VideoToolbox's quality where they have one (each from [ffmpeg-codecs](https://ffmpeg.org/ffmpeg-codecs.html)). Balanced is 4.1's encoder, unchanged.
- **The cache's folder:** a change applies to sessions that start after it; the old folder's segments are removed. The folder is checked as root folders are (exists, writable), with the same messages.
- **The guide:** `apps/docs/content/settings/playback.mdx`, with screenshots from the seeded server, and in 4.3b the hardware section.

## Limits and the cache (4.3a)

In `packages/stream/src/hls/runner.ts` and the runtime's `playback.ts`:

- **Transcodes at once:** a run that makes the picture again counts, a direct stream doesn't, since copying costs little. When the limit is reached, a new transcode waits, as the spec says ("More wait until one finishes"): its player shows Getting it ready, and Now playing shows it waiting. After a minute it gives up, and the player shows Didn't start with the reason ([answer 7](#the-owners-answers)).
- **Throttling** stays 4.1's (30 s ahead, then `SIGSTOP`), applied to hardware runs too in 4.3b, and measured on the NAS.
- **The cache's limit:** checked as segments are written. Past it, highsea removes the oldest segments first from sessions that have ended and are still being cleaned up, then those furthest behind the playhead of sessions that are playing. A segment the player may still ask for again (within a minute behind it) is kept. Leaving the player still removes its folder at once (exit criterion 3).
- **Clear** stops nothing: films that are playing make their segments again when asked.

## Subtitles burned in, and the downmix (4.3a)

- **Picture subtitles** (PGS, VobSub, DVB) and **styled ASS** the client can't draw are burned into the picture, which forces a transcode. The decision says so in a reason ("The subtitle is a picture, so it's drawn into the film, which is made again."), and the play API gives the track as burned in rather than not available. Filters, from [ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html): `overlay` for picture tracks (scaled to the picture first), `subtitles` (libass, which Debian's ffmpeg has) for ASS with its fonts and styling. In 4.3b the hardware paths use `overlay_vaapi`, `overlay_qsv` or `overlay_cuda` where they have them, and the processor's overlay with an upload otherwise.
- **The web player:** a burned-in track isn't loaded as a `<track>`; the panel lists picture subtitles as choosable, and "This subtitle is a picture, which a browser can't show yet." goes. Choosing one starts a new session at the same place, as changing the sound does. Subtitle timing is left out for a burned-in track, with a line in its place: "This subtitle is drawn into the picture, so its timing can't be changed." ([answer 6](#the-owners-answers)). It's a small change to C5's panel, so it's prototyped and approved first, at the start of 4.3a.
- **The downmix:** 5.1 and 7.1 made into stereo use a fixed matrix with the centre channel at −3 dB and the LFE left out, which keeps dialogue as loud as the mix intended, rather than ffmpeg's default `-ac 2`, which is quieter in the centre. Through ffmpeg's `pan` filter, with the coefficients cited from [RFC 7845 § 5.1.1.5](https://www.rfc-editor.org/rfc/rfc7845#section-5.1.1.5) (the Vorbis channel order's stereo downmix matrices) and checked against the clips' tones.

## Now playing and its widget (4.3a)

Ported from `design/prototypes/src/admin/now-playing/` and the widget in `src/admin/dashboard/widgets.tsx`:

- **The page** at `/now-playing`, after Activity in the sidebar with a count while anyone is watching, and in the command palette ("sessions", "streams", "watching", "transcodes", "stop"). **Now:** the totals (streams, Mbps sent, Mbps away from home, transcodes) and a row per session: poster and title, person and device with its kind's icon, state, how it's sent, progress, Sent as, From, Network (At home or Away from home, with the address), Transcoded by (the path and its speed against real time, from ffmpeg's `-progress` output, [ffmpeg › Main options](https://ffmpeg.org/ffmpeg.html#Main-options)), the reasons in words, and Can't keep up when a transcode runs below real time. **Last 30 days:** the table and the filter by person.
- **Routes** (staff only): `GET /api/v1/sessions`, `GET /api/v1/sessions/history?userId=`, `POST /api/v1/sessions/{id}/stop` with an optional message; the event `sessions.updated` as sessions start, change and end. These are new names beside 4.1's `/playback/sessions`, which the clients use.
- **Stop:** ends the session's token and its ffmpeg, and sends the person `playback.stopped` over their SSE stream with who stopped it and the message. The web player shows its Stopped state (built in 4.2b). The row stays 10 s as "Stopped by {name}", then goes.
- **History:** a row per session that ended (who, film, version, device, how it was sent, whether away, how much was watched, when it started and ended) in a new table, `playback_history`, with a migration (`bun run generate`). No addresses are kept. A daily job removes rows older than 30 days, safe to repeat (ADR 0022). A user's rows go with the user.
- **The widget:** registry kind `now-playing` in `@highsea-tv/personalization` (1 to 4 columns, 2 to 5 rows, default 2 × 3, owner and admin), leading the owner's and admins' first arrangement as prototyped; saved layouts keep their own order.
- **The notification:** a **Playback started** event in the catalogue (ADR 0046), off by default for every connection, with the person, the film, the device and how it's sent ([answer 9](#the-owners-answers)).
- **The guide:** a Now playing page under the admin's guides, with screenshots.

## Hardware acceleration (4.3b)

A new subpath, `@highsea-tv/stream/hardware`, pure where it can be, with the runtime doing the looking and running:

- **Detection at boot**, and again on Check:
  - **VAAPI and QSV:** render nodes under `/dev/dri` (`renderD128` and on), then `vainfo`'s view through ffmpeg (`-init_hw_device vaapi=va:/dev/dri/renderD128`) for the driver's name and what it decodes and encodes ([ffmpeg's VAAPI wiki](https://trac.ffmpeg.org/wiki/Hardware/VAAPI)). QSV is offered only for Intel's `iHD` driver.
  - **NVENC:** `-init_hw_device cuda` succeeding, which needs NVIDIA's container toolkit with the `video` capability ([NVIDIA › Specialized configurations with Docker](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)), and the encoders' list.
  - **VideoToolbox:** `process.platform === 'darwin'` and `-init_hw_device videotoolbox` ([ffmpeg's HWAccelIntro](https://trac.ffmpeg.org/wiki/HWAccelIntro)). Never inside Docker ([answer 4](#the-owners-answers)).
  - Why a path can't be used goes in its row in words ("No /dev/dri in the container.", "No NVIDIA GPU in the container.", "Only when highsea runs on a Mac, outside Docker.").
- **The check:** a short 1080p HEVC 10-bit clip, made at boot from ADR 0040's lavfi sources into the data folder, transcoded to H.264 on that path with tone mapping, timed, and its frames per second kept with what ffmpeg reported. Each path is tried with low-power encoding first where it has it (Intel's `low_power`), then without, and the one that worked is kept, which answers the spec's open question without a switch. **Automatic uses the first path whose check passed, and never one that hasn't** (playback-settings.md). A run on a path that fails mid-film falls back to the processor at the same segment, with a reason, and the path's check is marked failed.
- **Command lines per path**, in `hls/args.ts`, each from ffmpeg's documentation for that path, keeping 4.1's segmenting, keyframes and timestamps unchanged:
  - decode on the same device where it can (`-hwaccel vaapi|qsv|cuda|videotoolbox` with `-hwaccel_output_format`), so frames stay on the GPU;
  - scale on the device (`scale_vaapi`, `vpp_qsv`, `scale_cuda`, or the processor's `scale` for VideoToolbox);
  - encode H.264 (`h264_vaapi`, `h264_qsv`, `h264_nvenc`, `h264_videotoolbox`) with a bitrate cap, a keyframe every 6 s and no scene cuts between, as 4.1's libx264 does, so the playlist is still known before anything is made;
  - snapshots of each in the tests, since CI has no GPU (the parent plan's risk).
- **Tone mapping** (HDR10, HLG, and Dolby Vision profiles 5 and 8 where the filter reads them), on by default:
  - Intel: `vpp_qsv`'s or `tonemap_vaapi`'s ([ffmpeg-filters › tonemap_vaapi](https://ffmpeg.org/ffmpeg-filters.html#tonemap_005fvaapi)), on the GPU;
  - NVIDIA: `libplacebo` on Vulkan ([ffmpeg-filters › libplacebo](https://ffmpeg.org/ffmpeg-filters.html#libplacebo)), with the toolkit's `graphics` capability for NVIDIA's Vulkan driver;
  - AMD: `libplacebo` on Vulkan through Mesa's RADV driver (`mesa-vulkan-drivers`, [answer 3](#the-owners-answers)), with the frames shared from VAAPI;
  - the processor: `zscale` and `tonemap` ([ffmpeg-filters › tonemap](https://ffmpeg.org/ffmpeg-filters.html#tonemap)), slower, so a 4K HDR film may not keep up on a NAS's processor, which Can't keep up then shows;
  - the reason changes from "looks washed out" to "converted from HDR for this screen".
- **The image** (Dockerfile's runtime stage, ADR 0003's image section): `intel-media-va-driver-non-free` ([answer 2](#the-owners-answers)), `libmfx-gen1.2` and `libvpl2` for QSV, `mesa-va-drivers` for AMD, and `mesa-vulkan-drivers` for libplacebo on AMD and Intel ([answer 3](#the-owners-answers)), on amd64 only. Measured on 2026-10-28 in a trixie amd64 container: 42 MB, 8.7 MB, 48 kB and 83 MB, about 134 MB in all. The image's budget rises from 2,200 MB to 2,300 MB: `scripts/image.ts`'s default, CI, CLAUDE.md's command and `/checks` change together. The Debian `non-free` component is added for that one package. `scripts/image.ts` checks that `ffmpeg -encoders` lists the hardware encoders in the built image.
- **Passing the chip to the container**, in Settings › Playback's "When nothing is found" and in the guides:
  - Intel and AMD: `devices: [/dev/dri:/dev/dri]`, and the container's user in the render node's group (`group_add` with the node's group id, which the guide shows how to find), since highsea runs as `PUID:PGID`;
  - NVIDIA: a device reservation with `driver: nvidia` and `capabilities: [gpu, video]` ([Docker › GPU support in Compose](https://docs.docker.com/compose/how-tos/gpu-support/)), after NVIDIA's container toolkit on the host;
  - `compose.yaml` and `compose.bridge.yaml` gain the lines commented out; Unraid's template gains `/dev/dri` as an optional device; the TrueNAS and Synology compose files gain the Intel lines commented out, with the guides saying which models have the chip.
- **The guides:** a Hardware acceleration page under Install, per vendor and NAS, and Settings › Playback's hardware section, with screenshots taken on the seeded server (no hardware) and the real states described in words.

## Checked on real hardware, and on the NAS (4.3b)

Exit criterion 3 asks for each hardware path to be checked once on real hardware, with the results in the report, and the real-time target measured on the owner's NAS, read only. The plan ([answer 5](#the-owners-answers)):

- **Intel (VAAPI and QSV) on the DS1520+.** The amd64 image built from this checkout is loaded onto the NAS as on 2026-10-22, nothing pulled or pushed, with `/dev/dri` passed through, its data in a test folder, and the films it plays mounted read only (`:ro`), so nothing on the NAS's shares can be written. Measured: each path's check, a 1080p H.264 and a 4K HEVC HDR film transcoded to 1080p and 720p against real time, a seek far ahead's time to the first segment, and the processor's real time at 1080p (4.1's open measurement).
- **VideoToolbox** on this Mac, running `bun run server` outside Docker.
- **NVENC and AMD** on whatever machine the owner has with one; a path nobody could check stays off by default, as the parent plan's risk says, and the report says so.
- **The seek target:** a seek far ahead plays within 3 s on a GPU and 5 s on the processor at 1080p, measured on the NAS. The report gives the numbers, and the target is changed if the owner prefers.

## Tests and checks (4.3a and 4.3b)

- **`packages/stream`:** the decision's new reasons (burn-in, tone mapping, a full transcode limit); the command lines for every path, filter chain and encoder setting as snapshots; detection over recorded `vainfo`-style and ffmpeg outputs; the cache's eviction order; the downmix's matrix. Real ffmpeg runs where ffmpeg is present, skipped and said so where it isn't: a PGS track burned in, the processor's tone mapping, and the downmix's levels on a tone clip.
- **The server:** the status, check, cache, sessions, history and stop routes, with staff-only access in `access.test.ts`; the history's 30-day clean-up; Stop reaching the person's SSE stream; the settings' validation; `openapi.json` regenerated.
- **The admin:** component tests for Settings › Playback and Now playing against the SDK's fake, every state the specs list.
- **`apps/web`:** the Stopped state from a real `playback.stopped` event; a picture subtitle chosen and played burned in.
- **The sweeps** on the two new admin pages and the widget (`scripts/sweeps/server.ts`), and `compare.ts` beside their prototypes. The playback run (`playback.ts`) adds a film with a PGS track burned in and the stop with a message. The end-to-end run through the image adds Now playing showing Sintel's session.
- **The image:** `bun scripts/image.ts size highsea:dev 2300` and the encoders' check.
- The full checks under Node 26.11, as at every checkpoint.

## ADRs

- **0056, hardware acceleration:** detection, the check that decides, the four paths and their filter chains, tone mapping per vendor, the drivers in the image and why, low power tried first, the fallback to the processor, and how Docker hands the devices over. The parent plan named this ADR for 4.3.
- **[0051](../adr/0051-playback-engine.md):** a dated section for the cache's folder, limit and eviction, transcodes at once, the encoder's settings, burn-in, the downmix, Stop, and the history.
- **[0052](../adr/0052-device-profiles.md):** a dated section on burned-in subtitles in the decision and its reasons.
- **[0003](../adr/0003-server-runtime-custom-entry.md):** a dated section on the image's drivers and the non-free component.
- **[0046](../adr/0046-notifications.md):** a dated section for Playback started.

## Risks

- **Hardware differs from machine to machine.** The same path can pass on one Intel generation and fail on another, and drivers change with Debian's updates. The check runs a real transcode on this host, Automatic never uses an unchecked path, and a path that fails mid-film falls back to the processor.
- **The J4125 is old.** Gemini Lake encodes H.264 on the GPU, but Intel's driver does it through shaders that only the non-free driver has, unless the host loads the HuC firmware for low-power encoding ([Intel's media driver README](https://github.com/intel/media-driver/blob/master/README.md), its build types and feature table). Synology's kernel may not. That's why the image has the non-free driver ([answer 2](#the-owners-answers)).
- **Tone mapping on the processor is slow.** A 4K HDR film may not keep up on a NAS's processor, which is why hardware is the answer, and Can't keep up and its advice say so.
- **Nothing here runs in CI on a GPU.** The tests cover command lines and the processor's runs; the hardware is checked by hand once, as the parent plan accepted.
- **The image's budget.** The drivers and Mesa's Vulkan drivers add about 134 MB, so the budget rises to 2,300 MB ([answer 3](#the-owners-answers)), leaving about 70 MB for the rest of Phase 4.
- **Synology's Docker is 24.0.2,** older than the guides' Docker Engine 29.8. Device reservations and `group_add` are older than that, but the NAS run confirms it.
- **A non-free package in the image.** The driver's kernels are binaries Intel distributes; the image's licence check lists it, and the Dockerfile says why it's there.

## Open questions for the owner

1. **The parts.**
   - **Recommended:** two gated parts, 4.3a (sessions and settings, on this Mac) and 4.3b (hardware acceleration, with the NAS). You see Now playing and the settings working before the hardware work, which needs your machines.
   - Or: one checkpoint, reviewed once. Fewer stops, but Now playing waits for the hardware checks.
2. **Intel's driver in the image.**
   - **Recommended:** `intel-media-va-driver-non-free` (42 MB, from Debian's `non-free`), which encodes on every Intel chip from Broadwell on, including your NAS's J4125, without the host loading extra firmware. Jellyfin's image ships a driver built the same way.
   - Or: the free `intel-media-va-driver` (19 MB, Debian's `main`). Nothing non-free in the image, but chips before Ice Lake (most NASes) encode only in low-power mode, which needs the host's HuC firmware, and may not encode at all on Synology.
   - Or: no Intel driver in the image; owners who want it build their own. Smallest, and most owners would never get hardware transcoding.
3. **Tone mapping on AMD.**
   - **Recommended:** on the processor for AMD for now (`zscale` and `tonemap`), with Intel on its GPU and NVIDIA through libplacebo. AMD's GPU tone mapping needs Mesa's Vulkan drivers, 83 MB that would take the image past its 2,200 MB budget. The reason says the processor is converting HDR.
   - Or: add Mesa's Vulkan drivers and raise the budget to 2,300 MB. AMD tone maps on its GPU, and Intel gets libplacebo too.
   - Or: no tone mapping on AMD: HDR films look washed out there, as now.
4. **VideoToolbox** (answer 4 added it). highsea installs only as a Docker container, and Docker on a Mac runs Linux in a virtual machine, which can't reach VideoToolbox. So it only works when highsea runs on a Mac outside Docker.
   - **Recommended:** build it and check it on this Mac with `bun run server`, as development already runs, and say in Settings › Playback that it works only outside Docker. A supported way to install highsea on a Mac without Docker (Node, Homebrew's ffmpeg, starting at login, updates) waits until after 1.0, scoped on its own.
   - Or: also write a guide for running highsea on a Mac without Docker in 4.3b. Mac owners get hardware transcoding now, and highsea has a second install method to keep working.
   - Or: leave VideoToolbox out until a Mac install exists.
5. **Which hardware checks each path.**
   - **Recommended:** Intel's VAAPI and QSV on your DS1520+, with the image built from this checkout loaded onto it as on 2026-10-22, its data in a test folder and the films mounted read only; VideoToolbox on this Mac; NVENC and AMD on any machine you have with one. A path nobody can check stays off unless its check passes on the owner's own host. Please say which NVIDIA or AMD machines you have, if any.
   - Or: publish `0.2.0-beta.1` first and check the NAS from the published image. The same checks, after a publish you decide on separately.
   - Or: a rented cloud machine with an NVIDIA GPU for NVENC's check. It covers a path you may not have, at a small cost, outside your network.
6. **Subtitle timing for a burned-in subtitle.** The client can't move what's drawn into the picture.
   - **Recommended:** Subtitle timing is left out for a burned-in track, with a line in its place ("This subtitle is drawn into the picture, so its timing can't be changed."). Picture subtitles come from the disc and are rarely out of time. It's a small change to C5's panel, prototyped and approved first.
   - Or: the timing restarts the stream at the same place with the offset applied by the server, after the nudges stop for a second. It works like text subtitles, but each change waits for the transcode to start again.
7. **When transcodes at once are full.**
   - **Recommended:** as the spec says, a new transcode waits for one to finish, with Getting it ready in the player and "Waiting for a transcode to finish" in Now playing; after a minute the player shows Didn't start, with the reason in words. No layout changes.
   - Or: turned away at once, with Didn't start and the reason. Clearer for the person, and the spec's "More wait until one finishes" changes.
   - Or: no limit counted for hardware paths, only the processor's. More streams on a GPU, but a GPU has limits too (NVIDIA's consumer cards limit sessions).
8. **What 4.3 releases.**
   - **Recommended:** `0.2.0-beta.2`'s release commit prepared at the end of 4.3b, published only on your word after the sign-off. `0.2.0-beta.1` stays yours to publish whenever you like, separately.
   - Or: `0.2.0` stable at 4.3's sign-off, since the server's playback is then complete. Owners on the stable channel get playback sooner, before the desktop and native apps.
9. **The notification for playback.**
   - **Recommended:** a **Playback started** event in Settings › Notifications, off by default for every connection, with who, what, on which device and how it's sent, as Tautulli's notifications do.
   - Or: no playback event; Now playing is the only place. Less to build, and nothing for owners who want to know from their phone.
10. **History's detail.**
    - **Recommended:** the history keeps who, film, version, device, how it was sent, whether away from home, how much was watched, and when; no addresses. 30 days, then removed.
    - Or: the addresses too, for owners checking who used their upload. More useful for that, and more of a record of where people were.

## The owner's changes

On 2026-10-28, reviewing this scope, the owner made 1 change:

1. **AMD tone maps on its GPU** (question 3): Mesa's Vulkan drivers (83 MB) go in the image, so libplacebo tone maps on AMD and is there for Intel too, and the image's budget rises from 2,200 MB to 2,300 MB. See [Hardware acceleration (4.3b)](#hardware-acceleration-43b).

## The owner's answers

On 2026-10-28 the owner took every recommendation for questions 1 to 10 except question 3:

1. Two gated parts: 4.3a (sessions and settings, on this Mac) and 4.3b (hardware acceleration, with the NAS).
2. `intel-media-va-driver-non-free` in the image, so the NAS's J4125 and other chips before Ice Lake encode without host firmware.
3. **Changed by the owner:** Mesa's Vulkan drivers in the image, so AMD tone maps on its GPU through libplacebo; the image's budget rises to 2,300 MB.
4. VideoToolbox is built and checked on this Mac outside Docker, and Settings › Playback says it works only there. A supported Mac install without Docker is scoped after 1.0.
5. Intel on the DS1520+ (an image built from this checkout, its data in a test folder, the films mounted read only), VideoToolbox on this Mac, and NVENC and AMD on any machine the owner has. The owner named no NVIDIA or AMD machine, so 4.3b asks again at its start; a path nobody checks stays off unless its check passes on the owner's own host.
6. Subtitle timing is left out for a burned-in subtitle, with a line saying why, prototyped and approved first.
7. A transcode past the limit waits in Getting it ready, shown as waiting in Now playing, and gives up with Didn't start after a minute.
8. `0.2.0-beta.2`'s release commit at the end of 4.3b, published only on the owner's word after the sign-off. `0.2.0-beta.1` stays the owner's to publish separately.
9. A **Playback started** notification event, off by default for every connection.
10. The history keeps no addresses: who, film, version, device, how it was sent, whether away, how much was watched and when, for 30 days.
