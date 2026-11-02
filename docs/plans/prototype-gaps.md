# The prototypes' gaps: fixing what the audit of 2026-11-01 found

- **Status:** Scoped on 2026-11-01 and approved with [the owner's answers](#the-owners-answers) of 2026-11-01: every recommendation but question 6, where Songs and Playlists are prototyped now, with people's own playlists (question 11). Nothing is built yet. Stage 1 is next.
- **Parent plan:** [phase-4-checkpoint-5.md](phase-4-checkpoint-5.md), 4.5b. Shows and music were prototyped on every app during 4.5b (commits a6d64d0 to dbe845e). On 2026-10-30 the owner said the full checks wait until the TV prototype is done. This plan finishes that round of prototype work before 4.5b's apps are built to it.
- **Gate:** The owner asked for this plan on 2026-11-01, after the audit of every prototype. The audit was presented in chat and is restated by stage below.

## Read first

1. `CLAUDE.md`, "Where things stand", and the standing rules in [phase-3-server.md](phase-3-server.md). They all still apply: locked layouts, copy, SPDX headers, and committing only when asked.
2. [phase-4-checkpoint-5.md](phase-4-checkpoint-5.md), its Progress section and The TV app (4.5b).
3. The client specs this changes: [player.md](../product/player.md), [client-home.md](../product/client-home.md), [client-search.md](../product/client-search.md), [client-detail.md](../product/client-detail.md), [client-library.md](../product/client-library.md), [client-settings.md](../product/client-settings.md), [connectivity.md](../product/connectivity.md) and [desktop-app.md](../product/desktop-app.md).
4. The admin specs for stages 5 to 7: [admin-shell.md](../product/admin-shell.md), [movies.md](../product/movies.md), [media-pages.md](../product/media-pages.md), [setup.md](../product/setup.md), [users-devices.md](../product/users-devices.md), [now-playing.md](../product/now-playing.md), [wanted.md](../product/wanted.md) and [settings.md](../product/settings.md).
5. The prototype:
   - `design/prototypes/src/{web,mobile,tv,admin}`;
   - the shared parts in `src/client/` (`player.ts`, `music-player.ts`, `shows.ts`, `detail-facts.ts`, `downloads.ts`);
   - the mock in `src/mock/` (`server.ts`, `shows.ts`, `music.ts`, `types.ts`, `playback.ts`);
   - the routes the sweeps visit, `src/routes.tsx`.
6. [The design language's platform pages](../design-language/platforms/), for the TV's focus model and the phone's touch targets.

## Goal

Every prototype has shows and music as first-class as movies are, wherever a person meets them: Search, Home, Continue watching, the player, Next up, downloads and settings. Leaving the player never loops or locks. The admin is level with the server that shipped, and has prototyped Shows, Music and per-kind libraries for the phases that build them. The specs say what the prototypes draw. When the last stage is signed off, the prototype is done in the owner's sense of 2026-10-30, and 4.5b goes on to build `apps/tv` to it.

## Out of scope

- **Building shows and music on the server.** The roadmap's TV series and music phases build them, each scoped on its own (the parent plan's answer 1: Phase 4 is movies only). Stages 6 and 7 here only draw their admin.
- **Downloads themselves.** Those are 4.6. Stage 3 draws episode, season and album downloads, and 4.6 builds them.
- **Building the client changes in `apps/web`, `apps/desktop`, `apps/mobile` and `apps/tv`.** The exception is stage 1's first three bugs, which are fixed in the apps too (the owner's answer 1). Everything else is built when each app catches up to the prototype: `apps/tv` in 4.5b, and the rest when their checkpoints next touch those screens.
- **Smart and shared playlists:** stage 3 draws people's own playlists only ([question 11](#open-questions-for-the-owner)). Playlists by rule and playlists shared with the household are left to the music phase.
- **The dashboard customization follow-up** ([dashboard-customization.md](dashboard-customization.md)). The audit only found that the dashboard's widgets are movies only, and that's fixed in stage 6.

## Where things stand

