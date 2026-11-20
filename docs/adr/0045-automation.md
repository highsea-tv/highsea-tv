# 0045. Automation: RSS, the backlog sweep, upgrades, import lists and the calendar feed

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
Until checkpoint 8, highsea found releases only when someone pressed Search. Checkpoint 8a makes it run the library on its own, as Radarr does ([the plan](../plans/phase-3-checkpoint-8.md#automation-8a), [wanted.md](../product/wanted.md)). It has to catch new releases soon after they're posted, work through a backlog without hammering indexers, upgrade files under their profile's cutoff, take movies from lists people already keep, and put release dates in the owner's own calendar. The movie library, the indexers and downloads don't depend on one another (ADR 0036), so something has to join them.

## Decision
- **The runtime joins them** (`packages/runtime/src/automation.ts`). Three jobs, each safe to repeat (ADR 0022):
  - `movies.search` searches one movie, for each version that still wants a file or an upgrade. Search, Search all and the add dialog's Search now all queue it.
  - `indexers.rss` runs every 15 minutes, Radarr's default `RssSyncInterval` ([Servarr wiki: Radarr settings](https://wiki.servarr.com/radarr/settings)). Each enabled indexer that can search gives its newest releases: an RSS feed, or a Torznab or Cardigann search with no query, which the Torznab spec defines as the newest items ([Torznab spec](https://torznab.github.io/spec-1.3-draft/)).
  - `movies.wanted` runs every 6 hours: the backlog sweep.
- **RSS:**
  - Each release is parsed once. It is matched to the movies still wanted by TMDB or IMDb id when the indexer gives one, and by title and year otherwise.
  - It is then judged for each movie it matches, as a search judges it.
  - Guids are remembered per indexer for 14 days (`rss_seen`), so a feed read twice is judged once. A release is grabbed through the existing Grab path, keyed by guid (checkpoint 6).
  - An indexer that checkpoint 5's health rules have paused is skipped.
  - A movie's cached search results are replaced only when RSS finds an approved release for it. A feed holds a few releases, and a search's fuller list shouldn't be lost to them.
- **The sweep:**
  - Radarr leaves backlog searches to the owner ([Servarr wiki: Radarr FAQ](https://wiki.servarr.com/radarr/faq)). highsea adds a gentle one, the owner's answer 3: each run takes the 20 wanted movies whose next search is due, oldest first.
  - Each movie is pushed back 1, 3, 7, then every 14 days. A grab starts it again from a day.
  - Each movie's next search time and search count are kept on `media_items`, beside `cutoff_unmet`.
  - A partial index (`media_items_wanted`, on monitored movies that are wanted or cutoff unmet) keeps the sweep's and RSS's queries off the rest of a 100,000-film library. The scale test checks this.
- **Upgrades:**
  - `cutoff_unmet` is stored, not computed when listed. It's worked out from the decision engine's `isCutoffMet` (ADR 0031) when a file is imported, replaced or removed, or a movie's profile is set. A one-time job (`movies.wantedRefresh`) fills it for libraries from before 8a. The profile editors (8c) will refresh it when a profile's cutoff changes.
  - Only profiles that allow upgrades put a movie on Cutoff unmet.
  - Every search and RSS judges releases with the version's file (`existingFile`), so the engine's upgrade rule refuses anything that isn't better.
  - The import already replaces the file and moves its subtitles (checkpoint 7).
- **The blocklist** fills the decision engine's `blocklisted` slot. A blocklisted release is refused by search, RSS and replacements alike, and a search shows why.
- **Import lists** (`packages/lists`, one subpath per source, behind the fetch seam):
  - **TMDB:** a list by id or link, and the popular, top-rated, upcoming and now-playing charts for the server's region, through the TMDB key highsea already has (ADR 0029).
  - **Trakt:** a public list by link, plus trending, popular and anticipated, with highsea's Client ID. The connected account's watchlist and private lists need Trakt's device flow ([Trakt API › Authentication: Devices](https://trakt.docs.apiary.io/)). It is one account per server, with its tokens sealed in settings and refreshed when less than a day remains.
  - **A generic list:** an address answering JSON in the format Radarr calls StevenLu Custom (`[{ "title", "imdb_id" }]`, or `tmdb_id`), or MDBList's JSON, whose non-movie items are skipped.
  - **Letterboxd and IMDb come through the generic format**, which MDBList and similar tools publish for them. Letterboxd has no open API, and IMDb no public list API (the owner's answer 4).
  - **Each list is checked every 6 hours and when saved.** Every entry is resolved to a TMDB id first; those that can't be are named in the list's last result.
  - **Movies already in the library are skipped,** and so are those on the exclusion list, which "Don't add it again from lists" fills when a movie is deleted.
  - **A list never removes a movie.** This is Radarr's default `ListSyncLevel`, "disabled".
  - **Charts take their first 20 entries.**
- **The calendar and its feed:**
  - Each of a movie's three dates (in cinemas, digital, physical) is its own entry (the owner's answer 2). Dates are read from the region's release dates the library already stores.
  - `GET /feed/v1/calendar.ics` is an RFC 5545 calendar ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)) with these elements:
    - one all-day `VEVENT` per date (`DTSTART;VALUE=DATE`, `TRANSP:TRANSPARENT`);
    - a stable `UID`, `{tmdbId}-{kind}@{serverId}`, so a calendar app updates an event instead of adding it again;
    - `X-WR-CALNAME`;
    - text escaped as § 3.3.11 says;
    - lines folded at 75 octets and ended with CRLF (§ 3.1).

    It covers 30 days back and 365 forward, and is served `private, no-store`.
  - **Its key goes in the address,** because calendar apps can't send headers. A key in a URL is easily shared, so the feed takes a new API key scope, `calendar`, that opens the feed and nothing else (the owner's answer 10). The API refuses it as a bearer, and API keys can't be made with it.
  - **One calendar key per person,** made and turned off from Wanted. Its secret is sealed so Wanted can show the address again. A new key replaces the old one, whose address stops working.
- **System › Tasks** lists each scheduled job (`jobs.tasks()`) with its interval, state and last and next runs, and **Run now** (`jobs.runNow`).

## Alternatives considered
- **Search the whole backlog on a schedule:** with a large library this hits every indexer hundreds of times a run, which is how indexers end up banning clients. The sweep's backoff gets through a 200-film list in days instead.
- **Compute cutoff unmet when listing:** this needs every file judged against its profile per page. With 100,000 films it can't use an index, and the sweep would need the same work again.
- **Scrape Letterboxd and IMDb directly:** neither offers an API for lists, and scraping breaks without notice. The generic format puts that work in tools that already keep up with them.
- **Use a read-only API key in the feed's address:** that key reads the whole API, and a calendar URL ends up in other apps' settings and backups.
- **Remove movies that leave a list:** this deletes files nobody asked to delete. Radarr makes it an option, off by default. highsea can add it later.

## Consequences
- highsea grabs without anyone pressing a button. A misconfigured profile now costs downloads, not only search results. The blocklist and the upgrade rule are what stop a loop.
- RSS and the sweep add steady indexer traffic: one request per indexer every 15 minutes, and at most 20 searches every 6 hours.
- A Trakt watchlist needs highsea's Trakt application. A build without its Client ID (`HIGHSEA_TRAKT_CLIENT_ID`) shows Trakt as unavailable, and the other kinds still work.
- A shared calendar address shows only release dates, and its owner can replace it at any time.

## 2026-10-22: Trakt's new developer portal (checkpoint 9a)

Registering highsea's Trakt application on Trakt's new portal changed three things ([Trakt API Guides: Authentication](https://developer.trakt.tv/docs/authentication-oauth)):

- **The sign-in host.** `/oauth/*` calls go to `auth.trakt.tv`. Everything else stays on `api.trakt.tv`.
- **The client secret.** Trakt deprecated it for user sign-in, and new applications get only a Client ID. highsea sends the secret only when a build has one, so the device flow works with the Client ID alone.
- **The redirect URI.** A Production application must register an `https://` redirect URI, which rules out `urn:ietf:wg:oauth:2.0:oob`. highsea's is `https://api.highsea.tv/oauth/trakt`, on `api.highsea.tv`, highsea's subdomain for machine-facing services (the checkpoint 9 plan's subdomains). The device flow never redirects there. A token refresh names it, so it matches the registration exactly.

Refresh tokens are now single-use. highsea already replaces both tokens on every refresh.

## 2026-11-19: Episodes run by themselves (Phase 5 C1, HT-109)

Shows get the films' automation, judged by the season-pack rule of ADR 0064's section of the same day. The rules follow Sonarr's documented behaviour: RSS sync and the delay profiles ([Servarr wiki: Sonarr settings](https://wiki.servarr.com/sonarr/settings), [delay profiles](https://wiki.servarr.com/sonarr/settings#delay-profiles)), and a release that brings several episodes being an upgrade only when it upgrades every existing one ([Servarr wiki: Sonarr FAQ](https://wiki.servarr.com/sonarr/faq)).

- **RSS is one read for both kinds.** `indexers.rssAll` asks each feed for the film and TV categories once (Torznab's `cat`, a site's mapped categories) and keeps either kind. A release with a season and episode number goes to the shows' side: it is matched to a monitored show with wanted episodes by its ids or title, judged against its season, and kept for that season. Each season with an approved release is then grabbed from what RSS kept (`grabBestEpisodes` with `cached`), falling back to a live search only when nothing kept is approved. An episode airing by tomorrow counts as wanted, since a feed's release can come before the air date reaches this server's day.
- **The backlog sweep is per show.** `shows.wanted` runs every 6 hours, first 30 minutes after boot. It takes up to 10 shows due (never searched first, then the ones searched longest ago) and pushes each back 1, 3, 7, then 14 days on the show's row, as films are. One run makes at most 20 indexer searches between its shows; a season counts as one search, and each episode searched on its own after it counts as one more. A show the budget doesn't reach is due again at the next run, with its count unchanged.
- **Cutoff unmet is kept on each episode's row** (`cutoff_unmet`), as on a film's. It is weighed after an import, after the scan, when a show's profile changes, and once at boot (`shows.wanted-backfill`). An episode is wanted when it is monitored and either aired without a file or has a file under its cutoff.
- **Upgrades.** A release is approved only when it upgrades every distinct file it would replace (one decision for each). So a season pack replaces single-episode files only when it is better than all of them, and is otherwise turned down as a whole while singles are judged on their own. On import, a file that no episode holds any more goes to the recycle bin, and one still holding another episode stays.
- **Delay profiles.** RSS and the sweep wait as films' do. A season whose best release is held is looked at again by `shows.held` when the wait is up, grabbing from the releases kept. Search someone asked for never waits.
- **Notifications.** `episode-grabbed`, `episode-imported` and `episode-upgraded` carry the show and its episodes (one, several, or the season). One download's import sends one message, so a pack is one message and not five. A connection's tags filter by the show's tags.
- **Wanted and the calendar.** `wanted.missingEpisodes` and `wanted.cutoffEpisodes` page each list, newest aired first. The calendar and its feed put each monitored episode on its air date. A feed event's UID is made from the show and the episode's numbers, so a moved air date moves the event.
- **Shows in a root folder highsea only reads ([ADR 0063](0063-libraries-highsea-only-reads.md)) are left alone.** Someone else keeps their files (on the owner's NAS, Sonarr does). RSS doesn't target them, the sweep doesn't take them, `shows.held` and Search all find nothing for them, and Wanted leaves their episodes out. One check covers every automatic path: the show's search input. The calendar still shows their air dates. Turning the folder to managed brings them in at once.

### Alternatives considered
- **Sweep episodes one at a time, as films are:** with 8,000 episodes this would take months to get through, and it would search a season's episodes one by one when a single season search would find the pack.
- **A separate RSS read for shows:** this doubles the feed traffic for no gain, since one read already returns both kinds.

## 2026-11-19: films in a root folder highsea only reads are never searched for (HT-113)

On the owner's NAS the films folder Radarr keeps is read-only in highsea (ADR 0063), and the sweep had searched 179 of its 1,282 wanted or cutoff-unmet films; only an empty indexer kept it from grabbing upgrades highsea may not import. The rule is the one HT-109 sets for shows:

- **Nothing automatic searches, grabs or upgrades such a film.** `movies.wanted.wants` is empty for it, and every automatic path grabs only what `wants` names: RSS, the sweep, `movies.held` and the `movies.search` job behind Search all. `searchMovie` also returns before searching, so a search queued before the folder was switched does nothing.
- **It uses up no run.** RSS's targets and the sweep's due films leave it out (a prefix compare on the film's path against the read-only folders, `notUnderRoots` in `packages/media/src/shared/sql.ts`, which shows' check now uses too), so it takes none of the sweep's 20.
- **Wanted leaves it out.** Missing and Cutoff unmet and their counts don't list it, so Search all has nothing to queue for it. The calendar keeps its dates: they're useful whoever fetches the file.
- **A Search someone asks for is refused,** as a show's is (HT-103): `POST /movies/bulk` with `search` answers 409 `read-only` when every film asked for is in such a folder and leaves them out of a selection, and the interactive search answers 409 `read-only`. The film's page hides Search and Interactive search and says why, as a show's page does.
- **The folders are read on each call,** so switching one to managed in Settings brings its films back at once.

No migration: the root folders' `read_only` and the films' paths are already stored.
