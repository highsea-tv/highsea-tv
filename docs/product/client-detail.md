# Client item detail

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web/movies/4`, `#/mobile/movies/4`, `#/tv/movies/4` (C4). The address is the title's TMDB id, the same as the admin's ([ADR 0014](../adr/0014-universal-media-pages.md)).
- **Roadmap:** [Phase 2 › C4](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off). The admin's media page is [media-pages.md](media-pages.md); this is the household's view of the same title.

## Purpose

Decide to watch, and how: Play or Resume, with the version, audio and subtitles this person prefers for this title. Then who's in it, and what else is like it.

## Entry points

- Posters on Home, Library and More like this; **Details** on the hero.

## Layout

- **Web:**
  - a backdrop header (68% of the viewport from medium) behind the translucent top bar: the title, meta (year, runtime, genres, rating, quality tags), the synopsis, "Directed by", then **Play** or **Resume**, **Play from the start** and "8 min left" when started, and the progress bar;
  - **Watch with:** Version (a select when there are several, otherwise the version's description), Audio, Subtitles (Off first), in three columns from medium, and "Remembered for this movie, on all your devices.";
  - **Cast:** portraits with the name and character, up to twelve, in a wrapping grid;
  - **More like this:** a poster row.
- **Mobile:** the backdrop across the top with **Back** over it (glass); the title (28pt), meta, **Resume · 8 min left** across the width (48pt), **Play from the start**, the synopsis, "Directed by"; Watch with as stacked fields; Cast and More like this as rows.
- **TV:** the ambient backdrop (the artwork blurred 2.6u and dimmed); the poster (13u) beside the title (3.6u), meta, synopsis and "Directed by"; actions **Resume · 8 min left**, **From the start**, **Audio and subtitles**; the current picks in one line ("4K · English · 5.1 · Subtitles off"); Cast (the name and character under each portrait) and More like this (title and year under each poster) as rows below, scrolled into view by focus; the server identity scrolls away with the page.
- **TV Audio and subtitles:** a panel from the right (32u): Version (when several), Audio, Subtitles, "Back closes. Saved for this movie." It's an isolated focus region; picking subtitles closes it.

## States

- **Loading:** web and mobile: skeletons for the title, buttons and text; TV: a spinner.
- **Not on this server** (removed, or never playable): "That title isn't on this server." with **Go home**.
- **Not started / started:** Play, or Resume with what's left and Play from the start.
- **One version:** no version choice; its description shows instead.
- **Live:** progress follows playback on other devices.

## Interactions

- **Play / Resume** opens the player (C5); **Play from the start** opens it at 0.
- **Watch with** saves as it changes, per person and title; the player starts with these picks.
- **TV:** focus starts on Play; **Down** reaches Cast, then More like this; **Up** from a row returns to the actions; Back closes the panel, then goes back.
- **Sound:** TV only.

## Copy

| Where | Text |
| --- | --- |
| Resume | Resume · {n} min left (mobile, TV); Resume, then "{n} min left" beside it (web) |
| Start over | Play from the start (web, mobile) · From the start (TV) |
| Watch with | Remembered for this movie, on all your devices. |
| Not found | That title isn't on this server. · It may have been removed. |

## Data

Through `@highsea-tv/sdk` (the contract is `@highsea-tv/api-contract`'s `library` group), as built in Phase 3, checkpoint 4. Everyone signed in.

- `library.item({ params: { type, id } })` → `GET /api/v1/items/{type}/{id}`, by type and TMDB id (`/api/v1/items/movie/603`), so a movie and a show with the same number stay apart. 404 when the title isn't in the library here. A `ClientDetail`:
  - `item`: the `ClientItem` ([client-library.md › Data](client-library.md#data)), with this person's `progress` and `position`;
  - from the metadata: `originalTitle`, `tagline`, `certification` (for the server's region), `studios`, `cast` and `directors` (`Credit`s with their photos), `videos` and `collection`;
  - `versions`: each version's `id`, `label`, `detail` ("4K · HDR10 · HEVC · 18.2 GB" once it has a file, null until then) and `playable`;
  - `related`: TMDB's recommendations for the title that are in the library here, as `ClientItem`s.
- Later: the versions' audio and subtitle tracks (embedded streams and external files, one per language and kind) and the defaults (this person's picks for the title, or the file's), with files (checkpoint 6); `playback.setPrefs(id, patch)` → `PUT /api/v1/items/{id}/prefs`, with playback (Phase 4).
- Events: `movies.updated`, `item.updated`. Later: `watch.updated`.

## Decisions

- **Picks are per title and per person,** and follow you across devices, so subtitles turned on at the TV are on at the phone too. Whether the version should follow you as well is an open question.
- **Cast isn't linked on the clients.** People pages are an admin tool for now ([media-pages.md](media-pages.md)); the household browses titles.
- **Related titles must be playable here.** Recommendations of things the server doesn't have belong in requests (later).

## Open questions

- **Version per device:** should the version pick be per device class (TV prefers 4K, phone prefers 1080p) rather than per title?
- **Trailers on the clients:** the admin embeds them on click; should clients too?
- **Mark as watched / unwatched:** in a More menu (web, mobile) and a long-press of OK (TV)?
