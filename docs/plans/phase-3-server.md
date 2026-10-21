# Phase 3 plan: server milestone 1

- **Status:** Approved by the owner on 2026-10-19, with the decisions below. Checkpoints 1 to 5 are signed off, checkpoints 2 to 5 on 2026-10-20. Checkpoint 3's scope and the owner's decisions are in [Checkpoint 3 in detail](#checkpoint-3-in-detail); with its sign-off the owner approved widgets up to 4 columns wide (dashboard.md › Decisions). Checkpoint 4's scope, judgement calls and the owner's decisions (all 2026-10-20, including addresses by TMDB id, amending ADR 0014) are in [phase-3-checkpoint-4.md](phase-3-checkpoint-4.md); its review added decision 6 (the admin is for the owner and admins only), built on 2026-10-20 ([phase-3-admin-access.md](phase-3-admin-access.md)). Checkpoint 5's scope, the owner's answers and judgement calls are in [phase-3-checkpoint-5.md](phase-3-checkpoint-5.md); its review added ADR 0036 (domain packages, and `@highsea/media/shared` for what every media type shares). Checkpoint 6 is scoped in [phase-3-checkpoint-6.md](phase-3-checkpoint-6.md), with the owner's answers of 2026-10-20: it's built in two gated halves, 6a and 6b. The owner then made VPN connections a first-class feature, scoped in the same plan; the owner answered its questions V1 to V6 on 2026-10-20, and approved its Settings › VPN prototype the same day. A follow-up after Phase 3 brings the dashboard's customization to Homarr's level ([dashboard-customization.md](dashboard-customization.md)). Phase 2 (the design prototypes) was signed off on 2026-10-19.
- **Gate:** the owner signs off on milestone 1. Phase 4 (the client apps) then builds on its API and SDK.
- **Source:** the Phase 3 section of the [roadmap](../roadmap.md#phase-3-server-milestone-1-implementation) and the gap analysis items tagged **[M1]**. This plan turns them into steps.
- **Build reference:** the signed-off prototypes in [`design/prototypes`](../../design/prototypes/README.md) and their specs in [`docs/product/`](../product/).

## Read first

1. [`docs/roadmap.md`](../roadmap.md): Phase 3, the gap analysis ([M1] and [Arch] items) and Verification.
2. The ADRs, especially:
   - [0002](../adr/0002-bun-monorepo-multiple-apps.md) monorepo;
   - [0003](../adr/0003-server-runtime-custom-entry.md) custom server entry;
   - [0004](../adr/0004-sqlite-drizzle.md) SQLite and Drizzle;
   - [0005](../adr/0005-in-process-torrent-engine.md) torrent engine;
   - [0006](../adr/0006-public-api-openapi-sdk.md) API, OpenAPI and SDK;
   - [0007](../adr/0007-signed-independent-catalogs.md) signed catalogs;
   - [0011](../adr/0011-no-compatibility-apis.md) no compatibility APIs;
   - [0012](../adr/0012-unified-media-item-model.md) unified media items;
   - [0014](../adr/0014-universal-media-pages.md) one media page per title.
3. Every spec in [`docs/product/`](../product/). Each has a **Data** section: the draft API calls and shapes the screen needs.
4. The prototype's mock server: [`src/mock/types.ts`](../../design/prototypes/src/mock/types.ts) (the draft API types) and [`src/mock/server.ts`](../../design/prototypes/src/mock/server.ts) (the draft behavior: permissions, the decision engine's reasons, the pipeline's states, curation resolution).
5. The READMEs of [`packages/ui-web`](../../packages/ui-web/README.md) and [`packages/tokens`](../../packages/tokens/README.md), and [`docs/design-language/platforms/admin.md`](../design-language/platforms/admin.md).

Run `bun run prototypes` and click through each flow before building it.

## Standing rules

These carry over from Phase 2 and apply to every step:

- **Gated phases.** Phase 4 starts only after the owner signs off on Phase 3. Within Phase 3, stop at each checkpoint below and ask for review.
- **Everything stays in the repo.** Docs, specs, plans and test fixtures live here. Never publish them as hosted artifacts or pages.
- **Git:**
  - commit only when asked; never push unless asked;
  - no attribution or co-author lines in commit messages;
  - match the style of earlier commits: an imperative subject, then a bulleted body.
- **SPDX header on every source file:** `// SPDX-License-Identifier: AGPL-3.0-only`, or `/* … */` in CSS, `#` in shell and YAML.
- **Unknowns:** use your best judgement, and list each judgement call in the checkpoint report so the owner can overturn it.
- **Decisions rest on documentation, not experiments.** Choose libraries, settings and patterns from the official documentation and established practice, and cite it (in the ADR, the code comment or the checkpoint report). Experiments only confirm what the docs say; when something misbehaves, find the documented cause before working around it.
- **Design system v1.0 and the prototypes are locked.**
  - The admin UI matches the signed-off prototype: layout, copy, states and interactions. Where real data forces a change (a field the mock didn't have, an error the mock couldn't produce), make the smallest change and list it in the checkpoint report.
  - Additive `ui-web` changes are fine. Token values, design-language rules and locked layouts need the owner's approval.

New for Phase 3:

- **Dependencies:** pin exact versions, each released at least two weeks before it's added (check with `npm view <pkg> time`). Check every new dependency's license: nothing GPL-2.0-only or otherwise incompatible with AGPL-3.0 (see [0009](../adr/0009-license-agpl.md)).
- **No network in tests.** Unit and integration tests never reach the internet. External services (TMDB, indexers, subtitle providers, trackers, notification channels) are tested against recorded fixtures or local fakes.
- **Secrets never land in the repo,** fixtures included: scrub API keys, cookies and passkeys from recordings.
- **The prototype is a reference, not a dependency.** `apps/server` never imports from `design/prototypes`. Code that both need moves into a package (see [Porting the prototype](#porting-the-prototype)).

## Goal

A self-hosted server that does, for real, what the admin prototype shows. It runs as one Node process in one Docker container, and covers:

- the platform: database, jobs, events, the public API with its OpenAPI document, the typed SDK, auth, and LAN discovery;
- the complete **Movies** slice: discover, add, search indexers, decide, grab, download with the built-in torrent engine, import, subtitles (with sync), and notify;
- the owner tools: the indexer catalog, curation, appearance, users and devices, settings and system;
- the client-facing API the Phase 4 apps will call: connect, home, library, item, search, settings, announcements, devices.

## Scope

**In milestone 1:** everything in the roadmap's Phase 3 section, plus the gap analysis items tagged **[M1]**:

- **Acquisition:**
  - archive extraction;
  - protection from malicious or fake releases;
  - health checks;
  - backups and restore;
  - manual import;
  - the media management extras;
  - the torrent engine's production features;
  - per-tracker seeding rules;
  - import lists;
  - the calendar and iCal feed.
- **Platform:**
  - security (2FA, passkeys, OIDC, proxy auth, rate limiting, audit log, scoped API keys);
  - notification channels;
  - i18n-ready strings;
  - observability;
  - release engineering;
  - user-facing docs.
- **Migration:** the Radarr and qBittorrent importers.
- **[Arch] items**, built as foundations now and filled in later:
  - worker isolation;
  - multiple versions per item;
  - the permissions model;
  - filesystem watching;
  - the generalized catalog (indexers now; presets next);
  - the cloud connector seam;
  - the storage realities (copy fallback, many disks);
  - extension registries.

**Client-facing API, without the clients.** The roadmap's milestone 1 delivers curation's data model, composer and API, with announcements rendered in the admin. The clients come in Phase 4, but their API comes now, so Phase 4 builds against a real server:

- connect and public info;
- home sections;
- library;
- item, with versions and tracks;
- search;
- device preferences and the home layout;
- announcements.

Playback itself (streaming, transcoding) stays out: it's reserved under `/stream`.

**Not in milestone 1:** everything tagged [Later], including TV series, music, books and online video, requests, Usenet, playback and transcoding, watch-state sync beyond the stored position, Cloudflare challenge solving, and the highsea cloud services themselves.

## Exit criteria

1. `docker compose up` starts the server on a clean machine, and the setup wizard leads to a working dashboard.
2. The roadmap's end-to-end run passes against the container, in CI (Playwright, with Blender's CC *Sintel* or a CC clip of it):
   1. setup;
   2. one-click add of a mock public indexer from a locally signed catalog;
   3. add *Sintel (2010)* and grab it;
   4. watch live progress;
   5. the file lands at `/data/media/movies/Sintel (2010)/…` with a history entry;
   6. a mock provider attaches `.en.srt`, and it's marked synced.

   Also:
   - widget layouts and themes persist across sessions;
   - a role-targeted announcement shows only to that role.
3. The roadmap's unit and integration checks pass (`bun run typecheck && bun run lint && bun run test`):
   - parser fixtures and decision-engine cases;
   - the torrent engine against a local tracker (one engine seeds, another downloads; hash checks, pause and resume, fast resume);
   - naming, and hardlink or copy;
   - every catalog definition validates;
   - subtitle sync restores a synthetic offset and framerate drift to within ±100 ms;
   - provider adapters against recorded fixtures;
   - discovery and `ServerConnection` failover.
4. **Catalog independence:**
   - a running server picks up catalog version N+1 without an app rebuild;
   - a tampered bundle is rejected.
5. **Resilience:**
   - a restart mid-download resumes without a full recheck;
   - jobs, including subtitle sync, recover after a crash.
6. **Every admin screen matches its prototype,** with real data, and passes the Phase 2 checks:
   - keyboard only;
   - reduced motion;
   - 200% text;
   - axe clean in all three themes;
   - no horizontal overflow from 1440 to 390.
7. **The API is the only door.**
   - Every admin capability is reachable through `/api/v1` with admin scope.
   - The OpenAPI document covers every route.
   - The SDK is generated from, or checked against, the contract.
8. **Ops:**
   - multi-arch images (amd64 and arm64) build in CI;
   - the license audit and the dependency check pass;
   - the install, upgrade and migration guides are written.
9. The owner signs off. Record the sign-off in the roadmap, as for Phases 1 and 2.

## Architecture

### Packages

The roadmap's [monorepo layout](../roadmap.md#monorepo-layout) holds. Dependencies point one way: an app depends on domain packages, domain packages on platform packages, and platform packages on `core`. No package imports an app, and no domain package imports React, Next or Hono.

| Layer | Packages | Notes |
| --- | --- | --- |
| Contracts | `core`, `api-contract`, `sdk`, `schemas` (`/indexers`) | `core`: ids, errors, result types, the clock, the logger interface, the event types |
| Platform | `db`, `runtime`, `jobs`, `auth`, `network`, `i18n` | `i18n` is new: see [ADRs to write](#adrs-to-write) |
| Domain | `parser`, `quality`, `metadata`, `indexers`, `torrent`, `downloads`, `library`, `media` (`/movies`), `subtitles`, `notifications`, `personalization`, `curation`, `importers` | `importers` is new: the Radarr and qBittorrent migration |
| Design | `tokens`, `ui-web`, `brand`, `fixtures` | As in Phase 2 |
| Apps | `apps/server`, `apps/storybook` | |
| Catalog | `catalog/indexers` | Its own CI |

Each domain package exposes a service built from the platform it's given (`createMovieService({ db, jobs, events, clock, … })`), so tests can build it on an in-memory database and a fake clock, as the prototype's mock does.

### The server process

As [ADR 0003](../adr/0003-server-runtime-custom-entry.md):

1. **`apps/server/server.ts`** is a Node `http` server and the only entry.
2. **`@highsea/runtime.boot()`** runs, in order:
   1. read the config;
   2. back up the database, then migrate;
   3. start the event bus;
   4. start jobs;
   5. start the torrent engine (with fast resume);
   6. start the download monitor;
   7. start catalog sync;
   8. start the discovery responder;
   9. start the filesystem watcher.
3. **Routing:**
   - `/api/*` goes to Hono;
   - `/stream/*` and `/ws` are reserved (501 for now);
   - everything else goes to Next's handler.
4. **Shared runtime:** the singleton lives on `globalThis.__highsea`, and code rendered by Next reads it through `getRuntime()`.
5. **Shutdown:** SIGTERM saves resume data, drains jobs, closes listeners and closes the database, in that order, with a deadline.

**Paths:**
- `/config` holds the database, `secret.key`, logs, backups, the catalog cache and `definitions/`.
- `/data` is the single media root, so hardlinks work.

In development, both are folders under `.dev/` (gitignored).

### API and contract

- **Where it comes from:** the prototype's `types.ts` is the first draft. Each type becomes a zod schema in `@highsea/api-contract`, and each mock namespace becomes a route group:
  - `system`, `auth`, `setup`, `fs`;
  - `catalog`, `indexers`, `metadata`, `movies`;
  - `queue`, `history`, `blocklist`, `downloads`;
  - `subtitles`, `announcements`, `curation`;
  - `connect`, `home`, `library`, `playback`;
  - `dashboard`, `users`, `devices`, `apiKeys`;
  - `manualImport`, `appearance`, `settings`.

  Rename where the mock's naming was a shortcut, and record each change in the matching spec's Data section.
- **Errors:** one shape everywhere (`{ error: { code, message, details? } }`). The codes are the mock's (`not-found`, `forbidden`, `conflict`, `invalid`, `unauthorized`, `rate-limited`).
- **Paging and sorting:** cursor paging on every list that can grow (history, logs, events, the library).
- **Events:** SSE at `/api/v1/events`, with the mock's topics (`movies.updated`, `queue.updated`, `curation.updated` and so on). Each event carries the ids that changed, never full objects, so clients refetch what they show. `Last-Event-ID` replays from a short ring buffer.
- **Auth on the API:** session cookie (admin), bearer device token (clients), or API key (scripts). The scope is checked per route from the contract.
- **SDK:** `@highsea/sdk` is a typed client over the contract, plus `ServerConnection`. It works in browsers, Node and React Native.
- **React hooks:** `@highsea/sdk/react` provides `useQuery(key, call, topics)` and `useAction(call)` with the same shape as the prototype's mock hooks: cached, refetched on matching SSE topics, with optimistic updates where the prototype has them. Admin screens and the Phase 4 clients use it.

### Data

- **Engine:** SQLite in WAL mode, with Drizzle ([ADR 0004](../adr/0004-sqlite-drizzle.md)). Production runs on Node with `better-sqlite3`. **Tests run under Bun,** which can't always load native Node modules, so `@highsea/db` takes a driver (Drizzle's `bun:sqlite` driver in tests, `better-sqlite3` in production), on the same schema and migrations. Record this in an ADR.
- **Schema, first pass:**
  - **Media:**
    - `media_items` (the unified tree: `type`, `parent_id`) and `movie_details`;
    - `media_files` (path, size, quality, the ffprobe streams as JSON, the version it belongs to);
    - `versions` (an item can have several: 4K HDR and 1080p, each with its own quality profile);
    - `images`;
    - `collections` and `credits`, with `people`.
  - **Acquisition:**
    - `quality_profiles` and `custom_formats`;
    - `releases` (the cache for interactive search);
    - `history`, `blocklist`, `queue_items`;
    - `torrents` (with resume data) and `torrent_files`;
    - `root_folders`, `tags`, `import_lists`.
  - **Indexers:** `catalog_definitions`, `indexers`, `indexer_status`.
  - **Subtitles:**
    - `language_profiles`, `subtitle_providers`;
    - `subtitle_files` (linked to `media_files`, with score, sync status, confidence and offset);
    - `subtitle_wanted`.
  - **People and access:**
    - `users`, `user_permissions`, `library_access`;
    - `sessions`, `devices`, `api_keys`;
    - `totp`, `passkeys`;
    - `audit_log`.
  - **Personalization:**
    - `preferences` (layered: user, client type, device);
    - `widget_layouts` (per user, plus role defaults);
    - `themes`, `sound_packs`, `home_layouts`.
  - **Curation:**
    - `announcements` and `announcement_seen`;
    - `featured_sections` and `featured_overrides`.
  - **System:**
    - `jobs`, `job_runs`;
    - `settings` (one typed row per area);
    - `health`, `events_log`, `backups`;
    - `watch_positions` (the stored resume position the clients show; full watch state comes later).
- **Indexes for large libraries:** design for 100k items. Every list screen's filter and sort has an index, and there's a test that seeds 100k rows and checks those queries stay fast.
- **Secrets:** encrypted with `/config/secret.key` (created on first boot), using AES-256-GCM per value. This covers API keys from providers, indexer credentials and TOTP seeds.

### Jobs, events and workers

- **Jobs:** a SQLite-backed queue in `@highsea/jobs`.
  - Named job types with zod payloads.
  - Intervals, concurrency per type, retries with backoff, and history.
  - On boot, a job that was running when the process stopped is retried or failed, by its type's policy.
  - The System › Tasks page reads it.
- **Events:** an in-process bus in `runtime`. It feeds SSE, the audit log and notifications.
- **Workers:** CPU-heavy work runs in a small `worker_threads` pool, behind one `runInWorker(task, input)` helper. That covers:
  - subtitle alignment;
  - piece hashing for verification;
  - image resizing (`sharp`);
  - batch release scoring.

  ffmpeg and ffprobe run as child processes, through one wrapper with timeouts.

### The admin UI

- **Framework:** Next.js 16, App Router, in `apps/server`, built with `next build` and served by our entry. Not `output: 'standalone'`, which Next documents as incompatible with a custom server ([ADR 0003, amended](../adr/0003-server-runtime-custom-entry.md#amendment-2026-10-20-no-standalone-output)).
- **Routes:** the paths match the prototype's admin routes without the `#/admin` prefix (`/movies/[id]`, `/settings/[area]`, …).
- **Data access goes through the API, not Server Actions.**
  - Admin screens are client components that call `@highsea/sdk/react`, as the prototype's screens call the mock.
  - This keeps one path for every capability (exit criterion 7), and keeps the screens close to the prototype's code.
  - Server components handle the shell, the auth redirect and the first paint.
  - The owner chose this over Server Actions ([ADR 0018](../adr/0018-admin-data-through-the-api.md)).
- **Sessions:** a cookie session. Middleware sends signed-out visitors to `/login`, and a fresh install to `/setup`.

### Porting the prototype

The prototype's admin screens are the starting point for the real ones:

1. Copy a screen from `design/prototypes/src/admin/…` into `apps/server`.
2. Swap the mock client for the SDK, keeping the hook shape.
3. Then fix whatever real data changes.

Shared pieces move out of the prototype first:

| From the prototype | To | Why |
| --- | --- | --- |
| `kit/widget-editor.tsx`, `kit/sortable-list.tsx`, `kit/stepper.tsx`, `kit/sparkline.tsx` | `ui-web` (each with a story, tests and a README line) | The server needs them, and the prototype already uses them: two users |
| `admin/format.ts`, `admin/status.ts` | `@highsea/core` (formatting) and `ui-web` (status mapping) | Shared by the server and, later, the clients |
| `mock/types.ts` | `@highsea/api-contract` (as zod) | The real contract; the prototype then imports its types from there |
| Widget registry and layouts (`mock/widgets.ts`) | `@highsea/personalization` | Layout rules belong to the domain |

After each move, the prototype imports the package too, so the two can't drift. The prototype keeps its mock server.

### External services

| Service | Used for | In tests |
| --- | --- | --- |
| TMDB | Discover, details, images, credits, collections, trailers | Recorded responses, keyed by request |
| Indexers (Torznab, Newznab, JSON, HTML, RSS) | Search and RSS | A local fake indexer serving recorded results |
| BitTorrent swarm | Downloads | A local tracker, and a second engine seeding |
| OpenSubtitles.com, Podnapisi, Subdl, Gestdown | Subtitle search and download | Recorded responses; a mock provider for end to end |
| Plex, Jellyfin, Emby | Library refresh after import | Recorded responses |
| Notification channels | Discord, Telegram, ntfy, Gotify, Pushover, SMTP, Apprise, Matrix, Slack, webhooks, web push | Local fake endpoints; an SMTP sink |
| Trakt, IMDb, Letterboxd, TMDB lists | Import lists | Recorded responses |

- **One HTTP seam:** every adapter takes a `fetch` it's given. Tests pass one that replays recordings, and a small `record` script refreshes them against the real service with the developer's own key.
- **TMDB key:** until the highsea cloud metadata proxy exists, the owner enters a TMDB key in setup.

### Tests and checks

- **Unit:** `bun test` in each package, next to the code (`test/` folders, as now).
- **Integration:** `apps/server/test/`. These tests boot the runtime in-process on a temporary `/config` and `/data`, an in-memory database and a fake clock, then drive it through the SDK. Every API route has at least one test of its happy path and its permission check.
- **Contract:**
  - the OpenAPI document is generated and checked in;
  - a test fails when it's stale (as `ui-web`'s glyph check does);
  - a test checks every route is in it.
- **UI:**
  - the Phase 2 checks carry over: routes rendered with axe in happy-dom, and the stylesheet check;
  - before each checkpoint, a browser sweep of the real admin UI in three themes, at 1440 and 390, with 200% text and reduced motion, plus a keyboard walk;
  - the Phase 2 sweep scripts move into `apps/server/scripts/` so they run against the real app.
- **End to end:** Playwright against `docker compose up`, in CI, as in the exit criteria.
- **Test media:**
  - a short CC clip cut from *Sintel*, with its published subtitles;
  - fetched by a script into a gitignored cache with a checksum, so the repo stays small;
  - generated audio and video for the unit tests where any media will do.
- **CI (GitHub Actions):**
  - typecheck, lint and test on every push;
  - the catalog pipeline on `catalog/**`;
  - the license audit;
  - the image build (amd64 and arm64);
  - the end-to-end run on `main` and on pull requests that touch the server.
- **Before each checkpoint:** `bun run typecheck && bun run lint && bun run test` must pass, and the checkpoint's integration tests too.

### Known pitfalls

- **Bun runs tests, Node runs the server.** Check native modules (`better-sqlite3`, `sharp`, `dgram`, `worker_threads`) under both early. Keep Node-only code behind an interface with a Bun-friendly test double.
- **Next and native modules:**
  - list them in `serverExternalPackages`;
  - `transpilePackages` covers the raw-TS workspace packages;
  - check the image contains the native binaries for both architectures.
- **Hardlinks** fail across filesystems and on SMB and NFS. Detect, fall back to copy, and say so in the import's history.
- **Long-running work and the request cycle:** never do pipeline work in a request handler. Enqueue a job and return.
- **Time:**
  - every domain service takes the runtime's clock, so tests can run the pipeline at speed, as the prototype's mock does;
  - store UTC, and render in the viewer's zone.
- **Paths:** never build a path from user input without normalizing it and checking it's under an allowed root (`/data`, configured root folders).
- **Prototype pitfalls that still apply:** the Tailwind theme reset, literal class maps, `min-w-0` and `grid-cols-[minmax(0,1fr)]` on anything containing a scroller, `relative` scrollers, axe imported after happy-dom, and no `!important`.

## Order of work and checkpoints

The roadmap's [build order](../roadmap.md#phase-3-build-order), grouped into checkpoints. Stop at each one, report what was built, the judgement calls, the API added, the screenshots and the check results, then ask for review before moving on.

1. **Checkpoint 1: the platform.**
   - **Packages:** `core`, `db` (schema v1, migrations, backup before migrate, the driver seam), `runtime` (boot, shutdown, config, event bus, workers), `jobs`, `api-contract` (system routes), `sdk` (client, `ServerConnection`, React hooks), `i18n`.
   - **The server:**
     - `apps/server`: the custom entry, Hono and Next together;
     - `/api/health`, `/api/v1/system/info/public`, `/api/v1/openapi.json`, `/api/docs`, `/api/v1/events`;
     - an empty admin shell.
   - **Ops:**
     - CI (typecheck, lint, test, license audit);
     - a first Dockerfile and compose file that boot.
   - **ADRs:** the data access path, the database driver seam, the discovery port, i18n.
2. **Checkpoint 2: accounts, network and the shell.**
   - **`auth`:**
     - setup creates the owner;
     - login, sessions, roles and permissions, library access;
     - TOTP, passkeys, OIDC, trusted proxy headers;
     - rate limiting, the audit log;
     - device tokens, scoped API keys.
   - **`network`:**
     - LAN discovery over UDP broadcast and mDNS;
     - the external URL, trusted proxies, optional built-in TLS.
   - **Admin:**
     - A18 login and A2 setup, minus the indexer and subtitle steps, which arrive with their packages;
     - A1 shell with the command palette, status bar and toasts;
     - A13 users, devices and API keys.
   - **Client API:** the connect flow.
3. **Checkpoint 3: personalization and the dashboard.**
   - **`personalization`:**
     - layered preferences;
     - the widget registry and layouts with role defaults;
     - themes from the theme engine, with server branding;
     - sound packs.
   - **Admin:**
     - A3 dashboard with customize mode, its widgets fed by whatever exists so far;
     - A12 appearance.
   - **Client API:** device preferences, the home layout.
4. **Checkpoint 4: movies, without downloading.** Scoped in detail in [phase-3-checkpoint-4.md](phase-3-checkpoint-4.md).
   - **`parser`,** with a large fixture suite of real release names.
   - **`quality`:** profiles, custom formats, sizes, and the decision engine with the prototype's reasons.
   - **`metadata`** (TMDB) and **`media/movies`:** add, refresh, collections, people, trailers, multiple versions.
   - **Admin:** A4 Discover, A5 Movies, A6 movie detail (all but the Subtitles tab and the live states), people pages.
   - **Client API:** library, item, search.
5. **Checkpoint 5: indexers and the catalog.** Scoped in detail in [phase-3-checkpoint-5.md](phase-3-checkpoint-5.md).
   - **Indexers:**
     - `schemas/indexers` (declarative definitions);
     - `indexers` (Torznab, Newznab, JSON, HTML, RSS; health, backoff, stats).
   - **The catalog:**
     - the `catalog/indexers` pipeline: validate, bundle, sign with ed25519, publish to `stable` and `beta`;
     - `CatalogService`: verify, filter by engine version, cache, auto-update, the seed snapshot, extra URLs, `/config/definitions`.
   - **Admin:**
     - A9 indexers, with one-click add and generated forms;
     - interactive search on A6, with grab disabled until checkpoint 6;
     - the indexer step of setup.
   - **Licensing:** each definition records its source and license.
6. **Checkpoint 6: downloading and importing.** Scoped in detail in [phase-3-checkpoint-6.md](phase-3-checkpoint-6.md).
   - **`torrent`:**
     - the session manager, picker, choking and storage;
     - fast resume;
     - limits and queueing;
     - per-tracker seeding rules;
     - IP blocklists, UPnP and NAT-PMP;
     - interface binding with a kill switch;
     - VPN connections (`vpn`): Settings › VPN, highsea's own WireGuard tunnel or a gluetun container, the checks, providers and their port forwarding ([vpn.md](../product/vpn.md); added by the owner on 2026-10-20);
     - uTP, IPv6;
     - a watch folder, categories, manual adds.
   - **`downloads`:**
     - grab, monitor and stall detection;
     - protection from malicious releases;
     - archive extraction.
   - **`library`:**
     - import with ffprobe, renaming, hardlink or copy;
     - NFO and artwork, permissions;
     - filesystem watching;
     - manual import, the existing-library import.
   - **`importers`:** Radarr, qBittorrent.
   - **Admin:** A7 activity, A8 downloads, A17 manual import, and the live states on A6.
   - **Checks:** the torrent engine's local-tracker tests, and the resilience test.
7. **Checkpoint 7: subtitles.**
   - **`subtitles`:**
     - providers, plus embedded and bundled tracks;
     - language profiles;
     - scoring;
     - processing (encoding, formats, cleanup, sidecar names).
   - **The sync engine,** in a worker: audio extraction, voice activity, alignment with drift correction, and confidence.
   - **Jobs:** search on import, wanted, upgrades, sync after download, re-sync on replace.
   - **Admin:** A10 subtitles, the Subtitles tab on A6, and the subtitle step of setup.
   - **Checks:** the ±100 ms sync test.
8. **Checkpoint 8: automation, owner tools and the rest.**
   - **Automation:**
     - RSS sync;
     - missing and cutoff searches;
     - upgrades;
     - blocklist and re-search;
     - import lists;
     - the calendar and iCal feed.
   - **`notifications`:** every channel in the gap analysis, and media server refresh.
   - **`curation`:**
     - announcements and featured sections, with resolution per user and client type;
     - the client home and announcement API, live over SSE.
   - **Admin:**
     - A11 curation, its live preview built from the client home API;
     - A14 wanted and calendar;
     - A15 every settings area;
     - A16 system: health checks, tasks, logs, events, backups and restore, catalog version, updates.
   - **Observability:** structured logs, Prometheus `/metrics`, opt-in crash reporting.
9. **Checkpoint 9: release and sign-off.**
   - **Docker hardening:**
     - multi-stage build, `node:24.21.0-bookworm-slim` (the `.nvmrc` version) with ffmpeg and tini, PUID and PGID;
     - healthcheck;
     - multi-arch images to GHCR;
     - compose examples for host networking and gluetun.
   - **Templates:** unRAID, TrueNAS, Synology.
   - **Tests:** the end-to-end run in CI; the 100k-item performance test.
   - **Release:** versioning, the changelog, in-app update notices.
   - **Docs:** install guides (Docker, unRAID, Synology), the migration guide from Radarr and qBittorrent, a recommended setup.
   - **Full sweeps of every admin screen** against the prototype.
   - **Wrap-up:** update the roadmap and READMEs, then ask for the **Phase 3 sign-off**.

## Checkpoint 3 in detail

Scoped on 2026-10-20, before building. The checkpoint list above has the outline; this section settles what the specs left open. Items marked **owner's decision** were decided by the owner on 2026-10-20; the rest are judgement calls the checkpoint report will list again.

### Preferences: layered on the server (owner's decision)

The sources disagree.
- The roadmap (Personalization) and [sound.md](../design-language/sound.md), which is locked, say preferences are stored on the server in layers (user, then client type, then device) and sync to every client.
- [client-settings.md](../product/client-settings.md) says a device's theme and sound are stored on the device. That's how the prototype does it, with `localStorage`.

**Decided:** build the layered store, and have the client settings write the device layer.
- **What the person sees:** what the spec promises. "Only this device changes" stays true, because the device layer only applies to that device.
- **What the store adds:** the server holds every layer. A client gets its effective preferences in one call, and an owner can see why a device behaves as it does.
- **Resolution, most specific first:** device, then client type (all of a person's TVs), then user (all their devices), then the server's defaults from Appearance.
  - The user and client-type layers have API routes from the start but no UI yet. They're what client-settings.md's open question "use this theme on all my devices" would use.
- **Keys:** a typed list (theme, sound on, volume, and later more), each a zod schema in `@highsea/personalization`. An unknown key is refused, never stored.
- **Lifetime:** device-layer rows are deleted with their device row (ADR 0023). A TV that signs out starts again from the person's layers.
- **The admin's own sound** stays a per-browser choice in `localStorage`, as appearance.md decides. A new admin session is a new device row each time, so the device layer would forget it.
- **Clients keep a copy** to start instantly and offline, and refresh it on `preferences.updated`.

### Widgets: the whole registry now, data as it arrives

- **The registry moves to `@highsea/personalization`** with all ten widgets, from `design/prototypes/src/mock/widgets.ts`.
  - **Each entry has:** id, title, widths and heights, the default size, the roles that may add it, its data source, and a zod settings schema with defaults.
  - **The prototype then imports the registry from the package,** as "Porting the prototype" above says.
- **The prototype wins over dashboard.md** where they differ, because it's the signed-off reference. Widgets resize in height (84px rows) as well as width, and the allowed sizes are the prototype's. dashboard.md is updated to match in this checkpoint.
- **Widgets whose data doesn't exist yet show their empty state from dashboard.md,** and those states are true on a server that has none of these things yet. They don't call routes that don't exist: the registry names each widget's source, and the server's public info lists the sources it has.
  - **Has data now:** System health and Storage (free and total; the "what uses it" bar arrives with the library).
  - **From checkpoint 4:** Upcoming, Calendar and Recently added.
  - **From checkpoint 6:** Network and Queue (`activity`).
  - **From checkpoint 7:** Subtitles. **From checkpoint 8:** Announcement.
  - Network has no empty state in the spec yet. It gets "No downloads yet" with the speeds at zero.
  - **Why the whole registry now:** role defaults and saved layouts stay valid as packages land, and setup leads to the full dashboard (exit criterion 1). Hiding widgets until their data exists would leave most of the default layout empty.
- **Layouts:**
  - **Kept:** order is the layout; reset forgets rather than copies; staff widgets are filtered on the server (dashboard.md › Decisions).
  - **Unknown kinds:** a saved placement whose kind the server doesn't know (a widget removed in a later version) is kept but not returned, so a downgrade doesn't lose it.
- **Per-widget settings (owner's decision):** dashboard.md leaves open where they'd be edited, and the prototype has no design for it. **Decided:** store each widget's settings schema and defaults now, and add no editing UI in this checkpoint. A widget's defaults are what it shows (Upcoming: 14 days).
- **One of each widget,** as the prototype allows. Placements keep their own `id`, so allowing two later needs no change to the data.

### Themes and branding

- **Themes:** custom themes are `ThemeInput`s, built with `createTheme` and checked with `auditTheme` from `@highsea/tokens`, on the server as well as in the editor. A failing theme can't be saved (appearance.md).
  - Deleting the default theme falls back to Abyss Neutral.
  - The brand accent goes through the same generator.
- **The mark:** an SVG or PNG, square, at least 256 px, at most 1 MB.
  - **Storage:** it's kept in the database with its type. Backups and restore then cover it with no extra step. SQLite measures blobs up to about 100 KB as faster inside the database and larger ones as faster in files (sqlite.org, "Internal Versus External BLOB Storage"). A mark is usually small, and it's read rarely and cached with an `ETag`, so its speed doesn't matter.
  - **Checks:** PNG by its signature and header, square and at least 256 px. SVG by its root element, with a square `viewBox`. The type is never taken from the client's word alone (OWASP File Upload Cheat Sheet).
  - **Serving:**
    - it's served from `/api/v1/appearance/mark` with `X-Content-Type-Options: nosniff`;
    - an SVG also gets `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`;
    - why: shown in an `<img>`, an SVG can't run scripts, but someone opening its URL directly could; the sandbox stops that (MDN, CSP `sandbox`).
  - **For native clients,** which may not draw SVG, a PNG rendering is a Phase 4 concern. appearance.md's open question about a small-size TV mark stays open.

### Sound packs

- **A pack is data, not audio** (sound.md › Recipe format): a JSON recipe that the web synthesizes and native clients render.
- **Uploading** is a JSON file checked by `checkSoundPack` from `@highsea/tokens`, the same loudness and length rules the catalog's CI applies (sound.md › Sound packs). A failing pack is refused with the report's issues.
- **Built in:** "Felt and wood" (the default). It can't be deleted.
- **Owner's choices:** the server's default pack, plus the per-app-kind sound defaults (TVs on, phones and web off).
- **Packs from the catalog,** and whether they're signed, come with the catalog in checkpoint 5 or later. appearance.md's open question stays open until then.

### Home layout

- `GET` and `PUT /api/v1/me/home` store a person's row order and hidden rows (client-settings.md).
- The hero is never part of it.
- **The rows** come from the library (checkpoint 4) and curation (checkpoint 8). Until then the API returns the layout with the rows known so far.
- **Ids not offered yet** are kept, so a row that appears later lands where the person put it.

### Moves from the prototype

As "Porting the prototype" above lists them; the prototype imports each one afterwards:
- `kit/widget-editor.tsx`, `kit/sortable-list.tsx` and `kit/sparkline.tsx` move to `ui-web`, each with a story, tests and a README line;
- `admin/format.ts` moves to `@highsea/core`;
- the widget registry moves to `@highsea/personalization`.

### ADRs

- **0027, preferences in layers:** the store, resolution, keys and lifetime above.
- **0028, files the owner uploads:** where marks and sound packs live, how they're checked, and how they're served.

## ADRs to write

Write each when its checkpoint reaches it, and list it in the checkpoint report:

1. **Admin data access:** the admin UI calls the public API through the SDK, not Server Actions (checkpoint 1; [0018](../adr/0018-admin-data-through-the-api.md)).
2. **The database driver seam:** `bun:sqlite` in tests, `better-sqlite3` in production (checkpoint 1).
3. **The discovery port,** and how Docker exposes it (checkpoint 1, as the roadmap asks).
4. **i18n:** the message format and library, and how strings are extracted (checkpoint 1).
5. **Jobs:** the queue's guarantees (at-least-once, idempotent handlers, recovery on boot) (checkpoint 1).
6. **External services:** the injected `fetch` and recorded fixtures (checkpoint 4).
7. **Test media:** the clip, its license, and how CI fetches it (checkpoint 6).
8. **Release and versioning:** version scheme, channels, image tags (checkpoint 9).

## Decisions

The owner decided these on 2026-10-19:

1. **Milestone 1's size:** keep every [M1] item. Nothing moves to a 1.1.
2. **The client-facing API is built in M1,** so Phase 4 starts against a real server.
3. **Admin data goes through the public API,** through the SDK, not Server Actions ([ADR 0018](../adr/0018-admin-data-through-the-api.md)).
4. **The TMDB key** is entered by the owner in setup until the cloud metadata proxy exists, with a link to TMDB's key page and a note on why.
5. **Publishing:** GitHub Pages for the catalog's `stable` and `beta` channels and GHCR for the images, both on this repository. Nothing is published until the owner says so.

The owner decided this on 2026-10-20, reviewing checkpoint 4:

6. **The admin is for the owner and admins only.** Members and restricted accounts use the clients; they never open the admin, and **Manage the library** becomes an admin's permission alone. This replaces the members' shorter sidebar in admin-shell.md. Scoped, with the owner's decisions of 2026-10-20 (three roles: Owner, Admin, User), in [phase-3-admin-access.md](phase-3-admin-access.md); built before checkpoint 5.

## Out of scope for Phase 3

- The client apps (web, desktop, mobile, TV): Phase 4.
- Playback, transcoding and the streaming engine. `/stream` and `/ws` are reserved.
- Media types beyond movies, though the model keeps their place.
- Requests, Usenet, Live TV.
- The highsea cloud services (accounts, relay, push, metadata proxy). The connector seam is built and off.
- Anything tagged [Later] in the roadmap's gap analysis.
