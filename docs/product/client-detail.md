# Client item detail

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web/movies/4`, `#/mobile/movies/4`, `#/tv/movies/4` (C4). The address is the title's TMDB id, the same as the admin's ([ADR 0014](../adr/0014-universal-media-pages.md)).
- **Roadmap:** [Phase 2 › C4](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off). The admin's media page is [media-pages.md](media-pages.md); this is the household's view of the same title.

## Purpose

Decide to watch, and how: Play or Resume, with the version, audio and subtitles this person prefers for this title. Then who's in it, and what else is like it.

## Entry points

- Posters on Home and Library, stills in More like this; **More info** on the web's featured card and **Details** on the TV's hero.
- **An episode** (prototype-gaps stage 2, 2026-11-01) opens its show's page at it, `/shows/{id}/episodes/{episode}`: the episode's season chosen and its row scrolled into view (on the TV, focused). Search's episodes and Continue watching's **Go to the show** use it.

## Layout

- **Web:**
  - a backdrop header (68% of the viewport from medium) behind the translucent top bar: the title, meta (year, runtime, genres, rating, quality tags), the synopsis, "Directed by", then **Play** or **Resume**, **Play from the start** and "8 min left" when started, and the progress bar;
  - **Watch with:** Version (a select when there are several, otherwise the version's description), Audio, Subtitles (Off first), in three columns from medium, and "Remembered for this movie, on all your devices.";
  - **Cast:** portraits with the name and character, up to twelve, in a wrapping grid;
  - **More like this:** 16:9 stills, as Continue watching's, on a film's page and a show's alike (the owner's answer 10, prototype-gaps stage 4).
- **Mobile:** the backdrop across the top with **Back** over it (glass); the title (28pt), meta, **Resume · 8 min left** across the width (48pt), **Play from the start**, the synopsis, "Directed by"; Watch with as stacked fields; Cast and More like this as rows.
- **TV:** the ambient backdrop (the artwork blurred 2.6u and dimmed); the poster (13u) beside the title (3.6u), meta, synopsis and "Directed by"; actions **Resume · 8 min left**, **From the start**, **Audio and subtitles**; the current picks in one line ("4K · English · 5.1 · Subtitles off"); Cast (the name and character under each portrait) and More like this (title and year under each poster) as rows below, scrolled into view by focus; the server identity scrolls away with the page.
- **TV Audio and subtitles:** a panel from the right (32u): Version (when several), Audio, Subtitles, "Back closes. Saved for this movie." It's an isolated focus region; picking subtitles closes it.

### Download

