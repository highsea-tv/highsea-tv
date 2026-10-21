# Architecture Decision Records

Short records of decisions that shape the system. Each one is immutable once accepted. To change a decision, add a new ADR that supersedes the old one.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-design-first-sequencing.md) | Design-first sequencing | Accepted |
| [0002](0002-bun-monorepo-multiple-apps.md) | Bun monorepo with multiple apps | Accepted |
| [0003](0003-server-runtime-custom-entry.md) | Server runtime: custom Node entry hosting Next.js + Hono | Accepted |
| [0004](0004-sqlite-drizzle.md) | SQLite + Drizzle for server data | Accepted |
| [0005](0005-in-process-torrent-engine.md) | In-process TypeScript torrent engine | Accepted; amended by 0037 |
| [0006](0006-public-api-openapi-sdk.md) | Public API: Hono + OpenAPI, typed SDK | Accepted |
| [0007](0007-signed-independent-catalogs.md) | Signed catalogs released independently of apps | Accepted |
| [0008](0008-clients-react-everywhere.md) | Clients: React everywhere | Accepted |
| [0009](0009-license-agpl.md) | License: AGPL-3.0-only | Accepted |
| [0010](0010-optional-highsea-cloud.md) | Optional highsea cloud | Accepted |
| [0011](0011-no-compatibility-apis.md) | No compatibility APIs | Accepted |
| [0012](0012-unified-media-item-model.md) | Unified media item model | Accepted |
| [0013](0013-brand-direction-abyss-neutral.md) | Brand direction: Abyss Neutral (Bone) | Accepted |
| [0014](0014-universal-media-pages.md) | One media page per title, whatever its library state | Accepted; amended 2026-10-20 |
| [0015](0015-tv-hero-binds-featured-row.md) | The TV hero binds only the featured row | Accepted |
| [0016](0016-gentler-poster-lift.md) | A gentler poster lift | Accepted |
| [0017](0017-web-home-full-bleed-hero.md) | The web home uses a full-bleed hero | Accepted |
| [0018](0018-admin-data-through-the-api.md) | The admin UI reads and writes through the public API | Accepted |
| [0019](0019-database-driver-seam.md) | One schema, two SQLite drivers | Accepted |
| [0020](0020-discovery-port.md) | LAN discovery on UDP 7368, plus mDNS | Accepted |
| [0021](0021-i18n-message-catalogs.md) | Strings live in typed message catalogs | Accepted |
| [0022](0022-job-queue.md) | A SQLite job queue, at least once | Accepted |
| [0023](0023-accounts-sessions-devices.md) | Every sign-in is a device | Accepted; amended 2026-10-20 |
| [0024](0024-two-step-passkeys-and-tvs.md) | Two-step verification and passkeys never reach the TV | Accepted; amended 2026-10-20 |
| [0025](0025-single-sign-on-and-proxy-auth.md) | Single sign-on by OIDC, and forward-auth proxy headers | Accepted |
| [0026](0026-network-tls.md) | Plain HTTP always, built-in TLS beside it | Accepted |
| [0027](0027-preferences-in-layers.md) | Preferences in layers, on the server | Accepted |
| [0028](0028-files-the-owner-uploads.md) | Files the owner uploads: in the database, checked by their bytes | Accepted |
| [0029](0029-external-services.md) | External services: one injected fetch, recorded responses | Accepted |
| [0030](0030-metadata-cache.md) | The metadata cache: TMDB’s responses beside the library, under six months | Accepted |
| [0031](0031-quality-and-the-decision-engine.md) | Quality and the decision engine: Radarr's documented behaviour, written fresh | Accepted |
| [0032](0032-administrative-and-normal-access.md) | Administrative and normal access: Owner, Admin, User | Accepted |
| [0033](0033-indexer-definitions.md) | Indexer definitions: highsea's own declarative format, written by us | Accepted; amended 2026-10-20 |
| [0034](0034-catalog-service-and-signing.md) | The catalog service and signing | Accepted |
| [0035](0035-indexer-health-and-search.md) | Indexer health, rate limits and search fan-out | Accepted |
| [0036](0036-domain-packages-with-subpath-exports.md) | Domain packages with a subpath export per kind | Accepted |
| [0037](0037-the-torrent-engine-as-built.md) | The torrent engine as built: our session layer, one socket factory | Accepted |
| [0038](0038-downloads.md) | Downloads: grabbing, the queue, protection and seeding | Accepted |
| [0039](0039-importing.md) | Importing: an idempotent pipeline with Radarr's naming | Accepted |
| [0040](0040-test-media.md) | Test media generated with ffmpeg, and a local swarm | Accepted |
| [0042](0042-vpn-connections.md) | VPN connections: one binding, four modes | Accepted |

Template: copy [`template.md`](template.md).
