# Phase 3, checkpoint 8: automation, owner tools and the rest

- **Status:** Scoped on 2026-10-21, before building. The owner answered the [open questions](#open-questions-for-the-owner) the same day ([the answers](#the-owners-answers)): every recommendation is taken except question 7, and media-server refresh is out (the parent plan's decision 7). 8a (automation and Wanted) and 8b (notifications and the owner's tools, with the email design the owner approved during its review) were built and signed off on 2026-10-21, and 8c (curation and the rest) the same day, so checkpoint 8 is signed off. Smart collections, asked for at 8c's review, are scoped in [smart-collections.md](smart-collections.md).
- **Gate:** stop when each part is built (8a, 8b, 8c; [question 1](#open-questions-for-the-owner)). Report what was built, the judgement calls, the API added, screenshots and the check results, then ask for review. Checkpoint 9 (release and sign-off) starts only after sign-off.
- **Parent plan:** [phase-3-server.md](phase-3-server.md). Its standing rules, architecture and decisions all apply, including decision 1 (every [M1] item stays in milestone 1), decision 5 (nothing is published until the owner says so) and decision 6 (the admin is for the owner and admins only). This document settles what that plan's checkpoint 8 item, the roadmap and the specs leave open, and gathers what earlier checkpoints deferred to this one.

## Read first

- [wanted.md](../product/wanted.md): A14, Missing, Cutoff unmet and Calendar, its decisions and open questions.
- [curation.md](../product/curation.md) and [client-home.md](../product/client-home.md): A11, announcements, featured sections, the live preview, and what a client's home is made of.
- [settings.md](../product/settings.md): A15's area table, with what checkpoints 4 to 7 built, and the areas still marked later (General's Region, Updates and Diagnostics; Network; Security; Backups; Import lists; Connections; the profile, format and size editors).
- [system.md](../product/system.md): A16's tabs (Status, Health, Tasks, Logs, Events, Backups, Updates) and the About and Health groups built so far.
- [users-devices.md](../product/users-devices.md): invites and password resets, which show a link to copy until the server can send email.
- [dashboard.md](../product/dashboard.md): the Announcement widget, the last widget without data.
- The roadmap: the movie pipeline's steps 5 and 6 (automation; notifications, without the media-server refresh, [answer 7](#the-owners-answers)), [M1] Import lists, Calendar, Health checks, Backups and restore, Media management extras (delay profiles, tags), Notifications breadth and Observability.
- The deferrals this checkpoint inherits:
  - checkpoint 4: the profile and format editors, prototyped and approved first ([phase-3-checkpoint-4.md](phase-3-checkpoint-4.md));
  - checkpoint 5: scheduling RSS, whose definition kind and feed reader exist ([phase-3-checkpoint-5.md](phase-3-checkpoint-5.md));
  - checkpoint 6: scheduling the search behind Grab, Find another and the stall's re-search; System › Tasks; filters over tags ([phase-3-checkpoint-6.md](phase-3-checkpoint-6.md));
  - checkpoint 7: language-profile defaults per root folder, and notifications on subtitle events ([phase-3-checkpoint-7.md](phase-3-checkpoint-7.md)).
- [ADR 0019](../adr/0019-database-driver-seam.md) (`VACUUM INTO`), [ADR 0022](../adr/0022-job-queue.md) (idempotent jobs), [ADR 0028](../adr/0028-files-the-owner-uploads.md) (the home layout), [ADR 0029](../adr/0029-external-services.md) (the fetch seam and recordings), [ADR 0031](../adr/0031-quality-and-the-decision-engine.md) (upgrades and the cutoff), [ADR 0032](../adr/0032-administrative-and-normal-access.md) (owner-only areas), [ADR 0034](../adr/0034-catalog-service-and-signing.md) (the catalog's channels), [ADR 0038](../adr/0038-downloads.md) (the blocklist and replacements).
- The prototype: `admin/wanted/wanted.tsx` (A14), `admin/curation/` (A11 and its preview), `admin/settings/reference.tsx` (General, Network, Security, Backups, Import lists, Connections and the rest), `admin/system/system.tsx` (A16), and the mock server's `curation`, `announcements`, `home`, `settings` and `system` namespaces with their types in `mock/types.ts` and `mock/settings.ts`.

## Goal

highsea runs the library on its own. New releases are caught from the indexers' feeds every 15 minutes; a monitored movie without a file is searched for, and one under its profile's cutoff is upgraded when something better appears. A list on Trakt or TMDB adds its movies. The owner sees what's missing and what's coming on Wanted, and subscribes to the calendar from their phone. When a movie is grabbed or imported, or the server needs attention, highsea tells them where they already look: Discord, ntfy, email or the browser. The owner writes an announcement for everyone on a TV and features a row of films on every home screen, and sees it as each person will. System shows what the server is doing, its log, its tasks and its backups, and a backup can be restored. Prometheus can read the numbers.

## Out of scope

- **Clients:** the home and announcement API is built and tested here; the clients that show it are Phase 4. A11's preview renders the client home from the API in the admin's own frame, as the prototype does.
- **Push to phones and TVs** (APNs, FCM): clients are Phase 4. Browser web-push is in ([question 6](#open-questions-for-the-owner)).
- **Requests** (Overseerr-style), Usenet, TV series: [Later].
- **Self-updating outside Docker.** highsea ships as a Docker image (checkpoint 9); the container can't replace itself, and system.md already says to pull the image ([question 11](#open-questions-for-the-owner)).
- **Publishing anything:** release notes, catalog channels and images are checkpoint 9's, and decision 5 holds.
- **The sync engine's left-open list** (checkpoint 7): kept for later iterations, as the owner decided at 7b's sign-off.
- **A plugin system** for notification channels: [Later], as the roadmap says.

## What changed since the roadmap was written

The research for this scope (2026-10-21; each source is cited again where the build uses it) found four things the roadmap and prototype assume and can't have as written:

1. **Letterboxd has no open API.** "Access to the Letterboxd API is available by request only", and it isn't granted for "private or personal projects" ([Letterboxd: API access](https://letterboxd.com/api-beta/)). Its own alternatives are exports and per-profile RSS feeds of a diary, not of lists. Radarr doesn't list Letterboxd among its import lists either ([Servarr wiki: Radarr supported](https://wiki.servarr.com/radarr/supported)) ([question 4](#open-questions-for-the-owner)).
2. **IMDb has no public list API.** Radarr reads IMDb lists through its own proxy service, and users report IMDb now blocks the direct export ([radarr-import-list-guide](https://github.com/tazzuu/radarr-import-list-guide), to be confirmed against IMDb's own pages at build). highsea runs no proxy service ([question 4](#open-questions-for-the-owner)).
3. **Trakt needs a registered application.** Every request carries the application's Client ID in `trakt-api-key` ([Trakt API](https://trakt.docs.apiary.io/)); like OpenSubtitles.com's key in checkpoint 7, highsea needs one of its own, kept as a secret ([question 5](#open-questions-for-the-owner)).
4. **Apprise is a Python program,** not a protocol. highsea can't embed it; it can post to an [Apprise API](https://github.com/caronc/apprise-api) server the owner runs, which is how the prototype's "Apprise" row can work ([question 6](#open-questions-for-the-owner)).

And two things the prototype has no design for: the profile and format editors (deferred by checkpoint 4 until they're prototyped), and language-profile defaults per root folder (checkpoint 7's judgement call 1).

## The size of this checkpoint, and its parts

The largest checkpoint of the phase: four new domains (automation, notifications, curation, operations) and four admin screens, three of which are new routes. [Question 1](#open-questions-for-the-owner) recommends three gated parts, each with its own review; the rest of this document marks each piece **(8a)**, **(8b)** or **(8c)**.

- **8a, automation and Wanted:** RSS sync, missing and cutoff-unmet searches, upgrades, the scheduled re-search, import lists, the calendar and its iCal feed; A14 Wanted; Settings › Import lists; System's **Tasks** tab, since this part adds most of the schedules it lists. The profile and format editors' prototype is drawn and put to the owner during 8a ([question 9](#open-questions-for-the-owner)).
- **8b, notifications and the owner's tools:** the `notifications` package and its channels, email for invites and password resets, Settings › Connections, General (Region, Updates, Diagnostics), Network, Security and Backups; System's Status, Logs, Events, Backups and Updates tabs; backups and restore; observability (`/metrics`, crash reports).
- **8c, curation and the rest:** the `curation` package, announcements and featured sections resolved per person and client, the client home and announcement API over SSE, A11 with its live preview, the dashboard's Announcement widget, the profile, format and size editors once their prototype is approved, delay profiles and tags, and language-profile defaults per root folder.

## Packages

| Package | Holds | Depends on |
| --- | --- | --- |
| `media/movies` (grows, 8a) | The wanted queries (missing, cutoff unmet), the calendar's dates, the search scheduler, upgrades for movies that have a file | as today |
| `indexers` (grows, 8a) | RSS sync: each indexer's feed read on a schedule, its releases parsed once and handed to every interested movie | as today |
| `lists` (new, 8a) | Import lists, one subpath per source (`@highsea-tv/lists/tmdb`, `/trakt`, `/generic`), each behind the fetch seam; a fake in `@highsea-tv/lists/fake` | `core`, `db`, `metadata` |
| `notifications` (new, 8b) | The event catalogue, the channel interface, one adapter per channel, the delivery job with retries, templates in i18n, and fakes on loopback in `@highsea-tv/notifications/fake` | `core`, `db`, `jobs`, `i18n` |
| `curation` (new, 8c) | Announcements, featured sections, rules, the resolver per person and client type, reach | `core`, `db`, `auth`, `media/movies`, `personalization` |
| `runtime` (grows, 8b) | Backups and restore, the metrics registry, crash reports, the event fan-out to `notifications` | as today |

Domain packages with several kinds use subpaths (ADR 0036). `notifications` and `curation` have one kind each and export one subpath named for it, so a TV kind can join later without a breaking import.

## Automation (8a)

### RSS sync

- **Every 15 minutes** (the roadmap; Radarr's default `RssSyncInterval` is also 15 minutes, [Servarr wiki: Radarr settings](https://wiki.servarr.com/radarr/settings)), each enabled indexer that can search is read once for its latest releases: the `rss` kind's feed, or a Torznab or Cardigann indexer's empty search, which their specs define as the newest items ([Torznab spec](https://torznab.github.io/spec-1.3-draft/)).
- **Each release is parsed once,** matched to monitored movies by TMDB or IMDb id when the indexer gives one and by title and year otherwise (the parser), and run through the decision engine for each movie it matches. An approved release is grabbed as **Grab** does today.
- **Seen releases are remembered** per indexer by guid for 14 days, so a feed read twice grabs nothing twice. The job is safe to repeat (ADR 0022).
- **A failing indexer** is throttled by checkpoint 5's health rules and skipped; RSS never retries an indexer the health check has paused.

### Missing and cutoff searches

- **On demand:** **Search** and **Search all** on Wanted queue `movies.search` (exists) for each movie.
- **Scheduled:** Radarr doesn't search the whole backlog on a schedule; RSS catches new releases, and a backlog search is something the owner starts ([Servarr wiki: Radarr FAQ](https://wiki.servarr.com/radarr/faq)). highsea adds a gentle sweep, because an owner who adds a list of 200 films expects them found ([question 3](#open-questions-for-the-owner)): **every 6 hours, the 20 wanted movies searched longest ago**, with each movie's next search pushed back 1, 3, 7, then 14 days after each empty result, so a large backlog is covered in days without hammering indexers.
- **Find another's "highsea will try again on the next search"** (checkpoint 6) becomes true: a replacement that found nothing leaves the movie in the sweep.

### Upgrades

- A movie with a file is **cutoff unmet** when the decision engine's `cutoffSpec` says so (quality under the cutoff, or a custom-format score under the profile's cutoff score; ADR 0031). Only those are searched, by the same sweep and by RSS, and only when the profile allows upgrades.
- **An upgrade grab** goes through the existing `upgradeSpec`; the import already replaces a version's file and moves its subtitles (checkpoint 7's `subtitles.resync`).
- **The blocklist** finally fills the decision engine's `blocklisted` slot (`decision.ts`), so a blocklisted release is refused everywhere, not only by replacements.

### Import lists

- **Sources at launch** ([question 4](#open-questions-for-the-owner)):
  - **TMDB lists**, by list id or link, through the TMDB key highsea already has (ADR 0029). Also TMDB's popular, top-rated, upcoming and now-playing lists, which need nothing more.
  - **Trakt**: a public list by link, trending, popular and anticipated, with highsea's Client ID; the owner's own watchlist and private lists after they connect their account with Trakt's device flow ([Trakt API › Authentication: Devices](https://trakt.docs.apiary.io/)).
  - **A generic list:** a URL returning JSON in the format Radarr calls "StevenLu Custom" (`[{ "title", "imdb_id" }]`), which MDBList and other tools already produce, so IMDb and Letterboxd lists can come through them.
- **Each list** has a name, on or off, a root folder, a quality profile, a language profile, monitored or not, minimum availability, and "search when added". A list never deletes: a movie that leaves a list stays (Radarr's default `ListSyncLevel` is "disabled", and removing on sync is a later option).
- **Checked every 6 hours** (the prototype's copy, "highsea checks each list every 6 hours"), and when saved. A movie already in the library is skipped; an **exclusion** list (Radarr's "import list exclusions") stops a deleted movie coming back: deleting a movie that a list added offers "Don't add it again from lists".
- **IDs:** every source resolves to a TMDB id before adding; one that can't be resolved is counted and named in the list's last result.

### The calendar and its feed

- **Wanted › Calendar** shows each monitored movie's dates in the month ([question 2](#open-questions-for-the-owner) decides which dates), coloured by the key: In the library, Downloading, Wanted.
- **The feed** is `GET /feed/v1/calendar.ics` (wanted.md), an RFC 5545 calendar ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)): one all-day `VEVENT` per movie date, with a stable `UID` (`{tmdbId}-{kind}@{serverId}`) so a calendar app updates rather than duplicates, and `X-WR-CALNAME` for the name. It covers 30 days back and 365 forward.
- **Its key** goes in the address, because calendar apps can't send headers. A read-only key in a URL would read the whole API, so the feed takes a new key **scope, `calendar`**, which opens this feed and nothing else ([question 10](#open-questions-for-the-owner)). Each person can make their own from Wanted's **Subscribe**; the owner sees and revokes them with the other keys on A13.

## Notifications (8b)

### Events

The events a connection can choose, from the prototype's five (grab, import, upgrade, health, update) and the deferrals:

| Event | When | Notes |
| --- | --- | --- |
| Grabbed | A release is sent to the engine | the movie, the release, the indexer, the size |
| Imported | A file lands in the library | its quality; "upgraded from …" when it replaced one |
| Upgraded | The import replaced an older file | separated so an owner can mute first imports |
| Download failed | A download is blocklisted (stalled, refused, failed import) | the reason, and whether a replacement was found |
| Subtitle added | A subtitle is downloaded and synced, or kept unsynced | checkpoint 7's deferral |
| Health | A health check turns warning or error, and when it clears | one message per change, never per check run |
| Update | A new highsea version is available | from the Updates source ([question 11](#open-questions-for-the-owner)) |
| Movie added | By a person or an import list | lists can add many: one message per list run, not per movie |
| Test | **Test** on a connection | |

### Channels

- **At launch** ([question 6](#open-questions-for-the-owner)): Discord, Slack, Telegram, ntfy, Gotify, Pushover, Matrix, Email (SMTP), Webhook, Apprise (through the owner's Apprise API), and Browser (web push).
- **Each adapter** is written from the service's documented API, behind the fetch seam, with recorded fixtures and a fake on loopback for the tests (no network in tests). Email uses Nodemailer (MIT-0, [nodemailer.com](https://nodemailer.com/)); web push uses the Web Push protocol with VAPID ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030), [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)) through `web-push` (checked by `bun run licenses` at build) and a service worker in the admin.
- **Delivery** is a job per message (`notifications.send`, dedupe key `{connectionId}:{eventId}`), retried with backoff on a 429 or 5xx and dropped with a health warning after 24 hours. A rate-limited service (Discord's `Retry-After`) is honoured.
- **Messages** are short, plain and in the server's language, from i18n catalogs, never inline. They follow the brief's voice: "Sintel (2010) is in the library. Bluray-1080p, 1.2 GB." Rich formats (Discord embeds, Slack blocks) carry the poster when the server's external URL is set.
- **Secrets** (tokens, passwords, webhook URLs) are sealed with the server's key (`secret.key`) like every other credential, and shown masked.

### No media-server refresh

- highsea is the media server: it replaces Plex, Jellyfin and Emby rather than feeding them ([answer 7](#the-owners-answers)). It has no connection kinds for them and never calls their APIs.

### Email for people

- With an SMTP connection set as **the server's mail**, invites and password resets on A13 send an email as well as showing the link, which they keep doing for an owner without email (users-devices.md). The emails are plain text with an HTML part, in the recipient's language when it's set, from the templates the owner approved during 8b ([emails.md](../product/emails.md)).

## The owner's tools (8b)

### Settings areas still to build

| Area | What's built |
| --- | --- |
| **General** | Region (language, time zone); Updates (the channel, Stable or Beta; "install on their own" is replaced by the Docker note, [question 11](#open-questions-for-the-owner)); Diagnostics (the log level, and crash reports, [question 12](#open-questions-for-the-owner)). The prototype's "anonymous usage counts" are left out: highsea collects nothing about its owners |
| **Network and remote access** | The API exists (checkpoint 2); the page is built over it: external URL, TLS, trusted proxies, X-Forwarded headers, LAN discovery |
| **Security** | Owner only. Require two-step, passkeys, session length and OIDC are built (checkpoint 2) and get their page; **Hand the server over** is left out until the owner asks (it's "Not in the prototype") |
| **Backups** | Owner only. The schedule (daily, weekly, off), the time, how many to keep, the folder |
| **Import lists** | The lists (8a) |
| **Connections** | Notifications, with **Test**, and **Add a connection** as a dialog per kind ([question 8](#open-questions-for-the-owner)) |

### System

- **Status:** version, uptime, apps connected, catalog version; CPU and memory from `process.cpuUsage()` and `os` over the last minute; addresses; disks and what uses them.
- **Health:** the existing list becomes a tab, with **Check now**, now that Tasks can run the check.
- **Tasks:** every scheduled job from the queue (state, interval, last run and its result, next run) with **Run now**, owner and admins.
- **Logs:** the ring buffer that exists (`memorySink`, 2000 entries) with the level filter and search, and **Download logs**, which streams the JSON-lines file. Logs are written to `/config/logs/`, a file a day, kept 14 days (system.md's open question on retention).
- **Events:** the raw SSE stream, as specified.
- **Backups:** **Back up now**, the table, **Download** and **Restore**, owner only.
- **Updates:** the current and latest version, the notes and the Docker note ([question 11](#open-questions-for-the-owner)).

### Backups and restore

- **A backup** is one `.zip` in `/config/backups/`: the database as `VACUUM INTO` writes it (ADR 0019, consistent while the server runs), a manifest (highsea's version, the schema version, when, the kind), and **not** `secret.key` ([question 13](#open-questions-for-the-owner)). Kinds: Scheduled, Made by hand, Before an update (the migration backup that exists becomes this kind).
- **Restore** asks first ("Restore and restart"), checks the manifest (a backup from a newer schema is refused), writes a marker, and exits so Docker's restart policy brings it back; the boot sees the marker, moves the current database aside, puts the backup's in place and migrates it. If the boot fails, the moved-aside database is put back.
- **Retention:** the schedule's "how many to keep" counts scheduled backups only; ones made by hand stay until deleted.

### Observability

- **Logs** are already structured (`@highsea-tv/core`'s logger, JSON lines). 8b adds the file sink with daily rotation and the level setting.
- **`/metrics`** in Prometheus's text exposition format ([Prometheus: Exposition formats](https://prometheus.io/docs/instrumenting/exposition_formats/)), written by a small registry in `runtime` rather than a dependency: process (CPU, memory, event-loop lag), HTTP requests by route and status, jobs by type and outcome, queue length, downloads (count, rates, bytes), indexers (queries, failures), the library (movies, files, size). It's off until the owner turns it on, and then needs a read-scoped API key as a bearer token, which Prometheus's `authorization` setting sends ([Prometheus: Configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)).
- **Crash reports** ([question 12](#open-questions-for-the-owner)).

## Curation (8c)

- **Announcements** as curation.md decides: title, markdown message, image, a button, severity, placements, audience (everyone, roles, people, apps), schedule, and acknowledgement. Status comes from the schedule; only draft is stored. Reach counts people, not devices.
- **Featured sections:** hero, row or spotlight; titles picked by hand or by a rule (recently added, a genre, a collection, a saved filter); taglines; audience and schedule; order. A rule that matches nothing hides the section.
- **Resolution** happens on the server, per person and client type (the shapes' `ClientType`): `GET /api/v1/home?client=` returns the person's rows in order (featured sections, then ADR 0028's built-in rows, as `client-home.md` decides) and `GET /api/v1/announcements?client=` the active ones; `POST /api/v1/announcements/{id}/seen` records reach. New SSE topics: `announcements.updated` and `home.updated`, sent to each person only when their resolved result changes.
- **The live preview** posts the draft to `POST /api/v1/curation/preview` with the person and client chosen, and renders what comes back in the prototype's inert frame. Nothing is saved.
- **The dashboard's Announcement widget** gets its data.
- **Ordering:** the spec names `moveSection(id, by)`, the mock `reorderSections(ids)`. The API takes the whole order (`PUT /api/v1/curation/sections/order`), which drag and keyboard reordering both produce and which a rerun can't scramble.

## The rest (8c)

- **The profile, format and size editors,** built from a prototype approved first ([question 9](#open-questions-for-the-owner)). Custom Radarr profiles that migration collapsed onto seeded ones (ADR 0041) can then be brought across as they are; the importer gains that path.
- **Delay profiles** (the roadmap's media management extras): with torrents only, a delay profile's one use is "wait N minutes for a better release before grabbing" ([question 14](#open-questions-for-the-owner)).
- **Tags:** a tag on a movie, an indexer, a delay profile or an import list scopes rules to the movies that carry it, as in Radarr; and the library's filters gain tags (checkpoint 6's deferral).
- **Language-profile defaults per root folder** (checkpoint 7's judgement call 1): a default language profile on each root folder in Media management, which the add dialog and import lists use when nothing else is chosen.

## Jobs

Every handler is safe to repeat (ADR 0022).

| Job | When | Idempotent because |
| --- | --- | --- |
| `indexers.rss` (8a) | Every 15 minutes | Seen guids are stored per indexer before any grab; a grab is keyed by guid (checkpoint 6) |
| `movies.wanted` (8a) | Every 6 hours; **Search all** queues searches directly | It searches only movies whose next search is due, and pushes it back before searching |
| `lists.sync` (8a) | Every 6 hours; when a list is saved | Adding is keyed by TMDB id, and exclusions are checked first |
| `notifications.send` (8b) | Per message | Keyed by connection and event; a sent message is marked before the job ends, and a rerun after a crash at worst sends one message twice, which is said in the ADR |
| `backups.scheduled` (8b) | The owner's schedule | Named by its time slot; one that exists isn't made again |
| `logs.prune` (8b) | Daily | It deletes files older than 14 days |
| `curation.schedule` (8c) | At each announcement's or section's start and end | It recomputes status and sends `home.updated` and `announcements.updated`; a second run changes nothing |

**System › Tasks** lists them all with the ones that exist (`downloads.stall`, `library.scan`, `subtitles.wanted` and the rest).

## Data

As migration **0009** (`0009_automation.sql`, 8a), **0010** (`0010_notifications.sql`, 8b) and **0011** (`0011_curation.sql`, 8c); the last is `0008_subtitle_sync.sql`:

- **8a:** `rss_seen` (indexer, guid, seen at); `media_items` gains `next_search_at` and `searches` (for the sweep); `import_lists` (id, kind, name, settings and sealed credentials as JSON, root folder, profiles, monitored, minimum availability, search on add, enabled, last sync and its result); `import_list_items` (list, TMDB id, last seen); `import_list_exclusions` (TMDB id, title, year, when); `api_keys.scope` gains `calendar`.
- **8b:** `connections` (id, kind, name, enabled, events as JSON, settings as JSON with sealed secrets); `notification_log` (connection, event, status, attempts, last error, sent at; kept 30 days); `web_push_subscriptions` (user, endpoint, keys, label). Settings rows `general`, `backups` and `metrics`. As built there is no `backups` table: the backups folder and each zip's manifest are the record ([judgement call 22](#judgement-calls)).
- **8c:** `announcements`, `announcement_seen` (announcement, user, seen at, acknowledged at), `featured_sections`, `featured_overrides`, as the parent plan names them; `tags` and `item_tags`, `delay_profiles`; `root_folders.language_profile_id`; editable `quality_profiles` and `custom_formats` (the seeded rows stay and are marked as such).
- **A test seeds 100k movies** and checks Wanted's lists, the calendar's month and the RSS match stay on an index, as checkpoints 4, 6 and 7 did.

## API

The prototype's mock server is the first draft; the changes real data forces are listed in each part's report. In outline:

- **8a:** `GET /api/v1/wanted/missing`, `/wanted/cutoff` (paged, sorted, with counts), `POST /wanted/search` (ids or all), `GET /calendar?from=&to=`, `GET /feed/v1/calendar.ics?key=`, `import-lists` CRUD with `test` and `sync`, `POST /me/calendar-key`; `GET /system/tasks`, `POST /system/tasks/{id}/run`.
- **8b:** `connections` CRUD with `test`; `POST /me/push-subscriptions`; `GET|PUT /settings/general`, `/settings/backups`, `/settings/metrics`; `GET /system/status` (grows), `/system/logs`, `/system/logs/download`, `/system/backups`, `POST /system/backups`, `POST /system/backups/{id}/restore`, `GET /system/backups/{id}/download`, `GET /system/updates`; `GET /metrics`.
- **8c:** `curation` (announcements and sections CRUD, `PUT /curation/sections/order`, `POST /curation/preview`, `GET /curation/rule-options`); the client's `GET /home?client=`, `GET /announcements?client=`, `POST /announcements/{id}/seen`; profiles, formats and sizes become writable; `tags`, `delay-profiles`.
- **SSE topics:** `wanted.updated`, `lists.updated` (8a); `connections.updated`, `backups.updated`, `logs.appended` (8b, owner and admins only); `announcements.updated`, `home.updated`, `curation.updated` (8c).

## Admin

- **A14 Wanted** (8a), a new route, ported from the prototype: Missing, Cutoff unmet and Calendar, a list on a phone.
- **A15** (8a to 8c): the areas above, replacing every `LaterArea`.
- **A16** (8a, 8b): the tabs, each with its own address as the prototype has them.
- **A11 Curation** (8c), a new route: the two tabs, both composers and the preview.
- **The dashboard:** the Announcement widget (8c).

### What real data may force

Listed here so the owner can see them before they happen; each part's report lists the ones that did.

- **Calendar chips** for more than one date per movie, if question 2 takes separate dates.
- **Connections' Add a connection** is "Not in the prototype"; question 8 recommends a dialog per kind, built like A9's Edit dialog.
- **Import lists' Add a list** is also "Not in the prototype": the same dialog pattern.
- **Wanted's Subscribe** shows the person's own feed key, made on first use.
- **General's Diagnostics** loses "anonymous usage counts".
- **System › Updates** shows the Docker note in place of **Update and restart**.

## Tests

- **Automation:** RSS against the fake indexer's feed (a release grabbed once across two runs; a blocklisted release refused); the sweep's backoff with a fake clock; upgrades end to end (a 720p file replaced by a 1080p grab, its subtitles moved); import lists against recorded TMDB responses and fakes of Trakt and the generic format; the `.ics` validated against RFC 5545's grammar for the properties used, and a calendar key refused everywhere else.
- **Notifications:** each channel against its fake on loopback, with the documented request shape asserted (body, headers, auth); Discord's 429 and `Retry-After`; SMTP against a local fake SMTP server; web push's VAPID signature checked against RFC 8292's test vectors.
- **Backups:** make, list, download, restore, and a restore that fails rolled back; a restore from a newer schema refused; all against a temporary config folder.
- **Metrics:** the exposition output parsed by Prometheus's text grammar; the key required.
- **Curation:** resolution per role, person and client type; the **exit criterion**: an announcement for one role shows only to that role, over the API and SSE; a rule with no matches hides its section; the preview saves nothing.
- **Sweeps:** the server sweep covers every new page; the keyboard walk covers the composers, the calendar and the tabs.
- **No network:** every external service through fakes or recordings; Trakt's and any other application secret only in `.env.local` and CI, never in fixtures.

## ADRs

- **0045, automation:** RSS sync and the seen-release store, the backlog sweep and its backoff, upgrades, import list sources (and why Letterboxd and IMDb go through the generic format), the calendar feed and its key scope.
- **0046, notifications:** the event catalogue, channels as code, delivery and retries, at-least-once sending, why there is no media-server refresh, email through Nodemailer, web push with VAPID.
- **0047, operations:** backups and restore, log files and retention, `/metrics` without a dependency, crash reports, how updates are learned.
- **0048, curation:** announcements and sections, resolution per person and client type, reach, the preview, SSE per person.

## Docker and licences

- **No new system packages.**
- **New dependencies:** `nodemailer` (MIT-0), `web-push` (checked by `bun run licenses`; an exception needs its reason) and, with the approved email templates, `mjml` (MIT). Everything else (Trakt, TMDB lists, every channel, metrics) is written against documented HTTP APIs with `fetch`.
- **Application secrets:** Trakt's Client ID (and its secret for the device flow) as `HIGHSEA_TRAKT_CLIENT_ID` and `HIGHSEA_TRAKT_CLIENT_SECRET`, like `HIGHSEA_OPENSUBTITLES_KEY`: CI secrets and the gitignored `.env.local`, never the repository. A source build without them offers Trakt disabled with a line saying why.
- **The VAPID key pair** is generated on first boot and kept sealed in the database, so each server has its own.

## Specs owed

- **wanted.md:** the answered open questions, the feed key's scope, the sweep.
- **settings.md:** every area as built; Add a connection and Add a list; language defaults on root folders; the editors.
- **system.md:** the tabs as built, log retention, backups' contents, Updates.
- **curation.md:** `reorderSections` as built, the preview route, the answered open questions.
- **users-devices.md:** email for invites and resets.
- **dashboard.md:** the Announcement widget's source.
- **roadmap.md:** Letterboxd and IMDb through the generic format; no media-server refresh; Apprise through its API server; the backlog sweep.
- **The prototype's mock:** the API's shapes where they changed.

## Risks

- **Indexer limits.** RSS every 15 minutes and the sweep both spend queries. Checkpoint 5's per-indexer limits and health pauses apply to both, and the sweep's 20 movies every 6 hours is deliberately small.
- **Eleven notification channels.** Each is small, but each is an API that changes. Fakes from the documented shapes catch our mistakes, not theirs; the health list names a channel that keeps failing.
- **Restore is the riskiest action in the admin.** It replaces the database. The marker, the moved-aside copy and the rollback on a failed boot are tested; the confirmation copy is plain about what's lost.
- **Trakt's terms** can change for every install at once, as OpenSubtitles.com's can. TMDB lists and the generic format keep working.
- **8c's editors wait on a prototype.** If the owner's review of it takes longer, 8c's other pieces go first and the editors close it.
- **The checkpoint's size.** Three parts keep each review readable; if a part grows, it's split again and the owner is told before building it.

## Open questions for the owner

Each has a recommendation; the first option is it.

1. **One checkpoint or three parts.**
   - **Recommended:** three gated parts, each reviewed on its own: **8a** automation and Wanted (with Tasks), **8b** notifications and the owner's tools, **8c** curation and the rest (with the editors).
   - Or: two halves, 8a automation and notifications, 8b curation and the owner's tools.
   - Or: one checkpoint, reviewed once at the end.
2. **Release dates on the calendar** (wanted.md's open question).
   - **Recommended:** each date separately, as Radarr does (in cinemas, digital, physical), each chip marked with its kind, since an owner waiting for the digital release wants to see it coming; the date that matters to the movie's minimum availability is the one Wanted and the search use.
   - Or: only the date that matters to the movie's minimum availability, one chip per movie, as the prototype draws it.
3. **A scheduled backlog search.**
   - **Recommended:** the gentle sweep: every 6 hours, the 20 wanted or cutoff-unmet movies searched longest ago, each pushed back 1, 3, 7, then 14 days after an empty search.
   - Or: Radarr's way: RSS only, and the backlog searched when the owner presses **Search all**.
4. **Import list sources.**
   - **Recommended:** TMDB lists, Trakt and the generic JSON format at launch. Letterboxd and IMDb lists come through tools that publish the generic format (MDBList and others), since Letterboxd has no open API and IMDb no public list API. The prototype's Letterboxd and IMDb rows become examples in the generic kind's help.
   - Or: also scrape Letterboxd's and IMDb's list pages, accepting that they can break or be refused at any time.
   - Or: TMDB lists alone at launch.
5. **highsea's Trakt application.**
   - **Recommended:** the owner registers a Trakt application for highsea, kept as CI secrets and in `.env.local` as checkpoint 7's OpenSubtitles.com key is; each owner connects their own Trakt account for private lists.
   - Or: each owner registers their own Trakt application and pastes its Client ID, which Trakt allows but which is a chore for every install.
6. **Notification channels at launch.**
   - **Recommended:** all of the roadmap's: Discord, Slack, Telegram, ntfy, Gotify, Pushover, Matrix, Email, Webhook, Apprise (through an Apprise API server the owner runs) and Browser web push. Matrix and Browser are added to the prototype's list of "Add a connection".
   - Or: the prototype's nine now, Matrix and web push later, which moves part of an [M1] item and changes decision 1.
7. **Media-server refresh.** Withdrawn by the owner: see [answer 7](#the-owners-answers).
8. **Add a connection, and Add a list.**
   - **Recommended:** a dialog per kind, built like A9's Edit dialog (the kind's fields, its events, **Test**, Save), small enough to approve from this description as checkpoints 6 and 7 did.
   - Or: a prototype of both dialogs first, approved before 8a and 8b build them.
9. **The profile, format and size editors.**
   - **Recommended:** prototyped in `design/prototypes` during 8a, reviewed with 8a's report, built in 8c. The prototype covers editing a quality profile (order, cutoff, upgrades, format scores), a custom format (its conditions) and the size table.
   - Or: prototyped and built in 8a, before the rest.
   - Or: left read-only for milestone 1, which moves an [M1] item.
10. **The calendar feed's key.**
    - **Recommended:** a new key scope, `calendar`, that opens only the feed; each person makes their own from Wanted, and the owner sees them all on A13.
    - Or: a read-only key, as wanted.md says now, which in a calendar app's URL would read the whole API.
11. **Updates.**
    - **Recommended:** the Updates tab learns the latest version from the signed catalog (a `releases` entry in its channel, ADR 0034), which highsea already checks every 6 hours; it shows the notes and says to pull the image. Checkpoint 9 publishes the entries. Nothing extra is fetched from GitHub.
    - Or: GitHub's releases API, a second source to check and to rate-limit.
    - Or: Updates waits for checkpoint 9 entirely.
12. **Opt-in crash reporting.** highsea has no service to send reports to, and decision 5 publishes nothing.
    - **Recommended:** with the switch on, an unhandled error writes a report (the error, the stack, the version, recent log lines, nothing personal) to `/config/crashes/`, lists it in System › Logs, and offers **Download report** for the owner to attach to an issue. Sending to a service waits until there is one and the owner approves it.
    - Or: send reports to a self-hosted Sentry-compatible endpoint the owner configures.
13. **What a backup holds.**
    - **Recommended:** the database and a manifest, not `secret.key`. A backup can then be kept anywhere without carrying the key to every secret in it; restoring on another machine needs the key copied by hand, which System › Backups says.
    - Or: include `secret.key`, so one file restores everything, and the backup itself becomes a secret.
14. **Delay profiles and tags.**
    - **Recommended:** tags in 8c (on movies, indexers, import lists and connections, and as a library filter); delay profiles as one setting per quality profile, "Wait before grabbing" in minutes, since with torrents only the Usenet half of Radarr's delay profiles has no use.
    - Or: Radarr's full delay profiles, ready for Usenet later.
    - Or: both later, which moves an [M1] item.

## The owner's answers

Given on 2026-10-21: every recommendation is taken except question 7.

1. Three gated parts: 8a automation and Wanted (with Tasks), 8b notifications and the owner's tools, 8c curation and the rest (with the editors), each reviewed on its own.
2. Each release date on the calendar separately (in cinemas, digital, physical), each chip marked with its kind.
3. The gentle backlog sweep: every 6 hours, the 20 wanted or cutoff-unmet movies searched longest ago, pushed back 1, 3, 7, then 14 days after an empty search.
4. TMDB lists, Trakt and the generic JSON format at launch; Letterboxd and IMDb lists through tools that publish the generic format.
5. highsea's own Trakt application, its Client ID and secret kept as `HIGHSEA_TRAKT_CLIENT_ID` and `HIGHSEA_TRAKT_CLIENT_SECRET` (CI and `.env.local`, never the repository); each owner connects their own Trakt account for private lists.
6. Every channel in the roadmap at launch, Matrix and Browser web push included.
7. **No media-server refresh.** highsea is the replacement for and competitor of Plex, Jellyfin and Emby, as the roadmap sets out, so it has no reason to notify them. The parent plan records this as its decision 7 and drops the refresh from its external services and checkpoint 8 item; the roadmap's movie pipeline drops it too.
8. Add a connection and Add a list as a dialog per kind, built like A9's Edit dialog.
9. The profile, format and size editors prototyped during 8a, reviewed with its report, built in 8c.
10. A `calendar` key scope that opens only the feed.
11. Updates learned from the signed catalog; checkpoint 9 publishes the entries.
12. Crash reports written locally to `/config/crashes/`, listed in System › Logs and downloadable; nothing is sent anywhere.
13. Backups hold the database and a manifest, not `secret.key`.
14. Tags in 8c, and delay profiles as "Wait before grabbing" on each quality profile.

## Judgement calls

Made while scoping; each part's report lists them again with any made while building.

1. **8a includes System › Tasks,** because most of what it lists is 8a's.
2. **RSS runs the same decision path as Grab,** so nothing RSS grabs could not be grabbed by hand.
3. **Import lists never delete** in milestone 1 (Radarr's default).
4. **"Anonymous usage counts"** is left out of General: highsea collects nothing about its owners, and nothing would receive them.
5. **"Hand the server over"** stays out (it's "Not in the prototype"); the owner can ask for it.
6. **`/metrics` is written without a dependency,** from the documented text format: a few counters and gauges don't need a client library.
7. **Notifications for lists** are one per run, never one per movie.
8. **Logs are kept 14 days,** a file a day (system.md's open question on retention).
9. **The VAPID keys are per server,** generated on first boot.
10. **The sections' order is saved whole** (`PUT …/order`), not by `moveSection(id, by)`.

Made while building 8a (2026-10-21):

11. **Charts take their first 20 titles** (TMDB's and Trakt's), so a chart adds what's current, not its long tail.
12. **One Trakt account per server.** The pending device code is kept in memory; a restart means pressing Connect again.
13. **A movie with several versions** isn't on Missing, and isn't swept, while another of its versions has a file.
14. **RSS replaces a movie's cached search results** only when it finds an approved release, so a short feed never hides a search's fuller list.
15. **The calendar key's secret is sealed,** so Wanted can show the feed's address again; one key per person, and a new one replaces the old.
16. **Excluding is a flag on delete** (`exclude`), offered only once a list exists.
17. **Health is System's first tab** until Status arrives (8b), with About below it; the other 8b tabs aren't shown yet.
18. **Task names come through i18n** by job type, falling back to the type; Run now is disabled while a task is queued as well as running.
19. **List changes save at once,** as Download client's categories do.
20. **Wanted's Cutoff unmet column is "Profile · wants",** since a movie's shape doesn't carry its file's quality.
21. **The editors' prototype** draws full pages with the save bar, not dialogs, and marks an edited TRaSH format "Yours" so catalog updates leave it alone (the last is the prototype's own idea, for the owner's review).

Made while building 8b (2026-10-21):

22. **No `backups` table.** The backups folder and each zip's manifest are the record, so a backup copied in by hand is listed and a deleted file never leaves a stale row.
23. **highsea writes and reads its own zips** (stored and deflated entries through `node:zlib`), because Node has no zip module and one format needs no dependency.
24. **Restore exits with code 75** (`EX_TEMPFAIL`) after writing its marker, so Docker's restart policy brings the server back and the boot swaps the database.
25. **A fourth kind, Before a restore:** the current database is backed up before a restore replaces it.
26. **A weekly schedule takes a weekday** as well as the time.
27. **A message held back by `Retry-After` re-queues its job** for that moment, rather than holding a worker.
28. **The message's payload travels in its job,** so a send never reads the library again and a retry sends what the event said.
29. **`notifications.prune` runs daily** and deletes log rows older than 30 days.
30. **A Browser connection names the people it reaches** (`userIds`); one saved without anyone goes to whoever made it.
31. **The webhook's body** is JSON, `{ event, level, title, body, text, url, image, at, payload }`, as ADR 0046 documents.
32. **Posters in messages are signed links** (an HMAC with a key sealed in settings), which the image route accepts without signing in; posters and links appear only when the external URL is set.
33. **Imported and Upgraded share an event id,** so a connection that hears both gets one message for an upgrade.
34. **Health announcements are kept in a setting,** so a restart doesn't announce the same issues again; the check runs every minute.
35. **Some events are left out on purpose:** files the scan or the existing-library import finds in place, a person's own Find another, and subtitles that came with the release. A subtitle is announced once its sync finishes, or at once when Sync to the audio is off.
36. **Messages and emails use the server's language and time zone,** because people have no language of their own yet.
37. **The VAPID subject** is the external URL when it's https, and the package's fallback otherwise.
38. **A new connection hears** Imported, Upgraded, Download failed, Health and Update until the owner changes it.
39. **Add a connection** is one button per kind, each opening its own dialog, in place of the prototype's grid of Soon chips; Matrix and Browser join the kinds.
40. **Status is System's first tab,** with About at its bottom so TMDB's notice stays on the first page; Health moves to its own address.
41. **Health has no Check now,** because there is no health job to run; the checks run on their own.
42. **Logs filter by level on the server** and search the 1,000 lines that come back; Download logs has every day on disk.
43. **Events shows each event's topic and ids** with a clock time, because the stream carries nothing else.
44. **General's Region, Metadata, Updates and Diagnostics share one Save bar,** which saves only the parts that changed; admins see them read only.
45. **An admin at `/system/backups` gets not found,** as Settings' owner-only areas do.
46. **After a restore** the tab polls `/api/health` every 1.5 seconds and reloads once the server answers again.
47. **Status refetches every 10 seconds,** because CPU and memory have no event.
48. **Network's Check from outside is removed** (the owner's call after the 8b report): highsea has no outside service to check from. Choosing a certificate for built-in TLS has no API yet and is left out, as is Hand the server over.
49. **Prometheus is switched on under Diagnostics,** which shows the `/metrics` address and the note that it needs a read-scoped API key.
50. **Emails compile from MJML when they're sent** (`mjml` 5.4.1), not at build: it costs milliseconds next to SMTP, and the templates stay plain functions the prototype shares (`@highsea-tv/notifications/mail`).
51. **Images travel by Content-ID,** attached to each message, never as remote URLs, so an email needs neither the reader's permission nor an external URL to show them.
52. **The logo falls back to highsea's app icon** when the server's mark is SVG or unset: most clients don't show SVG, and rasterising it would take a native renderer.
53. **The poster comes from the image cache at `w185`,** about twice its 96px; a movie with none leaves the poster's column out, and a list's run shows its first movie's.
54. **An email's details are only what its payload carries:** release, indexer and size for Grabbed; quality, size and what it replaced for Imported and Upgraded. The prototype's samples derive theirs the same way, so Imported no longer shows a release name it doesn't have.
55. **Not minified:** a compiled email is about 15 kB, far under Gmail's 102 kB clipping.
56. **A test from an unsaved connection** names "this connection" in its footer.

Made while building 8c, curation (2026-10-21):

57. **"Playable" is a version with a file** until streaming (Phase 4). Sections, the picker and the rules show only those titles.
58. **Titles are TMDB ids in the API** and `media_items` ids in the database. The runtime's `CurationLibrary` maps between them, so curation never imports media (ADR 0036, 0048).
59. **The filter rule's grammar** is `year` and `rating` comparisons joined by `and`, with rating out of 5. It is the hint's own example, and milestone 1 has no saved filters to name.
60. **Rule orders:**
    - recently added: newest first;
    - a genre and a filter: best rated first;
    - a collection: release order.
61. **`curation.updated` is staff only** (`STAFF_TOPICS`). `announcements.updated` and `home.updated` are personal, sent only to the people whose result changed. The fingerprint is per person and kind of app, and someone who joined since the last run starts from an empty one. `/me/home`'s own `home.updated` is personal too.
62. **`curation.schedule` runs hourly** as a safety net, and once more at the next start or end. A second run sends nothing (ADR 0022).
63. **A draft needs only its title.** Publishing checks the placements, the audience and the button, as the composer does.
64. **A `POST` to the list creates; a `PUT` to the item updates.** Deleting is `removeAnnouncement` and `removeSection`.
65. **The apps' reads are their own SDK groups,** `home` and `announcements`. The client defaults to `web`.
66. **A preview without an id** puts the draft at `draft`, which the section composer scrolls to.
67. **Ending a scheduled announcement** sets its start to now as well, so it reads as ended.
68. **The preview is the server's own drawing** of a home screen in an inert, same-origin frame (`/curation-frame`, staff only), because the client screens arrive in Phase 4. **Preview as** lists every accepted person.
69. **The dashboard's Announcement widget reads the staff list** (the first live announcement), not what is aimed at the admin. The admin's own announcements are banners above every page.
70. **The first hero leads wherever it sits** in the order. A later hero is one of the rows a person can arrange on their own home screen.
71. **What the prototype changed for real data:**
    - the preview frame;
    - Preview as listing everyone;
    - the picker searching the library by title;
    - a collection's summary naming it from the rule options;
    - the admin banners reading the person's own announcements.

Made while building 8c, tags and root-folder defaults (2026-10-21):

72. **Tags are scoped as Radarr's are** ([wiki.servarr.com/radarr/settings#tags](https://wiki.servarr.com/radarr/settings#tags)): an indexer with tags is used only for movies sharing one, in a search and in RSS ("A Movie will use both indexers that have matching tags and indexers that have no tags"; RSS as Radarr's `IndexerTagSpecification` rejects); a list's tags go on the movies it adds (`ListTagsHelpText`: "Tags list items will be added with"); a connection with tags hears a movie's events only for movies sharing one (`NotificationsTagsMovieHelpText`), and events about no movie (health, updates) as before.
73. **No tags on wait before grabbing.** Delay profiles became one setting on each quality profile (answer 14), so the profile already scopes it; Radarr's delay-profile tags have nothing left to choose between.
74. **Tags are managed in Settings › Media management** (a Tags group under Root folders), not in an area of their own; every picker's menu links there.
75. **A label is unique ignoring case,** at most 40 characters, with spaces tidied; an object carries at most 50 tags.
76. **An unknown tag id is refused** (400 `unknown-tag`), not dropped, so a stale screen can't save half its choice.
77. **Removing a tag takes it off everything** that carries it, in one transaction; an indexer or connection left with none serves every movie again, which the confirmation says.
78. **Indexers, lists and connections keep tags as a JSON array** on their own rows; `@highsea-tv/media/shared`'s tags count and strip them with SQLite's `json_each`, so those packages never import media (ADR 0036). Notifications learn a movie's tags through a `movieTags` dependency the runtime hands them.
79. **A list run's one message is filtered by the movies it names** (the first three), which all carry the list's tags.
80. **Bulk edit adds or removes one tag at a time** (the API also takes Radarr's replace); a movie's own Edit dialog sets them all.
81. **The library's tag filter** is one tag, kept in the address, and shown only once a tag exists.
82. **Tags are staff-only** like the rest of the admin's settings.
83. **A root folder's default language profile** saves at once from its row. An add that leaves `languageProfileId` out takes the folder's default; an explicit null still means none. The add dialog starts on the default folder's profile and follows a change of folder.
84. **A list's "no language profile" now means the root folder's default** (the Select reads "The root folder's default"), since that is what nothing chosen means everywhere else; a folder without one still adds the movie with none. Migration adds through the same path, so Radarr's movies take their folder's default too, and its tags (brought across by label since 6b) now match an existing tag ignoring case and keep to 40 characters.
85. **Removing a language profile clears it as a folder's default,** in the same transaction.
86. **The `tags.updated` topic is declared beside the tags routes** (`TAG_TOPICS`), not in the shared events list, to keep the parallel 8c work's edits apart.

Made while building 8c, the quality editors (2026-10-21):

87. **The wait counts from the release's upload,** not from when highsea first sees it, as the Servarr wiki says Radarr's delay profiles do ([how delay profiles work](https://wiki.servarr.com/radarr/settings#how-delay-profiles-work)). A release with no upload time isn't held.
88. **A release at the profile's most preferred quality goes at once** (Radarr's Bypass if Highest Quality, always on): waiting could only find the same quality.
89. **Only RSS and the backlog sweep wait.** Search, Search all, Search now, a manual grab and a failed download's replacement never do (the wiki: manual searches ignore delay profiles).
90. **While the best release is held, nothing lesser is grabbed.** When the hold ends, `movies.held` searches the movie again and grabs the best then (the wiki's "single release which best matches"); there is one held job per movie and version, and a movie no longer wanted is skipped.
91. **The longest wait is a week** (10,080 minutes), and the field is in minutes as answer 14 has it.
92. **Seeded profiles are marked built in and are edited and deleted like any other.** Deleting is refused while a movie uses the profile (409 `in-use`, with the count) and for the last one (409 `last-profile`).
93. **Profile and format names are unique ignoring case** (409 `name-taken`), shown under the Name field.
94. **Saving a profile drops scores of 0 and scores for formats that are gone;** deleting a format takes its scores from every profile in the same transaction.
95. **A changed preset stays a preset, marked `edited`,** and reads as Yours. Seeded presets nobody changed are refreshed from the bundled presets at boot, so TRaSH fixes reach them.
96. **Reordering profiles is an API route only** (`PUT /qualityprofiles/order`); the prototype has no control for it.
97. **The catalog's profile presets stay inert,** with a tooltip saying the catalog has none yet; New profile starts from HD Bluray + WEB, as the prototype's blank does.
98. **The size table saves whole,** every quality present and each row checked; Reset to TRaSH's sizes is a draft until saved.
99. **Radarr migration can bring a profile across as it is.** "Bring it across as it is" is the last choice for each Radarr profile that converts. The copy's id is `qp-radarr-{id}`, so a retried job finds it, and its name gets " (Radarr)" when another profile has it. A profile that can't be converted falls back to the nearest and is listed as a failure. Format scores carry over by format name; Radarr's own formats still don't come across (ADR 0041).
100. **The editors reload after a save** rather than waiting for `settings.updated`, so the save bar never lingers on a slow event stream.
101. **What the prototype changed for real data:** Wait before grabbing in the Profile group, and the list's "waits N minutes" line; the format editor's note for a changed preset; a missing profile or format shows an empty state linking back to Profiles and formats; Migration's profile select gains "Bring it across as it is"; and the prototype's own blank profile gained `waitMinutes: 0` so it typechecks against the new schema (no visible change).
