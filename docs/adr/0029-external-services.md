# 0029. External services: one injected fetch, recorded responses

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
The Phase 3 plan's [External services](../plans/phase-3-server.md#external-services) says every adapter takes a `fetch` it's given, and that tests replay recorded responses with no network. TMDB is the first service that needs it ([checkpoint 4](../plans/phase-3-checkpoint-4.md#external-services-the-fetch-seam-adr-0029)). Indexers, subtitle providers, media servers and import lists follow the same pattern later.

Before this checkpoint the `Fetch` type was declared twice, in `@highsea/auth` (for OIDC) and in `@highsea/sdk`. `BootOptions.fetch` already injected one into the runtime.

## Decision
- **One `Fetch` type, in `@highsea/core`**, with the same signature as the platform's `fetch`. It's also exported from the browser-safe subpath `@highsea/core/fetch`, so the SDK takes it without pulling in Node modules. `@highsea/auth` and `@highsea/sdk` re-export it, so their callers don't change.
- **Adapters take it as a dependency.** The runtime passes `BootOptions.fetch` (the platform's by default). No adapter calls the global `fetch`.
- **Recordings:** one JSON file per request in the adapter's `test/fixtures/<service>/`, holding the request (method, URL and whether the credential was a valid or an invalid one) and the response (status, content type, body).
  - A request's key is its method and its URL with the query sorted by name and the credential parameter (`api_key`) removed. A bearer token is a header, which isn't recorded.
  - The file is named for the request and a short hash of the key (`get_3_movie_19.1a2b3c4d.json`). A test fails when a name doesn't match its request.
- **Replay:** `@highsea/metadata/replay` exports `createReplayFetch()`. It serves the recording that matches, answers image requests with a tiny placeholder image, and throws `ReplayMissError` on any request it has no recording for. The adapter doesn't retry that error, so a missing recording fails the test at once.
- **Recording:** `bun run record:tmdb` in `packages/metadata` asks the real service again for every recorded request (and any given on the command line), with the developer's own credential from `TMDB_READ_TOKEN` or `TMDB_API_KEY`.
  - It refuses to run when `CI` is set.
  - It refuses to write a file containing the credential or anything shaped like one (32 hex characters, a JWT, `api_key=`, an `authorization` header). The same check runs as a test over every recording.
  - It formats what it writes with Biome, so `bun run lint` passes on fresh recordings.
- **Rate limits and backoff,** from [TMDB: Rate limiting](https://developer.themoviedb.org/docs/rate-limiting) (about 40 requests a second, `429` above it):
  - at most 4 requests in flight;
  - `429`, `5xx` and network errors are tried up to 4 times;
  - the wait is `Retry-After` when sent, in seconds or as an HTTP date ([RFC 9110 § 10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3)), otherwise 1, 2, then 4 seconds, and never more than a minute (`retryAfterMs` in `@highsea/core`);
  - the sleep is injected, so tests check the waits without waiting.
  - When tries run out, a `429` becomes `rate-limited` and a `5xx` or network error `unavailable`, each with a plain message.

## Consequences
- No test reaches the network, and a new request in the code fails until it's recorded.
- Recordings are readable JSON, so a reviewer can see what a test depends on. They're also large: TMDB's full movie responses run to tens of kilobytes each.
- **The first recordings are hand-built.** There was no TMDB key on the machine that built checkpoint 4, so they were written in the recorded format from TMDB's public pages and documented schemas ([the fixtures README](../../packages/metadata/test/fixtures/tmdb/README.md) lists what's approximate). Running `bun run record:tmdb` with a key replaces them with TMDB's own answers.
- A development server or smoke test can run with no key and no network by passing the replaying `fetch` as `BootOptions.fetch`. It knows only the recorded requests.
- Later adapters (indexers, subtitles, media servers) copy the pattern: a `fetch` dependency, a `fixtures/<service>/` folder, a replay and a record script.
