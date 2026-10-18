# highsea.tv — Roadmap

## Context

highsea.tv is a from-scratch, self-hosted replacement for the whole *ARR suite (Radarr, Sonarr, Lidarr, Prowlarr) and the apps usually run beside it (qBittorrent, Bazarr; later Overseerr, SABnzbd, Tautulli). It also grows into a streaming platform that competes directly with Plex, Jellyfin and Emby.

It is a **Bun monorepo with several apps**:
- **`apps/server`**: the self-hosted all-in-one management app and media server. One Next.js app in one Docker container.
- **Client apps**: web, desktop, mobile and TV. They connect to a server on the local network or remotely, as Plex and Jellyfin clients do.

**Product pillars and differentiators**
- One unified, polished brand, design language and component system across the server and every client. Clean, minimal, modern, dark by default.
- Deep client customizability: dashboard widgets, themes, sound effects.
- Server owners publish **announcements** and **featured sections** that appear on all clients.
- An indexer catalog with one-click setup, maintained and released **independently** of the apps.
- First-class **subtitles**: search, download, management and automatic **sync**, run as background jobs.
- Clients connect to **local (LAN-discovered) or remote servers**.

**Decisions made with the user**

*Sequencing and where things live*
- **Order**: (1) brand + design system/language, finalized and signed off → (2) design prototypes for the server app and all clients → (3) server implementation → (4) client apps.
- All docs, explorations and prototypes live **in this repo**.

*Server milestone 1*
- Scope: platform foundation + a complete **Movies** slice (discover → add → search → grab → built-in torrent → import → subtitles → notify).
- Torrent engine: **in-process TypeScript**, our own session layer on mature JS BitTorrent primitives.
- Streaming/playback: planned now, built later. The data model and torrent engine are designed for it.
- Usenet: later. Abstractions stay protocol-agnostic.

*Clients and catalog*
- Clients use **React everywhere**: web (React), desktop (Tauri wrapping web), mobile and TV (Expo React Native + react-native-tvos), webOS/Tizen (web build). They share tokens, SDK and hooks, with two component implementations, `ui-web` and `ui-native`.
- The indexer catalog lives in this monorepo at **`catalog/indexers`** with its own CI release.

*Scope, cloud and license*
- **No compatibility APIs.** highsea does not emulate the Radarr/Sonarr, qBittorrent, Jellyfin or Subsonic APIs. It replaces and competes with those apps. One-time **migration importers** are still in scope: they import data and do not emulate APIs.
- **Optional highsea cloud.** These central services are optional, and servers work fully without them:
  - accounts and "find my servers";
  - a remote-access relay, which is also self-hostable;
  - a mobile push relay (APNs/FCM);
  - a metadata proxy, so users need no TMDB/TVDB keys;
  - the catalog CDN.
- **Media scope**: movies, TV (+ anime), music, **online video** (YouTube and other channels via yt-dlp) and **books, audiobooks and podcasts**. Out of scope: Live TV/DVR, comics/manga, photos.
- **License: AGPL-3.0.** Every source file gets an SPDX header. GPL-3.0 content (e.g. Prowlarr indexer definitions) is compatible. GPL-2.0-only sources (e.g. Jackett definitions, parts of Jellyfin) are **not** compatible, so check each source before reusing it. GPL ffmpeg builds (x264/x265) are fine.

The repo directory is currently empty and not a git repo. Toolchain: Bun 1.4.3, Node 26 locally, Docker 29.

## Monorepo layout

