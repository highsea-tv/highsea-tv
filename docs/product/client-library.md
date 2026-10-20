# Client library

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web/library`, `#/mobile/library`, `#/tv/library` (C3).
- **Roadmap:** [Phase 2 › C3](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off).

## Purpose

Everything the household can watch on this server, to browse rather than search: a poster grid, sorted and narrowed.

## Entry points

- Web: **Library** in the top bar. Mobile: the **Library** tab. TV: **Library** in the global navigation.
- Empty Home on TV: **Library**.

## Layout

- **Media types:** other types (shows, music, books) appear as tabs above the grid only once the server has them. M1 is movies only, so there are no tabs; the page is "Movies".
- **Web:** the title "Movies" and the count; **Genre** and **Sort** selects on the right; a grid of posters (`auto-fill, minmax(9rem, 1fr)`) with the title and year under each, or "8 min left" and the progress bar when started.
- **Mobile:** the large title "Library"; the count ("34 of 34 movies") and **Sort and filter**, which opens a sheet: Sort by (chips), Genre (chips), **Reset**, **Show {n} movies**; three posters a row.
- **TV:** the server identity, then "Movies" and the sort choices (A–Z, Recently added, Newest) at the top right; seven posters a row, each with its title and year under it (and the progress bar when started); the **alphabet rail** at the left edge (A–Z and #), letters without titles dimmed and skipped. The page scrolls by focus; the server identity scrolls away with it, and rows fade out under the top edge. Only the rail stays put, in the left margin.

## States

- **Loading:** poster skeletons in the grid's shape.
- **Empty:** "No movies yet" · When the server's owner adds movies, they show up here.
- **No match:** "No movies match" · Try another genre.
- **Error:** "Couldn't load the library" with **Try again**.
- **Live:** a title appears as soon as it's playable; progress bars follow playback.

## Interactions

- **Sort:** Title (the sort title, so "The General" files under G), Recently added, Newest first, Highest rated (web and mobile).
- **Genre:** one at a time; All by default.
- **TV alphabet rail:** an isolated focus region. **Left** from the grid's first column enters it (a focus guide); **Up**/**Down** move between letters that have titles; **OK** moves focus to the first title for that letter; **Right** returns to the grid. The rail shows only while sorted A–Z.
- **TV sort:** **Up** from the grid's top row reaches the sort choices; **Up** again opens the global navigation.
- **Sound:** TV only: `navigate`, `select`.

## Copy

| Where | Text |
| --- | --- |
| Count (mobile) | {shown} of {total} movies |
| Sheet | Sort and filter · Sort by · Genre · Reset · Show {n} movies |
| Empty | No movies yet · When the server's owner adds movies, they show up here. |

## Data

Through `@highsea/sdk` (the contract is `@highsea/api-contract`'s `library` group), as built in Phase 3, checkpoint 4. Everyone signed in.

- `library.list({ query })` → `GET /api/v1/items?type=&genre=&playable=&sort=&dir=&cursor=&limit=`: a `ClientItemPage` (`items`, `next`, `total`), sorted, filtered and paged on the server. The prototype sorts and filters on the client.
  - `type` is `movie`, the only type yet (every type when absent); `genre` is one genre by name, ignoring case; `playable=true` keeps titles with a file to play.
  - `sort` is `title` (the sort title, the default), `added`, `year` or `rating`, with `dir`: Recently added, Newest first and Highest rated are `added`, `year` and `rating`, newest or highest first.
  - Paged by cursor: up to `limit` (60 by default, 200 at most), and `next` to pass back as `cursor`, null on the last page.
- `ClientItem` is the title's `id` (its TMDB id) and `type`, title, year, runtime, genres, synopsis, `rating` out of 5, `voteCount`, release date, `addedAt`, `status`, `playable`, `art` (poster and backdrop URLs on this server) and this person's place in it: `progress` (0–1, null when not started or finished) and `position` in seconds.
- Until files arrive (checkpoint 6) no title is `playable`; until playback writes positions (Phase 4) none is started.
- **No route lists the genres yet** for the Genre select. `GET /api/v1/genres` comes with the first client (Phase 4), with a genres column that also takes the genre filter off the cached TMDB data (owner's decision, 2026-10-20).
- Events: `movies.updated`, `item.updated`. Later: `watch.updated`.

## Decisions

- **No tabs until there's a second type,** so a movies-only server isn't asked to choose between one option.
- **The alphabet rail is TV-only.** A pointer, a wheel and a touch screen scroll a grid quickly; a D-pad doesn't.
- **Filters live in a sheet on mobile,** behind one button that says when they're on ("Sorted and filtered").

## Open questions

- **More filters:** unwatched, resolution (4K), decade? The owner-facing library has them; the household's may not need them.
- **Collections as a view** ("Night of the Living Dead Collection") once the server tracks them.
