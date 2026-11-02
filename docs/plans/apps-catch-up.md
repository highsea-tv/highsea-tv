# The apps catch up with the prototypes

- **Status:** Written on 2026-11-01 at the owner's request ("a plan for a new agent to begin bringing all of the prototype changes over into the actual apps"), and approved with [the owner's answers](#the-owners-answers) of 2026-11-01: every recommendation. Part A was approved by the owner on 2026-11-01, with its calls as made; part B has begun.
- **Parent plans:** [phase-4-checkpoint-5.md](phase-4-checkpoint-5.md) (4.5b, the TV), [prototype-gaps.md](prototype-gaps.md) (stages 1 to 6, the prototype work this ports) and [design-system-1-1.md](design-system-1-1.md) (the controls every app now draws with).
- **Gate:** Each part below stops for the owner's review, as the standing rules ask.

## Read first

Read these in order before touching code:

1. **`CLAUDE.md`:** "Where things stand", the owner's rules, the commands, and the traps listed under "Things that are easy to trip on".
2. **[phase-3-server.md](phase-3-server.md)'s standing rules:** they all still apply.
3. **This plan, then [prototype-gaps.md](prototype-gaps.md)'s Progress section.** Each stage's entry lists what changed in the prototype and why. It's the inventory this plan ports from.
4. **[phase-4-checkpoint-5.md](phase-4-checkpoint-5.md):** The TV app (4.5b) and its Progress. `apps/tv` is half built.
5. **[design-system-1-1.md](design-system-1-1.md)'s Progress, and [controls.md](../design-language/controls.md):** every control comes from `@highsea-tv/ui`, and `bun scripts/controls.ts` fails a control drawn by hand.
6. **The client specs:** [client-home.md](../product/client-home.md), [client-detail.md](../product/client-detail.md), [client-library.md](../product/client-library.md), [client-search.md](../product/client-search.md), [client-settings.md](../product/client-settings.md), [player.md](../product/player.md), [connectivity.md](../product/connectivity.md) and [desktop-app.md](../product/desktop-app.md). The prototype is the reference when a spec and the prototype disagree. Note any such case in the part's report.
7. **ADRs [0053](../adr/), 0054 (watch state), 0055 (the clients' shared logic), 0059 (the native apps) and 0060 (one design system):** `docs/adr/README.md` is the index.
8. **The prototype's code,** `design/prototypes/src/`:
   - `client/`: shared by every app, and the first place to look;
   - `web/` (the web and desktop app), `mobile/` and `tv/`;
   - `mock/`: the shapes the prototype's screens expect from the server. Its `types.ts` is the draft of the client API.

## Goal

`apps/web` (with `apps/desktop` around it), `apps/mobile` and `apps/tv` draw what their prototypes draw, wherever the server has the data behind it. Today the server has films, collections, people, curation, playback and devices. The apps run on real data, with the prototype's layouts, copy, states and focus or keyboard behaviour. The compare sheets show layout parity rather than "drastic differences". What the server can't serve yet (shows, music, playlists, profiles and downloads) is left out of the apps, not faked. Each item left out is listed against the phase that brings it.

When part D is signed off, `apps/tv` is built to the prototype, which is what 4.5b set out to do.

## Out of scope

- **Shows, episodes, music, songs, artists and playlists.** The server has none of them. Phase 4 is movies only (the parent plan's answer 1), and the roadmap's TV series and music phases build them on the server first. See [question 1](#open-questions-for-the-owner) for how the apps carry them meanwhile. This leaves out:
  - the episode player, Skip intro, Next episode and Season starts;
  - Continue watching's per-show cards, and the Next up, New episodes and Recently played rows;
  - Search's shows, episodes, artists, albums and songs;
  - Music, the music player and Songs and Playlists;
  - Their music and Soundtrack;
  - shows in collections.
- **Downloads:** episodes, seasons, albums, the progress ring, Offline's groups and the desktop app's Downloads list. That's 4.6. The phone's Download button stays hidden, as prototype-gaps' answer 8 says.
- **Profiles:** Switch profile, Who's watching and PINs. The server has accounts, not a household's profiles ([question 2](#open-questions-for-the-owner)).
- **The admin's stage 6 (Shows) and stage 7 (Music).** Those are prototype-only, drawn ahead of their server phases. Stage 5's admin work is already in `apps/server`.
- **Android and Android TV:** 4.5c.
- **Skip credits on films.** It needs credit markers, which the server doesn't detect. Next up keeps appearing where it does now.

## Where things stand

- **The prototypes moved a long way after the apps were built.**
  - Since 4.5a's phone build (`f7e878f`), the client prototypes (`web`, `mobile`, `tv`, `client`) changed by about 17,600 lines across 102 files.
  - Since the TV app's last port (`f82f604`), `tv` and `client` changed in 36 commits.
  - Two commands show the drift:
    - `git log --oneline f7e878f..HEAD -- design/prototypes/src/{web,mobile,client}`
    - `git log --oneline f82f604..HEAD -- design/prototypes/src/{tv,client}`
- **The apps** (as of `9fdfd0d`):
  - **`apps/web/src`:** `home`, `detail`, `library`, `collections`, `search`, `settings`, `shell`, `sign-in`, `player` and `playback`. The desktop app's chrome is in `src/desktop/` (`window.tsx`, `connect.tsx`, `forget.tsx`, `updates.ts`).
  - **`apps/mobile/src/app`:** `(tabs)` for Home, Search, Library, You and Offline, plus `movies/[id]`, `collections/[id]`, `settings/[section]`, `play/[id]`, `connect`, `sign-in` and `link`.
  - **`apps/tv/src/app`:** `index` (Home), `library/` (Movies and Collections), `movies/[id]`, `collections/[id]`, `search`, `settings`, `play/[id]` and `connect`.
- **The shared code:**
  - `@highsea-tv/client`: `data`, `format`, `library`, `player`, `prefs` and `servers`;
  - `@highsea-tv/native`: servers, discovery, the session, media, playback and sound;
  - `@highsea-tv/ui`, with `@highsea-tv/ui/tv`.
- **The server's client API** (`packages/api-contract/src/library.ts`, `playback.ts`, `personalization.ts`, `curation.ts`, `accounts.ts`):
  - the library, items, people, collections and search for films;
  - `items/{type}/{id}/next`: a collection's next film;
  - progress, played and per-item track prefs;
  - Home's layout and curation's sections;
  - pairing and approving a code;
  - public info, with the server's name;
  - devices and preferences in layers.
- **Not on the server:**
  - removing a title from Continue watching (the mock's `playback.dismiss`);
  - client-wide playback preferences (audio and subtitle languages, quality at home and away);
  - shows, music, playlists and profiles (the mock's `library.show*`, `library.music`, `library.songs`, `library.playlist*`, `playlists.*` and `profiles.*`).
- **The compare sheets** (`scripts/sweeps/phone-compare.ts`, `tv-compare.ts`) were run on 2026-11-01. Both apps are behind on everything listed below, and their controls match the spec. One TV bug is unrelated to the prototype work: on Library, the floating tab bar covers the header and the A–Z chip, and the letter rail sits on the first column of posters. Part D fixes it.
- **The owner's review** of prototype-gaps' stage 6 and of design system 1.1 comes before part A ([answer 4](#the-owners-answers)); on 2026-11-01 the owner said to start part A.

## The parts, and their gates

| Part | What | Ends with |
| --- | --- | --- |
| **A** | The shared layer: the prototype's shared logic moved into `@highsea-tv/client`, and the server's two missing movie features | Tests, the contract and `openapi.json`, ADR sections |
| **B** | `apps/tv`: every TV screen to the prototype, finishing 4.5b's build | `tv.ts`, `tv-compare.ts`, the D-pad walk |
| **C** | `apps/mobile` | `phone.ts`, `phone-compare.ts`, Jest |
| **D** | `apps/web` and `apps/desktop` | the web's tests, the playback run, the desktop build |
| **E** | The specs, the guides and the full checks | `/checks full`, `/checkpoint-report` |

The order is [answer 3](#the-owners-answers)'s. Each part stops for the owner. Commits only when the owner asks, "Continue checkpoint 4.5b: …", with no attribution lines.

## Progress

**Part A (2026-11-01), approved by the owner on 2026-11-01,** with every call as made (call 2: the server starts with no choices made). Committed as `10fba6a`.

- **A.1, the shared layer.** Into `@highsea-tv/client`, with tests (`packages/client/test`, 70 now):
  - `player`: `leavePlayer` and `playNext` over a small history each app passes, `titlePage`, `titleLines`, `filmUpNext` (the next part, else three of More like this, which don't count down), `countsDown` and `backStep`.
  - `library`: Continue watching's card page, menu words, toasts and long press, and `createLibraryText` (Information, Languages and quality, the people row, a person's page, roles).
  - `servers`: the pairing code typed, scanned or from a link.
  - `format`: captions and rows that count shows, and the server's name.
  - `prefs`: Settings' sections in order, and the playback settings with their choices.
  - `data`: `useContinueActions` (Mark as watched, Remove).
  - The prototype imports each of these instead of its own copy: `detail-facts.ts`, `continue-menu.ts`, `pairing.ts`, `player.ts`, `settings.ts`, `data.ts` and the mock's Next up. Its 1,734 tests pass unchanged.
  - **The clean-up after it (2026-11-01, on the owner's word):** the copies the first pass missed are gone too.
    - The library's sorting, genres, Unwatched and A–Z rail now come from `@highsea-tv/client/library`, out of `web/library.tsx`. That module gains `LETTERS`, `letterOf` (by the sort title) and the sorts' and Show's words, and `arrange` now takes any item with the fields it reads.
    - The playback settings' shape and choices come from `@highsea-tv/client/prefs` (`PlaybackPrefs`, `playbackOptions`). The prototype still saves them in the browser, as its stand-in for the server.
    - The player's timings, Next up's countdown and `StreamState` come from `@highsea-tv/client/player`.
    - Screens import `normalCode`, `SettingsSectionId`, `titlePage`, `titleLines` and the film page's words straight from the package. That leaves `detail-facts.ts` with only the show's people row and `pairing.ts` with only the mock's waiting TV.
    - What stays in `design/prototypes/src/client/` is the prototype's own wiring: its hooks on the mock client, its browser-saved stand-ins for the server's preference layers, and the history adapter for `leavePlayer` and `playNext`.
    - `apps/tv`'s library still has its own letter rail, which files by the title rather than the sort title. Part B moves it onto the package.
- **A.2, Remove from Continue watching.** `POST /api/v1/items/{type}/{id}/dismiss` deletes the person's position and keeps their history, with `watch.updated`. No migration (call 1 below). ADR 0054's 2026-11-01 section.
- **A.3, Playback settings on the apps.** Seven `playback.*` keys in ADR 0027's layers, written to the user layer by `usePlaybackPrefs`, and read by the play decision: the audio and subtitle languages when the title has no picks of its own, Only when the audio isn't in my language, and the quality cap at home, and under the remote ceiling away. ADR 0027's 2026-11-01 section. Settings › Playback in the admin is unchanged and doesn't overlap: it's how the server transcodes and the most it sends away.
- **A.4, checked.** Everything the apps need is there:
  - `items/{type}/{id}/next` gives the next part; the choices are the detail's `related`, which `filmUpNext` takes.
  - Home's `spotlight` sections carry `HomeItem`s with the position for Play or Resume.
  - `auth/pairing/{code}` and `/approve` give the waiting device's name, app and address.
  - `system/info/public` has the server's name before sign-in.
  - Added `crew` to `ClientDetail` (TMDB's crew without the directors and producers, as the mock has it), so Information's Written by and the people row match the prototype.
- **ADR 0055's 2026-11-01 section** says what moved.
- **Checks, under Node 26.11.1:** lint (1,603 files), typecheck, 12,746 tests, smoke, licences and audit are clean. The sweeps are clean too: 3,408 prototype pages, 329 keyboard walks, the D-pad, the server's admin pages, and playback in Chromium and Firefox. Found along the way: the contract test's `ClientDetail` sample had no `crew`, so it was added.

Calls made (for the owner's review):

1. **Dismiss without a flag.** For films, Continue watching is the position rows, so deleting the row is the whole change and playing again brings the film back. The plan's dismissed flag and migration wait for shows, where an episode would otherwise bring its show back through Next up.
2. **The defaults change nothing.** The film's own audio, subtitles off, and the original quality at home and away, until a person chooses. The prototype's local copy starts with English subtitles for foreign films and 8 Mbit/s away. Say if the server should start there instead.
3. **The subtitle language stands back once a title has picks.** Any saved pick for the title (a version, a track, an offset) counts, since a saved "off" can't be told from nothing saved.
4. **Next up and Skip intros are stored now.** The plan left them for shows, but a film's next part counts down too. Skip intros does nothing until the server has intro markers for films.
5. **The caps' pictures follow the prototype's labels** (20 and 8 Mbit/s are 1080p, 4 is 720p, 2 is 480p). Settings › Playback's remote ceiling maps 20 Mbit/s to 2160p, and the tighter of the two holds.
6. **A film's own collections row** (Collections a title is in) isn't on the server's detail yet. It needs curation's collections by title, which is part D's or a later part's to add.

**Part B (2026-11-02), signed off by the owner on 2026-11-02.** `apps/tv` follows the TV prototype, films only.

- **Shared parts, not copies (the owner, 2026-11-02).** Whatever another app on the TV's rule would need went into `@highsea-tv/ui/tv` as data-only components, with no router, server, media or sound. Rules every app needs went into `@highsea-tv/client`. `apps/tv` keeps the routes, the data hooks, Back and the head's destinations (`src/kit.tsx`).
  - The page: `TvHead` and `TvHeadStop` (`head.tsx`), `TvPage`, `Kept`, `TvGrid` and `TvWords` (`page.tsx`), `TvAmbient`, and `TvLetterRail` (`rail.tsx`).
  - The rows and cards: `TvFilmRow` (`film-row.tsx`), `TvFeaturedCard`, `TvMenu`, `TvConfirm` and `TvNoticeCard` (`cards.tsx`).
  - A title's page (`detail.tsx`): `TvBackdrop`, `TvRoundAction`, `TvPersonTile`, `TvInfoCard`, `TvProgressLine` and `TvSideDialog`, which the tracks panel now uses.
  - `Chip` gains `iconEnd` on both renderers, for the Genre choice that opens a menu.
  - `@highsea-tv/client`: `filmographyOf` and `LONG_BIO` (`library`), and `inlineParts` (`format`), with tests.
  - `parity.ts` gives each TV part its reason for being native only.
- **The shell.** The head as the prototype draws it: Search as an icon, Home, Collections, Movies, then Alerts and the account, which opens Settings. Shows and Music are left out. The `library/` routes became `movies/` and `collections/`, and `people/[id]` and `alerts` are new. An unreachable server shows its name in the corner.
- **Home:** the featured card, 16:9 Continue watching cards with their menu on a 0.6-second hold of OK, and the other rows as film rows that loop. An announcement that must be acknowledged comes first; the rest are on Alerts.
- **Movies:** the A–Z rail in a column of its own (the package's `LETTERS` and `letterOf`, by the sort title), choices that keep focus, Unwatched, and Genre in a menu. "No movies yet" and "Nothing matches" with Show everything.
- **Collections:** All, Video and Audio, with captions from the package. A collection's row is named by what's in it, and its error offers Collections.
- **A film's page:** the full-bleed art and the hero (title, meta line, synopsis, Starring, Directed by, and the picks). Play or Resume, then round buttons for From the start, Audio and subtitles, and the Mark as watched toggle. Then More like this, the Collections row, Cast and crew linking to a person's page, and the About, Information and Languages cards. Its error offers Movies.
- **A person's page:** the photo, what's here and their life, the biography with More and Less, and a film row per department, with focus on the first.
- **Search:** the head, films, people (opening their page) and collections.
- **Settings:** the shared sections. Playback has the A.3 choices, and Servers lists every server (the current one "· in use"), with Switch, Another server, and Sign out asking first. No Episodes row (films only).
- **Alerts:** every live announcement, newest first, as focus stops. Opening it counts the new ones as seen, and they keep their "New" mark while it's open. When there are none, it says so and offers Home.
- **The player:** Back by `backStep` (a panel, then the chrome while playing, then out). Next up by `filmUpNext`: the next part counts down when Autoplay is on, otherwise three of More like this wait to be picked. The error offers Home.
- **Checks:** the D-pad walk's screens follow the new head (`DpadWalk.swift`), and `tv-compare.ts` pairs Movies, Collections and Alerts.
- **Found and fixed while checking (2026-11-02):**
  - **Up from Home's top row didn't reach the head when there was no featured card.** Home counted its rows from 1 whether or not the featured card was drawn, and the head takes focus only from row 0. Now the first row shown is row 0 (`src/app/index.tsx`). The walk found it: every entry through the head stayed on Home, and it walked Home again for each screen for 1.5 hours before it was stopped.
  - **The Movies rail started too high,** with # and A behind the title. It took the grid's top from `onLayout`, measured in the grid's parent, and is placed over the screen; now it's measured with `measureInWindow`.
  - **The walk itself (`DpadWalk.swift`, `tv.ts`, `tv-uitest.ts`):**
    - a preflight (`testEntries`, about 85 s) checks every screen's entry lands before the walk starts;
    - `WALK` lines print as the walk goes;
    - a screen stops once its first view's stops are all reached, except Settings and the player, whose other panels count;
    - a replay that lands elsewhere is tried three times before the walk gives up on that stop;
    - `testPath` replays one path for finding why.
- **Results, under Node 26.11.1:**

  | Check | Result |
  | --- | --- |
  | Lint, typecheck | clean |
  | Tests | 12,750 pass, 8 skip, 1 fail: an HLS ffmpeg test past its 5 s timeout while the simulator walked; its file alone passes (20 pass, 2 skip) |
  | Smoke | ok |
  | Licences, audit | clean (1,508 packages, 562 crates, 128 pods; zod's advisory excepted until 2026-11-29) |
  | Controls, bundles | clean (bundles covers web and phone; the TV isn't in it yet) |
  | Pages, keyboard, D-pad (prototypes) | clean: 3,408 pages, 329 walked, every TV focusable |
  | Server sweep, playback | clean; Chromium and Firefox |
  | TV walk (simulator) | every stop on every screen: Home 18, the film page 19, Search 43, Collections 14, Movies 53, Alerts 7, Settings 19 and 45 beyond, the player 2 and 1 beyond |
  | TV compare | 8 pairs, gone through; the differences are the calls below |

Calls made (for the owner's review):

1. **No Trailer button, and no Trailers and extras row.** tvOS has no web view to play YouTube's player in. The owner left them out on the TV on 2026-11-02, until the server can fetch trailer files for the TV's own player.
2. **The film's Collections row draws a collection's name only:** the detail's `collection` has no artwork.
3. **The rating is a ★ and the number;** there are no quality tags or logos, since the server has none.
4. **Loading is a spinner,** not the prototype's skeletons.
5. **Settings' sections come from the shared `settingsSections`,** so their words match the other apps'.
6. **The account opens Settings;** profiles wait for their phase.
7. **The Genre menu is a Modal** over the page, focus kept in it.
8. **Home's Bloom isn't drawn.** The featured card follows the title shown, but without the prototype's glow behind it.
9. **The phone's own announcement parser** moves to `inlineParts` in part C.
10. **With no featured card, Home lifts its first row** to the safe area's top, so the head scrolls away until Up takes focus to it. The prototype does the same (its `usePageOffset` keeps the page at rest only for the hero).
11. **A play session an app was killed in lasts until it's idle for five minutes** (`IDLE_MS`), as `packages/stream` intends. The walk killed the player many times, and the compare sheet taken right after it showed "This film didn't start" over a playing picture; taken again later, the player was right. No change now; on 2026-11-02 the owner had a later server part end a device's earlier sessions when it starts a new one.

## How to port a screen (every part)

1. **Open the prototype's route** in the prototypes' dev server (`bun run prototypes`, http://localhost:4500; routes in `design/prototypes/src/routes.tsx`), on the same platform as the app.
2. **Read the prototype's file,** and the shared ones it imports from `src/client/`. Note every call it makes to the mock (`client.library.*`, `client.playback.*`).
3. **Map each mock call to the SDK.** If the server has it, use `@highsea-tv/sdk/react` through `@highsea-tv/client/data`'s hooks. If it doesn't and it's a film feature, it belongs to part A. If it's a show, music, profile or download feature, leave it out and write it in the part's report under "Left for the server".
4. **Port the screen,** keeping the app's routing (wouter on the web, Expo Router on the phone and TV). Swap the prototype's kit for the app's: `TvButton` and the TV kit in `apps/tv/src/kit.tsx`, the phone's `apps/mobile/src/kit.tsx`. Use `@highsea-tv/ui` for every control. Put strings in each app's `messages.ts` (ADR 0021), copying the prototype's words.
5. **Share instead of copying.** When the prototype keeps logic in `src/client/` and two apps need it, it goes into `@highsea-tv/client` with a Bun test (part A has the list). Code that draws stays per app.
6. **Check what you touched:**
   - Biome and tsc;
   - the app's tests;
   - the scoped sweep (CLAUDE.md, and the memory "scope sweeps to the change");
   - the compare sheet for that app.

   Full checks run at each part's report.

## Part A: the shared layer and the server's film features

### A.1 Into `@highsea-tv/client`

Move each of these from `design/prototypes/src/client/` into `@highsea-tv/client`, with tests, and have the prototype import it from there so the two can't drift (as `format` already is):

| Prototype | What | New subpath or file |
| --- | --- | --- |
| `player.ts` | `leavePlayer`, `playNext`, `titleLines`, `titlePage`, `upNext` (a collection's next part, otherwise three More like this choices with no countdown), the Back rules (stage 1's 1.1, 1.2 and 1.4) | `player` (it exists; extend it) |
| `continue-menu.ts` | Continue watching's menu items for a film: Go to the film, Mark as watched, Remove from Continue watching | `library` |
| `detail-facts.ts` | The film page's facts (`Fact`, without `soundtrack` until music) | `library` |
| `pairing.ts` | The code's rules and the waiting TV, shared by the phone's and the web's Connect a device | `servers` or a new `pairing` |
| `data.ts`'s `useServerName`, `collectionCaption`, `titlesHere`, `titlesRow` | The server's name with "this server" until known; collections' captions | `data`, `format` |
| `settings-sections.tsx` (its data, not its drawing) | Which Settings sections each app has, in order | `prefs` |

Keep each module free of the DOM, so React Native imports it (ADR 0055). If a module is kind-aware in the prototype (`'movie' | 'show' | 'episode' | …`), keep the types as the prototype has them, but only films reach it until the server phases ([question 1](#open-questions-for-the-owner)).

### A.2 The server: Remove from Continue watching

- **Contract:** `POST /items/{type}/{id}/dismiss` in `packages/api-contract/src/playback.ts`. `PUT` or `DELETE` works too if it reads better next to `played` and `progress`; follow how `played` is declared.
- **Watch state** (`packages/media/src/shared/watch.ts`, ADR 0054): a dismissed flag that hides the title from Continue watching until it's played again. Playing it again clears the flag, as the mock's `playback.dismiss` does. Add a migration in `packages/db/src/schema/`, then run `bun run generate`.
- **Its event:** `watch.updated`, so other devices refresh.
- **Then:** run `bun run openapi` in `apps/server`. Add tests in `packages/media` and the API's tests. Add a dated section to ADR 0054.

### A.3 The server: Playback settings on the apps

- **The settings:** stage 3.3's Playback settings for films are the audio language, the subtitle language and the quality at home and away. The episode settings (Play the next episode automatically, Skip intros automatically) wait for shows.
- **Where they're kept:** in the preference layers (ADR 0027, `packages/personalization`), where a device's theme is kept, so a device can differ from the account.
- **Who reads them:** the play decision (`packages/runtime`'s `playback.ts` and `packages/stream`'s `decision`) reads the languages and the quality cap when no per-item track prefs are set.
- **Check first:** what `settings/playback` (the admin's, server-wide) already covers, so the two don't overlap. If it's too large for part A, ask the owner at part A's gate whether to move it to its own part.

### A.4 Already on the server: check, then use

- **Next up after a film:** `items/{type}/{id}/next` (a collection's next part). The three choices come from the item's More like this (TMDB's recommendations that are here, `library.ts:108`).
- **Home's featured card:** paging, Play or Resume and More info. The data is curation's sections (`curation.ts`), and the spotlight layout is `spotlight` in `curation.ts`.
- **Connect a device on the web:** `auth/pairing/{code}` and `/approve`.
- **The server's name:** `system/info/public`.

## Part B: `apps/tv` to the prototype (4.5b)

This is the rest of 4.5b's build. Work through it screen by screen against `design/prototypes/src/tv/`. Take each screen's pair from `tv-compare.ts`, and run the D-pad walk (`scripts/sweeps/dpad.ts`) on the prototype.

- **Shell and head:**
  - the head as the prototype's `tv-app.tsx` draws it: Search as an icon, Home, Collections, Movies, then Alerts and the account;
  - Alerts in place of the announcement bar (`tv/alerts.tsx`);
  - Settings through the account, not a tab (client-settings.md's TV navigation).
  - Shows and Music leave the head until their phases.
- **Home (`tv/home.tsx`):**
  - one featured card, with the Bloom following the title shown;
  - rows with a fixed first card, 16:9 cards, Up and Down row by row, and rows that loop without a seam;
  - Continue watching's menu on a 0.6-second hold of OK. Back closes it, and focus returns to the card, or to the next one if the card has gone. A key-up only counts on the card where the key went down (stage 2.4).
- **Library (`tv/library.tsx`):**
  - Movies with the A–Z letter rail in its own column (`TvLetterRail`), which fixes the overlap the compare found;
  - sort and view choices that keep focus on the choice (the memory "TV choices keep focus");
  - Unwatched, then the Genre menu in three columns;
  - "No movies yet", and "Nothing matches" with Show everything reached by Down.
  - Remove the route `library/` in favour of `movies` and `collections`, as the prototype's routes are (stage 1.6).
- **The film page (`tv/detail.tsx`):**
  - Home's hero;
  - the round buttons beside Play;
  - the hold of OK for Mark as watched and From the start;
  - the cast linked to a person's page;
  - the Collections row;
  - the Information card;
  - the tracks panel as a dialog (`tv/tracks.tsx`).
- **A person's page (`tv/person.tsx`):** new. Films only, by department, with focus starting on the first row.
- **Collections (`tv/collections.tsx`, `collection.tsx`):** titles counted with `collectionCaption`, the row named Films, and the audio view's empty line.
- **Search (`tv/search.tsx`):** films, people and collections, in the prototype's order and placeholder. The placeholder's words wait until shows and music: use the film wording the prototype had before stage 2, from `git show f24ee77^:design/prototypes/src/tv/search.tsx`.
- **Settings (`tv/settings.tsx`):**
  - Theme, Sounds, Playback (from A.3), Home screen, Servers (every server, the current one "· in use", Sign out asking first), Your devices and About;
  - no profiles, PIN or Profiles ([question 2](#open-questions-for-the-owner)).
- **The player (`tv/player.tsx`):**
  - Back's rules (stage 1.2): hidden controls leave on one Back; showing controls hide on the first Back; paused, Back leaves;
  - Next up modal only when there's a next title (1.4), from `upNext` (A.1);
  - the error says Home.
- **Copy:** stage 4.3's (a film's error offers Movies, a collection's offers Collections).

**Checks for part B:**
- `apps/tv`'s tests;
- `bun scripts/sweeps/tv.ts`;
- `bun scripts/sweeps/tv-compare.ts`, with each pair looked at and differences explained;
- the TV prototype's D-pad walk, when the prototype changed;
- the full checks at the report.

## Part C: `apps/mobile` to the prototype

Against `design/prototypes/src/mobile/`, with `phone-compare.ts`'s 14 pairs:

- **Home:**
  - the featured card (Play or Resume, More info, paging) and the spotlight layout;
  - Continue watching's menu on a 0.6-second long press, as a sheet;
  - the new film rows from Home screen settings;
  - "Nothing here yet" in the prototype's words.
- **Library:**
  - Movies and Collections under the pills (Shows and Music wait);
  - the A–Z scrubber (`mobile/letter-index.tsx`) when sorted by name;
  - "Nothing matches" with Show everything;
  - pull to refresh (`mobile/pull.tsx`).
- **The film page:**
  - the prototype's action row (Play, then the round buttons; Download stays hidden, answer 8);
  - the cast linked to a person's page;
  - the Collections row;
  - More like this as 16:9 stills.
- **A person's page (`mobile/person.tsx`):** new, films only.
- **Search:** films, people and collections. The query is kept when going Back from a result.
- **You and Settings:**
  - Playback (A.3);
  - Servers with Sign out asking first;
  - the server's name everywhere (`useServerName`);
  - "Sign in a TV" kept as 4.5a built it, with the shared pairing rules (A.1).
- **The shell:**
  - the tab bar keeps the tab a page was opened from (stage 4.2);
  - 44-point targets through the library's hit area (design system 1.1; the prototype's `hitSlop` helper is gone);
  - Can't reach with the spec's second sentence and Try again;
  - Offline staying open while the server can't be reached (stage 1.5).
- **The player:** the shared `leavePlayer` and `upNext`, and the title lines.

**Checks for part C:**
- `bun scripts/bundles.ts`, with the TV added to it (the owner, 2026-11-02): its bundle carries only the native renderer;
- `bun run --cwd apps/mobile test`;
- `bun scripts/sweeps/phone.ts`;
- `bun scripts/sweeps/phone-compare.ts`;
- the prototype's keyboard walk on the phone when the prototype changed.

## Part D: `apps/web` and `apps/desktop` to the prototype

Against `design/prototypes/src/web/`:

- **The shell:**
  - the TV's head on the web (`72a8c60`): Search, Home, Collections, Movies and the account menu;
  - Alerts;
  - one type scale (`1a15f3f`);
  - a taller header (`1348b82`).
- **The desktop app (`src/desktop/window.tsx`):**
  - Back and Forward after macOS's buttons (`HistoryButtons`), with Cmd+[ and Cmd+] on a Mac, Alt and the arrows elsewhere, and the mouse's side buttons;
  - the chevrons left out below medium;
  - Can't reach's Watch downloads waits for 4.6.
- **Home:**
  - the featured card with arrows and dots, Play or Resume and More info, and the Bloom (`client/bloom.tsx`);
  - `SpotlightRow`;
  - the film rows (`web/film-row.tsx`);
  - Continue watching's ⋯ menu.
- **Library:** the A–Z index in its own column, and "Nothing matches" with Show everything.
- **The film page:**
  - the layout of `dcf2700`;
  - the Collections row;
  - the linked cast;
  - More like this as 16:9 stills;
  - the error no longer saying Library.
- **A person's page (`web/person.tsx`):** new, films only.
- **Search:** the text in the address. The server keeps `?q=`, as stage 4's calls say.
- **Connect a device at `/web/link` (`web/link.tsx`):** the code is typed, then the phone's question. The server keeps `?code=`.
- **The player:**
  - the volume slider beside Mute;
  - Exit full screen;
  - Speed (0.5× to 2×, "Normal" at 1×, back to Normal on each play) in Audio and subtitles' panel;
  - the shared `leavePlayer` and `upNext`. Stage 1.1's fix with `inApp` is already in `apps/web`, so keep it.
  - The volume needs a slider, which `@highsea-tv/ui` doesn't have yet (design system 1.1's gaps). Add one to the library with both renderers, and list it at the gate as an addition to the design system.
- **Settings:** Playback (A.3), and the server's name.

**Checks for part D:**
- `apps/web`'s tests;
- `bun scripts/sweeps/playback.ts` in Chromium and Firefox;
- the web pages sweep and keyboard walk on the prototype when it changed;
- `bun run --filter @highsea-tv/web build` and the desktop build (`vite build --mode desktop`), with the desktop app run once (`bun run --cwd apps/desktop dev`).

## Part E: the specs, the guides and the full checks

- **The specs:** where a spec still describes the old screen, update it to what was built. Stage 8 of prototype-gaps lists the known ones: client-settings.md's TV navigation, client-detail.md's long press and linked cast, and client-home.md's rows and featured card.
- **The guides:** `apps/docs/content/watch/` (the web, desktop, iPhone and Apple TV guides) are updated for the new screens with `/guide`, with screenshots retaken where they show a changed screen.
- **The checks:** `/checks full` under Node 26.11, with every sweep. Then `/checkpoint-report` with 4.5b's sign-off.

## Running the native apps on the simulators

Hard-won notes from 2026-11-01:

- **Build Release builds** for the sweeps, as `phone.ts`'s and `tv.ts`'s headers say. After changing shared packages, rebuild the app (`bun run --cwd apps/mobile prebuild` once, then `xcodebuild`, or `bun run --cwd apps/mobile ios`).
- **Metro must see one React Native.** `apps/mobile/metro.config.js` and `apps/tv/metro.config.js` resolve `react-native` from the app. If a launch crashes with "Tried to register two views with the same name", look there first.
- **Restart stale dev servers.** A Vite or prototypes dev server started before a new `@source` or package doesn't scan it. Buttons with no padding mean a stale server, not a bug.
- **The TV and the seeded server:**
  - The seeded server (`scripts/sweeps/seeded.ts`) listens on 127.0.0.1, and its own mDNS can't bind 5353 on a Mac. To have the TV find it, advertise it by hand, pointing at loopback:

    ```
    dns-sd -P Harbor _highsea._tcp local <port> harbor-tv.local 127.0.0.1 id=<server id> version=<version>
    ```

  - Relaunch the TV app, since it only browses at launch.
  - Approve its code with a signed-in user's token through `POST /api/v1/auth/pairing/{code}/approve`, with the code as the TV shows it, dash included.
  - Stop `dns-sd` afterwards.
- **Rules:**
  - Never touch the owner's desktop app's saved server.
  - Never read `.env.local` or `~/.tauri`.
  - The NAS (`/Volumes/data`) is read-only.

## ADRs

- **0054:** a dated section for dismissing a title from Continue watching (A.2).
- **0055:** a dated section for what moved into `@highsea-tv/client` (A.1).
- **0027:** a dated section for the apps' playback preferences (A.3).
- **0059:** a dated section when `apps/tv` is built to the prototype (part B).
- **0060:** a dated section if the library gains the slider (part D).
- **No new ADR is expected.** Write one with `/adr` if a part forces a new decision.

## Risks

- **The parts are large.** Part B alone is most of the TV app. Split a part at its gate if the owner prefers smaller reviews.
- **Kind-aware code with only films behind it.** The prototype's shared modules assume shows and music exist. Porting them without dead branches or empty tabs takes care ([question 1](#open-questions-for-the-owner)).
- **The prototype is still moving.** Stage 6 and design system 1.1 wait for review, and stage 7 isn't drawn. Port from the commit you start on, and re-run `git log` on the prototype's folders at each gate.
- **Locked layouts:** where the server's real data forces a change from the prototype, list it in the report, as the rules say.
- **Native rebuilds are slow.** Batch the TV's and the phone's checks per screen group rather than per change.

## Open questions for the owner

1. **Shows and music in the apps before the server has them.**
   - **Recommended:** the apps draw films only. Shared modules keep the prototype's kind-aware types, but no Shows or Music tab, row, search group or button appears until its server phase. Nothing is faked.
   - Or: build the TV series phase's server work first, so shows come to the apps in this round. That's a much larger piece of work, with its own scope.
   - Or: draw shows and music in the apps behind a development flag, against a fake server. That's earlier review, but code that ships unused.
2. **Profiles (Switch profile, Who's watching, PINs).**
   - **Recommended:** leave them out of this round, and scope household profiles on the server on their own (accounts, PINs, preferences and watch state per profile, ADR 0054 and 0027).
   - Or: scope profiles now as a part F, before the TV's sign-off, since the TV opens on Who's watching in the prototype.
3. **The order of the parts.**
   - **Recommended:** A, then B (the TV, which finishes 4.5b's build), then C (the phone), then D (the web and desktop app), then E.
   - Or: A, then D, C and B, starting where the most people watch (the browser).
4. **Before part A.**
   - **Recommended:** the owner reviews prototype-gaps' stage 6 and design system 1.1 first. Stage 7 (Music in the admin) and stage 8's spec pass follow when the music phase and part E need them, since neither changes what the apps draw for films.
   - Or: finish stages 7 and 8 first, as prototype-gaps' approved order has it, then start part A.
5. **Client-wide playback preferences (A.3).**
   - **Recommended:** build them in part A, so every app's Settings has Playback from the start.
   - Or: leave Settings › Playback out of the apps until a later part, and port everything else first.

## The owner's answers

On 2026-11-01 the owner took every recommendation for questions 1 to 5:

1. **Films only.** Shared modules keep the prototype's kind-aware types, but no Shows or Music tab, row, search group or button appears in the apps until its server phase. Nothing is faked.
2. **Profiles are left out of this round,** and household profiles are scoped on the server on their own.
3. **The order is A, B (the TV), C (the phone), D (the web and desktop app), then E.**
4. **The owner reviews prototype-gaps' stage 6 and design system 1.1 before part A.** Stages 7 and 8 follow when the music phase and part E need them. Asked whether that review had happened, the owner said to start part A now.
5. **Client-wide playback preferences are built in part A** (A.3), so every app's Settings has Playback from the start.

## The owner's answers at part B's review

On 2026-11-02, reviewing part B, the owner took every recommendation for its three decisions:

1. **Trailers stay off the TV** (no Trailer button, no Trailers and extras row) until the server can fetch trailer files the TV's own player can play.
2. **A later server part ends a device's earlier play sessions** when that device starts a new one. Until then, idle sessions end after five minutes, as now.
3. **The TV joins `scripts/bundles.ts` in part C** ([its checks](#part-c-appsmobile-to-the-prototype)).
