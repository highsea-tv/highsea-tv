# 0064. Shows on the server: shows, seasons and episodes in the item tree, TMDB's TV metadata and the parser's numbering

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Phase 5's part B ([plan](../plans/phase-5-real-use.md#shows-on-the-server-b)) brings the owner's 273 shows and about 8,200 episodes onto the server. ADR 0012 planned one `media_items` tree for every kind (`type`, `parent_id`), with extension tables per type. Until now only films used it: `type` was `movie`, every row a title, and every query read it that way.

The drafted contract (`packages/api-contract/src/shows.ts`, `series.ts` and `kinds.ts`, with the mock) already fixes the outside:

- the apps address a show by TMDB's show id (`ClientShow.id`);
- they address an episode by TMDB's episode id with the `episode` type (`TITLE_TYPES`), and a season by its show and number;
- the admin's `Series` carries `seasonFolders`, a monitor choice at add (`SHOW_MONITOR`) and per-episode files with the episodes each holds (`SeriesEpisode.file.episodes`).

The owner's answer 8 makes TMDB the source of shows' facts, with TheTVDB's ids (Sonarr's folder names, `tvshow.nfo`) turned into TMDB's through `find`. The database on the owner's NAS holds about 1,300 films and has migrations up to `0019_artwork`, so the change must only add.

These alternatives were weighed:

