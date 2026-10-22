# 0047. The owner's tools: backups and restore, the log, crash reports, updates and /metrics

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
Checkpoint 8b gives the owner the tools for running a server ([the plan](../plans/phase-3-checkpoint-8.md), [system.md](../product/system.md), [settings.md](../product/settings.md)):
- backups they can download and restore;
- a log they can read, filter and attach to an issue;
- crash reports that never leave the server;
- word of a new version;
- metrics for Prometheus;
- a status page that says what uses the disks.

highsea is one Node process with one SQLite database and a `/config` folder (ADR 0003, 0019). The plan says the runtime grows to hold these, since each one reads across the domain packages.

## Decision
- **Where:** the runtime, one module each: `backups.ts`, `zip.ts`, `logs.ts`, `crashes.ts`, `metrics.ts` and `operations.ts`, which joins them as `runtime.operations`. Their settings are three rows in `settings`: `general`, `backups` and `metrics`.

### Backups
- **What's in one:** a zip of the database and a manifest (`manifest.json`).
  - **The database:** SQLite's `VACUUM INTO`, which writes a consistent copy of a live database without stopping writers ([SQLite: VACUUM](https://sqlite.org/lang_vacuum.html#vacuuminto)).
  - **The manifest:** the format, the highsea version, the kind, when, the schedule's slot, every migration the database has, and the database's size and SHA-256.
  - **Never `secret.key`.** A backup holds the encrypted secrets (ADR 0023) without the key that opens them, so a leaked backup doesn't give them away. Restoring on the same server works. Restoring on another means entering the secrets again.
- **No backups table.** The folder and each zip's manifest are the source of truth. A backup copied in by hand is listed, and one deleted by hand is gone. The listing reads each manifest once, cached by size and modification time.
- **Kinds:**
  - `scheduled`;
  - `manual`;
  - `before-update`: the migration's own copy of the database (checkpoint 1's pre-migration backup), now zipped with a manifest of the migrations it had;
  - `before-restore`: what was there before a restore.
- **Retention:** `keep` counts scheduled backups only. The others stay until the owner deletes them.
- **The schedule:**
  - Daily or weekly (with a weekday), at a local time, in General's time zone. Off is a choice too.
  - Each run is a `backups.scheduled` job named by its slot (`2026-10-25T03:30`, local). A run repeated for the same slot makes nothing (ADR 0022). Each run queues the next.
  - Slots are worked out with `Intl.DateTimeFormat`, so a change of clocks moves the instant, not the local time.
