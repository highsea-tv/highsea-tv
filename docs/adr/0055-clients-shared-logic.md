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
