# highsea.tv: notes for Claude Code

highsea is a self-hosted replacement for the *ARR suite (Radarr, Sonarr, Prowlarr, qBittorrent, Bazarr) that grows into a streaming server like Plex and Jellyfin, with its own web, desktop, mobile and TV clients. It's a Bun monorepo. Read [docs/roadmap.md](docs/roadmap.md) for the whole picture.

## Where things stand

- **Phase 1** (brand and design system v1.0): signed off 2026-10-16.
- **Phase 2** (clickable prototypes of every screen, in `design/prototypes`): signed off 2026-10-19. The prototypes and their specs in `docs/product/` are the **build reference**.
- **Phase 3** (server milestone 1): the plan is [docs/plans/phase-3-server.md](docs/plans/phase-3-server.md), approved with the owner's decisions recorded in it.
  - Checkpoints 1 to 7 are signed off: the platform; accounts, network and the admin shell; personalization and the dashboard; movies, without downloading ([its scope](docs/plans/phase-3-checkpoint-4.md)); indexers and the catalog ([its scope](docs/plans/phase-3-checkpoint-5.md)); and downloading and importing ([its scope](docs/plans/phase-3-checkpoint-6.md)), built in two halves, 6a (grab to library) and 6b (production features, VPN connections and migration). Checkpoints 2 to 5 and 6a were signed off on 2026-10-20, 6b on 2026-10-21. Checkpoint 7, subtitles ([its scope](docs/plans/phase-3-checkpoint-7.md)), was built in two halves, 7a (finding and keeping subtitles) and 7b (the sync engine), both signed off on 2026-10-21; what it leaves for later is listed at the end of its plan.
  - The admin is the owner's and admins' only (the plan's decision 6): three roles, Owner, Admin and User, built and reviewed on 2026-10-20 ([docs/plans/phase-3-admin-access.md](docs/plans/phase-3-admin-access.md), ADR 0032).
  - The owner registered highsea's OpenSubtitles.com key, kept as `HIGHSEA_OPENSUBTITLES_KEY` in the gitignored `.env.local`, never in the repo. Until now all work has been local, so the repository has no secrets; 9b adds this one, and the release key goes into its approval-gated `release` environment.
  - **Checkpoint 8:** automation, owner tools and the rest, scoped in [docs/plans/phase-3-checkpoint-8.md](docs/plans/phase-3-checkpoint-8.md) with the owner's answers of 2026-10-21: three gated parts, 8a (automation and Wanted), 8b (notifications and the owner's tools) and 8c (curation and the rest). No media-server refresh: highsea replaces Plex, Jellyfin and Emby. Trakt: highsea's application was registered on 2026-10-22 on Trakt's new portal (Production, redirect `https://api.highsea.tv/oauth/trakt`), which issues a Client ID and no secret. `HIGHSEA_TRAKT_CLIENT_ID` is in `.env.local`, never in the repo; the secret is optional (ADR 0045's dated section). Development without a network uses the fake (`HIGHSEA_LISTS_FAKE=1`). 8a, 8b and 8c were signed off on 2026-10-21, so checkpoint 8 is signed off.
  - **Checkpoint 8d:** smart collections, requested by the owner at 8c's review and scoped in [docs/plans/smart-collections.md](docs/plans/smart-collections.md); the owner approved the scope and prototype on 2026-10-22. Built and signed off on 2026-10-22 (ADR 0049).
  - **Next: checkpoint 9** (release and sign-off), scoped in [docs/plans/phase-3-checkpoint-9.md](docs/plans/phase-3-checkpoint-9.md) with the owner's answers of 2026-10-22: three gated parts, 9a (packaging and CI, starting with the move to the `highsea-tv` GitHub organisation and the `@highsea-tv/` package scope), 9b (releasing and the documentation site at `docs.highsea.tv`) and 9c (the full review and the Phase 3 sign-off). Nothing is published until the owner says so.
    - **Done in 9a (2026-10-22):** the repository moved to the `highsea-tv` organisation (`origin` is `https://github.com/highsea-tv/highsea-tv.git`); every package renamed to `@highsea-tv/` (ADR 0036's dated note; ADRs keep the old names as written); Trakt brought up to its new portal (sign-in on `auth.trakt.tv`, optional secret, the `api.highsea.tv` redirect). highsea's subdomains are set in the plan's [domains table](docs/plans/phase-3-checkpoint-9.md#highseas-domains).
    - **Next in 9a:** everything else in the plan's 9a sections: the slim multi-arch image, labels and attestations, compose files on `ghcr.io/highsea-tv/highsea`, the end-to-end run through the container in CI, the dependency check and the missing 100k cases. The repository has no secrets yet; they're added in 9b.
- **Follow-up after Phase 3:** dashboard customization on Homarr's level, with a visible grid ([docs/plans/dashboard-customization.md](docs/plans/dashboard-customization.md)). Not scheduled; a prototype is approved first.

Read the Phase 3 plan before doing anything: its standing rules, architecture, checkpoints and decisions all apply. The ADRs in `docs/adr/` record every architectural decision; 0018–0022 came with checkpoint 1, 0023–0026 with checkpoint 2, 0027–0028 with checkpoint 3, 0029–0031 with checkpoint 4, 0032 with the admin-access work, 0033–0035 with checkpoint 5, 0036 (domain packages with subpath exports) at its review, 0037–0040 and 0042 with checkpoint 6a, 0041 (the migration importers) with 6b, which also added dated 6b sections to 0037, 0039 and 0042, 0043 (subtitles) with 7a, 0044 (the subtitle sync engine) with 7b, which also amended 0040, 0045 (automation) with 8a, 0046 (notifications) and 0047 (operations) with 8b, 0048 (curation) with 8c, and 0049 (smart collections) with 8d.

## Rules from the owner

These are the plan's standing rules in short; the plan has the full text.

- **Gated work.** Stop at each checkpoint, report, and ask for review before moving on. Phase 4 starts only after Phase 3 is signed off.
- **Decisions rest on official documentation, not experiments.** Choose libraries, settings and patterns from the docs and established practice, and cite them (ADR, code comment or checkpoint report). Experiments only confirm what the docs say. When something misbehaves, find the documented cause before working around it.
- **Git:**
  - commit only when the owner asks; never push unless asked;
  - **no attribution or co-author lines** in commit messages, whatever your tooling suggests;
  - match earlier commits: an imperative subject, then a bulleted body.
- **SPDX header on every source file:** `// SPDX-License-Identifier: AGPL-3.0-only` (`/* … */` in CSS, `#` in shell and YAML). `'use client'` goes above it.
- **Dependencies:**
  - exact versions released at least two weeks ago (`bun run pin <pkg>` finds them);
  - licenses compatible with AGPL-3.0 (`bun run licenses` audits them; an exception needs a reason in `scripts/license-exceptions.json`).
- **Locked:** design system v1.0 and the signed-off prototypes.
  - The admin UI matches its prototype. List any change that real data forces in the checkpoint report.
  - Token values, design-language rules and locked layouts change only with the owner's approval.
- **Internal and public docs are separate.** Internal docs (the roadmap, plans, ADRs, product specs, brand, prototypes: how highsea is structured and built) stay in `docs/` and `design/` and are never published as hosted pages. Public docs (guides for setting highsea up and using it) live only in `apps/docs/content/`, served at `docs.highsea.tv` on Vercel and deployed only on the owner's word. Neither copies the other (owner, 2026-10-22).
- **No network in tests.** External services are tested against recorded fixtures or local fakes, and secrets never land in fixtures.
- **Unknowns:** use your judgement and list each call in the checkpoint report.
- **Copy** follows [docs/brand/brief.md § 6](docs/brand/brief.md#6-voice-and-tone): plain, calm, specific, no exclamation marks.

## Commands

```sh
bun install
bun run lint            # Biome
bun run typecheck       # every workspace, plus scripts/
bun run test            # everything (Bun's runner, each file isolated)
bun run smoke           # the platform under Node, as production runs it
bun run check:node      # is `node` the version in .nvmrc (24.21.0)?

bun run server          # the server in development, http://localhost:3000 (data in .dev/)
HIGHSEA_TMDB_REPLAY=1 bun run server   # the same, answering TMDB from the recordings: no key, no network
HIGHSEA_TORRENT_OFFLINE=1 bun run server   # the torrent engine opens no sockets: grabs queue, nothing downloads
HIGHSEA_SUBTITLES_FAKE=1 bun run server    # the subtitle providers are fakes: no accounts, no network
HIGHSEA_LISTS_FAKE=1 bun run server        # Trakt and generic lists are fakes; Trakt's device code is approved at once
bun run prototypes      # the Phase 2 prototypes, http://localhost:4500
bun run storybook       # the design system

bun run pin hono zod    # versions old enough to pin
bun run licenses        # the license audit
bun run catalog:build   # validate, bundle and sign the catalog (dev key unless HIGHSEA_CATALOG_KEY)
bun run record:tmdb     # in packages/metadata: refresh the TMDB recordings with your own key (never in CI)
bun scripts/calibrate-sync.ts <library> --cache <dir>   # the sync's confidence on real films: reads them, never writes (never in CI)
docker compose up --build
```

Browser sweeps are in [scripts/sweeps](scripts/sweeps/README.md): axe in three themes, overflow, 200% text, reduced motion, and the keyboard and D-pad walks. They cover the prototypes and, with `bun scripts/sweeps/server.ts`, the server's real admin pages. Run them before each checkpoint report.

Before reporting a checkpoint, run all of these:
- `bun run lint && bun run typecheck && bun run test`;
- the Node smoke test (`bun run smoke`);
- the sweeps.

## How the code is put together

| Path | What |
| --- | --- |
| `apps/server` | The server: one Node process. `server.ts` boots `@highsea-tv/runtime`, then serves `/api` with Hono and everything else with Next (ADR 0003) |
| `apps/storybook` | The design system's workbench |
| `design/prototypes` | The signed-off prototypes, with an SDK-shaped mock server (`src/mock/`): the reference for every screen and the first draft of the API |
| `packages/core`, `db`, `jobs`, `runtime`, `i18n` | The platform. Since 8b the runtime also holds the owner's tools (ADR 0047): backups and restore (`backups.ts`, with its own zip writer and reader in `zip.ts`; a restore exits with code 75 for Docker to restart it), the log files (`logs.ts`), crash reports, `/metrics` and Updates (`operations.ts`), and turns the domains' events into notifications (`notify.ts`) |
| `packages/auth`, `network` | People and access (ADR 0023–0025); discovery, proxies and TLS (ADR 0020, 0026) |
| `packages/personalization` | Preferences in layers (ADR 0027), the widget registry and dashboard layouts, the home layout, themes, branding and sound packs (ADR 0028) |
| `packages/parser` | Release names into their parts: title, year, edition, quality, languages, group. Pure |
| `packages/quality` | The quality vocabulary, profiles, custom formats, sizes and the decision engine (ADR 0031). Pure; browsers import `@highsea-tv/quality/browser`, which leaves out the TRaSH presets |
| `packages/metadata` | TMDB behind the fetch seam (ADR 0029), the metadata cache, images and refresh (ADR 0030); the replaying `fetch` in `@highsea-tv/metadata/replay` |
| `packages/schemas`, `catalog`, `indexers` | Shared data formats, one subpath each: `@highsea-tv/schemas/indexers`, the indexer definition format (ADR 0033, 0036); the signed catalog, its pipeline and seed (ADR 0034); the indexer engine, health and release search, with a fake indexer in `@highsea-tv/indexers/fake` (ADR 0035) |
| `packages/media` | The media libraries, one subpath per type (ADR 0036). `@highsea-tv/media/shared`, what every type shares: root folders, the seeded profiles, formats and sizes (`createMedia`, created once by the runtime), names, paging and the API's common shapes. `@highsea-tv/media/movies`, the movie library: items and versions (ADR 0012), availability, the parser's page, the client API's reads, the import pipeline (ADR 0039), and 6b's archive extraction (`unar`), the library scan with filesystem watching, and the existing-library import. `@highsea-tv/media/naming`, the naming function the import and the Settings preview share; `@highsea-tv/media/testing`, short ffmpeg clips for tests (ADR 0040) |
| `packages/torrent` | The in-process BitTorrent engine (ADR 0005, 0037): sessions, peers, the picker, storage, fast resume, SHA-1 in the worker pool, bound to the address the VPN allows; uTP, IPv6, protocol encryption (MSE), the IP blocklist and UPnP/NAT-PMP (6b); a tracker and torrent makers in `@highsea-tv/torrent/testing` |
| `packages/downloads` | Grabs, the queue and its monitor, stalls and replacements, the blocklist, seeding rules and history (ADR 0038), categories, the watch folder and the IP blocklist's updates (6b); finished downloads go to the movie import pipeline (ADR 0039) |
| `packages/vpn` | Settings › VPN (docs/product/vpn.md, ADR 0042): highsea connects (its own WireGuard tunnel, Linux only, with the providers from the catalog and their port forwarding), the VPN container (gluetun’s control server) and interface modes, the checks, and the binding handed to the engine; a fake gluetun in `@highsea-tv/vpn/fake` |
| `packages/subtitles` | Subtitles (ADR 0043), one subpath each: `shared` (languages, profiles, Bazarr's scoring, throttling, sidecar names, the moviehash, processing), `providers` (OpenSubtitles.com, Subdl, SubSource and the zip reader), `movies` (the service: accounts, the wanted list, search, downloads, the import's hooks, the jobs, the sync and the offset), `sync` (the engine, ADR 0044: the reference, ffmpeg and the WebAssembly VAD, alignment and confidence, run as a worker-pool task), fakes of the three providers in `@highsea-tv/subtitles/fake`, and the Sintel fixture and clip makers in `@highsea-tv/subtitles/testing`. The runtime hands media the import hooks and the client's track reader, so media never imports it |
| `packages/lists` | Import lists (ADR 0045), one subpath each: `tmdb` (lists and charts through `@highsea-tv/metadata`), `trakt` (charts, public lists, and the account's watchlist after the device flow; tokens sealed), `generic` (StevenLu and MDBList JSON), `service` (the lists, their 6-hourly sync, exclusions), `shared`; fakes of Trakt and generic lists in `@highsea-tv/lists/fake`. The runtime hands it the library (`ListLibrary`), so lists never import media. Automation itself (RSS, the sweep, `movies.search`) is the runtime's `automation.ts` |
| `packages/notifications` | Notifications (ADR 0046), one subpath each: `service` (connections, the event catalogue, messages in i18n, the `notifications.send` job with retries and `Retry-After`, the log, web push subscriptions and the server's mail), `channels` (Discord, Slack, Telegram, ntfy, Gotify, Pushover, Matrix, Email through Nodemailer, Webhook, Apprise and Browser through `web-push`), `shared`, and `mail`, the email templates (docs/product/emails.md): MJML and plain text, browser-safe, which the prototypes' preview imports too; the server compiles them with `mjml` (`src/mail/compile.ts`, never imported by the browser) and attaches the logo and poster by Content-ID. In `@highsea-tv/notifications/fake`, a recording fetch for every service, a browser's side of web push, and an SMTP server on loopback. The runtime raises the events from hooks the domain packages expose, so they never import it |
| `packages/curation` | Curation (ADR 0048), in `@highsea-tv/curation/service`: announcements (placements, audience, schedule, who has seen and acknowledged them) and featured sections (hand-picked or by rule, with per-movie artwork and taglines), resolved per person and kind of app, the `curation.schedule` job and the preview. Smart collections (ADR 0049) in `@highsea-tv/curation/collections`: rules, picks and exceptions, checked, put in words and evaluated when read; the runtime compiles the rules to SQL (`collection-query.ts`) over the facts in migration 0012 and hands it a `CollectionLibrary`. The runtime hands it the library (`CurationLibrary`), so curation never imports media |
| `packages/importers` | One-time migration (ADR 0041), one subpath each: `@highsea-tv/importers/radarr` (API v3) and `@highsea-tv/importers/qbittorrent` (WebUI API v2, 4.5.0 or later); fakes of both in `@highsea-tv/importers/fake`. Settings › Migration, owner only |
| `packages/api-contract`, `sdk` | The public API's zod/OpenAPI contract, and the typed client every app uses |
| `packages/tokens`, `ui-web`, `brand`, `fixtures` | The design system |
| `docs/` | Roadmap, plans, ADRs, product specs, brand and design language |
| `scripts/` | License audit, version pinning, browser sweeps |

Conventions:

- **Packages export raw TypeScript** (`"exports": { ".": "./src/index.ts" }`) and import with `.ts` extensions. Domain packages with several kinds export one subpath each and no root (`@highsea-tv/schemas/indexers`, `@highsea-tv/media/movies`; ADR 0036): a new kind is a folder under `src/` and `test/` and a line in `exports`. Node runs it with type stripping, so only erasable syntax compiles (`erasableSyntaxOnly`): no enums, no namespaces with values, no parameter properties.
- **The admin reads and writes through the public API,** never Server Actions (ADR 0018).
  - It uses `@highsea-tv/sdk/react`: `useQuery(key, call, topics)` and `useAction(call)`.
  - Screens are ported from `design/prototypes/src/admin/` by swapping the mock client for the SDK.
- **API routes** are declared in `@highsea-tv/api-contract` and implemented in `apps/server/src/api/`. After changing the contract, run `bun run openapi` in `apps/server`; a test fails when `openapi.json` is stale.
- **Database:**
  - change `packages/db/src/schema/`, then run `bun run generate` in `packages/db` (drizzle-kit, then the embed);
  - a test fails when the embedded migrations are stale;
  - tests use `bun:sqlite`, production `better-sqlite3` (ADR 0019).
- **Jobs** run at least once, so every handler must be safe to repeat (ADR 0022).
- **Strings** go in `@highsea-tv/i18n` catalogs (`defineMessages`), not inline (ADR 0021).
- **ui-web** marks its client modules `'use client'`; server components may import its server-safe parts.

## Things that are easy to trip on

- **Node 24.21.0** (`.nvmrc`) is the one Node highsea runs and is tested on: locally, in CI (`node-version-file: .nvmrc`), in the Docker image and in `engines`. CI reads `.nvmrc`; change it, the Dockerfile's two `FROM` lines and `engines` together.
  - `scripts/check-node.ts` enforces it: `bun run server`, `bun run smoke`, the server sweep and a runtime test all fail on another `node` (a Mac's Homebrew `node` may be newer; use `nvm use`).
  - `better-sqlite3` is a native addon built for one Node version, so reinstall after switching Node (`rm -rf node_modules && bun install`).
- **The subtitle sync runs ffmpeg** from a pool worker (`HIGHSEA_FFMPEG` names another binary). Without it, each sync fails at once and System › Health warns; the tests that need it are skipped and say so.
- **Bun's `worker_threads`** are documented as not battle-tested, so the worker pool is tested under Node (`packages/runtime/test/fixtures/pool-under-node.ts`).
- **`bun test` on its own** runs every file in one process, so a DOM test's global `fetch` leaks into the server tests. Use `bun run test`, which passes `--isolate`.
- **Next's dev server** serves its dev scripts to `localhost` only (`allowedDevOrigins`): browse it at `localhost`, not `127.0.0.1`, or pages never hydrate.
- **Hono** can't add routes after the app has handled a request: register test routes first.
- **Next.js:**
  - a custom server can't use `output: 'standalone'` (ADR 0003, amended);
  - set your own response headers before calling Next's handler.
- **Docker behind a TLS-inspecting proxy:** `docker build --secret id=ca,src=/path/ca.crt .`
- **UI work:** the Phase 2 plan's [known pitfalls](docs/plans/phase-2-prototypes.md#known-pitfalls-from-phase-1) still apply, including:
  - the Tailwind theme reset;
  - literal class maps;
  - `min-w-0` and `grid-cols-[minmax(0,1fr)]` around scrollers.
