# 0070. fanart.tv as a second artwork source: TMDB first, fanart.tv's logo when TMDB has none

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

highsea's artwork comes from TMDB alone ([ADR 0030](0030-metadata-cache.md), with HT-66's dated section on chosen artwork and a title's logo). Phase 5's real use found films with no logo on TMDB, so their hero shows the title in text, and the artwork dialog has nothing else to offer for them. The owner chose TMDB first with fanart.tv as the fallback, and anime as a later part of its own (2026-11-18).

fanart.tv is a community site of posters, backgrounds and transparent logos for films (by TMDB or IMDb id), shows (by TheTVDB id) and music (by MusicBrainz id). Jellyfin, Emby, Kodi and tinyMediaManager all use it. What its documentation sets ([fanart.tv API 3.2](https://api.fanart.tv/)):

- **Two keys.** A *project key* for an application, sent as the `api-key` header, with a 7-day delay on new images. An optional *personal key* for the person using it, sent as `client-key`, with a 2-day delay; it "can be sent alongside a project key, or used alone", and "takes priority over `api-key` when both are sent". fanart.tv asks applications to offer one: "We strongly recommend that projects allow users to optionally enter their personal API key … Direct users to get their personal key in your application's settings" (Authentication, Access Tiers).
- **Answers.** `GET /v3.2/movies/{id}` lists each image type (`hdmovielogo`, `movieposter`, `moviebackground` …) as `{id, url, lang, likes, width, height}`. Numbers are strings, and a `lang` of `00` or empty means no text. 3.1 and 3.2 answer 404 when there's nothing for the id.
- **Images** are on `assets.fanart.tv`. Swapping `/fanart/` for `/bigpreview/` gives the same file at most 400 px wide: "Use them for grids, pickers and anywhere the full-resolution file would be wasted, then fetch the /fanart/ URL once the user has made a selection" (Image URLs and Previews).
- **Rate limits** are "very rarely applied". A 429 carries `Retry-After`, and clients should back off exponentially (Rate Limits).
- **The rules a key comes with** ([Get an API key](https://fanart.tv/get-an-api-key/)): "If you have a publicly available program, you must inform your users of this website and the images you use. You should also request your users that they help contribute artwork". Also: "Do not use our API methods embedded in your own API for 3rd party use", "Do not use our API for commercial use without written consent", and "Do not perform more requests than are necessary for each user". The API documentation itself is under CC BY 3.0.

Alternatives weighed:

- **fanart.tv on every refetch** would ask it for every film each month. That's more than "necessary for each user" when TMDB already has a logo, and it puts a second service in the way of every film's details.
- **Ranking fanart.tv's images with TMDB's by votes** is not possible: TMDB has vote averages, fanart.tv has likes, and the two can't be compared. TMDB stays the first source.
- **The client asking fanart.tv directly** would put the key in every app, and ADR 0029 keeps every outside service on the server.

## Decision

`@highsea-tv/metadata` gets a fanart.tv source in `src/fanart/`. It uses the same `Fetch` seam, clock and logger as TMDB (ADR 0029), and the same cache rules (ADR 0030).

- **The client** (`fanart/client.ts`) uses version 3.2 at `https://webservice.fanart.tv`, with the keys in headers (`api-key`, `client-key`), never in addresses or logs. A 404 is "nothing for this title". A 401 is `fanart-key-rejected`. A 429 or 5xx is retried once, after `Retry-After` or two seconds (at most 30). After that, or after a network error or a 10-second timeout, the client rests for 15 minutes and answers `fanart-unavailable` at once. Two requests at most are in flight. Images are fetched only from `https://assets.fanart.tv`.
- **The cache** is a table of its own, `fanart_images` (migration `0023_fanart`). Each row is fanart.tv's answer, keyed on `(subject, external_id)`, where the subject is `movie`, `show` or `artist` and the id is what fanart.tv keys on, held as text. A 404 is kept as a row with null data. An answer with images is asked for again after 30 days, as TMDB's rows are swept. Nothing is asked again after 7 days, the project key's delay on new images, so asking sooner can't find more. The monthly purge removes rows for films no longer in the library, as it does TMDB's.
- **When it's asked.** Only in two cases: when a film's TMDB refetch finds no logo (`queueFanart` after `putMovie`, the `metadata.fanart` job, one at a time, one attempt), and when the artwork dialog opens and the film's row is due. A film's page never waits on fanart.tv. The job swallows `fanart-unavailable` and `fanart-key-rejected` with a warning, so a failure is neither retried nor shown as a failed job.
- **The fallback logo.** `toMovieMetadata` takes the automatic logo from TMDB as before (ADR 0030's HT-66 section). Only when that's null does it ask `fanart.logo`. That picks an HD logo (`hdmovielogo`, a PNG) in the metadata language first, then English, then any, and within each the one with the most likes. A chosen logo (HT-66) still wins over both.
- **The artwork dialog.** `GET /artwork/movie/{id}` lists TMDB's options and then fanart.tv's, by likes. Each option has `source` (`tmdb` or `fanart`) and `likes`; `voteAverage` and `voteCount` are null for fanart.tv's. The admin shows fanart.tv's under a heading of their own, only when there are some. Choosing one stores `source: 'fanart'` in `artwork`. An image address names a fanart.tv file as `/ftv_<its file name>` (`/api/v1/images/movie/10378/logo/w500/ftv_big-buck-bunny-5b2a1d3c4e5f6.png`), which a TMDB path never starts with. `images.get` fetches it only when the film's cached answer lists that file. It fetches `bigpreview` for widths up to 300 and the full file above, then resizes and caches it as it does TMDB's.
- **The keys.**
  - *highsea's project key* goes where [ADR 0057](0057-installing-without-configuration.md) puts TMDB's. That's the `release` environment's `HIGHSEA_FANART_KEY` secret, passed by `release.yml` as the `fanart` build secret. The Dockerfile installs it as `/usr/share/highsea/fanart-key`, named by `HIGHSEA_FANART_KEY_FILE`. A source build reads `HIGHSEA_FANART_KEY`. A secret mount never lands in a layer ([Docker: build secrets](https://docs.docker.com/build/building/secrets/)).
  - *The owner's personal key* is optional, in Settings › General › Metadata beside TMDB's. It's checked with one request before it's kept (`movies/550` with that key alone, where a 404 still counts as accepted), sealed as TMDB's key is, shown by its last four characters, and sent as `client-key` beside the project key.
  - *With neither key*, fanart.tv is off. It's never asked, nothing is queued, no error shows and the dialog has no fanart.tv section.
- **fanart.tv's rules.** System › About credits fanart.tv beside TMDB: "Artwork from fanart.tv, made by its community. Add your own at fanart.tv." That's the attribution and the invitation to contribute. Each server asks fanart.tv for its own owner, in that owner's library, so highsea's API is not fanart.tv's API "embedded … for 3rd party use". highsea is free software and not sold. The cache and the two triggers keep requests to what each film needs.
- **Shows and music** need no new shape. `SUBJECTS` in `fanart/source.ts` already maps `show` to `tv/{TheTVDB id}` (`tvposter`, `showbackground`, `hdtvlogo`) and `artist` to `music/{MusicBrainz id}` (`artistthumb`, `artistbackground`, `hdmusiclogo`). The table's key is text, and the job's payload carries the subject. Adding one is its answer's type in `fanart/types.ts`, its owner in `subjectOf` (service.ts) with the id it's keyed on (`show_metadata.tvdb_id`, an artist's MBID), and its `queueFanart` call where its TMDB refetch finds no logo.

### The catch-up after an update

An update can leave library films needing a TMDB refetch: #73's films fetched before `images` was asked for, and films with no cached row. Until now that waited for the daily sweep. `jobs.schedule()` keeps each schedule's `next_run_at` in `job_schedules` ([ADR 0022](0022-job-queue.md)), so a boot after an update could wait up to a day. The fix is the one-off job ADR 0022 already has, which is `enqueue` with a `dedupeKey`, as the boot's `queueFacts` does. It doesn't change the sweep's schedule.

- At boot, and when a fanart.tv key is added, `queueCatchUp` checks `libraryGaps()`. When there's something to do, it queues one `metadata.catch-up` job three minutes out with `dedupeKey: 'boot'`, so another boot while it waits adds nothing.
- `runCatchUp` queues each film's ordinary `metadata.refresh` job (deduplicated per film) and each due `metadata.fanart` job. TMDB's client limits concurrency and honours its 429s as before, so a library's worth spreads out rather than hammering TMDB.
- It's safe to repeat. Once the films are fetched, `libraryGaps()` is empty and a boot queues nothing. The daily sweep starts from the same `queueLibraryGaps`, so one place decides what's missing.

### The films the refetch missed

A film TMDB answered 404 for is marked gone (`markGone`): its old row stays, with `gone_at` set, so its page still shows. 0.4.4's rows had no `images`, and the sweep's query for imageless rows left gone rows out, so they were never asked again, even when TMDB had them back. `libraryGaps()` now includes a library film that has been gone for 7 days or more (`GONE_RETRY_MS`). `markGone` sets `gone_at` again on each 404, so such a film is asked once a week, not every day.

## Consequences

- A film without a TMDB logo gets fanart.tv's within minutes of its refetch, and the owner can pick from more art for every film. Neither depends on fanart.tv being up.
- Until the owner registers highsea's project key and adds it to the `release` environment, release images have none. fanart.tv is then off unless the owner adds a personal key in Settings.
- fanart.tv's images are cached and resized like TMDB's (`image_cache`). The `bigpreview` keeps the dialog's grid small.
- The catch-up job and the gone retry mean a boot after an update starts any missing refetch within minutes rather than at the next daily sweep.
- Left for later: shows and artists (the rows above), local artwork files as a third source (an `owner/id` file read beside the cache, with `source: 'local'`, ranked before both), and a Health line when highsea's project key is refused.

## 2026-11-19: artists' pictures (phase 5 D; HT-101)

An artist with a MusicBrainz id and no picture in their folder gets fanart.tv's `artistthumb` (`/v3/music/{mbid}`, the API's Music section, https://fanarttv.docs.apiary.io/#reference/music), the most liked first: the square picture Kodi and Lidarr show. It goes through the same seam as a film's art (`fanart_images` with the `artist` subject, asked again after a month, a week when it had nothing; `packages/metadata/src/musicbrainz/artist-art.ts`), and the music metadata job asks it, never a request. The image route fetches the picture once and keeps it under `images/music/` (0065's section of this date). With fanart.tv off, an artist shows its initials, as before.
