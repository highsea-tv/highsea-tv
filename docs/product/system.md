# System

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `#/admin/system` and `#/admin/system/{health|tasks|logs|events|backups|updates}` (A16, reference fidelity).
- **Roadmap:** [Phase 2 › A16](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes) (`/system`). Health appears only here and on the sidebar's server card ([admin.md](../design-language/platforms/admin.md)).

## Purpose

What the server is doing and how it's holding up: its version and resources, its health checks, its scheduled tasks, the log, the live event stream, backups and updates.

## Entry points

- Sidebar › **System** (owners and admins); the sidebar's server card; the palette ("logs", "health", "backups", "restore").
- The **Backups** tab is the owner's alone ([ADR 0032](../adr/0032-administrative-and-normal-access.md)): an admin doesn't see it, and `/system/backups` opens Status for them.

## Layout

Page header "System", "What the server is doing, and how it's holding up." Line tabs, each with its own address; **Health** carries a count of warnings and errors.

- **Status:** a stat strip (version, up for, apps connected, catalog version); Resources (CPU, memory, as bars); Addresses (on the LAN, remote, with a link to Network and remote access); Disks (each with free of total, a bar, and what uses it: movies, downloads, other).
- **Health:** "highsea checks itself every 5 minutes…" and **Check now**; each check with its level (OK, Notice, Warning, Error), its source, since when, and the message.
- **Tasks:** a table: the task, its state (Running with progress, Idle, Queued, Failed), how often, last run, next run, **Run now**.
- **Logs:** Show (Everything, Info and up, Warnings and errors, Errors), a search, **Download logs**; then the lines: time, level, source, message (mono).
- **Events:** "What the server tells every connected app, live." Each event as it arrives (type, item), newest first.
- **Backups:** what's in a backup (and isn't), a link to the schedule, **Back up now**; a table of backups (when, kind: Scheduled, Made by hand, Before an update; size) with **Download** and **Restore**.
- **Updates:** the channel, "highsea 1.0.1 is out. You have 1.0.0.", the notes, **Update and restart**, **Update settings**, and the Docker note.
- **About** (checkpoint 4; the prototype has none): "This server, and the services whose data it shows." The server's name and version, then **Data from**: TMDB's logo, linked to themoviedb.org, and its notice in its terms' wording, "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." TMDB's terms ask for both in an About or Credits section. Until the rest of System arrives (checkpoint 8), the page is About and a line saying the rest comes later. Checkpoint 5 adds **Indexer catalog** to About: the installed version, the last check (when, and its message if it failed) and **Check now**, until Updates arrives to hold it.
- **Health, before the tabs** (checkpoint 6a, 2026-10-20): the prototype's Health list as a group above About, "What needs your attention: downloads, indexers, the catalog and the network.", each check with its level badge, source, since when and message, live over `queue.updated`, `vpn.updated`, `indexers` health and settings changes. Its **Check now** waits for Tasks (checkpoint 8), which runs the check; the prototype's rate graph is the dashboard's Network widget. The tabs and the rest of System stay checkpoint 8's.
- **The tabs, as built in 8a** (2026-10-21): System has line tabs, each at its own address, as the prototype has them. 8a builds two; Status, Logs, Events, Backups and Updates come with 8b and aren't shown until then.
  - **Health** is the first tab while Status doesn't exist. It is at `/system` and `/system/health`, with About and its Indexer catalog below the list. Its count is the number of warnings and errors.
  - **Tasks** (`/system/tasks`) has the prototype's table with Run now on every row. Each task is named in i18n by its job type ("RSS sync", "Search for wanted movies", "Import lists" and the rest), falling back to the type.
  - **What real data changed in Tasks:**
    - The API's tasks carry no progress, so Running is a badge, not a bar.
    - Every listed task has a schedule, so the prototype's "When needed" never shows.
    - A task that's switched off says "Off" under Next run.
    - A failed task shows its last error under the badge.
    - Run now is disabled while the task is queued as well as running.
