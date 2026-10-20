# 0022. A SQLite job queue, at least once

- **Status:** Accepted
- **Date:** 2026-10-19

## Context
Most of the server's work happens in the background: refreshes, searches, imports, subtitle sync, backups. The roadmap asks for a SQLite-backed scheduler and queue with intervals, concurrency, retries and history, which survives restarts.

## Decision
- `@highsea/jobs` keeps jobs in SQLite. A job type is declared once: a name, a zod payload schema, a concurrency limit, a retry policy (attempts and backoff) and an optional timeout.
- **Delivery is at least once.** A job running when the process stops is retried on the next boot, if it has attempts left, or marked failed as interrupted. Handlers must be idempotent.
- **Deduplication:** a job may carry a key. A second job with the same key isn't queued while one is waiting.
- **Recurring jobs** are schedules (an interval and the next run), and enqueue a job when due.
- The queue is driven by `tick()`. The runtime ticks it every second; tests tick it by hand on a fake clock, so the pipeline can run at any speed.
- Each run is recorded with its outcome and duration for System › Tasks, and changes are announced on the `jobs.updated` topic.

## Consequences
- No external queue or Redis: one container, one file.
- Long jobs report progress through the event bus, not the job row.
