# Movies: discover, library and detail

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/discover` (A4), `#/admin/movies` (A5), `#/admin/movies/1` (A6). The movie page is a media page: its shared anatomy, the not-added state, people and other media types are in [media-pages.md](media-pages.md).
- **Roadmap:** [Phase 2 › A4–A6](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Movie pipeline](../roadmap.md#movie-pipeline), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes) (`/discover`, `/movies`, `/movies/[id]`). Media model: [ADR 0012](../adr/0012-unified-media-item-model.md).

## Purpose

The front of the pipeline. **Discover** finds a movie and adds it with everything the pipeline needs, so one dialog is the only setup. The **library** shows what's here and what's still wanted, and edits many movies at once. The **movie page** is the same page whether the movie is here or not ([ADR 0014](../adr/0014-universal-media-pages.md)). Before adding, it shows what the movie is: cast, crew, trailers, its collection and what's like it. Once added, it's also where the movie is fixed: its versions and streams, what happened to it, every release the indexers offer with the reason each one was taken or refused, and its subtitles.

## Entry points

- Sidebar: **Discover**, **Movies** (with the library count).
- ⌘K: **Add a movie** (to Discover), and every title (to its page).
- The dashboard's Upcoming, Recently added and Queue widgets, and Activity, link titles to their pages.
- The library's **Add movie** and its empty state's **Discover movies**.
- The add toast's **Open**.
- A person's filmography, a collection and More like this, on any media page.

## Layout

### Discover (A4)

- `PageHeader`: "Discover", a one-line description.
- A search field (max 36rem). Empty, the page shows four tabs above the grid: **Trending** (this week), **Popular**, **Now playing** and **Upcoming**, each from TMDB for the server's region; typing replaces them with **Results for "…"**. Results are instant (deferred input, no submit button). The tabs are approved by the owner on 2026-10-20; the prototype shows Trending only.
- A poster grid (`auto-fill, minmax(8.5rem, 1fr)`): poster, title (two lines), year and rating, then **Add** or an **In library** badge that links to the movie. The poster and title are one link to the movie's page, `/movies/{id}` by TMDB id: the same address the library and everything else use, in the library or not.
- **Add dialog** (`md`), shared by Discover, the movie page, person pages and collections: the synopsis (or, for several movies, their titles), then Folder (full width), Quality profile and Subtitle languages (two columns from medium), Minimum availability, **Monitored** (switch) and **Search now** (checkbox, on). The primary button reads **Add and search** or **Add movie** to match.

### Library (A5)

- `PageHeader`: "Movies", a **Grid / Table** segmented control (remembered per browser), **Add movie**.
- One `TableFrame` holds both views. Its toolbar: status tabs with counts (All, Available, Wanted, Downloading, Not released), a title filter, and Sort (Title, Date added, Year, Rating).
- **Grid:** posters with quality tags on the art (top left), the status on the art (bottom left, an overlay badge: glass with a tinted dot) unless the movie is simply available, then the title and year. The caption is always one line, so cards don't change height with the status or its length.
- **Table:** a select column, title with a poster thumbnail (28px wide, 2:3) before it and its path under it, year, versions (a quality tag per version: "1080p", "4K HDR"), status, monitored, date added.
- **Bulk bar:** appears under the toolbar once a row is selected, tinted `accent-soft`: "3 movies selected", **Search**, **Edit** (Monitor, Stop monitoring, then each quality profile), **Remove**, **Clear**.

### Movie detail (A6)

The anatomy, the Overview's rows (cast, trailers, collection, More like this, About), the Cast and crew tab and the not-added state are in [media-pages.md](media-pages.md#layout). What the library layer adds:

- `PageHeader`: the title; **Search**, **Interactive search**, and a More menu (Refresh metadata, Remove from library).
- **Summary card:** the media page's, plus status and a quality tag per version, the path and the **Monitored** switch.
- **Tabs** (line variant): Overview and Cast and crew, then:
  - **Overview** gains **In the queue** while it's downloading (live progress), and **In the library** in the aside: versions with their profiles, subtitle profile, minimum availability, root folder.
  - **Files:** one card per version: its size, path, each stream on one line (video: codec, resolution, HDR, bitrate; audio: codec, channels, language, default; subtitles: codec, language, forced, SDH), and the release name. A version without a file says "No file yet" or "Downloading".
  - **History:** this movie's events, newest first.
  - **Search:** interactive search. See Interactions.
  - **Subtitles:** a tracks table (external, then embedded), then **Search for subtitles**.
- **Responsive:** tables scroll sideways inside their frame below their natural width; the page never does. Header actions wrap below the title on compact.

## States

- **Loading:** Discover and the library grid show poster skeletons; tables show row skeletons; the movie page shows a poster and text skeleton. Interactive search says "Searching 5 indexers…" above row skeletons.
- **Empty:**
  - Discover, no results: "Nothing matches "…"" · Try the original title, or just the year.
  - Library: "No movies yet" · Add a movie and highsea finds a release, downloads it and files it here. · **Discover movies**.
  - A filter with no matches: "No movies match. Try another filter."
  - History: "Nothing has happened yet".
  - Subtitles, no file: "No file to find subtitles for yet".
  - Interactive search, nothing back: "No indexer returned a release. Check Indexers, or try again later."
- **Error:** each section shows "Couldn't load {section}" with the server's message and **Try again**. An id TMDB doesn't know shows "TMDB has no movie with that id." with **Go to Discover**.
- **No indexers yet:** the add dialog's Search now is disabled and off, with the hint "Add an indexer to search for releases.", and the button reads **Add movie**. The Search tab shows the same sentence with a link to **Indexers**.
- **No TMDB key:** Discover and Add say "Add a TMDB key to find movies." with a link to Settings › General › Metadata. The library and its pages still work from the cache.
- **Live:** the In the queue card, the status badge and the library update in place as the clock runs: a movie added with Search now goes Downloading → Available, and its Subtitles tab fills in.
- **No reduced states.** Only the owner and admins open the admin ([ADR 0032](../adr/0032-administrative-and-normal-access.md); owner's decision, 2026-10-20), and every admin can add, edit and remove movies. The members' states (Add disabled, no bulk bar, a read-only Monitored line) are gone.

## Interactions

- **Open:** a poster opens the movie's page. Its **Add movie** opens the same add dialog; once added, the page turns into the library page in place.
- **Add:** Add opens the dialog; **Add and search** adds the movie, closes, and toasts "{Title} added · Searching your indexers now. Follow it in Activity." with **Open**. The result's card switches to **In library** at once.
- **Select:** row checkboxes, and a header checkbox for every row shown. Selection survives filtering; the bar counts selected movies that still exist.
- **Bulk:** Search searches each selected movie that's missing or wanted; Edit applies to all; Remove asks first ("Their files stay on disk.").
- **Monitor:** the switch saves immediately.
- **Interactive search:**
  - the toolbar counts releases and how many the profile accepts, with **Show rejected** (on) and **Search again**;
  - each row: indexer with the release name under it, quality and up to two custom formats as tags, format score, size, seeders/leechers, age, the decision, and a grab button;
  - the decision badge ("Accepted", or "Rejected (2)") is a button that expands a row of reasons, each marked ✓ accepted, ! warning or × rejected;
  - **Grab** (primary) on accepted releases; **Grab anyway** (ghost, with a tooltip "overrides your profile") on rejected ones. A grabbed row shows a **Grabbed** badge, and the toast points to Activity.
  - **Until downloads arrive** (checkpoint 6), Grab is shown but disabled, with the tooltip "Grabbing comes with downloads." (checkpoint 5, answer 6);
  - releases are judged by the movie's **first version's** profile, since the tab has no version picker;
  - the tab opens on the last search's results while they're fresh (30 minutes), and searches when there are none; indexers that didn't answer are listed under the table.
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

Through `@highsea/sdk` (the contract is `@highsea/api-contract`'s `movies`, `rootFolders` and `quality` groups). A movie's `id` is its TMDB id, in the library or not; versions and root folders have the server's own ids. Everything here is staff's unless it says otherwise ([ADR 0032](../adr/0032-administrative-and-normal-access.md)).

- **Discover:** `movies.discover({ query: { query?, list?, page? } })` → `GET /api/v1/discover/movies`. Staff. A `DiscoverPage` (`items`, `page`, `totalPages`, `totalResults`): TMDB's pages, 20 a page, at most 500, which **Show more** walks. Each `DiscoverMovie` carries `inLibrary`.
  - With a query: TMDB's movie search (`/3/search/movie`, adult titles left out).
  - Without one, `list` picks the tab: `trending` (TMDB's trending this week, the default; TMDB's trending takes no region), `popular`, `now-playing` or `upcoming` (TMDB's lists for the server's region).
- **Adding:** `movies.add({ body })` → `POST /api/v1/movies`. Staff. `AddMovieInput` is `tmdbId`, `rootFolder` (a root folder's path), `monitored`, `minimumAvailability`, `languageProfileId`, `versions` (the dialog sends one: the quality profile, labelled with its name) and `searchNow`. 201 with the `Movie`; a movie already in the library comes back unchanged with 200. `searchNow` answers 409 (`no-indexers`) while no indexer is enabled; with one, the movie is added and a search is queued.
- **The add dialog's values** are remembered per person: after each add it saves the preference `admin.addMovie.defaults` (folder, quality profile, subtitle languages, minimum availability, Search now) on the person's layer ([ADR 0027](../adr/0027-preferences-in-layers.md)) through `preferences.save`. Until the first add the dialog starts from the first folder and profiles and Released. Search now is remembered, but stays off while no indexer is enabled.
- **The library:** `movies.list({ query })` → `GET /api/v1/movies`. Staff: the apps read the library through `/items` ([client-search.md](client-search.md#data)). Filters `status`, `title` (anywhere in the title or original title, ignoring case and accents), `qualityProfileId` (the first version's), `monitored`; `sort` is `title` (the default), `added`, `year` or `rating`, with `dir`. A `MoviePage`, paged by cursor: `items` (60 by default, `limit` up to 200), `next` (pass it back as `cursor`; null on the last page), `total`, and `counts` for the status tabs (every filter but `status`). The admin keeps sort and filters in the address, so Back keeps them.
- `Movie` is the TMDB facts the lists need (title, original and sort title, year, runtime, genres, synopsis, `rating` out of 5, `voteCount`, release date, `art`), and the library's own: `status` (`available`, `wanted`, `downloading`, `not-released`, `unmonitored`), `monitored`, `minimumAvailability`, `languageProfileId`, `qualityProfileId` (the first version's), `rootFolder`, `path`, `addedAt`, `versions` and `gone` (TMDB removed or merged the id).
- **One movie:** `movies.get({ params: { id } })` → `GET /api/v1/movies/{id}`, staff; 404 when it isn't in the library, and its page shows the metadata alone. `movies.update({ params, body })` → `PATCH`: monitored, minimum availability, subtitle languages, root folder. `movies.delete({ params, query: { deleteFiles? } })` → `DELETE`; its metadata stays cached.
- **Versions** ([ADR 0012](../adr/0012-unified-media-item-model.md)): `movies.addVersion` → `POST /api/v1/movies/{id}/versions`, `movies.updateVersion` → `PATCH …/versions/{versionId}` (rename, or change the profile), `movies.removeVersion` → `DELETE …/versions/{versionId}`. Staff. Each answers with the whole `Movie`. A movie keeps at least one version: removing the last answers 409 (`last-version`).
- **Refresh:** `movies.refresh({ params: { id } })` → `POST /api/v1/movies/{id}/refresh`. Staff. 202: it queues the refresh job, and `metadata.updated` follows when it's done.
- **Bulk:** `movies.bulk({ body })` → `POST /api/v1/movies/bulk`, with an `action`: `monitor`, `unmonitor`, `setQualityProfile` (the **first** version's; extra versions keep their own), `search` (queues a search per movie; 409 `no-indexers` while no indexer is enabled), `refresh` or `delete` (with `deleteFiles`). Staff. `BulkResult` lists the `ids` it applied to and those `missing` from the library.
- **The dashboard's movie sources:** `movies.upcoming({ query: { days? } })` → `GET /api/v1/movies/upcoming`: monitored movies released in the next 14 days (or `days`, up to 366), soonest first, by the region's release dates, for Upcoming and Calendar. `movies.recent({ query: { limit? } })` → `GET /api/v1/movies/recent`: the 8 (or `limit`, up to 50) added last, for Recently added. Everyone signed in: the apps' home shows Recently added too.
- **Root folders:** `rootFolders.list()` → `GET /api/v1/rootfolders`: `RootFolder` with `path`, `free`, `total` and `device` (null when unreadable), `accessible` and the count of `movies` filed under it. `rootFolders.add({ body: { path } })` → `POST` and `rootFolders.remove` → `DELETE /api/v1/rootfolders/{id}`, staff. Adding checks the path is absolute, exists and is writable (400 `not-absolute`, `not-found` or `not-writable`; 409 inside or around another); removing one in use answers 409 (`in-use`, with `details.counts` of the titles filed under it by type, such as `{ movie: 2 }`). Root folders, profiles, formats and sizes are `@highsea/media/shared`'s, one set for every media type (ADR 0036). Managed in Settings › Media management.
- **Profiles:** `quality.profiles()` → `GET /api/v1/qualityprofiles[/{id}]` and `quality.languageProfiles()` → `GET /api/v1/languageprofiles`; seeded and read-only until checkpoint 8.
- **Without a TMDB key,** Discover and adding answer 503 with `details.reason` `no-tmdb-key`; `tmdb-unreachable` (503) and `tmdb-rate-limited` (429) when TMDB doesn't answer. The library and its pages read the cache.
- **Release search** (checkpoint 5), staff:
  - `movies.interactiveSearch(id)` → `POST /api/v1/movies/{id}/search` (a `POST`, because it costs every indexer a query): `{ releases, searched, failed }`. Each `Release` has `approved`, `reasons: { kind: 'accepted' | 'rejected' | 'warning'; message }[]`, `protocol`, nullable `size`, `seeders`, `leechers`, `ageHours` and `publishedAt`, and indexer `flags`. 409 `no-indexers` while no indexer is enabled;
  - `movies.releases(id)` → `GET /api/v1/movies/{id}/releases`: the last search's `Release[]` from the last 30 minutes, best first.
- **Search now and bulk Search** queue a background search once an indexer is enabled; checkpoint 6 grabs what it finds. With no enabled indexer they still answer 409 `no-indexers`.
- Later, with their checkpoints:
  - `movies.files(id)` → `GET /api/v1/movies/{id}/files` (`MediaFile` with ffprobe `streams`);
  - `movies.history(id)` → `GET /api/v1/movies/{id}/history`;
  - `movies.grabRelease(id, guid)` → `POST /api/v1/movies/{id}/releases/{guid}/grab`;
  - `subtitles.forItem(id)`, `subtitles.search(id, language)`, `subtitles.download(id, result)`, `subtitles.sync(trackId)`, `subtitles.setOffset(trackId, ms)`, `subtitles.delete(trackId)` → `/api/v1/movies/{id}/subtitles…` and `/api/v1/subtitles/{trackId}…`.
- Events: `movies.updated` (the library changed; ids are TMDB ids), `item.updated` (one title's library layer; ids `movie:{id}`), `metadata.updated` (after a refresh; ids `movie:{id}`, `person:{id}`, `collection:{id}`). Later: `history.updated`, `queue.changed`, `subtitles.updated`.

## Decisions

- **Discover shows the library too,** marked In library and linked, instead of hiding it. Searching for a movie you already have should say so, not come back empty.
- **Details on the movie's page, not in a dialog** (replaces checkpoint 2's details dialog). Cast, crew, trailers, collections and recommendations need the room, and one page for every state means one place to learn a title ([ADR 0014](../adr/0014-universal-media-pages.md)). Discover keeps its search in the history entry (`/discover?q=nanook` in the product), so Back returns to the same results.
- **Status on the art, not under it.** A status chip in the caption wrapped or overflowed depending on the title and label lengths, and appeared and disappeared live, so cards jumped. On the art it takes no layout space; the quality tags already set that pattern.
- **Every media table leads with a thumbnail.** `TitleCell` takes `art`, so series, music and books tables get the same row shape. The thumbnail is decorative (empty alt): the title beside it names the row.
- **One dialog, defaults filled.** The prototype starts from the first folder, HD 1080p and English; the product remembers the last-used folder, profiles, availability and Search now per person, as the preference `admin.addMovie.defaults` (checkpoint 4). Search now is on, because the usual intent of adding is "get it".
- **Grid and table share one frame,** filters and sort, so switching views keeps your place. Selection and bulk edit live in the table only: posters are for browsing.
- **Bulk quality profile changes the first version.** A 4K version added beside a 1080p one is a deliberate second profile; a bulk edit shouldn't flatten it.
- **Two versions are one item** with a tag per version, never two rows (ADR 0012).
- **Rejected releases are shown by default,** with the reasons one click away. The point of interactive search is usually "why didn't it grab this?".
- **Grab anyway exists,** but is a ghost button with a warning tooltip, never the primary.
- **The offset nudge is 50 ms,** matching the player's nudge (C5), and saves on each step rather than through a form.
- **Embedded subtitle streams appear in the tracks table** as read-only rows, so the tab answers "what can people watch with" in one place.

- **Discover's lists are tabs:** Trending, Popular, Now playing and Upcoming, for the server's region (owner's decisions, 2026-10-20: [checkpoint 4 plan](../plans/phase-3-checkpoint-4.md#owners-decisions)).
- **Before indexers exist, search is shown but disabled,** with the reason and a link, rather than hidden: the owner learns where it will be (owner's decisions, 2026-10-20: [checkpoint 4 plan](../plans/phase-3-checkpoint-4.md#owners-decisions)).

## Open questions

- **Discover by genre and import lists.** Genre browsing, and the owner's import lists as Discover sources, are still open.
- **Library columns.** Should the table's columns be choosable (size, quality profile, path, rating), as in Radarr?
- **Per-version actions.** Searching or upgrading one version (just the 4K) needs a version picker on Search; the prototype searches the movie.
- **Release details.** Should a release row open the indexer's page, and show its file list before grabbing?
