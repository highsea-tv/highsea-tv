# 0003. Server runtime: custom Node entry hosting Next.js + Hono

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
The server is one Next.js application, but it also runs long-lived services: the job scheduler, the torrent engine, the download monitor, catalog sync and LAN discovery. Later it will also serve media streams (range requests, HLS) and WebSockets (remote control, SyncPlay). Next.js route handlers on a self-hosted Node server are a poor fit for WebSockets and long-lived streaming. Booting services from `instrumentation.ts` alone is fragile.

## Decision
- `apps/server/server.ts` is a Node `http` server and the single process entry.
  1. It calls `@highsea/runtime.boot()`: migrations, then jobs, torrent engine, monitors, discovery and event bus.
  2. It routes `/api/*`, `/stream/*` and `/ws` to a Hono app.
  3. Everything else goes to Next's request handler.
- The runtime singleton lives on `globalThis.__highsea`, so code rendered by Next shares it.
- CPU-heavy work (subtitle alignment, piece hashing, image processing) runs in `worker_threads`. ffmpeg runs in child processes.
- Production runs on Node 24 LTS for the best compatibility with native and UDP modules. The exact version is 24.21.0, pinned in `.nvmrc` and used alike locally, in CI and in the image, with `scripts/check-node.ts` refusing another (amended 2026-10-20 at the owner's request).

## Consequences
- Still one process and one container.
- Next's built-in `next start` is not used. The build is a plain `next build`; our entry serves it (see the amendment below).
- WebSockets and streaming need no extra infrastructure later.

## Amendment (2026-10-20): no standalone output

Next.js documents that standalone output and a custom server "cannot be used together": standalone doesn't trace custom server files, and emits its own minimal `server.js` instead ([custom server guide](https://nextjs.org/docs/app/guides/custom-server)). So the build is a plain `next build`, and production runs our entry, `node apps/server/server.ts`. Node runs it with built-in type stripping, which is stable from Node 24.12 ([Node.js › TypeScript](https://nodejs.org/api/typescript.html)). The config enforces `erasableSyntaxOnly` and `verbatimModuleSyntax`, as those docs recommend, so only syntax Node can strip compiles. The image therefore carries the workspace and its dependencies rather than a traced bundle; slimming it is Phase 3 checkpoint 9.

## Amendment (2026-10-22, checkpoint 9a): the slim image

The amendment above left the image carrying the whole workspace. Checkpoint 9a slims it without changing how it runs: still `node apps/server/server.ts`, with type stripping, on Node 24.21.0.

- **What the runtime stage holds.** The Dockerfile's `production` stage runs `scripts/image.ts`, which installs with `bun install --production --frozen-lockfile --filter @highsea-tv/server` into a clean folder, following [Docker's multi-stage builds](https://docs.docker.com/build/building/multi-stage/). Bun's docs don't say how `--production` and `--filter` combine ([bun install](https://bun.com/docs/pm/cli/install)), so the script checks the result rather than trusting it:
  - The build fails if a package is installed that no production workspace or installed package asks for, which is what a dev-only package would be.
  - It fails, too, if a workspace the server needs got no install.
  - It then copies the server's entry, `src/`, `public/` and `.next/` (without its cache), and each workspace the server depends on, as source, without `test/` folders, scripts, docs or stories.
  - design/, docs/, scripts/, storybook, the prototypes, every fake and every recording stay out.
  - At 9a the image is 1,907 MB on amd64 and 1,836 MB on arm64. CI fails above 2,000 MB (`scripts/image.ts size`), and lists the largest folders so a rise can be traced.
- **Packages for another C library are removed.** npm's `libc` field names the C library a package is built for, and npm skips one that doesn't match the system ([package.json › libc](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#libc)). Bun filters by `os` and `cpu` only (`bun install --help`), so Next's and sharp's musl builds were installed beside the glibc ones on Debian. The script removes them and the links to them, which saved 147 MB on arm64.
- **No secret reaches the build context.** `.dockerignore` leaves out `.env` and `.env.*`, as `.gitignore` does. The production step fails if a `.env` file is in the context anyway. The release's keys come in as build secrets.
- **The end-to-end run uses the image as it ships.** The fakes and TMDB's recordings live in `test/` folders, so the image can't run `HIGHSEA_TMDB_REPLAY` or `HIGHSEA_SUBTITLES_FAKE`. Instead, `HIGHSEA_FIXTURES_URL` sends every request the server makes to one fixtures service (scripts/e2e/fixtures.ts):
  - a request for another host carries its address in `x-highsea-forwarded-url`;
  - the server logs a warning at boot while the variable is set;
  - compose.e2e.yaml runs the server on an `internal` network with no way out.

  The variable changes where requests go, not what the server trusts. The fixtures' catalog is accepted only because the run also sets `HIGHSEA_CATALOG_DEV_KEY=1` (ADR 0034).
- **CI builds each platform natively.** amd64 builds on `ubuntu-24.04` and arm64 on `ubuntu-24.04-arm` ([Docker: multi-platform with GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/)), each with its own cache scope. Each platform's build must boot healthy and stay inside a size budget. Each is also exported as an OCI layout with BuildKit's provenance (`mode=min`) and an SBOM ([build attestations](https://docs.docker.com/build/metadata/attestations/)), and a check reads the attestation manifests and the OCI labels GitHub shows. Nothing is pushed. Docker's GitHub Builder reusable workflow merges platforms only by pushing, so it waits for the release workflow in 9b.

## 2026-10-23: Node 26 and Debian trixie (checkpoint 4.0a)

Phase 4 moves the one Node from 24.21.0 to **26.11.1**, and the image from Debian 12 (bookworm) to **Debian 13 (trixie)**, as checkpoint 9's answer 10 planned and phase-4-checkpoint-0.md records. Everything else in this ADR stands: still one process, still `node apps/server/server.ts` with type stripping.

- **Why now.** Node 24 entered maintenance on 2026-10-20, and Node 26 becomes Active LTS on 2026-10-28, with maintenance until 2029-04-30 ([nodejs/Release](https://github.com/nodejs/Release)). The owner chose to build Phase 4 on it from the start, five days before LTS. 26.11.1 (2026-10-07) is the newest 26.x two weeks old on 2026-10-23, the rule every dependency follows; it moves to the newest 26.x two weeks old once Node 26 is LTS, before 0.1.1.
- **What changes for highsea** ([Node 26.0.0's notes](https://nodejs.org/en/blog/release/v26.0.0)):
  - native addons are rebuilt for `NODE_MODULE_VERSION` 147. `better-sqlite3` is built on Node-API, which is stable across Node versions ([Node-API](https://nodejs.org/docs/latest-v26.x/api/n-api.html)), so it's rebuilt, not upgraded;
  - `fetch` is Undici 8, which every outside service goes through;
  - `module.register()` is deprecated and `--experimental-transform-types` removed. highsea uses neither: type stripping is all it needs (`erasableSyntaxOnly`).
- **Moves together,** as before: `.nvmrc`, `engines`, the Dockerfile's three `FROM` lines (`node:26.11.1-trixie-slim`), CI through `node-version-file`, `scripts/check-node.ts` and `@types/node` 26.
- **Why trixie.** Bookworm's regular security support ended on 2026-06-10 and it's in Debian LTS until 2028-06-30; trixie is stable, with regular support until 2028-08-08 ([Debian LTS](https://wiki.debian.org/LTS)). It carries ffmpeg 7.1 in place of 5.1, which Phase 4's transcoding is built and measured on, and GCC 14 for the build stage's addon compile. The packages the image installs keep their names; `docker/NOTICE` names trixie.

## 2026-10-27: `/stream` is served (checkpoint 4.1a)

`http.ts` now hands `/stream/` to `apps/server/src/stream/`, as it hands `/api` to Hono, so the file's bytes go straight from `fs.createReadStream` into Node's response and never through Hono or Next ([Node's fs docs](https://nodejs.org/api/fs.html#fscreatereadstreampath-options)). Without the stream handler (a test that builds only the API), `/stream/` still answers 501. `/ws` stays reserved and answers 501.

- `GET /stream/files/{token}` serves one file for direct play by byte ranges ([RFC 9110 § 14](https://www.rfc-editor.org/rfc/rfc9110#section-14)): one range or a suffix, the whole file for several ranges, `416` past the end, and `If-Range` by a strong tag or the exact date. `HEAD` answers the same headers; any other method is `405`.
- The token is the only credential, since a `<video>` element can't send headers. It's an HMAC over the play session, the person and the file, valid while the session lives and for 6 hours after its last report (the owner's answer 4), and never logged. Responses carry `Referrer-Policy: no-referrer`, `nosniff` and `Cache-Control: private, no-store`.
- `GET /stream/try` is the review's test page, served only with `HIGHSEA_PLAYBACK_TRY=1`, with a warning at boot.

4.1b adds HLS playlists, segments and WebVTT under the same prefix.

## 2026-10-27: `/web` is served (checkpoint 4.2a)

`http.ts` hands `/web` and everything under it to `apps/server/src/web/`, after `/stream/` and before Next, which never sees those addresses. It serves the web client's static build ([ADR 0053](0053-clients-build-and-distribution.md)) from `apps/web/dist`, or `HIGHSEA_WEB_DIR`, so the client and the API share one origin and the admin's session cookie.

- `/web` redirects to `/web/` (301), keeping the query, since the build's addresses are relative to `base: '/web/'` ([Vite › base](https://vite.dev/config/shared-options.html#base)).
- An address without a file extension is a route of the app and gets `index.html` (the history API's fallback); a missing file with an extension is a 404, and a path that leaves the build folder is refused. Only `GET` and `HEAD`; anything else is 405.
- Vite names what it builds under `assets/` by its content's hash, so those are sent with `Cache-Control: public, max-age=31536000, immutable` ([RFC 8246](https://www.rfc-editor.org/rfc/rfc8246)); `index.html` and the icons with `no-cache` and an ETag, so a new release is picked up at the next load ([Vite's static deploy guide](https://vite.dev/guide/static-deploy.html), [RFC 9111 § 5.2.2.4](https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2.4)). Text over 1 KB is gzipped once and kept, for browsers that ask.
- Every answer carries a Content-Security-Policy that allows only this origin, plus `blob:` media and workers for hls.js in 4.2b, with `nosniff` and `Referrer-Policy: same-origin`.
- Without a build, a route answers 503 with a page that says how to make one.

The image builds the web app in its build stage, and `scripts/image.ts` copies `apps/web/dist` into the production tree, with none of the web app's sources or dependencies: it's served, never run. The image grew by 2 MB, to 2,093 MB.

## 2026-10-28: the hardware drivers, and the render node's group (checkpoint 4.3b)

Hardware acceleration (ADR 0056) adds Debian packages to the runtime stage on amd64 only, where Intel and AMD graphics are: `intel-media-va-driver-non-free`, `libmfx-gen1.2`, `libvpl2`, `mesa-va-drivers` and `mesa-vulkan-drivers`, about 134 MB measured in a trixie container. The non-free driver needs Debian's `non-free` component, which the Dockerfile adds to `/etc/apt/sources.list.d/debian.sources` (trixie's deb822 sources, [Debian wiki › SourcesList](https://wiki.debian.org/SourcesList)) for it alone, and checks it took. It's the build that encodes on chips before Ice Lake without the HuC firmware on the host ([Intel's media driver README](https://github.com/intel/media-driver#build-types)); docker/NOTICE lists the five packages and why one is non-free. CI's budget rises from 2,200 MB to 2,300 MB (the owner's answer 3 for 4.3), and `scripts/image.ts hardware` checks the built image's encoders, filters and driver files.

The entrypoint adds the PUID user to the group of each render node passed through (`/dev/dri/renderD*`), creating the group by its number when the image has none. gosu given `uid:gid` drops every supplementary group, so when it added one, the entrypoint switches user with `setpriv --reuid --regid --init-groups` instead, which takes them from `/etc/group` ([setpriv(1)](https://man7.org/linux/man-pages/man1/setpriv.1.html), initgroups(3)). A node owned by group 0 is left alone: the user isn't put in root's group.

## 2026-10-28: NVIDIA's variables, and the user found from /data (checkpoint 4.3c, ADR 0057)

The runtime stage's `ENV` drops `PUID=1000` and `PGID=1000`, which the entrypoint couldn't tell from values an owner chose, and adds `NVIDIA_VISIBLE_DEVICES=all` and `NVIDIA_DRIVER_CAPABILITIES=compute,video,utility`, which do nothing under runc and hand the cards and their video libraries to the container under NVIDIA's runtime ([NVIDIA Container Toolkit: specialized configurations](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)).

When the container starts as root and `PUID` or `PGID` isn't set, `docker/entrypoint.sh` takes them from `/data`: its owner, else the first thing at its top level not owned by root (`find -maxdepth 1 ! -uid 0 -printf '%U:%G' -quit`), else 1000:1000. A value that's set wins, and the log says which it chose. `scripts/image.ts user` checks five cases on the built image, and CI runs it beside `hardware`.

## 2026-11-03: the client's web export, to be served at `/web` (one client platform, part A)

Part A makes `apps/client`'s web export (`expo export -p web`, a single-page app with every address and asset under `/web`; [ADR 0061](0061-one-client-platform.md)), which part C serves at `/web` in place of `apps/web`'s Vite build. Nothing about serving changes yet: `apps/server/src/web/` still serves `apps/web/dist` (or `HIGHSEA_WEB_DIR`) as the 4.2a section describes, the image still builds and copies `apps/web`, and the CSP is unchanged.

What part C needs is already in the export's shape. Expo's single output is one `index.html` for every route, so the history fallback stays as it is. Its hashed assets are under `/web/_expo/static/`, beside `/web/assets/`, which part C names for the long cache. The development server for the export (`apps/client/scripts/serve.ts`) answers as the server does: a file when there is one, a 404 for a missing one under `_expo/` or `assets/`, and `index.html` otherwise.

## 2026-11-03: `/web`'s policy frames YouTube's privacy-enhanced embed (one client platform, B1)

On the owner's answers 2 and 9 at B1's review, a film's page on the web plays its trailer in an `<iframe>` of YouTube's privacy-enhanced embed, `https://www.youtube-nocookie.com/embed/{key}?autoplay=1`, loaded only once the person opens it (`apps/client/src/detail/trailer-player.web.tsx`). An embed from that host doesn't store information about the person until they play it ([YouTube Help: Embed videos and playlists › privacy-enhanced mode](https://support.google.com/youtube/answer/171780)).

`/web`'s policy (`apps/server/src/web/index.ts`) gains `frame-src https://www.youtube-nocookie.com`. Without it a frame falls back to `default-src 'self'` and the browser refuses the embed ([MDN: CSP `frame-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-src), which falls back to `child-src`, then `default-src`). That host alone: no `www.youtube.com` and no Vimeo (answer 9). The page's own `referrer-policy: same-origin` stays; the iframe asks for `strict-origin-when-cross-origin` itself, which the `referrerpolicy` attribute does for that one request ([MDN: `<iframe>` referrerpolicy](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#referrerpolicy)), because YouTube's embeds need the page's origin to play ([YouTube API Services: required minimum functionality](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity)).

`/web` still serves `apps/web`, which has no trailer, until part C moves the client's export there; the directive is ready for it. `apps/server/test/web.test.ts` holds the policy to that one host.

## 2026-11-04: `/web` serves the client's export (one client platform, C1)

`/web` now serves `apps/client/dist`, Expo's single-page export with `experiments.baseUrl: '/web'` ([Expo CLI › Hosting with sub-paths](https://docs.expo.dev/more/expo-cli/#hosting-with-sub-paths)), in place of `apps/web`'s Vite build. `apps/server/server.ts` reads it by default and `apps/server/src/web/index.ts` serves it as before (every unknown path under `/web` falls back to `index.html`, under the same policy), with what the export's layout needs:

- Expo writes content-hashed scripts under `_expo/static/js/web/` and hashed assets (the fonts among them) under `assets/`, so both are cached for good (`immutable`); `index.html` and `favicon.ico` are revalidated.
- `.ttf` is served as `font/ttf` ([RFC 8081](https://www.rfc-editor.org/rfc/rfc8081)) and compressed, since a TrueType file isn't compressed already.
- `metadata.json`, Expo's build manifest, isn't served: it answers 404.

The image builds the export (`EXPO_NO_TELEMETRY=1 bun run export:web` in `apps/client`) and `scripts/image.ts` copies only `apps/client/dist`. On the owner's answer 3, addresses the old web app had and the client doesn't (`/web/library/collections`, `/web/settings/<section>`) aren't redirected: they draw the client's not-found page. `/web`'s policy, including its `frame-src` for youtube-nocookie, is unchanged and now has the trailer it was made for.

Building the image for C1 found two faults from after 0.3.0's image, the last one built, and fixed both:

- The manifests stage kept only `package.json` and `bun.lock`, so `bun install` failed on `patches/react-native-screens@4.30.0.patch` (4.5b's), which Bun reads as it installs ([Bun › Patch dependencies](https://bun.sh/docs/install/patch)). The stage keeps `patches/` now, and `scripts/image.ts production` copies the patches `patchedDependencies` names.
- Bun's isolated install links a workspace's optional peer whenever the lockfile has it resolved anywhere in the repository ([Bun › Isolated installs](https://bun.sh/docs/install/isolated)), so `--filter @highsea-tv/server` brought `@highsea-tv/ui`'s React Native and Expo peers, resolved for `apps/client`, into production: 583 store entries. `--omit peer` would drop required peers as well ([`bun install`](https://bun.sh/docs/cli/install)), so `pruneOptionalPeers` removes the links to optional peers no production workspace depends on, then every store entry nothing left links to.

## 2026-11-04: Next.js hosts the library's React Native drawing (part D1)

Since D1 the admin draws with `@highsea-tv/ui`'s React Native renderer through react-native-web ([ADR 0061](0061-one-client-platform.md)'s section of today), and Next.js is only its host. Three things in `apps/server` follow:

- **Webpack, not Turbopack.** `next.config.ts` aliases `react-native` to react-native-web (through `@highsea-tv/ui/next`'s shims, with React Native's `codegenNativeComponent` and asset registry), puts `.web` files first, and defines `__DEV__`, `process.env.EXPO_OS` and the browser's `global`, as react-native-web's setup asks of a bundler ([react-native-web › Setup](https://necolas.github.io/react-native-web/docs/setup/)). Turbopack's `resolveExtensions` doesn't reach inside dependencies ([vercel/next.js#97567](https://github.com/vercel/next.js/issues/97567), open), so `server.ts` and `build` choose webpack ([Next.js › Custom server](https://nextjs.org/docs/app/guides/custom-server)). `@highsea-tv/runtime`, `db` and `jobs` stay external through a webpack `externals` function as well, since `serverExternalPackages` matches paths under `node_modules` and a workspace package resolves to its own folder ([webpack › externals](https://webpack.js.org/configuration/externals/#function)).
- **Styles in the server's HTML.** react-native-web writes what it draws into one sheet of atomic classes ([Styling](https://necolas.github.io/react-native-web/docs/styling/)) and documents handing that sheet to the page from a server render ([Rendering › Server API](https://necolas.github.io/react-native-web/docs/rendering/)). `src/admin/style-registry.tsx` writes it through `useServerInsertedHTML`, Next's documented way for a styling library ([Next.js › CSS-in-JS](https://nextjs.org/docs/app/guides/css-in-js)), under the id react-native-web takes over in the browser, so a page has its layout before any JavaScript runs. The server sweep checks this with JavaScript off.
- **The root layout** calls `polyfillAnimationFrame()` (Reanimated reads `requestAnimationFrame` as it loads, which Node lacks) and `await connection()`, so every admin page renders per request ([`connection`](https://nextjs.org/docs/app/api-reference/functions/connection)) and the sheet is the request's own.
- **Nothing shows until the page hydrates** (the owner's answer of 2026-11-05 to D1's report). The library's form factor reads the window through `useSyncExternalStore`, whose server snapshot stands in where there's no window ([React › `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering)), so the server can only guess a page's layout. Rather than guess, `src/admin/providers.tsx` renders every admin page inside a `display: contents` wrapper that is `visibility: hidden` until it hydrates ([MDN › `visibility`](https://developer.mozilla.org/en-US/docs/Web/CSS/visibility)): the server's HTML still carries the page and its sheet, so the page appears once, styled and laid out at the browser's own width, and with JavaScript off it is only its background.
- **Node's timers, typed beside React Native's.** The server's program now holds React Native's types too, whose `src/types/globals.d.ts` declares global `setTimeout`, `setInterval` and `setImmediate` returning a number. For a call like `setTimeout(() => …, ms)` TypeScript resolves to that non-generic overload, the closer match, whatever order the files come in ([Handbook › Function overloads](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads)), so `next build`'s type check found 30 places where code that only runs in Node calls `.unref()` on a handle Node always returns as an object ([Node.js › Timers](https://nodejs.org/api/timers.html#timeoutunref)). Keeping React Native's globals out isn't possible while the admin's pages import the library and also reach the runtime, so `@highsea-tv/core/timers`' `unref(handle)` takes the handle as it's typed anywhere, and the subtitles' wait for the bus keeps cancel functions rather than naming the handle's type.

## 2026-11-05: the image's size is reported, not gated (one client platform, D2)

The owner removed the image's size budget on 2026-11-05, at D2's review (one-client-platform-d.md, D2's answer 2). The admin drawing with React Native brings expo-image (138 MB), lucide-react-native (55 MB), hermes-compiler (48 MB) and expo-modules-core (39 MB) into the production tree, and the image measured 2,883 MB against the 2,300 MB budget. `scripts/image.ts size` now reports the size and the largest folders and fails on nothing; CI's image job runs it the same way, and `ci.yml` keeps the budget's history in a comment. The production tree's own check, that nothing is installed which production doesn't ask for, still fails the build.

## 2026-11-05: the Next.js wiring in the library, and the server without Tailwind (one client platform, D3)

- **One place for the Next.js wiring.** D1 wrote the react-native-web alias, the `.web` extensions and the defines into `apps/server/next.config.ts`, and the style registry into `apps/server/src/admin/`. The guides (`apps/docs`) now draw the library's native `Lockup` too, so both hosts take the wiring from the library: `libraryWebpack` from `@highsea-tv/ui/next/webpack`, called from each host's `webpack` option, and `StyleRegistry` from `@highsea-tv/ui/next/style-registry`, which writes react-native-web's sheet through Next's `useServerInsertedHTML` ([Next.js › CSS-in-JS](https://nextjs.org/docs/app/guides/css-in-js)). Next.js is the library's optional peer. The guides build with `--webpack` for the reason D1's section gives: Turbopack applies `resolveExtensions` only to the app's own files (vercel/next.js#97567).
- **The server has no Tailwind.** With the web renderer gone (ADR 0061's section of today), nothing in `apps/server` writes a utility class: `postcss.config.mjs`, `@tailwindcss/postcss` and the `@import "tailwindcss"` in `app/globals.css` are removed, and `globals.css` keeps only the tokens' variables, the faces and the page's ground, as react-native-web's setup asks of a host ([react-native-web › Setup › Root element](https://necolas.github.io/react-native-web/docs/setup/#root-element)). The guides keep Tailwind, since Fumadocs' styles are written for it (`fumadocs-ui/css/preset.css`, imported after `tailwindcss`).
- **The build context.** The Docker context was 5,517 MB, nearly all native build output the image never reads: the desktop app's Rust `target` (4,689 MB), the client's prebuilt `ios` project (675 MB), and the `.expo`, `dist-desktop` and `dist-mock` folders. `.dockerignore` leaves those exact paths out ([Docker › .dockerignore files](https://docs.docker.com/build/concepts/context/#dockerignore-files)), and the context is 97 MB.
- **Every admin page renders its styles on the server.** The server sweep loads each page it visits with JavaScript off, at 1440, and finds the library's sheet in the HTML (D1 did this for System › Status alone).
