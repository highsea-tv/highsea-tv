# 0055. The clients' shared logic: `@highsea-tv/client`, everything but the drawing

- **Status:** Accepted
- **Date:** 2026-10-27

Written at Phase 4's checkpoint 4.2a ([phase-4-checkpoint-2.md › Shared logic](../plans/phase-4-checkpoint-2.md#shared-logic-42a)), on the owner's answer 4 of 2026-10-27.

## Context

Phase 4 builds four apps on one API: the web client now, then desktop (Tauri around the web build), mobile and TV (Expo and React Native) ([ADR 0053](0053-clients-build-and-distribution.md)). Each draws its own screens: the prototypes' web, mobile and TV differ in layout, input and units. What they read, how they format it and how they apply a person's theme and sound are the same everywhere, and the prototype already keeps them apart in `design/prototypes/src/client/`.

Kept in `apps/web`, that logic would be copied when the native apps arrive and drift from then on. React Native can't import anything that touches the DOM, so the shared code has to be React without `react-dom`.

The parent plan left where it lives to 4.2. The alternatives were keeping it in `apps/web` until 4.5 needs it (less now, a move later) and putting it in `@highsea-tv/sdk` (which every app has, but which is the API's typed client, also used by scripts and servers that never draw anything).

## Decision

A workspace package, `@highsea-tv/client` (`packages/client`), with one subpath per kind, as [ADR 0036](0036-domain-packages-with-subpath-exports.md) has the domain packages:

- **`data`:** the hooks over `@highsea-tv/sdk/react` that every app reads through: the session, the server and its public info, home, the library a page at a time, a title and its playback picks, Mark as watched, search settling as it's typed, collections, announcements by placement, the home layout with its order kept while it saves, the person's devices and the server's appearance. Each names the event topics it refreshes on. The session has no topics, so a page nobody's signed in to doesn't keep the event stream retrying.
- **`format`:** clock times, running times, "52 min left", a title's meta line and a collection's caption, in an i18n catalog ([ADR 0021](0021-i18n-message-catalogs.md)) and pure.
- **`prefs`:** ADR 0027's layers read into what a device uses (its theme, sound and volume, and Use on all my devices), with the hook that writes them to the right layer.
- **`player`** (4.2b): the player's state, as a reducer that any platform's video element drives.

What stays out: drawing of any kind (components, CSS, the design system), and platform input (the DOM's events, the D-pad, gestures). It depends on `react` as a peer, and on `@highsea-tv/api-contract`, `@highsea-tv/i18n` and `@highsea-tv/sdk`, never on `react-dom` or `@highsea-tv/ui-web`. It exports raw TypeScript, as every package does.

`apps/web` imports it for everything it reads. The prototype imports `format` from it, so the words under titles can't drift between the reference and the apps; its hooks stay its own, since they run on the prototype's mock, whose shapes differ.

## Consequences

- Mobile and TV start at 4.5 with the reads, formatting and preferences already written and tested (`packages/client/test`, against a fake of the API).
- A change to how a title's time left reads is made once, and shows in the prototype as in every app.
- The package has to stay free of the DOM. Its tests run without `react-dom` for `format` and `prefs`; the hooks' tests use happy-dom only because Testing Library renders through `react-dom`.
- The prototype keeps its own data hooks over its mock. They match the real ones in name, not in shape, until the mock is brought up to the API's shapes, which nothing schedules yet.

## 2026-10-29: the library, the servers and WebVTT (checkpoint 4.5a)

Three things the web had kept to itself, and the phone needs too, moved into `@highsea-tv/client`:

- `library`: C3's arranging, meaning Unwatched, a genre and a sort;
- `servers`: the pure list of servers a native app knows, as the desktop app's `servers.rs` holds it;
- `player`'s `parseCues`: WebVTT's cues from the session's file, which React Native has no `TextTrack` to read.

The player's `Base` gains `ios` and `tvos`. Each has a Bun test ([ADR 0059](0059-native-apps.md)).

## 2026-11-01: what the prototype shared with itself (apps-catch-up.md › A.1)

The prototype's client folder had grown rules every app needs and no app had: how the player is left and what plays next, Continue watching's menu, the film and person pages' facts, the pairing code's form and Settings' sections. They moved into `@highsea-tv/client`, with tests:

- `player`: the timings (`NUDGE_MS`, `SEEK_S`, `SCRUB_MS`, `HIDE_MS`, `NEXT_UP_S`) and `StreamState`, as the prototype used them; `leavePlayer` and `playNext` over a small history (`canGoBack`, `back`, `replace`), so the browser, Expo Router and the TV's stack each pass their own; `titlePage`, `titleLines`, `filmUpNext` (a collection's next part, else three of More like this as choices, which don't count down: `countsDown`), and `backStep`, the player's Back in order (a panel, then the chrome while playing, then out).
- `library`: `arrange` over any item with the fields it reads, the A–Z rail (`LETTERS`, `letterOf` by the sort title), the sorts' and Show's words, Continue watching's card page, its menu's words and toasts, the long press's length, and `createLibraryText`, the film page's Information and Languages, the people row with a director once, a person's page (what's here, their life) and roles in plain words. Language names come from `Intl.DisplayNames`, the code standing in where Hermes has none.
- `servers`: the pairing code, typed, scanned or opened from a link (`normalCode`, `looksLikeCode`, `showCode`, `codeFrom`).
- `format`: a collection's caption and row counting shows beside films, and the server's name with "this server" until it's known.
- `prefs`: Settings' sections in order with their words and icons, and the person's playback settings (`usePlaybackPrefs`, the choices' words; [ADR 0027's 2026-11-01 section](0027-preferences-in-layers.md)).
- `data`: Continue watching's Mark as watched and Remove ([ADR 0054's 2026-11-01 section](0054-watch-state.md)).

