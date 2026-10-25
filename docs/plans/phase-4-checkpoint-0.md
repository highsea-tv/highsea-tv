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

4.0a is small and mechanical, and nothing else in Phase 4 is built on Node 24. Its report waits for Next.js on the 28th; 4.0b is under way meanwhile, since the prototypes don't depend on it. On 2026-10-25 the owner said 4.0a's report needn't wait: it's reported with Node 26 and trixie, and Next.js 16.4.1 follows on 2026-10-28, the first day the two-week rule allows it (16.4.0, pinnable today, still has the three advisories).

## Progress

- **2026-10-23, 4.0a in progress:**
  - Node 26.11.1 and Debian trixie, on the owner's word: `.nvmrc`, `engines`, the Dockerfile's three `FROM` lines, `@types/node` 26.6.5 and the skills; ADR 0003's dated section.
  - The image grows 139 MB on amd64 and 180 MB on arm64, all from Debian's packages (ffmpeg 7.1 brings LLVM 19 and Mesa's Gallium; unar's `libgnustep-base1.31` declares `Depends: dpkg-dev`). CI's budget is 2,200 MB, with the reason beside it.
  - The end-to-end run's "the dashboard has Network again" was a race in the test, reproduced on 0.1.0: `count()` doesn't wait. It now waits for the widget to go. Two runs in a row passed on the trixie image.
  - Checks under Node 26.11.1: lint, typecheck, 11,405 tests pass (6 skipped), smoke, and the image boots. Next.js 16.4 waits for 2026-10-28.
- **2026-10-23, 4.0b in progress:**
  - **Settings › Playback:** prototyped at `#/admin/settings/playback` (`src/admin/settings/playback.tsx`, `src/mock/playback.ts`), with the states reachable: an Intel GPU checked on Harbor, no hardware on the empty server, **Prototype only · Fail the next check** and **Prototype only · Fill the cache**. The mock's API is `transcoding`, because `playback` is already the clients' positions and picks.
  - **Now playing:** prototyped at `#/admin/now-playing` (`src/admin/now-playing/`, `src/mock/sessions.ts`), after Activity in the sidebar with a count while anyone is watching. Four sessions move with the mock's clock: direct play on the Apple TV, a transcode for Ruth away from home, a paused direct stream in Chrome, and a download made for Ines's iPhone. Stop and Cancel take an optional message, and the row says who stopped it and what they wrote before it goes. **Prototype only · Slow a transcode** plays one that can't keep up. The empty server has nobody watching. The history covers 30 days, with a filter by person.
  - **The Now playing widget:** added to the prototype's registry in `src/mock/widgets.ts`, which wraps `@highsea-tv/personalization/widgets` so the server's registry is unchanged until 4.3. It's added from Customize; the signed-off first arrangement is unchanged (an earlier draft put it first, which the dashboard's tests rightly caught as a change to a locked layout). Whether it should lead the owner's and admins' default is for the owner to decide.
  - **The player's states:** on web, mobile and TV, drawn once in `src/client/stream-states.tsx` with each platform's own buttons: Getting it ready, Buffering, Didn't start, Stopped by the server (with the admin's message) and Next up (a 10 s countdown, Play now and Cancel). The prototype's toolbar picks one under **Stream** on a player, or `?stream=` opens one. Next up uses the first related title, since the prototype has no collection order. My calls: Buffering shows only after 1 s in the product; on web and mobile Next up doesn't take the focus, so Space during the credits still pauses, while on TV Play now does. `player.md` has the states and their copy.
  - **Specs:** `docs/product/playback-settings.md` and `docs/product/now-playing.md`, new.
  - **ADR drafts:** 0051, 0052 and 0053, Proposed, every link checked.