```
highsea.tv/
├─ docs/                     ALL documentation (markdown, versioned with code)
│  ├─ roadmap.md             this plan, kept current
│  ├─ brand/                 brand brief, logo usage, voice & tone, sound identity
│  ├─ design-language/       principles, color, type, layout, motion, sound, iconography, platform guides (10-ft TV, mobile, desktop), a11y
│  ├─ product/               feature specs: indexers catalog, subtitles, connectivity, personalization, curation, movies pipeline
│  └─ adr/                   architecture decision records (runtime model, DB, torrent engine, API, catalog signing, …)
├─ design/
│  ├─ explorations/          brand direction boards (static HTML/SVG), logo + palette studies
│  ├─ assets/                source SVGs, sound source files, icon sources
│  └─ prototypes/            clickable prototypes app (Vite + React) using real tokens + ui-web, mock data
├─ apps/
│  ├─ storybook/             living style guide / component workbench
│  ├─ server/                Next.js 16 admin UI + /api/v1 + background runtime
│  └─ web/ desktop/ mobile/ tv/                                       [later]
├─ packages/
│  ├─ tokens/  ui-web/  brand/          (ui-native/ later)            design system
│  ├─ core/  api-contract/  sdk/  indexer-schema/                     contracts & shared
│  ├─ db/ runtime/ jobs/ auth/ network/                               server platform
│  ├─ parser/ quality/ metadata/ indexers/ torrent/ downloads/
│  │  library/ media-movies/ subtitles/ notifications/                server domain
│  ├─ personalization/ curation/                                      differentiators
│  └─ config/                                                         tsconfig + Biome
├─ catalog/                  signed catalogs, released independently of apps
│  ├─ indexers/              definitions + logos
│  └─ presets/  themes/  sounds/  device-profiles/   (TRaSH-style quality/CF presets, naming, theme & sound packs, client profiles)
└─ cloud/                    optional highsea cloud services [later]: accounts/server registry, relay (self-hostable), push relay, metadata proxy
```
Reserved for later: `media-tv`, `media-music`, `media-video` (yt-dlp channels), `media-books` (ebooks/audiobooks/podcasts), `usenet`, `requests`, `stream`, `stats`, `ui-native`.

Internal packages export raw TS (`"exports": {".": "./src/index.ts"}`) and only apps build. Domain packages are framework-free.

---

## Phase 0: Repo bootstrap (small)
- `git init` and `.gitignore`; Bun workspaces root `package.json`; `packages/config` (TS strict, Biome).
- Create `docs/` and copy this plan to `docs/roadmap.md`.
- Write initial ADRs for the decisions above.

## Phase 1: Brand and design system/language (gate: user sign-off)

Everything later depends on this, so it comes first and is finalized before any product UI.

1. **Brand brief** (`docs/brand/brief.md`): positioning ("your own streaming platform, fully yours"), audience (self-hosters, households, friends-and-family server owners), personality, competitive look-and-feel audit (Plex, Jellyfin, Emby, Infuse, Apple TV, Netflix), and voice and tone.
2. **Direction explorations** (`design/explorations/`): **2–3 distinct directions** as static HTML boards, viewable locally. Each covers:
   - logo/wordmark concept (SVG);
   - palette (dark-first) and type pairing;
   - sample surfaces: a poster grid, a TV home hero, an admin table;
   - a motion sample and a sound sample.

   A starting hypothesis for one direction: "deep sea", meaning near-black blue-tinted surfaces, one luminous accent, and calm, physical motion. **User picks one direction; we refine it.**

   **✅ Done (2026-10-16).** The owner locked **Abyss Neutral with the Bone accent**. See [`docs/brand/direction.md`](brand/direction.md) and [ADR 0013](adr/0013-brand-direction-abyss-neutral.md).
3. **Design language docs** (`docs/design-language/`). **✅ Done (2026-10-16).** v1.0 signed off; see [`docs/design-language/`](design-language/README.md).
   - principles;
   - color (semantic roles, contrast rules);
   - typography scale;
   - spacing and layout grids per platform;
   - elevation and blur;
   - iconography (Lucide base + custom glyphs);
   - **motion** (durations, springs, choreography, reduced-motion);
   - **sound** (event taxonomy, character, loudness rules);
   - **platform guides**: 10-foot TV focus model, mobile, desktop/web, admin density;
   - accessibility standard (WCAG 2.2 AA, full keyboard and D-pad).
4. **`@highsea/tokens`**:
   - a platform-agnostic token source (color roles, type, space, radius, elevation, blur, density, breakpoints, focus rings, **motion tokens** shared by Motion and Reanimated, **sound tokens**);
   - build outputs: CSS vars + Tailwind v4 `@theme` preset, and a typed RN object;
   - the **theme engine**: a theme is a validated partial override with contrast checks. It ships built-in themes (default dark, OLED black, high contrast) and supports custom themes with share codes.

   **✅ Done (2026-10-16).** See [`packages/tokens`](../packages/tokens/README.md).
5. **`@highsea/brand`**:
   - final logo, wordmark, app icons (all platform sizes), favicon;
   - fonts;
   - **default sound pack**: short UI sounds, procedurally synthesized or CC0, with sources in `design/assets/sounds`.

   **✅ Done (2026-10-16).** See [`packages/brand`](../packages/brand/README.md) and [logo and app icons](brand/logo.md). The custom icon glyphs moved to `ui-web` (step 6).
