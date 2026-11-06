# Architecture Decision Records

Short records of decisions that shape the system. Each one is immutable once accepted. To change a decision, add a new ADR that supersedes the old one.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-design-first-sequencing.md) | Design-first sequencing | Accepted |
| [0002](0002-bun-monorepo-multiple-apps.md) | Bun monorepo with multiple apps | Accepted |
| [0003](0003-server-runtime-custom-entry.md) | Server runtime: custom Node entry hosting Next.js + Hono | Accepted; amended 2026-10-27, 2026-10-28, 2026-11-03, 2026-11-04 (twice) and 2026-11-05 (twice) |
| [0004](0004-sqlite-drizzle.md) | SQLite + Drizzle for server data | Accepted |
| [0005](0005-in-process-torrent-engine.md) | In-process TypeScript torrent engine | Accepted; amended by 0037 |
| [0006](0006-public-api-openapi-sdk.md) | Public API: Hono + OpenAPI, typed SDK | Accepted |
| [0007](0007-signed-independent-catalogs.md) | Signed catalogs released independently of apps | Accepted |
| [0008](0008-clients-react-everywhere.md) | Clients: React everywhere | Accepted; amended 2026-11-01 and 2026-11-03, and by 0061 |
| [0009](0009-license-agpl.md) | License: AGPL-3.0-only | Accepted; amended 2026-10-29 (twice) |
| [0010](0010-optional-highsea-cloud.md) | Optional highsea cloud | Accepted |
| [0011](0011-no-compatibility-apis.md) | No compatibility APIs | Accepted |
| [0012](0012-unified-media-item-model.md) | Unified media item model | Accepted |
| [0013](0013-brand-direction-abyss-neutral.md) | Brand direction: Abyss Neutral (Bone) | Accepted |
| [0014](0014-universal-media-pages.md) | One media page per title, whatever its library state | Accepted; amended 2026-10-20 |
| [0015](0015-tv-hero-binds-featured-row.md) | The TV hero binds only the featured row | Accepted |
| [0016](0016-gentler-poster-lift.md) | A gentler poster lift | Accepted |
| [0017](0017-web-home-full-bleed-hero.md) | The web home uses a full-bleed hero | Accepted |
| [0018](0018-admin-data-through-the-api.md) | The admin UI reads and writes through the public API | Accepted; amended 2026-11-04 and 2026-11-05 (twice) |
| [0019](0019-database-driver-seam.md) | One schema, two SQLite drivers | Accepted |
| [0020](0020-discovery-port.md) | LAN discovery on UDP 7368, plus mDNS | Accepted; amended 2026-10-28 and 2026-10-29 (three times) |
| [0021](0021-i18n-message-catalogs.md) | Strings live in typed message catalogs | Accepted |
| [0022](0022-job-queue.md) | A SQLite job queue, at least once | Accepted |
| [0023](0023-accounts-sessions-devices.md) | Every sign-in is a device | Accepted; amended 2026-10-20 |
| [0024](0024-two-step-passkeys-and-tvs.md) | Two-step verification and passkeys never reach the TV | Accepted; amended 2026-10-20 and 2026-10-29 (three times) |
| [0025](0025-single-sign-on-and-proxy-auth.md) | Single sign-on by OIDC, and forward-auth proxy headers | Accepted |
| [0026](0026-network-tls.md) | Plain HTTP always, built-in TLS beside it | Accepted |
| [0027](0027-preferences-in-layers.md) | Preferences in layers, on the server | Accepted; amended 2026-11-01 |
| [0028](0028-files-the-owner-uploads.md) | Files the owner uploads: in the database, checked by their bytes | Accepted |
| [0029](0029-external-services.md) | External services: one injected fetch, recorded responses | Accepted |
| [0030](0030-metadata-cache.md) | The metadata cache: TMDB’s responses beside the library, under six months | Accepted |
| [0031](0031-quality-and-the-decision-engine.md) | Quality and the decision engine: Radarr's documented behaviour, written fresh | Accepted |
| [0032](0032-administrative-and-normal-access.md) | Administrative and normal access: Owner, Admin, User | Accepted; amended 2026-10-27 |
| [0033](0033-indexer-definitions.md) | Indexer definitions: highsea's own declarative format, written by us | Accepted; amended 2026-10-20 |
| [0034](0034-catalog-service-and-signing.md) | The catalog service and signing | Accepted |
| [0035](0035-indexer-health-and-search.md) | Indexer health, rate limits and search fan-out | Accepted |
| [0036](0036-domain-packages-with-subpath-exports.md) | Domain packages with a subpath export per kind | Accepted |
| [0037](0037-the-torrent-engine-as-built.md) | The torrent engine as built: our session layer, one socket factory | Accepted |
| [0038](0038-downloads.md) | Downloads: grabbing, the queue, protection and seeding | Accepted |
| [0039](0039-importing.md) | Importing: an idempotent pipeline with Radarr's naming | Accepted; amended 2026-10-27 |
| [0040](0040-test-media.md) | Test media generated with ffmpeg, and a local swarm | Accepted |
| [0041](0041-migration-importers.md) | The migration importers: Radarr and qBittorrent through their APIs | Accepted |
| [0042](0042-vpn-connections.md) | VPN connections: one binding, four modes | Accepted |
| [0043](0043-subtitles.md) | Subtitles: providers in code, Bazarr's scoring, originals kept | Accepted |
| [0044](0044-subtitle-sync.md) | The subtitle sync engine: speech, correlation, splits and a confidence that can veto | Accepted |
| [0045](0045-automation.md) | Automation: RSS, the backlog sweep, upgrades, import lists and the calendar feed | Accepted |
| [0046](0046-notifications.md) | Notifications: the event catalogue, channels as code, delivery, email and web push | Accepted; amended 2026-10-28 |
| [0047](0047-operations.md) | The owner's tools: backups and restore, the log, crash reports, updates and /metrics | Accepted |
| [0048](0048-curation.md) | Curation: announcements and featured sections, resolved per person and app | Accepted |
| [0049](0049-smart-collections.md) | Smart collections: rules compiled to SQL, evaluated when read | Accepted; amended 2026-10-27 |
| [0050](0050-release-and-versioning.md) | Release and versioning: one SemVer version, two channels, a prepared commit and a gated workflow | Accepted; amended 2026-10-23, 2026-10-28, 2026-10-29 (four times), 2026-11-04 and 2026-11-06 |
| [0051](0051-playback-engine.md) | The playback engine: direct play, then direct stream, then HLS transcodes made on demand | Accepted; amended 2026-10-27 and 2026-10-28 (twice) |
| [0052](0052-device-profiles.md) | Device profiles: what each client plays, built in and reported, in one shape | Accepted; amended 2026-10-27, 2026-10-28 (twice) and 2026-10-29 (three times) |
| [0053](0053-clients-build-and-distribution.md) | The clients' build and distribution: Vite at /web, Tauri for desktop, Expo for mobile and TV | Proposed; the web part Accepted 2026-10-28, desktop 2026-10-29; amended 2026-10-29 (three times), 2026-11-03 and 2026-11-04, and by 0061 |
| [0054](0054-watch-state.md) | Watch state: positions, watched and the player's picks, per person and title | Accepted; amended 2026-11-01 |
| [0055](0055-clients-shared-logic.md) | The clients' shared logic: `@highsea-tv/client`, everything but the drawing | Accepted; amended 2026-10-29, 2026-11-01, 2026-11-02 (twice), 2026-11-03 (twice) and 2026-11-04 (twice), and by 0061 |
| [0056](0056-hardware-acceleration.md) | Hardware acceleration: four paths, each used only once a check on this host passes | Accepted; amended 2026-10-28 |
| [0057](0057-installing-without-configuration.md) | Installing without configuration: graphics handed over by default, the user, time zone, folders and address detected, and highsea's own TMDB key | Accepted; amended 2026-10-29 |
| [0058](0058-desktop-app.md) | The desktop app: Tauri around the web build, with the server reached through Rust | Accepted; amended 2026-10-29, 2026-11-03 and 2026-11-04, and by 0061 |
| [0059](0059-native-apps.md) | The native apps: Expo on React Native, two apps sharing ui-native and the client | Proposed; amended 2026-10-29, 2026-11-01, 2026-11-02, 2026-11-03 and 2026-11-04 (twice), and by 0061 |
| [0060](0060-one-design-system-one-library.md) | One design system and one component library, adaptive to the app it's in | Proposed; amended 2026-11-02 (twice), 2026-11-03 (twice) and 2026-11-04 (three times), 2026-11-05 (twice) and 2026-11-06, and by 0061 |
| [0061](0061-one-client-platform.md) | One client platform: every client and its prototype in one Expo project, drawn once in React Native | Proposed; amended 2026-11-03, 2026-11-04 (six times), 2026-11-05 (twice) and 2026-11-06 |
| [0062](0062-next-branch-and-ci-by-branch.md) | The `next` branch and CI by branch: a fast check on every pull request, the heavy jobs once per push to `next` | Accepted |

