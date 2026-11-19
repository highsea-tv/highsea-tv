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
