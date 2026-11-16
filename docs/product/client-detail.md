# Client item detail

- **Platforms:** Web and desktop, mobile, TV.
- **Screen:** `apps/client/src/app/(in)/movies/[id].tsx` (a show's is `shows/[id].tsx`, a person's `people/[id].tsx`), with its parts in `apps/client/src/detail/`.
- **Prototype:** `#/web/movies/4`, `#/mobile/movies/4`, `#/tv/movies/4` (C4); since B2 the prototype's frames hold the client's mock web export ([one-client-platform.md](../plans/one-client-platform.md)). The address is the title's TMDB id, the same as the admin's ([ADR 0014](../adr/0014-universal-media-pages.md)).
- **Roadmap:** [Phase 2 › C4](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off). The admin's media page is [media-pages.md](media-pages.md); this is the household's view of the same title.

## Purpose

Decide to watch, and how: Play or Resume, with the version, audio and subtitles this person prefers for this title. Then who's in it, and what else is like it.

## Entry points

- Posters on Home and Library, stills in More like this; **More info** on the pointer's featured card, and OK on the TV's featured card.
- **An episode** (prototype-gaps stage 2, 2026-11-01) opens its show's page at it, `/shows/{id}/episodes/{episode}`: the episode's season chosen and its row scrolled into view (on the TV, focused). Search's episodes and Continue watching's **Go to the show** use it.

## Layout

One screen by the form-factor rule ([spacing-layout.md](../design-language/spacing-layout.md)), with three compositions. Every one has the film's art, its title, the meta line, **Play** or **Resume** (its progress above it) as the one strong action, the rest as round actions named by their icons (**From the start** while resuming, **Audio and subtitles**, **Mark as watched**, **Trailer** where there is one), three lines of synopsis, "Starring" and "Directed by", and the picks it plays with. Then **More like this**, the collection it's in, **Cast and crew** (each opening the person's page), and **About**, **Information**, and **Languages and quality** as cards.

- **Pointer (web and desktop):** the art full bleed under the top bar, which turns to glass as the page scrolls; the words low on the left; Play or Resume beside the round actions, **Play from the start** named in full; Audio and subtitles in a popover hung from its button (Version when there are several, Audio, Subtitles with Off first, and "Remembered for this movie, on all your devices.").
- **Compact touch (phone):** the art across the top with **Back** over it (glass) and the words below it; Play across the width; the actions as a row of named circles; Audio and subtitles in a sheet; Download under Play.
- **TV:** its own composition: the art sharp across the first screen and past it, the server's head over it (Down from the head reaches the actions), Play taking focus; the picks in one line ("4K · English · 5.1 · Subtitles off"); the rows below as the TV's, scrolled into view by focus. **Audio and subtitles** is a dialog at the right: Version (when several), Audio, Subtitles, "Back closes. Saved for this movie." It's an isolated focus region, and Back closes it before it leaves the page.

### Download

Checkpoint 4.0b, on mobile and in the desktop app (not in a browser, which can't keep films; `?app=desktop` in the prototype). It sits under Play across the width on the phone, and after the round actions in the desktop app. One button that becomes where the download has got to:

- **Download** ("Downloading {title} · To this phone." or "this computer"), at the Quality chosen in Offline;
- **Waiting to download** (another is downloading) or **Waiting for Wi-Fi**, with **Cancel**;
- the bar with its percentage, "Downloading · {speed}/s · {left} to go" and **Pause**; paused, "Paused · {done} of {size}" and **Resume**;
- **The download stopped** with **Try again**;
- "Downloaded · plays offline for {n} more days" with **Remove**; expired, "Downloaded · connect to {server} to keep watching it".

The list of every download is [client-settings.md › Offline](client-settings.md#offline).

### Mark as watched

Phase 4's answer 9. **Mark as watched** is a round action beside Play on every form factor, **Mark as unwatched** once it's watched; the round actions replaced the web's and phone's More menu and the TV's hold of OK on a film's page. On the TV the picks line starts "Watched ·" once it is.

- Watched means played to the end, for this person only. Marking it watched removes it from Continue watching; marking it unwatched starts it from the beginning next time ("It plays from the start next time.").
- The toast says "{title} marked as watched" or "marked as unwatched".
- The TV's episodes and the music player keep the hold of OK for their menus ([below](#stage-4-of-the-prototypes-gaps-2026-11-01)).

### Trailer

On the web, in the desktop app and on the phone, not on the TV until the server keeps trailer files (the owner's answers 2, 9 and 10 at [B1's review](../plans/one-client-platform-b.md#the-owners-answers-at-b1s-review)). When the film has a trailer on YouTube (its first trailer, or a teaser before release), **Trailer** is a round action after From the start. It opens a large dialog titled with the video's name: the player in a 16:9 frame, YouTube's privacy-enhanced embed from `www.youtube-nocookie.com`, loaded only once the dialog opens and playing at once, and the video's kind under it (the prototype's "kind · length": the API has no length, as TMDB gives none). On the phone the embed is in a WebView. The prototype, which loads nothing from YouTube, draws the still with a note instead.

### Shows, people and soundtracks (prototype-gaps stage 3, 2026-11-01)

- **A show's page has the film page's round buttons** beside Play: From the start (of the episode Play plays), **Trailer** when the show has one, **Audio and subtitles** (the show's languages, picked once and applied to every episode; the TV's panel says "Back closes. Saved for every episode."), **Mark show as watched**, drawn on its own so it stays when no episode is left, and in the desktop app and on the phone, **Download** for that episode.
- **Download for episodes, seasons and albums** (the screens 4.6 builds): an episode's row has a download icon with the progress ring, each season **Download season** beside Mark season as watched, and an album Download beside Play and Shuffle. The phone's stays in the prototype as 4.6's design; the client hides it until 4.6.
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
- **Audio and subtitles** saves as it changes, per person and title; the player starts with these picks.
- **Download** and **Mark as watched** as above.
- **TV:** focus starts on Play; **Down** reaches the rows in order (More like this, the collection, Cast and crew, then the cards); **Up** from the first row returns to the actions, and from the actions to the head; Back closes the dialog, then goes back.
- **Sound:** TV only.

## Copy

| Where | Text |
| --- | --- |
| Resume | Resume · {n} min left (mobile, TV); Resume, then "{n} min left" beside it (web) |
| Start over | Play from the start (web, mobile) · From the start (TV) |
| Audio and subtitles | Remembered for this movie, on all your devices. (pointer and touch) · Back closes. Saved for this movie. (TV) |
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
- ~~**Cast isn't linked on the clients.**~~ Cast and crew link to the person's page on every client (prototype-gaps stage 3, 2026-11-01): what they're in here, and Their music when they're also an artist.
- **Related titles must be playable here.** Recommendations of things the server doesn't have belong in requests (later).

## Open questions

- **Version per device:** should the version pick be per device class (TV prefers 4K, phone prefers 1080p) rather than per title?
- ~~**Trailers on the clients:** the admin embeds them on click; should clients too?~~ Yes on the web, the desktop app and the phone, through YouTube's privacy-enhanced embed (a WebView on the phone); the TV waits for trailer files ([the owner's answers at B1's review](../plans/one-client-platform-b.md#the-owners-answers-at-b1s-review)).
- ~~**Mark as watched / unwatched:** in a More menu (web, mobile) and a long-press of OK (TV)?~~ Yes ([Phase 4's answer 9](../plans/phase-4-clients.md#the-owners-answers)), prototyped at 4.0b; as built it's a round action on every form factor, [above](#mark-as-watched).
