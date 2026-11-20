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

## 2026-11-18: files matched to episodes, the existing-library import and the scan (HT-73)

B's second task. It gets the shows already on disk into the library, in place, and keeps them in step with the disk.

**Files matched to episodes** (`shows/files.ts`).

- **Matching.** A video in a show's folder is read by its name with `parseEpisode`. The name's season wins over its folder's, because Sonarr's disk scan parses the file's name. The season and episode numbers are then matched to the show's episode rows.
- **Probing and judging.** The file is probed and judged as a film's is, through `shared/inspect.ts`, taken out of the films' import for both kinds:
  - the skip before the probe (extras, macOS resource files);
  - the probe, and the no-video check;
  - DetectSample's minimum runtime;
  - the quality from the name and the probe.
- **What differs from films:**
  - The minimum runtime comes from the episode's runtime, else the show's.
  - Specials get no sample check, as in Sonarr's [DetectSample](https://github.com/Sonarr/Sonarr/blob/v4.0.15.2941/src/NzbDrone.Core/MediaFiles/EpisodeImport/DetectSample.cs) ("Special, skipping sample check").
  - Nothing is renamed or moved: a show's files are always in place, so a root folder highsea only reads (ADR 0063) is safe.
  - Custom formats aren't scored yet; that is C1's work with monitoring.
- **Filing.** A matched file is filed as this ADR decided: one `media_files` row under its first episode, every episode's version pointing at it, and those episodes `available`.
- **Removing.** A removed file clears every episode it held, and those episodes go back to `wanted`, `unmonitored` or `not-released` by their air date. It writes a `deleted` history entry.
- **Taking one episode.** An episode taken from a multi-episode file (`assign`, the admin's resolve in B's fourth task) leaves the file its other episodes. The file moves to its first remaining episode, and a file no episode holds loses its row.
- **History.** Each filed file writes one `imported` history entry with `inPlace`, so notifications leave it out, as they do a film the scan finds.
- **Sidecar subtitles** aren't read yet: films' import hooks take a film's file, and episodes' subtitles are B's fourth task. The hook is in `ShowFileOptions`, and the runtime wires none for now.

**Nothing is guessed.** A file that can't be placed is kept in a new table, `unmatched_files` (migration `0022_unmatched_files`, only additions), keyed by path, with its reason and a message the admin can show. A table rather than a settings row, so B's fourth task can list and resolve the files by root folder and by show. The reasons:

- **a file in a show:**
  - `no-episode-number`: a name with no `SxxEyy`, a season pack, or anime's absolute numbers;
  - `unknown-season`;
  - `unknown-episode`;
  - `episode-has-file`: a second copy, kept rather than swapped in, since upgrades are C1's;
  - `unreadable`: the probe failed;
- **a show folder:**
  - `no-match`;
  - `ambiguous`;
  - `second-copy`: the show is already in the library at another folder;
  - `unreachable`: TMDB couldn't be asked, and the next scan tries again.

Anime's absolute numbers parse to nothing and wait here. Their mapping goes in `episodeMatch` and `assign` without changing the table.

**The existing-library import** (`shows/library-import.ts`) has films' shape:

- `scan(root)` previews, writing nothing;
- `run(items)` adds the confirmed folders in the `shows.libraryImport` job, which resumes after the last folder it finished;
- the job's progress is one settings row (`showsLibraryImport`), announced on `import.updated`;
- `addNew` serves the library scan.

A folder is identified, most certain first:

1. **Its `tvshow.nfo`**, read as Kodi and Jellyfin read it ([Kodi wiki, NFO files/TV shows](https://kodi.wiki/view/NFO_files/TV_shows)): `<uniqueid type="tvdb|tmdb|imdb">`, then the provider tags, then Kodi's older `<id>`. Sonarr's [XbmcMetadata](https://github.com/Sonarr/Sonarr/blob/v4.0.15.2941/src/NzbDrone.Core/Extras/Metadata/Consumers/Xbmc/XbmcMetadata.cs) fills `<id>` with TheTVDB's id. TMDB's id is used directly, while TheTVDB's and IMDb's go through TMDB's [Find by ID](https://developer.themoviedb.org/reference/find-by-id). IMDb's is the new `discover.findShowByImdb`.
2. **The ids in its name** (`parseShowFolder`): `[tvdb-…]` through `findByTvdb`, and TMDB's id directly.
3. **TMDB's [TV search](https://developer.themoviedb.org/reference/search-tv)** for its title. The match is sure only when exactly one result has the same title or original title (folded, a leading article dropped) and the same year when the name gives one; a year off by one is allowed, since a first air date differs by region. Several are `ambiguous`; none is `no-match`.

A sure match is added with `shows.add(…, { path: folder })`, which keeps the folder where it is. The added show takes:

- the first quality profile and no language profile, as films' import does;
- monitoring All;
- no search, since monitoring and searching are C1's;
- season folders when the folder has a `Season NN` or `Specials` folder or no videos at its top.

Its files are then matched.

**The scan** (`shows/scan.ts`): the `shows.scan` job runs every 12 hours like films' scan, and for one folder when watching sees a change there. Watching now covers Shows root folders, each change sent to its root folder's kind. Setup also queues it for the Shows folder. In each show:

- files gone (checked with `lstat`) are removed;
- changed ones, by size or time, are probed again;
- new ones are matched;
- unmatched files are tried again, since TMDB may list their episode now, and counted once.

A root folder that can't be read is skipped whole. A new folder under the root goes to `addNew`. A folder already kept unmatched isn't searched again by the periodic scan, only after a change seen in it. Everything is safe to repeat, which is tested: the import run twice changes no row, and a scan after it finds nothing.

**The Series routes' id is the show's TMDB id as a string**, as films' routes use `TmdbIdParam` and `ClientShow.id` is already TMDB's. A season is its number under the show (`/seasons/{season}`), and an episode (`/episodes/{episodeId}`) is its own TMDB id, as its row is addressed (this ADR's decision). The mock keeps its slugs, because the contract types `:id` as a string either way. The routes stay drafts until B's third task.

**`AddSeriesInput`** needs only what the server reads: `title` and `year` are optional (the server takes TMDB's), and `languageProfileId` is optional and nullable, with no language profile written as `null`, left out, or the empty string. The admin's Add a show dialog still sends title and year, and the mock reads them first.

## 2026-11-19: the routes served, episodes played as films are, and each profile's place (HT-83)

**The routes** are thin handlers over `@highsea-tv/media/shows`, in films' shape: the apps' `shows` (a list, a show, marking a season or the show) and the admin's `series` (the show by its TMDB id as a string), with Shows' settings. `series.search` stays a draft until C1 searches for episodes. Someone who can't see the Shows library gets an empty list and a 404 for a show or an episode, as films' routes answer. An episode uses films' item routes (`/items/episode/{id}`): its page, play, progress, prefs, next and trickplay, each checked against the Shows library.

**An episode plays through films' path:** the same play decision, sessions and stream token, so direct play, direct stream and transcode come with no new code. Next episode is the next one with a file, in its season and then the next season's first; a special's next is the following special. The place is kept per profile and per episode; a season's and a show's are read from their episodes, and marking a season or the show writes each episode, specials left out of a whole show's mark. Past 90% counts as watched, films' rule; in a multi-episode file, past 90% of the whole file marks the episode playing.

**Taking a show off Continue watching** is a row in `show_dismissals` (migration `0024_show_dismissals`, additions only), dropped when any of its episodes is played again, and gone with the show. Continue watching and Next up both read it.

**Home and Search:** Continue watching takes episodes beside films, the latest played first. Next up, New episodes and Recently added shows are rows of their own, only when an episode has a file, so a server without shows looks as before. Search ranks shows and episodes among films' kinds by the best name's match, Discover last.

**A shows root folder is never renamed.** Library import takes a shows folder in place with films' job and status; a run asking to rename one is refused (`rename-shows`), and the admin leaves Rename out. The library never writes, moves or deletes in a show's folder in this part.

**The unmatched list** (`series.unmatched`) lists what the import and the scan kept, with its reason and its show, for the admin to read; resolving one by hand is the next task's. A shows root folder's "waiting" counts its unmatched show folders.

**Shows is a library a user can be given** (`LIBRARIES` in `@highsea-tv/auth`), beside Movies; music and books join when the server has them.

## 2026-11-19: monitoring, searching and grabbing episodes (Phase 5 C1, HT-103)

Part C1's first task: a show's episodes are searched for, judged, grabbed and imported (the import is 0039's section of the same day).

- **The search.** `@highsea-tv/indexers`' episode search asks every usable indexer for a season, or one episode in it. An indexer whose caps list `tv-search` with `season` and `ep` gets `t=tvsearch` with them and the show's TheTVDB id where the caps take `tvdbid` ([Newznab API, TV-Search](https://newznab.readthedocs.io/en/latest/misc/api/#tv-search), which Torznab follows); otherwise a text search in the TV categories, `Chernobyl S01E02` or `Chernobyl S01`. The catalog's own definitions read `{{ .Query.Season }}` and `{{ .Query.Ep }}` as their search inputs. The parser numbers each result as one episode, several, or a season pack; another show's release, or one outside the asked season or episode, is left out and said (`other-show`, `other-episode`, `not-episode`), as HT-85 does for films.
- **The decision.** Each release is judged by the decision engine against the show's profile, with Shows' episode sizes for the runtime of every episode it brings. **The season-pack rule:** Sonarr documents that "Season Packs will only be grabbed if all episodes in the season are monitored and the season pack upgrades all existing episodes or all episodes are missing" ([Servarr wiki, Sonarr troubleshooting](https://wiki.servarr.com/sonarr/troubleshooting)). highsea keeps that rule without the upgrade half, since upgrading an episode that has a file is a later task: a pack, and likewise a multi-episode release, is approved only when every episode it brings is monitored and has no file. Unlike Sonarr, a pack also needs every one of its episodes aired, so a season still airing comes an episode at a time. Where an approved pack and single episodes are both found, the automatic search takes the pack.
- **The blocklist** is the show's, matched per release (guid, info hash or title), as a film's is the film's.
- **The grab** is the films' download path: the `shows` download category, now built in beside `movies` and `manual` (the owner can't make or remove one by that name), the VPN's rules unchanged, and the download remembers its episode items (migration `0030_episode_grabs`, `downloads.episode_ids`). A second grab of an episode already on its way is refused (409). History records the grab on the show with the episodes in its data, and the queue, Activity and the blocklist name the show, season and episodes (`EpisodeRef` in the contract).
- **Search** (`series.search`, undrafted) queues the `shows.search` job: a season at a time, the season's search first and then single episodes for what it left, at most 25 episode searches a run, so a long backlog doesn't spend an indexer's daily limit in one go. The fallback and its cap are highsea's own call, not a documented Sonarr rule. Add a show's **Start searching** queues the same job when an indexer is enabled. A show in a root folder highsea only reads (ADR 0063) is never searched (409 `read-only`), and the admin hides its monitoring switches and Search.
- **Not yet:** RSS and the backlog sweep for episodes (ADR 0045), Wanted and the calendar, episode notifications, the TV and anime indexers (the indexer catalog plan's F2), the Sonarr importer, and upgrades of an episode that has a file.