- **A show table apart from `media_items`.** This splits what ADR 0012 joined. Downloads, history, files, images, subtitles and watch state all point at `media_items`, so each would need a second foreign key.
- **Seasons as columns of their show, not rows.** A season has its own poster, monitored flag and status in the drafted admin (`SeriesSeason`), and a pack is grabbed per season (C1). A row is the natural place for those.
- **A join table between files and episodes.** Sonarr keeps one `EpisodeFile` and points each episode at it ([Sonarr's `Episode.EpisodeFileId`](https://github.com/Sonarr/Sonarr/blob/v4.0.15.2941/src/NzbDrone.Core/Tv/Episode.cs)). highsea's versions already hold a `file_id`, so they can do the same without a new table.

## Decision

**The model** (`packages/db/src/schema/media.ts`, migration `0020_shows`):

- `MEDIA_TYPES` gains `show`, `season` and `episode`.
- Rows link through `parent_id`: a season's parent is its show, an episode's parent is its season.
- Seasons and episodes also carry `show_id`, the show's row id. A show's whole tree is then one indexed read (`media_items_show`, a partial index on `show_id`, `season_number`, `episode_number`).
- `season_number` and `episode_number` are new nullable columns, with specials as season 0, as TMDB and Sonarr number them. They aren't unique, so a renumbering on refresh can update rows in place.
- `tmdb_id` stays NOT NULL with its unique index on (`type`, `tmdb_id`):
  - a show holds TMDB's show id;
  - a season holds TMDB's season id;
  - an episode holds TMDB's episode id.

  TMDB's ids are unique per kind, so `(episode, id)` is the contract's address as it stands.
- Columns that are NOT NULL for films come from the show for seasons and episodes: the root folder, the quality and language profiles, and `minimum_availability`, which is `released` for shows (an episode is out when it airs). Paths follow Sonarr's default `Season 01` folders, with `Specials` for season 0, unless `season_folders` is off.
- `show_details` is ADR 0012's extension table for shows: `season_folders`, `tvdb_id` and `imdb_id`. A show's row cascades to it.
- **A multi-episode file** is one `media_files` row whose `item_id` is its first episode. Every episode it holds has its version's `file_id` pointing at that file, with a new `versions_file` index for the reverse look-up. One episode's file can't be removed while the other episodes still point at it, and moving the file moves it for all of them. This is Sonarr's shape, without a join table.
- Each episode gets one version at add, labelled `Default`, with the show's quality profile. A film's several versions (ADR 0012) are left for shows until someone needs them.

**TMDB's TV metadata** (`packages/metadata`, through ADR 0029's fetch seam and ADR 0030's cache, with highsea's own key from ADR 0057):

- **One request for a show:** `/3/tv/{id}` with `append_to_response=aggregate_credits,content_ratings,external_ids,videos,recommendations,keywords,images` and `include_image_language`, as a film's request is built. `images` gives the automatic logo (HT-66's `automaticLogo`) and `content_ratings` the region's certification ([TV series details](https://developer.themoviedb.org/reference/tv-series-details), [Append to response](https://developer.themoviedb.org/docs/append-to-response)).
- **Each season is one more request:** `/3/tv/{id}/season/{n}` with `external_ids`, holding its episodes ([TV season details](https://developer.themoviedb.org/reference/tv-season-details)). They go through the client's limit of four at once.
  - A season TMDB answers 404 for is left out.
  - Any other failure fails the show's fetch, so the cached show keeps serving.
  - `/3/tv/{id}/season/{s}/episode/{e}` is available for one episode's external ids.
- **The cache** has two new tables, `show_metadata` and `season_metadata`, holding the raw answers with `language`, `fetched_at` and `gone_at`. A season's row cascades with its show.
  - `putShow` writes the show and its seasons in one transaction.
  - It removes a season TMDB no longer lists and leaves alone a season not fetched this time.
  - Writing the same answers twice changes nothing.
  - Episodes live inside their season's answer, so a show of ten seasons is eleven rows, not hundreds.
- **TheTVDB's ids:** `findByTvdb(id, kind)` calls `/3/find/{id}?external_source=tvdb_id` ([Find by ID](https://developer.themoviedb.org/reference/find-by-id)) and answers the show, season or episode the caller says the id is, `show` by default. TheTVDB numbers its shows, seasons and episodes in separate ranges that overlap, so TMDB answers 78107 with The Office's show *and* another show's episode: an id alone can't say which it is, but a folder name or `tvshow.nfo` always holds a show's. `searchShows` is TMDB's TV search ([Search TV](https://developer.themoviedb.org/reference/search-tv)).
- **Refresh follows films':**
  - `metadata.refresh` takes kind `show`, and a show older than 30 days is fetched again when read.
  - The daily sweep queues library shows with no cached row and stale ones.
  - The changes job reads [TV changes](https://developer.themoviedb.org/reference/changes-tv-list), but only once a show is cached, so a server of films asks TMDB nothing new.
  - The purge removes shows no longer in the library after 180 days.
  - A refresh announces `show:{id}` in `metadata.updated`.
- **Mapping** (`map-shows.ts`) runs on read, as films' does, so a change of region needs no refetch.
  - The shapes are `ShowMetadata`, `SeasonMetadata`, `EpisodeMetadata` and `DiscoverShow`, carrying what the drafted `ClientShow`, `ClientSeason`, `ClientEpisode`, `Series`, `SeriesSeason` and `SeriesEpisode` need from TMDB.
  - Seasons are ordered with specials last, as `ClientShowDetail` places them.
  - Genres come from TMDB's TV list.
  - The runtime is TMDB's `episode_run_time`, or the episodes' median when TMDB leaves it empty.
- **Images:** a show owns its images. Its seasons' posters and its episodes' stills (w300) are served under the show's owner id, so they're purged with it. `IMAGE_OWNERS` gains `show` in `@highsea-tv/metadata` and in the contract. The artwork picker's owners (`ARTWORK_OWNERS`) stay as they are until the shows' admin routes are served.

**The parser** (`packages/parser/src/episode.ts`) reads Sonarr's naming:

- `SxxEyy` in each of Sonarr's multi-episode styles: Repeat (`S01E01E02`), Scene (`S01E01-E02`), Range (`S01E01-03`), Extend (`S01E01-02-03`) and Duplicate (`S01E01.S01E02`) ([Sonarr's episode naming settings](https://wiki.servarr.com/sonarr/settings#episode-naming));
- `1x01` and its multi-episode forms;
- specials as season 0;
- full-season packs (`S01`, `S01-S03`, `Season 2`);
- `Season NN` and `Specials` folders;
- show folders with `[tvdb-…]`, `{tvdb-…}`, `[tvdbid-…]`, `[tmdbid-…]` and `{imdb-tt…}`, as Sonarr, Plex and Jellyfin write them.

Daily and absolute numbering return null and wait for their phase. The cases are written for highsea in the shapes Sonarr's tests cover. Sonarr's fixtures are GPL and aren't copied.

**`@highsea-tv/media/shows`** (ADR 0036) starts with the library's first part:

- **`add(AddSeriesInput)`** fetches the show and writes its show, season and episode rows and its `show_details`. The `monitor` choice is Sonarr's ([Sonarr's monitoring options](https://wiki.servarr.com/sonarr/library#monitoring-options)): specials are unmonitored in every choice, and at add Missing is All, since no file is there yet.
- **`sync(tmdbId)`** runs whenever `metadata.updated` names the show. It brings the rows up to date and is safe to run any number of times:
  - TMDB's seasons and episodes are matched to rows by TMDB id first, then by their numbers, so a renumbered episode keeps its row, its files and its watch state;
  - a new episode is monitored when its season is;
  - a row TMDB no longer lists is removed unless a file holds it.
- **Statuses:**
  - an episode is `not-released` until its air date, then `wanted` or `unmonitored`;
  - a season or show is `wanted` or `unmonitored`;
  - `available` and `downloading` are left to importing.
- **Counting titles:** the root folders' counts and the quality and language profiles' in-use counts now count titles, meaning a show once and not its episodes.

## Consequences

- Films are untouched: the migration only adds tables, columns and indexes. A test migrates a database of 300 films with files, versions, watch state and artwork across it and checks they are unchanged.
- **Film queries must keep naming their type.** Each query that reads `media_items` as films' now filters on `type = 'movie'`, by id or by a film's TMDB id. The ones that didn't were the root folders' and profiles' counts, changed here. A new query that reads the whole table must decide whether it means titles (`parent_id IS NULL`) or every row.
- A show's metadata is one request plus one per season, about a dozen for a long show. That is in line with Sonarr's own refresh, and the changes job keeps later refreshes to the shows TMDB changed.
- Episodes' TMDB ids are their addresses. If TMDB merges two episodes, the second insert finds the first's id taken and is skipped, leaving the row where it was. Sonarr has the same case with TheTVDB.
- Left for part B's next tasks: matching files to episodes and the existing-library import (`tvshow.nfo`, then the folder's name through the parser and `findByTvdb`), the scan, the routes and their reads, subtitles, playback and watch state. Monitoring and searching are C1's.
