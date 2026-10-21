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
- `system.backups()`, `system.backupNow()`, `system.restore(id)`; `system.updates()`.
- `catalog.status()` and `catalog.check()` for About's Indexer catalog (checkpoint 5); `system.server().catalogVersion` for the Status strip.
- Health checks from checkpoint 5: source **Catalog** (a failed check, keeping the installed version) and **Indexers** (none enabled, a warning; failing, an error; needs attention or a definition gone, a warning). Backing off isn't a health issue; A9 shows it.
- Health checks from checkpoint 6a: source **Downloads** ("The torrent client can't accept connections: {problem}", an error; "{release} couldn't be imported: {reason}" for each blocked import, a warning) and **VPN** ("The VPN is down. Torrents are stopped until it's back.", an error; "The VPN couldn't connect: {reason}", an error; "VPN: {title}. Open Settings › VPN to see why." for each failing check). `system.healthChecks()` → `GET /api/v1/system/health` lists them.
- Tasks from checkpoint 6a, for the Tasks tab when it comes: the downloads' stall check every 5 minutes (`downloads.stall`), and the import, the replacement of a refused or stalled release and letting go after seeding as jobs on demand ([ADR 0038](../adr/0038-downloads.md)).
- Events used: `jobs.updated`, `health.updated`, `history.updated`, `catalog.updated`, and since checkpoint 6a `queue.updated` and `vpn.updated`.

## Decisions

- **Events is the raw stream,** for owners chasing why an app didn't update. The rest of the admin shows its effects, never the stream.
- **Restore is on System, the schedule on Settings:** acting on the server versus configuring it.
- **No in-app update in Docker:** the page says to pull the image, since the container can't replace itself.

## Open questions

- **Log retention and export:** how many days, and a support bundle (logs, versions, settings without secrets) in one download?
- **Resource history:** sparklines for CPU, memory and disk over a day, or leave that to Prometheus?
