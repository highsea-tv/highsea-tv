# Media pages and people

- **Platforms:** Admin (`apps/server`), every breakpoint. The clients' item detail (C4) reuses the metadata layer.
- **Prototype:** `#/admin/movies/1` (Sintel, in the library), `#/admin/movies/107` (Nanook of the North, not added), `#/admin/movies/30` (a collection with parts missing), `#/admin/people/fritz-lang` (a person).
- **Roadmap:** [Phase 2 › A4, A6](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes). Decision: [ADR 0014](../adr/0014-universal-media-pages.md). Media model: [ADR 0012](../adr/0012-unified-media-item-model.md).

## Purpose

Every title has one page, whether it's in the library or not. Before adding, the page answers "is this the one, and do I want it?": what it is, who made it, trailers, the collection it belongs to, and what's like it. After adding, the same page also runs it: versions, files, history, interactive search and subtitles. People get pages too, so a director's other films are a click away and each one says whether it's here.

Movies are built in the prototype. Shows, music, books, podcasts and online video are specified below so they plug into the same anatomy; they aren't built in Phase 2.

## Entry points

- **Discover:** every poster opens its page. Library titles open their library page; the rest open the metadata page.
- **Library, dashboard widgets, Activity, ⌘K:** titles link to their page.
- **On a page:** cast and crew open people; collection parts and recommendations open their own pages.
- **People:** each filmography row opens its title's page.

## Addresses

| Page | Address | Notes |
| --- | --- | --- |
| Movie | `/movies/{id}` | |
| Show | `/shows/{id}` | Seasons are a section of the show's page; an episode opens in a sheet over it. |
| Artist, album | `/music/artists/{id}`, `/music/albums/{id}` | A track opens in a sheet over its album. |
| Book | `/books/{id}` | |
| Podcast, channel | `/podcasts/{id}`, `/channels/{id}` | |
| Person | `/people/{id}` | Cast, crew, authors and artists' members. One person, one page, across types. |

`{id}` is always the title's **media id**: its database id, never a slug or a provider id. The server creates a title's row the first time it sees it (in search results, trending, a filmography, a collection, a recommendation), so every title shown anywhere already has an id and its page resolves, in the library or not. Adding a title marks its row as in the library; the id and the address stay the same, and the page gains its library layer in place. Every way to a title (Discover, the library, the dashboard, people, collections, ⌘K) links to that one address, and two titles with the same name never compete for it.

## Layout

The anatomy every media page shares.

- **Page header:** the title; actions by state (see States).
- **Summary card:** the backdrop at 15% behind it; the poster (9rem column from medium, stacked on compact); a facts line (year, runtime, certification, genres, rating); the tagline; "Directed by …" (people as links; "Created by" for shows, the artist for albums, "By" for books); status badges; the synopsis (65ch); then the library line (path, **Monitored**) once added.
- **Tabs** (line variant):
  - **Overview:** always.
  - **Cast and crew:** always.
  - The type's own sections (Seasons for shows; Albums for artists; Tracks for albums; Editions for books).
  - **Files**, **History**, **Search** (staff), **Subtitles:** once added.
- **Overview:** two columns from expanded, a main column and a 20rem aside.
  - Main:
    - **In the queue** while it downloads;
    - **Cast**: the top-billed ten as a row of portraits, with **All cast and crew**;
    - **Trailers**: stills with their kind and length;
    - **Collection**: its name, how many parts are here, the parts as posters in release order with **Add {n} missing**;
    - **More like this**: recommendations as posters, each marked if it's in the library.
  - Aside:
    - **In the library** (once added): versions with their profiles, subtitle profile, minimum availability, root folder;
    - **About**: release status and date, original title (when it differs), original language, certification, runtime, budget and box office (when known), studios, and links to TMDB, IMDb and Wikidata.
