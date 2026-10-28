# 0054. Watch state: positions, watched and the player's picks, per person and title

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Phase 4's checkpoint 4.1a ([phase-4-checkpoint-1.md › Watch state](../plans/phase-4-checkpoint-1.md#watch-state-41a)) is the first time anything plays, so it's the first time highsea records what each person has seen. Several screens read it: Resume and Continue watching (client-home.md, client-detail.md), Mark as watched and unwatched (answer 9 in Phase 4's 4.0), the player's remembered tracks and subtitle offset (player.md › Data), Next up, and smart collections' watched and last-played rules (ADR 0049).

What existed:

- `watch_positions` (checkpoint 4, `packages/db/src/schema/media.ts`): a person's place in a title, read for Resume, written by nothing.
- The client API's items carried `progress` and nothing else of watch state.

What the servers highsea replaces do:

- **Jellyfin** keeps `UserData` per user and item: `Played`, `PlayCount`, `LastPlayedDate` and `PlaybackPositionTicks`. A position past `MaxResumePct` (90% by default) marks the item played and resets the position ([`UserDataManager`](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/Library/UserDataManager.cs), [`ServerConfiguration`](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Model/Configuration/ServerConfiguration.cs)); marking it unplayed clears the flag, the count, the date and the position ([`BaseItem.MarkUnplayed` and `ResetPlayedState`](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Controller/Entities/BaseItem.cs)).
- **Plex** marks a video watched past a threshold the owner sets, 90% by default, and keeps a view count and last-viewed date per account.

The owner's answer 3 for 4.1 set the mark at 90%.

## Decision

**Three tables, each keyed by person and item** (`packages/db/src/schema/playback.ts`, migration 0014), whatever the item's type, so episodes use the same ones when shows come:

- `watch_positions` (unchanged): seconds, the duration, and when it was saved.
- `watch_history`: `played`, `play_count` and `last_played_at`, the time it was last played to the end. Smart collections read it (ADR 0049's 2026-10-27 section).
- `playback_prefs`: the version, audio and subtitle track and the subtitle offset the person last chose for the title. Track ids are the client API's (`{fileId}:{streamIndex}` for a file's own streams, a `subtitle_files` id for a sidecar), so a pick names one file's track and is dropped quietly when another version plays.

**Watched past 90%** (`WATCHED_AT`, `packages/media/src/shared/watch.ts`):

- A report at or past 90% of the duration marks the title played, adds one to the count, sets the date, and clears the position, so it isn't resumed.
- It counts once per viewing: a report past the mark counts only while a position is saved, so the credits' reports after it don't count again. A viewing that starts over saves a position and can count again.
- **Mark as watched** does the same by hand. **Mark as unwatched** deletes the history and the position, as Jellyfin's mark unplayed clears the count and the date with the flag.
- The duration is what the player reports, or else the file's probe.

**Saving positions.** The player reports to its play session (`POST /api/v1/playback/sessions/{id}/progress`); the session saves the first report, every pause and resume, and otherwise at most every 5 seconds (`SAVE_EVERY_MS` in `@highsea-tv/stream/sessions`), and leaving the player saves the last place heard. A client that only keeps a place without a session uses `POST /api/v1/items/{type}/{id}/progress`.

**Reaching the person's other devices.** Every change raises `watch.updated` with `movie:{tmdbId}`, sent only to that person's connections (`to: [userId]`), so Resume and Continue watching move on their other devices at once and nobody else hears it.

**Routes** (`packages/api-contract/src/playback.ts`), each for anyone who can see the library and 404 otherwise, as the library's reads are:

- `POST` and `DELETE /api/v1/items/{type}/{id}/played`;
- `GET` and `PUT /api/v1/items/{type}/{id}/prefs`;
- `GET /api/v1/items/{type}/{id}/next`: Next up, the films after this one in its TMDB collection by release date, with a file, the first the person hasn't watched, else the next one.

The client API's items carry `watched` beside `progress`.

## Consequences

- Continue watching (`packages/runtime/src/curation-library.ts`) and Resume come alive with no change of their own: they already read `watch_positions`.
- Watched is per title. A film in several versions is watched once, whichever played.
- Mark as unwatched forgets the play count. If a "times watched" ever shows, it counts from then.
- `last_played_at` is when a viewing ended, not when one started. A rule "played in the last 30 days" means finished in them.
- A device class's default version (answer 9 in Phase 4, a preference in layers per ADR 0027) is left for the clients that offer the setting; a pick on the title wins over it when it comes.
- History beyond the last play (each viewing with its device) is 4.3's session history, not this table's.
