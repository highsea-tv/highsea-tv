# Phase 3, checkpoint 5: indexers and the catalog

- **Status:** Scoped on 2026-10-20. The owner answered the [open questions](#open-questions-for-the-owner) on 2026-10-20, taking every recommendation, and gave the go-ahead. Built on 2026-10-20. At review the owner asked for domain packages with subpath exports and a shared media layer (ADR 0036), then signed the checkpoint off on 2026-10-20.
- **Gate:** stop when the checkpoint is built. Report what was built, the judgement calls, the API added, screenshots and the check results, then ask for review. Checkpoint 6 (downloading and importing) starts only after sign-off.
- **Parent plan:** [phase-3-server.md](phase-3-server.md). Its standing rules, architecture and decisions all apply, including decision 5 (nothing is published until the owner says so) and decision 6 (the admin is for the owner and admins only). This document settles what that plan's checkpoint 5 item and the specs leave open.

## Read first

- [indexers.md](../product/indexers.md): A9, its states, copy, data and open questions.
- [movies.md](../product/movies.md): interactive search on A6, and the "no indexers yet" states checkpoint 4 built.
- [setup.md](../product/setup.md): the indexer step (step 5 in the prototype) and the starter pack.
- [dashboard.md](../product/dashboard.md) and [system.md](../product/system.md): the Indexers widget, the health line and the catalog version in About.
- [ADR 0007](../adr/0007-signed-independent-catalogs.md) (signed catalogs released on their own), [ADR 0022](../adr/0022-job-queue.md) (idempotent jobs), [ADR 0029](../adr/0029-external-services.md) (the fetch seam and recordings), [ADR 0031](../adr/0031-quality-and-the-decision-engine.md) (the decision engine and its slots for indexer facts).
- The roadmap's [Indexers and the independent catalog](../roadmap.md#indexers-and-the-independent-catalog).
- The prototype: `design/prototypes/src/admin/indexers/indexers.tsx`, setup's indexer step, the Search tab in `admin/movies/detail.tsx`, and the mock server's `catalog`, `indexers` and `movies.interactiveSearch`.

## Goal

The owner can add indexers from a signed catalog: a public one in one click, a private one through a form the definition generates, each tested before it counts. The server searches every enabled indexer for a movie, parses each result, and the decision engine says which it would take and why, on A6's Search tab. Indexers that fail back off and recover on their own, with health and 24-hour stats on A9. A new catalog version reaches a running server without a rebuild, and a tampered one is refused.

## Out of scope

- **Grabbing,** the queue and the torrent engine (checkpoint 6). Interactive search shows **Grab** disabled ([question 6](#open-questions-for-the-owner)).
- **RSS sync and automatic searches** (checkpoint 8). This checkpoint builds the RSS *kind* of definition and the feed reader, so checkpoint 8 only schedules it.
- **Usenet** (not in milestone 1; parent plan, Scope). See [question 2](#open-questions-for-the-owner) for Newznab.
- **Challenge solving** (FlareSolverr-style) for indexers behind a browser check: a [Later] item in the roadmap.
- **Per-tracker seeding rules:** they belong to the torrent engine in checkpoint 6 ([question 5](#open-questions-for-the-owner)).
- **Publishing the catalog** to GitHub Pages: the pipeline is built and run locally; nothing is pushed until the owner says so (decision 5).
- **Sound packs, presets and themes from the catalog:** the catalog format leaves room for them ([Generalized](#the-catalog)), but only indexers ship now ([question 8](#open-questions-for-the-owner)).

## Packages

| Package | Holds | Depends on |
| --- | --- | --- |
| `schemas` (`@highsea-tv/schemas/indexers`) | The definition format as zod schemas, its JSON Schema export, `ENGINE_VERSION`, and `validateDefinition()`. Pure; no I/O | `core` |
| `indexers` | The engine: the five kinds, the request templates and field mappings, caps and category mapping, login flows, rate limits; health, backoff and stats; the indexer service (add, test, toggle, remove, search) | `core`, `db`, `jobs`, `schemas/indexers`, `parser`, `quality` |
| `catalog` | `CatalogService`: fetch, verify, filter, cache, update, the seed snapshot, extra URLs, `/config/definitions`; the bundle and manifest format; the signing tool the pipeline uses | `core`, `db`, `jobs`, `schemas/indexers` |
| `catalog/indexers` (not a package) | The definitions as YAML, logos, `SOURCES.md`, the pipeline script | `schemas/indexers` |

`schemas/indexers` is pure so the pipeline, the server and the prototype share it. The catalog's signing and verifying sit in one package so they can't drift apart.

## Definitions

**Declarative only, no code** (ADR 0007): a definition is data the engine interprets, so a remote update can't run anything on the server.

- **Kinds:**
  - **torznab** and **newznab:** the standard APIs. A definition gives the base URL, the settings (an API key) and the categories; the engine reads `t=caps` and maps them ([Torznab specification](https://torznab.github.io/spec-1.3-draft/torznab/Specification-v1.3.html)).
  - **json:** an HTTP API that answers JSON. Request templates plus field paths for each release field.
  - **html:** pages scraped with CSS selectors, for sites without an API. Request templates, selectors per field, and filters (trim, regex replace, date parse, size parse) from a fixed list.
  - **rss:** a feed with optional enclosure and `torznab:attr` fields.
- **Each definition carries** the roadmap's list:
  - id, version, `minEngineVersion`, logo, privacy, language, categories;
  - the settings fields, each with a "where to find this" help text;
  - the login flow (none, API key, cookie, form login), request templates, field mappings;
  - rate-limit hints (requests per window, minimum gap);
  - a test query;
  - `source` and `license` (below).
- **Templates** are a small, fixed expression language: `{{ .Config.apikey }}`, `{{ .Query.IMDBID }}`, conditionals and a few named filters. Fixed so nothing in a definition can reach the network, the disk or the process beyond what the engine itself does with the result.
- **The engine version** is a semver number in `schemas/indexers` (`ENGINE_VERSION`). A definition with a higher `minEngineVersion` major is skipped; within one major the engine stays backward compatible (ADR 0007).
- **Validation** runs in the pipeline, at load on the server, and in a test over every definition in the repo (the parent plan's "every catalog definition validates").

### Where definitions come from

Checked on 2026-10-20, and different from the roadmap's assumption:

- **Prowlarr's definitions** ([Prowlarr/Indexers](https://github.com/Prowlarr/Indexers)) are Cardigann YAML. The repository has **no license file** (GitHub reports none), and Prowlarr itself is GPL-3.0. With no license, the definitions can't be copied.
- **Jackett's definitions** are **GPL-2.0** ([Jackett](https://github.com/Jackett/Jackett), GitHub reports GPL-2.0). The roadmap already rules GPL-2.0-only content out of an AGPL-3.0 project. Many of Prowlarr's definitions began as Jackett's, which is another reason to treat them as off limits.
- **So highsea writes its own,** from each site's own published API documentation or, for HTML sites, from the page as served, and records the author and license on each one. The format is highsea's, not Cardigann's: shaped by the same needs, but written from our own specification, with no definition or schema copied ([question 1](#open-questions-for-the-owner)).
- **Each definition's licence** is recorded as `license` (an SPDX id; CC0-1.0 or MIT for ours) with `source` (who wrote it, and the documentation it was written from). `bun run licenses` grows a check that every catalog file has both.

## The catalog

### The pipeline (`catalog/indexers`)

A script, `bun run catalog:build`, and the CI job on `catalog/**` that runs it:

1. **Validate** every definition against `schemas/indexers`, and smoke-test it against the fake indexer when it has a recording.
2. **Bundle:** one JSON file per channel holding every definition, plus the logos, versioned by date (`2026.10.21`, with a suffix for a second release that day), as the prototype's header shows.
3. **Sign:** an ed25519 signature over the manifest, which lists the bundle's SHA-256, its version, the channel and the oldest engine it needs. Node's `crypto.sign(null, data, key)` with an ed25519 key ([Node: crypto.sign](https://nodejs.org/api/crypto.html#cryptosignalgorithm-data-key-callback)); no dependency.
4. **Publish** to `stable` and `beta`: written to `dist/catalog/` locally. The GitHub Pages step is written but switched off until the owner says to publish (decision 5).

A changelog entry per version, from a `CHANGES.md` the author writes, goes in the manifest for the **What changed** dialog.

### Keys

- **The public key is embedded** in the server; the private key never enters the repo.
- **More than one public key may be trusted,** so a key can be rotated: the manifest names its key id, and the server accepts any key on its list.
- **Tests** generate a throwaway key pair per run and boot the server trusting it. No real key is ever needed in CI.
- **The release key** is created by the owner when publishing begins and kept as a GitHub Actions secret ([question 3](#open-questions-for-the-owner)).

### `CatalogService`

- **Fetches** on boot and every 6 hours (a job, safe to repeat), with `If-None-Match` so an unchanged catalog costs one small request.
- **Verifies** the manifest's signature, then the bundle's hash. A failure keeps the catalog it had, logs the reason, and raises a health warning ("The catalog update failed its signature check. Keeping 2026.10.14."). Nothing unsigned or tampered is ever loaded.
- **Refuses to go back:** a signed manifest older than the installed one is ignored, so an old, validly signed catalog can't be replayed to undo a fix.
- **Filters** definitions whose `minEngineVersion` the engine doesn't meet.
- **Caches** the verified bundle under `/config/catalog/` and in `catalog_definitions`, so a restart works offline.
- **The seed snapshot:** a signed bundle shipped inside the server image, used on first boot and whenever nothing newer is cached.
- **Updates installed indexers** to the new definition version ([question 4](#open-questions-for-the-owner)), keeping their settings; a setting the new version drops is removed, a new required one marks the indexer as needing attention.
- **Extra catalog URLs,** each with its own trusted public key, in Settings › General's Catalog group ([question 7](#open-questions-for-the-owner)).
- **`/config/definitions`:** local YAML definitions, validated but unsigned, for people writing their own. They're marked **Local** on their cards and override a catalog definition with the same id. A broken one is skipped with its validation errors in the log and a health warning.
- **Channel:** `stable` by default; `beta` is a setting.
- **Generalized:** the manifest has a `kind` (`indexers` now), so presets and sound packs can ride the same signing and service later (roadmap › Generalize the catalog).

## The engine

### Searching

- **One search** fans out to every enabled indexer that isn't backing off and supports the movie category, in parallel, each with a timeout (30 seconds by default).
- **Queries** use the strongest id the indexer's caps support (TMDB id, then IMDb id), then title and year, as the Torznab caps describe.
- **Results** are normalized to `Release`, parsed by `parser`, matched to the movie, and judged by the decision engine. The facts ADR 0031 left slots for are filled now: seeders, indexer, protocol, age and indexer flags (freeleech from `downloadvolumefactor`).
- **The decision engine's slots** that this checkpoint wires: minimum seeders, minimum age and blocked indexer. The ranking gains its remaining keys (indexer priority, seeders, size nearest preferred).
- **Search results are cached** in `releases` for 30 minutes per movie, so checkpoint 6's Grab can take a release by its guid without searching again.

### Health, backoff and stats

- **Health:** healthy, backing off, failing, disabled; as the prototype shows.
- **Backoff** after a failure, growing with each failure in a row: 5 minutes, then 15, 30, 1 hour, 3 hours, capped at 6 hours, with jitter. An HTTP `429` with `Retry-After` uses that time instead. **Retry now** clears it.
- **Failing** after failures across 6 hours of tries; a success returns the indexer to healthy at once.
- **Auth errors** (a `401`, or an API error that says the credentials are wrong) go straight to failing with the message, because retrying a wrong key never helps.
- **Rate limits** from the definition's hints are honoured per indexer, across searches and tests.
- **Stats:** queries, grabs (zero until checkpoint 6), average response time and success rate over 24 hours, from `indexer_status` and an hourly roll-up, so the table is one cheap read.
- **Events:** `indexers.updated` on every change; `health.updated` when health crosses a line, for the dashboard and System.

### Secrets

Indexer settings marked secret (API keys, passwords, cookies) are encrypted at rest as the TMDB key is ([Data › Secrets](phase-3-server.md#data)), never returned by the API (reads show whether each is set), and stripped from recordings, logs and error messages.

## Data

From the parent plan's [first pass](phase-3-server.md#data):

- `catalog_definitions`: id, version, kind, the definition JSON, source, license, the catalog version and channel it came from, or `local`.
- `indexers`: id, definition id, name, enabled, priority, the settings (secrets encrypted), added and updated times, `needs_attention`.
- `indexer_status`: per indexer, the failure count, backoff until, last error, last success.
- `indexer_stats`: hourly roll-ups (queries, failures, total response time, grabs).
- `releases`: the interactive search cache, keyed by movie and guid, with the parsed fields, the decision and its reasons, and an expiry.
- The catalog's installed version, channel and extra URLs as a `settings` row.

## API

From indexers.md, with the changes real data forces:

| SDK | Route | Change from the spec |
| --- | --- | --- |
| `indexers.list()` | `GET /api/v1/indexers` | As specified, plus `needsAttention` |
| `indexers.catalog()` | `GET /api/v1/catalog/indexers` | Adds `local` and `installed`; `?starter=true` for setup |
| `catalog.status()` | `GET /api/v1/catalog` | New: the version, channel, last check and its result, and the changelog for **What changed** |
| `catalog.check()` | `POST /api/v1/catalog/check` | New: check for a new version now (System's tasks run the same job) |
| `indexers.add(definitionId, settings)` | `POST /api/v1/indexers` | As specified; adds then tests, and returns the test result with the indexer |
| `indexers.test(idOrDefinitionId, settings?)` | `POST /api/v1/indexers/test` | As specified |
| `indexers.update(id, patch)` | `PATCH /api/v1/indexers/{id}` | New: enabled, priority and settings in one route; `toggle` is this with `enabled` |
| `indexers.clearBackoff(id)` | `POST /api/v1/indexers/{id}/retry` | As specified |
| `indexers.remove(id)` | `DELETE /api/v1/indexers/{id}` | As specified |
| `movies.interactiveSearch(id)` | `POST /api/v1/movies/{id}/search` | Searches now and returns `Release[]` with the decision; a `POST` because it costs every indexer a query |
| `movies.releases(id)` | `GET /api/v1/movies/{id}/releases` | New: the cached results, so the tab can come back without searching again |

- **Access:** all of these are `staff`. The catalog's settings (channel, automatic updates, extra URLs) are `owner`, like the network and metadata settings (ADR 0032's answers of 2026-10-20). Indexers are part of running the server, so the guard table's `user` list doesn't grow.
- **`system.server().catalogVersion`** comes from `CatalogService`.
- **The 409 `no-indexers`** from checkpoint 4 (add with Search now, bulk search) now checks for an enabled indexer; with one, Search now queues the search, which checkpoint 6 finishes.

## Admin

- **A9 Indexers:** ported from the prototype.
  - Installed and Catalog tabs; the catalog's search, privacy and language filters.
  - **Add** for public definitions: adds, tests, toasts.
  - **Set up** for private ones: the generated form, validated on submit, tested before saving.
  - **What changed** from `catalog.status()`.
  - **Retry now** while backing off; Test and Remove in More.
  - A **Local** badge on cards from `/config/definitions`.
  - **Edit** in More, opening the same generated form with priority ([question 5](#open-questions-for-the-owner)).
- **A6 Search tab:** "Searching {n} indexers…" over row skeletons, then the prototype's table: indexer and release name, quality and formats, format score, size, seeders and leechers, age, the decision with its reasons, and **Grab** disabled with the hint "Grabbing comes with downloads." ([question 6](#open-questions-for-the-owner)). Before any indexer exists, checkpoint 4's empty state stays.
- **Setup:** the indexer step after the folders, as setup.md lays out: the starter pack, one checkbox each, public ones checked once; private ones carry "Needs an account" and are added later from A9. Skippable. The wizard has 8 steps (subtitles still to come).
- **The dashboard:** the Indexers widget comes alive, and its empty state's **Add indexers** links to A9.
- **System:** the catalog version in About, a **Check the catalog** task, and the health checks "No indexers are enabled" and "{Name} has been failing since {time}".
- **Settings › General › Catalog:** the channel, automatic updates and extra catalog URLs ([question 7](#open-questions-for-the-owner)).
- **Sweeps:** `scripts/sweeps/server.ts` boots with a locally signed catalog and the fake indexer, adds a public and a private indexer through the API, and visits A9's tabs, the setup dialog, What changed, A6's Search tab with results, and the setup step.

## The fake indexer

The parent plan's rule: indexers are tested against a local fake indexer serving recorded results.

- **A small HTTP server** in `packages/indexers/test/fake/`, started per test on a free port, speaking Torznab and Newznab, a JSON API, an HTML site and an RSS feed, each from recorded fixtures.
- **The recordings** are written for highsea from the protocols' documented shapes, with invented release names drawn from the parser's corpus. No real tracker's responses or passkeys are recorded.
- **It can misbehave on cue:** slow answers, `429` with and without `Retry-After`, `401`, `5xx`, malformed XML, an empty result, a changed page layout.
- **The same server** backs the sweeps and the parent plan's end-to-end run ("one-click add of a mock public indexer from the local catalog").

## Tests

- **`schemas/indexers`:** good and bad definitions; every definition in `catalog/indexers` validates; templates can't reach anything outside their inputs.
- **`indexers`:**
  - each kind against the fake indexer, through caps, search and the field mappings;
  - category mapping; query building by id, then title and year;
  - backoff's schedule with a fake clock; `Retry-After`; auth errors; recovery;
  - rate limits; stats roll-ups;
  - secrets never appear in errors, logs or API responses;
  - the decision engine's new slots and ranking keys.
- **`catalog`:**
  - sign and verify with a throwaway key; a changed byte in the bundle or the manifest is refused; an unknown key is refused; an older version is refused;
  - engine-version filtering; the seed snapshot on first boot; offline restart from the cache;
  - **catalog independence:** a running server serves version N, the test publishes N+1 to the local static host and runs the check, and the server's definitions change without a restart; a tampered N+2 leaves N+1 in place;
  - `/config/definitions` overrides and broken files;
  - installed indexers updated to a new definition version, keeping their settings.
- **Integration:** each new route's happy path and access, through the SDK; the guard table picks up the new routes on its own.
- **Node smoke:** boots with the seed catalog and answers `GET /api/v1/catalog`.

## ADRs

- **0033, indexer definitions:** the declarative format, the five kinds, the template language and why it's closed, the engine version, and writing definitions ourselves (the licence findings above).
- **0034, the catalog service and signing:** the manifest, ed25519, key ids and rotation, refusing older versions, the seed snapshot, extra URLs and local definitions. It implements ADR 0007, which stays the decision; 0034 is how.
- **0035, indexer health:** backoff, failing, rate limits, stats roll-ups, and search fan-out.
- **0036, domain packages** (added at the owner's review): `@highsea-tv/schemas` and `@highsea-tv/media` with a subpath per kind, and `@highsea-tv/media/shared` for what every media type shares (root folders, profiles, formats, sizes, names, paging), so shows and music start from it.

## Specs owed

Updated as part of the checkpoint, each change listed in the report:

- **indexers.md:** the answered open questions, Edit and priority, the Local badge, the API table.
- **movies.md:** the Search tab's disabled Grab, the `releases` route.
- **setup.md:** the indexer step as built, 8 steps.
- **settings.md:** General's Catalog group.
- **system.md:** the catalog task and the health checks.
- **roadmap.md:** the definitions' sources (Prowlarr and Jackett can't be used).

## Open questions for the owner

Each has a recommendation; the first option is it.

**Answered on 2026-10-20: the owner took the recommendation on all eight.** In short:

1. highsea writes its own definitions under CC0-1.0, starting with a generic Torznab definition and a few documented public sites.
2. The Newznab kind is built; the catalog lists no Newznab definitions and search leaves Usenet results out until Usenet arrives.
3. The owner creates the release key when publishing begins; until then a labelled development key signs the seed snapshot, trusted only by development builds. Room for one rotation.
4. New catalog versions install on their own, with What changed on A9 and an event in System; a setting switches to "Ask first".
5. Priority is a number (1 to 50, 25 by default, lower first) in an Edit dialog from the row's More menu; seeding rules join it in checkpoint 6. The Edit item is approved as a change to the locked layout.
6. Grab is shown disabled with "Grabbing comes with downloads."
7. A Catalog group in Settings › General after Metadata, owner only; the search timeout stays a fixed 30 seconds.
8. Other catalog content comes later; the manifest's `kind` keeps the door open.

1. **Where definitions come from.**
   - **Recommended:** highsea writes its own, from each site's published documentation, under CC0-1.0, starting small: a generic **Torznab** definition (which also lets an owner point at an existing Prowlarr or Jackett), plus a handful of public sites with documented APIs. The catalog grows with contributions.
   - Or: ask Prowlarr's maintainers for a licence on their definitions before using any. Slow and uncertain.
2. **Newznab, before Usenet exists.**
   - **Recommended:** build the Newznab kind (Torznab extends it, so it's nearly free) but list no Newznab definitions in the catalog and leave Usenet results out of search until Usenet arrives.
   - Or: drop Newznab from this checkpoint.
3. **The release signing key.**
   - **Recommended:** the owner creates it when publishing begins, kept as a GitHub Actions secret and offline; the server trusts its public key plus room for one rotation. Until then the seed snapshot is signed with a development key that's clearly labelled and only trusted by development builds.
   - Or: a key per maintainer, any one of them trusted.
4. **Catalog updates** (indexers.md's open question).
   - **Recommended:** install new versions on their own, as ADR 0007 says, with the version and **What changed** on A9 and an entry in System's events. A setting turns it to "Ask first".
   - Or: always ask first.
5. **Priority and seeding rules** (indexers.md's open questions).
   - **Recommended:** priority is a number field (1 to 50, lower first, 25 by default, the scale Radarr and Prowlarr document) in an **Edit** dialog from the row's More menu, reusing the setup form. Seeding rules come with the torrent engine in checkpoint 6, in the same dialog. Adds an Edit item to a locked layout.
   - Or: drag to reorder the table.
6. **Grab on the Search tab before downloading exists.**
   - **Recommended:** shown, disabled, with "Grabbing comes with downloads.", like checkpoint 4's Search now.
   - Or: hidden until checkpoint 6.
7. **Where catalog settings live.**
   Settings has no Indexers area, so any place is a change to a locked layout.
   - **Recommended:** a **Catalog** group in Settings › General, after checkpoint 4's Metadata group: the channel, automatic updates, and extra URLs with their keys. Owner only, like Metadata. The search timeout stays a fixed 30 seconds, not a setting.
   - Or: a new Indexers area in Settings' Downloads group.
   - Or: on A9 itself, behind a settings button.
8. **Other catalog content** (sound packs, presets).
   - **Recommended:** later. The manifest's `kind` keeps the door open; appearance.md's open question stays open.
   - Or: sound packs now, as a second kind.

## Judgement calls

These are listed again in the checkpoint report:

1. highsea's own definition format, written from our own specification, not Cardigann's.
2. A closed template language, so a definition can't do anything the engine doesn't.
3. Backoff's schedule (5 minutes up to 6 hours, with jitter) and "failing" after 6 hours of failures.
4. Auth errors skip backoff and go straight to failing.
5. Older signed catalogs are refused, to stop replays.
6. Local definitions are unsigned but validated, and override the catalog.
7. Interactive search is a `POST`, and its results are cached for 30 minutes.
8. The catalog's channel and extra URLs are owner-only, as other trust settings are.
9. The fake indexer's recordings are written for highsea, not captured from real trackers.
10. `catalog` is its own package beside `indexers`, so signing and verifying live in one place.
