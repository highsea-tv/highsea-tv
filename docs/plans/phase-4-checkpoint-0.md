# Phase 4, checkpoint 4.0: the start

- **Status:** Scoped on 2026-10-23, and approved the same day with [the owner's answers](#the-owners-answers). With [the owner's change](#the-owners-changes), 4.0a starts now on Node 26.11.1 and Debian trixie, and Next.js 16.4 joins it on 2026-10-28; 4.0b starts alongside.
- **Gate:** stop when each part is built, 4.0a and 4.0b ([answer 1](#the-owners-answers)). Report what was built, the judgement calls, screenshots and the check results, then ask for review. Nothing is published at either gate unless the owner says so.
- **Parent plan:** [phase-4-clients.md](phase-4-clients.md). Its standing rules, architecture and the owner's answers of 2026-10-23 all apply, in particular:
  - answer 9: the additions to the clients' signed-off screens are prototyped and approved before they're built;
  - answer 12: releases 0.2, 0.3 and on carry Phase 4's server work as it's signed off;
  - checkpoint 9's answer 10: Node 26 at the start of Phase 4.

  This document settles what the parent plan's 4.0 item leaves open, and adds one thing it didn't know about: the audit's three Next.js exceptions, which expire on 2026-10-28.

## Read first

1. The parent plan: its Standing rules, Architecture, [New screens that need a prototype first](phase-4-clients.md#new-screens-that-need-a-prototype-first), and The owner's answers.
2. [phase-3-checkpoint-9.md](phase-3-checkpoint-9.md): Docker (9a), Images (9a), Release (9b), and its question 10 (Node 26).
3. The ADRs:
   - [0003](../adr/0003-server-runtime-custom-entry.md): Node 24.21.0 pinned in `.nvmrc`, the image and `engines`; `/stream` and `/ws` reserved;
   - [0019](../adr/0019-database-sqlite-drizzle.md): `better-sqlite3` in production;
   - [0050](../adr/0050-release-and-versioning.md): one version, and how a release is made.
4. The specs and prototypes the new screens extend:
   - [player.md](../product/player.md) and `design/prototypes/src/{web,mobile,tv}/player.tsx` (C5);
   - [client-settings.md](../product/client-settings.md) and `src/mobile/more.tsx`, `src/web/settings.tsx` (C7, C8);
   - [client-home.md](../product/client-home.md), [client-detail.md](../product/client-detail.md), [client-library.md](../product/client-library.md);
   - [settings.md](../product/settings.md), [dashboard.md](../product/dashboard.md), [activity-downloads.md](../product/activity-downloads.md) and `src/admin/settings/`, `src/admin/dashboard/`.
5. The Phase 2 plan's [fidelity levels](phase-2-prototypes.md) and [known pitfalls](phase-2-prototypes.md#known-pitfalls-from-phase-1).

## Goal

highsea runs on the Node and the Next.js it will carry through Phase 4, with the full checks passing on them, and the published image can be rebuilt on them. Every screen Phase 4 builds has an approved prototype and spec, so 4.1 to 4.6 build to something signed off, as Phase 3 did. The three ADRs that 4.1 and 4.2 build on exist as drafts, so the owner sees the playback engine's shape before any of it is written.

## Out of scope

- **Any playback code.** `@highsea-tv/stream`, `/stream`, watch state and trickplay are 4.1. The prototypes simulate playback, as C5 does.
- **`apps/web` and the native apps.** 4.2 onwards.
- **Hardware acceleration's ADR.** It comes with the work, at 4.3, as the parent plan has it. Settings › Playback's prototype shows the four paths (VAAPI, QSV, NVENC, VideoToolbox) without settling how each is detected.
- **The `ui-native` ADR.** 4.5.
- **Publishing.** 0.1.1 follows 4.0a's sign-off ([answer 7](#the-owners-answers)), and is tagged and published only on the owner's word.
- **Leftovers of the first publish:** the Unraid template's submission to Community Applications, and deleting the untagged images the first release run left in GHCR. Both are the owner's, whenever they like.

## Where things stand

A survey of the repository on 2026-10-23.

**Node:**

- Node 24.21.0 everywhere: `.nvmrc`, `engines` in the root `package.json`, the Dockerfile's three `FROM` lines (the `manifests` stage added on 2026-10-23 makes three, not two), CI through `node-version-file: .nvmrc`, and `scripts/check-node.ts`. ADR 0003 records it.
- Node 24 entered maintenance on 2026-10-20. Node 26 becomes Active LTS on **2026-10-28**, its maintenance starts on 2027-10-20, and its end of life is 2029-04-30 ([nodejs/Release](https://github.com/nodejs/Release)).
- The newest Node 26 releases are 26.12.0 (2026-10-14) and 26.12.1 (2026-10-21) ([nodejs.org/dist/index.json](https://nodejs.org/dist/index.json)). By the two-week rule, 26.12.0 can be pinned from 2026-10-28 and 26.12.1 from 2026-11-04.
- What Node 26.0.0 changes that matters here ([its release notes](https://nodejs.org/en/blog/release/v26.0.0)):
  - native addons are rebuilt for `NODE_MODULE_VERSION` 147. `better-sqlite3` 13.0.3 builds on Node-API (`node-addon-api` ^8, `engines` `>=22`), which is ABI-stable across Node versions, so it needs a rebuild, not a new version;
  - Undici 8 behind `fetch`, which every outside service (TMDB, the indexers, the notification channels) goes through;
  - `Temporal` on by default, and `localStorage` undefined without a file. Neither is used by the server;
  - `module.register()` deprecated at runtime and `--experimental-transform-types` removed. highsea uses type stripping only (`erasableSyntaxOnly`), which stays.
- `@types/node` is 25.9.9 in every package. 26.6.5 (2026-10-09) can be pinned now.
- Several skills and CLAUDE.md say "Node 24.21" by number (`checks`, `checkpoint-report`, `guide`, `handoff`, `signoff`, `add-dependency`). They change with it.

**Next.js:**

- `apps/server` and `apps/docs` are on Next 16.3.8. `scripts/audit-exceptions.json` excepts three advisories against 16.0.0 to 16.4.0 until **2026-10-28**: denial of service through Server Actions, and two remote code executions (the image optimizer with SVGs, and `use cache`). Each is fixed in 16.4.1 (2026-10-14), which can be pinned from 2026-10-28. On that day CI's dependency check fails until they're gone.
- 16.4.2 (2026-10-15) and 16.4.3 (2026-10-23) followed. On 2026-10-28 the newest pinnable is 16.4.1; 16.4.2 from 2026-10-29.
- [Next.js 16.4's announcement](https://nextjs.org/blog/next-16-4) lists no breaking changes. It brings React 19.3, and its new features are opt-in (Cache Components, `ensureStatic`, `agentUpgrade` reminders on by default for security releases). highsea's custom server, `next typegen` and the docs site's static export need checking against it, and Fumadocs 16.16.2 against React 19.3.

**The image's Debian:**

- The image is built on `node:24.21.0-bookworm-slim`, Debian 12. Bookworm's regular security support ended on **2026-06-10**, and it has been in Debian LTS since 2026-06-11, until 2028-06-30. Debian 13 (trixie), released 2025-08-09, is stable, with regular support until 2028-08-08 ([Debian LTS](https://wiki.debian.org/LTS)).
- `node:26.12.1-trixie-slim` and `-bookworm-slim` both exist ([docker-node's versions.json](https://github.com/nodejs/docker-node/blob/main/versions.json)).
- What trixie changes for highsea ([sources.debian.org](https://sources.debian.org/)):
  - **ffmpeg 7.1.5** in place of 5.1.9. Phase 4's transcoding leans on ffmpeg's filters (tone mapping, the hardware upload and scale filters), and 7.1 has years of fixes to them;
  - `unar` 1.10.8 and `wireguard-go` 0.0.20231211, newer than bookworm's;
  - GCC 14, where bookworm has 12, for building `better-sqlite3` against Node 26's headers.
- `docker/NOTICE` names Debian 12 and bookworm, and changes with it.

**Prototypes:**

- `design/prototypes/src/admin/` has every admin screen; Settings areas are in `src/admin/settings/`, dashboard widgets in `src/admin/dashboard/widgets.tsx`. No playback screen exists.
- C5, the player, is a still frame with simulated time. Its spec's States section has Playing, Paused, Ended, Subtitles off, Not on this server and Remote. It has no buffering, no failed stream and no "Transcoding for your connection".
- **Downloads (C8) has gaps** that make it too thin to build from, so the parent plan's "checked at 4.0" comes out as "needs a prototype":
  - neither the web nor the mobile item page has a **Download** action, though mobile's empty state says "Tap Download on a movie";
  - mobile's Offline list shows finished downloads only: nothing downloading, queued, failed, paused for Wi-Fi or expired;
  - the desktop app's downloads have no screen at all. The web's Downloads page says "Downloads live in the desktop app", which is right for a browser, but the desktop app shows that same page.
- Answer 9's additions (Next up, Mark as watched, the Unwatched filter, pull to refresh on mobile Home, "Use on all my devices" for a theme) aren't in any prototype or spec yet.

## The size of this checkpoint, and its parts

Two gated parts ([answer 1](#the-owners-answers)), because the first has a date and the second is the owner's design review:

- **4.0a, the platform:**
  - Node 26 and Debian trixie now ([the owner's change](#the-owners-changes), answer 3);
  - Next.js 16.4 and the audit's exceptions removed, on 2026-10-28;
  - `@types/node` 26;
  - the full checks, the image's end-to-end run and its size on the new base.
- **4.0b, the prototypes and drafts:**
  - the new screens and the additions, with their specs;
  - the three ADR drafts.

4.0a is small and mechanical, and nothing else in Phase 4 is built on Node 24. Its report waits for Next.js on the 28th; 4.0b is under way meanwhile, since the prototypes don't depend on it.

## Progress

Nothing built yet.

## Node 26 (4.0a)

- **The version:** 26.11.1 (2026-10-07), the newest 26.x two weeks old on 2026-10-23 ([the owner's change](#the-owners-changes)), and `node:26.11.1-trixie-slim` in the image. It moves to the newest 26.x two weeks old once Node 26 is LTS on 2026-10-28 (26.12.0 then, 26.12.1 from 2026-11-04), before 0.1.1.
- **Moves together,** as CLAUDE.md says: `.nvmrc`, the root `package.json`'s `engines`, the Dockerfile's three `FROM` lines, ADR 0003's pinned version (a dated section), README's requirement, CLAUDE.md's "Node 24.21.0" lines, and the skills that name the version. `scripts/check-node.ts` reads `.nvmrc`, so it follows.
- **`@types/node` 26.6.5** in every package that has it.
- **Reinstall** for `better-sqlite3` (`rm -rf node_modules && bun install`), locally and in the image's build stage.
- **The checks under Node 26:** lint, typecheck, the tests, the smoke test (better-sqlite3, the worker pool, the API under Node), licences, the audit, the docs build, the sweeps, the leak test, and the end-to-end run through the image. The parts that touch Node's own behaviour get a closer look in the report:
  - the worker pool under Node (`packages/runtime/test/fixtures/pool-under-node.ts`);
  - `fetch` through Undici 8 against the recorded fixtures (TMDB, indexers, notification channels, Trakt);
  - the torrent engine's UDP, uTP and the VPN binding;
  - the subtitle sync's ffmpeg and WebAssembly worker.
- **The image:** its size against the 2000 MB budget, which may move with trixie's larger ffmpeg. A new budget needs its reason in `ci.yml`, as the comment there says.

## Debian trixie (4.0a)

- The Dockerfile's `FROM` lines on `node:<version>-trixie-slim`. The `apt-get` lines keep the same packages; their names are the same in trixie.
- `docker/NOTICE`: Debian 13 (trixie), and the source line for `apt-get source`.
- The e2e fixtures stage installs ffmpeg too, and follows.
- The guides and NAS templates don't name Debian, so they don't change.

## Next.js 16.4 (4.0a)

- `next` in `apps/server` and `apps/docs` at the newest 16.4.x that's two weeks old on the day (16.4.1 on 2026-10-28). React and React DOM move to what that Next release asks for.
- **Checked against [the 16.4 announcement](https://nextjs.org/blog/next-16-4) and its upgrade guide:**
  - the custom server (ADR 0003) and the headers set before Next's handler;
  - `next typegen` in `apps/server`'s typecheck;
  - the docs site's static export, and Fumadocs with React 19.3;
  - `experimental.agentUpgrade` is on by default for security releases. It only prints reminders in `next dev` and `next build`, so it stays as is unless it adds noise to CI's logs.
- **The audit:** the three exceptions come out of `scripts/audit-exceptions.json`, and `bun run audit` passes without them.
- `next-env.d.ts` and the OpenAPI document regenerate if their output changes.

## The prototypes (4.0b)

Each prototype is built in `design/prototypes` at core fidelity, with its spec in `docs/product/`, its routes in the prototype's index, its states reachable from the mock server, and the sweeps clean (axe in three themes, overflow from 1440 to 390, 200% text, reduced motion, the keyboard walk, and the D-pad walk for TV). Each one stops for the owner's approval with the rest of 4.0b.

### Settings › Playback (admin)

- **Spec:** `docs/product/playback-settings.md`. **Prototype:** `#/admin/settings/playback`, in `src/admin/settings/`.
- **Sections:**
  - **Hardware acceleration:** what highsea found on this host (VAAPI, QSV, NVENC, VideoToolbox, or none), the one in use, a Check that transcodes a short clip and reports frames per second, and what to do when nothing is found (pass `/dev/dri` through, or NVIDIA's container toolkit), linking the guide. An untested path stays off by default (the parent plan's risk).
  - **Transcoding:** how many transcodes run at once, and the encoder's speed against quality.
  - **Remote streams:** the bitrate ceiling for people away from home.
  - **Cache:** where transcodes and trickplay live, how much they use, the limit, and Clear.
- **States:** no hardware found, hardware found and checked, a check that failed, the cache over its limit. Owners and admins both change it, as the other server settings ([answer 6](#the-owners-answers)); a User never sees it.
- **Mock:** the mock server's hardware report and cache sizes, with a toggle for each state.

### Now playing (admin) and its widget

- **Spec:** `docs/product/now-playing.md`. **Prototype:** `#/admin/now-playing`, its own sidebar entry after Activity with a count while someone is watching ([answer 5](#the-owners-answers)), and a **Now playing** widget in the dashboard's registry.
- **Each session:** the person and their device, the title and version, a poster, progress, and how it's sent: Direct play, Direct stream or Transcode, with the reasons in words ("Your TV can't play DTS audio, so the audio is converted"), the bitrate and whether it's on the LAN or remote. **Stop** with an optional message, which the person sees in their client.
- **History:** the last 30 days (answer 10), as a list under the live sessions, filterable by person.
- **States:** nobody watching, one session, several, a transcode that can't keep up, and a stopped session.
- **Mock:** simulated sessions that move, as the downloads queue's do, with an event for each change over the mock's SSE.

### The player's states (C5)

- **Spec:** additions to `player.md`'s States. **Prototype:** in each platform's `player.tsx`, reachable from the prototype's state switcher.
- **Buffering:** a spinner over the frame, with the chrome showing, after a short delay so a brief wait shows nothing.
- **A stream that failed:** what happened and what to try, in the brand's voice ("This film didn't start. highsea couldn't read the file."), with Try again and Back.
- **Transcoding for your connection:** the version's description line says what's being sent (player.md's Remote state already sets the words), and a first play of a transcode shows a short "Getting it ready" while the first segments are made.
- **Stopped by the server:** the admin's Stop, with their message.
- **Next up** at a film's end (answer 9), on each platform: the next film in the collection, with a countdown and Cancel.

The parent plan approved these at 4.2; they're approved at 4.0 instead, with the rest ([answer 4](#the-owners-answers)).

### Downloads (C8)

- **Spec:** additions to `client-settings.md` and `client-detail.md`. **Prototype:** mobile's Offline and item page, and the desktop app's Downloads.
- **Download on the item page** (mobile and desktop): Download, then its progress, then Downloaded with Remove. The quality comes from Offline's setting.
- **The list's states:** downloading (progress, speed, Pause), queued, waiting for Wi-Fi, failed (with Try again), and expired ("Connect to Harbor to keep watching it").
- **The desktop app:** its own Downloads page in place of the web's "Downloads live in the desktop app", with where files are kept and the space they take. The web keeps its page.
- **The admin side:** the transcode for download shows in Now playing as a session of its own kind, so the owner sees it.

### The additions from answer 9

Each changes a locked layout, so each is prototyped beside the screen it changes, and the spec's decisions are updated once it's approved:

- **Next up** at a film's end (above, in the player).
- **Mark as watched:** in More on web and mobile, and a long press of OK on TV, with Mark as unwatched once it's watched (client-detail.md).
- **The Unwatched filter** in the library on each platform (client-library.md).
- **Pull to refresh** on mobile Home (client-home.md).
- **"Use on all my devices"** for a theme in client settings, with devices still differing by default (client-settings.md amends its decision).

## ADR drafts (4.0b)

Written as **Proposed**, with what the docs say and what's left to settle. Each becomes Accepted at the checkpoint that builds it, with a dated section for what changed.

- **0051, the playback engine:** the decision (direct play, direct stream, transcode) and its reasons in the style of ADR 0031; HLS in fragmented MP4 (RFC 8216, Apple's HLS authoring specification); segments made on demand by ffmpeg in a child process; seeking far ahead; byte ranges for direct play (RFC 9110 § 14); stream tokens (as the calendar feed's key, ADR 0045); `/ws` staying reserved, with positions over HTTP and `watch.updated` over SSE. Built at 4.1.
- **0052, device profiles:** their shape (containers, codecs with profiles and levels, bit depth, HDR formats, subtitle formats, bandwidth), the built-in ones, what clients report (`MediaSource.isTypeSupported` and `MediaCapabilities.decodingInfo` on the web, the platform player on native), and the catalog later. Jellyfin's DeviceProfile is named as prior art and read for what it gets right, not copied. Built at 4.1.
- **0053, the clients' build and distribution:** `apps/web` in Vite and React served at `/web`; Tauri 2 around it; Expo for mobile and TV with react-native-tvos; versions and build numbers (with ADR 0050's dated section); signing in an approval-gated environment. Built across 4.2, 4.4 and 4.5.

## ADRs

- **New:** 0051, 0052 and 0053, as Proposed drafts.
- **Dated sections:** ADR 0003 (Node 26, and trixie if chosen); ADR 0050 later, with 0053.

## Risks

- **A native addon or a worker under Node 26.** `better-sqlite3` is on Node-API, so the risk is in its build, not its code. The worker pool is the part Bun can't test, and the Node fixture covers it. If either fails, 4.0a stops and reports with the documented cause.
- **Undici 8.** A change in how `fetch` handles a response could show only against a real service, while the tests use recordings. The first 0.1.x run against real TMDB and indexers is where it would show. The owner's own server is the check.
- **trixie's image size.** ffmpeg 7.1 and its libraries may push the image past 2000 MB. If they do, the report says by how much and why, and the budget moves with a reason.
- **Two sources of change at once.** Node, Debian and Next.js in one part make a failure harder to place. Each lands as its own commit, with the checks between them, so one can be reverted alone.
- **Two meanings of Downloads.** The admin's Downloads is the torrent engine; the clients' Downloads is films kept offline. They never share a screen, and the specs keep the names, but the guides should say which is which.

## Open questions for the owner

1. **The parts.**
   - **Recommended:** two gated parts: 4.0a (Node, Debian and Next.js, from 2026-10-28) and 4.0b (the prototypes and the ADR drafts). 4.0a is small and has a date; 4.0b is your design review.
   - Or: one gate for all of 4.0. The platform change would wait for the prototypes' review before it's signed off.
2. **When Node 26 comes in.**
   - **Recommended:** on 2026-10-28, the day it becomes LTS, at 26.12.0 (the newest two weeks old), with the full checks before anything else is built on it. 0.1.0 stays on Node 24.
   - Or: after its first LTS point release, a few weeks later, as checkpoint 9's recommendation put it ("after it has been LTS for a while"). Phase 4's server work would start on Node 24 and move mid-way.
3. **The image's Debian.**
   - **Recommended:** move to trixie with Node 26. Bookworm's regular security support ended on 2026-06-10, and trixie's ffmpeg 7.1 is the one Phase 4's transcoding should be built and measured on, rather than moving under it at 4.3.
   - Or: stay on bookworm until 4.3, when hardware acceleration needs it. One change fewer now, and one more later in the middle of playback work.
4. **When the player's new states are approved.**
   - **Recommended:** at 4.0, with the other prototypes. 4.1 builds the server's errors and reasons, and they read better designed against the screens that show them.
   - Or: at 4.2, as the parent plan has it, when the web player is built.
5. **Where Now playing sits in the admin.**
   - **Recommended:** its own sidebar entry, **Now playing**, after Activity, for the owner and admins, with a count when someone is watching. It's what Plex's and Jellyfin's dashboards lead with.
   - Or: a tab in Activity beside the downloads. One entry fewer, but Activity is about the library's downloads and Now playing is about people.
   - Or: the dashboard widget only, with no page.
6. **Who changes Settings › Playback.**
   - **Recommended:** the owner and admins, as the other server settings are (ADR 0032).
   - Or: the owner only, like Migration, since a wrong hardware setting can stop every transcode.
7. **A 0.1.1 release after 4.0a.**
   - **Recommended:** yes, on your word: 0.1.0 is on Next 16.3.8 with the three advisories excepted, and 0.1.1 would carry the fixed Next.js, Node 26 and trixie to owners now, with nothing else changed. Its changelog says so.
   - Or: no release until 0.2.0 at 4.1's sign-off. The published image keeps the excepted advisories until then. highsea has no Server Actions and resolves a patched `sharp`, so two of the three don't reach it, but `use cache`'s isn't argued away in the exception.
8. **Downloads' prototype.**
   - **Recommended:** prototype the Download action on the item page (mobile and desktop), the list's states, and the desktop app's own Downloads page, at core fidelity, as above.
   - Or: the Download action and states on mobile only, and design the desktop's page at 4.4 when the desktop app is built.

## The owner's changes

On 2026-10-23, after answering, the owner made 1 change:

1. **Node 26 now, not on 2026-10-28.** It's five days from LTS, close enough to build against, so 4.0a moves to Node 26 and trixie at once, at 26.11.1, the newest release two weeks old. Next.js 16.4 still waits for 2026-10-28, when 16.4.1 is two weeks old. This replaces [answer 2](#the-owners-answers)'s date. It affects [the parts](#the-size-of-this-checkpoint-and-its-parts) and [Node 26](#node-26-40a).

## The owner's answers

On 2026-10-23 the owner took every recommendation for questions 1 to 8:

1. **The parts:** two gated parts, 4.0a (Node, Debian and Next.js, from 2026-10-28) and 4.0b (the prototypes and the ADR drafts).
2. **Node 26:** on 2026-10-28, at the newest 26.x two weeks old (26.12.0), with the full checks before anything else is built on it. Brought forward to 2026-10-23 by [the owner's change](#the-owners-changes).
3. **Debian:** trixie, with Node 26.
4. **The player's states:** approved at 4.0, with the other prototypes.
5. **Now playing:** its own sidebar entry after Activity, for the owner and admins, with a count while someone is watching.
6. **Settings › Playback:** the owner and admins change it (ADR 0032).
7. **0.1.1:** released after 4.0a's sign-off, carrying Next.js 16.4, Node 26 and trixie and nothing else, on the owner's word.
8. **Downloads:** the Download action on the item page (mobile and desktop), the list's states, and the desktop app's own Downloads page, at core fidelity.
