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

### Unwatched

Phase 4's answer 9, prototyped at 4.0b: one filter that hides what this person has watched ([client-detail.md › Mark as watched](client-detail.md#mark-as-watched)). On the web, a **Show** select (All movies, Unwatched) before Genre; on mobile, a **Show** group of chips at the top of the sheet, which counts as filtered and which **Reset** clears; on TV, an **Unwatched** choice after the sorts, past a divider, that turns on and off. With nothing left to show: "No movies match" · You've watched everything here. Try another genre, or show all movies.

### Music's views (prototype-gaps stage 3, 2026-11-01)

Music has four views: **Albums**, **Artists**, **Songs** and **Playlists**. On the web and desktop they're the segmented control (`/music`, `/music/artists`, `/music/songs`, `/music/playlists`), on the phone the pills under Library's Music (`/library/music/…`; `/music/songs` and `/music/playlists` go there), and on the TV the choices beside the title, with each view's sorts on the right. They fit on one line at 1280 × 720.

- **Songs** is one list: the cover, the title and artist, the album (from medium widths on the web) and the length. It's sorted by Title, Artist, Album, Recently added or Most played (the TV's choices are A–Z, Artist, Album, Recently added and Most played), and on the web and phone filtered by genre. Titles sort without a leading "The" or "A". A row plays the list from there, "Playing from Songs"; the song playing shows moving bars over its cover. Each row has the song's ⋯ menu ([player.md › The music player](player.md#the-music-player-prototype-gaps-stage-3-2026-11-01)); on the phone a long press opens it too, and on the TV holding OK. The web and TV keep the A–Z index while sorted by title, artist or album.
- **Playlists** are each person's own: a grid of tiles on the web and TV, a list on the phone, each with a mosaic of its first four covers, its name and how many songs. The web's **New playlist** sits beside the view's control, and the phone's is the list's first row; both ask for a name and open the new playlist. The TV has no New playlist: playlists are made and changed on the other apps.
- **A playlist's page** is laid out as an album's: the first cover blurred behind, the mosaic, "Playlist", the name, "{n} songs, {length}", **Play** (Pause while it plays) and **Shuffle**, then its songs in its order, each with its cover, since they come from many albums. On the web, desktop and phone, ⋯ beside Shuffle has **Rename** and **Delete playlist**; the songs drag by their handles to reorder (Space picks one up from the keyboard, the arrows move it, Space drops it), and each song's ⋯ ends with **Remove from this playlist**. Delete asks first. On the TV the page only plays.
- **Add to playlist** is in a song's and an album's ⋯ menu: the person's playlists, with **New playlist** first. On the web it's a dialog, as ui-web's Menu has no submenu; on the phone, a sheet; on the TV, the menu's next step.

| Where | Text |
| --- | --- |
| No playlists (web, phone) | No playlists yet · Make one here, or choose Add to playlist in a song's or an album's menu. |
| No playlists (TV) | No playlists yet. Make them in highsea on the web or your phone, and they show up here to play. |
| Empty playlist | Nothing here yet · Add songs with Add to playlist, in a song's or an album's menu. |
| Delete | Delete {name}? · Its songs stay in the library. This can't be undone. · Cancel · Delete playlist |
| Toasts | Added to {playlist} · Renamed {name} · {song} removed, From {playlist}. · {name} deleted |
| Not found | This playlist isn't here · It may have been deleted. |

Data, from the mock (the music phase builds it on the server, and its scope checks this design against what the server can keep): `library.songs` (every song with its album and play count), `library.playlists`, `library.playlist(id)` (the playlist and its songs, each with an `entry` that tells two of the same song apart), and `playlists.create`, `rename`, `reorder`, `add`, `remove` and `delete`, with a `playlists.updated` event. Each person starts with two playlists, the same on every load. A reorder shows at once, before the server answers.

### Stage 4 of the prototypes' gaps (2026-11-01)

