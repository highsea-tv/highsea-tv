# 0035. Indexer health, rate limits and search fan-out

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Indexers fail in ordinary ways: they're slow, they rate-limit, their keys expire, and their pages change. An owner arriving from Prowlarr expects a failing indexer to back off and recover on its own, and a search to come back with what the working ones found ([phase-3-checkpoint-5.md › The engine](../plans/phase-3-checkpoint-5.md#the-engine)). Checkpoint 4's decision engine left slots for the indexer's facts (ADR 0031).

## Decision
- **Health** is one of `healthy`, `backoff`, `failing` and `disabled`, as the prototype shows. It's derived from `indexer_status` (consecutive failures, backoff until, failing since, last error, last success) and the enabled flag:
  - a backoff that has run out reads as healthy, and the next search tries again;
  - a success returns the indexer to healthy at once.
- **Backoff** grows with each failure in a row: 5 minutes, then 15, 30, 1 hour, 3 hours and at most 6 hours, with ±10% jitter so indexers don't retry together. A `429` with `Retry-After` uses that time instead, capped at 6 hours. **Retry now** clears it. An indexer becomes **failing** after 6 hours of failures in a row.
- **Auth errors go straight to failing.** That means a `401`, or a Torznab or Newznab error 100 to 102 ([Newznab API › error codes](https://torznab.github.io/spec-1.3-draft/external/newznab/api.html)). Retrying a wrong key never helps, so the indexer skips searches until Retry now or new settings, and its saved sign-in is dropped.
- **Kinds of failure:** auth, rate limited, unavailable, timeout, parse and config. Each has a message written for people. Network errors are reported by their code, never the raw message.
- **Secrets:**
  - settings marked secret, and passwords, are sealed at rest with the server's key (`v1.`), as the TMDB key is;
  - the API returns only whether each one is set;
  - every message, log line and stored error is redacted: the secret itself, its URL-encoded form, and the values of `apikey`, `passkey`, `password`, `token` and `auth` query parameters.
- **Rate limits** from a definition's hints (requests per window, minimum gap) are enforced per indexer across searches and tests, serialized per indexer, so they hold under parallel searches.
- **Timeouts:** each request uses `AbortSignal.timeout`, and each indexer's whole search is raced against 30 seconds (answer 7). A response body is capped at 10 MB.
- **Stats** are hourly rows in `indexer_stats` (queries, failures, total response time, grabs). The 24-hour view sums 24 rows, so the table is one cheap read. Rows older than 48 hours are pruned hourly with expired search results. A test made while adding an indexer isn't counted.
- **Search fan-out:**
  - One search asks every usable indexer in parallel (`Promise.allSettled`), and a failure never sinks the others. An indexer is usable when it's enabled, not resting, doesn't need attention, its definition is present, and it speaks torrent while Usenet waits (answer 2).
  - **Queries** use the strongest id the indexer's caps support: TMDB's, then IMDb's (sent without `tt`, as the Newznab documentation's example shows), then title and year. When an id search finds nothing, title and year are tried.
  - **Results** are kept to movie categories (or no category), deduplicated by guid, parsed by `@highsea/parser`, and matched to the movie by TMDB id, IMDb id, or title with the year allowed to be off by one.
  - **Each result is judged** by the decision engine with the slots ADR 0031 left now filled:
    - minimum seeders, 1 by default, Radarr's documented default ([wiki.servarr.com/radarr/settings#indexers](https://wiki.servarr.com/radarr/settings#indexers));
    - minimum age, for Usenet;
    - blocked indexer;
    - indexer flags (freeleech and its variants from `downloadvolumefactor`, double upload from `uploadvolumefactor`).
  - **Ranking:** approved releases first. The profile's order follows, then the tiebreakers protocol, indexer priority (1 to 50, lower first; answer 5), seeders, and size nearest the preferred size.
  - **The results are cached** in `releases` for 30 minutes per movie, with the download link in its own column, so checkpoint 6's Grab can take one by its guid without searching again. Interactive search is a `POST`, because it costs every indexer a query.
- **Events:** `indexers.updated` on every change. `health.updated` fires only when an indexer's health crosses a line, for the dashboard and System.

## Consequences
- A broken indexer costs little: it rests on a growing schedule and says why. A wrong key stops at once instead of hammering the site.
- Searches finish in at most about 30 seconds, whatever one indexer does.
- Secrets can't leak through errors, logs or the API. A test checks each of those paths.
- Backoff and failing follow Prowlarr's documented behaviour in spirit, but the schedule is highsea's own and is fixed in tests.
