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
- Production runs on Node 24 LTS for the best compatibility with native and UDP modules.

## Consequences
- Still one process and one container.
- Next's built-in `next start` is not used. The build uses `output: 'standalone'` and our entry.
- WebSockets and streaming need no extra infrastructure later.
