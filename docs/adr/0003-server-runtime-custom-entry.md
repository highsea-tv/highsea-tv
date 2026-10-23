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