6. **`@highsea/ui-web` core** on Radix + Tailwind v4 + `motion/react`:
   - primitives: Button, Input, Select, Dialog, Sheet, Popover, Tabs, Table, Badge, Toast, Tooltip, Skeleton, Progress;
   - media components: Poster, Backdrop hero, Carousel row, Rating;
   - shell components: Sidebar, CommandPalette, WidgetFrame, Banner;
   - focus-complete, with reduced-motion support.

   **✅ Done (2026-10-16).** See [`packages/ui-web`](../packages/ui-web/README.md). It also has Menu, Switch, Checkbox, SegmentedControl, the `Icon` set with the custom glyphs, browser UI sound, and the TV spatial navigator. Behavior, axe and stylesheet tests run with `bun test`.
7. **`apps/storybook`**: the living style guide for tokens, themes, components, motion and a sound board, with a theme switcher and a11y addon.

   **✅ Done (2026-10-16).** See [`apps/storybook`](../apps/storybook/README.md) (`bun run storybook`). Foundations pages for brand, color with the contrast audit, icons, layout, motion, the sound board, a theme editor and typography; every component; the media and admin shell compositions; and a TV home with D-pad focus. Every story renders and passes axe under `bun test`.

**Exit criteria**: direction chosen and refined, docs written, tokens/brand/ui-web core published in the repo, Storybook running, user sign-off → design system **v1.0**.

**✅ Phase 1 signed off (2026-10-16): design system v1.0.** Phase 2 starts from [`docs/plans/phase-2-prototypes.md`](plans/phase-2-prototypes.md).

## Phase 2: Design prototypes (gate: user sign-off)
`design/prototypes` is a Vite + React clickable prototype app built on the **real** tokens and ui-web, with SDK-shaped mock fixtures. It has device frames and a platform switcher (desktop/web, mobile, TV 1920×1080 with D-pad/arrow-key focus navigation). Each flow is also specced in `docs/product/`.

**Server admin app** prototypes:
- setup wizard;
- customizable widget dashboard (drag, resize, add widget);
- discover → add movie;
- movie detail (files, history, interactive search, **subtitles tab**);
- downloads (torrent client);
- **indexer catalog browser with one-click add**;
- subtitles settings and wanted list;
- curation composer with a live client preview;
- appearance (theme editor, sound settings);
- users and devices;
- system.

**Client** prototypes (web/desktop, mobile, TV):
- **server connection flow**: LAN auto-discovery list, add remote server by URL, sign in, multi-server switcher;
- home with **featured sections** and **announcements** (banner, modal, card);
- library browse, item detail;
- player chrome with subtitle picker and offset;
- settings: themes, sounds, home layout customization.

Exit: user sign-off on the prototypes, which then serve as the build reference.

The step-by-step plan, with checkpoints, is [`docs/plans/phase-2-prototypes.md`](plans/phase-2-prototypes.md).

## Phase 3: Server milestone 1 (implementation)

### Runtime and platform
- **Process model**: Bun handles packages, scripts and tests. **Node 24 LTS** runs the Next server.
  - A **custom entry `apps/server/server.ts`** (a Node `http` server) calls `@highsea/runtime.boot()`, which starts migrations, jobs, the torrent engine, the download monitor, catalog sync, the discovery responder and the event bus.
  - The entry then routes `/api/*`, `/stream/*` (reserved) and `/ws` (reserved) to Hono, and everything else to Next's request handler.
  - The singleton lives on `globalThis.__highsea`, so Next-rendered code shares it; routes and actions use `getRuntime()`.
  - CPU-heavy work runs in `worker_threads`, and ffmpeg runs as child processes.
  - SIGTERM: save resume data, drain jobs, close the DB.
  - `next.config.ts`: `output: 'standalone'`, `transpilePackages`, and `serverExternalPackages` (better-sqlite3, sharp, BitTorrent libs).
- **API**:
  - Hono + `@hono/zod-openapi`, mounted by the custom server entry and defined in `@highsea/api-contract`;
  - `/api/v1/openapi.json` and `/api/docs`;
  - SSE `/api/v1/events` (WebSockets come later with playback);
  - `@highsea/sdk` is the typed client for all apps.

  Domain services hold the logic. API handlers and admin Server Actions are thin adapters, and every admin capability is reachable via the API with admin scope.
