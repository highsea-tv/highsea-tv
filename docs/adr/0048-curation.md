# 0048. Curation: announcements and featured sections, resolved per person and app

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Checkpoint 8c builds A11 Curation ([curation.md](../product/curation.md), [the plan](../plans/phase-3-checkpoint-8.md)). It has two parts:

- **Announcements:** the owner's messages, each with placements, an audience, a schedule and who has seen it.
- **Featured sections:** these make up every home screen ([client-home.md](../product/client-home.md)).

Both are read by apps that don't exist yet (Phase 4), so the server has to answer as each app will ask: for one person, on one kind of app. The prototype's composers preview the draft on the real client screens, which the server can't run yet. Migration 0011 had already added the tables: `announcements`, `announcement_seen`, `featured_sections` and `featured_overrides`.

## Decision

- **The package.** Curation is one package, `@highsea/curation`, with one subpath, `service` (ADR 0036). It depends on `core`, `db`, `jobs` and the contract.
  - It never imports media. The runtime gives it a `CurationLibrary` (`packages/runtime/src/curation-library.ts`), which answers four questions:
    - which titles are here and have a file;
    - what a rule picks;
    - what the built-in rows hold (Continue watching and Recently added);
    - which genres and collections a rule can name.
  - The runtime also gives it the person's home arrangement from personalization, so a person's own order comes on top of the owner's.
- **"Playable" means a version with a file** until streaming (Phase 4) says what can actually be played.
  - Only those titles appear in a section, in the picker, or in what a rule picks.
  - The rules read TMDB's JSON in the metadata cache with SQLite's [`json_each` and `json_extract`](https://sqlite.org/json1.html), as the genre rows already do.
- **Titles are TMDB ids in the API** and `media_items` ids in the database, so a section's foreign keys keep pointing at the library. The seam maps one to the other.
- **Status comes from the schedule** (curation.md › Decisions). Only a draft is stored as a state; scheduled, live and ended are read from the dates.
  - A draft needs only its title. Publishing checks the placements, the audience and the button.
  - Ending a scheduled announcement sets its start to now as well, so it reads as ended rather than as a schedule running backwards.
- **Resolution is one function per question,** each for one person on one kind of app:
  - `home(userId, client)` returns the sections in order. The first hero leads, wherever it sits in the order. Continue watching comes right after it. Rules that match nothing are hidden.
  - `announcements(userId, client)` returns the live announcements that reach that person, each marked seen or not.
  - `preview` is the same with one draft in it, shown as live. It saves nothing.
- **Audiences.** An audience is everyone, some roles, some people, or some kinds of app.
  - Reach counts people, not devices, and only accepted accounts: an invite doesn't count until the person joins.
  - Seen is one row per person and announcement, so a second dismissal changes nothing.
- **Events are personal.** `announcements.updated` and `home.updated` carry `to`, and the event stream sends each one only to the people named in it.
  - The service keeps a fingerprint of what each person gets on each kind of app. After a change, and at each start and end, it sends the event only to the people whose fingerprint moved.
  - Someone who joined since the last run is compared against an empty fingerprint.
  - `curation.updated` is the admin's lists. It is staff only (`STAFF_TOPICS`).
- **The `curation.schedule` job** runs hourly as a safety net. Each run also queues one more run at the next start or end still to come.
  - A run compares fingerprints, so running it twice sends nothing the second time (ADR 0022).
- **The preview is the server's own drawing** of a home screen, at `/curation-frame`, in an inert iframe sized to the device and scaled.
  - The sizes: TV at 1600 × 900 as tvOS, the web at 1280 × 800, and a phone at 390 × 844 as iOS.
  - The admin posts the result of `POST /curation/preview` into the frame. Both sides check `event.origin` against their own and name `targetOrigin`, as MDN's [security notes on `postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#security_concerns) require.
  - The frame's page renders only for a staff session.
- **Routes:**
  - **Staff only** (ADR 0032): the admin's routes under `/api/v1/curation`. That is the CRUD; `PUT /curation/sections/order`, which saves the whole order (the plan's judgement call 10); `POST /curation/sections/resolve`; `GET /curation/rule-options`; and `POST /curation/preview`.
  - **Anyone signed in**, for themselves: `GET /home?client=`, `GET /announcements?client=` and `POST /announcements/{id}/seen`.
  - The client defaults to `web`.

## Consequences

- **The preview can drift from the real clients.** It is a drawing of a home screen, not the clients' own screens (a change from the prototype). When the Phase 4 clients exist, the frame should load their home screen instead and keep the same message.
- **Has a file is too loose.** It lets in a title that can't be streamed yet. Phase 4 narrows it in the seam, without changing curation.
- **Fingerprints are kept in memory.** After a restart, the first run sets them without sending anything. A change missed while the server was down reaches the apps the next time they load.
- **Section rules are a small grammar.** The rules are recently added (7, 30 or 90 days), a genre, a collection, or a filter of `year` and `rating` comparisons joined by `and`. A richer filter would mean the library's saved filters, which milestone 1 doesn't have.