- **Cast and crew tab:** cast as a grid of portraits (name, then character), in billing order; then crew grouped by department (Directing, Writing, Production, Camera, Editing, Sound, Art), each person with their jobs.
- **Trailer dialog** (`lg`): a 16:9 player; the video's name, kind and date under it.
- **Rows** are `CarouselRow`s with `flush`, so they line up with the column: one tab stop each, arrows move between items, and paging arrows show on hover. Titles in rows carry an **In library** overlay badge when they're here.

### Person page

- **Page header:** the name.
- **Summary card:** the portrait; known for (Acting, Directing, Writing…); born and died with places, when known; the biography (65ch), or "TMDB has no biography for {name} yet."
- **Known for:** their most-rated titles as a poster row, once they have three or more.
- **Filmography:** a `TableFrame` with tabs (All, In the library, Not in the library) and a count. Columns: title (thumbnail and year), role (the character, or the jobs), and library state: **In library** (links to the page) or **Add** (staff). Newest first.

## By media type

Each type keeps the anatomy above and adds its own sections. Only movies are built in Phase 2.

| Type | Metadata | Its own sections | Library layer |
| --- | --- | --- | --- |
| **Movie** | TMDB | Collection, More like this | Versions, files and streams, history, interactive search, subtitles |
| **Show** (and anime) | TVDB, TMDB, TVmaze; TheXEM for scene numbering | **Seasons**: a season picker (Specials last), then the season's episodes as a table: number, title, air date, runtime, status, monitored, file quality. An episode opens a sheet with its synopsis, guest cast, still, files and subtitles. Networks, the next airing, and the show's status (Continuing, Ended) in the summary. | Monitoring per season and per episode, season-pack search, files, history, subtitles |
| **Artist** | MusicBrainz | **Discography** grouped by release type (Albums, EPs, Singles, Live, Compilations), each with its library state; members and their instruments as people; similar artists | Monitored release types, files, history |
| **Album** | MusicBrainz, Cover Art Archive | **Tracks**: disc and number, title, length, credits (writers, producers, featured artists), quality (FLAC 24/96, MP3 320), status; the release group's editions; lyrics | Album monitoring, the chosen edition, files with tags and AcoustID matches, history |
| **Book, audiobook** | Open Library, Google Books, Audible | **Editions** (format, publisher, pages or narrated length, language); the series with its order; the author as a person; chapters for audiobooks | Wanted formats, files, history |
| **Podcast** | The feed | **Episodes**: date, title, length, played, file | Auto-download rules, retention |
| **Online video** | yt-dlp | **Videos**: upload date, title, length, file | Channel rules (keep the last N, a date range), files |

## States

- **Not in the library:**
  - Header: **Add movie** (staff), which opens the add dialog; once added, the same page at the same address gains the library layer.
  - Summary: a "Not in the library" badge; the release date ("Released 1 June 1922" or "Releases 6 November 2026") in place of the library line.
  - Tabs: Overview and Cast and crew only.
  - Members: no header action; the summary says "Only owners and admins can add movies. Ask the server's owner for this one."