- **Data**: SQLite (WAL) + Drizzle at `/config/highsea.db`.
  - A **unified `media_items` tree** (movie / series / season / episode / artist / album / track / book) plus type extension tables.
  - `media_files` stores full ffprobe stream info.
  - Image cache via `sharp`; secrets are encrypted with `/config/secret.key`.
- **Jobs**: a SQLite-backed scheduler and queue (intervals, concurrency, retries, history).
- **Auth**:
  - roles: owner/admin/member/restricted; scrypt hashing;
  - cookie sessions for the web;
  - **per-server device tokens** for clients, listed and revocable;
  - API keys.

  Pairing codes come later; the model supports them.

### Connectivity, local and remote (`@highsea/network` + `sdk`)
**Server side**
- A stable `serverId`, plus an unauthenticated `GET /api/v1/system/info/public` returning id, name, version, local addresses and the configured public URL.
- **LAN discovery**: a UDP broadcast responder plus **mDNS** `_highsea._tcp` advertisement.
- Remote access: a configurable external URL, trusted reverse-proxy headers, optional built-in TLS, and docs for port-forward, reverse-proxy and Tailscale setups.

**Client side** (`@highsea/sdk` `ServerConnection`)
- Keeps a list of known servers (discovered and saved).
- Probes candidate addresses (LAN first, then remote) by latency, keeps the winner and fails over automatically.
- Stores tokens per server and supports multi-server switching.

**Later, optional**: a self-hostable "highsea Connect" rendezvous/relay for remote access without port forwarding. It is documented in `docs/product/connectivity.md` and not built in M1.

**Docker**: discovery needs `network_mode: host` or the discovery UDP port published. The port is decided in an ADR.

### Indexers and the independent catalog
- **`@highsea/indexer-schema`**: definitions are **declarative only, with no code**, so remote updates are safe.
  - Kinds: torznab, newznab, json-api, html (selectors), rss.
  - Each definition carries: id, version, `minEngineVersion`, logo, privacy, language, categories, settings fields (with "where to find this" help), login flow, request templates, field mappings, rate-limit hints, test query.
- **`catalog/indexers` pipeline** (its own CI on `catalog/**`):
  1. validate and smoke-test;
  2. build a versioned bundle;
  3. **ed25519-sign** the manifest;
  4. publish to a static host on stable/beta channels.

  No app build is involved.
- **Server `CatalogService`**:
  - fetches on boot and every 6 hours, **verifies the signature**, and filters by engine version;
  - caches the catalog and auto-updates installed definitions with a changelog;
  - ships a bundled seed snapshot for offline first run;
  - supports extra catalog URLs and `/config/definitions`.
- **One-click UX**:
  - public indexers: one click adds, auto-tests and maps categories;
  - private indexers: a form generated from the definition, with inline help and test-on-save;
  - a setup-wizard starter pack;
  - health, backoff and stats per indexer.
- **Licensing**: highsea is AGPL-3.0, so GPL-3.0 definitions (e.g. Prowlarr's) can be adapted with attribution. GPL-2.0-only sources (e.g. Jackett's) cannot. Every definition records its source and license.

### Built-in torrent engine (`@highsea/torrent`)
- **Our code**:
  - session manager and state machine;
  - piece picker: rarest-first, plus a **sequential/priority mode** for future streaming;
  - choking;
  - file storage with piece↔file mapping and per-file priority;
  - verification and **fast resume** in the DB;
  - rate, queue, ratio and seed-time limits; move-on-complete.
- **Primitives**: `bittorrent-protocol`, `ut_metadata`, `ut_pex`, `bittorrent-dht`, `bittorrent-tracker`, `parse-torrent`, `magnet-uri`.
- It sits behind a `TorrentEngine` interface, with a configurable port (6881 TCP/UDP) and bind interface for VPN routing.

### Movie pipeline
1. Discover (TMDB) → Add (root folder, quality profile, subtitle language profile, monitored, minimum availability, search now).
2. `RefreshMovie` job: details and cached images.
3. `MovieSearch` job: indexers → `parser` → map → decision engine (profile, size, seeders, custom-format score, upgrades, blocklist, queued) → grab via `downloads` → torrent engine.
4. Monitor progress over SSE. On completion: import (ffprobe, quality, rename template, hardlink or copy), `media_files`, history, then **trigger the subtitle pipeline**. Seed to the limit, then remove the torrent.
5. Automation: RSS sync every 15 min, missing and cutoff-unmet searches, upgrades, blocklist + re-search.
6. Notifications: Jellyfin/Plex/Emby refresh and webhooks.
7. Existing-library import for users migrating from Radarr.

