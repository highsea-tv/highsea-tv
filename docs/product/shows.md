# Shows: the library, a show's page and Add a show

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/shows`, `#/admin/shows/the-lantern-keepers` (and `/files`), `#/admin/discover/shows`. Drawn in stage 6 of [prototype-gaps.md](../plans/prototype-gaps.md#stage-6-shows-in-the-admin) for the TV series phase, which builds it.
- **Reference:** [movies.md](movies.md), which these pages are laid out as, and Sonarr's series index, series page and Add New Series.

## Purpose

The admin's side of shows. The **library** shows every show here, which are still airing, and how many of the episodes highsea watches for are on disk. A **show's page** is where its seasons and episodes are monitored, searched for and checked: each episode's state and file. **Add a show** adds one with everything the pipeline needs, including which episodes to watch for, so one dialog is the only setup.

## Entry points

- Sidebar: **Shows**, after Movies, with the library count.
- Discover's **Movies / Shows** choice (`/discover/shows`), and the Shows page's **Add show** and empty state's **Discover shows**, which open it.
- A person's page, in its **Shows** table and **Known for**.
- The add toast's **Open**.

## Layout

### Library (`/shows`)

- `PageHeader`: "Shows", a **Grid / Table** segmented control (remembered per browser), **Add show**.
- One `TableFrame` holds both views. Its toolbar: tabs with counts (All, Missing episodes, Airing, Ended, Not monitored), a title filter (title, network or year), and Sort (Title, Date added, Next airing, Year, Size).
- **Grid:** posters with an overlay badge only when the show needs a look ("Not monitored", or "3 missing"), the title, then the year and the episode count ("24 of 25"), with a bar under the card: green when every episode is here, amber while some are missing, neutral when the show isn't monitored.
- **Table:** a select column, the title with a poster thumbnail and its path under it, network, status (Airing or Ended), seasons, episodes (the count over its bar), next airing (date, with the episode's code under it), size, monitored.
- **Episode count** is Sonarr's: aired episodes that are monitored or have a file, and how many of them have a file. Episodes still to air don't count. Missing counts what's downloading too, as Sonarr does.
- **Bulk bar:** as Movies': "3 shows selected", **Search**, **Edit** (Monitor, Stop monitoring, then each quality profile), **Remove**, **Clear**.

### Show page (`/shows/{id}`)

- `PageHeader`: the title; **Search** (primary: every monitored episode that's missing or below its cutoff), **Edit**, and a More menu (Refresh metadata, Remove from library). Search is disabled when the show isn't monitored or nothing is wanted.
- **Summary card:** the media page's (poster, backdrop, year, runtime per episode, genres, rating, synopsis), with Airing or Ended and the quality profile as badges, then a line of facts (the years for an ended show, network, seasons, "24 of 25 episodes", size), the next episode to air ("Next: S03E05 “Fresh Start”, 12 Nov 2026"), and the path with the **Monitored** switch.
- **Tabs** (line variant), each with its own address: **Seasons** at `/shows/{id}`, **Files** at `/shows/{id}/files`; one the show doesn't have draws not found.
  - **Seasons:** one frame per season, specials first, then newest first. Its header: a disclosure button with the season's name (the latest season starts open, the rest closed), "8 of 10 · 9.3 GB", the season's **Monitored** switch and **Search**. Open, a table of its episodes: a monitor switch, number, title, air date, status (Available, Missing, Downloading with its progress bar, Upgrade wanted, Not aired), the file (quality tag, size, release group, the file's name with its path on hover, and "One file for S01E01–E02" for a double episode) and a search button. An episode not monitored is drawn in `text-3`. Search is enabled only for a monitored episode that's missing or below the cutoff.
  - **Files:** "85 files · 66.9 GB", then every file once: the episodes it holds (`S01E01–E02` for a double episode), its name with its folder under it, quality, release group and size.
- **Edit dialog** (`md`): **Monitored** (switch), **Quality profile**, **Root folder** (with "Its files move to …" once changed) and **Season folders** (switch). Seasons and episodes are monitored on the Seasons tab, as the dialog's description says.
- **Remove** asks first, with "Also delete its files from disk", as a movie's does.

### Add a show

- **Discover** gains a **Movies / Shows** segmented control before the search field. Shows is its own address, `/discover/shows`, so Back returns to it. Its grid is Movies': poster, title, year and rating, then **Add** or an **In library** badge that links to the show's page. A show not in the library has no page in the admin yet, so its poster doesn't link; Add is its action.
- **Add dialog** (`md`), shared by Discover and person pages: the synopsis, then Folder (full width), Quality profile and Subtitle languages (two columns from medium), **Monitor** (All episodes, Future episodes, Missing episodes, First season, None, with a hint for the one chosen), **Season folders** (switch, on) and **Start searching for missing episodes** (checkbox, on; off and disabled with Monitor set to None). The primary button reads **Add and search** or **Add show**.

### Person page

A person's page ([media-pages.md](media-pages.md#person-page)) lists their shows after the filmography: a **Shows** table with the title (and its years), their role, and **In library** or **Add**. **Known for** mixes films and shows by rating, and the summary's count is both. A person who's only in shows has no Filmography table.

## States

- **Loading:** the grid shows poster skeletons, the show page a poster and text skeleton.
- **Empty:**
  - Library: "No shows yet" · Add a show and highsea finds each episode, downloads it and files it here. · **Discover shows**.
  - A filter with no matches: "No shows match. Try another filter."
  - A show with no seasons: "No seasons yet" · TMDB hasn’t listed any episodes for this show yet.
  - Files: "No files yet" · Episodes show here as they’re imported into {path}.
  - Discover, no results: "Nothing matches "…"" · Try the original title, or a genre.
- **Error:** an id that isn't a show here shows "That show isn’t in the library." with **Go to Shows**.
- **Live:** every page follows `shows.updated`: Search turns missing episodes to Downloading, and a monitor switch updates the counts.

## Interactions

- **Monitor:** the show's, a season's and an episode's switches save at once. A season's switch sets every episode in it; an episode's sets its season on while any episode in it is monitored.
- **Search:** the header, a season's and an episode's buttons look for what's monitored and missing or below its cutoff, then toast "Searching for {what}" · "{n} episodes to find. Follow it in Activity.", or "Nothing to search for in {what}" when every monitored, aired episode has a file at its cutoff.
- **Add:** **Add and search** adds the show, closes, and toasts "{Title} added" with **Open**, which goes to its page.

## Data

- `shows.list()`: the library's rows (`AdminShow`), with `episodes: { monitored, have, total }`, `size` and `nextAiring`.
- `shows.get(id)`: a show with its seasons and episodes (`AdminShowDetail`).
- `shows.rootFolders()`: the folders shows are kept in. Settings › Media management's list per kind replaces it once it lands.
- `shows.discover(query)`, `shows.add(input)` (`AddShowInput`: the folder, profiles, `monitor`, `seasonFolders`, `search`).
- `shows.edit(id, patch)`, `shows.monitorSeason(id, season, on)`, `shows.monitorEpisode(id, episodeId, on)`, `shows.search(id, { season?, episode? })` (returns `{ searched, found }`), `shows.remove(id)`.
- `movies.qualityProfiles()` and `movies.languageProfiles()`, shared with movies until profiles are per kind.
- `metadata.person(id)` gains `shows`: each show they're in, marked `inLibrary`, with their role.
- Topic: `shows.updated`.

## Not drawn yet

- A show's page before it's added (movies have one, ADR 0014), its cast and crew, and its history. The TV series phase scopes them.
- Interactive search for an episode or season, and the delete-files choice on Remove reaching the mock.