- **In the library:** as [movies.md › Movie detail](movies.md#movie-detail-a6), plus the metadata layer: Search, Interactive search and More in the header; the status badge and quality tags; every tab.
- **Not released:** the release line says "Releases {date}"; Trailers usually has a teaser only.
- **Loading:** a poster and text skeleton for the summary; each row shows poster skeletons; the filmography shows row skeletons.
- **Empty sections are left out,** with two exceptions that say so: Cast and crew ("TMDB doesn't list a cast for this title") and the filmography filters ("Nothing here yet").
- **Error:** an unknown metadata id: "TMDB doesn't know that title" · It may have been merged or removed. · **Go to Discover**. An unknown library id: "That movie isn't in the library." · **Go to Movies**. A failed row shows "Couldn't load {section}" with **Try again**, without taking the page down.
- **Live:** adding from the page swaps it to the library state at once; a person's filmography and a collection's parts update their badges as titles are added.

## Interactions

- **Add movie** (header, filmography **Add**) opens the add dialog from Discover. From a title's own page, adding replaces the address with the library one and stays on the page.
- **Add {n} missing** (collection) opens the same dialog for all the missing parts: one set of options, then each part is added with them. The dialog lists the titles it will add.
- **Trailers** load nothing from YouTube until clicked. A click opens the dialog and plays the video from `youtube-nocookie.com` (in the prototype, a still and a note stand in for the player). Escape closes it and returns focus to the trailer.
- **All cast and crew** switches to the Cast and crew tab.
- **People** link from portraits, the "Directed by" line and the crew list.
- **Keyboard:** each row is one tab stop with arrow keys inside; tabs, the table and dialogs are native or Radix.
- **Sound:** none.

## Copy

| Where | Text |
| --- | --- |
| Not in the library badge | Not in the library |
| Member note | Only owners and admins can add movies. Ask the server's owner for this one. |
| Collection | {Name} · {n} of {total} in the library |
| Collection action | Add {n} missing |
| Add missing dialog | Add {n} movies · They're added with the same options. You can change each one later. |
| Trailer card | {Kind} · {m:ss}, with a play mark on the still |
| Trailer player (prototype) | In highsea this plays from youtube-nocookie.com, and only after you click. The prototype doesn't load YouTube. |
| No biography | TMDB has no biography for {name} yet. |
| No cast | TMDB doesn't list a cast for this title. |
| Unknown metadata id | TMDB doesn't know that title · It may have been merged or removed. |

## Data

- `metadata.movie(id)` → `GET /api/v1/movies/{id}/metadata`, by media id in any state: `MovieMetadata` (title, original title and language, tagline, certification, runtime, genres, rating, release date, budget, revenue, studios, external ids, art) with `cast`, `crew`, `videos`, `collection` and `inLibrary`.
- `metadata.recommendations(id)` → `GET /api/v1/movies/{id}/recommendations`: `DiscoverMovie[]`, each with its media `id` and `inLibrary`.
- Every `DiscoverMovie` (Discover, filmographies, collections) carries its media `id`, so links need nothing else.
- `metadata.collection(id)` → `GET /api/v1/metadata/collections/{id}`: `Collection` with its parts as `DiscoverMovie[]`.
- `metadata.person(id)` → `GET /api/v1/metadata/people/{id}`: `Person` with `credits` (each a `DiscoverMovie` with the role).
- `movies.get(id)` and the rest of the library layer: [movies.md › Data](movies.md#data).
- The server caches metadata (per title, refreshed with the library's metadata refresh) so pages open fast and TMDB is asked sparingly.
- Events: `movies.updated` (library state changes).

## Decisions

- **One page, two layers** ([ADR 0014](../adr/0014-universal-media-pages.md)). Discover and the library open the same page; adding a title adds a layer instead of moving you somewhere else.
- **Addresses are media ids, not slugs or provider ids.** A title has its id before it's added and keeps it after, so a link shared before adding still works with no redirect, and two films called *The Stranger* never fight over `/movies/the-stranger`.
- **Trailers embed on click,** from `youtube-nocookie.com`. Nothing loads from Google until someone asks for a video.
- **Not added means no Files, History, Search or Subtitles tabs,** rather than empty ones. Interactive search before adding was considered and left out: adding is one dialog, and searching a title highsea isn't tracking would grab outside any profile.
- **Collections add their missing parts in one dialog,** with one set of options, since parts of a collection are usually wanted the same way.
- **Person pages are shared across types,** so an actor in movies and shows, or an author who also narrates, is one page.
- **Sections that would be empty are left out,** except Cast and crew, which says so: an empty tab is more confusing than a missing row.

## Open questions

- **Recommendations source.** TMDB's recommendations, its "similar" list, or highsea's own from what the library and its people watch?
- **Person pages beyond credits.** Should a person be followable ("add new films by Fritz Lang"), as Radarr does with lists?
- **Certification country.** The prototype shows the US rating. Follow the server's region setting?
- **Shows: episode page or sheet?** The spec opens an episode in a sheet over the season; a full page would make episodes linkable on their own.
- **Images.** TMDB has many posters, backdrops and logos per title. Should the owner be able to pick, per title?
