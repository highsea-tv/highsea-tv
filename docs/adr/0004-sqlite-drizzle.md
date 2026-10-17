# 0004. SQLite + Drizzle for server data

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
This is a self-hosted, single-container app that should need zero database operations work. Large libraries (100k+ items) must still perform well.

## Decision
- SQLite in WAL mode at `/config/highsea.db`, accessed via `better-sqlite3` and Drizzle ORM. Migrations are generated with drizzle-kit and run on boot, with a backup taken first.
- Secrets (API keys, cookies, provider credentials) are encrypted at rest with a key generated on first boot at `/config/secret.key`.
- FTS5 provides library search later.

## Consequences
- No external database container.
- Write concurrency is limited to one writer, which is acceptable for this workload. Hot paths batch their writes.
