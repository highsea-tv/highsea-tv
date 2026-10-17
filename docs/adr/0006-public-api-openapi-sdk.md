# 0006. Public API: Hono + OpenAPI, typed SDK

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Several first-party clients, and eventually third parties, consume the server. Admin capabilities must also be reachable outside the web admin UI.

## Decision
- `@highsea/api-contract` defines routes and schemas with zod and `@hono/zod-openapi`. The server serves `/api/v1/openapi.json` and docs at `/api/docs`.
- `@highsea/sdk` is the typed client used by every app. It includes `ServerConnection`: LAN and remote candidate selection, failover, and per-server tokens.
- Realtime uses SSE at `/api/v1/events` now and adds WebSockets with playback.
- Domain services hold the logic. API handlers and admin Server Actions are thin adapters over them.

## Consequences
- Every feature ships with an API. The admin UI never has capabilities that are unreachable via the API.
