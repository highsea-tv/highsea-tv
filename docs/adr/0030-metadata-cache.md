# 0030. The metadata cache: TMDB's responses beside the library, under six months

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Movies come from TMDB ([checkpoint 4](../plans/phase-3-checkpoint-4.md#tmdb)). TMDB's [terms of use](https://www.themoviedb.org/api-terms-of-use) forbid keeping cached data for more than six months, and each server uses its owner's own key. Pages must open for any TMDB movie, in the library or not, and the library must keep working when TMDB, or the key, is away. The owner chose to cache images on the server rather than hotlink them (decision 4).

## Decision
- **`@highsea/metadata`** holds the TMDB adapter, the cache, images and the refresh jobs. The movie service and the API use it; nothing else talks to TMDB.
- **The cache** is three tables keyed by TMDB id, beside the library rather than inside it: `movie_metadata`, `people` and `collections`, plus `credits` for a movie's cast and crew.
  - Each row keeps **TMDB's response as it was sent**, the metadata language, `fetched_at` and `gone_at`. The response is mapped to highsea's types on read, so changing the region (certification, release dates) needs no refetch.
  - A movie is one request, with `append_to_response=credits,videos,release_dates,external_ids,recommendations,keywords` ([Append to response](https://developer.themoviedb.org/docs/append-to-response)); `keywords` was added on 2026-10-22 for smart collections' keyword rules (checkpoint 8d, ADR 0049). When it has no recommendations, TMDB's "similar" list is fetched once and kept with it (decision 6).
  - Writing a response replaces the row and its credits whole, in one transaction, so a repeated job changes nothing ([ADR 0022](0022-job-queue.md)).
- **Reading:** a row is served from the cache when it's in the current language and under 30 days old. Otherwise the cache asks TMDB, and falls back to the cached row when TMDB fails or there's no key. Lists and searches (Discover) aren't cached.
- **Gone from TMDB:** a `404` for a cached id sets `gone_at` and keeps the row, so a library movie TMDB deleted still has its page. A `404` for an id never seen is `not-found`.
- **Refresh by changes:** a daily job (`metadata.changes`) reads TMDB's movie and person change lists since its last run, at most 14 days and 100 per page ([Changes](https://developer.themoviedb.org/reference/changes-movie-list)), and queues a refresh for each cached id in them. If it hasn't run for more than 14 days, it refreshes everything older than a week instead.
- **The sweep** (`metadata.sweep`, daily) refreshes library movies with no cached row, a twenty-fifth of the library's rows, oldest first, and any the library refers to that are 29 days old or more. Every library row is refreshed at least every 30 days, spread over the days.
- **The purge** (`metadata.purge`, daily) deletes rows older than 180 days that the library doesn't refer to (its movies, their collections and the people credited in them), the images of what it deleted, and any image older than 180 days. Library rows never get that old, because of the sweep.
- **Refreshes** go through one job, `metadata.refresh`, deduplicated by kind and id. Manual refresh on the movie page and in bulk edit queues the same job. Each refresh emits `metadata.updated` with `movie:{id}`, `person:{id}` or `collection:{id}`.
- **Images are cached by the server** (decision 4). The API serves `/api/v1/images/{owner}/{ownerId}/{kind}/{size}/{file}`, for example `/api/v1/images/movie/19/poster/w342/kr9wXRN23zLuWJIelahas1mtnYj.jpg`.
  - The sizes are TMDB's own for each kind, from `/3/configuration` ([Images](https://developer.themoviedb.org/docs/image-basics)), without `original`. The screens use poster `w342`, backdrop `w1280`, video still `w780`, credit photo `w185` and portrait `h632`.
  - The first request fetches the file from TMDB's image base and writes it under the images folder (`/data/images` in Docker), with an `images` row recording its owner and `fetched_at`. Later requests read the file.
  - File names are checked against TMDB's shape (letters, digits, `_` and `-`, then `.jpg`, `.jpeg`, `.png` or `.webp`), the path is checked to stay inside the folder, and only JPEG, PNG and WebP responses up to 10 MB are kept. SVG isn't accepted, so an image can't carry script.
- **The key** is stored sealed with the server's secret key, like other provider secrets, and never returned: reads show whether it's set and its last four characters. Either credential TMDB issues works, told apart by shape ([Authentication](https://developer.themoviedb.org/docs/authentication-application)). Without one, anything that needs TMDB fails with `unavailable` and `details.reason` `no-tmdb-key` ("Add a TMDB key to find movies.").
- **Attribution:** the package exports the terms' notice, "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.", and links to TMDB's key page and logos.

## Consequences
- Pages open for any TMDB movie, and the library's pages keep working from the cache when TMDB or the key is away.
- No cached row or image outlives TMDB's six-month limit unless the library refers to it, and those are refreshed well inside it.
- Clients never contact TMDB, so the LAN, privacy and offline cases work. The server's disk holds the images, and the purge bounds them.
- Genre names in lists come from an embedded English map, since list results carry only ids; a movie's own page names its genres in the metadata language.
- An image shared by two owners (a collection using a movie's poster) keeps one owner row, so the purge may fetch it again later. That costs one request, not correctness.
