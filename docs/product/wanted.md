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

## States

- **Empty:** "Nothing missing" · Every released, monitored movie has a file. "Everything meets its cutoff" · Every movie is at the quality its profile asks for. A month with nothing: "Nothing monitored comes out this month."
- **Loading / error:** as every admin table.
- **Live:** a search that grabs a release moves the movie out of the list (it's downloading).
- **Members:** see the lists and calendar without the Search buttons.

## Interactions

- **Search / Search all** run an indexer search for those movies now; results land in Activity ("Searching for 2 movies · Results land in Activity.").
- Calendar chips and titles open the media page.
- **Copy** copies the feed address.

## Data

- `movies.list()` (status `missing`, `cutoff-unmet`, monitored), `movies.qualityProfiles()`, `movies.bulkSearch(ids)`.
- The feed: `GET /feed/v1/calendar.ics?key=…`, signed by a read-only API key ([users-devices.md](users-devices.md)).
- Events: `movies.updated`, `queue.changed`.

## Decisions

- **Wanted gets a sidebar item** (group 1, after Movies): the roadmap has `/wanted` as its own page, and the list is something an owner checks, not a filter they think to apply.
- **The calendar is a month,** with a list on a phone; a week view adds little for movies, which come out a few times a month.
- **The feed uses an API key,** so calendar apps can fetch it without a session, and it can be revoked like any key.

## Open questions

- **Release kinds:** show cinema, digital and physical dates separately, as Radarr does, or only the one that matters for `minimumAvailability`?
- **Subtitles wanted** is on the Subtitles page; should Wanted link to it, or hold it too?