### Subtitles, first class (`@highsea/subtitles`)
- **Providers** (interface + implementations):
  - OpenSubtitles.com (REST, user API key), Podnapisi, Subdl, Gestdown/Addic7ed (TV-ready);
  - **embedded tracks**: detected via ffprobe, extractable via ffmpeg;
  - subtitles bundled in the downloaded release.
- **Language profiles**:
  - ordered languages with forced/HI preferences and a cutoff;
  - defaults per root folder, overridable per item.
- **Scoring**: file-hash match (OpenSubtitles moviehash) > release group / source / resolution match > title and year. A minimum-score threshold applies, and better matches are fetched as upgrades.
- **Processing**:
  - normalize encoding to UTF-8;
  - support SRT, ASS/SSA and WebVTT, with VTT conversion for future web playback;
  - optional cleanup (ads, HI tags).
  - Sidecars are named `Title (Year).en.srt`, `.en.forced.srt` and `.en.hi.srt`. A `subtitle_files` table links them to `media_files`.
- **Sync engine** (in-process TS, background job `SubtitleSync`):
  1. ffmpeg extracts 16 kHz mono audio;
  2. voice-activity detection finds speech segments;
  3. alignment finds a global offset via cross-correlation, plus split-point and framerate-drift correction (alass-style);
  4. a confidence score is computed. Only confident results are written, and the original is kept.

  It can also sync against an embedded reference track. A manual offset adjustment is exposed in the UI and API.
- **Jobs**:
  - search on import;
  - periodic wanted-subtitles search;
  - upgrade search;
  - sync after every download;
  - re-sync when a media file is replaced.
- **UI**:
  - movie detail Subtitles tab: tracks, embedded, manual search/pick, sync status and confidence, offset;
  - `/wanted/subtitles`;
  - `/settings/subtitles`: providers, language profiles, sync options.

### Personalization (`@highsea/personalization`)
- **Preferences** are stored server-side with layers: user → client type → device. They sync to every client.
- **Widgets**:
  - a registry: id, sizes, zod settings schema, data dependency, per-platform renderer;
  - a draggable, resizable grid with layouts saved per user; owners set role defaults.
  - M1 admin widgets: activity, speed graph, disk, recently added, upcoming, calendar, indexer health, subtitle queue, system health, announcements.
- **Themes**: built-in and custom themes from the theme engine. The owner sets the server default theme and branding (name, logo, accent) that clients inherit.
- **Sound**: a Web Audio engine with an event map, sound packs (built-in or uploaded), volume and a toggle. Off by default in admin; on by default in TV clients.

### Curation (`@highsea/curation`)
- **Announcements**:
  - markdown body, image, CTA;
  - severity;
  - placement: banner / modal / toast / home card;
  - audience: everyone, roles, users or client types;
  - schedule; dismiss or require-acknowledge, with per-user tracking;
  - live push over SSE.
- **Featured sections**:
  - layouts: hero / row / spotlight;
  - sources: a manual list or rules (recently added, genre, collection, saved filter);
  - artwork and tagline overrides, order, audience, schedule, placement.
- M1 delivers: the data model, an admin composer with live client preview, `/api/v1/curation/*`, and announcements rendered in the admin app.

### Admin UI routes (built to match the Phase 2 prototypes)
- Setup and access: `/setup`, `/login`.
- Dashboard: `/` widget dashboard.
- Library and activity:
  - `/discover`, `/movies`, `/movies/[id]`;
  - `/activity` (queue / history / blocklist);
  - `/wanted` (movies, subtitles);
  - `/downloads`.
- Owner tools: `/indexers` (catalog + installed), `/curation`.
- Settings and system:
  - `/settings/*`: media management, profiles, custom formats, quality sizes, subtitles, download client, connections, network/remote access, appearance, users/devices, general;
  - `/system`: status, tasks, logs, events, catalog version.

### Docker
- Multi-stage build: `oven/bun` build → `node:24-bookworm-slim` + ffmpeg/ffprobe + tini, using PUID/PGID.
- Volumes: `/config`, and a single `/data` root so hardlinks work.
- Ports: 3000, 6881 TCP/UDP, and the discovery UDP port.
- Healthcheck: `/api/health`.
- Compose example covers both host networking (LAN discovery) and a gluetun VPN variant.

