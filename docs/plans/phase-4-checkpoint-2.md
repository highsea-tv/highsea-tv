# Phase 4, checkpoint 4.2: the web client

- **Status:** Scoped on 2026-10-27 and approved with [the owner's answers](#the-owners-answers) of 2026-10-27 (every recommendation). 4.2a is next.
- **Parent plan:** [phase-4-clients.md › Order of work](phase-4-clients.md#order-of-work-and-checkpoints), 4.2.
- **Gate:** 4.1 was signed off on 2026-10-27, so the server plays every film in the library.

## Read first

1. The parent plan: Standing rules, [The clients](phase-4-clients.md#the-clients), [Versions](phase-4-clients.md#versions), [Tests and checks](phase-4-clients.md#tests-and-checks), and The owner's answers (2, 3 and 9 above all).
2. The ADRs it builds and accepts: [0053](../adr/0053-clients-build-and-distribution.md) (the clients' build; its web part becomes Accepted here), with [0051](../adr/0051-playback-engine.md) and [0052](../adr/0052-device-profiles.md) for what the player asks of the server.
3. The ADRs it builds on:
   - [0003](../adr/0003-server-runtime-custom-entry.md): the one HTTP server and what it hands where;
   - [0006](../adr/0006-public-api-openapi-sdk.md) and [0018](../adr/0018-admin-reads-through-the-public-api.md): the SDK, and screens that read through the public API;
   - [0008](../adr/0008-clients-react-everywhere.md): React everywhere, and logic that isn't drawing shared;
   - [0021](../adr/0021-i18n.md): strings in catalogs;
   - [0023](../adr/0023-accounts-sessions-devices.md) and [0032](../adr/0032-admin-access.md): sessions, devices, and the admin that Users can't open;
   - [0027](../adr/0027-preferences-in-layers.md) and [0028](../adr/0028-themes-widgets-and-layouts.md): theme, sound and the home layout;
   - [0054](../adr/0054-watch-state.md): positions, picks and watched.
4. The specs, each with its prototype: [connectivity](../product/connectivity.md) (C1), [client-home](../product/client-home.md) (C2), [client-library](../product/client-library.md) (C3), [client-detail](../product/client-detail.md) (C4), [player](../product/player.md) (C5, with the stream's states from 4.0b), [client-search](../product/client-search.md) (C6) and [client-settings](../product/client-settings.md) (C7).
5. The prototype: `bun run prototypes`, then walk `#/web` end to end. The screens are `design/prototypes/src/web/`, and what web, mobile and TV share is `design/prototypes/src/client/`.
6. The platform guide [desktop-web](../design-language/platforms/desktop-web.md).

## Goal

A household member opens `/web` on the server in a browser, signs in, and watches. Home, the library, collections, an item's page, search and their settings are the prototype's, with real data. The player plays every film the server has, as it is or as HLS, with subtitles and their timing, a scrubber with previews, Next up at the end, and the stream's states when something goes wrong. Their place follows them to the next device. Users who reach the admin are sent to `/web`, which is now where they watch.

## Out of scope

- **The desktop app** (4.4): Tauri around this build. With it come what only an app can do: finding servers on the network, more than one server, Downloads and Offline, and the OS's own media keys and notifications. On `/web` the server is the one the page came from (answer 3).
- **Now playing, Stop with a message, and Settings › Playback** (4.3). The player's Stopped state is built here and shown when 4.3 sends it.
- **Burned-in image subtitles, tone mapping and better downmixing** (4.3). Until then the panel lists image subtitles as not available yet, with the reason the server gives.
- **Recommendations from watch history.** No client prototype has a row for them, so they need one first. They're left for after 1.0 unless the owner moves them.
- **`app.highsea.tv`'s hosted client:** with the cloud, after Phase 4.
- **The mobile and TV apps:** 4.5 and 4.6. They share this checkpoint's logic package ([Shared logic](#shared-logic-42a)).

## Where things stand

- **The client API is built** (checkpoints 4 and 8, and 4.1): `home.sections` and `home.layout`, `library.list`, `.item`, `.search`, `.collections` and `.collection`, `announcements.active` and `.seen`, `appearance.get`, `preferences.get` and `.save`, `me.devices` and `devices.revoke`, and 4.1's `playback.*` (play, progress, stop, the device's report, picks, played, Next up, trickplay). Every one is a User route ([access.test.ts](../../apps/server/test/access.test.ts)).
- **The SDK** (`packages/sdk`) has the typed client, `ServerConnection` with discovery, SSE events, and `@highsea-tv/sdk/react`'s `useQuery` and `useAction`. Without a token it uses the session cookie, as the admin does.
- **The session cookie** (`apps/server/src/session-cookie.ts`): `__Host-highsea_session` over HTTPS and `highsea_session` over HTTP, HttpOnly and SameSite=Lax, set by `auth.signIn` (`apps/server/src/api/accounts.ts`).
- **The admin's sign-in** (`apps/server/src/admin/login.tsx`): password, two-step, passkeys and the server's OIDC provider. A User who signs in sees `Refusal` at every admin address (`apps/server/src/admin/refusal.tsx`), which says Phase 4 will link to the web client.
- **`apps/server/src/http.ts`** hands `/api`, `/feed/` and `/metrics` to Hono, `/stream/` to playback, and the rest to Next. Nothing answers `/web` yet.
- **The prototype** (`design/prototypes`) is Vite 8.3.4, React 19.3.1, Tailwind 4.3.3 and wouter 3.13.0 over `@highsea-tv/ui-web`, with hash routes (`#/web/…`) and a mock client shaped like the SDK. About 4,200 lines: the web screens in `src/web/` (shell, home, library, collections, collection, detail, player, search, settings) and the shared parts in `src/client/` (data hooks and formatting, connect, the player's state, the stream's states, prefs, settings sections, More, downloads).
- **4.1's test page** (`/stream/try`) shows the whole play path working in a browser with hls.js 1.7.3. It stays as a debugging page behind `HIGHSEA_PLAYBACK_TRY=1`.

## The size of this checkpoint, and its parts

The screens are a port, as the admin's were, but the player is new work: the prototype's player is a still frame on a timer. Split into two gated parts (answer 1):

- **4.2a, the app:** `apps/web` built and served at `/web`; signing in; the shared logic package; the shell, Home, Library, Collections, the item's page, Search, Settings and Profile, ported from the prototype with real data; Users sent from the admin to `/web`; the sweeps on `/web`. At its review the owner browses their library on `/web`, and Play opens 4.1's player route, which 4.2b fills.
- **4.2b, the player:** the C5 player on `<video>` with hls.js, its states, subtitles and their timing, trickplay, Next up, picture in picture, saving the position and the picks, the device's reported profile; the Playwright playback run; ADR 0053's dated section; the guides' first pages for watching; and `0.2.0-beta.1`'s release commit (`scripts/release.ts prepare`), published only on the owner's word after the sign-off (answer 8). At its review the owner watches films from their library on `/web` in more than one browser and resumes on another.

## Progress

- **2026-10-27, 4.2a, signed off by the owner on 2026-10-27** ("commit and push, then continue with the client work"). At review the owner tried `/web` on the dev server and had three things fixed: moving between pages, the header's border and, in the prototype too, the centred columns (below). Watch on highsea went in as built; the owner didn't name it at sign-off. The sweeps were made faster at the same review (the next entry). `/web` serves the web client from the server it talks to; users sign in there or on the admin's sign-in page and land on Home; every C1 to C8 screen is ported with real data, and Play opens the player's route, which 4.2b fills. What was built:
  - **`apps/web`** (Vite and React, `base: '/web/'`), 14 modules in `src/`: the gate and the router (`app.tsx`), the shell with the server menu, the profile menu, banners, the acknowledge-required announcement and the unreachable state (`shell.tsx`), sign-in (`sign-in.tsx`: password, two-step with a recovery code, and OIDC; no passkeys), Home, Library and Collections, the item's page, Search, Settings (theme, sounds, home rows, servers, devices, about), Profile and Downloads, and the player's placeholder. Words are in `messages.ts` (ADR 0021). `bun run web` runs Vite's dev server against `bun run server`.
  - **`/web` on the server** (`apps/server/src/web/`, ADR 0003's dated section): the build's files under the folder only, routes fall back to `index.html` (`no-cache`, ETag), hashed assets cached for a year (`immutable`), gzip, a Content Security Policy that allows only this origin and hls.js's `blob:` media and worker, 405 outside GET and HEAD, and a 503 that says how to build when the folder's missing. `apps/server/test/web.test.ts` covers each.
  - **`@highsea-tv/client`** (ADR 0055): `format` (running times, time left, captions), `prefs` (the device's layer and placements) and `data` (the hooks every app shares: the server, the library's paging, search, the home layout, announcements, watch state). The prototype's `client/data.ts` now formats through it.
  - **Users go to `/web`** (ADR 0032's dated section): the admin's sign-in sends a User on, and an admin address sends them there instead of the refusal page, which is gone from the prototype and the server.
  - **Watch on highsea**, prototyped first, for the owner's approval: an item beside Your account in the admin's sidebar, and in the command palette, in the prototype (`design/prototypes/src/admin/shell.tsx`) and the server.
  - **Connected remotely:** `GET /auth/session` now says `away` (`CurrentSession`), from the same test as the stream's remote ceiling (`playback.away`), and the server menu shows the pill when it's true.
  - **The image** builds the web app and `scripts/image.ts` copies `apps/web/dist`: 2,093 MB against the 2,200 MB budget (2,091 before). The end-to-end run through the image passed.
  - **The sweeps** cover `/web` signed out and as Theo (`scripts/sweeps/server.ts`), and `compare.ts` puts each web screen beside the prototype's.
  - **Tests:** the web app's screens against a fake API (`apps/web/test/screens.test.tsx`, 7), the shared package (13), `/web`'s handler (9), the session's `away` and the prototype's redirect for users.
  - **ADRs:** 0055 (the clients' shared logic), and dated sections in 0003, 0032 and 0053.
  - **Checks under Node 26.11.1:** lint (1,311 files), typecheck, 11,608 tests pass (6 skipped) across 199 files, smoke, licences (864 packages), audit (718 packages, no exceptions), the docs build, and every sweep clean: the server's pages including `/web`, 1,624 prototype pages, the keyboard walk (171 pages) and the D-pad walk.
  - **Found along the way:** the sweep's axe goes in as an inline script, which `/web`'s policy refuses as it should, so the server sweep's contexts now use Playwright's `bypassCSP`. Open menus on `/web` aren't swept, for the reason the admin's aren't: an open Radix menu hides the page behind it with `aria-hidden`, which axe reads as hidden focusable content. Beside the prototype (`compare.ts`), Home on the seeded server drew its rows in a narrow centred column: `mx-auto` on a grid item makes its auto margins take the free space, so the item shrinks to its content (CSS Grid § 10.2). The prototype's rows hold enough films to fill the width, so it never showed there. The web app's centred containers now say `w-full`. The prototype had the same classes; on the owner's word of 2026-10-27 its web screens now say `w-full` too. At the owner's first try, every move between pages threw "destroy is not a function": the scroll-to-top effect was written `() => window.scrollTo(0, 0)`, so it returned what `scrollTo` returns, here a Promise, and React calls whatever an effect returns as its cleanup (react.dev, `useEffect`: "your setup function may also optionally return a cleanup function"). The sweeps load each page directly, so none of them moved between pages. The effect now has braces and returns nothing; a click-through from Home and Library to a film, as an admin and as a user, is clean. Also at that try, the web header's bottom border flashed white as it turned sticky: over the hero it had no border, so its colour was Tailwind v4's default `currentColor`, and `transition-tint` faded it from there. The border is now in both states, transparent over the hero, in `apps/web` and, on the owner's word of 2026-10-27, the prototype's web shell. The admin has no border that switches on with a transition.
  - **Judgement calls:** OIDC returns to `/web/` without a deep link; a server that requires two-step sends a user without it to the admin's sign-in page to set it up; Search's suggestions are fixed words, not trending titles; version labels show as quality tags; About shows the server's version for both rows; the device layer is the admin's (client type `admin`) until the web client has its own; Downloads explains the desktop app with no button; Profile's account actions point to the sign-in page; the home row kind `discover` is skipped (nothing serves it yet); the plan's "account menu" became a sidebar item and a palette entry, as the admin has no account menu; the bundle is 1.38 MB (402 kB gzipped), mostly zod and the contract's schemas, as the admin has them.
  - **Left for 4.2b:** the player, the end-to-end step that signs in on `/web` and plays, the Playwright playback run, picture in picture (prototyped first), the guides for watching and `0.2.0-beta.1`.

- **2026-10-27, the sweeps, at 4.2a's review.** The owner found 40 minutes of prototype sweeps too long, even for a report. They now serve a production build of the prototypes they make themselves (`servePrototypes`, `vite preview` on :4510), wait for a page to stop changing instead of a fixed 1.5 s (`settle`), and open as many pages at once as the machine has cores less two (`WORKERS`); the D-pad walk runs its routes in parallel. On a 12-core Mac: pages 4 min 21 s (was about 35), keyboard 59 s, D-pad 11 s, all clean; the server sweep, unchanged, 8 min 21 s with its build. `keyboard.ts` takes a platform like `pages.ts`, and `/checks` has a scoped mode that sweeps only what a fix touched.
- **2026-10-27, 4.2b, Picture in picture approved.** The prototype's C5 has a **Picture in picture** button beside Full screen, with Lucide's `picture-in-picture-2` added to ui-web's icon set as `picture-in-picture`, left out where `document.pictureInPictureEnabled` isn't true. While the film is in its window the frame says so, with **Back to this tab**. At 390 the new button pushed Full screen off the edge, so Mute shows from the medium breakpoint up. The owner approved it as shown on 2026-10-27; player.md says so.
- **2026-10-28, 4.2b, signed off by the owner on 2026-10-28**, which signs off checkpoint 4.2. ADR 0053's web part is Accepted. `0.2.0-beta.1` is prepared and waits for the owner's separate word to publish. The C5 player plays films on `/web` as the prototype has it, on the browser's own `<video>`. What was built:
  - **`@highsea-tv/client/player`** (ADR 0055): the player's state as a pure reducer that the video's events drive, with the clock passed in: the stream's states (Getting it ready, Buffering after 1 s, Didn't start, Stopped, Next up), when the chrome shows (3 s), when to report (every 10 s), seeking, the cues showing at a time with the person's offset, the nudge's words, the trickplay tile under the pointer, and the device's report from `MediaSource.isTypeSupported()` (ported from `/stream/try`). 25 tests, without a DOM.
  - **The player** (`apps/web/src/player.tsx`, `playback.ts`): direct play sets the session's URL as the source; HLS goes through hls.js 1.7.3 where MSE is available, imported only when needed (a 575 kB chunk, 177 kB gzipped), and to Safari's native HLS otherwise. The device reports what it decodes once per browser version, HDR through `MediaCapabilities.decodingInfo()`. Changing the version or the sound starts a new session at the same place; subtitles are the session's WebVTT in a hidden `<track>`, drawn by the player with the offset, so changing the timing never reloads. The Audio and subtitles panel, Subtitle timing with its preview, the scrubber's previews from the trickplay sheets, the stream's states with Try again focused, Next up counting down 10 s, picture in picture, full screen, Space, ←, →, M, F and Esc, and the Media Session's title, artwork and actions.
  - **Keeping the place:** reports every 10 s while playing, and on pause, seek and leaving. Leaving sends a last report, paused, which the server saves at once, then ends the session, both with `keepalive`, so closing the tab keeps the place too. Tried by hand: Back kept 5:03, closing the tab 7:02, and Resume started there.
  - **The playback run** (`scripts/sweeps/playback.ts`, and the `playback` job in CI): the seeded production build, Big Buck Bunny as an MP4 remux of ADR 0040's clip played directly, and Sintel's MKV as HLS, in Playwright's Chromium and Firefox. Signed in on `/web`, it turns Sintel's English subtitle on and waits for a cue to be drawn, seeks to 8:00 and waits for it to play on, and leaves, checking the last report, the session's end and the place the server kept. About 10 s a browser after the builds and the seed.
  - **The end-to-end run** gained step 8: the owner signs in on `/web` in a new browser and plays Sintel through the image, then Back ends the session. It passed (3.1 s), with the image at 2,093 MB against the 2,200 MB budget.
  - **The guides:** [Watching in a browser](../../apps/docs/content/watch/index.mdx) (opening `/web`, signing in, Watch on highsea, Home, the library, a film's page) and [Playing a film](../../apps/docs/content/watch/playing.mdx) (the player, audio and subtitles, subtitle timing, the keys, keeping the place, Next up, when something goes wrong), with four screenshots from the seeded server; the guides' home page points to them. `scripts/docs-shots/run.ts` takes `/web` pages, and `DOCS_SHOTS_PRODUCTION=1` runs it beside `bun run server`.
  - **`0.2.0-beta.1` prepared, not published:** the changelog's notes for everything since 0.1.0 (the web app and its player, watch state, the scan, Node 26 and Next.js 16.4, the overflow fixes), the server's version, the catalog's version and seed, and `openapi.json`. `bun scripts/release.ts check 0.2.0-beta.1` says it's ready. Nothing is tagged or published.
  - **Tests:** the player's screen against the fake API (`apps/web/test/screens.test.tsx`, 6 more: starting with the browser's profile, Play from the start, the panel saving a pick, Didn't start with Try again focused, leaving reporting before it ends, a title that isn't there).
  - **ADRs:** 0053's 2026-10-28 section (the web player); its web part becomes Accepted at this sign-off.
  - **Checks under Node 26.11.1:** lint (1,317 files), typecheck, 11,656 tests pass (6 skipped) across 200 files, smoke, licences (864 packages), audit (719 packages, no exceptions), the docs build (92 pages), actionlint, the end-to-end run through the image, and every sweep clean: 1,624 prototype pages, the keyboard walk (171 pages), the D-pad walk, the server's pages including `/web`, and playback in Chromium and Firefox.
  - **Found along the way:** the keyboard sweep's occasional hidden stop on `/web/settings` was the announcement dialog still mounted in Radix's exit animation; `acknowledge` now waits for the dialog to go (`scripts/sweeps/lib.ts`). `release.ts prepare` changed the server's version without regenerating `openapi.json`, whose `info.version` follows it, so a release commit would have failed CI's freshness test; it regenerates it now. In the player: React 19 runs a callback ref's cleanup before passive effects' cleanups, so clearing the video's ref there made leaving save 0, and a separate progress call raced the session's end; the ref is kept and leaving goes through the session. hls.js added the playlist's subtitles as text tracks of its own, so its subtitle rendering is off and the player reads only its own `<track>`. A saved pick of a version still waiting for its file played nothing; such a pick now falls back to the first playable version, as the server's own choice does, and the panel doesn't offer it.
  - **Judgement calls:** Next up counts down the film's last 10 seconds rather than a separate 10 s after it ends, so the next film starts when this one does; a subtitle that is a picture gets a line of new copy in the panel ("This subtitle is a picture, which a browser can’t show yet."); versions without a file are left out of the panel; the Stopped state is built and tested but waits for 4.3's Stop over SSE; the playback run opens the player by its address, so it allows autoplay with each browser's documented switch rather than pressing Play; the guide says the web app plays in current Chrome, Edge, Firefox and Safari, though only Chromium and Firefox are run automatically and Safari waits for this review (answer 7).
  - **Left open:** Safari, picture in picture and Next up with a real collection haven't been tried by hand (the seed has no next film); the prototype keeps its own copies of the player's constants and words rather than importing `@highsea-tv/client/player`.

## The app at `/web` (4.2a)

Following ADR 0053:

- **`apps/web`:** Vite and React ([answer 3](phase-4-clients.md#the-owners-answers)), with `base: '/web/'` ([Vite › base](https://vite.dev/config/shared-options.html#base)), Tailwind and `@highsea-tv/ui-web` as the prototype has them. Routes move from the prototype's hash to real paths under `/web` with wouter's `base` ([wouter › Router](https://github.com/molefrog/wouter#router-hook-searchhook-base-)), so each screen has an address that can be shared and reloaded.
- **Built into the image:** `vite build` writes static files, which the Dockerfile's build stage copies next to the server's build. Hashed assets are served with `Cache-Control: public, max-age=31536000, immutable`, and `index.html` with `no-cache`, as [Vite's guide to deploying a static site](https://vite.dev/guide/static-deploy.html) and MDN's [Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) recommend.
- **Served:** `http.ts` hands `/web` and `/web/…` to a static handler in `apps/server/src/web/`. A path that isn't a file gets `index.html`, so the client's own routes load. It sends a Content-Security-Policy as `/stream/try` does, with `media-src 'self' blob: data:` and `worker-src 'self' blob:` for hls.js, and `X-Content-Type-Options: nosniff`. ADR 0003 gets a dated section.
- **In development:** `bun run web` runs Vite's dev server, which proxies `/api` and `/stream` to `bun run server` ([Vite › server.proxy](https://vite.dev/config/server-options.html#server-proxy)), so the cookie and the API stay on one origin. The production path is tried by `bun run server` after `bun run --filter @highsea-tv/web build`.
- **Strings** move from the prototype's JSX into `@highsea-tv/i18n` catalogs (ADR 0021), as the admin's did.
- **Users and the admin:** a User who signs in on the admin's sign-in page goes to `/web`, and `Refusal` links there ("Watch on highsea"). Owners and admins reach it from a **Watch on highsea** item in the admin's account menu, prototyped and approved first (answer 5).

## Signing in (4.2a)

- **One session for the server.** `/web` uses the same session cookie as the admin, so signing in to either signs in to both, and Sign out signs out of both. No token is kept in the page's storage, where a script could read it ([OWASP's HTML5 Security Cheat Sheet › Local Storage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage)).
- **The screen** is C1's "Sign in to {server}" step for this server: username, password, two-step, and the OIDC provider when the server has one, coming back to `/web` after the provider. Passkeys stay on the admin's sign-in page, since C1 has no design for them (answer 2).
- **The server it's served from** is the one it uses. C1's choosing, discovery and adding by address are left to the desktop app (answer 3). The top bar's server menu shows this server and Sign out.
- **Can't reach the server:** when the API or the event stream stops answering, the page is replaced by the prototype's "Can't reach {server}" with **Try again** (without Switch server, which needs another server).
- **Connected remotely:** the pill beside the server's name shows when the server says the request is from away (4.1a's home-or-away test), so it matches what the player is sent.

## Shared logic (4.2a)

The parent plan settles at 4.2 which logic the web and native apps share. The rule: what isn't drawing goes in a package both can import, as the prototype's `src/client/` already does.

- **`packages/client`** (new; `@highsea-tv/client`, answer 4), React without the DOM, so React Native can import it:
  - `data`: the hooks over `@highsea-tv/sdk/react` (home, library, item, search with its settling, collections, announcements, the server, devices, the home layout) and their event topics;
  - `format`: clock times, runtimes, "52 min left", meta lines, quality tags, collection captions;
  - `player`: the player's state (the stream's states, the chrome's timer, Next up's countdown, the subtitle offset, when to report the position), as a reducer that any platform's video element drives;
  - `prefs`: applying the device's and the person's theme and sound (ADR 0027, and "Use on all my devices").
- **Each app draws its own screens**, as the prototype's web, mobile and TV do. `apps/web` holds the web's.
- **The prototype** switches its `src/client/` imports to the package where the code is the same, so the two can't drift. Its mock stays its own.
- A new ADR records it ([ADRs](#adrs)).

## The screens (4.2a)

Ported from `design/prototypes/src/web/` by swapping the mock for the SDK, as `/port-screen` does for the admin. Each matches its prototype, and any change real data forces is listed in the report.

- **The shell:** the top bar (server, Home, Library, Search, the avatar's menu), announcements as banners, cards, a toast and a required modal (client-home.md), and the device's theme and sound.
- **Home (C2):** the hero, Continue watching right after it, and the owner's rows, in the person's order.
- **Library (C3):** the grid with genre, Unwatched and sort; **Collections** and a **collection**.
- **The item's page (C4):** the versions, audio and subtitles panel, Play, Resume and Play from the start, More with Mark as watched and unwatched, and the related titles.
- **Search (C6):** typed sections that settle as you type, and Back returning to the query and its results.
- **Settings and Profile (C7):** Theme with "Use on all my devices", Sounds, Home screen, Your devices, About, and the profile's account and Sign out. Servers shows this server only (answer 3); Downloads waits for the desktop app.
- **Not on this server:** an item or collection that isn't there gets the prototype's empty state with **Go home**.

## The player (4.2b)

The C5 player, from `design/prototypes/src/web/player.tsx` and player.md, on a real `<video>`:

- **Playing:** `playback.play` with the device's profile and the person's picks returns the decision and a URL. Direct play sets it as the video's source. HLS goes through [hls.js](https://github.com/video-dev/hls.js/blob/master/docs/API.md) where [Media Source Extensions](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API) are available. A browser that plays HLS itself, Safari's, plays the URL natively (`canPlayType('application/vnd.apple.mpegurl')`). hls.js becomes a dependency of `apps/web` (Apache-2.0, 1.7.3, already pinned for the test page).
- **The device's profile:** on first play each browser reports what it decodes, through `MediaSource.isTypeSupported()` and `MediaCapabilities.decodingInfo()` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo)), to `PUT /api/v1/devices/current/profile` (ADR 0052). It reports again when its browser's version changes.
- **Changing version or audio** starts a new session at the same position (answer 7 in 4.1).
- **Subtitles** load from the session's WebVTT URL into a `<track>` in `hidden` mode. The player draws the active cues itself in the lower third, rising above the chrome while it shows (player.md), with the person's offset added to the cues' times ([MDN › TextTrack](https://developer.mozilla.org/en-US/docs/Web/API/TextTrack), [TextTrackCue](https://developer.mozilla.org/en-US/docs/Web/API/TextTrackCue)). So changing the timing never reloads the stream. The live preview line shows the nudge, as prototyped.
- **The scrubber's previews** come from 4.1's trickplay manifest and sheets, cropped to the tile under the pointer. Without them (not made yet), the scrubber shows only the time, as on TV before seeking.
- **The stream's states** (4.0b): Getting it ready while a transcode makes its first segments, Buffering after a 1 s wait (`waiting` and `playing` events), Didn't start (hls.js's fatal errors, or a 500 from `/stream`) with Try again and Back, Stopped (built now and shown when 4.3's Stop arrives over SSE), and Next up in the last seconds from `playback.next`, counting down 10 s.
- **Saving:** the position is reported to the session every 10 s while playing, and on pause, seek and leaving. Leaving uses `fetch` with `keepalive` so the last report survives the page closing ([MDN › keepalive](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#keepalive)). Picks and the offset are saved as they change. Leaving the player stops the session, which stops its ffmpeg.
- **Keys:** Space, ← and → 10 s, F, M and Esc, as player.md's table, and the [Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) for the keyboard's and headphones' media keys and the browser's own controls, with the title and artwork.
- **Picture in picture** ([answer 9](phase-4-clients.md#the-owners-answers)): a **Picture in picture** button in the transport, beside Full screen, through the browser's [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API), hidden where the browser hasn't got it. It changes C5's layout, so it's prototyped and approved first, at the start of 4.2b (answer 6).
- **Full screen** through the [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) on the player's frame, so the chrome and subtitles stay drawn.

## Tests and checks (4.2a and 4.2b)

- **`packages/client`:** the formatting, the hooks against a fake client, and the player's reducer over every state and input (Bun's runner, no DOM for the reducer).
- **`apps/web`:** component tests with Testing Library and happy-dom, as the admin's are: each screen with seeded data, its empty and error states.
- **The server:** `/web`'s static handler (the fallback to `index.html`, the cache headers, no path outside the build, the CSP), and a User sent from the admin to `/web`.
- **The sweeps** on `/web` from the production build, booted and seeded by `scripts/sweeps/seeded.ts` with a User and films: axe in three themes, overflow from 1440 to 390, 200% text, reduced motion, and the keyboard walk. `scripts/sweeps/compare.ts` puts each `/web` screen beside its prototype for the review.
- **Playback in browsers (4.2b):** a Playwright run starts a seeded server with ADR 0040's clips, plays one directly and one as HLS, seeks far ahead, turns subtitles on, and checks the position is saved and the session ends on leaving. It runs in Chromium and Firefox, in CI; Safari is tried by hand at each review (answer 7).
- **The end-to-end run** through the container adds a step that signs in on `/web` and plays Sintel in the browser.
- The full checks under Node 26.11, as at every checkpoint.

## The guides (4.2b)

The first pages for the apps, in `apps/docs/content/`, with screenshots from the seeded server:

- **Watching in a browser:** opening `/web`, signing in, Home and the library, playing, audio and subtitles, subtitle timing, the keys, and resuming on another device.
- The admin's guides where 4.2 changes what owners see: Users sent to `/web`, and the account menu's Watch on highsea (answer 5).

## ADRs

- **[0053](../adr/0053-clients-build-and-distribution.md):** a dated section for the web part as built (the static handler, caching, CSP, the development proxy), and its web part Accepted at 4.2b's sign-off. Desktop and the native apps stay Proposed until 4.4 and 4.5.
- **0055, the clients' shared logic:** `@highsea-tv/client`, what it holds and what it doesn't (drawing, platform input), and how the prototype shares it. New, since the parent plan left this for 4.2.
- **[0003](../adr/0003-server-runtime-custom-entry.md):** a dated section, `/web` served from the build.
- **[0032](../adr/0032-admin-access.md):** a dated section, Users sent to `/web`.

## Risks

- **Browsers' codecs and HLS support differ.** The profiles from 4.1 and each browser's report decide, so a wrong guess shows as a transcode, not a failure. Safari plays HLS natively, so its path differs from Chromium's and Firefox's. Both are tried at the review.
- **WebKit in Playwright** may not play H.264 or AAC: Playwright's WebKit builds leave out codecs that Safari has. So Safari is tried by hand (answer 7).
- **Drawing subtitles ourselves** means the browser's own subtitle settings (size, background) aren't applied. The design draws them as player.md sets out. The guide says so.
- **One cookie for the admin and `/web`** means signing out of one signs out of the other. That matches "one session for the server", but it changes what the admin's Sign out does for someone using both.
- **The image grows** by the web build (a few MB) against its 2,200 MB budget, now at 2,091 MB.
- **Port drift.** The prototype and `apps/web` both draw the web screens. The shared package removes the logic's copy; the drawing is compared screen by screen at the review, as the admin's was.

## Open questions for the owner

1. **The parts.**
   - **Recommended:** two gated parts, 4.2a (the app and its screens) and 4.2b (the player), each reviewed with your library.
   - Or: one checkpoint, reviewed once. Fewer stops, but the screens wait for the player before you see them.
2. **Signing in on `/web`.**
   - **Recommended:** C1's sign-in step, as prototyped: username and password, two-step, and the OIDC provider when there is one. One cookie for the admin and `/web`, so signing in to either signs in to both. Passkeys stay on the admin's sign-in page, since C1 has no design for them; adding them is a small prototype change for later.
   - Or: C1's step with a **Sign in with a passkey** button, prototyped and approved first in 4.2a.
   - Or: no sign-in screen on `/web`; it sends people to the admin's sign-in page and back. One screen to keep, with passkeys, but it isn't the client's design.
3. **Choosing a server on `/web`.**
   - **Recommended:** `/web` uses the server it came from. C1's Choose a server, discovery on the network and Add by address need an app (a browser can't look for servers on the network, and calling another server's API from this page needs cross-origin access), so they come with the desktop app in 4.4. The top bar's server menu shows this server and Sign out.
   - Or: Add by address on `/web` too, with the server allowing other origins (CORS) and a token kept by the page. More of C1 on the web, but tokens in page storage, and every server opened to other origins.
4. **Where the shared logic lives.**
   - **Recommended:** a new package, `@highsea-tv/client` (React, no DOM), with the data hooks, formatting and the player's state, used by `apps/web` now, the native apps later, and the prototype, so none of them drift.
   - Or: keep it in `apps/web` and move it out at 4.5, when the TV app needs it. Less now, but a move later, and the prototype keeps its own copy until then.
5. **How the owner and admins reach `/web`.**
   - **Recommended:** a **Watch on highsea** item in the admin's account menu, which opens `/web`. It changes a locked layout, so it's prototyped and approved first, in 4.2a. Users are sent to `/web` without being asked.
   - Or: no link. The owner and admins type `/web`, and only Users are sent there.
   - Or: everyone lands on `/web` after signing in, and the admin is reached from the web client's avatar menu. It changes both apps' locked layouts.
6. **Picture in picture on the web** (answer 9 said yes).
   - **Recommended:** a **Picture in picture** button in the player's transport, beside Full screen, using the browser's [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API), and hidden where the browser hasn't got it (Firefox has its own toggle instead). It's a change to C5's layout, so it's prototyped and approved first, in 4.2b.
   - Or: leave it to each browser's own picture-in-picture control, with nothing in the player. No layout change, but Chromium and Safari only offer it from a menu.
7. **Browsers for the automated playback run.**
   - **Recommended:** Chromium and Firefox in Playwright, in CI. Safari is tried by hand at each review on your Mac, since Playwright's WebKit lacks some of Safari's codecs and its native HLS.
   - Or: Chromium, Firefox and WebKit, accepting that WebKit may only cover direct play of what it decodes.
8. **The beta for your NAS** (answer 10 in 4.1: `0.2.0-beta.1` after 4.2's sign-off).
   - **Recommended:** prepare the beta's release commit at the end of 4.2b with `scripts/release.ts`, and publish it only on your word after the sign-off. Then the encoder's real-time measurement on the NAS (left open in 4.1) is done with it.
   - Or: publish nothing until 4.3, so the NAS gets hardware acceleration in its first beta.

## The owner's answers

On 2026-10-27 the owner took every recommendation for questions 1 to 8:

1. Two gated parts: 4.2a (the app and its screens) and 4.2b (the player).
2. C1's sign-in step (username and password, two-step, OIDC), with one cookie for the admin and `/web`. Passkeys stay on the admin's sign-in page.
3. `/web` uses the server it came from. Choosing, discovery and adding servers come with the desktop app in 4.4.
4. A new package, `@highsea-tv/client`, shared by `apps/web`, the native apps and the prototype, with ADR 0055.
5. A **Watch on highsea** item in the admin's account menu, prototyped and approved first in 4.2a. Users are sent to `/web`.
6. A **Picture in picture** button in the player's transport, prototyped and approved first in 4.2b.
7. The automated playback run in Chromium and Firefox, in CI. Safari by hand at each review.
8. `0.2.0-beta.1`'s release commit prepared at the end of 4.2b, published only on the owner's word after the sign-off, then the NAS measurement.
