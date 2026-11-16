# Phase 5: highsea in real use

- **Status:** Scoped on 2026-11-15 (HT-21) and approved with [the owner's answers](#the-owners-answers) of 2026-11-15: every recommendation for questions 1 to 13, one change, profiles built in A2 (question 14), and every recommendation for questions 15 to 17, which follow from that change. A1 is being built (HT-22); nothing else is.
- **Asked for by the owner on 2026-11-15:** "I'd like to start planning the next phase. I'd like to start moving on from the prototyping phase sooner than later and begin getting an actual server running with real movies, shows, and music so we can begin testing against a real use case."
- **Gate:** the one client platform was signed off on 2026-11-15, part E with it, and the TV sign-in's two bugs are fixed (HT-17). This phase follows it. Prototyping takes a back seat: everything here is built against the owner's real library, and only what has no design at all is prototyped first.

## Read first

1. `CLAUDE.md`, then [status.md](../status.md)'s entries for Phase 4, the install follow-up and the one client platform. The standing rules in [phase-3-server.md](phase-3-server.md) still apply in full.
2. This plan's [What the owner's library looks like](#what-the-owners-library-looks-like) and [Where things stand](#where-things-stand). They're the reason for most of the parts' order.
3. The ADRs this phase changes: [0012](../adr/0012-unified-media-item-model.md) (one media item model), [0023](../adr/0023-accounts-sessions-devices.md) (accounts, sessions and devices, for profiles), [0036](../adr/0036-domain-packages-with-subpath-exports.md) (a subpath per kind), [0039](../adr/0039-importing.md) (importing and the library scan), [0047](../adr/0047-operations.md) (backups, logs, crash reports), [0050](../adr/0050-release-and-versioning.md) (releases), [0051](../adr/0051-playback-engine.md) and [0052](../adr/0052-device-profiles.md) (playback), [0054](../adr/0054-watch-state.md) (watch state), [0057](../adr/0057-installing-without-configuration.md) (installing, the Synology package) and [0059](../adr/0059-native-apps.md) (the native apps).
4. The drafted contract this phase makes real: `packages/api-contract/src/shows.ts`, `series.ts`, `series-settings.ts` and `music.ts`, with what the mock answers in `packages/mock/src/` (`shows.ts`, `music.ts`). The screens that draw them are already built: `apps/client/src/shows/`, `music/`, `music-player/`, and the admin's `packages/admin/src/shows-library.tsx`, `show-detail.tsx`, `discover-shows.tsx` and `add-show-dialog.tsx`.
5. The specs for what's drawn: [shows.md](../product/shows.md), [player.md](../product/player.md) (Episodes, Skip intro and credits, the music player), [client-library.md](../product/client-library.md) (Shows and Music), [client-detail.md](../product/client-detail.md), [settings.md](../product/settings.md) and [setup.md](../product/setup.md).
6. The plans this one takes over from: [prototype-gaps.md](prototype-gaps.md) (stage 7, Music in the admin), [phase-4-checkpoint-5.md](phase-4-checkpoint-5.md) (4.5c, Android) and its answer 11 (4.6, downloads), [install-simplicity.md](install-simplicity.md) (part D, the Synology package) and the roadmap's [gap analysis](../roadmap.md#gap-analysis-what-a-true-end-to-end-replacement-still-needs).

## Goal

highsea runs for real on the owner's DS1520+, installed the way an owner would install it, with the owner's own films, shows and music in it, and the owner watches and listens through it every day on the web, the desktop app, the iPhone and the Apple TV, at home and away. What real use finds is written down and fixed, part by part. When the phase is signed off:

- the films (about 1,300), shows (about 270, with 8,000 episodes) and music (about 250 artists and 6,400 songs) on the NAS are in highsea, matched and playable on every client;
- shows are a full library: seasons, episodes, Next up, watch state per episode, Skip intro and Skip credits, and, once the owner moves over, monitoring and downloading as Sonarr does;
- music plays, with albums, artists, songs, the person's own playlists and the music player as drafted;
- highsea updates through Package Center, backs itself up, and reports its clients' errors to its owner;
- the native apps reach the owner's own devices by a route that doesn't expire every week;
- each person in the household watches as their own profile, with their own Continue watching, from the start on the Apple TV.

## Out of scope

- **Downloading music** (Lidarr's monitoring of artists and releases). Music starts as a library of files that are already there, as the owner decided for the admin on 2026-11-01 (prototype-gaps.md's answer 2). It's a phase of its own after this one.
- **Anime as its own kind** (absolute numbering, AniDB mappings). The owner's `media/anime` folder is empty. Shows parse what Sonarr's standard naming gives; anime waits for its phase.
- **Downloads to a device (4.6) and Android (4.5c).** Both move after this phase ([answer 13](#the-owners-answers)).
- **Store submissions** (Unraid, TrueNAS, Umbrel, CasaOS). They follow a stable release that has this phase's work, on the owner's word, as before.
- **Usenet, requests, the cloud relay, books and online video:** the gap analysis's later items stay later.
- **highsea's own remote access with ACME certificates** ([ADR 0026](../adr/0026-network-tls.md) left it for later). The owner's remote use goes through a route that exists today ([answer 4](#the-owners-answers)); ACME stays on the gap list.

## What the owner's library looks like

Listed read-only from `/Volumes/data` on this Mac on 2026-11-15 (the DS1520+'s `data` share). Nothing was written, and no file names beyond these few examples are copied into the repository.

- **The share's layout is TRaSH's:** `downloads/` and `media/` under one share, so hardlinks work between them ([TRaSH: Docker folder structure](https://trash-guides.info/File-and-Folder-Structure/How-to-set-up/Docker/)). `downloads/complete/` has a folder per category (`movies`, `shows`, `music`, `games`, `private`, `uncategorized`) and Unpackerr's `*_unpackerred` beside three of them, so today's stack is qBittorrent with Radarr, Sonarr, Lidarr and Unpackerr. `media/` has `movies`, `shows`, `music` and an empty `anime`.
- **Films (`media/movies`, 1,360 folders):**
  - every folder is `Title (Year)`, and 362 add Radarr's `[tmdb-…]` (`Zootopia 2 (2025) [tmdb-1084242]`); highsea's parser already reads both (checked on 2026-11-15);
  - 1,294 have Radarr's Kodi `movie.nfo`, which carries `<tmdbid>` and `<imdbid>`, so nearly every film can be matched for sure without searching TMDB;
  - 1,307 folders hold a film: 1,281 hold one video, 26 hold several (up to 19, the multi-part and collection folders), and about 50 hold no video at all;
  - files: 767 `.mkv`, 625 `.mp4`, 4 `.avi`, 2 `.ts`, and one `.rar` left unextracted; 904 `.srt` beside them (`.en.sdh.srt` among them), 6 VobSub pairs (`.idx`/`.sub`), and a few `.smi` and `.ssa`;
  - file names vary by where they came from: Radarr's `{Title} ({Year}) [tmdb-…] - [{Quality}][{Audio}][{Codec}]-{Group}` beside older `{Title} ({Year}) BluRay-1080p`;
  - extras sit in `Featurettes`, `Other`, `Extras` and `Extra` (Jellyfin's folders, which highsea already skips), and in `Subs`, `Screenshots`, `Proof` and `Plex Versions`, which it doesn't know;
  - artwork beside each film: `poster.jpg`, `fanart.jpg`, `landscape.jpg`, `clearlogo.png`;
  - a sample of 40 films by ffprobe: mostly H.264 up to 1080p, a few HEVC, no HDR in the sample; audio AAC, AC-3, E-AC-3, DTS and TrueHD; subtitles SubRip, PGS and VobSub inside the files.
- **Shows (`media/shows`, 273 folders):**
  - 272 have Sonarr's Kodi `tvshow.nfo` with `uniqueid`s for TMDB, TVDB and IMDb; 81 folder names add `[tvdb-…]` and 95 a year;
  - 715 `Season NN` folders and 5 `Specials`;
  - 8,163 episode files (7,831 `.mkv`, 328 `.mp4`, 4 `.avi`), named Sonarr's standard way (`Brooklyn Nine-Nine - S01E01 - Pilot.mkv`): 8,112 `SxxEyy`, 23 multi-episode `SxxEyyEzz`, 1 `NxNN`; no daily or absolute numbering;
  - each episode has an `.nfo` and a `-thumb.jpg` beside it, and 1,464 `.srt`.
- **Music (`media/music`, 252 artist folders):**
  - `Artist/Album (Year)/` with tracks inside, and 18 albums split into `CD1`, `CD2` folders; Lidarr's Kodi `artist.nfo` and `album.nfo`, `folder.jpg` and artist artwork;
  - 3,265 `.mp3`, 3,139 `.flac`, 8 `.m4a`, 25 `.lrc` lyrics, and 51 `.mp4` (music videos);
  - track names like `Blur_Parklife_01_Girls & Boys.flac`;
  - a sample of 40 tracks: every one has an album artist, track and disc numbers, and 18 carry MusicBrainz ids;
  - one album folder's name can't be read over SMB from the Mac (characters SMB can't map); on the NAS itself it's an ordinary folder, so highsea, running there, reads it.

## Where things stand

What's real today, read from the code on 2026-11-15:

- **Films are real end to end:**
  - the existing-library import (`packages/media/src/movies/library-import.ts`) reads `Title (Year)`, `{tmdb-…}` and `[tmdbid-…]` from folder names and matches on TMDB, adding each film where it is, with no move and no rename unless asked; the library scan adds new folders it can match surely, every 12 hours and when a watched folder changes (ADR 0039);
  - several versions per film (ADR 0012), the import pipeline from downloads, subtitles, automation, the Radarr and qBittorrent importers;
  - playback (`packages/stream`, the runtime's `playback.ts`): direct play, direct stream and HLS transcodes, hardware acceleration checked on the DS1520+ (VAAPI), subtitles as WebVTT, trickplay, watch state, Now playing;
  - every client screen for films, on the web, the desktop app, the iPhone and the Apple TV.
- **What stops highsea from running on the owner's films as they are:**
  - **a root folder must be writable:** adding one refuses a folder highsea can't write to (`packages/media/src/shared/root-folders.ts`, line 138), and Health calls it an error. Mounting the media read-only, the safe way to start beside the owner's current stack, isn't possible today;
  - **`movie.nfo` isn't read:** the import matches by name only, so 900 folders without `[tmdb-…]` go to TMDB's search instead of using the id Radarr already wrote;
  - root folders have no kind (`root_folders` in `packages/db/src/schema/media.ts`), and setup finds only a movies folder (`MOVIE_FOLDERS` in `packages/runtime/src/setup.ts`).
- **Shows are drafted, not built:**
  - the contract has the clients' `shows` group and the admin's `series` group, with Shows' settings, every route a draft the server answers 501 (`draft()` in `packages/api-contract/src/common.ts`, `x-highsea-draft` in `openapi.json`); episodes play and are marked through the films' routes with the `episode` type (`TITLE_TYPES`), and an episode carries `intro` and `credits` marks (`kinds.ts`, line 110);
  - the clients draw Shows, a show, the episode player and Next up, and the admin draws Shows, a show, Discover shows and Add a show, all only when public info's `sources` lists `shows` (`CLIENT_SOURCES`), which only the mock does;
  - the server has nothing behind them: `MEDIA_TYPES` is `['movie']`, `media_items.tmdb_id` is required, the parser reads no season or episode (it only uses an episode tag to end a film's title), and `packages/metadata` has no TV calls.
- **Music is drafted, not built:** the `music` group (albums, artists, songs, the queue, tracks, playlists) is drafted as shows are; the clients draw Music and the music player, but the player makes no sound (`apps/client/src/music-player/store.ts`: "There's no audio, as in the prototype"). Music has no admin screens (prototype-gaps.md's stage 7 was never drawn) and no spec of its own beyond client-library.md and player.md.
- **Profiles are drafted, not built:** the `profiles` group (`packages/api-contract/src/profiles.ts`: list, add, change, delete, choose with a PIN, at most 6, the account's own profile first and never deleted) is drafted as shows are; the client draws Who's watching on the TV (`apps/client/src/profiles/`, with its launch setting kept on the device), Switch profile on the web and the phone, and the TV's new-profile and settings screens, all only when `sources` lists `profiles`. Watch state is kept per user (`watch_positions` in `packages/db/src/schema/media.ts`, `watch_history` and `playback_prefs` in `playback.ts`), so every profile would share one Continue watching today.
- **Running it:** the Synology package (`templates/synology/spk/`, signed off on 2026-10-29) installs the image from Package Center through `packages.highsea.tv`, which serves the **stable** release's package only. The newest published release is 0.3.0 (2026-10-29), from before the one client platform; 0.4.0 was prepared and never published. Backups, logs and crash reports are the server's own (ADR 0047); the clients report nothing.
- **The native apps:** built and run on the simulators and, signed by the owner's personal team, on the owner's iPhone, which stops opening the build after 7 days ("Provisioning profiles … will expire 7 days from issuance", [Apple: Compare memberships](https://developer.apple.com/support/compare-memberships/)). The owner set the Apple Developer Program aside on 2026-10-29, so there's no TestFlight.

## The parts

Five parts, each reviewed by the owner before the next starts, as the owner's gated work asks. Each part ends with a stretch of real use before its report: the owner uses what it added for at least a few days on the NAS, against the [real-use checklist](#real-use-checklist-every-part), and what that finds is fixed or listed before sign-off.

- **A1, a real server with the owner's films:** a published release installed from Package Center on the DS1520+, the media mounted read-only beside today's stack, libraries highsea only reads, `movie.nfo` read for sure matches, the 1,300 films imported, and backups on.
- **A2, watched everywhere, by each person, and the loop:** the films played on the web, the desktop app, the iPhone and the Apple TV, at home and away; the native apps on the owner's devices by a lasting route; profiles, so each person's watch state is their own (the owner's answer 14); client error reports; the findings log; and the first findings fixed. With profiles, A2 is the phase's second-largest part after B, so it's built in two batches under one gate: A2a, the apps on the devices, error reports and the findings log; A2b, profiles. The owner reviews both together, after real use with profiles on the Apple TV.
- **B, shows' library:** shows on the server (the domain, TMDB's TV metadata, seasons and episodes), the 270 show folders imported from `tvshow.nfo`, episodes played and watched on every client, and the drafted routes served.
- **C, shows in full:** C1, Sonarr's monitoring and downloading, with a Sonarr importer, once the owner chooses to move shows over; C2, Skip intro and Skip credits from markers the server finds.
- **D, music:** music on the server (tags, MusicBrainz, albums, artists, songs, playlists), audio on every client, and Music in the admin, prototyped first since it has no design.
- **E, the phase's close:** the full checks, the guides, a stable release, what the findings left, and what comes next.

The order is films, then shows, then music: films are already built and only need to meet a real library, shows are the larger library and the drafted design is the most complete, and music has the most missing (no admin design, no audio in the clients). The owner kept this order (answer 1).

## Progress

Nothing yet.

## Running highsea on the NAS (A1)

- **Where:** the DS1520+ (Intel Celeron J4125, VAAPI checked in 4.3b), through the Synology package from Package Center with `packages.highsea.tv` as its source, the way an owner installs it (install-simplicity.md's part D). This Mac stays the development machine; [answer 2](#the-owners-answers) has the alternatives.
- **Beside today's stack, read-only:** Radarr, Sonarr, Lidarr and qBittorrent keep running and keep owning the files. highsea gets `/data/media` read-only and doesn't download in A1 ([answer 3](#the-owners-answers)). Docker documents read-only mounts: "You can use the `readonly` or `ro` option to prevent the container from writing to the mount" ([Docker: Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)). The package's wizard gains a choice for it, or the owner sets it in Container Manager; which is the build's call, recorded in the report.
- **Releases:** a published stable release at each part's sign-off (0.4.0 for A1, then 0.5.0, and on), on the owner's word each time, so the NAS updates through Package Center as owners' NASes do ([answer 5](#the-owners-answers)). Before a release, the build is tried on the NAS from a local image as 4.3c and part D did, with the owner's permission for test installs.
- **Libraries highsea only reads** (new ADR 0063):
  - a root folder can be added read-only: `checkPath` in `packages/media/src/shared/root-folders.ts` accepts a folder it can't write to when the owner says it's read-only, or when highsea finds it mounted read-only, and Health says "highsea only reads this folder" as information, not an error;
  - on a read-only root folder, highsea never writes: no renames (Rename to my format is hidden), no NFO or artwork, no subtitles beside the film (they go to the data folder instead, served as if beside it), no deletes, and imports from downloads are refused with a reason;
  - the library scan and filesystem watching work as before; on SMB or NFS mounts where watching doesn't report changes, the 12-hourly scan and Scan now cover it ([Node: fs.watch caveats](https://nodejs.org/api/fs.html#caveats));
  - a root folder can be switched to managed later, which is how highsea takes over a kind ([answer 3](#the-owners-answers)).
- **Reading `movie.nfo`** (ADR 0039's dated section): the existing-library import and the scan read the Kodi NFO beside a film for `<tmdbid>`, `<imdbid>` and `<uniqueid type="…">`, as Jellyfin does ("Tags following the pattern `<PROVIDER_NAME` + `id>` are also supported", [Jellyfin: NFO](https://jellyfin.org/docs/general/server/metadata/nfo/)). An id there is a sure match, so the 1,294 films with an NFO are added without searching. An IMDb id is turned into TMDB's through TMDB's `find` ([TMDB: Find by ID](https://developer.themoviedb.org/reference/find-by-id)).
- **What the library showed that highsea doesn't handle yet:**
  - `Subs`, `Screenshots`, `Proof` and `Plex Versions` folders: subtitles in `Subs` are read as the film's sidecars; the rest are skipped as extras (`EXTRA_FOLDERS` in `packages/media/src/shared/files.ts`);
  - folders with no video: listed in Library import as "No film in this folder", not matched;
  - folders with several videos: multi-part films (`cd1`, `part1`) are one version, as Jellyfin's stacking reads them ([Jellyfin: Movies › Multiple parts](https://jellyfin.org/docs/general/server/media/movies/)); other folders with several films wait in Library import with a reason;
  - a `.rar` in the library: left alone on a read-only folder.
- **Setup:** `setup.detect` finds `media/shows` and `media/music` beside `media/movies` and lists them in Review; root folders gain a kind (Movies, Shows, Music), as prototype-gaps.md's stage 6 drew in Settings › Media management. Shows' and music's root folders are kept in A1 but used from B and D.
- **Backups:** daily backups on (ADR 0047), kept in the package's own folder, which the owner adds to Hyper Backup; restoring is tried once on the NAS before A1's report.
- **Touches:** `packages/media/src/shared/root-folders.ts`, `files.ts`, `nfo.ts` (reading as well as writing), `packages/media/src/movies/library-import.ts` and `scan.ts`; `packages/db` (a `kind` and `readOnly` on `root_folders`, through `bun run generate`); `packages/runtime/src/setup.ts` and `system.ts` (Health); `packages/api-contract/src/settings.ts` and `setup.ts`; `packages/admin`'s Media management and Library import; `templates/synology/spk/` (the read-only choice); the guides `apps/docs/content/install/synology.mdx` and `settings/media-management/`.
- **Tests:** a read-only root folder (a folder with its write bit off, in a temporary directory) added, scanned, and never written to (every write path asserted refused); `movie.nfo` in Radarr's and Kodi's forms matched without TMDB's search; the extras and `Subs` folders; a multi-part film. No test reads the NAS.

## Watched everywhere, and the loop (A2a)

- **Every client against the NAS:** the web at `/web`, the desktop app (from the release), the iPhone and the Apple TV, at home by discovery and away through Tailscale on the NAS (answer 4; its package installed by hand from Tailscale's own server, as [Tailscale: Synology](https://tailscale.com/kb/1131/synology) says, with the boot task it documents for DSM 7).
- **The native apps on the owner's devices:** through TestFlight, the owner joining the Apple Developer Program (answer 6): builds last 90 days ("You can test a build for up to 90 days") and TestFlight covers tvOS ([Apple: TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)). The release workflow gains a job that uploads the iPhone and Apple TV builds to App Store Connect from the `release` environment, waiting for approval as the other publishing jobs do (ADR 0050, ADR 0059's dated section).
- **Client error reports** (new ADR 0066):
  - each client sends its unhandled errors and failed plays to its own server (`POST /api/v1/system/client-reports`, signed in), never to anyone else, with the app, its version, the device, the screen and the error, and nothing about the person beyond their user id;
  - System › Logs shows them beside the server's own crash reports (ADR 0047), and Download logs includes them;
  - a play that fails records the device's profile and the decision, so a finding can be reproduced from the report.
- **The findings log** ([answer 7](#the-owners-answers)): each finding is one line in this plan's Progress, under its part, with the date, what happened, on which client, and where it went. A finding that needs work becomes a Shepherdr task (HT-n) on `next`; a finding that's a design question goes in the next report's questions.
- **The first findings fixed:** A2 ends when the films' findings from a few days of real use are fixed or listed with a reason.
- **Touches:** `packages/api-contract/src/operations.ts` (the reports' route), `packages/runtime/src/crashes.ts` and `logs.ts`, `packages/admin`'s System › Logs, `apps/client` (an error boundary and the play failure's report, in the shared shell), `@highsea-tv/client/data`; `.github/workflows/release.yml` and `native.yml` (TestFlight), `apps/client/app.config.ts` (the build numbers); the guides `apps/docs/content/watch/iphone.mdx` and `apple-tv.mdx` (how to get the apps), and a new `apps/docs/content/install/remote.mdx` for reaching highsea through Tailscale.
- **Tests:** the reports' route (who may send, its size limit, what's kept), the client's error boundary (Jest), and the end-to-end run's step that sends a report.

## Profiles (A2b)

Built on the owner's change to question 14, so each person's Continue watching is their own from the start on the Apple TV. The design is drawn and the contract drafted; A2b serves it.

- **The model** (new ADR 0068): a `profiles` table under each account (name, tone, a PIN kept only as a hash, `main` for the account's own), at most `MAX_PROFILES` (6). The account's own profile is made for every existing account in the migration, and for each new account when it's made.
- **Watch state per profile** (ADR 0054's dated section): `watch_positions`, `watch_history` and `playback_prefs` gain a profile id beside the user id, part of their keys and indexes; every read and write takes the profile watching now. What's already recorded goes to each account's own profile ([answer 15](#the-owners-answers)).
- **The profile watching now:** kept per device, on the session or device token, not on the account, so the Apple TV can watch as one person while a phone watches as another ([answer 16](#the-owners-answers)). `choose` sets it; a new session starts on the account's own profile, or on the device's last choice. The list of profiles, their names and PINs stay the account's and are seen on every app. client-settings.md's Switch profile says so: it read that switching on one app "is seen on the others", and now says switching changes only that app.
- **PINs:** four digits, hashed as passwords are (ADR 0023), never sent to an app; five wrong in a row rest choosing for a minute, as the contract's `choose` says (429 with `retryAfter`). The audit log records a profile added, deleted or its PIN changed.
- **What reads watch state learns profiles:** Home's rows and Continue watching (`packages/runtime/src/home-rows.ts`), Remove from Continue watching, Next up, the films' and episodes' Watched marks, smart collections' watch rules (`collection-query.ts`, ADR 0049), Now playing and its history (`now-playing.ts`, which shows the profile's name beside the account's), the playback started notification, and Trakt's watchlist (stays the account's). Preferences in layers (ADR 0027) gain a profile layer only for what the drafted design has per profile: Home; a profile's theme and sound stay the device's.
- **Serving the drafts:** the `profiles` group is served and loses `draft()`; public info's `sources` lists `profiles`, so Who's watching, Switch profile and the TV's profile screens draw from real data; `bun run openapi` refreshes `openapi.json`.
- **Not in A2b:** kids' profiles and ratings limits per profile ([answer 17](#the-owners-answers)): every profile sees the whole library, and a kids' profile is scoped later if the household asks; profiles in the admin beyond Now playing and Users' profile count.
- **Touches:** `packages/db/src/schema/` (a `profiles` table; the three watch tables' keys; `bun run generate`, with the migration moving existing rows to each account's own profile), `packages/auth` (the profile on the session and device token, PIN hashing and its limit), `packages/media/src/shared/watch.ts` and `watching.ts`, `packages/runtime/src/home-rows.ts`, `now-playing.ts`, `collection-query.ts` and `notify.ts`, `packages/personalization` (Home per profile), `apps/server/src/api/` (the profiles routes, `drafts.ts`), `packages/api-contract/src/profiles.ts` (drafts made real), `packages/admin`'s Now playing and Users, `apps/client/src/profiles/` and `@highsea-tv/client/data` on real data; the specs client-settings.md and users-devices.md; the guides `apps/docs/content/watch/` (profiles) and the admin's Users.
- **Tests:** the migration moving existing watch state to each account's own profile; two profiles on one account with separate Continue watching, Next up and Watched; a phone and a TV on one account watching as different profiles at once; PIN checked, never returned, rested after five wrong; the account's own profile refused for delete; deleting a profile removes its watch state; smart collections' watch rules per profile; the client's Who's watching against the server in the end-to-end run, and the TV's walk through Who's watching on the simulator.

## Real-use checklist (every part)

What the owner does in each part's stretch of real use, so findings come from the same places every time. Each line is a yes or a finding:

- **Install and update:** the release installs or updates from Package Center; the server comes back with its data; Health has no errors.
- **The library:** every folder is in, or waiting in Library import with a reason that's true; nothing on the NAS changed (a listing before and after, compared by the agent on this Mac).
- **Profiles (from A2):** each person picks their profile on the Apple TV and the phone; one person's Continue watching never shows another's; a PIN is asked where set.
- **Playing:** a few titles of each kind on each client, at home and away: starts within a few seconds, seeks, resumes where it stopped on another client, subtitles on and off, audio tracks, the end and Next up; the TV with the remote only.
- **What's hard:** a 4K or HEVC file, a file with PGS or VobSub subtitles, a TrueHD or DTS track, an `.avi`, a multi-episode file, a FLAC album.
- **Afterwards:** Now playing and its history are right; System › Logs has no client reports the owner didn't notice; the NAS's CPU and memory during a transcode (Resource Monitor).

## Shows on the server (B)

- **The model** (new ADR 0064, with ADR 0012's dated section): a show, its seasons and its episodes are `media_items` rows (`type` gains `show`, `season` and `episode`, with `parentId` linking them, as ADR 0012 planned). Files and versions attach to episodes; a multi-episode file is one file with several episodes. Shows are addressed by TMDB's numbers, as the drafted contract has them.
- **Metadata from TMDB** ([answer 8](#the-owners-answers)): TMDB's TV details, seasons, episodes and external ids through `packages/metadata`'s fetch seam and cache (ADR 0029, 0030), with highsea's own key (ADR 0057). A `tvdb-…` in a folder name or a TVDB id in `tvshow.nfo` is turned into TMDB's show through `find`, which takes `tvdb_id` for shows, seasons and episodes ([TMDB: Find by ID](https://developer.themoviedb.org/reference/find-by-id)). TMDB's recordings for the tests come from `bun run record:tmdb`.
- **The parser:** `packages/parser` learns seasons and episodes as Sonarr's naming writes them: `SxxEyy`, multi-episode `SxxEyyEzz` and `SxxEyy-Ezz`, `NxNN`, `Season NN` folders and `Specials` as season 0, and full-season packs for C1. Daily and absolute numbering wait for their phase.
- **`@highsea-tv/media/shows`** (ADR 0036's convention): adding a show, its seasons and episodes from TMDB, refreshing them, matching files to episodes, the existing-library import of show folders (`tvshow.nfo` first, then the folder's name), the scan, and the client and admin reads the drafted routes need.
- **Playback and watch state:** an episode plays through the films' routes with the `episode` type, as drafted. Watch state per episode (ADR 0054's dated section: the 95% rule shared with resume, a season or a show marked at once); Continue watching has one card per show for its next episode, and Next up and New episodes come from the episodes, as client-home.md has them.
- **Subtitles:** the providers' episode search (OpenSubtitles.com, Subdl and SubSource each take a season and episode), as `@highsea-tv/subtitles/shows`. On a read-only folder they're kept in the data folder, as for films.
- **Serving the drafts:** the `shows` and `series` groups and Shows' settings are served; public info's `sources` lists `shows`, so the clients and the admin draw what they already have. Each route the server now answers loses `draft()`, and `bun run openapi` refreshes `openapi.json`.
- **Not in B:** monitoring, searching and downloading episodes (C1); Skip intro and credits (C2). The admin's Search buttons and monitoring toggles stay hidden on a read-only root folder, which is all B has.
- **Touches:** `packages/db/src/schema/media.ts` (and `bun run generate`), `packages/parser`, `packages/metadata`, `packages/media/src/shows/` (new) and `src/shared/`, `packages/subtitles/src/shows/` (new), `packages/runtime/src/playback.ts`, `home-rows.ts`, `now-playing.ts` and `trickplay.ts`, `apps/server/src/api/` (the shows and series routes, `drafts.ts`), `packages/api-contract` (drafts made real), `packages/admin`'s Shows screens on real data, `apps/client`'s shows on real data; the guides for Shows in the admin and in the apps.
- **Tests:** the parser's episode cases (from Sonarr's own parser fixtures' shapes, written fresh); show import from `tvshow.nfo` and from names; files matched to episodes, multi-episode files included; watch state across a season; TMDB's TV calls from recordings; the drafted routes' answers matched against the mock's (the contract's tests); the end-to-end run with a small show of clips made by `@highsea-tv/media/testing` (ADR 0040).

## Shows in full (C)

### Monitoring and downloading, as Sonarr does (C1)

Built only when the owner decides to move shows from Sonarr to highsea ([answer 3](#the-owners-answers)); until then C1 waits and C2 goes first.

- **Monitoring** a show, a season or an episode, with Add a show's options as drawn (all, future, missing, the first season, none).
- **Searching and grabbing:** release search by season and episode on the indexers (ADR 0035), season packs against single episodes, the decision engine with episode sizes per quality (`series-settings.ts`'s `episodeSizes`), RSS and the backlog sweep (ADR 0045) taught episodes.
- **Importing** episodes from downloads through the pipeline (ADR 0039), episode naming (`episodeNaming`), season folders, multi-episode files.
- **Wanted, the calendar and its feed** for episodes; notifications for episodes and seasons (Grabbed, Imported, Upgraded), as stage 6 drew.
- **A Sonarr importer** beside the Radarr one (`@highsea-tv/importers/sonarr`, Sonarr's API v3, path mappings as ADR 0041 has them), so the owner's shows move with their monitoring and profiles.
- **Touches:** `packages/media/src/shows/`, `packages/downloads`, `packages/indexers`, `packages/quality`, `packages/runtime/src/automation.ts`, `packages/notifications`, `packages/importers/src/sonarr/` (new), the admin's Wanted, calendar, Activity and Migration; their guides.
- **Tests:** season-pack decisions, a grab to import of a fake episode through the fake indexer and the in-process tracker, Sonarr's importer against a fake of its API.

### Skip intro and Skip credits (C2)

- **Markers** (new ADR 0067): each episode's intro and credits as time ranges, as Jellyfin's media segments are ("Commercial, Preview, Recap, Outro, and Intro", [Jellyfin: Media segments](https://jellyfin.org/docs/general/server/metadata/media-segments/)):
  - from chapters first: a chapter named like an intro or credits gives its range, as Jellyfin's Chapter Segments Provider does;
  - then by comparing a season's episodes' audio: the opening minutes of each episode fingerprinted with ffmpeg's `chromaprint` muxer ([FFmpeg: chromaprint](https://ffmpeg.org/ffmpeg-formats.html#chromaprint-1)), and the stretch the episodes share is the intro; the last minutes likewise for credits. A background job per season, in the worker pool, safe to repeat (ADR 0022);
  - the owner can correct a marker in the admin's episode row.
- **The clients:** the player's Skip intro and Skip credits as player.md already has them; the contract's `intro` and `credits` are filled.
- **Touches:** `packages/stream` (a `markers` subpath) or `packages/media/src/shows/`, `packages/runtime` (the job), `apps/client/src/player/`, the admin's show page, player.md's "As built".
- **Tests:** two clips sharing an intro found at the right place within a second; chapters read; the job repeated without change.

## Music (D)

- **Music in the admin, prototyped first:** prototype-gaps.md's stage 7, the one screen set with no design, drawn in `packages/admin` over the mock and approved before it's built ([answer 12](#the-owners-answers)): Music in the sidebar (artists, albums, their files, Rescan and Unmatched), music's root folders, naming for music, Storage's Music part, Now playing's songs. A spec, `docs/product/music.md`, comes with it.
- **The model** (new ADR 0065): artists, albums, discs and tracks with their own string ids, as the drafted contract addresses them; `media_items.tmdb_id` becomes nullable for music, or music gets its own tables (the ADR decides, from ADR 0012's model).
- **Metadata from the files first** ([answer 10](#the-owners-answers)): ffprobe already reads every tag the sample had (album artist, album, track and disc, date, MusicBrainz ids), so no new tag reader is needed; `album.nfo` and `artist.nfo` give MusicBrainz ids where tags don't; folder art (`folder.jpg`, artist art) is used as found.
- **MusicBrainz and the Cover Art Archive** where an id is known, for artists' pictures and albums' release dates, at MusicBrainz's documented rate: "Currently that rate is (on average) 1 request per second" per address, with a User-Agent of "Application name/<version> ( contact-url )" ([MusicBrainz: Rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)), here `highsea/<version> ( https://highsea.tv )` with no owner's details. Behind the fetch seam, cached, and recorded for tests as TMDB is.
- **Import:** the existing-library import of `Artist/Album (Year)/` folders and `CD1`/`CD2` discs; tracks grouped by album artist and album from tags, then by folder; `.lrc` lyrics kept; music videos (`.mp4`) set aside for later.
- **Playback** (ADR 0051's and 0052's dated sections): songs direct play by byte ranges when the device plays the format (FLAC and MP3 play on every platform highsea targets), transcoded to AAC when not; gapless and loudness from a background analysis, as the drafted `QueuedSong.loudness` has it.
- **Audio in the clients:** `expo-audio` (Expo's own module; lists iOS, tvOS and web, and on iOS "adds the `audio` background mode" and lock screen controls through `setActiveForLockScreen`, [Expo: Audio](https://docs.expo.dev/versions/latest/sdk/audio/)), added under the dependency rules; the music player's store plays real audio on the web, the desktop app, the iPhone and the Apple TV.
- **Playlists:** each person's own, as drafted (made, renamed, reordered, deleted); smart and shared playlists stay later.
- **Touches:** `packages/db`, `packages/media/src/music/` (new), `packages/metadata` (MusicBrainz, the Cover Art Archive), `packages/runtime/src/playback.ts`, `packages/stream` (audio decisions), `apps/server/src/api/` (the music routes), `packages/admin` (Music), `apps/client/src/music-player/` and `music/`, `@highsea-tv/client/music-player`; the guides for Music in the admin and the apps.
- **Tests:** import of a fixture album with discs and of tags without MusicBrainz ids; MusicBrainz from recordings; audio decisions per device; the music player's store driving a fake audio module (Jest).

## The phase's close (E)

- **The full checks** under Node 26.11.1, every sweep, the simulators' included (`/checks full`).
- **The guides:** Shows and Music in the admin and the apps, read-only libraries, the Synology install with read-only media, getting the apps.
- **The specs and ADRs** brought to what was built (each part does its own; E checks them).
- **A stable release** with the phase in it, on the owner's word.
- **The findings:** each one fixed, or carried into the next plan with its reason.
- **What's next:** the plan's last section lists what real use put first on the gap list.

## ADRs

- **New:**
  - **0063, libraries highsea only reads** (A1): read-only root folders, what highsea never does to them, NFO ids for matching, and switching a folder to managed.
  - **0064, shows on the server** (B): the show, season and episode items, TMDB as the source with TVDB ids through `find`, the parser's numbering, `@highsea-tv/media/shows`.
  - **0065, music on the server** (D): the model, tags first, MusicBrainz and the Cover Art Archive, audio playback, `expo-audio`.
  - **0066, client error reports** (A2): what the clients send, only to their own server, and where the owner sees it.
  - **0067, intro and credits markers** (C2): chapters, then chromaprint across a season, and the owner's corrections.
  - **0068, profiles** (A2b): profiles under an account, watch state per profile, the profile watching now kept per device on the session, PINs hashed and rested.
- **Dated sections:** 0012 (shows and music in the item model, B and D), 0036 (the `shows` and `music` subpaths), 0039 (reading NFOs, A1; episodes and tracks imported, B and D), 0041 (the Sonarr importer, C1), 0045 (automation for episodes, C1), 0023 (the profile on a session and device token, A2b), 0027 (Home per profile, A2b), 0047 (client reports beside crash reports, A2), 0049 (watch rules per profile, A2b), 0050 (releases at each part, A1; TestFlight uploads, A2), 0051 and 0052 (audio, D), 0054 (per profile, A2b; episodes, B), 0057 (the package's read-only media, A1), 0059 (TestFlight, A2) and 0061 (the drafts served, A2b, B and D).

## Risks

- **Writing to the owner's library by mistake.** The NAS's media is live. The read-only mount is the guard in A1, ADR 0063's rule is the second, and the checklist's before-and-after listing is the proof. Nothing is managed until the owner switches a folder over.
- **Two programs managing the same files.** Once highsea manages a kind, Radarr or Sonarr must stop managing it, or each will rename and replace the other's files. Switching a kind over is the owner's step, with the importer first ([answer 3](#the-owners-answers)).
- **The DS1520+'s capacity.** Its J4125 and its memory carry the existing stack and highsea at once. Library import of 9,000 files, trickplay for 1,300 films and fingerprinting 8,000 episodes are background jobs that could take days; each runs at low priority and its progress is visible, and the checklist records the NAS's load.
- **TMDB's rate and highsea's shared key.** Importing 270 shows and their 8,000 episodes is many calls on highsea's own key (ADR 0057). The metadata cache and the `find` route keep it down; the import goes at TMDB's documented pace.
- **SMB and filesystem watching.** On the NAS, highsea reads its own disks and watching works; from a Mac over SMB it doesn't, which only matters for development.
- **Publishing more often.** Real use means a release per part. Each is the owner's word; a bad release reaches only the owner's NAS, and the package's backup before an update (ADR 0047) is the way back.
- **Apple's membership.** The owner joins the Apple Developer Program (answer 6); until it's approved and the first TestFlight build is through review, the iPhone and Apple TV run the personal team's builds, which expire every 7 days.
- **Chromaprint in the image's ffmpeg.** FFmpeg's muxer needs `--enable-chromaprint`. Debian's build is expected to have it; C2 confirms with `ffmpeg -muxers` in the image before relying on it, and falls back to chapters only if not.
- **Music's metadata.** Only about half the sample has MusicBrainz ids. Tags carry the library, but artists' pictures and dates will be missing where no id is found; AcoustID fingerprinting is the later fix.
- **Watch state moving under profiles.** Every reader of watch state changes in A2b; one that's missed shows one person's films in another's Continue watching. The tests above name each reader, and the checklist's profiles line checks it in real use. The migration is safe to run once and is backed up before (ADR 0047's backup before an update).
- **Profiles' PINs aren't security.** A four-digit PIN keeps a child from another profile, not a determined person; the guide says so, as Netflix's and Plex's do.
- **Size.** Shows alone are a phase's worth of server work. The parts keep each review to one kind, and C1 waits for the owner's choice.

## Open questions for the owner

1. **The order of the kinds.**
   - **Recommended:** films (A), then shows' library (B), then shows in full (C), then music (D). Shows are the bigger library and their design is complete; music needs an admin design and audio first.
   - Or: films, shows' library, then music, then shows' acquisition and markers last. Every kind is in highsea sooner, and Sonarr keeps downloading shows meanwhile.
   - Or: films, then music, then shows. Music is the smaller library, but the most missing.
2. **Where highsea runs.**
   - **Recommended:** the DS1520+, installed from Package Center through `packages.highsea.tv`, the way an owner installs it. It tests the install, updates and the NAS's hardware for real.
   - Or: Docker on the NAS with the root `compose.yaml` through Container Manager. It's closer to the image, but skips the package owners would use.
   - Or: this Mac, reading the NAS over SMB. It's quickest to iterate, but nothing about the install, updates or the NAS is tested, and watching doesn't work over SMB.
3. **highsea beside today's stack.**
   - **Recommended:** highsea reads the media read-only through A1 to B, with Radarr, Sonarr and Lidarr still downloading. Each kind moves to highsea when the owner says so (films after A2, shows with C1), through the importer, and the old app is stopped for that kind.
   - Or: highsea takes over films from A1, with Radarr stopped. It tests downloading for real sooner, but a bug can touch live files on the first day.
   - Or: read-only for the whole phase. Safest, but acquisition is never tried on real use.
4. **Remote access.**
   - **Recommended:** Tailscale on the NAS for the owner's own use away from home. No ports open, and the clients reach the NAS's Tailscale address. Its package is installed by hand from Tailscale's own server, not Package Center ([Tailscale: Synology](https://tailscale.com/kb/1131/synology)).
   - Or: the router's port forward to highsea's HTTPS (ADR 0026) with the owner's own certificate. It's the path highsea's users take, but needs a certificate and an open port today.
   - Or: build ACME certificates (Let's Encrypt) now, as part of A2. It completes highsea's own remote path, but adds a feature before real use starts.
5. **How releases reach the NAS.**
   - **Recommended:** a published stable release at each part's sign-off (0.4.0, 0.5.0 and on), each on the owner's word, updated through Package Center. Before 1.0, "anything MAY change at any time" ([SemVer, item 4](https://semver.org/#spec-item-4)).
   - Or: beta releases, with `packages.highsea.tv` taught a beta channel. Stable stays still for others, but the package source changes first.
   - Or: local images installed by hand on the NAS between releases. Fastest, but doesn't test updates.
6. **Getting the native apps onto the owner's devices.**
   - **Recommended:** join the Apple Developer Program and use TestFlight, with an approval-gated upload in the release workflow. Builds last 90 days, cover the Apple TV, and test the route people will use.
   - Or: the personal team's builds, rebuilt every 7 days from this Mac. Free, but the apps stop opening each week and the Apple TV needs Xcode each time.
   - Or: the web and the desktop app only in this phase. Simplest, but the TV and phone get no real use.
7. **How findings are recorded.**
   - **Recommended:** one line per finding in this plan's Progress, under its part, and a Shepherdr task for each that needs work. They stay with the plan and flow into the existing task loop.
   - Or: GitHub issues on the repository. Searchable and linkable, but public, and the plans already hold the history.
8. **Where shows' metadata comes from.**
   - **Recommended:** TMDB, which highsea already uses and ships a key for, with TVDB ids turned into TMDB's through `find`. The drafted contract addresses shows by TMDB's numbers.
   - Or: TheTVDB, as Sonarr uses. Its numbering matches Sonarr's folders more often, but its API is licensed through TheTVDB's sales pages with no published price, asks for attribution with a link on every screen showing its data ([TheTVDB: API information](https://thetvdb.com/api-information)), and needs a second key.
9. **Skip intro and Skip credits.**
   - **Recommended:** markers from chapters, then chromaprint across a season, in C2, with the owner's corrections. The way Plex and Jellyfin's intro plugins work.
   - Or: chapters only. Small, but few of the owner's episodes are likely to have named chapters.
   - Or: after this phase.
10. **Music's metadata.**
    - **Recommended:** the files' tags first, then MusicBrainz and the Cover Art Archive where an id is known. The owner's tags are good, and MusicBrainz's one request a second stays a background detail.
    - Or: MusicBrainz for every album, searched when there's no id. Fuller pictures and dates, but slow at a request a second, and wrong matches to correct.
    - Or: tags only. Fastest, but no artist pictures where the folder has none.
11. **Music videos** (51 `.mp4` in the music folders).
    - **Recommended:** set aside in D and listed, then shown on the artist's page in a later part. Nothing in the design draws them.
    - Or: drawn and built in D. More design work for 51 files.
12. **Music in the admin.**
    - **Recommended:** prototyped first in D, as stage 7 planned, since it's the one screen set with no design. Approved, then built.
    - Or: built straight from Shows' admin pattern without a prototype. Quicker, but the owner reviews it only once built.
13. **What the existing plans become.**
    - **Recommended:** prototype-gaps.md's stage 7 is folded into part D, and that plan closes with it. 4.5c (Android) waits until the owner has an Android device to use it on. 4.6 (downloads to a device) comes after this phase, unless real use asks for it sooner. The gap analysis stays the backlog, reordered by what the findings show.
    - Or: 4.6 inside this phase as part F, for travel. It adds a large part before music's real use.
    - Or: 4.5c inside this phase too. It adds Android before anyone uses it.
14. **Profiles (Who's watching).**
    - **Recommended:** left drafted, unless real use finds that the household needs separate watch state on a shared TV. Then it's scoped as a part of its own.
    - Or: built in A2, so each person's Continue watching is theirs from the start on the Apple TV.

15. **The watch state already recorded** (follows from the owner's change to question 14).
    - **Recommended:** it all goes to each account's own profile in A2b's migration. Today only the owner has watched on highsea, so it's the owner's.
    - Or: start every profile empty. Simpler, but the owner's resume points and Watched marks from testing are lost.
16. **Where the profile watching now is kept** (follows from question 14; client-settings.md says switching "on one app is seen on the others").
    - **Recommended:** per device: the session or device token carries it, so the Apple TV can watch as one person and the phone as another on one account. The list of profiles, their names and PINs are still the account's and seen on every app.
    - Or: per account, as client-settings.md's sentence reads: switching on one app switches every app. Simpler, but two people can't watch at once on one account.
17. **Kids' profiles** (follows from question 14; client-settings.md and users-devices.md list them as open).
    - **Recommended:** not in A2b. Every profile sees the whole library; ratings limits and a kids' Home are scoped later if the household asks.
    - Or: a kids' profile in A2b, limited by rating (TMDB's certifications) with its own Home. More design and server work before real use starts.

## The owner's changes

On 2026-11-15, reviewing this scope, the owner made 1 change:

1. **Profiles are built in A2** (question 14), so each person's Continue watching is their own from the start on the Apple TV: [Profiles (A2b)](#profiles-a2b), with ADR 0068, and A2 built in two batches. Questions 15 to 17 follow from it, and the owner answered them the same day.

## The owner's answers

On 2026-11-15 the owner took every recommendation for questions 1 to 13, and changed 14:

1. **Films, then shows' library, then shows in full, then music.**
2. **highsea runs on the DS1520+,** installed from Package Center through `packages.highsea.tv`.
3. **highsea reads the media read-only beside today's stack,** and takes over a kind when the owner says so, through the importer, with the old app stopped for that kind.
4. **Tailscale on the NAS** for remote use.
5. **A published stable release at each part's sign-off,** each on the owner's word, updated through Package Center.
6. **The Apple Developer Program and TestFlight,** with an approval-gated upload in the release workflow.
7. **Findings are lines in this plan's Progress,** with a Shepherdr task for each that needs work.
8. **TMDB for shows' metadata,** with TVDB ids turned into TMDB's through `find`.
9. **Skip intro and Skip credits from chapters, then chromaprint across a season,** in C2, with the owner's corrections.
10. **Music's metadata from tags first,** then MusicBrainz and the Cover Art Archive where an id is known.
11. **Music videos are set aside in D** and listed.
12. **Music in the admin is prototyped first** in D.
13. **Stage 7 of prototype-gaps.md folds into D;** 4.5c waits for an Android device; 4.6 comes after this phase; the gap analysis stays the backlog, reordered by the findings.
14. **Changed by the owner:** profiles (Who's watching) are built in A2, so each person's Continue watching is their own from the start on the Apple TV.

On 2026-11-15 the owner then took every recommendation for questions 15 to 17, which follow from the change to 14:

15. **The watch state already recorded goes to each account's own profile** in A2b's migration.
16. **The profile watching now is kept per device,** on the session or device token, so the Apple TV and a phone can watch as different people at once on one account. client-settings.md's Switch profile is changed to match.
17. **Kids' profiles are left out of A2,** and scoped later if the household asks.
