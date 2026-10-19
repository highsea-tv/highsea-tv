# Movies: discover, library and detail

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/discover` (A4), `#/admin/movies` (A5), `#/admin/movies/sintel` (A6).
- **Roadmap:** [Phase 2 › A4–A6](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Movie pipeline](../roadmap.md#movie-pipeline), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes) (`/discover`, `/movies`, `/movies/[id]`). Media model: [ADR 0012](../adr/0012-unified-media-item-model.md).

## Purpose

The front of the pipeline. **Discover** finds a movie and adds it with everything the pipeline needs, so one dialog is the only setup. The **library** shows what's here and what's still wanted, and edits many movies at once. The **movie page** is where one movie is understood and fixed: its versions and streams, what happened to it, every release the indexers offer with the reason each one was taken or refused, and its subtitles.

## Entry points

- Sidebar: **Discover**, **Movies** (with the library count).
- ⌘K: **Add a movie** (to Discover), and every title (to its page).
- The dashboard's Upcoming, Recently added and Queue widgets, and Activity, link titles to their pages.
- The library's **Add movie** and its empty state's **Discover movies**.
- The add toast's **Open**.

## Layout

### Discover (A4)

- `PageHeader`: "Discover", a one-line description.
- A search field (max 36rem). Empty, the page shows **Trending this week**; typing shows **Results for "…"**. Results are instant (deferred input, no submit button).
- A poster grid (`auto-fill, minmax(8.5rem, 1fr)`): poster, title (two lines), year and rating, then **Add** or an **In library** badge that links to the movie. The poster and title are one button that opens the details.
- **Details dialog** (`lg`): the backdrop at 15% behind the poster; year, runtime, genres and rating; an **In library** badge if it's there; the full synopsis; the release date ("Released" or "Releases") and the TMDB id. Footer: **Close**, then **Add movie** (to the add dialog) or **Open in the library**.
- **Add dialog** (`md`): the synopsis, then Folder (full width), Quality profile and Subtitle languages (two columns from medium), Minimum availability, **Monitored** (switch) and **Search now** (checkbox, on). The primary button reads **Add and search** or **Add movie** to match.

### Library (A5)

- `PageHeader`: "Movies", a **Grid / Table** segmented control (remembered per browser), **Add movie**.
- One `TableFrame` holds both views. Its toolbar: status tabs with counts (All, Available, Wanted, Downloading, Not released), a title filter, and Sort (Title, Date added, Year, Rating).
- **Grid:** posters with quality tags on the art (top left), the status on the art (bottom left, an overlay badge: glass with a tinted dot) unless the movie is simply available, then the title and year. The caption is always one line, so cards don't change height with the status or its length.
- **Table:** a select column (staff), title with a poster thumbnail (28px wide, 2:3) before it and its path under it, year, versions (a quality tag per version: "1080p", "4K HDR"), status, monitored, date added.
- **Bulk bar:** appears under the toolbar once a row is selected, tinted `accent-soft`: "3 movies selected", **Search**, **Edit** (Monitor, Stop monitoring, then each quality profile), **Remove**, **Clear**.

### Movie detail (A6)

- `PageHeader`: the title; **Search**, **Interactive search**, and a More menu (Refresh metadata, Remove from library).
- **Summary card:** the backdrop at 15% behind it; the poster (9rem column from medium, stacked on compact); year, runtime, genre and rating; status and a quality tag per version; the synopsis (65ch); the path and the **Monitored** switch.
- **Tabs** (line variant):
  - **Overview:** Details (versions with their profiles, subtitle profile, minimum availability, root folder, TMDB id) and, while it's downloading, **In the queue** with live progress. Two columns from expanded.
  - **Files:** one card per version: its size, path, each stream on one line (video: codec, resolution, HDR, bitrate; audio: codec, channels, language, default; subtitles: codec, language, forced, SDH), and the release name. A version without a file says "No file yet" or "Downloading".
  - **History:** this movie's events, newest first.
  - **Search** (staff): interactive search. See Interactions.
  - **Subtitles:** a tracks table (external, then embedded), then **Search for subtitles** (staff).
- **Responsive:** tables scroll sideways inside their frame below their natural width; the page never does. Header actions wrap below the title on compact.

## States

- **Loading:** Discover and the library grid show poster skeletons; tables show row skeletons; the movie page shows a poster and text skeleton. Interactive search says "Searching 5 indexers…" above row skeletons.
- **Empty:**
  - Discover, no results: "Nothing matches "…"" · Try the original title, or just the year.
  - Library: "No movies yet" · Add a movie and highsea finds a release, downloads it and files it here. · **Discover movies**. Members read "The server's owner hasn't added any movies yet."
  - A filter with no matches: "No movies match. Try another filter."
  - History: "Nothing has happened yet".
  - Subtitles, no file: "No file to find subtitles for yet".
  - Interactive search, nothing back: "No indexer returned a release. Check Indexers, or try again later."
- **Error:** each section shows "Couldn't load {section}" with the server's message and **Try again**. An unknown movie id shows "That movie isn't in the library." with **Go to Movies**.
- **Live:** the In the queue card, the status badge and the library update in place as the clock runs: a movie added with Search now goes Downloading → Available, and its Subtitles tab fills in.
- **Permission-limited (members):** Discover shows **Add** disabled with "Only owners and admins can add movies. Ask the server's owner for one you want." The library has no select column, bulk bar or Add movie. The movie page has no actions, no Search tab, a read-only Monitored line, and subtitles without the offset buttons, re-sync, delete or search.

## Interactions

- **Details:** a poster opens the details dialog; its **Add movie** closes it and opens the add dialog, so Escape from adding returns to the results.
- **Add:** Add opens the dialog; **Add and search** adds the movie, closes, and toasts "{Title} added · Searching your indexers now. Follow it in Activity." with **Open**. The result's card switches to **In library** at once.
- **Select:** row checkboxes, and a header checkbox for every row shown. Selection survives filtering; the bar counts selected movies that still exist.
- **Bulk:** Search searches each selected movie that's missing or wanted; Edit applies to all; Remove asks first ("Their files stay on disk.").
- **Monitor:** the switch saves immediately.
- **Interactive search:**
  - the toolbar counts releases and how many the profile accepts, with **Show rejected** (on) and **Search again**;
  - each row: indexer with the release name under it, quality and up to two custom formats as tags, format score, size, seeders/leechers, age, the decision, and a grab button;
  - the decision badge ("Accepted", or "Rejected (2)") is a button that expands a row of reasons, each marked ✓ accepted, ! warning or × rejected;
  - **Grab** (primary) on accepted releases; **Grab anyway** (ghost, with a tooltip "overrides your profile") on rejected ones. A grabbed row shows a **Grabbed** badge, and the toast points to Activity.
- **Subtitle tracks:** − and + move a track 50 ms earlier or later and save at once; the offset reads "+250 ms" / "−120 ms". **Re-sync** runs the audio sync and toasts the result ("Offset −350 ms, 98% confidence"). Delete removes an external track.
- **Subtitle search:** pick a language, **Search providers**, then **Use** on a result: it downloads, syncs and joins the tracks.
- **Keyboard:** every control is a native button, link, switch or Radix control in reading order; the reasons toggle has `aria-expanded`. No custom shortcuts.
- **Sound:** none; admin sound is off by default.

## Copy

| Where | Text |
| --- | --- |
| Discover description | Find a movie and add it. highsea searches your indexers and takes it from there. |
| Add dialog | Add {Title} ({Year}) · You can change all of this later on the movie's page. |
| Minimum availability hint | Don't grab before this. Released avoids cam copies. |
| Monitored hint | Grab it when a release turns up, and upgrade it until the profile's cutoff. |
| Search now hint | Otherwise the next RSS sync picks it up. |
| Add toast, searching | {Title} added · Searching your indexers now. Follow it in Activity. |
| Add toast, not searching | {Title} added · It's monitored. highsea grabs it when a release turns up. |
| Remove (bulk) | Remove 3 movies? · They leave the library and stop being monitored. Their files stay on disk. |
| Remove (one) | Remove {Title}? · It leaves the library and stops being monitored. ☐ Also delete its files from disk |
| Grab toast | Grabbed · {release} is downloading. Follow it in Activity. |
| Subtitle download toast | Subtitles downloaded · Synced to the audio and ready on every client. |

## Data

- `movies.discover(query)` → `GET /api/v1/discover/movies?query=` (TMDB-backed). `DiscoverMovie` carries `inLibrary`; library movies come back as themselves, once.
- `movies.add(AddMovieInput)` → `POST /api/v1/movies`. With `searchNow`, the server searches and grabs the best accepted release in the same request.
- `movies.rootFolders()`, `movies.qualityProfiles()`, `movies.languageProfiles()` → `GET /api/v1/rootfolders`, `/qualityprofiles`, `/languageprofiles`.
- `movies.list()`, `movies.get(id)`, `movies.update(id, patch)`, `movies.delete(id, { deleteFiles })` → `/api/v1/movies[/{id}]`.
- `movies.bulkUpdate(ids, patch)`, `movies.bulkSetQualityProfile(ids, profileId)`, `movies.bulkSearch(ids)`, `movies.bulkDelete(ids)` → `POST /api/v1/movies/bulk` with an `action`. The profile change moves each movie's **first** version; extra versions keep their own.
- `movies.files(id)` → `GET /api/v1/movies/{id}/files` (`MediaFile` with ffprobe `streams`).
- `movies.history(id)` → `GET /api/v1/movies/{id}/history`.
- `movies.interactiveSearch(id)` → `GET /api/v1/movies/{id}/releases`: `Release[]`, each with `approved` and `reasons: { kind: 'accepted' | 'rejected' | 'warning'; message }[]`.
- `movies.grabRelease(id, guid)` → `POST /api/v1/movies/{id}/releases/{guid}/grab`.
- `subtitles.forItem(id)`, `subtitles.search(id, language)`, `subtitles.download(id, result)`, `subtitles.sync(trackId)`, `subtitles.setOffset(trackId, ms)`, `subtitles.delete(trackId)` → `/api/v1/movies/{id}/subtitles…` and `/api/v1/subtitles/{trackId}…`.
- Events: `movies.updated`, `item.updated`, `history.updated`, `queue.changed`, `subtitles.updated`.

## Decisions

- **Discover shows the library too,** marked In library and linked, instead of hiding it. Searching for a movie you already have should say so, not come back empty.
- **Details in a dialog, not a page.** It keeps the search and its results in place behind it; Discover is for browsing many titles quickly. A page per TMDB title can come later if the details grow (cast, trailers).
- **Status on the art, not under it.** A status chip in the caption wrapped or overflowed depending on the title and label lengths, and appeared and disappeared live, so cards jumped. On the art it takes no layout space; the quality tags already set that pattern.
- **Every media table leads with a thumbnail.** `TitleCell` takes `art`, so series, music and books tables get the same row shape. The thumbnail is decorative (empty alt): the title beside it names the row.
- **One dialog, defaults filled.** The prototype starts from the first folder, HD 1080p and English; the product should remember the last-used values. Search now is on, because the usual intent of adding is "get it".
- **Grid and table share one frame,** filters and sort, so switching views keeps your place. Selection and bulk edit live in the table only: posters are for browsing.
- **Bulk quality profile changes the first version.** A 4K version added beside a 1080p one is a deliberate second profile; a bulk edit shouldn't flatten it.
- **Two versions are one item** with a tag per version, never two rows (ADR 0012).
- **Rejected releases are shown by default,** with the reasons one click away. The point of interactive search is usually "why didn't it grab this?".
- **Grab anyway exists,** but is a ghost button with a warning tooltip, never the primary.
- **The offset nudge is 50 ms,** matching the player's nudge (C5), and saves on each step rather than through a form.
- **Embedded subtitle streams appear in the tracks table** as read-only rows, so the tab answers "what can people watch with" in one place.

## Open questions

- **Details content.** TMDB also has cast, crew, certification, trailers and collections. Which belong in the details dialog?
- **Discover sources.** TMDB trending only, or also lists (popular, upcoming, by genre) and the owner's import lists?
- **Library columns.** Should the table's columns be choosable (size, quality profile, path, rating), as in Radarr?
- **Per-version actions.** Searching or upgrading one version (just the 4K) needs a version picker on Search; the prototype searches the movie.
- **Release details.** Should a release row open the indexer's page, and show its file list before grabbing?
