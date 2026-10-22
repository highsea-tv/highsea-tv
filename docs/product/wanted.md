# Wanted and calendar

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `#/admin/wanted` (Missing), `#/admin/wanted/cutoff`, `#/admin/wanted/calendar` (A14, reference fidelity).
- **Roadmap:** [Phase 2 › A14](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes) (`/wanted`).

## Purpose

What the library is still waiting for: monitored movies with no file yet, movies below their profile's cutoff that highsea is still upgrading, and what comes out when.

## Entry points

- Sidebar › **Wanted**, after Movies (new in checkpoint 4).
- The palette ("missing", "cutoff", "calendar", "ical").

## Layout

- Page header: "Wanted", "Monitored movies highsea is still looking for, and what's coming out."
- Line tabs: **Missing** and **Cutoff unmet** (with counts), **Calendar**; each has its own address.
- **Missing / Cutoff unmet:** a table: the poster and title (to the media page), Released, then the quality profile (Missing) or "has · wants" ("WEB 1080p · WEB 2160p", Cutoff unmet), and **Search** per row. Above it, why the list exists and **Search all {n}**.
- **Calendar:**
  - the month ("October 2026") between **Previous month** and **Next month**, **This month** when away from it, and a key (In the library, Downloading, Wanted, by outline color);
  - from medium, a month grid (Monday first), today in the accent fill, each day with its releases as chips (to the media page);
  - on a phone, a list of release days instead;
  - **Subscribe in your calendar app**: the iCal feed's address (with a read-only key) and **Copy**.
- *As built (8a), where real data changed the prototype:*
  - **Paging:** the lists come 50 at a time, with **Show more** under them. The tab counts are the lists' totals.
  - **Cutoff unmet's column** is "Profile · wants" (the profile and its cutoff): the movie's shape doesn't carry its file's quality.
  - **The calendar** labels each entry In cinemas, Digital or Physical, since each date is its own entry. Month names, weekdays and dates follow the admin's language. Downloading is the `downloading` status alone, since there is no `queued` status.
  - **The feed** is each person's own:
    - With none yet, **Make a feed address**.
    - With one, the address with **Copy**, then **Make a new address** (the old one stops working) and **Turn off**, each confirmed first.
    - The hint says it's turned off here, not in API keys.
  - **Search** toasts name the movie, or count what Search all queued. Until there's an indexer, an error toast says so.

## States

- **Empty:** "Nothing missing" · Every released, monitored movie has a file. "Everything meets its cutoff" · Every movie is at the quality its profile asks for. A month with nothing: "Nothing monitored comes out this month."
- **Loading / error:** as every admin table.
- **Live:** a search that grabs a release moves the movie out of the list (it's downloading).
- **No reduced states.** Only the owner and admins open the admin ([ADR 0032](../adr/0032-administrative-and-normal-access.md)); users get the refusal page.

## Interactions

- **Search / Search all** run an indexer search for those movies now; results land in Activity ("Searching for 2 movies · Results land in Activity.").
- Calendar chips and titles open the media page.
- **Copy** copies the feed address.

## Data

- `movies.list()` (status `missing`, `cutoff-unmet`, monitored), `movies.qualityProfiles()`, `movies.bulkSearch(ids)`.
- The feed: `GET /feed/v1/calendar.ics?key=…`, signed by a read-only API key ([users-devices.md](users-devices.md)).
- Events: `movies.updated`, `queue.updated`.
- *As built (checkpoint 8a, [ADR 0045](../adr/0045-automation.md)):*
  - **Lists:** `wanted.missing(query)` and `wanted.cutoff(query)` → `GET /api/v1/wanted/missing|cutoff` (staff), each a `MoviePage` (title filter, sort, cursor) like the library's.
    - Missing is monitored movies past their minimum availability with a version that has no file.
    - Cutoff unmet is monitored movies whose file is under the cutoff of a profile that allows upgrades. The column is stored (`cutoff_unmet`) and kept by the import and profile changes.
  - **Search:** `wanted.search({ ids } | { all: 'missing' | 'cutoff' })` → `POST /api/v1/wanted/search` queues `movies.search` per movie and answers `{ queued }`. Until an indexer is set up it answers 409 `no-indexers`.
  - **Calendar:** `wanted.calendar({ from, to })` → `GET /api/v1/calendar` (at most 400 days) is one entry per date, `{ date, kind: 'cinema' | 'digital' | 'physical', movie }`, soonest first. Dates are the region's, as the library stores them.
  - **The feed's key:** `wanted.feedKey()`, `makeFeedKey()` and `revokeFeedKey()` → `GET|POST|DELETE /api/v1/me/calendar-key` are each person's, answering `{ url, createdAt }`. The address uses the public address from Network, or the address the admin was opened at.
  - **The feed:** `GET /feed/v1/calendar.ics?key=…` takes only a `calendar` key. It is RFC 5545, all-day events 30 days back and 365 forward, `UID` `{tmdbId}-{kind}@{serverId}`, served `private, no-store`. A wrong or turned-off key gets 401.
  - **Events:** `wanted.updated` after RSS or the sweep (no ids), plus `movies.updated` and `queue.updated`.

## Decisions

- **Wanted gets a sidebar item** (group 1, after Movies): the roadmap has `/wanted` as its own page, and the list is something an owner checks, not a filter they think to apply.
- **The calendar is a month,** with a list on a phone; a week view adds little for movies, which come out a few times a month.
- **The feed uses an API key,** so calendar apps can fetch it without a session, and it can be revoked like any key. *Changed in 8a (the owner's answer 10):* the key has its own scope, `calendar`, which opens the feed and nothing else, since it sits in an address other apps keep. Each person makes, replaces and turns off their own from Calendar. The owner still sees them in Users and devices › API keys.
- **Each of a movie's dates is its own entry** (8a, the owner's answer 2): in cinemas, digital and physical, as Radarr shows them.
- **highsea looks on its own** (8a): RSS every 15 minutes, and a sweep every 6 hours of the 20 wanted movies searched longest ago, each pushed back 1, 3, 7, then 14 days ([ADR 0045](../adr/0045-automation.md)). Search and Search all look now.

## Open questions

- **Subtitles wanted** is on the Subtitles page; should Wanted link to it, or hold it too?