- **The prototype has shows and music on the web, desktop, phone and TV:**
  - Shows, a show's page with seasons and episodes, and marking episodes watched (`src/{web,mobile,tv}/show.tsx`, `shows.tsx`, `src/mock/shows.ts`);
  - Music, album and artist pages, and the music player that keeps playing from page to page (`music*.tsx`, `album.tsx`, `artist.tsx`, `src/client/music-player.ts`);
  - person pages that list films, shows and albums (`person.tsx`, `detail-facts.ts`'s `hereOf`).
- **What still assumes films:**
  - Search (`library.search` in `src/mock/server.ts`);
  - Home's rows and Continue watching (`home.sections`);
  - the players' exit, title line and Next up (`src/{web,mobile,tv}/player.tsx`, `src/client/player.ts`);
  - downloads (`src/client/downloads.ts`, `offline-list.tsx`);
  - the whole admin (`src/admin/`).
- **Checks:** every page in the routes list passes the pages sweep (472 pages at dbe845e), and so do the keyboard walks on the web (96) and phone (42) and the TV's D-pad walk. Those runs were scoped to the pages each change touched, and the full checks have been held since 2026-10-30.
- **The prototype is behind the built server in the admin:** import lists and notification connections, Settings › Migration, Tags, Root folders and Metadata are built in `apps/server`. In the prototype they're marked Soon, can't be edited, or are missing.

## The stages, and their gates

Eight stages, each reviewed by the owner before the next starts, as the owner's gated work asks. They're ordered so that bugs come first, then what makes shows usable, then everything that builds on it:

1. **Stage 1, bugs:** the six bugs. Small, and three of them affect everyone.
2. **Stage 2, shows and music where people start:** the episode player and Next up, Search for every kind, Home and Continue watching for every kind, and Continue watching's menu.
3. **Stage 3, parity:** the show page's buttons, downloads for episodes, seasons and albums, Playback settings, the music player's queue and Stop, Songs and Playlists, person and artist links, profiles on the web and phone, and the server's name.
4. **Stage 4, each app's own list:** web and desktop, phone, and TV.
5. **Stage 5, the admin level with the server:** what shipped, plus the admin's own fixes.
6. **Stage 6, Shows in the admin:** libraries per kind, setup, access, Now playing, and the movies-only screens taught episodes.
7. **Stage 7, Music in the admin.**
8. **Stage 8, the specs and the full checks,** then 4.5b's build of `apps/tv` continues.

**For every stage:**
- **Checks:** light checks per change (Biome, tsc) and the sweeps scoped to the pages it touched: `pages.ts` by platform, `keyboard.ts` on the web and phone, and the TV's `dpad.ts`.
- **Locked layouts:** a stage that changes a locked layout or the design system lists each change for the owner's approval at its gate. That covers new icons, new components, and new rows or buttons on signed-off screens.
- **Specs:** each stage updates the specs for the screens it changed, in the same change.
- **Commits:** one commit per stage, "Continue checkpoint 4.5b: …", made only when the owner asks.

## Progress

- **2026-11-01, stage 5 (the admin level with the server), for the owner's review:**
  - **5.1, what shipped,** in the prototype, each in the built page's form:
    - **Settings › Import lists** (`settings/lists.tsx`): the rows with on and off, the last check, Edit, Check now and Remove; one dialog to add or edit a TMDB, Trakt or generic list, with Test, the root folder, profiles, tags, minimum availability and the switches; the Trakt account (the device code, Disconnect) and Exclusions.
    - **Settings › Connections** (`settings/connections.tsx`): a dialog for each of the twelve kinds with its own fields and the server's events, Playback started among them; each row's last result, Test, Edit and Remove; Email's Server's mail switch; This browser.
    - **Settings › Migration** (`settings/migration.tsx`), the owner's, in a new System group: Radarr and qBittorrent, each with Test, Preview and Import with its progress, and Radarr's path mappings.
    - **Settings › General:** Region, Metadata (the TMDB key with Replace and Remove, the language and region), the indexer catalog (channel, automatic installs, extra catalogs), Updates and Diagnostics. Only the owner saves it; an admin sees it read-only.
    - **Settings › Media management:** the naming previews from `@highsea-tv/media/naming`, and the Root folders and Tags groups (`settings/tags.tsx`), which Manage tags and the dialogs link to.
    - Download client is the owner's, as built and as settings.md already said.
    - The mock gained `lists.ts`, `connections.ts`, `migration.ts` and `library-settings.ts`; `reference.tsx` lost the old General, Media management, Import lists and Connections, its helpers moved to `parts.tsx`.
  - **5.1's departures** (where the prototype took the built page's form):
    - General: English only, the full IANA time zones; Updates loses "Install updates on their own" for the note about pulling the image; Diagnostics loses the usage counts and gains Crash reports and Metrics; Metadata and the catalog are new groups; saving is the owner's.
    - Media management: Colons, Set folder permissions and Keep deleted files for are new; `{Edition}` became `{Edition Tags}`; the preview gains the `.en.srt` line; the hardlinks hint loses its "same disk" sentence; Root folders and Tags are new.
    - Import lists: TMDB, Trakt and Generic list replace IMDb and Letterboxd; each row's last check, Edit, Check now and Remove, the dialog, the Trakt account and Exclusions are new.
    - Connections: Matrix and Browser are new kinds, the events are the server's, each row gains its last result, Edit and Remove, and This browser is new.
    - Migration is a new area, in a new System group.
  - **5.2, the admin's own fixes,** in the prototype and in `apps/server`:
    - **Settings › Subtitles:** the card opens Subtitles › Providers, and `/settings/subtitles` sends there (`app/(admin)/settings/subtitles/page.tsx`).
    - **`/wanted/{anything}`** draws not found. The server's catch-all already did; the prototype's route now does.
    - **Tabs in the address:** Activity (`/activity/history`, `/activity/blocklist`), Now playing (`/now-playing/history`), Indexers (`/indexers/catalog`), Subtitles (`/subtitles/providers`, `languages`, `scoring`) and a movie's tabs (`/movies/{id}/cast`, `files`, `history`, `search`, `subtitles`), through `useTabAddress` (`admin/tabs.ts` in each). The server's `[tab]` pages draw not found for any other tab. The hook drops the second change Radix's Tabs report for one click, which also stops Wanted and System pushing each tab twice.
    - **The dashboard's "N more" links:** Upcoming's opens Wanted › Calendar, and System health's opens System › Health.
    - **Add a torrent:** the categories in sentence case (Manual, Books).
    - **One naming preview:** the prototype's manual import and Media management use `@highsea-tv/media/naming`, as the server already did.
    - **The palette** also finds films on TMDB that aren't in the library (Discover's results, up to eight) and Settings' areas by name, with the placeholder "Search the library, TMDB, Settings and actions". It clears when it closes.
    - **A list's Test** said its count twice ("24 movies. (24 titles)"); it now shows the service's message alone, in both.
  - **Fixed from the sweeps:** at 390px with 200% text, the catalog's search box (16rem) pushed Indexers › Catalog past the screen, so it fills the row below medium, in both. The prototype's release name on a movie's Files tab now wraps, as the server's did. Both pages could only be swept once their tabs had addresses.
  - **The guides:** discover.mdx (what the palette finds) and settings/index.mdx (the Subtitles card); the screenshot scripts and the server sweep open tabs by their addresses; Downloads, the dashboard and Import lists' screenshots retaken.
  - **Additions to the design system:** none.
  - **Calls I made, for review:**
    - Add a torrent still starts on Manual, not on no category as the plan said: Manual is the category for torrents that aren't imported, which is what the dialog says.
    - The palette offers TMDB films only when they aren't in the library, since the library's group already has them, and matches Settings' areas by name only: matching their descriptions matched nearly anything.
    - A film that isn't in the library has only Overview and Cast, so its other tabs' addresses draw not found.
    - Manage tags opens `/settings/media` without `#tags`, since the prototype's address is already a hash.
    - Import what's already here opens Manual import, as the prototype has no library mode.
    - This browser in the prototype adds a subscription named from the browser and doesn't use the Push API.
    - Lists and connections refresh on `settings.updated`, having no topic of their own.
  - **Left open:** Media management's Colons setting doesn't change the naming preview, since `@highsea-tv/media/naming` takes no colon option. It's the same on the server.
  - **Tests:** the server's screen tests follow the tab addresses through `test/router.tsx`; Downloads expects Manual and Books, and the pipeline test the movie's Cast address.
  - **Checks (Node 26.11.1):**
    - Biome and tsc on the prototypes and the server;
    - the prototype's 1,623 tests, the server's 485 and the docs' 775;
    - the server sweep on the production build, clean;
    - the admin keyboard walk (150 pages), clean;
    - the admin pages sweep (1,200), clean after the two fixes above.