Checkpoint 4.0b, on mobile and in the desktop app (not in a browser, which can't keep films; `?app=desktop` in the prototype). It sits under Play on mobile, across the width beside **More**, and under the actions on the desktop. One button that becomes where the download has got to:

- **Download** ("Downloading {title} · To this phone." or "this computer"), at the Quality chosen in Offline;
- **Waiting to download** (another is downloading) or **Waiting for Wi-Fi**, with **Cancel**;
- the bar with its percentage, "Downloading · {speed}/s · {left} to go" and **Pause**; paused, "Paused · {done} of {size}" and **Resume**;
- **The download stopped** with **Try again**;
- "Downloaded · plays offline for {n} more days" with **Remove**; expired, "Downloaded · connect to {server} to keep watching it".

The list of every download is [client-settings.md › Offline](client-settings.md#offline).

### Mark as watched

Phase 4's answer 9. On web and mobile, **More** (an icon button after the play actions) opens a menu with **Mark as watched**, or **Mark as unwatched** once it's watched. On TV, holding OK on the actions for 0.6 s opens the same choice in a small dialog (Back closes it); a shorter press still plays. Under the picks, "Hold OK for more" (and "Watched ·" before it once it is).

- Watched means played to the end, for this person only. Marking it watched removes it from Continue watching; marking it unwatched starts it from the beginning next time ("It plays from the start next time.").
- The toast says "{title} marked as watched" or "marked as unwatched".

### Trailer

On the web, in the desktop app and on the phone, not on the TV until the server keeps trailer files (the owner's answers 2, 9 and 10 at [B1's review](../plans/one-client-platform-b.md#the-owners-answers-at-b1s-review)). When the film has a trailer on YouTube (its first trailer, or a teaser before release), **Trailer** is a round action after From the start. It opens a large dialog titled with the video's name: the player in a 16:9 frame, YouTube's privacy-enhanced embed from `www.youtube-nocookie.com`, loaded only once the dialog opens and playing at once, and the video's kind under it (the prototype's "kind · length": the API has no length, as TMDB gives none). On the phone the embed is in a WebView. The prototype, which loads nothing from YouTube, draws the still with a note instead.

### Shows, people and soundtracks (prototype-gaps stage 3, 2026-11-01)

- **A show's page has the film page's round buttons** beside Play: From the start (of the episode Play plays), **Trailer** when the show has one, **Audio and subtitles** (the show's languages, picked once and applied to every episode; the TV's panel says "Back closes. Saved for every episode."), **Mark show as watched**, drawn on its own so it stays when no episode is left, and in the desktop app and on the phone, **Download** for that episode.
- **Download for episodes, seasons and albums** (the screens 4.6 builds): an episode's row has a download icon with the progress ring, each season **Download season** beside Mark season as watched, and an album Download beside Play and Shuffle. The phone's stays in the prototype as 4.6's design; `apps/mobile` hides it until 4.6.
- **Soundtrack:** a film whose score is an album here has a **Soundtrack** line in Information, the album's title as a link to it. On the TV it's a stop of its own inside the card.
- **Their music:** a person who is also an artist here has **Their music** on their page, opening the artist page, as the artist page has **Their films and shows**. It sits under the facts on the web, under the biography on the phone, and as a button under the facts on the TV, between the head and the first row.

### Stage 4 of the prototypes' gaps (2026-11-01)

- **The phone's tab bar** keeps the tab a page was opened from: a film opened from Search keeps Search marked, and from Home, Home. A page opened before any tab, from a link, marks Library for a film, show or album and Home otherwise.
- **The TV's episodes:** holding OK on an episode opens a menu with **Mark as watched** (or **Mark as unwatched**) and **From the start**; a short press plays. Each episode's label ends "Hold OK for more."
- **The TV's errors** name the way out: the player's error has **Home**, a film's page **Movies** and a collection's **Collections**.
- **The web's error** for a film that's gone: "It may have been removed. Search finds everything you can watch."

## States

- **Loading:** skeletons for the title, buttons and text on every form factor, the TV's at its sizes (B1 of the one client platform converged the TV onto the skeletons, for the owner's approval; it was a spinner).
- **Not on this server** (removed, or never playable): "That title isn't on this server." with **Go home**.
- **Not started / started:** Play, or Resume with what's left and Play from the start.
- **One version:** no version choice; its description shows instead.
- **Live:** progress follows playback on other devices.

## Interactions

- **Play / Resume** opens the player (C5); **Play from the start** opens it at 0.
- **Watch with** saves as it changes, per person and title; the player starts with these picks.
- **Download** and **More** as above.
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
- Mark as watched (Phase 4): `playback.setWatched(id, watched)`, and `ClientItem.watched` (played to 95% or more, as Continue watching already counts it). In the prototype it moves the position to the end, or clears it.
- Events: `movies.updated`, `item.updated`. Later: `watch.updated`.

## Decisions

- **Picks are per title and per person,** and follow you across devices, so subtitles turned on at the TV are on at the phone too. Whether the version should follow you as well is an open question.
- **Cast isn't linked on the clients.** People pages are an admin tool for now ([media-pages.md](media-pages.md)); the household browses titles.
- **Related titles must be playable here.** Recommendations of things the server doesn't have belong in requests (later).

## Open questions

- **Version per device:** should the version pick be per device class (TV prefers 4K, phone prefers 1080p) rather than per title?
- ~~**Trailers on the clients:** the admin embeds them on click; should clients too?~~ Yes on the web, the desktop app and the phone, through YouTube's privacy-enhanced embed (a WebView on the phone); the TV waits for trailer files ([the owner's answers at B1's review](../plans/one-client-platform-b.md#the-owners-answers-at-b1s-review)).
- ~~**Mark as watched / unwatched:** in a More menu (web, mobile) and a long-press of OK (TV)?~~ Yes ([Phase 4's answer 9](../plans/phase-4-clients.md#the-owners-answers)); prototyped at 4.0b, [above](#mark-as-watched).
