# One client platform, part B: every client screen once

- **Status:** Scoped on 2026-11-03, after part A was committed (`2f51779`) and the owner said to start part B. Approved with [the owner's answers](#the-owners-answers) of 2026-11-03, every recommendation. Nothing is built yet; B1 is next.
- **Parent plan:** [one-client-platform.md](one-client-platform.md), part B: "C1 to C8 and the player, moved into `apps/client` from the best of today's app and prototype code, each converged screen put beside its old prototypes for the owner." Its standing rules, architecture and answers all apply.

## Read first

1. The parent plan, especially [one copy of each screen](one-client-platform.md#one-copy-of-each-screen-laid-out-by-rule-b), [the prototypes are the clients](one-client-platform.md#the-prototypes-are-the-clients-a-b), its Progress entry for part A, and the owner's answers at part A's review.
2. [ADR 0061](../adr/0061-one-client-platform.md), and 0055 (the shared logic).
3. `apps/client`: its README, the root layout's gate, `(in)/_layout.tsx` (the shell), `(in)/settings.tsx` and `src/kit.tsx`. These are the pattern every screen follows.
4. The specs: [connectivity](../product/connectivity.md), [client-home](../product/client-home.md), [client-library](../product/client-library.md), [client-detail](../product/client-detail.md), [player](../product/player.md), [client-search](../product/client-search.md), [client-settings](../product/client-settings.md), [desktop-app](../product/desktop-app.md), [shows](../product/shows.md) and [activity-downloads](../product/activity-downloads.md).
5. The old code, to be read before each screen moves:
   - the prototypes: `design/prototypes/src/{web,mobile,tv,client}`;
   - the apps: `apps/web/src`, `apps/mobile/src` and `apps/tv/src`.
6. The checks: `scripts/one-place.ts` with its exceptions, `scripts/sweeps/layout.ts`, and [prototype-gaps.md](prototype-gaps.md) for what stages 1 to 6 added.

## Goal

Every client destination is one screen file in `apps/client`, drawn with the library and laid out by the form-factor rule. The web, the desktop app, the phone and the TV all run it, and so do the prototypes' frames against the mock.

When part B is done:

- the prototype's own client screens are gone from `design/prototypes/src/{web,mobile,tv,client}`;
- `one-place.ts`'s 134 screen exceptions marked "until B" are down to zero;
- every converged screen has been approved by the owner beside its old prototype;
- the layout check holds every destination equal between the web and both simulators.

## Out of scope

- **The builds and how they ship (part C):**
  - the server serving the client's export at `/web`;
  - the desktop app wrapping it;
  - `native.yml`, `desktop.yml` and the release workflow;
  - the end-to-end run's `/web` step;
  - the playback sweep on the new web build.

  `apps/mobile` and `apps/tv` are removed at the end of B2, with `native.yml` pointed at `apps/client`; `apps/web` stays, frozen, until part C (answer 2).
- **The admin (part D)** and **the guides and the 143 values' tokens (part E).**
- **New features.** Part B moves what the prototypes and apps already have, without adding to it. Downloads that actually download are 4.6. Shows and music on the server are their own phases. Android is 4.5c.
- **Prototype-gaps' stages 7 and 8.** They wait for this plan, as the parent plan's answer 7 says.

## Where things stand

- **`apps/client`** has the gate, Choose a server, its sign-in, the shell, Settings and a not-found page, with placeholders for Home, Library, Movies, Collections, Search, Alerts and Offline (`src/app/(in)/`).
- **The old copies of each destination, as files and lines:**

| Source | Files | Lines | What it has |
| --- | --- | --- | --- |
| `design/prototypes/src/web` | 24 | 6,210 | Every destination, with shows, music, playlists, profiles, downloads and the desktop window |
| `design/prototypes/src/mobile` | 23 | 5,103 | The same on the phone, with pairing, Who's watching and the music bar |
| `design/prototypes/src/tv` | 24 | 6,775 | The same on the TV, with alerts and Who's watching |
| `design/prototypes/src/client` | 27 | 4,106 | Shared logic and parts: the player's and music player's rules, shows, downloads, profiles, playlists, the stream's states, Get the apps, the trailer |
| `apps/web/src` | 20 | 5,313 | Films only: Home, Library, collections, a film, Search, Settings, the player, and the desktop app's window, connect and updates |
| `apps/mobile/src` | 26 | 5,444 | Films only, plus a person, pairing a TV, Offline and the player |
| `apps/tv/src` | 18 | 4,789 | Films only, plus a person, Alerts and the player |

- **What the prototypes draw that the server doesn't serve.** Shows, music, playlists and profiles read the mock's state directly, through the prototype's own hooks (`design/prototypes/src/client/data.ts`). There are no routes for them in `@highsea-tv/api-contract`, and the apps are films only. Their routes are drafted for the mock in B3, and the client hides what a server doesn't serve (answer 1).
- **The mock** (`@highsea-tv/mock`) answers the SDK's 22 routes as a transport. It already has show, music and profile state (`shows.ts`, `music.ts`), but behind no route.

## The size of this, and its parts

Part B is the largest part of the plan: about 45 destinations, each with up to four old copies. It's built in three batches, each reviewed by the owner on its own compare sheet (question 3):

- **B1, films:** Home, Library (Movies, Collections, a collection), a film's page, a person's page, Search and Alerts.
- **B2, the rest of the films apps:**
  - the player, with its states, Next up, picture in picture, AirPlay and trickplay;
  - pairing a TV (`/link`), Who's watching, Get the apps and Profile;
  - Offline and Downloads, as drawn (they don't download until 4.6);
  - the desktop app's window chrome, Kept in and an update waiting, as host compositions.
- **B3, shows, music and playlists**, on question 1's answer: Shows, a show's page and an episode, Music with albums, artists, songs and playlists, the music player and its queue, and Now playing.

## Progress

### 2026-11-03: B1 built, signed off by the owner on 2026-11-03

- **The screens, once each, in `apps/client`:** Home, Alerts (a TV page; the bell's popover on pointer, and Home's on touch), Library's Movies and Collections (one page with `?view=` on touch), a collection, a film, a person and Search, each on every form factor. Home draws films only; its shows and music rows come back in B3. Compositions kept per form factor are named in each screen's header comment: the TV's focus rows against the scrolling pages, and Home's three featured forms.
- **The shell** holds what every screen shares: the announcements (the dialog, the TV's full-screen acknowledgement trapping focus, one toast region), the TV head's `down` context, the chrome over a page's art (`useChromeOverlay`, the pointer bar sticky with glass after 8 px, the TV head scrolling away as in the prototype), the touch header with the server switcher and avatar, and the bell's dot.
- **The library's parts, one per idea,** merged by form factor in `@highsea-tv/ui`: Row, FilmRow, NamedAction, PersonTile, FactsCard, LetterIndex and Poster; new are FeaturedCard, Pager, InlineText, NoticeCard, TvAcknowledge, TvRadioGroup, Menu, Popover, Skeleton and RowSkeleton, Certification, PersonPortrait, TitleBackdrop, Bloom, SectionHeading, HiddenHeading and FocusGuide. Hover is a library state (1.08 and 1.1 on buttons, 1.02 on posters). ADR 0060's dated section lists the props and the changes in meaning.
- **The logic moved first:** `@highsea-tv/client/films` (the person's header and the films' words), `library`'s filmography and `playPath`, and `@highsea-tv/media/search`, which the server and the mock now share (`rankSections`, `rankByMatch`, `SEARCH_LIMIT`). ADR 0055's dated section has them.
- **The mock** answers B1's routes from `packages/mock/src/films.ts`, with `SEED`'s contract ids (the film `10111`, the prototype's `4`), and raises `watch.updated`.
- **The prototypes hand B1 to the client.** `src/chrome/client.ts` holds the routes (`CLIENT_ROUTES`, `CLIENT_EXACT`), and the prototype's own B1 copies and the tests that drove them are removed; each is covered by `apps/client`'s Jest. The prototypes' suite passes 1,474.
- **The layout check** (`scripts/sweeps/layout.ts`, `apps/client/uitest/Layout.swift`) covers every B1 destination on the web, the iPhone and the Apple TV, opening each by its address. Of 24 pairs, 15 differ, all listed for the owner below; the sheets are outside the repo.
- **The compare sheet** puts each of 83 old screens (2f51779) beside the client's, with a note on each that differs, outside the repo. Its first review found ten faults, and these were fixed before the sheet was remade:
  - the pointer client below 768 draws the prototype's narrow top bar (the server, Search, Alerts and the profile on one line, the destinations as a scrolling line under it), and the Movies filters wrap there (react-native-web's View doesn't shrink by default);
  - the browser's own outline is gone from text fields (react-native-web's TextInput resets the border but not the outline), and the top bar marks Search by colour only;
  - the TV film page's words start under the head, so More like this peeks in at the foot again;
  - the rating's stars keep their size on the web, where an `<svg>` shrinks;
  - the TV's collection tiles draw the mosaic and the Smart badge;
  - a collection that isn't on the server says so in the page's own words.
  A second review of the remade sheet found the text a weight heavier and brighter than the prototype's: the client's export had no font smoothing, which the prototypes' styles set, and its unchosen tabs were `text-2` where the prototypes dim `text` to 65%. Both are fixed in the library, with the 1440 top bar's inset, height and centring (react-native-web's View sets `alignContent: 'flex-start'`). The recapture after it matches the prototype's text and bar; one difference left is that the bar's bottom rule crosses the backdrop on a film's and a person's page at 1440, which is on the owner's list.
  Four of the first ten weren't the client's: the cut-off Staff picks card is the row's peek, the TV's announcement was dismissed by the capture script, Theo has seen Movie night in the seed, and the rest need the contract (below).
- **Found and fixed on the way:**
  - the TV person page scrolled under the head and drew past the screen: a part's own keep wasn't written on the web, and the ambient backdrop's transform counted toward the page's overflow (CSS Transforms 1 § 3);
  - Pressables with `focusable={false}` kept a tab stop on the web (react-native-web's Pressable ignores `focusable`), so `press.tsx` sets `tabIndex: -1`;
  - selected chips are `radio` and `checked` on the web and `button` and `selected` on iOS and tvOS, from the library's `chip.tsx`;
  - a render loop in the shell's toasts.
- **Left as they were, on judgement:** the back registry's and the not-found words' copies stay in `apps/mobile`, `apps/tv` and `apps/web`, which B2 and C delete; `one-place` reports none of them.
- **Values without tokens** (part E): Home's 0.62 and 0.46 rows and the TV's 22u Continue watching (`apps/client/src/home/sizes.ts`), the TV's Alerts sizes, the phone's 17 section heading and the person's 15/1.45 biography. They're written into `docs/design-language/platforms/`.
- **Waiting on the contract or the owner** (answered at B1's review, [below](#the-owners-answers-at-b1s-review)):
  - title art (`Art` has no `logo`), the featured card's and More like this's quality badges (`ClientItem` has no quality), and Home's bloom (no palette colour on `art`);
  - trailers on pointer clients (a YouTube embed, with `frame-src` in `/web`'s CSP; client-detail.md's open question);
  - the server's own collections in Search (`ClientCollection.id` is TMDB's number);
  - language names on the devices (Hermes has no `Intl.DisplayNames`; a names catalog in `@highsea-tv/i18n` would serve both);
  - the layout check's tree-only differences (react-native-web's list and region groups, tvOS reading a focusable card as one label, offscreen TV shelves), not excused until the owner says.

### 2026-11-03: what B1's review added, signed off by the owner on 2026-11-03

- **The top bar over a backdrop draws no line.** The line was the bar's own gradient: a background image starts at the padding box and repeats into the border box (CSS Backgrounds 3, `background-origin`), so the transparent bottom border showed a dark strip. The clear bar sets `backgroundOrigin: 'border-box'`, as the prototype's `bg-origin-border` does (`apps/client/src/app/(in)/_layout.tsx`, held by `test/shell-chrome.jest.tsx`).
- **Trailer** on the web, the desktop app and the phone, not the TV, after From the start, as in the prototype (`apps/client/src/detail/trailer.tsx`). The first Trailer, or a Teaser before release, among YouTube's videos opens a dialog with `https://www.youtube-nocookie.com/embed/{key}`. The library draws it once: `StillFrame` holding an `Embed` pair, an `<iframe>` on the web (`embed.web.tsx`) and a `react-native-webview` WebView on the phone (`embed.tsx`). The phone's WebView loads a small page framing the same embed with `baseUrl https://highsea.tv`, since YouTube plays an embed only for a client its Referer names (YouTube API Services' required minimum functionality). `react-native-webview@14.0.1` is Expo SDK 58's own version. It's unlinked from the Apple TV's project, which has no WKWebView (`apps/client/react-native.config.js`). `/web`'s CSP and the desktop webview's allow `frame-src https://www.youtube-nocookie.com` (ADR 0003's and 0058's dated sections). In mock mode the dialog draws the still and the prototype's note, so no capture loads YouTube. Dialog gains an opt-in close button (`closable`).
- **Language names from a catalog,** `@highsea-tv/i18n/languages`: 186 names, exactly the codes the server's tracks use (`LANGUAGE_CODES`), in CLDR's English as Node's ICU gives them, with a regional tag falling back to its language. The clients no longer call `Intl.DisplayNames`, which Hermes lacks (its IntlAPIs.md), so the phone and the TV say English rather than en (ADR 0055's dated section).
- **The layout check's exceptions, each with its reason** (`scripts/sweeps/layout.ts`, tested in `layout.test.ts`): react-native-web's list, region and group wrappers around paired nodes (`CONTAINER`); a field's own words (`FIELD_WORDS`); words inside a stop that tvOS reads as one label (`IN_STOP`); and the letter index, which XCUITest reports by its adjustable trait rather than as a field.
- **The checks after it,** under Node 26.11.1: lint (1,758 files), typecheck, 12,848 tests pass with 8 skipped, and every app's Jest; `one-place`, `controls.ts` and `bundles.ts` clean; the pages sweep clean on 3,296 pages, the keyboard walk on 319, every TV focusable reachable, and the server's admin pages clean. Both mock-mode builds succeeded, the Apple TV's without the WebView. The layout check passes all 25 pairs, where B1's report had 15 differ, once the field rule also took a tvOS field that isn't being edited, which XCUITest reports as `other` with what's typed as its value. The compare sheet's film and person screens are recaptured.
- **Found on the way:**
  - "Directed by" on the phone wrapped because FactsCard fixed its labels at the widest label's measured width, and react-native-web's `onLayout` rounds that width to a whole pixel (`offsetWidth`). The labels now take it as `minWidth` and don't shrink, so it no longer wraps. This was a bug, not the wrap answer 7 accepted.
  - The TV's About card is now read with its words (FactsCard's `says`): tvOS reads a focusable card only by its label.
  - `apps/mobile`'s Chip test still expected the role Chip had before B1 (a button, selected); it now expects B1's toggle, checked.
- **For the owner:**
  - the contract's `Video` has no length, so the line under the trailer is its kind alone;
  - YouTube's playback in the phone's WebView, and whether it accepts the desktop webview's `tauri://localhost` referrer, are untried on devices;
  - the server's own `languageName` copies (subtitles and media) still use `Intl.DisplayNames`, which works on Node; they could move onto the catalog later.

### 2026-11-03: the TV's gate, Alerts and Settings, from the owner's look at the TV

The owner signed B1 off on 2026-11-03 with these, its review's additions and the items under For the owner above left as noted. B2 (the rest of the films apps) is next.


- **Choose a server and its sign-in** had drawn their titles at the hero's size (5.2u) with the controls' own gaps, not the prototype's `tv/connect.tsx` (2f51779). They now take its sizes from `TV_GATE` (`apps/client/src/gate-sizes.ts`): the words 1.6u apart, the code's title 3.6u and the others 3u at `leading-[1]`, the steps 0.8u apart, the buttons 1u, and the servers a 44u list at 0.6u with its rows' padding.
- **Alerts** stood under the head in flow, so the page's top fade fell on its title. Its head now lies over the page as on Movies and Collections (`useChromeOverlay`), and its title is a library page's `LibraryTitle`, the prototype's `h1`.
- **Settings** now has a library page's title above its sections and panel, as the other pages do, on the owner's word. The prototype drew it as a row title beside the list.
- Checks: lint, the client's typecheck, its 215 Jest tests, `one-place` and `controls.ts` clean; every TV focusable reachable; the layout check's TV pairs for the four screens the same (0 differences).

### 2026-11-04: B2, signed off by the owner on 2026-11-04

- **The player, once, at `/play/[id]` and `/play/[id]/start`** (`apps/client/src/player/`): one model (`usePlayerModel` in `parts.tsx`: the chrome's timer, the stream's state and message, Next up and its countdown, leaving) and three compositions by input. Pointer (the web and the desktop app): Space, ← →, M, F and Esc, the top bar, the scrubber with trickplay, the transport, the volume, Audio and subtitles with the speed, picture in picture and full screen. Touch (the phone): tap to show, AirPlay, picture in picture and the tracks sheet, and "Playing on another screen". The TV: the remote's keys, Back in steps, the legend, and Audio and subtitles staying open on a subtitle for its timing. The picture is a platform pair: expo-video on the devices, `<video>` with a WebVTT `<track>` on the web. The engine is `@highsea-tv/native/playback`, unchanged.
- **Connect a device** (`(in)/link/`, the phone's camera through expo-camera, a typed code elsewhere), **Profile** (`(in)/profile.tsx`; by touch, the phone's You at `/settings`, with the person at its top and Downloads in its list), the pointer's **account menu** (`src/account/menu.tsx`) and **Get the apps** (a dialog from a browser's Settings › About).
- **Offline and Downloads** (`(in)/offline.tsx`, `(in)/downloads.tsx`, `src/downloads/`): the phone's Offline, the desktop app's Downloads with Kept in, a browser's page pointing at the desktop app, nothing on the TV, and Download on the film page. Real builds say downloads come in a later update; the list draws in mock mode only, until 4.6.
- **The desktop app's chrome** (`src/desktop/`): the window's chrome per OS, Back and Forward with their keys, an update waiting (the avatar's dot, the menu's Restart to update, About's box) and Kept in, behind one seam (`useDesktopHost()`), which the mock fills when the frame says `app=desktop` and part C fills with Tauri. What part C must wire is in ADR 0061's 2026-11-04 section.
- **The logic:** `@highsea-tv/client/downloads` (new), `player`'s `SPEEDS`, and `playPath` on the client's routes (ADR 0055's dated section). The library gained `MenuOption.detail`, ProgressBar's `tone` and `showValue`, and the `folder` and `copy` icons, and lost the TV's aliases and ThemeProvider's `platform` (ADR 0060's dated section).
- **The mock plays Sintel's 52 s clip,** made by ffmpeg from the subtitles fixture into `node_modules/.cache` and served at `/web/mock-media/`; `packages/mock/src/play.ts` answers the six play routes, with the toolbar's `stream` choosing the state. The frame's state gains `app`, `os`, `update`, `downloads` and `airplay`.
- **The prototypes hand B2 to the client:** `/play` (but an episode's, until B3), `/link`, `/profile`, `/offline`, `/downloads`, and `/you` as `/settings`. Their own copies are removed (`web/link.tsx`, `web/settings.tsx`, `mobile/pair.tsx`, `client/offline-list.tsx`, the C5 tests), and the C4 and C5 flows open `SEED`'s film.
- **`apps/mobile` and `apps/tv` are removed.** `native.yml` builds and tests `apps/client` for iOS and tvOS; `bundles.ts`, `controls.ts`, `license-audit.ts`, `one-place` and `release.ts` point at it; Maestro's flow is `apps/client/.maestro/` and the D-pad walk `apps/client/dpad-walk`; `phone-compare.ts` and `tv-compare.ts` are gone, replaced by the layout check and the compare sheets. `one-place`'s "until B" screen exceptions for the two apps are cleared.
- **The layout check** covers B2's destinations where each exists: Connect a device's question, Downloads and the player. On the simulators every pair is the same: the full run's 28 pairs had 23 the same, and the rerun after the fixes below took the other six (Connect a device, Downloads, the player and Settings on the iPhone; the player and Settings on the Apple TV) in the rerun after the fixes below, with no differences beyond the listed exceptions.
- **The compare sheet** puts 54 old screens (2f51779) beside the client's, outside the repo, with a note on each that differs.
- **Judgement calls,** listed in the gate report: the player's times in the mono face (the tokens' mono style sets it; the prototype's class didn't), the volume always shown from a regular width, the TV's messages over black as `apps/tv` drew them, the role line's words, values rounded to tokens (28→24, 18→16, 13→12), and the 163 player measures and the window's system measures excepted until part E.
- **Found and fixed by the layout check on the simulators:**
  - The player's controls could stay shown for good while playing. Each time update (every 250 ms) cleared the hide timer, and one landing after the moment but before a late timer fired dropped the moment. The timer now runs against the `now` it was drawn with, firing at once for a moment already past, with a Jest test that fails without it.
  - On the Apple TV, Settings opened from the avatar kept focus on the avatar: tvOS doesn't move focus to a preferred stop over a focused screen, and a screen still in the stack's fade can't take it. The section asked for is now handed focus once its view exists and again at the native stack's `transitionEnd`.
  - On the Apple TV the player's capture showed its controls. The app was right: the capture came 2.6 s after the player opened, before the controls' 3 s, because the TV's anchor (the scrubber) is there from the start, while the phone's (Show controls) appears only once they've hidden. Each step now carries a `settle` (`settleFor` in `scripts/sweeps/layout.ts`, from `HIDE_MS`), which Layout.swift and the web's capture both wait out. Along the way, react-native-tvos was found to send focus changes to the remote's handler as `focus` and `blur` (`RCTTVNavigationEventNotification`), so the TV player no longer counts those as keys, with a Jest test.
  - The Jest suite's first player test could pass the 5 s default under load (30 s now, as the other route-tree suites have).
- **Checks** under Node 26.11.1: lint (1,739 files), typecheck, 12,780 Bun tests pass (8 skipped, 246 files), the client's 279 Jest tests (28 suites), smoke, licences (1,529 packages, 562 crates, 122 pods), the audit (zod excepted until 2026-11-29), `one-place`, `controls.ts`, `bundles.ts` and actionlint clean; the sweeps clean: pages (3,296), keyboard (319 walked), the D-pad (every TV focusable reachable), the server's admin pages (its keyboard half clean on its own run; under the simulators' load it had timed out on Now playing's empty state, which B2 doesn't touch), and playback in Chromium and Firefox.

- **The owner's answers to B2's two decisions (2026-11-04),** both recommendations:
  1. A link opened over the player closes it and goes where the link points, stopping playback as Back does. It's done in B3 with Expo Router's documented options; until then the layout check closes the player before opening Settings.
  2. Downloads stay mock-only until 4.6: real builds say they come in a later update.
- **Before B2's approval (2026-11-04),** on the owner's word: About in the desktop app reads "for Mac" as desktop-app.md says, not "for macOS" (`host.web.ts`'s `OS_NAMES`; Get the apps keeps "macOS", as its table does), and the prototypes' unused copy of Kept in (`design/prototypes/src/web/kept-in.tsx`) is removed, since the client's `src/desktop/kept-in.tsx` is the one place.

The owner signed B2 off on 2026-11-04 with both answers above and these two changes; the link over the player is B3's first item. B3 (shows and music) is next.

### 2026-11-04: B3, signed off by the owner on 2026-11-04

- **The foundation: drafted routes and what a server serves.** Shows, music, playlists and profiles are drafted in `@highsea-tv/api-contract` (`shows.ts`, `music.ts`, `profiles.ts`, `kinds.ts`), each marked `x-highsea-draft` and documenting a 501. The server registers them all (`apps/server/src/api/drafts.ts`) and answers 501 Not Implemented with `{reason:'draft'}`, and the mock answers them from seeded state (`packages/mock/src/kinds.ts`, `profiles.ts`). Public info's `sources` lists what a server serves, `useServes` reads it, and the client draws shows, music and profiles only where they're listed. The mock lists them all, and a real server lists none yet, so a real server's client looks as it did at B2. The logic is in `@highsea-tv/client`'s `shows`, `music`, `music-player` and `profiles` (ADR 0055's and 0061's dated sections).
- **Shows** (`src/shows/`, `(in)/shows.tsx`, `(in)/shows/[id].tsx`): the list (Library's Shows view by touch), a show's page with its seasons and episodes, Play's target, and Mark season. An episode plays at `/play/episode/[id]` through the films' player.
- **Music** (`src/music/`, `(in)/music.tsx`, `(in)/music/…`): Albums, Artists, Songs and Playlists (Library's Music by touch), an album, an artist and a playlist with rename, reorder and delete, plus Home's rows and Search's kinds for music.
- **The music player** (`src/music-player/`): one store, mounted once by the shell. With a pointer it's the bar under the page, with the queue in a side panel. By touch it's the mini player above the tabs, with Now playing at `/now-playing`. On the TV it's Now playing in the head and its own screen. A film starting pauses it.
- **Profiles** (`src/profiles/`, `(in)/who/…`): Who's watching, its PIN pad, a new profile on the TV, and the TV's opening that asks on launch; the phone's Switch profile sheet from Settings. The server checks the PIN.
- **A link opened over the player closes it** (B2's answer 1): the root layout's `useLinkLeavesPlayer` removes the player's routes with React Navigation's `reset` once the link's place is on top. The layout check no longer closes the player itself.
- **The library** gains `EpisodeRow`, `Waveform`, `PlayingBars` and `Slider`, `Avatar`'s profile tone and ring, square and round art in `Poster` and the TV's tiles, `SortableList`'s `look: 'line'`, and four icons (ADR 0060's dated section).
- **The prototypes' client folders are removed:** `src/web`, `src/mobile`, `src/tv` and `src/client` are gone, and every client route is the client's (`heldByClient`). Get the apps moved to `src/admin/system/get-the-apps.tsx` until part D. `one-place` has no "until B" exceptions left for the prototypes.
- **The layout check** covers B3's destinations: shows, a show, music, an album, songs, a playlist, Who's watching, Now playing and the music bar.
- **The compare sheet** puts 119 screens from ca6bf76 beside the client's, outside the repo, with a note on each that differs.
- **Found and fixed by the layout check on the simulators:**
  - On the iPhone, Switch profile's sheet stayed over whatever a link opened. A React Native `Modal` stays presented over a screen pushed above its own. Settings now opens the sheet only while it's the focused screen (`useIsFocused`), and a Jest test covers it.
  - On the iPhone, an album's song rows drifted apart by a third of a point each. Their hairline borders are ⅓ pt on iOS and 1 px on the web, and as borders they add to each row's height. The divider is now drawn over the row's bottom edge instead.
  - The TV album's eyebrow was set with `fontFamily: 'Geist Mono'`, a name iOS didn't find, so it fell back to the system face. It now takes the text's `mono` prop, as the tokens set it. The same applies to a playlist's.
  - On iOS, a show's certification was one element whose label replaced its text. It's read from its text now, as `QualityTag` is.
  - On the web TV, closing the announcement lost focus to the page. The first preferred stop in the document was on the screen the navigator keeps inert beneath, so it couldn't take focus. The web focus engine now tries each preferred stop until one takes it, with a test that fails without the fix.
  - The anchors for Songs (the TV has no count), Switch profile's title by touch and Music's tabs (a tab on the web, and on iOS a view in a tab bar, which XCUITest lists as other) now match what each platform draws.
  - On the iPhone, a link opened while Switch profile's sheet was up never showed its screen. react-native-screens presented the player while React Native's Modal was still going away, a clash its own source names (`RNSScreenStack.mm`; software-mansion/react-native-screens#2048). The client now has `src/app/+native-intent.ts`, whose `redirectSystemPath` expo-router awaits before following a link. It calls the library's `yieldToLink`, which closes every Sheet and Dialog that's up on iOS and waits for each Modal's `onDismiss`. A Jest test covers it (`test/link-yield.jest.tsx`). Expo Router's test renderer with `{ appDir, overrides }` drops file extensions, so the file was taken for a route. The three suites that lay routes over the app now use `appWith` in `test/mock.ts`, the renderer's in-memory form.
  - On the iPhone, You sometimes lost its profiles, and on the Apple TV a page could open with no Shows or Music in the head. The SDK's `useQuery` keeps each component's answer to itself, so each screen that asked `useServes` started from nothing until its own public info answered. And `ProfilesProvider` wrapped the shell in a different element once public info answered, so React mounted the whole signed-in shell again (React's [Preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)). `usePublicInfo` now starts from the client's last answer and fetches again quietly. The provider is one element whatever public info says, and `useProfiles(asked)` still never asks a server that doesn't serve profiles. A Jest test covers both (`test/profiles-provider.jest.tsx`).
  - On the web, the library's Sheet filled the whole window, because react-native-web's Modal ignores `presentationStyle`. It now starts below the top inset, as iOS's page sheet does. This is a visible change on the web.
  - An album's songs were labelled with Shows' "Show songs" words. They're a region named Songs now, as the prototype's section is.
  - The layout check reads only the open dialog's contents on the web while one is up (`aria-modal`, WAI-ARIA 1.2), as VoiceOver does. It doesn't pair a web list or region by name with a device node, since UIKit doesn't list those containers. It visits Connect a device and Downloads before the shows and albums, whose Download buttons start the mock's downloads ticking.
  - On the Apple TV, Music's songs started 41.5 pt left of their place, under the letter index. The index's room was 0 while the songs loaded, then sprang open under 383 rows. The TV now keeps the room while a by-name view loads, as the pointer already did; the rule (`indexedBy` in `music/library.tsx`) is shared by both.
  - The layout check lets a y differ by 0.05% of its depth when that's more than its 4 points (`DEPTH_SHARE`). Down Songs' 383 rows, the Apple TV's sub-point differences add up to 4.5 points by 12,000 points down, with every row's own size and spacing within a point. Above 8,000 points the rule is as before. The devices' capture (`uitest/Layout.swift`'s `still`) now waits until two snapshots a third of a second apart have every frame the same. Without it, the Apple TV caught Songs' head chip still shrinking, and its first row still lifting, after the row took focus.
  - The D-pad sweep found two TV pages with no first focus. The not-found page's Go home didn't ask for it on the TV, which shows now that `/tv/nowhere` is the client's. The sweep's `clientUrl` also put a second `?` after an alias that carries its own query (the TV's `/start` is `/who?launch=1`), so the frame lost `ff=tv`; it now splits the alias's query, as the prototypes' `clientSrc` does.
- **Checks** under Node 26.11.1: lint (1,733 files), typecheck, 12,578 tests pass (8 skipped) and the client's 326 Jest tests in 34 suites, smoke, licences (1,529 packages, 562 crates, 122 pods), the audit (one exception, zod's GHSA-mrhx-c7xc-m3w5 until 2026-11-29), `one-place` clean, and the sweeps clean: pages (3,296), keyboard (319), D-pad, the server's admin pages, playback in Chromium and Firefox, and the layout check (45 pairs, none differ).
- **The owner's answers to B3's five decisions (2026-11-04),** every recommendation:
  1. The music player stays as built: the web's bar and the phone's mini player in the page's flow, the queue as a side panel, outline transport icons, and AirPlay with no device name.
  2. Shows stay as built for now: the title as text, no show-wide Audio and subtitles, Download and Skip intro per episode, and a collection's and a person's shows waiting for the contract.
  3. Editing a profile and checking the current PIN wait for the server's profiles. The TV's PIN keys are fixed now, with a pressed state and the prototype's size.
  4. TV Search's songs without covers, Music as the missing page's way out and the 160 pt tile are accepted. Rename after the Menu is checked on the iPhone simulator before sign-off.
  5. The drafted contract stands: a wrong PIN answers 403, and after five the server rests the profile with `Retry-After`.
- **What the answers asked for (2026-11-04):**
  - Answer 3: the TV's Shift key now has a pressed state: `TvKey`'s `pressed` (`packages/ui/src/native/tv/controls.tsx`) makes it a toggle button with a dot before its words, full ink when on and a quarter when off. The keys keep the control spec's size (3.28u against the prototype's 3u); the owner signed B3 off with them so on 2026-11-04.
  - Answer 4: Rename after the Menu was checked on the iPhone simulator with a Maestro flow (Library › Music › Playlists › Late night, More, Rename…, typing, Rename). It found that the sheet's Rename took two taps: the Sheet's ScrollView kept React Native's default `keyboardShouldPersistTaps` ('never'), so the first tap only closed the keyboard. The Sheet now passes 'handled' (https://reactnative.dev/docs/scrollview#keyboardshouldpersisttaps), and the flow renames the playlist in one tap and shows Renamed Late night drive.

## How each screen moves (B1 to B3)

- **One file per destination** in `apps/client/src/app/`, with one composition per form factor only where the screens do different things, such as the TV's focus rows against the phone's scrolling page. Each of those is listed in the screen's header comment and in the report.
- **The design to follow is the prototype's,** since it's locked. Where an app and its prototype differ, the prototype wins, and the app's code is reused where it already matches. Where the phone, TV and web prototypes differ only in size or columns, they become one layout with the rule's values. The owner approves each converged screen on the batch's compare sheet.
- **Layout values the guides don't state** take the prototype's: the web's page margin by width, posters per row, the gap between rows, and the compact-pointer and regular-touch layouts. They're written into `docs/design-language/platforms/` as each screen moves (the owner's answer 3 at part A).
- **The library's parts become one part per idea,** with a form for each form factor: `TvFilmRow` and `Row`, `TvPersonTile` and `PersonTile`, `TvInfoCard` and `FactsCard`. `parity.ts` lists any that can't.
- **Hover** on primary and danger buttons, and poster hover at 1.02, are added as library states in B1 (the owner's answer 6 at part A).
- **Logic moves to `@highsea-tv/client`** before its screen moves. That covers the prototype's `src/client` rules (the continue menu, downloads, profiles, playlists, shows and the music player) and anything an app keeps in its own files. Nothing is kept twice.
- **Strings** go in `apps/client`'s catalogs, or the client's shared ones. The copies of the not-found words, the TV's `back.tsx` and `PAIRING_APPROVAL_MS` left by part A are removed in B1.
- **The prototype's own copy is removed** once its screen is in `apps/client` and the old screen is on the compare sheet. The prototypes' routes then point their frames at the client (`src/chrome/client.ts`'s held routes).

## The checks (B1 to B3)

- **`one-place.ts`:** each batch removes its "until B" screen exceptions. A batch isn't done while any of its own exceptions are left.
- **`layout.ts`:**
  - every destination is captured on the web at compact-touch, regular-pointer and tv;
  - the iPhone and Apple TV simulators capture it from the mock builds;
  - mock seeds give each screen its data (question 4).
- **The sweeps:** `pages.ts`, `keyboard.ts` and `dpad.ts` run against the client in the frames, in three themes and at 200% text.
- **The player:** the playback sweep keeps running on `apps/web` until part C moves it. The client's player is checked in the frames and on both simulators, with Sintel from the mock's fixtures.
- **Before each batch's report:** `/checks` full.

## ADRs

- **0061** gets a dated section per batch, covering what converged, the parts merged and any composition kept per form factor.
- **0055** gets a dated section on the logic moved from the prototype's `src/client`.
- If question 1 is answered as recommended, **0061** also records the draft routes for shows, music, playlists and profiles. It records how the client hides what a server doesn't serve.

## Risks

- **Every screen changes for someone.** Three designs become one. The compare sheets show each screen beside its old self at every form factor, and the owner approves batch by batch.
- **The player is the hardest screen.** Its engines differ by platform (expo-video, and `<video>` with hls.js), and so do its subtitles (native cues, and the browser's `<track>`). Picture in picture, AirPlay and the TV's Back in steps are platform behaviours behind one screen. It moves in B2, after the simpler screens have settled the pattern.
- **The web bundle grows** as screens move. It's measured at each batch against part A's 2.98 MB (661 kB gzipped).
- **The simulators' builds are slow,** about ten minutes for both. The layout check runs once per batch rather than per screen, with its preflight first.

## Open questions for the owner

1. **Shows, music, playlists and profiles.**
   **Recommended:** move them into `apps/client` with the rest. Their routes are drafted in `@highsea-tv/api-contract`, and the mock answers them. The real server doesn't serve them yet, so its answer leaves them out, and the client hides what a server doesn't have (Shows and Music in the navigation, profiles in Who's watching). The prototypes are then wholly the client, and these screens are ready for their phases.
   Or: leave them in `design/prototypes` on the old renderer until their phases build them in `apps/client`. Part B is then smaller, but the prototypes keep a second set of client screens. `src/web` and the prototype's hooks also stay alive past part D.
2. **When the old apps go.**
   **Recommended:**
   - `apps/mobile` and `apps/tv` are removed at the end of B2, once `apps/client` builds the phone and the TV with every films screen. `native.yml` points at `apps/client` then, a small piece of part C brought forward.
   - `apps/web` stays, frozen, until part C moves `/web` and the desktop app onto the client's export, and is removed there.
   - `one-place.ts` lists `apps/web` until C.

   Or: all three stay frozen until part C removes them together. That's simpler, but three old apps stay beside the new one for longer.
   Or: bring part C's switch of `/web` and the desktop app into part B, and remove all three in B. That's cleaner, but part B gets larger and its review is harder.
3. **How the owner reviews.**
   **Recommended:** three batches (B1 films, B2 the rest of the films apps, B3 shows and music), each stopping for review on its own compare sheet.
   Or: build all of part B without stopping and review it once, as design system 1.1 was. It's faster, but the sheet is about 45 destinations at three form factors, and a change asked for in B1 then lands on every later screen too.
4. **What the layout check covers.**
   **Recommended:** every destination, on the web, the iPhone and the Apple TV, each from a mock seed. Then no screen can drift between targets unnoticed.
   Or: the main screen of each section only (Home, Library, a film, Search, the player and Settings). That's quicker to run and keep up, but the rest is checked only by eye on the compare sheet.
5. **The player's subtitles on the web.**
   **Recommended:** the web keeps the browser's `<track>` with WebVTT, as `apps/web` does now, and the player screen draws its own cues only where the engine hands them over (expo-video on iOS, tvOS and Android). That keeps behaviour as it is today.
   Or: the screen draws the cues itself on every platform, from the WebVTT it fetches. Subtitles then look the same everywhere, but the web gives up the browser's own caption settings and accessibility.

## The owner's answers

On 2026-11-03 the owner took every recommendation for questions 1 to 5:

1. Shows, music, playlists and profiles move into `apps/client` in B3. Their routes are drafted in `@highsea-tv/api-contract` and the mock answers them. The real server doesn't serve them yet, and the client hides what a server doesn't have.
2. `apps/mobile` and `apps/tv` are removed at the end of B2, with `native.yml` pointed at `apps/client`. `apps/web` stays, frozen, until part C moves `/web` and the desktop app onto the client's export. `one-place.ts` lists it until then.
3. The owner reviews three gated batches, B1, B2 and B3, each on its own compare sheet.
4. The layout check covers every destination on the web, the iPhone and the Apple TV, each from a mock seed.
5. On the web, the player keeps the browser's `<track>` with WebVTT. The screen draws cues only where the engine hands them over (expo-video on iOS, tvOS and Android).

## Questions at B1's review

B1's [checkpoint report](#2026-11-03-b1-built-waiting-for-the-owners-review) left these for the owner:

1. **The contract's gaps** (title art, quality on `ClientItem`, a palette colour, the server's collections in Search). **Recommended:** add them in a later server part; or before B2; or drop them and change the prototype.
2. **Trailers on pointer clients.** **Recommended:** wait for trailer files on the server, as on the TV; or embed YouTube now on the web and desktop app; or never on the clients.
3. **Language names on the devices** (Hermes has no `Intl.DisplayNames`). **Recommended:** a names catalog in `@highsea-tv/i18n`; or a polyfill; or codes.
4. **The screens that changed on the compare sheet.** **Recommended:** approve all of them except the top bar's bottom line over a backdrop at 1440, which goes; or approve all; or revert all to the prototype.
5. **A focused field's look.** **Recommended:** the control spec's focus edge; or the prototype's 3px soft accent ring.
6. **The Search icon.** **Recommended:** Icon's standard 16 and 1.75; or 18 and 2.25 with a new stroke option.
7. **"Directed by" at 390 on the web.** **Recommended:** let it wrap; or one line with an ellipsis.
8. **The layout check's tree-only differences.** **Recommended:** excuse each with its documented reason; or change the roles until the trees match.

Two follow-ups came from answer 2:

9. **The embed's host.** **Recommended:** `www.youtube-nocookie.com`, YouTube's privacy-enhanced mode; or `www.youtube.com`.
10. **The phone's trailers.** **Recommended:** wait for trailer files; or open YouTube outside highsea; or embed in a WebView.

## The owner's answers at B1's review

On 2026-11-03 the owner took every recommendation for questions 1 to 10 except 2 and 10:

1. The contract's gaps wait for a later server part. B2 goes on with what's drawn now, and the screens pick them up when the server sends them.
2. **Changed by the owner:** the web and the desktop app embed YouTube trailers now, from `ClientDetail.videos`. The TV stays without until the server keeps trailer files (the owner's call of 2026-11-02).
3. Language names come from a catalog in `@highsea-tv/i18n`, used on every client.
4. Every change on the sheet is approved except the top bar's bottom line, which goes over a backdrop on a film's and a person's page at 1440, as in the prototype.
5. A focused field draws the control spec's focus edge.
6. The Search icon keeps Icon's standard size and stroke.
7. "Directed by" wraps at 390.
8. The layout check excuses each tree-only difference in its exceptions, with its documented reason.
9. The embed and `frame-src` use `www.youtube-nocookie.com` only.
10. **Changed by the owner:** the phone plays the trailer in the app, in a WebView (react-native-webview through `/add-dependency`) holding the same privacy-enhanced embed.

### What the answers add to B1, before its sign-off

- The top bar draws no bottom line over a backdrop (answer 4).
- A Trailer button on the web, the desktop app and the phone, opening the embed. On the web it's an `<iframe>` in a platform file. On the phone it's a WebView. `/web`'s CSP and the desktop webview allow `frame-src https://www.youtube-nocookie.com` (ADR 0003's and 0058's dated sections), and client-detail.md's open question is answered. The trailer's prototype (`design/prototypes/src/client/`) is the design to follow (answers 2, 9 and 10).
- The names catalog in `@highsea-tv/i18n`, replacing `Intl.DisplayNames` in the clients (answer 3).
- The layout check's exceptions, each with its reason (answer 8).