- **Jump to a letter** on the phone: an A–Z scrubber at the edge of Movies and Shows while sorted by title (# and A to Z, a letter with nothing under it dimmed), which scrolls as a finger slides down it, as iOS's index does. The web's and the TV's rails have the same name.
- **Pull to refresh** on the phone's lists: "Pull to refresh", "Let go to refresh", then "Refreshing". On Offline it also renews downloads whose 30 days have run out, when the server can be reached.
- **The phone's Shows sheet** starts with the legend "Shows" (it said "Show"); Movies' keeps "Show".
- **Empty libraries on the TV:** "No movies yet" · "When the server’s owner adds movies, they show up here.", and "No shows yet" with the same words for shows.
- **Nothing matches** in every app when a filter leaves nothing: the title, a body naming what's set (the genre, Unwatched), and **Show everything**, which clears them.
- **The TV's genre** is a choice beside the sort, "All genres" or the genre picked, opening a menu named "Genre".

## States

- **Loading:** poster skeletons in the grid's shape.
- **Empty:** "No movies yet" · When the server's owner adds movies, they show up here.
- **No match:** "Nothing matches" · Try another genre. · **Show everything**, which clears the filter (on the web since prototype-gaps stage 4; Movies, Shows and Music's albums and songs alike).
- **Error:** "Couldn't load the library" with **Try again**.
- **Live:** a title appears as soon as it's playable; progress bars follow playback.

## Interactions

- **Sort:** Title (the sort title, so "The General" files under G), Recently added, Newest first, Highest rated (web and mobile).
- **Genre:** one at a time; All by default.
- **Unwatched:** off by default, and with the genre and sort as above.
- **TV alphabet rail:** an isolated focus region. **Left** from the grid's first column enters it (a focus guide); **Up**/**Down** move between letters that have titles; **OK** moves focus to the first title for that letter; **Right** returns to the grid. The rail shows only while sorted A–Z.
- **TV sort:** **Up** from the grid's top row reaches the sort choices; **Up** again opens the global navigation.
- **Sound:** TV only: `navigate`, `select`.

## Copy

| Where | Text |
| --- | --- |
| Count (mobile) | {shown} of {total} movies |
| Sheet | Sort and filter · Show · Sort by · Genre · Reset · Show {n} movies |
| Show | All movies · Unwatched |
| Empty | No movies yet · When the server's owner adds movies, they show up here. |

## Data

Through `@highsea-tv/sdk` (the contract is `@highsea-tv/api-contract`'s `library` group), as built in Phase 3, checkpoint 4. Everyone signed in.

- `library.list({ query })` → `GET /api/v1/items?type=&genre=&playable=&sort=&dir=&cursor=&limit=`: a `ClientItemPage` (`items`, `next`, `total`), sorted, filtered and paged on the server. The prototype sorts and filters on the client.
  - `type` is `movie`, the only type yet (every type when absent); `genre` is one genre by name, ignoring case; `playable=true` keeps titles with a file to play.
  - `sort` is `title` (the sort title, the default), `added`, `year` or `rating`, with `dir`: Recently added, Newest first and Highest rated are `added`, `year` and `rating`, newest or highest first.
  - Paged by cursor: up to `limit` (60 by default, 200 at most), and `next` to pass back as `cursor`, null on the last page.
- `ClientItem` is the title's `id` (its TMDB id) and `type`, title, year, runtime, genres, synopsis, `rating` out of 5, `voteCount`, release date, `addedAt`, `status`, `playable`, `art` (poster and backdrop URLs on this server) and this person's place in it: `progress` (0–1, null when not started or finished) and `position` in seconds.
- Until files arrive (checkpoint 6) no title is `playable`; until playback writes positions (Phase 4) none is started.
- A title's page (`library.item`) lists its versions, and since checkpoint 7a each version's `subtitles`: `ClientSubtitle` (`id`, `language`, `label` such as "English (SDH)", `forced`, `hi`, `format`, and `kind`: `embedded` for a stream inside the file, `external` for one highsea downloaded, `bundled` for one the release carried). Embedded streams come first, as the file orders them.
- **No route lists the genres yet** for the Genre select. `GET /api/v1/genres` comes with the first client (Phase 4), with a genres column that also takes the genre filter off the cached TMDB data (owner's decision, 2026-10-20).
- The Unwatched filter (Phase 4): `watched=false` on `library.list`, from `ClientItem.watched`. The prototype filters on the client.
- Events: `movies.updated`, `item.updated`. Later: `watch.updated`.

## Decisions

- **No tabs until there's a second type,** so a movies-only server isn't asked to choose between one option.
- **The alphabet rail is TV-only.** A pointer, a wheel and a touch screen scroll a grid quickly; a D-pad doesn't.
- **Filters live in a sheet on mobile,** behind one button that says when they're on ("Sorted and filtered").

## Open questions

- ~~**More filters:** unwatched, resolution (4K), decade?~~ Unwatched only ([Phase 4's answer 9](../plans/phase-4-clients.md#the-owners-answers)), [above](#unwatched).
- **Collections as a view** ("Night of the Living Dead Collection") once the server tracks them.
