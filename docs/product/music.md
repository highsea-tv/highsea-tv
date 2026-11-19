# Music: artists, albums, Unmatched, an artist's page and an album's

- **Platforms:** Admin (`apps/server`), compact and regular windows.
- **Screen:** `packages/admin/src/music-library.tsx` (Artists, Albums, Unmatched), `music-detail.tsx` (an artist's page and an album's), `music-data.ts` and `music-messages.ts`; Music's parts of `media-management.tsx` (with `track-naming.ts`), `widgets.tsx`, `system.tsx` and `now-playing.tsx`. They're drawn only when public info's `sources` lists music (`serves.tsx`), on the drafted `musicLibrary` contract group (`packages/api-contract/src/music-library.ts`), so the prototype's mock shows them; `apps/server` answers that group 501 and has no `/music` page until Phase 5's part D builds it.
- **Prototype:** `#/admin/music`, `#/admin/music/albums`, `#/admin/music/unmatched`, `#/admin/music/artists/marisol-vega`, `#/admin/music/albums/nocturne-michi-chopin-nocturnes` (and `/files`). Drawn with HT-68 and approved by the owner on 2026-11-19 ("Approve with recommendations", [the decisions](#decisions-2026-11-19)), for [Phase 5's part D](../plans/phase-5-real-use.md), the owner's answers 10 and 12, and stage 7 of [prototype-gaps.md](../plans/prototype-gaps.md).
- **Reference:** [shows.md](shows.md) and [movies.md](movies.md), which these pages are laid out as, and Lidarr's artist index, artist page, album page and Unmapped files.

## Purpose

The admin's side of the owner's music. Music is **read where it is**: highsea finds the albums in the Music folders, reads each file's tags, then fills in what it can from MusicBrainz and the Cover Art Archive. There's nothing to search for or download (answer 12), and no TMDB. So the admin's pages are about what's on disk and how well it was read: the **library** lists artists and albums and where their details came from, **Unmatched** holds the folders the scan couldn't read as one album, an **artist's page** lists their albums, and an **album's page** its discs, tracks and files with each file's format, bitrate and size.

## Entry points

- Sidebar: **Music**, after Shows, when the server serves music. The command palette finds it by "artists", "albums", "tracks", "songs", "unmatched" and "musicbrainz".
- Settings › Media management's Music folder, whose figures name the artists, albums and folders in Unmatched.
- Now playing's song cards and history rows, and the dashboard's Now playing widget, which link a song's album.
- An album's artist, which links the artist's page; an artist's album tiles and rows, which link the album's.

## Layout

### Library (`/music`, `/music/albums`, `/music/unmatched`)

- `PageHeader`: "Music", a **Grid / Table** segmented control (remembered per browser, hidden on Unmatched), and **Rescan** (primary), which reads every Music folder again.
- **Tabs** (line variant) with counts, each its own address: **Artists** at `/music`, **Albums** at `/music/albums`, **Unmatched** at `/music/unmatched`.
- **Artists:** one `TableFrame` holds both views, as Shows' does. Its toolbar: filter chips (All, From MusicBrainz, Tags only), a name or genre filter, and Sort (Name, Date added, Size).
  - **Grid:** round photos, as the clients' artist cards are (`Poster round`), the name, then "3 albums".
  - **Table:** the name with a square thumbnail and the path under it, genres, albums, tracks, size, and where the details came from (**MusicBrainz** in accent, **Tags** neutral).
- **Albums:** the same frame. Filter chips (All, Albums, EPs and singles, Soundtracks, Compilations), a title or artist filter, and Sort (Title, Artist, Date added, Year, Size).
  - **Grid:** square covers, the title, then "Artist · 2020 · EP" (the kind only when it isn't an album).
  - **Table:** the title with its cover and path, artist (linked), year, kind, tracks, format ("FLAC", or "MP3 + FLAC" for a mixed album), size, and where the details came from.
- **The whole library and the A–Z index:** as Movies' and Shows': only what's near the screen is drawn, and sorted by name or title the A–Z index stands along the frame's left edge.
- **Unmatched:** a line saying what it is ("Folders the scan couldn't read as one album. Say what each is, or leave it out. Nothing on disk changes."), then a table: the folder (mono), files, size, **why** (a badge and a line under it), when it was found, and **Match** and **Ignore**. The reasons: No tags (warning), No album tag (warning), More than one album (info), Couldn't open (danger: a file may be damaged or still copying).
- **Match dialog** (`md`): "Every file in {path} joins this album. It's made if it isn't here. The files and their tags stay as they are." Album artist (an artist already here, or a new one), Album, Year (optional), filled in from what the tags said.
- **Ignore** asks first: "It stays on disk, and later scans pass it by."

### Artist page (`/music/artists/{id}`)

- `PageHeader`: the name; **Refresh metadata**, then a More menu with **Open on MusicBrainz** (only with a MusicBrainz id), as a show's header keeps its rarer actions in More.
- **Summary card:** the media page's, with a round photo; the source badge; a line of facts (genres, "3 albums", "29 tracks", size); the biography from MusicBrainz, or "No biography. It comes from MusicBrainz, once they have an id there."; the path; and, when there are any, "2 music videos in their folder, set aside for now."
- **Albums:** a frame headed "Albums · 3 albums", in the library's view: the album tiles without the artist's name, or the albums table without its Artist column. Newest first.

### Album page (`/music/albums/{id}`, `/music/albums/{id}/files`)

- `PageHeader`: the title; **Refresh metadata**, then More with **Open on MusicBrainz** (the release group).
- **Summary card:** the square cover; badges for the source, the kind (when it isn't an album) and the formats; a line of facts (the artist, linked; year; "21 tracks"; "2 discs"; the length; size); a second line (released, label, genres); the path.
- **Tabs** (line variant), each with its own address: **Tracks** at `/music/albums/{id}`, **Files** at `/music/albums/{id}/files`.
  - **Tracks:** one frame per disc, headed "Disc 1 · 11 tracks · 46:26 · 1.1 GB" (just "Tracks" for an album of one disc). Its table: number, title (with a guest artist under it, from the track's own artist tag), length, quality (the format's tag and "16-bit · 44.1 kHz" or "320 kbps"), size.
  - **Files:** "21 files · 2.0 GB", then a table: disc (only for an album of several), the file's name with its folder under it, format (with a **Lyrics** badge when an `.lrc` sits beside it), quality (bit depth and rate, or the rate alone for a lossy file), bitrate in kbps, size. Under it, **Also in the folder**: the cover file and `album.nfo`, or "No cover file. The cover comes from the Cover Art Archive."

### Elsewhere

- **Settings › Media management:** **Track naming** joins Naming, under the same save bar: **Rename tracks** (off by default, with "music is read where it is, and a read-only folder is never renamed"), **Track**, **Track on an album of several discs** and **Artist folder**, each with what it becomes, and Lidarr's tokens. A format without `{track:00}` is refused. The Music folder's card names its artists, albums and folders in Unmatched, and has **Scan now**, as a Movies folder has.
- **Storage:** the dashboard's widget lists the Music folder with its album count beside the Movies folders; System › Status's disk line gains "Music 9.3 GB".
- **Now playing:** a song's card shows its album's cover, square, at the poster's width, its title, then "Artist · Album" where a film has its year; the title links the album. The history's row is the same, with the column reading **Title** and the count "15 titles played" once songs are among them. The dashboard's widget adds the "Artist · Album" line.

## States

- **Loading:** the grids show poster skeletons, the tables their own, the artist and album pages the summary skeleton.
- **Empty:**
  - No Music folder: "No music yet" · Add the folder your music lives in. highsea reads each album's tags, then fills in what it can from MusicBrainz. · **Add a Music folder** (Settings › Media management). Rescan is disabled.
  - A folder with nothing found: "No music yet" · Nothing found in your Music folders yet. Rescan once the files are there.
  - A filter with no matches: "Nothing matches. Try another filter."
  - Unmatched: "Nothing set aside" · Every folder in your Music folders reads as an album. Any the next scan can't read wait here.
  - An artist with no albums: "No albums here" · Their albums leave when their files do. Rescan once they're back.
  - An album with no tracks: "No tracks. They leave when their files do."
- **Error:** an id that isn't here shows the server's message (as "That artist isn't in the library."), "It may have been removed, or the scan read its files under another name.", and **Go to Music**. A list that fails to load shows `Loadable`'s error with **Try again**.
- **Live:** every page follows `music.updated`: Rescan, a match, an ignore and a refresh update the counts and the lists.

## Interactions

- **Rescan:** reads each Music folder again (`rootFolders.scan`), then toasts "Reading your Music folders" · "New albums are added as they're found, and changed tags are read again."
- **Match:** checks the artist and album aren't empty and a year has four digits, then toasts "{Album} is in the library"; the folder leaves Unmatched and the album joins Albums, its details from the tags.
- **Ignore:** after the confirm, the folder leaves Unmatched and toasts "Ignored {path}".
- **Refresh metadata:** toasts "Reading {name}'s tags again", then "Then MusicBrainz and the Cover Art Archive fill in the rest.", or, without a MusicBrainz id, "No MusicBrainz id is known, so the tags are all there is."
- **Open on MusicBrainz:** opens the artist's or the release group's page in the browser.

## What differs from films and shows, and why

- **No Search, no monitoring, no quality profile, no Add.** Music isn't searched for or downloaded (answer 12): it's the owner's own files, so the pages are about what's on disk and how it was read, not about what's wanted.
- **Unmatched instead of Wanted.** A film or show is added before its files arrive; music is found from its files, so the one thing that can need the owner is a folder the scan couldn't read as an album. It's Lidarr's Unmapped files, kept per folder, since an album is a folder.
- **Where the details came from.** A film's details always come from TMDB; music's come from tags first, then MusicBrainz and the Cover Art Archive when an id is known. The source badge and the filter say which, since an album read from tags alone is a fact, not a fault.
- **Square art, round artists.** Covers are square and artists round, as the clients draw them. The admin's grids and thumbnails take the library's `square` aspect and `round` poster; no new values.
- **Discs and files.** An album has discs where a show has seasons, and a file's quality is its format, bit depth, sample rate and bitrate rather than a resolution. Files is its own tab, as a show's is, because one album can mix formats.
- **Renaming is off by default.** The owner's music is already named the way they want, so Track naming starts off; films' Naming stays as it is.

## Data

- `musicLibrary.artists()`, `musicLibrary.artist(id)` (`LibraryArtistDetail`: `bio`, `albumList`, `videos`), `musicLibrary.refreshArtist(id)`.
- `musicLibrary.albums()`, `musicLibrary.album(id)` (`LibraryAlbumDetail`: `released`, `label`, `discList` with each track's `TrackFile`, `extras`), `musicLibrary.refreshAlbum(id)`.
- `musicLibrary.unmatched()` (`UnmatchedMusic`: `reason`, the tags' `guess`), `musicLibrary.match(id, { artist, album, year })`, `musicLibrary.ignore(id)`.
- `musicLibrary.folders()`: each Music folder's artists, albums, tracks, size and folders in Unmatched.
- `musicLibrary.naming()`, `musicLibrary.saveNaming(body)` (`TrackNaming`).
- `rootFolders.list()` and `rootFolders.scan(id)`, shared with films.
- Drafted beside them: `system.status()`'s `usedBy.music`, and a session's `item.song` (`{ artist: { id, name }, album: { id, title } }`).
- Topics: `music.updated`, and `settings.updated` for naming.

## Decisions (2026-11-19)

The owner approved the prototype with the words "Approve with recommendations", so each of HT-68's six questions is settled as recommended:

1. **Albums start as a grid of covers,** as Movies and Shows do; the table is one click away and the choice is remembered.
2. **Artists is Music's landing page** (`/music`), as Lidarr and the clients' Library start.
3. **No Remove from library for now.** Music is read where it is, and a remove that left the files would bring them back on the next scan.
4. **An artist without a photo keeps the empty round placeholder** until MusicBrainz has a picture.
5. **Track naming is off by default.**
6. **The dashboard's widgets stay as they are:** at 2 rows a song or the Music folder can sit under "more", and resizing the widget shows them.

## Not drawn yet

- Removing an artist or an album from the library, and deleting their files: left out for now (decision 3).
- Editing an album's details or writing tags back to the files.
- Music videos, playlists' admin side, and anything per track beyond its file.
- Searching for or downloading music (answer 12).
