# @highsea/db

SQLite in WAL mode through Drizzle, on `bun:sqlite` under Bun (tests) and `better-sqlite3` under Node (the server), on one schema ([ADR 0019](../../docs/adr/0019-database-driver-seam.md)).

- **Schema:** `src/schema/`, one module per area. It grows a checkpoint at a time.
- **Migrations:** change the schema, then `bun run generate`: drizzle-kit writes SQL to `drizzle/`, and `src/migrations.ts` embeds it. A test fails when the embed is stale.
- **Migrating** applies pending migrations in order, each in a transaction, after copying an existing database to `/config/backups/` with `VACUUM INTO`.