The prototype now imports each of these from the package rather than keeping its own, as it did `format`, so the reference and the apps can't drift. Its screens import them directly, with no re-exports in between. What it keeps is its own wiring: its hooks over the mock, its stand-ins in the browser for the server's preference layers (the device's theme and sound, and the playback settings, in `PlaybackPrefs`' shape), and the browser's history for `leavePlayer` and `playNext`. The types stay kind-aware (an episode's show, a part or an episode next), but only films reach them until the server has shows.

## 2026-11-02: a person's films and announcements' words (apps-catch-up.md › part B)

The TV's person page and Alerts added two rules every app needs, both with tests:

- `library`: `filmographyOf`, a person's films grouped by department. What they're known for comes first, then TMDB's order, then any other department. Each group is newest first, with a role list joined in words, and only what's in the library. `LONG_BIO` is the length at which a biography gets More and Less. `departmentTitle` takes any department TMDB names.
- `format`: `inlineParts`, an announcement's text split into plain, bold and link runs, so each app can draw them with its own text. A TV can't follow a link, so it shows the link's words. The phone's own parser moves to it in part C.

## 2026-11-02: the phone on the shared rules (apps-catch-up.md › part C)

Part C added no rules; the phone took up the ones parts A and B made. Its announcements are drawn from `inlineParts`, its player leaves with `leavePlayer` and `titlePage` and offers Next up through `filmUpNext` and `countsDown` (three of More like this when nothing comes next by itself, and a countdown only with Autoplay on), and its Settings take their sections from `settingsSections` and Playback from `usePlaybackPrefs`, as the TV's do.

## 2026-11-03: the gate's rules, Settings' words, and the mock as a transport (one client platform, part A)

Moving Choose a server, signing in and Settings into `apps/client` ([ADR 0061](0061-one-client-platform.md)) moved what those screens share besides drawing into this package, with tests:

- `gate` (new): the gate every client opens on. It holds the addresses to try for what someone typed (`candidates`), how an address is shown (`hostOf`), whether it's reached remotely, single sign-on's start, its redirect and its reasons, the TV's pairing link, and the words, one catalog per step (`connectMessages`, `signInMessages`, `forgetMessages`, `shellMessages`, `destinationMessages`, `tvConnectMessages`). `apps/mobile` and `apps/tv` take the words from here too until part B removes them.
- `prefs`: Settings' words in every app (`settingsPageMessages`) and the TV's own (`tvSettingsMessages`), a device's icon by its kind of app (`deviceIcon`), and About's link to the source (`SOURCE`).
- `servers`: `Nearby`, a server found on the network with the address it resolved to. `@highsea-tv/native/nearby` re-exports it, and the mock's stand-in for Bonjour gives the same shape.

The consequence this ADR left open, the prototype's hooks over a mock whose shapes differ, ends for the client. The mock is now its own package, `@highsea-tv/mock`, and its transport answers the SDK's own client in the contract's shapes, checked by each route's schemas. So the client in mock mode reads through these same hooks, with only the transport changed. The prototypes' screens that haven't moved keep their own hooks over the mock until part B moves them.