Template: copy [`template.md`](template.md).

## Which work added which ADRs

0018–0022 came with checkpoint 1, 0023–0026 with checkpoint 2, 0027–0028 with checkpoint 3, 0029–0031 with checkpoint 4, 0032 with the admin-access work, 0033–0035 with checkpoint 5, 0036 (domain packages with subpath exports) at its review, 0037–0040 and 0042 with checkpoint 6a, 0041 (the migration importers) with 6b, which also added dated 6b sections to 0037, 0039 and 0042, 0043 (subtitles) with 7a, 0044 (the subtitle sync engine) with 7b, which also amended 0040, 0045 (automation) with 8a, 0046 (notifications) and 0047 (operations) with 8b, 0048 (curation) with 8c, 0049 (smart collections) with 8d, and 0050 (release and versioning) with 9b, which also added a dated section to 0034. Phase 4's 4.0a added a dated section to 0003 (Node 26 and Debian trixie), and 4.0b drafted 0051 (the playback engine), 0052 (device profiles) and 0053 (the clients' build and distribution) as Proposed. 4.1a added 0054 (watch state) and dated sections to 0003 (`/stream` served), 0039 (the scan adds what it can match surely) and 0049 (the watch rules on); 4.1b added dated sections to 0051 and 0052 and made them Accepted. 4.2a added 0055 (the clients' shared logic) and dated sections to 0003 (`/web` served), 0032 (users sent to `/web`) and 0053 (the web client as built); 4.2b added a second to 0053 (the web player). 4.3a added dated sections to 0046 (Playback started), 0051 (limits, the cache, burn-in, the downmix and Now playing) and 0052 (burned-in subtitles in the decision). 4.3b added 0056 (hardware acceleration) and dated sections to 0003 (the drivers and the render node's group), 0051 (the graphics chip) and 0052 (tone mapping in the decision). 4.3c adds 0057 (installing without configuration, with highsea's own TMDB key) and dated sections to 0003 (NVIDIA's variables and the user found from `/data`), 0020 (mDNS through the host's avahi, then the advertised address and the router's forwarding), 0050 (the TMDB key in the `release` environment, then the stores and `get.highsea.tv`) and 0056 (the handover on by default). Part D adds dated sections to 0057 (the Synology package) and 0050 (the package on each stable release). 4.4a adds 0058 (the desktop app, Accepted) and dated sections to 0009 (the audit reads crates), 0020 (discovery from the app), 0024 (single sign-on from the apps), 0050 (the desktop app on each stable release), 0052 (the webviews' profiles) and 0053 (desktop as built). 4.5a adds 0059 (the native apps, Proposed until 4.5c) and dated sections to 0009 (the audit reads pods), 0020 (discovery from the phone), 0024 (approving a TV from the phone, and single sign-on), 0050 (the phone's version), 0052 (the `ios` and `tvos` profiles), 0053 (the phone app as built) and 0055 (library, servers and cues). Design system 1.1 adds 0060 (one design system and one library, Proposed until the owner's review) and dated sections to 0008 (one library, two renderers) and 0059 (ui-native joined with ui-web). The apps' catch-up's part A adds dated sections to 0027 (the apps' playback settings), 0054 (Remove from Continue watching) and 0055 (what moved from the prototype). Part B adds dated sections to 0055 (a person's films and announcements' words), 0059 (the TV's screens on shared parts) and 0060 (the TV's own parts and Chip's end icon). Part C adds dated sections to 0055 (the phone on the shared rules) and 0060 (the phone's page parts). The one client platform's part A adds 0061 (one client platform on React Native, Proposed until the owner's review) and dated sections to 0003 (the client's Expo web export at `/web`), 0008 (React Native everywhere), 0053 (the web's build is Expo's, one project), 0055 (the prototypes' logic moved in, the mock as a transport), 0058 (the desktop app around the Expo export), 0059 (`apps/mobile` and `apps/tv` joining `apps/client`) and 0060 (one drawing per component). Part B's B1 adds dated sections to 0055 (the films' rules for every client), 0060 (the films' parts merged by form factor) and 0061 (the films' screens moved, with the prototypes handing them to the client). B2 adds dated sections to 0050 (the phone's and TV's version from `apps/client`), 0055 (downloads and the player's speeds), 0059 (`apps/mobile` and `apps/tv` removed), 0060 (what B2 added to the library) and 0061 (the rest of the films apps moved, and the two apps removed). B3 adds dated sections to 0055 (shows, music, the music player and profiles), 0060 (what B3 added to the library) and 0061 (the drafted routes, and hiding what a server doesn't serve; then the screens moved and the prototypes' client folders removed). Part C's C1 adds dated sections to 0003 (`/web` serves the client's export), 0053 (the web ships from it, and `bun run web`) and 0061 (what the move found: checked state on the web, the panel's blur, cues the browser draws). C2 adds dated sections to 0058 (the window shows the client's desktop export, and `server_info`), 0059 (highsea's shipping identifiers) and 0061 (the desktop app on the client, and `apps/web` removed). Part D's D1 adds dated sections to 0003 (Next.js hosting react-native-web on webpack, the sheet in the server's HTML), 0018 (the screens shared with their prototype), 0060 (the admin's parts in the native renderer, `svgName`) and 0061 (the admin on the library, shared with its prototype). D2 adds dated sections to 0003 (the image's size reported, not gated), 0018 (the library and the work shared), 0060 (what D2 added to the library, and what the sweeps changed) and 0061 (the library and the work moved). D3 adds dated sections to 0003 (the Next.js wiring in the library, the server without Tailwind, the build context), 0018 (every admin screen shared), 0060 (the web renderer removed, and what D3 added) and 0061 (every admin screen moved, Shows' drafted admin, and the tables at scale). The `next` branch (next-branch.md) adds 0062 (the `next` branch and CI by branch) and a dated section to 0050 (work lands on `next`).
