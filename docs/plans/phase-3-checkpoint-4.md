# Phase 3, checkpoint 4: movies, without downloading

- **Status:** Scoped on 2026-10-20, before building. The owner reviewed the scope on 2026-10-20 and decided that titles, people and collections are addressed by their TMDB ids ([Addresses are TMDB ids](#addresses-are-tmdb-ids)). The owner approved the recommendation on every open question the same day ([Owner's decisions](#owners-decisions)). The owner gave the go-ahead the same day, and signed the checkpoint off on 2026-10-20, recording decision 6 in the [Phase 3 plan](phase-3-server.md#decisions) with the review.
- **Gate:** stop when the checkpoint is built. Report what was built, the judgement calls, the API added, screenshots and the check results, then ask for review. Checkpoint 5 (indexers) starts only after sign-off.
- **Parent plan:** [phase-3-server.md](phase-3-server.md). Its standing rules, architecture and decisions all apply. This document settles what that plan's checkpoint 4 item and the specs leave open.

## Read first

- [movies.md](../product/movies.md): A4 Discover, A5 Movies, A6 movie detail.
- [media-pages.md](../product/media-pages.md): one page for every state, people and collections ([ADR 0014](../adr/0014-universal-media-pages.md)).
- [settings.md](../product/settings.md): Profiles and formats, Quality sizes, General's region.
- [setup.md](../product/setup.md): the TMDB key step (Phase 3 decision 4).
- [client-library.md](../product/client-library.md), [client-detail.md](../product/client-detail.md), [client-search.md](../product/client-search.md): the client API this checkpoint serves.
- [ADR 0012](../adr/0012-unified-media-item-model.md) (the item tree and versions), [ADR 0014](../adr/0014-universal-media-pages.md) (one page per title; addresses by provider id since its 2026-10-20 amendment), [ADR 0022](../adr/0022-job-queue.md) (idempotent jobs).
- The prototype: `design/prototypes/src/admin/{discover,movies,media}` and the mock server's `movies`, `metadata` and `settings` groups.

## Goal

The owner can find a film on TMDB, open its page, add it to the library with a quality profile and a version, and manage the library: browse, filter, sort, edit, bulk edit and delete. People and collections have their pages. The quality engine can parse any release name and say whether a profile accepts it, with the prototype's reasons, ready for checkpoint 5's indexers to feed it releases. Clients can list the library, open an item and search.

## Out of scope

- **Finding and downloading:** indexers, interactive search results, grabbing and the queue (checkpoints 5 and 6). The Search tab and Search now are present but can't find anything yet (see [decision 2](#owners-decisions)).
- **Files on disk:** importing, ffprobe and the existing-library scan (checkpoint 6). The Files and History tabs show their empty states.
- **Subtitles** and language profiles (checkpoint 7). Adding a movie stores the language profile it's given; the profiles are seeded and edited in checkpoint 7.
- **Automation:** RSS, missing and cutoff searches, import lists, the calendar feed (checkpoint 8).
- **Editing profiles and formats** in Settings (checkpoint 8, A15): see [decision 3](#owners-decisions).
- Series, music and books, though the schema keeps their place (`media_items.type`).

## Packages

| Package | Holds | Depends on |
| --- | --- | --- |
| `parser` | Release name → title, year, edition, quality (source, resolution, modifier), revision (proper, repack, version), languages, release group, hardcoded subs, ids in the name | `core` |
| `quality` | The quality vocabulary, profiles, custom formats and their conditions, sizes, the decision engine (specifications → `DecisionReason[]`), ranking | `core`, `parser` |
| `metadata` | The TMDB adapter, the metadata cache, images, the refresh logic | `core`, `db`, `jobs` |
| `media-movies` (now `@highsea/media/movies`, [ADR 0036](../adr/0036-domain-packages-with-subpath-exports.md)) | The movie service: add, update, delete, bulk, versions, collections, people; seeds (profiles, sizes) | `core`, `db`, `jobs`, `metadata`, `quality` |

`parser` and `quality` are pure: no database, no clock, no I/O. They're the parts later checkpoints call most, and pure code is easy to test against a large corpus. The prototype imports `parser` and `quality` after the move, as the parent plan's [porting rule](phase-3-server.md#porting-the-prototype) asks.

## External services: the fetch seam (ADR 0029)

The parent plan's [External services](phase-3-server.md#external-services) gives the rule. This checkpoint builds it and writes **ADR 0029**:

- **`Fetch` moves to `core`.** It's declared twice today (`packages/auth/src/context.ts`, `packages/sdk/src/client.ts`). `BootOptions.fetch` already injects it into the runtime; `metadata` takes the same one.
- **Recorded fixtures:** `packages/metadata/test/fixtures/tmdb/`, one JSON file per request, keyed by method, path and the query sorted, **with the key stripped**. A replaying `fetch` serves them and fails the test on any request it has no recording for, so no test reaches the network.
- **Recording:** `bun run record:tmdb` in `packages/metadata` refreshes the recordings with the developer's own key from the environment. It refuses to write a file containing the key or the bearer token, and is never run in CI.
- **Rate limits:** TMDB disabled its old 40-requests-per-10-seconds limit in December 2019. It still enforces an upper limit of around 40 a second and answers `429` above it ([TMDB: Rate limiting](https://developer.themoviedb.org/docs/rate-limiting)). The adapter keeps a small concurrency limit, retries `429` and `5xx` with backoff, and honours `Retry-After` when it's sent; the docs don't say whether it is.

## TMDB

### The key

- **Phase 3 decision 4 stands:** the owner enters a TMDB key in setup, with a link to TMDB's key page and a note on why, until the highsea cloud metadata proxy exists.
- **Either credential works.** TMDB issues both an API key (v3, a query parameter) and an API Read Access Token (a bearer header), and its docs default to the token ([Authentication](https://developer.themoviedb.org/docs/authentication-application)). The field accepts either; the adapter tells them apart by shape and sends each the documented way.
- **Validation:** `GET /3/authentication` with the credential. A `401` (TMDB's `status_code` 7, "Invalid API key") is shown as "TMDB didn't accept that key. Copy it again from your TMDB account."
- **Stored encrypted,** as other provider secrets ([Data › Secrets](phase-3-server.md#data)), and never returned by the API: reads show whether a key is set and its last four characters.
- **Without a key:** Discover, adding and metadata refresh say "Add a TMDB key to find movies" and link to where it's set. The library and its pages still work from the cache.
- **Where it's changed later:** Settings › General › Metadata ([decision 1](#owners-decisions)).
- **Bring your own key** matches TMDB's terms, which don't allow sublicensing access to the API ([Terms of use](https://www.themoviedb.org/api-terms-of-use)): each server uses its owner's own key.

### Attribution

TMDB's terms require its logo and the notice "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." ([Terms of use](https://www.themoviedb.org/api-terms-of-use)), in an About or Credits section ([FAQ](https://developer.themoviedb.org/docs/faq); [logos](https://www.themoviedb.org/about/logos-attribution)). The terms' wording is used, being the stricter of the two. It goes on the System page's About, in the setup step's note, and in the client API's server info so clients can show it in their own About.

### The cache, and its six-month limit

TMDB's terms forbid keeping cached data for more than six months ([Terms of use](https://www.themoviedb.org/api-terms-of-use)). So:

- **Every cached row has a `fetched_at`.** A library movie is refreshed well inside the limit (below). A title that isn't in the library (seen on Discover, a filmography or a collection) is purged once it's older than the limit, unless something in the library refers to it.
- **Refresh by changes.** TMDB's change lists (`/3/movie/changes`, `/3/person/changes`) cover a window of up to 14 days, 24 hours by default ([Changes](https://developer.themoviedb.org/reference/changes-movie-list)). A daily job reads the last day's changes and refreshes the cached movies and people that appear in them. If the job hasn't run for more than 14 days, it falls back to refreshing everything older than a week.
- **A full refresh** of each library movie at least every 30 days, spread over the days so no single run is large. With the changes job this keeps library rows well under the six-month limit.
- **Manual refresh:** Refresh on the movie page and in bulk edit, through the same job.
- The jobs are safe to repeat ([ADR 0022](../adr/0022-job-queue.md)): a refresh writes the latest response and `fetched_at`, so running it twice changes nothing.

### Images

TMDB's `/3/configuration` gives the image base URL and the sizes each kind of image comes in. The docs don't address hotlinking. Of the two approaches, the owner chose the first ([decision 4](#owners-decisions)):

- **Cached by the server** (chosen): fetched at the sizes the screens use, kept on disk under `/data/images`, served from `/api/v1/images/…` with long cache headers, and purged with the metadata they belong to. Clients never contact TMDB, so the LAN, privacy and offline cases work, and no new native dependency is needed because TMDB already serves the sizes.
- **Hotlinked** (not chosen): clients load `image.tmdb.org` directly. Less on the server, but every client depends on TMDB being reachable, and each one reports its address to TMDB.

### Fields and how they map

| Prototype | TMDB | Note |
| --- | --- | --- |
| `rating` out of 5 | `vote_average`, 0 to 10 | Stored as TMDB gives it, plus `vote_count`. The `Rating` component draws five stars, so the API converts at the edge. The TMDB docs don't state the scale; it's established practice. |
| `runtimeMinutes` | `runtime` | Minutes by established practice; the docs don't state the unit. |
| `certification` | `release_dates`, per region, types 1 to 6 (Premiere to TV) | The certification for the server's region ([decision 5](#owners-decisions)), from the theatrical release first, then digital, then any. |
| `Department`, 6 values | `/3/configuration/jobs`: 12 departments | Widen the type to TMDB's 12: Acting, Directing, Writing, Production, Sound, Camera, Editing, Art, Costume & Make-Up, Visual Effects, Crew, Lighting. |
| `Video.lengthSeconds` | No duration field | Drop it, and remove the length from the trailer card. A list change forced by real data, reported. |
| `Video.still` | None | The YouTube thumbnail would load from Google before anyone asks for the video, which media-pages.md rules out. Use the movie's backdrop, as the prototype's fallback. |
| `Video.kind`, 4 values | 7 types | Add Behind the Scenes, Bloopers, Opening Credits. |
| `Person.died.place` | None | TMDB has `place_of_birth` but no place of death. `died` becomes `{ date }`. |
| `wikidataId`, `imdbId` | `external_ids` | Both present; either may be missing. |
| Movie, collection and person ids | TMDB numbers | Used as they are: [Addresses are TMDB ids](#addresses-are-tmdb-ids). The prototype's numbers and slugs (`/movies/4`, `/people/fritz-lang`) go. |

One movie request uses `append_to_response` (at most 20 sub-requests) for `credits`, `videos`, `release_dates`, `external_ids` and `recommendations`, so a full movie is one call.

## Addresses are TMDB ids

**Owner's decision (2026-10-20),** amending [ADR 0014](../adr/0014-universal-media-pages.md#amendment-2026-10-20-addresses-use-the-providers-id): a title's id is its id at the provider, as [Seerr](https://github.com/seerr-team/seerr) does. TMDB's *Spider-Man: Brand New Day* is `themoviedb.org/movie/969681`, so in highsea it's `/movies/969681`, in the admin, the clients and the API, in the library or not.

- **Movies, people and collections** use their TMDB ids: `/movies/{tmdbId}`, `/people/{tmdbId}`, `/collections/{tmdbId}`.
- **Any TMDB movie opens,** whether the server has seen it before or not. The page loads its metadata from the cache or from TMDB, then shows the library layer if the movie is added. Nothing is created to make a link work, so Discover and search results write nothing.
- **Adding** creates the library rows for that id. Removing deletes them; the page stays where it was, without its library layer.
- **The type keeps ids apart.** TMDB numbers movies and shows separately, so movie 1399 and show 1399 are different titles. The address and every key include the type.
- **Internal keys** (versions, files, history) may use their own row ids, but those never appear in an address or as a title's id in the API.
- **When TMDB removes or merges an id** (rare, but it happens), a library movie keeps its rows and its address, and shows "TMDB no longer has this movie" with a way to pick its new match. Detected by the refresh job, which gets a `404` (TMDB's `status_code` 34).
- **One id, not two:** the prototype's types carry both `id` and `tmdbId`. In the contract they're the same number, so `MediaItem`, `DiscoverMovie` and `MovieMetadata` keep `id` alone.
- **The prototype** keeps its mock ids; the server and the ports use TMDB ids. Listed in the checkpoint report as a change the owner decided.

## Data

New tables, from the parent plan's [first pass](phase-3-server.md#data):

- **Media:**
  - `media_items`: the library's titles, keyed by `type` and the provider id (`tmdb_id` for movies), with `parent_id` for the tree, monitored, minimum availability, the root folder, the path, `added_at`;
  - `movie_metadata`: the TMDB cache, keyed by TMDB id, with `fetched_at`, for any movie the server has fetched, in the library or not;
  - `versions` (label, quality profile, its file once there is one);
  - `people`, `credits` (cast and crew, ordered) and `collections`, each keyed by TMDB id, as part of the cache;
  - `images` (kind, size, the cached file).
- **Acquisition:** `quality_profiles`, `custom_formats`, `quality_sizes` (as a settings row), `root_folders`, `tags`.
- **Indexes** for every library filter and sort (title, year, added, rating, status, profile, monitored), and the 100k-row test from the parent plan covering them.
- **The two layers** are two sets of tables joined by TMDB id: the cache (every state) and the library (once added). One page reads both.

## Quality

### The vocabulary

highsea defines its own quality list, written from the documented behaviour of Radarr and the TRaSH Guides, not from Radarr's code:

- **Sources:** unknown, cam, telesync, telecine, workprint, DVD, TV, WEB-DL, WEBRip, Blu-ray.
- **Modifiers:** none, regional, screener, raw HD, BR-DISK, remux.
- **Resolutions:** 360, 480, 540, 576, 720, 1080 and 2160.
- **Named qualities:** combinations of the three, ranked from Unknown to Remux-2160p, with WEB-DL and WEBRip grouped as WEB at each resolution, as Radarr's defaults and TRaSH's profiles do.
- **The prototype's quality strings** ("HD 1080p", "Bluray-1080p") map onto these.

### Licences

Radarr is **GPL-3.0**. GPL-3.0 code may be combined with AGPL-3.0 code, but highsea is written fresh: behaviour is taken from documentation (the Radarr wiki, the Servarr wiki, the TRaSH Guides) and stated in our own tests, and no Radarr source or test is copied. The TRaSH Guides are **MIT**: their custom format and profile JSON can be bundled as presets with the MIT notice kept, which is what settings.md's Presets describe.

### Profiles

A profile has:
- the allowed qualities, in groups, with the cutoff;
- whether upgrades are allowed;
- the minimum format score, the cutoff format score and the minimum score for an upgrade;
- a score per custom format.

The prototype's `QualityProfile` grows the groups and the upgrade minimum. Seeded on first boot: the prototype's profiles (Any, HD 1080p, UHD 2160p and the others it shows).

### Custom formats

A format is a set of conditions. Each condition has a kind, a value, and `negate` and `required` flags. Kinds:
- release title (a regular expression);
- edition;
- release group;
- language;
- indexer flag;
- source;
- resolution;
- quality modifier;
- size (a range in GB);
- year.

Matching follows the Servarr wiki's documented rule:
- conditions of the same kind are alternatives;
- different kinds must all hold;
- a required condition must hold on its own;
- `negate` inverts a condition.

The prototype's `conditions: string[]` becomes this model, and TRaSH's JSON imports into it directly.

### Sizes

MB per minute per quality (min, preferred, max), checked against the movie's runtime. Radarr assumes 110 minutes when the runtime is unknown, and highsea does the same. The defaults come from the documented Radarr defaults. Its "MB" are MiB, and the settings table says so in its note.

### The decision engine

- **Input:** a parsed release and its context: the movie, the version's profile, sizes, the existing file, and the indexer's facts when checkpoint 5 provides them.
- **Output:** `{ approved, reasons: DecisionReason[] }` in the prototype's shape.
- **This checkpoint's specifications:** quality allowed by the profile; minimum and maximum size; custom format minimum score; upgrade allowed, upgrade wanted and cutoff met; and language.
- **Specifications that wait for later checkpoints:** those needing indexers, the queue, history or the blocklist (seeders, minimum age, blocked indexer, already queued, already imported, blocklisted). Each is a registered slot that returns nothing until its checkpoint wires it.
- **Ranking:**
  1. quality, then revision;
  2. format score;
  3. the remaining keys from checkpoint 5, which has the facts for them (protocol, indexer priority, seeders, size nearest preferred).
- **Reason copy** follows the prototype: "Bluray-1080p isn't allowed in HD 1080p", "Too large: 32.1 GB, the limit is 18.0 GB for 2h 12m".

## The parser

- **Approach:**
  - ordered, named regular expressions per field;
  - the title is whatever precedes the first year, quality or edition token;
  - written from the documented formats (scene naming rules, the Servarr wiki's quality definitions).
- **The fixture suite:** more than 2,000 real movie release names, each with its expected fields, stored as JSON in `packages/parser/test/fixtures/`. Sources, each with its licence recorded in a `SOURCES.md` beside them:
  - the test cases of TheBeastLT's [parse-torrent-title](https://github.com/TheBeastLT/parse-torrent-title) (MIT, about 1,300 cases);
  - dreulavelle's [PTT](https://github.com/dreulavelle/PTT) (MIT, about 1,000);
  - platelminto's [parse-torrent-name](https://github.com/platelminto/parse-torrent-name) (MIT, about 400);
  - names we write ourselves for the cases those miss (editions, remux, hardcoded subs, ids in the name).
- **Expected fields** are re-stated in highsea's vocabulary. Where a source's expectation disagrees with the Servarr documentation, the documentation wins and the case is noted.
- **Not used:**
  - Radarr's own parser tests (GPL-3.0, above);
  - guessit's (LGPL-3.0; compatible, but not needed with three MIT corpora).
- **Speed:** parsing a name takes well under a millisecond. A benchmark test guards it, since checkpoint 5 parses every RSS item.

## API

Routes from movies.md and media-pages.md, with the changes real data forces:

| SDK | Route | Change from the spec |
| --- | --- | --- |
| `movies.discover(query)` | `GET /api/v1/discover/movies?query=&page=` | Paged |
| `movies.add(input)` | `POST /api/v1/movies` | Takes the `tmdbId`, which is the movie's id. Adds a `versions` field: the first version's label and profile. Adding a movie that's already in the library returns it, unchanged |
| `movies.list(query)` | `GET /api/v1/movies?…` | Paged, filtered and sorted on the server. The prototype loads the whole library, which doesn't scale to 100k |
| `movies.get`, `update`, `delete` | `/api/v1/movies/{id}` | As specified |
| `movies.bulk…` | `POST /api/v1/movies/bulk` | As specified, plus `refresh` |
| `movies.refresh(id)` | `POST /api/v1/movies/{id}/refresh` | New: queues the refresh job |
| `movies.upcoming(days)`, `movies.recent(limit)` | `GET /api/v1/movies/upcoming`, `/recent` | New: the dashboard's movie sources |
| `movies.versions…` | `/api/v1/movies/{id}/versions[/{versionId}]` | Add, rename, change the profile, remove (ADR 0012) |
| `metadata.movie(id)` | `GET /api/v1/movies/{id}/metadata` | By TMDB id, for any movie on TMDB, with `inLibrary` |
| `metadata.recommendations(id)` | `GET /api/v1/movies/{id}/recommendations` | TMDB's recommendations, then its "similar" list ([decision 6](#owners-decisions)) |
| `metadata.collection(id)` | `GET /api/v1/collections/{id}` | Drops `/metadata/` from the path: a collection is a media page like a movie |
| `metadata.person(id)` | `GET /api/v1/people/{id}` | Same |
| `movies.qualityProfiles()` | `GET /api/v1/qualityprofiles[/{id}]` | Read-only this checkpoint |
| `movies.customFormats()` | `GET /api/v1/customformats` | Read-only this checkpoint |
| `settings.get('qualitySizes')` | `GET /api/v1/settings/qualitySizes` | Read-only this checkpoint |
| `movies.rootFolders()` | `GET`, `POST` and `DELETE /api/v1/rootfolders` | Returns `RootFolder` with free space and device (the mock returns paths only) |
| `quality.parse(name)` | `GET /api/v1/parse?title=` | New: the parser and the formats it matches, as Radarr has, for checking names by hand |
| `metadata.key` | `GET`, `PUT` and `DELETE /api/v1/settings/metadata` | New: set, validate and clear the TMDB key; region and language |

- **Permissions:**
  - reading the library and metadata needs `user` (the client API);
  - adding, editing and deleting need `manageLibrary`;
  - root folders and the key need `admin`;
  - Discover needs `manageLibrary`, since it's the admin's way to add.

  Requests come in Phase 5, so members don't add.
- **Events:** `movies.updated` and `item.updated` on every change; `metadata.updated` after a refresh.
- **The client API:**
  - **library:** the paged, filtered list;
  - **item:** `movies.get` and `metadata.movie`, with art URLs and the stored watch position;
  - **search:** `GET /api/v1/search?query=` over the library, and over TMDB too when the user may add.

  Watch positions are stored per user and item. Their writes come with playback in Phase 4, but the column and the read are built now so the shapes are settled.

## Admin

- **A4 Discover:**
  - search, plus a browse view when the query is empty with Trending, Popular, Now playing and Upcoming as tabs ([decision 7](#owners-decisions));
  - In library marked and linked;
  - the add dialog.
- **The add dialog:**
  - the prototype's dialog, with the version label and profile;
  - it remembers the last-used folder, profile, availability and Search now per user. A preference in the checkpoint 3 store (`admin.addMovie.defaults`), as movies.md's decision asks.
- **A5 Movies:**
  - grid and table, filters, sort, selection and bulk edit, ported;
  - paged from the server, with sort and filters in the address so Back keeps them.
- **A6 movie detail:**
  - the Overview, Cast and crew, Trailers, Collection and Recommendations sections;
  - the Files and History tabs, with their empty states;
  - the Search tab, pointing to Indexers until checkpoint 5 ([decision 2](#owners-decisions));
  - Refresh, Edit and Delete;
  - the version list with add and remove;
  - left for later: the Subtitles tab (checkpoint 7) and the live download states (checkpoint 6).
- **People and collection pages:** from `design/prototypes/src/admin/media/`, with the department filter over the 12 departments.
- **Setup:** the TMDB key step, between the owner and the library steps, as setup.md lays out, and skippable ("Add it later in Settings").
- **Settings › Profiles and formats and › Quality sizes:**
  - the reference areas, ported read-only with real data;
  - editing stays "Not in the prototype" until checkpoint 8 ([decision 3](#owners-decisions)).
- **Root folders** are managed in Settings › Media management's Importing group, where the prototype lists them. Adding one checks that it exists and is writable, and reports free space and the device (used by Storage's "what uses it").
- **Sweeps:** `scripts/sweeps/server.ts` seeds a library from the recorded TMDB fixtures through the API. It visits Discover, the add dialog, the library (grid, table, bulk), a detail page in each state, a person and a collection, and the setup key step.

## The dashboard and home, switched on

- **Widgets that come alive:**
  - Upcoming, Calendar and Recently added, through the 'movies' source;
  - Storage's "what uses it", by root folder.
- **Shell:** the sidebar's Movies count and the command palette's movie results.
- **Home rows:** Recently added, Continue watching (empty until Phase 4 writes positions) and the genre rows, in the client home layout.

## Tests

- **`parser`:** the corpus, plus the benchmark.
- **`quality`:**
  - each condition kind, with negate and required;
  - each specification, with its reason text;
  - ranking;
  - profile seeds;
  - TRaSH JSON import against a few bundled presets.
- **`metadata`:**
  - the adapter against the recordings;
  - key validation (good, bad, missing);
  - `429` backoff with a fake clock;
  - the changes job across its 14-day window;
  - the six-month purge;
  - a recording that leaks a key fails a test.
- **`media-movies`** (now `@highsea/media/movies`):
  - add by TMDB id, and opening a movie the server has never seen;
  - versions, bulk edits, delete with and without files;
  - collection and person pages;
  - adding twice is one movie.
- **Integration:** each new route's happy path and permission check, through the SDK, on the replaying `fetch`.
- **The 100k test** extends to `media_items` and the library's filters and sorts.
- **Node smoke:** boots with the metadata package and serves a recorded Discover.

## ADRs

- **0029, external services:** the injected `fetch` in `core`, recordings keyed by request with secrets stripped, the record script, rate limits and backoff.
- **0030, the metadata cache:** the cache keyed by TMDB id beside the library, `fetched_at`, the changes-based refresh, the 30-day sweep, the six-month purge, and images cached by the server.
- **0031, quality and the decision engine:** the vocabulary, the condition model, specifications as a registry later checkpoints add to, the clean-room approach to Radarr, TRaSH presets under MIT.

## Specs owed

The owner's decisions are already recorded in movies.md, media-pages.md, settings.md and setup.md (2026-10-20). The rest is updated as part of the checkpoint, each change listed in the report:

- **movies.md:**
  - the Data routes (paging, versions, refresh, upcoming, recent, root folders);
  - the Discover sources;
  - remembered add-dialog values.
- **media-pages.md:**
  - the collection and person routes;
  - no trailer length;
  - no place of death;
  - 12 departments;
  - the recommendations source;
  - certification by region.
- **settings.md:** where the TMDB key, region and metadata language live.
- **setup.md:** the key step's copy.
- **client-library.md, client-detail.md, client-search.md:** their Data sections.
- **system.md:** the TMDB attribution in About.

## Judgement calls

These are listed again in the checkpoint report:

1. Clean-room quality and parser code from documentation; MIT corpora for fixtures; nothing from Radarr's GPL source.
2. Rating stored 0–10 as TMDB gives it, converted to five stars at the API edge.
3. Department and video kinds widened to TMDB's lists; trailer length and place of death dropped.
4. A movie TMDB removes or merges stays in the library with a way to pick its new match.
5. Collection and person routes lose `/metadata/`.
6. `movies.list` is paged and filtered on the server.
7. The add dialog remembers its values per user as a preference.
8. Profiles, formats and sizes are seeded and read-only this checkpoint.
9. A full refresh every 30 days plus the daily changes job, which together stay inside the six-month limit.
10. The certification falls back from theatrical to digital to any release in the region.

## Owner's decisions

The owner reviewed the scope on 2026-10-20, decided the addresses ([Addresses are TMDB ids](#addresses-are-tmdb-ids)), and approved the recommendation on each question below. Decisions 1 and 7 change locked layouts and are approved as such; the prototype isn't changed, and the checkpoint report lists both.

1. **The TMDB key after setup:** a **Metadata** group in Settings › General, after Region. It holds:
   - the TMDB key: whether it's set, its last four characters, **Replace** and **Remove**;
   - the metadata language;
   - the region.

   Saving the key validates it, as setup does. The missing-key messages link here.
2. **Searching before indexers exist** (until checkpoint 5):
   - **The add dialog:** Search now is shown but disabled and off, with the hint "Add an indexer to search for releases." The button reads **Add movie**.
   - **The Search tab on A6:** shown, opening to that same sentence with a link to Indexers.
   - Nothing is queued to run later.
3. **Profiles and formats:**
   - this checkpoint seeds them and shows them read-only, as the prototype does;
   - the editors are designed as a prototype, approved by the owner, and built in checkpoint 8 with A15.
4. **Images are cached by the server,** as described in [Images](#images). Clients never contact TMDB.
5. **The region** is set in Settings › General and defaults to the owner's locale. It applies to certifications, release dates and Discover's lists. Each certification falls back from theatrical to digital to any release in the region.
6. **Recommendations** come from TMDB's recommendations, falling back to its "similar" list when that's empty. highsea's own recommendations, built from watch history, are for Phase 4 or later.
7. **Discover with no query** shows four tabs above the grid: **Trending** (this week), **Popular**, **Now playing** and **Upcoming**, each from TMDB's list for the region. Typing replaces them with the results, as now.
8. **Parser fixtures:**
   - the three MIT corpora plus names written for highsea, with their sources in `SOURCES.md`;
   - Radarr's GPL-3.0 tests aren't used.
