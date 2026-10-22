# @highsea-tv/jobs

The background job queue ([ADR 0022](../../docs/adr/0022-job-queue.md)): SQLite-backed, at least once. Declare a type with `defineJob` (zod payload, concurrency, attempts, backoff, timeout), `enqueue` it (optionally with a dedupe key), or `schedule` it on an interval. `tick()` starts what's due; the runtime ticks every second, tests tick by hand on a fake clock. On boot, `recover()` retries jobs a crash interrupted.
