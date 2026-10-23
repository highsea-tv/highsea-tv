# 0049. Smart collections: rules compiled to SQL, evaluated when read

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

At 8c's review the owner asked for smart collections: collections the owner and admins make from combinations of filters, such as "films released between 2010 and 2020, rated 4.5 or more, in English". Plex has smart collections ([Plex Support, "Collections"](https://support.plex.tv/articles/201273953-collections/)). Emby and Jellyfin don't: Emby's request is still open, and Jellyfin has only a community plugin. Kometa's `smart_filter` shows the shape a filter takes: any or all, attributes, modifiers and values.

The scope, the prototype and the owner's answers are in [smart-collections.md](../plans/smart-collections.md), and the screens are specified in [collections.md](../product/collections.md). The work was built as checkpoint 8d.

Until now, most of what a rule needs lived only inside JSON: TMDB's `data` in the metadata cache and ffprobe's `media_info` on each file. Featured sections' rules (ADR 0048) read that JSON with `json_each`, which is fine for one genre but not for a dozen conditions across ten thousand titles.

## Decision

- **One kind of collection.** A collection has optional rules, plus titles it always includes and titles it never includes. Never include wins.
  - With no rules, it's a collection picked by hand, kept in the order of its picks.
  - With rules, it keeps itself current.
  - The API shows the smart mark only when a collection has rules.
- **The rule tree.** The top level matches all or any of its rules. Those rules are conditions, or groups of conditions one level deep.
  - A condition is a field, a comparison and a value. Every field allows a fixed set of comparisons, and the field's type fixes the value's shape (`RULE_FIELDS` in `@highsea/api-contract`).
  - People have one field per role (Actor, Director, Writer, Composer, Producer, Cinematographer, Editor), at the owner's request, plus anyone in the cast and crew. Roles match TMDB's crew jobs (`ROLE_JOBS`, from TMDB's [`/3/configuration/jobs`](https://developer.themoviedb.org/reference/configuration-jobs)).
  - Watched and last played are in the contract but refused until playback exists (Phase 4).
  - A collection may name another collection. Saving refuses a collection that names itself, directly or through others.
- **Facts get columns and tables** (migration 0012), filled whenever metadata or a file's probe is written, and backfilled by two jobs that are safe to repeat (ADR 0022):
  - `movie_metadata` gains `original_language`, `runtime` and `certification`;
  - `movie_terms` holds genres, keywords, studios and countries;
  - `media_files` gains `resolution`, `hdr` and `video_codec`;
  - `media_file_languages` holds each file's audio and embedded subtitle languages.

  Each is indexed. Facts already in the JSON stay there as the source.
- **Keywords come with each movie's request.** `keywords` joins `append_to_response` ([Append to response](https://developer.themoviedb.org/docs/append-to-response), [Movie keywords](https://developer.themoviedb.org/reference/movie-keywords)), so a keyword rule costs no extra request. Movies cached before 8d get their keywords at their next refresh.
- **Certifications are the region's.**
  - The stored certification is TMDB's for the server's metadata region.
  - The rule's choices and the order behind "or milder" come from TMDB's [certification list](https://developer.themoviedb.org/reference/certification-movie-list). It is cached in settings and refreshed at most weekly, like `/3/configuration`.
  - Until it's fetched, any certification is accepted and "or milder" matches only that one.
- **Rules are compiled to one parameterised SQL query in the runtime** (`collection-query.ts`), behind a `CollectionLibrary` seam, so curation never imports media (as ADR 0048's `CurationLibrary`).
  - Lookups in the fact tables are uncorrelated `IN (SELECT …)`, which SQLite evaluates once per statement ([SQLite: subquery expressions](https://sqlite.org/lang_expr.html#subq)).
  - No value is ever concatenated into the SQL.
  - A negated condition ("not in English") matches titles with nothing to say on it.
  - Sidecar subtitles match on their primary language subtag, so `en` matches `en-GB` ([RFC 5646 § 2.2.1](https://www.rfc-editor.org/rfc/rfc5646#section-2.2.1)).
- **Collections are evaluated when read, not stored as lists.** The admin's list and preview count every match and the playable ones; the apps see only what the person can play. "Playable" is ADR 0048's: a version with a file.
  - Random order is stable for a day and differs by collection.
  - The limit applies after sorting.
- **The service is `@highsea/curation/collections`.** It holds the CRUD in the admin's order, checking, the rules in words (i18n), the field choices from what's in the library, and the people search by role. Who sees a collection is curation's audience.
- **Featured sections draw on collections.** A section's `collection` rule takes a smart collection's `sc-` id as well as TMDB's.
  - 8c's `filter` rule is gone. Sections that used it become smart collections at boot, which is safe to repeat.
  - A collection can't be deleted while a section or another collection uses it (409 `conflict`, reason `in-use`).
- **Routes:**
  - **Staff only:** under `/api/v1/curation/collections`. The list, CRUD, `POST …/preview` (a draft, saves nothing), `GET …/fields` and `GET …/people`.
  - **Anyone signed in:** `GET /api/v1/library/collections` and `/{id}`, with the audience applied, the server's collections then TMDB's. `/api/v1/collections/{id}` stays TMDB's page (ADR 0014).
- **Events:**
  - `collections.updated` is staff only.
  - A change also sends `home.updated` to the people a collection's old or new audience reaches, and refreshes curation's fingerprints.

## Consequences

- **The apps' list evaluates every visible collection on each request.** At 100,000 titles a query takes from about 20 to 150 ms (runtime's scale test). If a library grows past that, the next step is caching each result on the collections' version and the day.
- **Keywords arrive slowly for an existing library.** Until each movie's next refresh (at most 30 days), keyword rules miss older titles.
- **Codecs are ffprobe's names** (`h264`, `hevc`), labelled in the admin. Release names vary too much to filter on.
- **Two fact stores to keep in step.** Every writer of metadata or probes goes through `putMovie` and `writeFileFacts`. A new writer that skips them leaves rules blind to its rows, until the backfill jobs' version is bumped.
- **Watched and last played wait for Phase 4,** with personal collections.