- **2026-10-24, 4.0b continued:**
  - **Downloads:** the device's downloads in `src/client/downloads.ts`, one list per app, seeded with one download in each state, moving once a second, one at a time. Mobile's Offline and the desktop app's Downloads share `src/client/offline-list.tsx`: the space used, each download with its state (downloading, paused, queued, waiting for Wi-Fi, stopped, downloaded, expired) and its actions, then Quality, and Wi-Fi only on a phone or the folder on a computer. **Download** on the item page (`src/client/download-button.tsx`) on mobile and in the desktop app. The toolbar's new **App** choice (Browser or Desktop app, `?app=desktop`) picks the desktop app on the web platform; the browser keeps "Downloads live in the desktop app".
  - **Mark as watched:** More on the web and mobile item pages, and a 0.6 s hold of OK on TV that opens a small dialog, with "Hold OK for more" under the picks; a shorter press still plays. The mock has `playback.setWatched` and `ClientItem.watched`, and three of Ines's films are now watched. TV's Back registry (`src/tv/back.ts`) now gives Back to the screen below when an overlay closes, rather than to Home.
  - **The Unwatched filter:** a Show select on the web, a Show group in mobile's sheet, and an Unwatched choice after TV's sorts.
  - **Pull to refresh** on mobile Home (`src/mobile/pull.tsx`), by touch, and by mouse in the prototype.
  - **Use on all my devices** under the themes on web, mobile and TV, off by default.
  - **Specs:** client-settings.md (Offline, Use on all my devices, and the amended decision), client-detail.md (Download, Mark as watched), client-library.md (Unwatched) and client-home.md (pull to refresh); each answered open question is struck through with its answer.
  - **Routes:** a route may carry the toolbar's state after `?`, so the routes test and the sweeps cover the desktop app's Downloads and item page and four of the stream's states.
  - My calls: the desktop app's Download sits under the actions rather than among them, so the two progress bars (watched and downloading) don't sit side by side; one download at a time; failed downloads keep their place until Try again or Cancel; "Use mobile data" on a download waiting for Wi-Fi.