- **The zip:** a short writer and reader of our own (`zip.ts`) to the PKWARE APPNOTE ([APPNOTE 6.3.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)), not a dependency.
  - **The writer:**
    - stores the manifest (method 0) and deflates the database with Node's `zlib` (method 8, [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951));
    - streams it with a data descriptor (flag bit 3), checking each entry with `zlib.crc32` ([Node: zlib.crc32](https://nodejs.org/api/zlib.html#zlibcrc32data-value));
    - names entries in UTF-8 (bit 11).
  - **No ZIP64:** archives over 4 GiB are refused.
  - **The reader:**
    - reads the central directory;
    - checks the CRC and size of what it extracts;
    - refuses anything else.
  - **Why our own:** a backup is two entries, so the subset of the format it needs is small and fully specified by the APPNOTE. A dependency would bring features we don't use, and each dependency needs pinning and a licence check.
  - **Checked:** the tests read back what the writer wrote, and inflate its data with a standard raw inflater. A written backup also passes Info-ZIP's `unzip -t`, checked by hand.

### Restore
- **The request:**
  - A backup from a newer highsea (a migration this one doesn't know) is refused, with reason `newer-schema`. A damaged one is refused as `unreadable`.
  - Otherwise highsea makes a `before-restore` backup, writes `restore.json` to the config folder, and asks for a restart.
- **The restart:**
  - The server stops as on SIGTERM and exits with code 75 (`EX_TEMPFAIL`, [sysexits.h](https://man.freebsd.org/cgi/man.cgi?query=sysexits)).
  - Docker's `unless-stopped` and `on-failure` policies both start it again ([Docker: restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/)). `compose.yaml` uses `unless-stopped`.
- **At the next boot:**
  1. The backup is extracted beside the database and its SHA-256 checked.
  2. The current database (with its `-wal` and `-shm`) moves aside, and the backup's takes its place.
  3. The boot migrates it as it would any older database.
  4. **If the boot fails,** the database set aside goes back and `restore-failed.json` records why. System › Health shows it once, as an error.

### The log
- **On disk:**
  - The logger gains a file sink: JSON lines in `<config>/logs/`, one file a UTC day (`highsea-2026-10-21.jsonl`).
  - `logs.prune` runs daily and deletes files over 14 days old.
- **The level** is General's and changes at once: the logger reads it from a getter for every entry, children included.
- **Reading it:**
  - `GET /system/logs` reads the 2,000 lines kept in memory, newest first, by level and a search over the source, the message and the fields.
  - `/system/logs/download` streams the files as one JSON-lines download.
  - `logs.appended` tells System › Logs there's more, at most once a second, and only the owner and admins hear it (`STAFF_TOPICS`).

### Crash reports
- **When:** written only when General's switch is on (the owner's answer 12), to `<config>/crashes/`.
- **What triggers one:**
  - Node's `uncaughtExceptionMonitor`, which leaves Node's own handling in place ([Node: process events](https://nodejs.org/api/process.html#event-uncaughtexceptionmonitor));
  - an API request that fails with a 500.
- **What's in it:** the error and its stack, the version, Node and the platform, and the last 50 log lines without their fields, so nothing personal goes in.
- **Nothing is sent anywhere.** The owner downloads a report to attach to an issue.

### Updates
- **Where they come from:** the signed catalog (ADR 0034) gains an optional `releases` list, written by the catalog pipeline from `releases.json` and signed with the rest. Each release has:
  - a version;
  - a channel (`stable` or `beta`);
  - a date;
  - notes;
  - optionally, a URL.
- **No separate request:** highsea already checks the catalog daily, so news of a version costs nothing extra and is as trustworthy as the indexer definitions.
- **The channel:**
  - Beta servers see stable releases too.
  - Versions are compared by SemVer § 11 precedence ([SemVer 2.0.0](https://semver.org/#spec-item-11)).
- **Announcing:** a newer version is announced once (`updates.available`, ids its version) for 8b's notifications.
- **Installing stays Docker's job:** highsea says there's an update and doesn't install it.

### /metrics
- **The format:**
  - Prometheus's text format 0.0.4 ([exposition formats](https://prometheus.io/docs/instrumenting/exposition_formats/)), from a small registry of our own, so no dependency.
  - Names follow Prometheus's practice ([naming](https://prometheus.io/docs/practices/naming/)): a `highsea_` prefix and base units.
  - The process and Node families use the client libraries' standard names, so existing dashboards read them: `process_cpu_seconds_total`, `process_resident_memory_bytes` and `nodejs_eventloop_lag_p99_seconds`.
- **What it reports:**
  - the process;
  - HTTP requests and their durations, by method, the contract's route template (never an id) and status;
  - jobs, by status, and job runs since start;
  - downloads, by state, the transfer rates and the torrents' bytes;
  - each indexer's queries, failures and grabs over the last 24 hours, read from `indexer_stats`, which keeps hours, not totals;
  - the movies, their files and their size.
- **When it's computed:** everything but the HTTP families is read when Prometheus scrapes, so a server nobody scrapes does no work for it.
- **Access:**
  - Off by default, and 404 while off.
  - On, it takes an API key held by the owner or an admin as a bearer token; a read-only key is enough. Device tokens and cookies are refused.
  - `/metrics` sits outside `/api` because that's where Prometheus looks by default ([scrape config](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config)).

### Status
`GET /system/status` gains:
- uptime;
- apps connected;
- the catalog's version;
- the addresses;
- CPU and memory as the last minute's average, from six samples ten seconds apart, with highsea's own share;
- each disk with what uses it: movies (from the library's file sizes), downloads (the torrents' bytes) and other.

### Settings
| Row | Fields | Read | Change |
| --- | --- | --- | --- |
| `general` | language, time zone (IANA, defaults to the host's), update channel, log level, crash reports | staff | owner |
| `backups` | schedule, time, weekday, keep, folder (absolute and writable, checked on save) | owner (ADR 0032) | owner |
| `metrics` | on or off | staff | owner |

Each change emits `settings.updated`.

## Consequences
- The owner can back up, restore and move a server without a shell, and a failed restore leaves the server as it was.
- A backup restored on another machine needs its secrets entered again, by design.
- Backups over 4 GiB of database are refused until ZIP64 is needed. That is far beyond a 100,000-film library's database.
- The catalog's signing key now also vouches for release news. A release's URL is shown, never followed by the server.
- The log on disk can hold personal data at debug level. It stays in `/config`, and crash reports leave the fields out.
