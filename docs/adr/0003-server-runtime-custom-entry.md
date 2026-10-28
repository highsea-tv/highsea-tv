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