- **The rest of the tabs, as built in 8b** (2026-10-21): all seven tabs are shown. **Status** is the first, at `/system`; Health moves to `/system/health`.
  - **Status:** the prototype's stat strip, Resources, Addresses and Disks.
    - CPU reads "across every core", because the status doesn't give a core count, and a caption gives highsea's own share of CPU and memory.
    - A disk with no root folder on it shows an empty "used by" line.
    - The tab refetches every 10 seconds, because CPU and memory have no event.
    - **About** and its Indexer catalog move to the bottom of Status, so TMDB's notice stays on System's first page.
  - **Health:** the list as before, without **Check now**: the checks run on their own, and there's no health job to run.
  - **Logs:**
    - Show filters by level on the server, and the search filters the 1,000 lines that come back.
    - **Download logs** has every day still on disk, and a caption says so.
    - **Crash reports** are listed below the log, each with **Download report**. When they're off, a line links to General › Diagnostics.
  - **Events:** each event's topic and ids with a clock time, newest first, because the stream carries nothing else.
  - **Backups** (the owner's):
    - The table gains a Version column and **Delete**.
    - A backup that can't be read, or comes from a newer highsea, says why, and its **Restore** is disabled.
    - A caption gives the next scheduled run.
    - The restore dialog adds that the current state is backed up first. After **Restore and restart**, the tab shows that the server is restarting, checks `/api/health` every 1.5 seconds and reloads once it answers again.
  - **Updates:** the current and latest version, the release date, a link to the notes and when highsea last checked. The Docker note replaces **Update and restart**, and **Check now** runs the catalog's check, since releases come with the catalog.
  - **An admin at `/system/backups`** gets not found from the server, as Settings' owner-only areas do. The screen falls back to Status, as the prototype does.

## States

- **Healthy:** "Everything's healthy" · Nothing needs your attention.
- **Logs with nothing matching:** "Nothing matches."
- **Events before any arrive:** "Listening… Events appear here as the server sends them."
- **Loading / error:** as every admin page.
- **Reference fidelity:** Download logs, Download (backup) and Update and restart are not in the prototype.

## Interactions

- **Run now** starts a scheduled task on the next tick; the table, the status bar and Events follow it live.
- **Restore** asks first: "Harbor restarts on it: settings, users and history go back to that moment, and anything since is lost. Media files aren't touched. Apps reconnect on their own." · **Restore and restart**.
- **Back up now** adds a backup to the top of the list.

## Data

- `system.publicInfo()` → `GET /api/v1/system/info/public`, for About: the server's `name` and `version`, and `attributions`, each provider's `{ name, notice, url }` (TMDB's, `TMDB_ATTRIBUTION`). The clients read the same list for their own About.
- `system.status()`, `system.server()`, `system.health()`, `system.jobs()`, `system.runJob(id)` → `POST /api/v1/system/tasks/{id}/run`.
- `system.logs()` → `GET /api/v1/system/logs` (`LogEntry[]`); the product streams new lines.
- The Events tab is the client's own event subscription (SSE, `/api/v1/events`).
- **Backups** (8b, the owner's; [ADR 0047](../adr/0047-operations.md)): `system.backups()` → `GET /api/v1/system/backups`, each backup's id, kind (`scheduled`, `manual`, `before-update`, `before-restore`), size in bytes, the highsea version that made it, its newest migration (`schema`), when, and a `problem` when it can't be restored. `system.backupNow()` → `POST`. `system.downloadBackup(id)` → `GET …/{id}/download`, `system.deleteBackup(id)` → `DELETE …/{id}`, `system.restore(id)` → `POST …/{id}/restore`, which answers 202, or 409 for a newer schema or an unreadable file. Event: `backups.updated`.
- **Logs** (8b, staff): `system.logs({ level, search, limit })` → `GET /api/v1/system/logs`, the newest lines from the in-memory buffer; `system.downloadLogs()` → `GET /api/v1/system/logs/download`, every line in the files on disk as JSON lines, oldest first. New lines arrive on `logs.appended` (owner and admins only, at most once a second). Log files are in `/config/logs/`, a file a day, kept 14 days (`logs.prune`).
- **Crash reports** (8b, staff): `system.crashes()` → `GET /api/v1/system/crashes`, and `system.crash(id)` → `GET …/crashes/{id}`, a report's JSON. They're written to the config folder when General › Diagnostics turns them on, and never sent anywhere.
- **Updates** (8b, staff): `system.updates()` → `GET /api/v1/system/updates`, the current and latest release on the update channel from the signed catalog's `releases` list, with its notes; event `updates.available`.
- **Status** (8b) grows uptime, apps connected, the catalog version, the addresses, CPU and memory (the server's and highsea's), and each disk's `usedBy`.
- **`/metrics`** (8b): Prometheus's text format, 404 while it's off in General › Diagnostics, then a staff member's read-scoped API key as a bearer token.
- Tasks from checkpoint 8b: `backups.scheduled` (the owner's schedule), `logs.prune` and `notifications.prune` (daily).
- `catalog.status()` and `catalog.check()` for About's Indexer catalog (checkpoint 5); `system.server().catalogVersion` for the Status strip.
- Health checks from checkpoint 5: source **Catalog** (a failed check, keeping the installed version) and **Indexers** (none enabled, a warning; failing, an error; needs attention or a definition gone, a warning). Backing off isn't a health issue; A9 shows it.
- Health checks from checkpoint 6a: source **Downloads** ("The torrent client can't accept connections: {problem}", an error; "{release} couldn't be imported: {reason}" for each blocked import, a warning) and **VPN** ("The VPN is down. Torrents are stopped until it's back.", an error; "The VPN couldn't connect: {reason}", an error; "VPN: {title}. Open Settings › VPN to see why." for each failing check). `system.healthChecks()` → `GET /api/v1/system/health` lists them.
- `system.tasks()` → `GET /api/v1/system/tasks` (staff): `{ id, state, interval, lastRun, nextRun, lastError }` per scheduled job, the interval in seconds. `system.runTask(id)` → `POST /api/v1/system/tasks/{id}/run`; an unknown id is 404 (8a). Events: `jobs.updated`.
- Tasks from checkpoint 8a: RSS sync every 15 minutes (`indexers.rss`), the wanted sweep every 6 hours (`movies.wanted`) and the import lists every 6 hours (`lists.sync`), plus `movies.search` on demand ([ADR 0045](../adr/0045-automation.md)).
- Tasks from checkpoint 6a: the downloads' stall check every 5 minutes (`downloads.stall`), and the import, the replacement of a refused or stalled release and letting go after seeding as jobs on demand ([ADR 0038](../adr/0038-downloads.md)). From 6b, the IP blocklist's daily update (`downloads.ip-blocklist`), also run when its setting changes ([ADR 0037](../adr/0037-the-torrent-engine-as-built.md)); a list that can't be updated is a warning in the health list with the source "Downloads".
- Tasks from checkpoint 6b: the library scan every 12 hours (`library.scan`, first 10 minutes after boot), also run on a movie's folder after each import and on a folder the watcher saw change; and the existing-library import as a job on demand (`library.import`) ([ADR 0039](../adr/0039-importing.md)).
- Health from checkpoint 6b: **unar isn’t installed** (Import, a warning: archived releases can't be imported until it is), and **{folder} isn’t being watched** (Library, a notice: changes there are found by the 12-hourly scan instead).
- Events used: `jobs.updated`, `health.updated`, `history.updated`, `catalog.updated`, and since checkpoint 6a `queue.updated` and `vpn.updated`.

## Decisions

- **Events is the raw stream,** for owners chasing why an app didn't update. The rest of the admin shows its effects, never the stream.
- **Restore is on System, the schedule on Settings:** acting on the server versus configuring it.
- **No in-app update in Docker:** the page says to pull the image, since the container can't replace itself.

## Open questions

- ~~**Log retention and export:**~~ answered in checkpoint 8: 14 days, a file a day, and Download logs gives every line on disk. A support bundle is left for later.
- **Resource history:** sparklines for CPU, memory and disk over a day, or leave that to Prometheus?
