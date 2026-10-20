# @highsea/server

The highsea server: the admin UI (Next.js), the public API (Hono, under `/api`) and the background runtime, in one Node process ([ADR 0003](../../docs/adr/0003-server-runtime-custom-entry.md)). The plan is [phase-3-server.md](../../docs/plans/phase-3-server.md); the screens follow the signed-off [prototypes](../../design/prototypes/README.md).

## Run it

```sh
bun run server                                # from the repo root: development, on http://localhost:3000
cd apps/server && bun run build && bun run start   # production
docker compose up --build                     # the container, from the repo root
```

Development keeps its database and files in `.dev/` at the repo root. The API's reference is at `/api/docs`, and its OpenAPI document at `/api/v1/openapi.json` (checked in as [`openapi.json`](openapi.json); `bun run openapi` regenerates it, and a test fails when it's stale).

## How it's put together

| Path | What it is |
| --- | --- |
| `server.ts` | The entry: boots `@highsea/runtime`, then serves `/api` (Hono) and everything else (Next) on one port; SIGTERM shuts down in order |
| `src/http.ts` | The router between Hono and Next; `/stream` and `/ws` are reserved for playback |
| `src/api/` | The API: thin handlers implementing `@highsea/api-contract` over the runtime's services, and the SSE event stream |
| `app/`, `src/admin/` | The admin UI. It reads and writes through the API with `@highsea/sdk/react`, never Server Actions ([ADR 0018](../../docs/adr/0018-admin-data-through-the-api.md)). ui-web marks its client modules with `"use client"`, so server components can import it |
| `scripts/smoke.ts` | The platform under Node (`node scripts/smoke.ts`); CI runs it after the Bun tests |

## Environment

| Variable | Default | |
| --- | --- | --- |
| `HIGHSEA_CONFIG_DIR` | `/config` | Database, `secret.key`, backups |
| `HIGHSEA_DATA_DIR` | `/data` | The media root |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | |
| `HIGHSEA_DISCOVERY_PORT` | `7368` | LAN discovery, UDP ([ADR 0020](../../docs/adr/0020-discovery-port.md)) |
| `HIGHSEA_PUBLIC_URL` | | The address people use from outside |
| `HIGHSEA_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `HIGHSEA_TMDB_REPLAY` | | `1` answers TMDB from the recordings in `packages/metadata/test/fixtures/tmdb` (any key but one starting `invalid` works): development and the sweeps without a key or the network. `HIGHSEA_TMDB_REPLAY=1 bun run server` |
| `PUID`, `PGID` | `1000` | Docker: the user that owns `/config` and `/data` |

Behind a TLS-inspecting proxy, build the image with its CA as a secret: `docker build --secret id=ca,src=/path/to/ca.crt .`