### Phase 3 build order
1. Platform: `core`, `db`, `runtime`, `jobs`, events, `api-contract` + Hono + OpenAPI, `sdk`, health.
2. `auth`, `network` (public info, discovery), setup wizard, app shell, command palette.
3. `personalization`: theme switching and editor, widget dashboard, sound.
4. `parser` (large fixture suite) + `quality` (decision engine).
5. `metadata` + `media-movies` + Discover/Movies UI.
6. `indexer-schema` + `indexers` + `catalog/indexers` pipeline + `CatalogService` + one-click UI.
7. `torrent` + `/downloads`.
8. `downloads` + `library` (import, rename, existing-library import).
9. `subtitles`: providers, profiles, scoring, sync engine, UI.
10. Automation + `notifications`.
11. `curation`.
12. Docker hardening + end-to-end tests.

## Phase 4 (later): clients
`ui-native`, then `apps/web` → `apps/desktop` (Tauri) → `apps/mobile` + `apps/tv` (Expo / react-native-tvos), built from the Phase 2 prototypes. Alongside them: `stream` (playback/transcode, WebSockets), TV/music/books domains, Usenet, requests, and the optional Connect relay.

---

## Gap analysis: what a true end-to-end replacement still needs

Tags: **[M1]** pull into server milestone 1 · **[Arch]** affects architecture now, even if built later · **[Later]** roadmap backlog.

### Architecture corrections
- **[Arch] Custom Node server entry instead of instrumentation-only boot.**
  - Streaming (range requests, HLS), WebSockets (remote control, SyncPlay, live sessions) and long-lived connections don't fit Next route handlers well when self-hosted.
  - Proposal: `apps/server/server.ts` is a Node `http` server that boots the runtime and sends `/api`, `/stream` and `/ws` to Hono, and everything else to Next's request handler. It is still one process and one container.
- **[Arch] Worker isolation.** CPU-heavy work (subtitle alignment, hashing/verification, image processing, release-scoring batches) runs in `worker_threads`. ffmpeg runs in child processes. The Next/UI thread stays responsive.
- **[Arch] Generalize the catalog.** Use one signed catalog system (`catalog/*`) for indexers, plus:
  - **TRaSH-style quality / custom-format presets** (Recyclarr replacement);
  - naming presets, subtitle providers, themes, sound packs, widget packs, client device profiles.
- **[Arch] Multiple versions per item.** One movie can have 4K HDR + 1080p SDR files with separate quality profiles. Radarr needs two instances for this, which is a strong differentiator. It affects the `media_files` and profile model.
- **[Arch] Permissions model.** Fine-grained permissions (request, auto-approve, download, manage library, manage users, admin), not just roles. Library-level access per user.
- **[Arch] Filesystem watching.** inotify plus periodic scans, so files dropped in manually (not via the pipeline) still show up. A streaming server must handle non-managed libraries too.
- **[Arch] Optional highsea cloud (decided).** The server ships a `cloud` connector that is off by default and opt-in:
  - links the server to a highsea account;
  - registers it for "find my servers";
  - uses the relay when direct connections fail;
  - forwards push notifications to mobile clients;
  - uses the metadata proxy when the user has no API keys.

  Every cloud feature has a self-hosted fallback (own TMDB key, port-forward/reverse proxy, self-hosted relay, ntfy/web-push). Cloud services live in `cloud/` and are built after server M1. Server and SDK auth must allow cloud-account sign-in alongside local users from the start.

### Acquisition (*ARR / download-stack parity)
- **[M1] Archive extraction** (Unpackerr): RAR/7z/zip, multi-part, password detection.
- **[M1] Malicious/fake release protection** (Cleanuparr/Decluttarr):
  - reject torrents containing `.exe`, `.lnk`, `.scr`, `.zipx` or password-protected archives;
  - stalled/slow-download detection, removal and re-search;
  - sample-file filtering.