- **2026-10-25, 4.0a, signed off by the owner on 2026-10-25** (without Next.js, on the owner's word), with everything done up to then, the overflow fixes included. Next.js 16.4.1 is the one item left in 4.0a: it goes in on 2026-10-28, with the audit's three exceptions removed, and is reported then.
  - Node 26.11.1 and Debian trixie as above. Next.js 16.4.1 follows on 2026-10-28; until then the audit's three exceptions stand (their reasons are in `scripts/audit-exceptions.json`).
  - The parts that touch Node's own behaviour all ran under Node 26.11.1: the worker pool under Node, `fetch` against the recorded fixtures, the torrent engine's UDP, uTP and binding, the subtitle sync's ffmpeg and WebAssembly worker, and the real unar. Six tests skip: the VPN leak test (5; Linux, root and `HIGHSEA_LEAK_TEST=1`, run by CI's leak job) and the moviehash reference vector (1; its file isn't on this machine).
  - Checks under Node 26.11.1: lint (1,254 files), typecheck, 11,457 tests pass (6 skipped), smoke, licences (860 packages), audit, the docs build, and the prototypes' keyboard and D-pad sweeps clean. The image's end-to-end run and its size passed on 2026-10-23 and nothing in the image has changed since.
  - **The server sweep fails on overflow alone** (no axe violations, no page errors): 225 findings in the real admin, all from the stricter `overflow()` that 4.0b's review brought in. Nine pages overflow at 390 px at 100% text (Users and its edit, invite and devices pages, Devices, Import › Library, the setup's picker, System › Health); the rest are at 200% text, most of them the sidebar's nav at 1440 (36 px). They're in 0.1.0 as published, unseen until now. Left for the owner's decision.
  - **The owner's decisions at review, 2026-10-25:** the admin's overflows are fixed now, in the prototypes and `apps/server` together, and go out in 0.1.1 with Next.js, Node 26 and trixie (amending [answer 7](#the-owners-answers)); the dashboard's default stays as signed off, with Now playing added from Customize.
  - **The overflows, fixed on 2026-10-25,** in the prototypes and `apps/server` together. Most share one cause: a grid with no column of its own gets an `auto` track that grows to its widest content, and a grid item's automatic minimum width stops it shrinking below that (CSS Grid 1, §7.6 for the implicit track and §6.6 for the automatic minimum). So the fix is `grid-cols-[minmax(0,1fr)]` and `min-w-0`, the pitfall CLAUDE.md already names, plus `overflow-wrap: anywhere` on paths, release names and regular expressions, which have no spaces to break at.
    - **In ui-web (the locked design system; the owner approved these on 2026-10-25):**
      - Button's label wraps when the button would be wider than its container: `max-w-full`, `min-h` in place of `h`, no `whitespace-nowrap`, and `overflow-wrap: anywhere` for a long name such as a folder's. At its usual width it's one line at the control's height, as before.
      - Badge does the same (`min-h`, `max-w-full`).
      - SegmentedControl scrolls sideways inside itself when it's wider than its column, as the line Tabs already do.
      - Field, Dialog, Sheet, WidgetFrame, NavGroup and EmptyState get a `minmax(0,1fr)` column or `min-w-0`. Inputs are `max-w-full`. A widget's meta wraps, and a dialog's title and description break long words.
    - **In the screens (both codebases where a screen is in both):**
      - the admin shell's main and Settings' area grid and cards;
      - Appearance's identity, file input and theme sample;
      - Curation's preview;
      - the format test, and the qualities list, whose rows wrap;
      - the movie page's details, files, release name and subtitle search;
      - Import and Library import (the tabs wrap; the folder row wraps);
      - Indexers' catalog;
      - the setup's folder picker;
      - System's Health and Events;
      - Users' edit sheet, the downloads sheet, Subtitles' profile and scoring, and Settings › Media's Add folder;
      - a carousel's heading row, which wraps its action.
    - **The sweep:** `escapes()` in `scripts/sweeps/lib.ts` names where each overflow starts. It now also counts text that runs out of its box without widening it, such as the folder buttons on Import.
    - The guides' screenshots are taken at 1280 and 1440 px with 100% text, where none of these layouts change, so they aren't retaken.
  - Checks after the fixes, under Node 26.11.1: lint (1,254 files), typecheck, 11,457 tests pass (6 skipped), smoke, and every sweep clean: pages (1,624 pages), keyboard (171), D-pad, and the server's admin pages from the production build.
- **2026-10-24, 4.0b, signed off by the owner on 2026-10-25:**
  - The owner approved the changes to locked layouts from answer 9 (Mark as watched, the Unwatched filter, pull to refresh and Use on all my devices) and the fixes found at review. Their specs' decisions stand as amended. Two questions stay open, in 4.0a's report: whether Now playing leads the dashboard's default, and the 74 overflow findings in signed-off admin screens.
  - Every prototype in this part's scope is built, with its spec and routes, and the three ADR drafts are written. 4.0a's report waits for Next.js 16.4 on 2026-10-28.
  - **Found and fixed along the way:**
    - The toolbar's `app` choice was documented but `stateFromParams` didn't read it, so `?app=desktop` did nothing; it does now.
    - On TV, focus could leave the player's questions (Didn't start, Next up) for the controls behind them. The navigator's `data-isolate` only keeps focus out of a region, not in one. So the controls are isolated behind a question, as they already were behind the tracks panel, and `inert` (a question is modal). The same isolation applies behind TV detail's options. The D-pad sweep skips inert items.
    - The desktop app's Downloads overflowed at 390 px with 200% text; its columns are `minmax(0,1fr)` now and its rows wrap.
    - **Found by the owner at review:** on mobile's item page, More ran off the screen beside Download, a `w-full` Button (ui-web's are `shrink-0`) in a flex row. The row is a `minmax(0,1fr)_auto` grid now.
    - **Why the sweep missed it:** `overflow()` in `scripts/sweeps/lib.ts` measured only the document, but the phone's screen and the admin's main scroll in their own frames, where `overflow-y: auto` makes `overflow-x` auto too (CSS Overflow 3), so a too-wide screen scrolled sideways there unseen. It now measures those scrollers as well (not ones that declare their own `overflow-x`, which scroll sideways on purpose).
    - **What the stricter check found:** mobile's Home (the Featured carousel's section, a grid item with no `min-w-0`), the item page's Play from the start, Servers' Sign out of Harbor and Offline's actions at 200% text, now fixed (long labels wrap); web (480 pages) and TV (96) are clean. On the admin, the two new screens are fixed (Now playing's rows and Playback's device paths). The signed-off admin screens have 74 more findings, left for the owner's decision: the sidebar's nav at 1440 with 200% text (55 px on most pages), Curation's editors (92 px), Settings › Users (324 px at 390 even at 100% text), and single pages at 390 with 200% text.
  - Checks under Node 26.11.1: lint (1,254 files), typecheck, 11,457 tests pass (6 skipped), smoke, licences, audit (the three Next.js exceptions until 2026-10-28), the docs build, the keyboard (171 pages) and D-pad sweeps clean, and the pages sweep clean on mobile, web and TV; on the admin it has the 74 findings above, in signed-off screens.

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

Written as **Proposed**, with what the docs say and what's left to settle. Each becomes Accepted at the checkpoint that builds it, with a dated section for what changed. Drafted on 2026-10-23: [0051](../adr/0051-playback-engine.md), [0052](../adr/0052-device-profiles.md) and [0053](../adr/0053-clients-build-and-distribution.md).

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
