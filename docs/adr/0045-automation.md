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