- **[M1] Health checks** (*arr "Health"): paths, permissions, disk space, indexer status, catalog status, VPN binding.
- **[M1] Backups and restore**: scheduled DB + config backups, plus a backup before every migration.
- **[M1] Manual / interactive import**: file browser, rename preview, mass rename, multiple root folders and disks.
- **[M1] Media management extras**: NFO and artwork writing (Kodi), permissions (chmod/chown), editions, alternative titles, delay profiles, tags for scoping rules.
- **[M1] Torrent engine production features**:
  - IP blocklists; UPnP/NAT-PMP and VPN port-forwarding;
  - interface-binding kill-switch; uTP, IPv6;
  - watch folder; manual (non-managed) torrent adds and generic RSS auto-download;
  - categories.
- **[M1] Per-tracker seeding rules** (qbit_manage): min seed time/ratio per tracker, hit-and-run protection for private trackers.
- **[M1] Import lists** (Radarr lists): Trakt, IMDb, Letterboxd, TMDB lists; auto-add + sync.
- **[M1] Calendar** plus an iCal feed.
- **[Later] Cloudflare challenge solving** (FlareSolverr/Byparr): optional headless-browser component, needed by some public indexers.
- **[Later] TV series** (Sonarr): seasons/episodes, season packs, multi-episode files, daily shows, specials, scene numbering (TheXEM). Metadata from TVDB/TMDB/TVmaze.
- **[Later] Anime**: absolute numbering, AniDB/AniList mappings, dual-audio, fansub groups.
- **[Later] Music** (Lidarr + beets): MusicBrainz, release groups, AcoustID fingerprinting, tagging, lyrics (LRC), audio quality profiles.
- **[Later] Requests** (Overseerr/Jellyseerr): discovery, requests, approvals, quotas, availability notifications. Built into every client, not a separate app.
- **[Later] Usenet** (SABnzbd/NZBGet): NNTP multi-server, par2 verify/repair, unpack, retention.
- **[Later] Autobrr-style IRC announce grabbing** and **cross-seed**, both for private-tracker users.
- **[Later] Migration importers**:
  - Radarr/Sonarr/Lidarr/Prowlarr/Bazarr settings and libraries;
  - qBittorrent torrents with resume data;
  - Plex/Jellyfin/Emby users, watch history, collections, playlists.

  This is critical for "drop-in"; at minimum the Radarr + qBittorrent importers belong with M1.

### Streaming server (Plex / Jellyfin / Emby parity)
- **[Later, Arch now] Playback engine**:
  - direct play / direct stream (remux) / transcode decisions from **client device profiles**;
  - HLS (fMP4);
  - **hardware acceleration**: VAAPI/QSV, NVENC, AMF, VideoToolbox, Rockchip, with Docker `/dev/dri` and NVIDIA passthrough;
  - HDR→SDR tone-mapping; subtitle burn-in (PGS/ASS); audio downmix; transcode cache and throttling.
- **[Later] Media analysis**: trickplay thumbnails, chapter images, **intro/credits/recap detection** (audio fingerprinting) for skip buttons, loudness analysis.
- **[Later] Watch state**: resume points, played/unplayed, Continue Watching, Next Up, synced across clients.
- **[Later] Users and households**:
  - Netflix-style profiles with PINs, kids profiles;
  - parental controls (ratings, tags);
  - friends/remote sharing via invite links;
  - per-user stream and bandwidth limits.
- **[Later] Social and devices**:
  - SyncPlay / Watch Together;
  - remote control of other sessions;
  - Chromecast (custom receiver), AirPlay, DLNA.
- **[Later] Offline downloads** to mobile/desktop, with optional transcode-for-download.
- **[Later] Discovery inside the server**:
  - full-text/fuzzy search (SQLite FTS5);
  - recommendations ("because you watched", similar);
  - TMDB collections, smart collections, playlists, watchlist, ratings.
- **[Later] Metadata management**:
  - edit and lock fields, choose artwork;
  - fanart.tv, multiple providers, local NFO reading;
  - poster overlays (resolution/HDR badges), as Kometa does.
- **[Later] Session stats and monitoring** (Tautulli):
  - active sessions dashboard with stream kill/message;
  - per-user history and stats;
  - newsletters; playback-event notifications.
- **[Later] Library automation**:
  - **rule-based cleanup** (Maintainerr/Janitorr): delete watched or stale media using watch data, which is uniquely possible all-in-one;
  - **library optimization** (Tdarr/Unmanic): background re-encode to HEVC/AV1, strip unwanted tracks, normalize audio.
