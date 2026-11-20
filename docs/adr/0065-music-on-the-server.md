# 0065. Music on the server: its own tables, tags first, MusicBrainz where an id is known

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Phase 5's part D brings the owner's music into highsea ([phase-5-real-use.md](../plans/phase-5-real-use.md), "Music (D)", the owner's answers 10, 11 and 12). The library, as described in the plan's "What the owner's library looks like":

- Lidarr's layout, `Artist/Album (Year)/`, with 18 albums split into `CD1`/`CD2` folders;
- Lidarr's `artist.nfo` and `album.nfo`, and a `folder.jpg` beside the tracks;
- 3,265 MP3, 3,139 FLAC and 8 M4A files, 25 `.lrc` lyrics and 51 `.mp4` music videos;
- names like `Blur_Parklife_01_Girls & Boys.flac`;
- about half the tracks tagged with MusicBrainz ids.

Answer 10 sets the order: the files' tags first, then MusicBrainz and the Cover Art Archive only where an id is known, with no searching MusicBrainz by name. Answer 11 sets the videos aside, counted. Nothing searches for or downloads music in Phase 5.

The contract already drafts what the admin shows (`@highsea-tv/api-contract`'s `music-library.ts`, HT-68): artists, albums with their discs, tracks with their files, Unmatched folders with a reason, and each folder's figures.

[ADR 0012](0012-unified-media-item-model.md) planned one `media_items` tree for every kind, and shows joined it ([ADR 0064](0064-shows-on-the-server.md)). Music fits that tree badly:

- `media_items` is keyed by TMDB id, unique per type, and music has none. `tmdb_id` would have to become nullable, and SQLite can only drop a NOT NULL by rebuilding the table (https://www.sqlite.org/lang_altertable.html#otheralter), the table the owner's films and shows are in.
- Its acquisition columns (quality profile, minimum availability, monitored, status) mean nothing for music highsea only reads.
- An album is found again by its folder and a track by its file, not by a catalogue id.

The owner chose music's own tables when asked (2026-11-19).

## Decision

**The model** (`packages/db/src/schema/music.ts`, migration `0025_music`, which only adds tables):

- **`music_artists`:** an album artist. Found again by MusicBrainz id when known, else by `name_key`. The name key is folded, with a leading "The" and a trailing ", The" dropped.
- **`music_albums`:** one folder, its disc folders included, found again by `path`. It records `source` (`tags` or `musicbrainz`), the release and release group ids, and the cover found (file, embedded or the Cover Art Archive's).
- **`music_tracks`:** a track and its file in one row, as ffprobe reads it:
  - disc and number;
  - format, codec, bitrate, sample rate, and bit depth for lossless files only;
  - size and mtime, so an unchanged file isn't read again;
  - the `.lrc` beside it.
- **`music_unmatched`:** a folder that couldn't be read as one album, with its reason (`no-tags`, `no-album`, `many-albums`, `unreadable`), a guess from its names, and the owner's Ignore.
- **`musicbrainz_cache`:** MusicBrainz's and the Cover Art Archive's answers as sent, by kind and id. This is [ADR 0030](0030-metadata-cache.md)'s cache for a source with no TMDB id.
- Deleting an artist removes their albums and an album its tracks (`ON DELETE CASCADE`, https://www.sqlite.org/foreignkeys.html#fk_actions).

**Reading the files** (`@highsea-tv/media/music`, following [ADR 0036](0036-domain-packages-with-subpath-exports.md)):

- **ffprobe, the films' binary and arguments** (`shared/ffprobe.ts`), so there's no new dependency. FFmpeg maps each format's tags to its generic keys:
  - Vorbis comments: `ff_vorbiscomment_metadata_conv`;
  - ID3v2: `ff_id3v2_34_metadata_conv` and `ff_id3v2_4_metadata_conv`, with TXXX frames by their description;
  - MP4: `libavformat/mov.c`.
- **Tag names** are compared folded (case, spaces, `_` and `-`). MusicBrainz's names are Picard's (https://picard-docs.musicbrainz.org/en/appendices/tag_mapping.html):
  - `MUSICBRAINZ_ALBUMID` / `MusicBrainz Album Id` is the release;
  - `…RELEASEGROUPID` is the release group;
  - `…ALBUMARTISTID` is the album artist;
  - `…TRACKID` is the recording.
- **A cover in the file** is a stream with `disposition.attached_pic`. An audio stream with no sample rate or channels (a damaged file) counts as unreadable.
- **The folder's NFOs:** Kodi's `album.nfo` and `artist.nfo` (https://kodi.wiki/view/NFO_files/Music) are read for their MusicBrainz ids when the tags have none.
- **Covers and pictures in the folder** use Kodi's names (https://kodi.wiki/view/Music_artwork).

**Grouping** (`group.ts`): an album folder is one album when its tracks' album tags agree.

- **The album artist** is the album artist tag, else the one track artist they share, else "Various Artists", as Picard tags compilations.
- **A track's disc** is its tag, else its `CD2` folder, else 1.
- **A track's number** is its tag, else the digits in its name, else its place in the folder.
- **A track's title** is its tag, else its name.

**The scan** (`music.scan`): one job imports and keeps in step, every 12 hours, for a folder that watching reports, from Scan now, and at setup.

- Files are only read. A read-only folder ([ADR 0063](0063-libraries-highsea-only-reads.md)) is scanned like any other, and nothing is renamed.
- A folder whose files are unchanged isn't read again.
- When an album's folder is gone, the album goes, and then an artist left with no albums.
- An unreadable root folder is skipped whole.
- A repeat scan changes nothing ([ADR 0022](0022-job-queue.md)).

**MusicBrainz** (`@highsea-tv/metadata`'s `music`, through the fetch seam, [ADR 0029](0029-external-services.md)):

- **Lookups only:**
  - `/ws/2/artist`, `/release-group` and `/release` by id, with `inc` for genres, artist credits and labels;
  - the Cover Art Archive's `/release-group/{id}` (https://musicbrainz.org/doc/MusicBrainz_API, https://musicbrainz.org/doc/Cover_Art_Archive/API).
- **MusicBrainz's rules** (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting):
  - one request a second, serially, per host;
  - a 503 waited out with its `Retry-After`;
  - the User-Agent `highsea/<version> ( https://highsea.tv )`, with nothing of the owner's in it.
- **The cache:** answers are kept for 30 days and a 404 is kept as nothing. When MusicBrainz is down, the stale answer serves and the client rests for 15 minutes.
- **The `music.metadata` job** runs after a scan that changed something. For an album with an id:
  - the release gives the label and date;
  - the release group gives the kind, first release date and genres;
  - the Cover Art Archive's front cover is asked for only when the folder and the files have none.

  An artist with an id gets MusicBrainz's sort name and genres. Names and titles stay as the tags have them. The cached recordings in `packages/metadata/test/fixtures/musicbrainz` are replayed in tests.

## Consequences

- Music never touches the films' and shows' rows. The migration only adds tables, and a test proves it over a database that holds both.
- What's shared by every kind has to come to music on its own:
  - plays and Now playing;
  - watch state, called play counts for music;
  - Search;
  - the dashboard's figures.

  The next part of D adds music's own tables or joins for each. That's more work than a row in `media_items` would have been, and still less than rebuilding that table.
- Albums are found again by folder, so moving an album's folder outside highsea reads as one album removed and another added. Play history then needs tracks' MusicBrainz recording ids, or the file's tags, to carry across.
- An album without MusicBrainz ids keeps only what its tags say, as answer 10 asks.
- Serving is the next part's work:
  - the routes and admin screens (the contract's drafts);
  - playback;
  - the cover and picture image route;
  - artists' pictures from fanart.tv ([ADR 0070](0070-fanart-tv-second-artwork-source.md); `fanart_images` already has the `artist` subject).
- Music videos are counted per artist and left on disk for a later part (answer 11).

## 2026-11-19: the routes served, covers, plays, Match and naming (phase 5 D; HT-101)

The contract's drafted music routes are served (`apps/server/src/api/music.ts`): the admin's artists, albums with their discs, tracks and files, Unmatched with Match and Ignore, Refresh, each Music folder's figures and track naming; the apps' library, album, artist, queue, songs, Search and each profile's playlists. Public info's `sources` lists `music`, and `music` is a library a user can be given (`LIBRARIES`). Someone without it gets an empty library and a 404 for the rest, as for shows.

- **Covers and pictures** at `/api/v1/images/music/{album|artist}/{id}` (`@highsea-tv/media/music`'s `images.ts`). An album: its folder's cover file, then the picture in one of its files (copied out once with ffmpeg's image2 muxer, https://ffmpeg.org/ffmpeg-formats.html#image2-1), then the Cover Art Archive's front cover for its release group (https://musicbrainz.org/doc/Cover_Art_Archive/API), fetched once. An artist: the folder's picture, then fanart.tv's (0070's section of this date). Copies are kept under the data folder's `images/music/`, named by a hash of their source; paths come only from the library's rows. Answers carry an ETag and `Cache-Control: private, max-age=86400`.
- **Plays** are a table of their own, `music_plays` (migration 0028): who, which profile and device, the track with its artist's and album's names copied in (so a deleted artist leaves the history readable), the seconds heard, and whether it counts. It counts past half the track or four minutes, Last.fm's rule for a scrobble (https://www.last.fm/api/scrobbling). A song shows on Now playing and in its history beside films; Stop ends it as it ends a film. Recently played (`music_recent`) is what a profile queued, and Home gains a Recently played row.
- **Match** is kept by folder in `music_matches` and laid over the tags at every scan, so the folder stays an album; nothing on disk changes. There's no searching MusicBrainz by name (answer 10).
- **Track naming** is Lidarr's, with its defaults and renaming off (https://wiki.servarr.com/lidarr/settings#track-naming), saved and checked (a track's format needs `{track}`). Nothing renames a file yet: it's acted on once highsea files music it downloads.
- **Storage** counts the Music folders' tracks in `usedBy.music`.

What real files forced: an album's year, release date and label are nullable (a rip with no date has none). Loudness is left empty and an artist's bio null until a source gives them.

## 2026-11-19: the clients' audio (phase 5 D; HT-108)

The apps play songs. One engine, `createMusicAudio` in `@highsea-tv/client/music-player` (`audio.ts`), sits between the music player's store and two seams: the audio output and the server. The store stays the one truth for what plays; the engine makes the output and the server follow it, and the output's own controls change the store.

- **The server, per song:** `POST /music/tracks/{id}/play` with the device's built-in profile (`ios`, `tvos`, or the browser's from its user agent, as the film player names it, 0052), then the answer's address loaded by byte ranges. A transcode's address is asked for its first byte before it's loaded (`Range: bytes=0-0`), since the server makes the whole AAC first and its 503 carries `details.reason` (`no-ffmpeg`, `transcode-failed`), which an audio element's error never shows. The place goes to `music.progress` every 10 seconds while a play is open, paused or not (it keeps the address alive), and at once on pause and play. Next, Previous, a song chosen in the queue, the song's end and Stop each end the play with `DELETE`, which counts it and fills Recently played. Repeat one, or a queue of one with Repeat all, starts a new play each time round, so each counts.
- **The server's answers:** a report's 404 with `reason: 'stopped'` (Now playing's Stop) pauses the music and says who stopped it, in the film player's words; `playback.stopped` asks at once, as the film player does. A 404 with no reason (the play went quiet and was swept) starts a new play quietly when the music next plays. A report the network drops is left; the next one tries again. `no-ffmpeg` pauses and says the song needs making into AAC and the server has no ffmpeg. The stream's 503 now carries its code (`unavailable`) and details (`apps/server/src/stream/index.ts`). A server with no ffmpeg at all answers `no-ffmpeg` too: the transcoder's spawn fails with `ENOENT` ([Node: child_process, event 'error'](https://nodejs.org/api/child_process.html#event-error)), which `packages/media/src/music/playback.ts` now tells from a file ffmpeg couldn't read (`transcode-failed`).
- **The output** is one expo-audio `AudioPlayer` (`createAudioPlayer`, since it outlives every screen) on the iPhone, the Apple TV, the web and the desktop app (https://docs.expo.dev/versions/latest/sdk/audio/). While music plays the audio mode is `playsInSilentMode`, `shouldPlayInBackground` and `interruptionMode: 'doNotMix'`, which `setActiveForLockScreen` needs; the interface sounds' `mixWithOthers` comes back three seconds after the music goes. expo-audio's config plugin adds the `audio` background mode on both Apple apps, with no microphone.
- **The lock screen and Now Playing:** `setActiveForLockScreen` with the song, the artist, the album and the cover. iOS fetches `artworkUrl` with no headers (expo-audio's `MediaController.swift`), so the phone and the TV pass the `file://` of the cover expo-image cached with the device's token, as the film player's Now Playing does. Its controls are play, pause and the scrubber: on iOS a single player answers no Next or Previous (`supportsNextTrack` is expo-audio's playlist's alone), so those wait for the playlist (below). On the web expo-audio drives the Media Session API from the same call, and the app adds `nexttrack` and `previoustrack` handlers, which the keyboard's media keys reach (https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setActionHandler).
- **The store** gains `setPlaying` (the output's own play and pause) and `setClock`: its timer runs only where nothing is heard (the mock, the prototype), and stops while real audio moves the place.
- **Refresh's look-up** after an artist's or album's Refresh is now a queued `music.metadata` job naming that artist or album as its subject (HT-106), so Music's pages mark it while it runs, as the mock already did.

**Not yet, and what each needs:** gapless play needs the next song loaded before this one ends: expo-audio's `AudioPlaylist` (an `AVQueuePlayer` on iOS) with the next play asked for ahead, which the server would have to show as queued rather than playing; it also gives the lock screen Next and Previous. Loudness levelling needs the analysis 0052's section names (a ReplayGain-style gain per track, or EBU R128 from ffmpeg's `ebur128` filter) and the output's volume set from it per song. Downloads for offline play stay later.

## 2026-11-19: gapless and loudness (phase 5 D; HT-117)

Songs follow each other without the request between them, the lock screen has Next and Previous on the iPhone, and songs play at an even level.

- **Ahead plays.** As soon as a song's play is open, the engine asks for the song that follows it by the store's rule (the next song, the first again under Repeat all, the same song under Repeat one) with `POST /music/tracks/{id}/play` and `ahead: true`. The server opens the play and its address but keeps it off Now playing: no `sessions.updated`, not in `sessions()`, and swept only after the address's own six hours. Its first report is its start: from then it's shown, its time counts from that report, and it ends and counts as any play does. An ahead play ended without a report leaves no row (`packages/media/src/music/playback.ts`). A transcode's prepared song is asked for its first byte as any is, so the AAC is made before it's needed.
- **The seam** (`AudioOutput` in `@highsea-tv/client/music-player`) gains `prepare(source | null)`, which hands the output the next source, `advance()`, which moves to it now (the app's Next onto the prepared song), and the event `advanced`, which says the output moved on by itself (the song's end, or the lock screen's Next). Each source carries its gain. On `advanced` the engine ends the old play, reports the new one at 0 (its start), and moves the store with `ended()`, or with `next()` when the old song was more than two seconds from its end (the lock screen's Next). A prepared song that's no longer what follows (a queue edit, Shuffle, Repeat) is let go and its play ended unheard. The tests keep a fake output.
- **The iPhone and the Apple TV** play through expo-audio's `AudioPlaylist` (`apps/client/src/music-player/output-native.ts`), an `AVQueuePlayer` (https://developer.apple.com/documentation/avfoundation/avqueueplayer). It's the only expo-audio player with Next and Previous on the lock screen: `setActiveForLockScreen(…, { showNextTrack, showPreviousTrack })` turns on `nextTrackCommand` and `previousTrackCommand` for a player whose `supportsNextTrack` is true, the playlist's alone (expo-audio's `MediaController.swift`). Those commands move the playlist natively, so the output reads them from its status: the index going up onto the prepared item is `advanced`; going down is the lock screen's Previous, and the playlist is put straight back on the current song while the engine is told `previous` (the store restarts the song, or goes back early in one, with a new play). A first item, the same song again, gives the first song something to go back to. Prepared items are appended and removed after the current one, which expo-audio does without touching the current (`add`, and `remove(at:)` of a later index); everything else rebuilds the queue (expo-audio's `AudioPlaylist.swift`). Background play and the cover's `file://` are as before.
- **The web and the desktop app** play through two HTML audio elements (`output-web.ts`): the prepared one is given its address at once with `preload="auto"` (https://html.spec.whatwg.org/multipage/media.html#attr-media-preload) and started at the playing one's end by its clock: in its last second, at each `timeupdate` (every 15 to 250 ms, HTML's "time marches on" steps), a timer is set for the time left. `ended` still makes the hand-over, and starts the element if the timer hasn't. expo-audio's web playlist opens the next element only at `ended`, so it isn't used. The Web Audio API, which can join buffers to the sample, isn't either: a cross-origin element without CORS gives a `MediaElementAudioSourceNode` silence (https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceNode), and the desktop app's server is another origin. The Media Session (https://w3c.github.io/mediasession/) is set by the output: the song, the cover, `nexttrack` and `previoustrack`.
- **How even the join is.** Neither Apple, Expo nor the HTML standard promises a sample-exact join, so this is each platform's own: on the web, a timer and the next element's start; on the iPhone, AVQueuePlayer's move to an item it has already loaded. `scripts/sweeps/music-gapless.ts` measures the web's: an unbroken tone cut into three FLAC songs, played in Chromium and recorded through the Web Audio API. HT-108's build left 27 and 35 ms of silence at the two joins; starting at `ended` alone left 29 and 32 ms; with the clock's timer, six joins over three runs left between none (under 1 ms) and 16 ms. So the web is close to gapless, not sample-exact; the iPhone's join wasn't measured. An encoder's own padding is the file's: FLAC and WAV have none; an MP3's LAME header and an MP4's edit list say how much to trim, and AVFoundation and Chromium read them.
- **Transcoded songs aren't called gapless yet.** ffmpeg's AAC encoder starts every stream with 1024 samples of priming, and its MP4 muxer writes an edit list that trims them and the last frame's padding (ffmpeg's mov muxer, `use_editlist`; Apple's Technical Note TN2258, "AAC Audio - Encoder Delay and Synchronization", https://developer.apple.com/library/archive/technotes/tn2258/_index.html). A player that honours the edit list joins two transcodes as it joins two M4As; one that doesn't hears about 21 ms of silence at each join. That wasn't measured, so it stays in the PR's "Not proven".
- **Loudness.** A `music.loudness` job per album, its subject the album, measures each track with ffmpeg's `ebur128` filter (`-af ebur128=peak=true:framelog=info`, https://ffmpeg.org/ffmpeg-filters.html#ebur128): its integrated loudness (EBU R 128, ITU-R BS.1770) and its true peak, run at the lowest priority (`setPriority(pid, 19)`, https://nodejs.org/api/os.html#ossetprioritypid-priority) two at a time, reading the file only. Tags come first and are trusted where they're there: ReplayGain's `REPLAYGAIN_TRACK_GAIN`/`_PEAK` and `_ALBUM_` (https://wiki.hydrogenaud.io/index.php?title=ReplayGain_2.0_specification, relative to −18 LUFS, the peak linear) and Opus's `R128_TRACK_GAIN`/`R128_ALBUM_GAIN` (RFC 7845 § 5.2.1, Q7.8 dB relative to −23 LUFS, with no peak, so 0 dBFS is assumed). An album's level is its tags' when every track has album tags; otherwise the energy mean of its tracks' loudness, weighted by length, with the loudest peak: close to BS.1770's gating over the whole album, not equal to it. Rows are kept in `music_loudness` (migration 0031) by the file's size and time, so a changed file is measured again; the job is queued after each scan and at start for anything not yet measured, and resumes where it stopped. The same pass keeps the momentary loudness as the queue's `loudness` envelope, so the player's waveform has a shape for measured songs.
- **The gain.** The play's answer carries `level: { track, album }`, each `{ lufs, peak }` or null. The client brings a song to −18 LUFS, ReplayGain 2.0's reference: `min(10^((−18 − lufs)/20), 10^(−peak/20))`, so a peak never passes full scale. Album mode (the album's level for each of its songs) applies when the queue is one album with Shuffle off; otherwise track mode. The output's volume is the person's volume times the gain, at most 1, since neither `AVPlayer.volume` nor an element's `volume` goes past 1: a quiet song is brought up only as far as the volume leaves room, and a loud one always comes down. On the iPhone the gain changes as the new song's status arrives, so in track mode its first moments may play at the last song's gain; in album mode the gain doesn't change at the join.
- **No setting.** The music spec draws no levelling setting, so there's none: it's always on, track or album by the queue. A song not yet measured plays at its own level.