- **2026-11-01, stage 4 (each app's own list), for the owner's review:**
  - **4.1, the web and desktop app:**
    - **Back and Forward** in the desktop app's top bar, after macOS's buttons (`HistoryButtons` in `web/window.tsx`). They work with Cmd+[ and Cmd+] on a Mac, Alt with the arrows on Windows and Linux, and the mouse's side buttons. Each is off when there's nowhere to go. A window narrower than medium leaves the chevrons out, since the sweep found the top bar overflowing at 390px with 200% text; the keys and the mouse's buttons still work there.
    - **Connect a device** at `/web/link` (`web/link.tsx`): the code typed, then the phone's question in the phone's words. The waiting TV and the code's rules are shared with the phone in `client/pairing.ts`.
    - **Home's featured card** pages through the featured section's titles with arrows and dots, and offers Play (or Resume) and More info. The Bloom follows the title shown. The `spotlight` layout is drawn as wide cards with a still and a synopsis (`SpotlightRow`). See client-home.md and ADR 0017's dated section.
    - **The player:**
      - a volume slider that opens beside Mute on hover or focus;
      - Full screen becomes Exit full screen;
      - Speed (0.5× to 2×, "Normal" at 1×) in Audio and subtitles' panel.
    - **Search's text is in the address** (`/web/search/{text}` in the prototype), so a search can be linked, and Back from a result returns to it.
    - **More like this** is 16:9 stills on a show's page too (`ShowPoster`'s `wide`).
    - **Small fixes:**
      - the film page's error no longer says "Library";
      - "Nothing matches" with **Show everything** in Movies, Shows and Music;
      - the album's skeleton has the page's padding.
  - **4.2, the phone:**
    - **The tab bar** keeps the tab a page was opened from, kept in the page's history entry.
    - **An A–Z scrubber** (`mobile/letter-index.tsx`) runs down Movies, Shows and Music's lists when they're sorted by name. It uses the web's and the TV's letters.
    - **44-point touch targets** through `hitSlop` (`kit/mobile/device.tsx`), so the drawing stays as it is. It covers the episode's check and download, the Back badges (now one `BackBadge`), the chips, the sort buttons, Mark season, a person's More, Music's tabs, the header's avatar, and the group download's buttons.
    - **Can't reach** has the spec's second sentence and **Try again**.
    - **Pull to refresh** on Movies, Shows, Collections, Music, a show's page and Offline. On Offline it also renews downloads that ran out.
    - **Sign out** asks first, on You and in Settings › Servers on every app.
    - The Shows sheet's legend says "Shows".
  - **4.3, the TV:**
    - **Episodes:** holding OK on an episode opens Mark as watched (or unwatched) and From the start.
    - **Empty libraries:** "No movies yet" and "No shows yet". "Nothing matches" offers **Show everything**, reached by Down from the choices.
    - **A genre choice** after Unwatched, opening a menu named "Genre".
    - **Collections:**
      - the audio view's line is "No audio collections yet…";
      - a collection holds shows, its row is named Films, Shows, or Films and shows, and its line counts both.
    - **Settings › Servers** lists every server, the current one "· in use". Sign out asks first and lands on the sign-in screen, and signing a device out asks first.
    - **Copy:** the player's error says "Home", a film's error offers Movies and a collection's offers Collections.
  - **Shows in collections on every app:** the mock's `library.collection` returns the shows too, and `ClientCollection.shows` counts them. The web's and the phone's collection pages list them after the films, linking to the show. `collectionCaption` in `client/data.ts` counts both everywhere ("6 movies and 1 show · 2006–2019"), with `titlesHere` and `titlesRow` beside it in place of the TV's own copies.
  - **Additions to the design system:** none. The TV kit's `TvMenu` gained a three-column layout and a current item, and `hitSlop` is the phone kit's.
  - **Calls I made, for review:**
    - Alt with the arrows for Back and Forward on Windows and Linux, as their browsers have it.
    - In the prototype, Search's text and the link's code are in the path (`/web/search/{text}`, `/web/link/{code}`). The toolbar's state is in the query, and wouter's hash navigation overwrites it. The server keeps `?q=` and `?code=`.
    - Exit full screen keeps the `view` icon. A Maximize and Minimize pair would mean new icons, so it waits for the owner.
    - The speed goes back to Normal for each play.
    - The phone's scrubber letters are 16 points tall, as iOS's index is: it's a column you drag along.
    - The TV's genre menu has three columns, since every genre doesn't fit in one.
    - An empty TV library hides its choices and puts focus on the nav's tab.
    - A collection's row says "Films" while its counts say "movies", as the captions already did.
    - The TV player's error says "Home", since a missing title gives no library to offer.
  - **Tests:** the web Home test checks the featured card's paging. Three collection tests now expect the row named "Films" and the audio view's new line. All 1,419 pass.
  - **Specs:** player.md, client-search.md (the address, and collections with shows), client-detail.md, client-library.md, client-home.md, client-settings.md, connectivity.md (Connect a device on the web, and Can't reach on the phone) and desktop-app.md.
  - **Fixed from the sweeps:** in the desktop app at 390px with 200% text, Back and Forward pushed the top bar 66px to 122px past the window's edge. They're left out below medium (see 4.1).
  - **Checks (Node 26.11.1):**
    - Biome and tsc on the prototypes, and the prototype's 1,419 tests;
    - the pages sweep on the web (1,368, with the new link and search routes), phone (376) and TV (320);
    - the keyboard walks on the web (114) and phone (47), and the TV's D-pad walk;
    - all clean.
- **2026-11-01, stage 3 (parity), for the owner's review:**
  - **3.1, the show page:** the film page's round buttons beside Play: From the start, Trailer when the show has one, Audio and subtitles (picked once for every episode), Mark show as watched (drawn on its own, so it stays when no episode is left) and, in the desktop app and on the phone, Download.
  - **3.2, downloads:** an episode's row has the download icon with its progress ring, each season **Download season**, and an album Download beside Play and Shuffle. Offline and Downloads group episodes under their show and season and songs under their album, each with its size and Remove; the copy says "films, episodes and music".
  - **3.3, Playback settings** in every app's Settings, the TV's in the same order: the audio and subtitle languages, Play the next episode automatically, Skip intros automatically, and the quality at home and away.
  - **3.4, the music player:** Playing from, Up next with Remove and Clear (a panel on the web, the reorderable sheet on the phone, a row on the TV), Shuffle and Repeat on every Now playing, Stop (the phone's ⋯ and a swipe down on the mini player, a button on the TV), a song's and an album's ⋯ menu, the artist page's Pause on the phone, and AirPlay on the phone's Now playing.
  - **3.8, Songs and Playlists:** Music's four views on every app; Songs as one list, sorted five ways, with the A–Z index on the web and TV; Playlists as tiles or a list, with New playlist on the web and phone; a playlist's page laid out as an album's, renamed, reordered by dragging (Space and the arrows from the keyboard), its songs removed and the playlist deleted on the web and phone, and only played on the TV (`tv/playlist.tsx`). Add to playlist is a dialog on the web, a sheet on the phone and the menu's next step on the TV. The mock gains `library.songs`, `library.playlists`, `library.playlist` and the six `playlists.*` calls with `playlists.updated`.
  - **3.5, people and their music:** **Their music** on a person's page when they're an artist here, and a **Soundtrack** fact on a film whose score is an album here, as a link (`Fact`'s third item in `client/detail-facts.ts`; the mock's `ClientDetail.soundtrack`).
  - **3.6, profiles:** **Switch profile** in the web's account menu, opening Who's watching at `/who` (`client/who.tsx`), drawn as the TV's, with the PIN in one field. On the phone, after the owner's review on 2026-11-01 (the TV's page shrunk down didn't suit it), You's Switch profile opens a sheet of rows instead (`mobile/who-sheet.tsx`, at `/you/who`), as phones switch accounts, with the PIN asked in the same sheet. The profile store moved from `tv/people.ts` to `client/profiles.ts`, and the account menu, the phone's header and You, and the web's Account page read the profile's name and colour.
  - **3.7, the server's name:** `useServerName` in `client/data.ts`, read in every client and admin place that named Harbor, with "this server" until it's known. Renaming the mock's server to Lighthouse left no Harbor in the clients or the admin outside the data below.
  - **Additions to the design system, for approval:** ui-web's and ui-native's icons `repeat`, `repeat-one` and `queue` (Lucide's Repeat, Repeat1 and ListMusic). The new rows and buttons on signed-off screens are the ones listed above.
  - **Calls I made, for review:**
    - The album's ⋯ sits in the album's header, beside Shuffle.
    - Add to playlist on the web is a dialog, since ui-web's Menu has no submenu.
    - The TV has no New playlist, and plays playlists only.
    - Remove from this playlist is the last item in a song's ⋯ on a playlist's page.
    - The phone's `/music/songs` and `/music/playlists` go to Library's Music views.
    - The mock's song titles were widened, so the lists have long titles to truncate.
    - Profiles are still added and deleted only on the TV.
    - The PIN is one four-digit field on the web and phone, not a pad.
    - A profile that isn't the account's own says "A profile on @ines’s account".
    - Kept as data, not the server's name: "Featured on Harbor" (a section's title the owner typed), the Harbor theme, the setup form's placeholder, the email samples and the mock's seed.
    - The remembered servers follow the current server's name.
    - On the TV, Soundtrack is a focus stop of its own inside the Information card.
  - **Tests:** six prototype tests failed when this stage's checks ran. Two were classes the theme doesn't have (`rounded-xs` from this stage; `rounded-button`, `text-white`, `leading-tight` and the plain CSS `playing-bar` from stage 2), now the theme's own and `playing-bar` an `@utility`. Four had kept stage 2's earlier expectations: the TV's Shows page, Home's new rows, Caminandes's score in Search, and Horror, which left the suggestions. Stage 2's checks were Biome, tsc and the sweeps, not the prototype's tests, which is how those slipped through; all 1,403 pass now, and each stage's checks include them from here on.
  - **Specs:** client-library.md (Music's views), client-detail.md (shows, people and soundtracks), client-settings.md (Playback, Offline, Switch profile, the profile's and the server's names) and player.md (the music player).
  - **Fixed from the sweeps:**
    - Downloads and Offline threw while the server couldn't be reached, because the downloads' seed read the library without catching. The seed now waits until the server answers.
  - **Checks (Node 26.11.1):**
    - Biome and tsc on the prototypes, and the prototype's 1,403 tests;
    - the pages sweep on the web (1,272), phone (376) and TV (320);
    - the keyboard walks on the web (106) and phone (47), and the TV's D-pad walk;
    - all clean.
- **2026-11-01, stage 2 (shows and music where people start), for the owner's review:**
  - **2.1, the episode player:**
    - The title is the show's, with "S1, E1 · Pilot" under it on every app's player. Leaving a player opened directly goes to the show (`titlePage` and `titleLines` in `client/player.ts`).
    - **Skip intro** (from the mock's intro marks; none for pilots and specials) and **Skip credits** (`SkipButton` in `client/stream-states.tsx`) show over the frame. On the TV, Skip intro takes the focus while it shows.
    - Next up's card follows `upNext` on the item: **Next episode**, **Season 2 starts** after a finale, a collection's next part, or **More like this** with three choices and no countdown (2.5). The tracks panel says "Saved for this episode."
  - **2.2, Search:**
    - Search covers eight kinds in the plan's order: movies, shows, episodes, people (from films' and shows' credits, "3 movies · 1 show"), collections, artists, albums and songs. Picking a song plays it from its album.
    - An episode opens its show at it: the new route `/shows/{id}/episodes/{episode}` on the web, phone and TV chooses its season and brings its row into view.
    - The placeholder is "Films, shows, music and people", with new suggestions.
  - **2.3, Home:**
    - Continue watching has a card per show, for the episode it resumes.
    - New rows: Next up, then after the owner's rows New episodes, Recently added shows and Recently played (albums and artists). Each is in Home screen settings.
    - An empty Home says "films, shows or music".
  - **2.4, Continue watching's menu** (`client/continue-menu.ts`): Go to the show or the film, Mark as watched, and Remove from Continue watching, with a toast.
    - ⋯ on the card on the web and desktop.
    - A 0.6 s long press on the phone opens a sheet.
    - On the TV, OK held for 0.6 s opens the menu over the page, the same hold as the film page's; Back closes it and focus returns to the card, or to the next one when the card has gone.
    - A key-up only counts on the card where the key went down. Without that, OK on Remove played the next card.
  - **Calls I made, for review:**
    - The mock's call is `playback.dismiss`, not the plan's `watch.dismiss`, beside the other playback calls. A show removed comes back when one of its episodes is played again.
    - A collection's next part is headed **Next up**.
    - The "play next" setting the plan cites as 2.6 doesn't exist, so the countdown always runs; Cancel stops it.
    - `apps/web`'s search wasn't changed: it reads the server's `titles`, and the server has no shows or music yet.
  - **Specs:** player.md (Episodes, Skip intro and credits, Next up's kinds), client-search.md, client-home.md (the new rows and the menu) and client-detail.md (an episode's address).
  - **Checks (Node 26.11.1):** Biome and tsc on the prototypes; the pages sweep on the web (1,152), phone (336) and TV (288); the keyboard walks on the web (96) and phone (42); and the TV's D-pad walk. All clean.
- **2026-11-01, stage 1 (the bugs), for the owner's review:**
  - **1.1, Back loops:** the prototype's players leave through `leavePlayer` in `client/player.ts` (back to the page they were opened from, or the film's page in the player's place when opened directly), and Next up replaces the player with `playNext`. Checked on the phone: Home, the film, Play, Back, then Back reaches Home.
    - **In the apps:** `apps/mobile` and `apps/tv` already went back (`router.canGoBack()`), so only `apps/web` had the loop. Its links now mark their history entry (`state: { inApp: true }` in `useLinks`), and the player goes back when it was opened from inside the app, or replaces itself with the film's page when not. Next up replaces it, keeping that mark. A new test in `apps/web/test/screens.test.tsx` fails without the fix.
  - **1.2, the TV's Back:** Back no longer wakes the controls. With them hidden, one Back leaves. With them showing, the first Back hides them and the second leaves. Paused, the controls always show, so Back leaves at once. `apps/tv` already let Back through (`eventType === 'menu'`).
  - **1.3, a watched title starting at the end:** the mock kept a watched title's position at its length, while the server clears it (`packages/media/src/shared/watch.ts`, ADR 0054). The mock's films and episodes now give 0 once watched. A watched Tears of Steel starts at 0:02 of 12:00. The apps don't have the bug, since the server never sends that position.
  - **1.4, the TV locked with nothing next:** Next up's state is modal only when there's a next title, so an episode at its end keeps the controls, with the scrubber focused. A film with a next title still asks. `apps/tv` already shared the client's rule (`hasNext`).
  - **1.5, offline:**
    - The phone's Offline and the desktop app's Downloads stay open while the server can't be reached.
    - The desktop app's Can't reach gains **Watch downloads** between Try again and Switch server, and "Your downloads still play."
    - A browser's Can't reach has neither.
    - connectivity.md says so.
  - **1.6, dead routes:** `/tv/library` and `/tv/library/collections` became `/tv/movies` and `/tv/collections` in `routes.tsx` and `tv-compare.ts`. Each app's not-found page carries `data-not-found`, and `pages.ts` fails a route that draws it unless the route is one of the `nowhere` routes meant to miss.
  - **Checks (Node 26.11.1):**
    - Biome and tsc (the prototypes, `apps/web` and `scripts/`);
    - `apps/web`'s tests (25, now 26);
    - the pages sweep on every platform (TV 288, phone 336, web 1,152 and admin 928 pages);
    - the keyboard walks on the web (96) and phone (42), and the TV's D-pad walk;
    - the web playback run in Chromium;
    - all clean. `phone.ts` wasn't run, since `apps/mobile` didn't change.

## Stage 1: the bugs

| # | Where | The bug | The fix |
|---|---|---|---|
| 1.1 | Phone and TV player (`mobile/player.tsx`, `tv/player.tsx`) | Back from the player pushes `/movies/:id`, so Back on the film page returns to the player. The two loop. | Leave the player with `history.back()`, or replace the address if the player was opened directly. On the web, check the same path. |
| 1.2 | TV player | Back never leaves while playing, because each key shows the controls first. | Back hides the controls if they're showing; otherwise it leaves. The same is true playing or paused, as the Apple TV app does. |
| 1.3 | Every player (`client/player.ts`) | Play on a watched film or episode starts at the end ("15:00 of 15:00"). | Start from 0 when a title is watched or at least 95% through, the same threshold the server uses for watched. Resume is offered only below it. |
| 1.4 | TV, Next up | With nothing to play next, the controls are disabled but no card is drawn, so the remote does nothing. | Enter Next up's state only when there's a next title; otherwise the end of the film shows the ordinary end-of-film controls. |
| 1.5 | Phone and desktop app, offline (`mobile/shell.tsx`, `web/shell.tsx`) | "Watch downloads" goes to Downloads, which the offline screen covers, so it lands on Can't reach again. | While the server can't be reached, Offline (phone) and Downloads (desktop) are allowed, along with playing what's on them. In a browser, drop "Your downloads still play", since a browser keeps no downloads. |
| 1.6 | `routes.tsx` | `/tv/library` and `/tv/library/collections` are "not found" pages, which the sweeps count as passing. | Point them at `/tv/movies` and `/tv/collections`. `pages.ts` fails a route that draws the not-found page. |

**At the gate:**
- Each bug is reproduced before its fix and checked after it.
- The pages sweep runs on the players and the routes.
- The D-pad walk covers the TV's player and Next up.
- 1.1 to 1.3 are also fixed in `apps/web`, `apps/desktop` and `apps/mobile` where they have the same bug (the owner's answer 1). Each app's own checks run: the web's playback run, and `phone.ts` on the simulator.

## Stage 2: shows and music where people start

### 2.1 The episode player and Next up (`player.tsx` on each app, `client/player.ts`, `mock/playback.ts`)

- **Leaving an episode** goes back to the show's page, where the episode is, never `/movies/{episode}`.
- **The title line** is the show's name, with "S1, E1 · Pilot" under it. That's on the web's and desktop's top bar, the phone's controls, and the TV's info panel.
- **Next up for an episode** is the next episode, then the next season's first episode. After the season finale it's "Season 2 starts here", and after the show's last episode there's nothing next.
  - The mock adds `next` to an episode's play data.
  - The countdown and the "play next" setting (2.6) are player.md's existing ones.
- **Skip intro and Skip credits:** a button at the bottom right while the intro or credits play, from markers the mock gives each episode ([question 3](#open-questions-for-the-owner)). Skip credits hands off to Next up.
- **The timing panel's copy** says "Saved for this episode" for an episode.

### 2.2 Search for every kind (`mock/server.ts`'s `library.search`, `web/search.tsx`, the phone's Search tab, `tv/search.tsx`)

- **Results grouped by kind,** best match first, in this order: Movies, Shows, Episodes, People, Collections, Artists, Albums, Songs. Only kinds with results are shown.
  - An episode's result shows its still, show, number and title, and opens the show at that episode.
  - A song's result plays it.
- **People** include anyone credited on a film, a show or an album: Mara Ellison is found by "mara".
- **The placeholder** says "Films, shows, music and people", and the suggestions take in shows and artists.
- **The TV** uses the same groups as rows.

### 2.3 Home and Continue watching for every kind (`home.sections`, `home.tsx` on each app, client-home.md)

- **Continue watching** holds films and episodes.
  - A show has one card, for its next episode, with a 16:9 still, "S2, E6" and its progress.
  - Each card links to what it is: a film's page, or the show at that episode.
- **New rows,** each optional in Home screen settings:
  - **Next up**: the next unwatched episode of shows you're watching;
  - **New episodes**: aired since you last watched;
  - **Recently added shows**;
  - **Recently played**: albums and artists.
- **Home screen settings** list the new rows on every app.
- **An empty Home** says "when the server's owner adds films, shows or music", not "movies".

### 2.4 Continue watching's menu

- **On the web and desktop,** ⋯ on the card. **On the phone,** a long press. **On the TV,** a long press of OK, as client-detail.md already has it for other cards.
- **The menu has:**
  - Go to the film, or Go to the show;
  - Mark as watched;
  - Remove from Continue watching, which forgets the place without marking the title watched. The mock gains `watch.dismiss`.

### 2.5 Next up for a film

- **A film in a collection** offers the collection's next part, with the countdown.
- **Otherwise,** Next up shows three choices from More like this, with no countdown and nothing autoplaying ([question 4](#open-questions-for-the-owner)).

## Stage 3: parity

### 3.1 The show page beside the film page (`show.tsx` on each app)

- **The film page's round buttons:** Trailer (when the show has one), Audio and subtitles (the show's default languages, applied to every episode), and Download.
- **Mark show as watched** is drawn on its own, so it stays when there's no next episode. Today it's hidden with Play.

### 3.2 Downloads for episodes, seasons and albums (`client/downloads.ts`, `download-button.tsx`, `offline-list.tsx`)

- **Download is offered on:**
  - an episode's row, as a download icon with the progress ring;
  - each season, beside Mark season as watched, as **Download season**;
  - an album, beside Play and Shuffle.
- **Offline and Downloads** group episodes under their show and season, and albums under music, each with its size and **Remove**.
- **The copy** says "films, episodes and music", not "movies".
- These are the screens that 4.6 builds.
- **The phone's Download button** stays in the prototype as 4.6's design, and `apps/mobile` hides it until 4.6 (the owner's answer 8).

### 3.3 Playback settings on every app (`client/settings-sections.tsx`, client-settings.md)

- **A Playback section in each app's Settings:**
  - Audio language and Subtitle language (with "Only when the audio isn't in my language");
  - Play the next episode automatically, on or off;
  - Skip intros automatically, off by default;
  - Quality at home and away (Original, or a bitrate cap).
- **These are the person's own preferences,** kept in ADR 0027's layers, and the server's Settings › Playback is unchanged.
- **The TV's Settings** gains the section in the same order.

### 3.4 The music player (`client/music-player.ts`, `web/music-bar.tsx`, `mobile/now-playing.tsx`, `tv/now-playing.tsx`)

- **The queue:**
  - **Up next** on the web and desktop is a panel from the bar. On the phone it's the sheet it is now, which can be reordered. On the TV it's a row under the controls.
  - Each item has Remove.
- **Shuffle and Repeat** are on every Now playing. Repeat goes off, all, then one.
- **Stop:**
  - on the phone, in Now playing's ⋯ menu and by swiping the mini player down;
  - on the TV, as a button in Now playing;
  - Stop closes the bar or the mini player.
- **A song's ⋯ menu** on album and artist pages has Play next, Add to queue, Go to the album and Go to the artist. On the TV it's a long press of OK.
- **Add to playlist** joins a song's and an album's ⋯ menu (3.8).
- **The artist page's Play** turns into Pause while the artist plays, on the phone as on the web.
- **"Playing from"** names what was played: the album, the artist, a search or a single song.
- **AirPlay on the phone's Now playing,** as on its film player.
- **Icons:** ui-web and ui-native gain Lucide's `Repeat`, `Repeat1` and `ListMusic`. Each is an addition to the design system for the owner's approval.

### 3.8 Songs and Playlists in Music (the owner's change to question 6)

- **Music's views become Albums, Artists, Songs and Playlists:**
  - on the web, the segmented control (`/music`, `/music/artists`, `/music/songs`, `/music/playlists`);
  - on the phone, the views under Library's pills;
  - on the TV, the choices beside the title.
- **Songs** is a list: the title, artist, album and length, sorted by title, artist, album, recently added or most played, and filtered by genre. A row plays from there on, and has the song's ⋯ menu (3.4). The web and TV keep the A–Z index when sorted by name.
- **Playlists** are each person's own (question 11):
  - **New playlist**, on the web, desktop and phone, asks for a name. **Add to playlist** in a song's and an album's ⋯ menu lists them, with New playlist at the top.
  - **A playlist's page** is laid out as an album's: a mosaic of its first four covers, the name, the count and length, Play and Shuffle, then the songs.
  - **On the web, desktop and phone,** a playlist can be renamed, its songs reordered by dragging and removed, and the playlist deleted. Deleting asks first.
  - **The TV** lists and plays playlists, but they're edited on the other apps.
  - **An empty Playlists view** says how to make one.
- **The mock** gains `library.songs`, `library.playlists`, `library.playlist`, and `playlists.create`, `rename`, `reorder`, `add`, `remove` and `delete`, with a `playlists.updated` event. Each person starts with two playlists, the same on every load.
- **client-library.md** describes both views.

### 3.5 People and their music

- **A person who is also an artist here** gets **Their music** on their page, opening the artist page. That's the reverse of the artist page's Their films and shows.
- **A film with its score here** gets a **Soundtrack** line in Information, opening the album.

### 3.6 Profiles on the web and phone

- **The web's account menu and the phone's You** gain **Switch profile**, opening Who's watching as the TV draws it (`tv/who.tsx`), with each profile's avatar and its PIN when it has one ([question 5](#open-questions-for-the-owner)).
- **The hard-coded "Ines"** is read from the signed-in profile.

### 3.7 The server's name

- **"Harbor"** is hard-coded in about fifteen places in the clients and the admin. Each is replaced by the server's name from the mock's `system.info`, so a sweep with another name shows none left.

## Stage 4: each app's own list

### 4.1 The web and desktop app

- **Back and Forward in the desktop app:**
  - chevrons at the left of the top bar, after the traffic lights;
  - Cmd+[ and Cmd+] (Ctrl and Alt with the arrows on Windows and Linux);
  - the mouse's back and forward buttons.
  - The webview has none of these by itself. desktop-app.md is updated.
- **`/web/link`:** the web's Connect a device, ported from the phone's `pair.tsx`. It's the page the TV's code screen sends people to.
- **Home's featured card:**
  - Play or Resume, beside More info;
  - the featured section's other titles, paged with the dots and arrows;
  - the `spotlight` layout drawn as a spotlight rather than a plain row;
  - client-home.md matched to it ([question 9](#open-questions-for-the-owner)).
- **The player:**
  - Full screen becomes Exit full screen;
  - a volume slider on hover beside Mute;
  - a speed menu (0.5× to 2×) in Audio and subtitles' panel.
- **Search's text** is kept in the address (`/web/search?q=…`), so a search can be linked and Back returns to it.
- **More like this** is 16:9 stills on films and shows alike, so the show page moves to match the film page (the owner's answer 10).
- **Small fixes:**
  - the film page's error drops "Library";
  - a library's "Nothing matches" offers **Show everything**;
  - the album page's skeleton has the page's padding, so it no longer jumps about 5rem on load.

### 4.2 The phone

- **The tab bar** marks the tab a page was opened from on film, show, album and person pages.
- **An A–Z scrubber** runs down the edge of Movies, Shows and Music's grids when they're sorted by name, as iOS's index is.
- **Touch targets** of 44 pt at least: the episode's check, the Back badges, the chips and the small buttons. Use `hitSlop` where the drawing stays as it is.
- **Can't reach** gets **Try again** and the spec's second sentence.
- **Pull to refresh** on the library pages, a show's page and Offline, as on Home.
- **Sign out** asks first, as Forget this server does.
- **Copy:** the Shows sort sheet's legend says "Shows".

### 4.3 The TV

- **One episode marked watched:** a long press of OK on an episode, as client-detail.md has it.
- **Empty libraries:**
  - Movies and Shows get the library's empty state;
  - a filter that matches nothing gets "Nothing matches" with **Show everything**, so Down always has somewhere to go.
- **A genre filter** in the libraries' choices, as the web and phone have.
- **Collections:**
  - the "in a later version" line goes;
  - a collection can hold shows;
  - its row is named by what's in it (Films, Shows, or Films and shows).
- **Settings › Servers:**
  - **Sign out** asks first and works;
  - every saved server is listed, with the current one marked;
  - signing a device out asks first.
- **Copy:**
  - "Home" everywhere ("Go home" goes);
  - a library's error offers its library.

## Stage 5: the admin level with the server

### 5.1 What shipped

The prototype catches up to `apps/server`, from its pages:

- Add a list and Add a connection, which are marked Soon;
- editing a notification connection;
- Settings › Migration, Tags, Root folders and Metadata.

The prototype is the build reference, so where the built page departed from it, the prototype takes the built page's form. Each departure is listed at the gate.

### 5.2 The admin's own fixes

- **Settings › Subtitles:**
  - the Settings card opens Settings › Subtitles, not Wanted;
  - `/settings/subtitles` draws its page.
- **`/wanted/{anything}`** draws the not-found page, not an empty body.
- **Tabs in the address:** Activity, Now playing, Indexers, Subtitles and a movie's tabs keep their tab in the address, as the others do, so Back and links work.
- **The dashboard's "N more" links** open the right pages.
- **Add a torrent:**
  - no category by default, since the dialog says it won't import;
  - the categories' labels in sentence case.
- **One naming preview:** manual import and Media management share `@highsea-tv/media/naming`'s preview, as the server does.
- **The palette:**
  - searches the library, TMDB (Discover's results) and Settings' pages;
  - or its placeholder says only what it does.

## Stage 6: Shows in the admin

Drawn for the TV series phase, which builds it. The mock's shows gain the admin's fields: monitored, quality profile, root folder, path, and each episode's file.

- **Shows** in the sidebar, as Movies is laid out (movies.md, media-pages.md), from Sonarr's series pages:
  - the list, with posters, monitored state and episode counts;
  - a show's page, with seasons that can be monitored or unmonitored, each episode's state and file, and Search for a season and for an episode;
  - Add a show, with its monitor options (all, future, missing, the first season, none).
- **Libraries per kind:**
  - Settings › Media management's root folders become one list per kind (Movies, Shows, Music), each with **Scan now**;
  - movie paths are no longer hard-coded.
- **Setup:** `setup.detect` finds a folder for each kind, and Review lists each. Folders appears only when highsea found none, as now.
- **Library access per person:** Movies, Shows and Music, each its own choice. The mock applies it to every kind it serves.
- **Now playing and history** show an episode as show, number and title, linked to the show. They show a song as its title, artist and album.
- **Movies-only screens taught episodes:**
  - Wanted (missing episodes and Cutoff unmet);
  - the calendar (air dates);
  - the dashboard's widgets, including storage's TV part;
  - naming's episode formats (season folders, multi-episode files);
  - quality profiles and sizes per kind;
  - import lists that can add shows;
  - Discover and the Add dialog;
  - the admin's person page, listing shows;
  - collections and featured sections that hold shows;
  - manual import matching episodes;
  - subtitles' Wanted for episodes;
  - notification events for episodes and seasons (Grabbed, Imported, Upgraded) and episode playback.

## Stage 7: Music in the admin

Drawn for the music phase:

- **Music** in the sidebar: artists, albums, their files, Rescan and Unmatched.
- **Music libraries** from stage 6's root folders per kind.
- **Naming for music.**
- **Storage's Music part.**
- **Now playing's songs.**

Music starts as a library of files that are already there (the owner's answer 2). Downloading music, Lidarr's monitoring of artists and releases, is drawn in the music phase.

## Stage 8: the specs and the full checks

- **Specs:** each spec matches the prototype, including what the audit found out of date:
  - client-settings.md's TV navigation (Settings in the head);
  - client-detail.md's long press of OK and linked cast;
  - player.md's episodes, Skip intro and the music player;
  - client-home.md's rows and featured card.
- **The full checks:** `/checks full` under Node 26.11, with every sweep across every platform, held since 2026-10-30.
- **The owner signs off the prototype.** As the owner asked, 4.5b then updates the TV's specs, builds `apps/tv` to the prototype, runs `/checks full` and `/checkpoint-report`, and stops. 4.5c doesn't start.

## ADRs

- **None new.** This is prototype work, and the ADRs that matter are already there: 0027 for preferences in layers, 0054 for watch state, 0055 for the clients' shared logic and 0059 for the native apps.
- **Added when built, not now:**
  - 0054's episodes (watch state by episode, the 95% rule shared with resume);
  - 0055's Search and Home across kinds.
- **The TV series and music phases** write their own ADRs for shows and music on the server.

## Risks

- **The admin stages are large.** Stage 6 alone is a checkpoint's worth of screens. The owner chose to draw it now (answer 2), so the prototype is done later than it would be without stages 6 and 7.
- **Locked layouts change in many places.** Each stage's gate lists them, and the owner may want some changes drawn two ways first.
- **The prototype getting ahead of the apps.** `apps/web`, `apps/desktop` and `apps/mobile` were built to the movie prototype. The further the prototype moves, the more each app has to catch up. The specs and `compare.ts`, `phone-compare.ts` and `tv-compare.ts` show what's behind.
- **Playlists before the server keeps them.** The mock draws what the music phase builds. The music phase's scope checks the design against what the server can store, and reports any change.
- **Mock data for every kind.** Search, Home and Next up across kinds need the mock's shows and music joined into `home.sections`, `library.search` and the playback data. Keep the mock's answers the same on every load, as the music's are.

## Open questions for the owner

1. **Stage 1's bugs in the built apps.**
   - **Recommended:** also fix 1.1 to 1.3 in `apps/web`, `apps/desktop` and `apps/mobile` where they share the bug. They're bugs, not design, and `@highsea-tv/client/player` already holds the resume logic. That makes stage 1 a small release fix too.
   - Or: prototype only, with the apps fixed when they next catch up. That keeps stage 1 small, but the apps keep the loop and the resume at the end until then.
2. **The admin's Shows and Music.**
   - **Recommended:** draw them now, as stages 6 and 7, so the prototype is whole and the TV series and music phases start from an approved design, as every phase so far has. Music starts with a library of existing files, with downloading drawn in the music phase.
   - Or: leave stages 6 and 7 to those phases' own scopes. The prototype is done after stage 5, but its admin stays movies-only.
   - Or: draw Shows now and leave Music to its phase.
3. **Skip intro and Skip credits.**
   - **Recommended:** draw them now, from markers in the mock, and leave how the server finds intros (chapters, or comparing episodes' audio as Plex and Jellyfin do) to the TV series phase.
   - Or: leave them out until then. It's less to draw, but the episode player is drawn twice.
4. **Next up for a film.**
   - **Recommended:** the collection's next part with the countdown. Otherwise, three choices with no countdown, as Netflix and the Apple TV app do.
   - Or: keep More like this's first title with the countdown, as now, which autoplays something nobody chose.
5. **Profiles on the web and phone.**
   - **Recommended:** Switch profile on both, from the TV's Who's watching. A shared iPad or browser is as common as a shared TV.
   - Or: profiles stay on the TV only, and the web and phone are one person each, which is simpler but means signing out to switch.
6. **Music's views.**
   - **Recommended:** Albums and Artists stay. Songs and Playlists are noted in client-library.md as later, since playlists need the server to keep them.
   - Or: prototype Songs and Playlists now, which is more to draw and has no server behind it until the music phase.
7. **One card per show in Continue watching.**
   - **Recommended:** one card per show, for its next episode, as Plex, Infuse and the Apple TV app do.
   - Or: one card per episode partway through. It's simpler, but a show with two episodes partway through takes two places.
8. **The phone's Download button before 4.6.**
   - **Recommended:** the prototype keeps it, since it's 4.6's design. `apps/mobile` hides it until 4.6, with Offline saying "Nothing downloaded" as now.
   - Or: take it out of the prototype until 4.6 is drawn again.
9. **The web's featured card.**
   - **Recommended:** keep the card as prototyped, add Play and paging, and update client-home.md to it.
   - Or: go back to the full-bleed hero that client-home.md describes, a bigger change to a locked layout.
10. **More like this's shape.**
    - **Recommended:** 16:9 stills on both, as the film page has them. The film page is signed off, and the show page moves to match.
    - Or: posters on both, which match the libraries but change the signed-off film page.
11. **How far playlists go** (added after the owner's change to question 6).
    - **Recommended:** each person's own playlists. They can be made, renamed, reordered and deleted, and Add to playlist is in a song's and an album's menu. The TV plays playlists, and editing is on the web, desktop and phone.
    - Or: smart playlists by rule as well (genre, decade, most played), as smart collections do for films. That's more to draw.
    - Or: playlists a profile shares with the household as well, which needs sharing rules drawn too.

## The owner's changes

On 2026-11-01, reviewing this scope, the owner made 1 change:

1. **Songs and Playlists are prototyped now** (question 6), in [3.8](#38-songs-and-playlists-in-music-the-owners-change-to-question-6). Smart and shared playlists stay out of scope, as question 11 asked.

## The owner's answers

On 2026-11-01 the owner took every recommendation for questions 1 to 11 except 6:

1. **The built apps get stage 1's first three fixes too:** 1.1 to 1.3 are fixed in `apps/web`, `apps/desktop` and `apps/mobile` where the apps have the same bug.
2. **The admin's Shows and Music are drawn now,** as stages 6 and 7. Music starts as a library of files that are already there, and downloading is drawn in the music phase.
3. **Skip intro and Skip credits are drawn now,** from markers in the mock. How the server finds intros is left to the TV series phase.
4. **Next up after a film** offers the collection's next part with the countdown. Otherwise it offers three choices, with no countdown.
5. **Switch profile on the web and phone,** from the TV's Who's watching.
6. **Changed by the owner:** Songs and Playlists are prototyped now (3.8).
7. **One card per show** in Continue watching, for its next episode.
8. **The prototype keeps the phone's Download button.** `apps/mobile` hides it until 4.6.
9. **The web's featured card stays as prototyped,** with Play and paging added, and client-home.md is updated to match.
10. **16:9 stills for More like this** on films and shows alike. The show page moves to match.
11. **People's own playlists:** made, renamed, reordered and deleted on the web, desktop and phone, with Add to playlist in a song's and an album's menu. The TV plays them.