- **[Later] Subtitle extras**: optional local Whisper-based subtitle generation when none exist, and machine translation.
- **[Later] Scrobbling**: Trakt, Simkl, AniList, Letterboxd export.
- **[Later] Online video** (Tube Archivist/Pinchflat replacement):
  - channel and playlist subscriptions via a bundled yt-dlp;
  - quality and format rules, SponsorBlock segments, retention rules;
  - videos appear in the library as a first-class type.
- **[Later] Books, audiobooks and podcasts** (Readarr + Audiobookshelf + Calibre-web replacement):
  - metadata from Open Library, Google Books and Audible;
  - indexer search, ebook formats with conversion and an OPDS feed;
  - audiobook chapters with streaming progress sync;
  - podcast subscriptions.
- **Out of scope**: Live TV/DVR, comics/manga, photos.
- **No compatibility APIs.** Private-tracker tooling (cross-seed, IRC announce grabbing, seeding management) is built natively instead.

### Platform and operations
- **[M1] Security**:
  - TOTP 2FA, passkeys;
  - OIDC/SSO (Authentik/Authelia) and trusted reverse-proxy auth headers;
  - login rate limiting, audit log, scoped API keys.
- **[M1] Notifications breadth**: Discord, Telegram, ntfy, Gotify, Pushover, email/SMTP, Apprise, Matrix, Slack, webhooks, browser web-push.
- **[M1] i18n**: localizable UI strings from day one, plus metadata language/region settings.
- **[M1] Observability**: structured logs viewer, Prometheus `/metrics`, opt-in crash reporting.
- **[M1] Release engineering**:
  - CI on GitHub Actions;
  - multi-arch Docker images (amd64 + **arm64** for Pi/NAS) published to GHCR;
  - versioning and changelog; in-app update notifications;
  - templates for unRAID, TrueNAS and Synology.
- **[Arch] TLS**: built-in ACME/Let's Encrypt for remote access without a reverse proxy.
- **[Arch] Storage realities**: SMB/NFS mounts (no hardlinks, copy fallback), mergerfs, multiple disks, and large libraries (100k+ items) with indexes designed for them.
- **[Arch] Extension points / plugin system**: providers, notification channels, widgets and metadata agents as registries now. A sandboxed plugin system can come later.
- **[Arch] License: AGPL-3.0 (decided).**
  - Phase 0 adds `LICENSE`, SPDX headers, and a third-party license audit in CI (blocks GPL-2.0-only and other incompatible dependencies and content).
  - Catalog content records its license and source per definition.
- **[M1] User-facing docs**: install guides (Docker, unRAID, Synology), migration guides, and a TRaSH-style "recommended setup", all in `docs/`.

---

## Verification
- **Phase 1**:
  - token build outputs match snapshots, and every built-in theme passes the contrast checks;
  - Storybook builds, with a11y addon checks clean;
  - user reviews the explorations and Storybook locally (`bun run storybook`; `open design/explorations/*.html`).
- **Phase 2**: `bun run prototypes` runs; every listed flow is clickable on desktop, mobile and TV frames, with keyboard/D-pad focus working on TV.
- **Phase 3 unit and integration** (`bun run typecheck && bun run lint && bun test`):
  - parser fixtures; decision-engine cases;
  - torrent: local tracker, engine A seeds and engine B downloads, with hash checks, pause/resume and fast-resume;
  - library: naming and hardlink/copy;
  - all catalog definitions validate;
  - **subtitle sync**: take a known-good SRT for CC content, apply a synthetic offset and framerate drift, and assert the sync restores it within ±100 ms;
  - provider adapters tested against recorded fixtures;
  - discovery: the responder answers broadcast and mDNS queries, and `ServerConnection` picks the LAN address over the remote one and fails over when LAN is down.
- **Catalog independence**:
  - serve a locally signed catalog, publish version N+1, and confirm the running server updates definitions **without an app rebuild**;
  - confirm a tampered bundle is rejected.
- **End-to-end** (Playwright against `docker compose up`, Blender's CC *Sintel*):
  1. setup;
  2. one-click add of a mock public indexer from the local catalog;
  3. add *Sintel (2010)* and grab it;
  4. watch live progress;
  5. confirm the file appears at `/data/media/movies/Sintel (2010)/…` with a history entry;
  6. the subtitle pipeline attaches an `.en.srt` from a mock provider and marks it synced.

  Also: widget layout and theme persist across sessions, and a role-targeted announcement shows only to that role.
- **Resilience**: restart mid-download; it resumes without a full recheck, and jobs (including subtitle sync) recover.
