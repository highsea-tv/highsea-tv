# 0041. The migration importers

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Most owners arrive with Radarr and qBittorrent already running. They want their movies, profiles, tags, naming and blocklist from Radarr, and their seeding torrents from qBittorrent, without downloading anything again or moving a file ([phase-3-checkpoint-6.md › The importers](../plans/phase-3-checkpoint-6.md#the-importers-6b)). ADR 0011 makes migration one-time: highsea reads the other program's data and emulates nothing. The owner put the importers in Settings › Migration, owner only, linked from setup's welcome (the checkpoint's answer 10).

## Decision
- **Through each program's API, never its database.**
  - **Radarr:** API v3 with the `X-Api-Key` header ([Radarr API](https://radarr.video/docs/api/)). The importer reads `system/status`, `movie`, `moviefile`, `qualityprofile`, `rootfolder`, `tag`, `config/naming`, `config/mediamanagement`, the paged `blocklist`, the paged `history` filtered to grabs (`eventType=1`), `indexer` and `downloadclient`.
  - **qBittorrent:** WebUI API v2 ([qBittorrent WebUI API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0))). It signs in with `auth/login`, keeps the `SID` cookie and sends a `Referer`, as the wiki asks. Then it reads `app/version`, `app/webapiVersion`, `torrents/info`, `torrents/categories`, `torrents/properties`, `torrents/files` and `torrents/export`. When `auth/login` sets no cookie, the address is in the bypass list, and the importer carries on without one.
  - **Why not the database:** Radarr's SQLite schema and qBittorrent's `BT_backup` folder (or `torrents.db`) are internal. They change between versions without notice, may sit on another machine or in another container, and could be corrupted by a reader while the program runs. The APIs are documented, versioned and reachable wherever the programs are.
  - Both go through the fetch seam (ADR 0029), so tests reach local fakes and production makes no request the owner didn't start.
- **qBittorrent 4.5.0 (Web API 2.8.18) is the minimum,** because `torrents/export` is what makes the import possible. The [WebAPI changelog](https://github.com/qbittorrent/qBittorrent/blob/master/WebAPI_Changelog.md) now begins at Web API 2.11.6, and the [5.0 wiki page](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)) doesn't list the endpoint. So the version rests on qBittorrent's tagged source:
  - `release-4.5.0` declares `API_VERSION {2, 8, 18}` in [webapplication.h](https://github.com/qbittorrent/qBittorrent/blob/release-4.5.0/src/webui/webapplication.h) and has `exportAction` in [torrentscontroller.h](https://github.com/qbittorrent/qBittorrent/blob/release-4.5.0/src/webui/api/torrentscontroller.h);
  - `release-4.4.5` (Web API 2.8.5) has no `exportAction`.

  An older qBittorrent is refused at Test, with the version needed: "highsea needs qBittorrent 4.5.0 or later (Web API 2.8.18), which can export torrents."
- **What comes across from Radarr:**
  - movies by TMDB id, added where they are with no move or rename, keeping monitored and minimum availability (`tba` becomes announced, `preDB` released: Radarr has retired both);
  - each existing file, probed again by highsea rather than trusted, and recorded through the import pipeline's adopt step (ADR 0039) with "Imported from Radarr." in its history;
  - tags;
  - the naming format and file settings (colon replacement, hardlinks, unmonitor deleted, permissions, the recycle bin) when the owner leaves **Bring the naming format and file settings across** on. A format with a token highsea doesn't know stays highsea's, and the preview says why;
  - the blocklist;
  - root folders inside highsea's data root;
  - and the info hashes Radarr grabbed, kept so the qBittorrent importer can link a torrent to its movie.
- **Quality profiles** map onto highsea's seeded ones, nearest first by cutoff rank (a group's cutoff ranks by its best member), with ties in highsea's own order. The preview shows each Radarr profile with an editable select; one left out of the run takes the nearest. Custom profiles arrive with the editors in checkpoint 8.
- **What can't come across:** indexer and download-client credentials. Radarr's API returns every field marked private as `********` ([SchemaBuilder.cs](https://github.com/Radarr/Radarr/blob/develop/src/Radarr.Http/ClientSchema/SchemaBuilder.cs)). The preview names the indexers and download clients and links to Indexers (A9) so the owner adds them again; highsea's own engine replaces the download clients. Radarr's blocklist resource has no info hash, so imported entries match a release by its title.
- **Path mappings.** When Radarr or qBittorrent ran in another container, their paths aren't highsea's. Each importer takes a list of mappings (their `/movies` is highsea's `/data/media/movies`). The longest matching `from` wins, on a folder boundary only, so `/movies-4k` never matches `/movies`. Every mapped path is still checked the way the rest of highsea checks paths: a root folder only inside the data root, a torrent's save path only inside the data root or the downloads folder (ADR 0039). A movie or torrent outside is a failure with the fix ("Add a path mapping…"), and the rest carry on.
- **Why each qBittorrent torrent is rechecked once.** qBittorrent keeps fast-resume data in `BT_backup` or `torrents.db`, which the API doesn't expose. So highsea can't know which pieces are on disk without hashing them. Each torrent is added **paused** where its data already is, with its category, ratio and seed-time limits, file priorities and uploaded and downloaded totals. The engine sees the data and queues a check (ADR 0037), which runs while paused, one torrent at a time. After that, highsea's own fast resume takes over. Trusting qBittorrent's "complete" without hashing would seed whatever is on disk, even a file changed since.
- **Paused until the owner says qBittorrent is stopped.** qBittorrent keeps running until the owner stops it. Two clients seeding the same files would both write to them (a piece fetched again, a skipped file's boundary piece) and announce the same torrent twice. Migration shows how many torrents wait, and **Resume torrents** asks first: "Is qBittorrent stopped?"
- **A torrent Radarr grabbed is linked to its movie,** through the grab history's info hash. That gives it a completed download row, so seeding rules and history follow it. When its files are the library's own (Radarr's in-place imports), it isn't linked, because a linked download's data is removed after seeding (ADR 0038). It stays a manual torrent in its category.
- **Jobs, safe to repeat** (ADR 0022). Each import is one job with its progress in a settings row, announced on `migration.updated`. A second run skips what's already there: a movie in the library, a file already recorded, a torrent already in Downloads, a blocklist entry already kept. A restart carries on at `done`. The connection rides in the payload, sealed with the server's key, so the API key and password are never stored in the clear.
- **The owner's only.** Every route is `access('owner')` and goes in the audit log without its credentials: test, preview, run and status for each importer, and qBittorrent's resume.

## Consequences
- An owner keeps every movie, file and torrent where it is: nothing downloads again and nothing moves.
- Each torrent costs one full read of its data before it seeds. On a large library this takes hours, one torrent at a time, but only once.
- Indexers must be added again by hand, and the importer says so up front.
- Custom Radarr profiles collapse onto the nearest seeded profile until checkpoint 8's editors; the owner sees and can change the mapping before anything is imported.
- A change to either program's API shows up as a failed preview with its message, not as a corrupt import. The fakes in `@highsea/importers/fake` are written from the documented shapes and are updated when the documentation changes.
