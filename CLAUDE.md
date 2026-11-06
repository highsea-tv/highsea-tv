# highsea.tv: notes for Claude Code

highsea is a self-hosted replacement for the *ARR suite (Radarr, Sonarr, Prowlarr, qBittorrent, Bazarr) that grows into a streaming server like Plex and Jellyfin, with its own web, desktop, mobile and TV clients. It's a Bun monorepo.

## Read as needed

- **Where things stand:** [docs/status.md](docs/status.md), every phase, checkpoint and plan with its sign-off. Read the entry for the work you're doing, not the whole file.
- **The whole picture:** [docs/roadmap.md](docs/roadmap.md). The plan for the current work is in `docs/plans/` (status.md links it); read it before starting, since its standing rules and decisions apply. Phase 3's [plan](docs/plans/phase-3-server.md) holds the standing rules in full.
- **How the code is put together:** [docs/architecture.md](docs/architecture.md), each folder and the conventions.
- **Decisions:** the ADRs in [docs/adr/](docs/adr/README.md), with which work added which at the end of the index.
- **The design:** `docs/brand/`, `docs/design-language/`, the specs in `docs/product/` and the prototypes in `design/prototypes` (the build reference).

## Now

Phase 4, the one client platform ([plan](docs/plans/one-client-platform.md)): part D3 (the rest of the admin on the library, and TanStack Virtual's core as the library's virtualizer) is built and waits for the owner's review ([its plan](docs/plans/one-client-platform-d.md)). Work now lands on `next`, with CI by branch ([its plan](docs/plans/next-branch.md), built and waiting for review). Next: the [one compose file](docs/plans/one-compose-file.md) follow-up, then part E. Keep this section to a few lines; the history goes in docs/status.md.

## Rules from the owner

The plan's standing rules in short; Phase 3's plan has the full text.

- **Gated work.** Stop at each checkpoint, report, and ask for review before moving on.
- **Decisions rest on official documentation, not experiments.** Choose libraries, settings and patterns from the docs and established practice, and cite them (ADR, code comment or checkpoint report). Experiments only confirm what the docs say. When something misbehaves, find the documented cause before working around it.
- **Git:** commit only when the owner asks; never push unless asked; **no attribution or co-author lines** in commit messages; match earlier commits (an imperative subject, then a bulleted body). Work lands on `next`, and `main` changes only through the owner's merge of `next` (which deploys docs.highsea.tv). Never tag, publish an image or run the release workflow without the owner's separate word.
- **SPDX header on every source file:** `// SPDX-License-Identifier: AGPL-3.0-only` (`/* … */` in CSS, `#` in shell and YAML). `'use client'` goes above it.
- **Dependencies:** exact versions released at least two weeks ago (`bun run pin <pkg>`), licences compatible with AGPL-3.0 (`bun run licenses`; exceptions with a reason in `scripts/license-exceptions.json`). The `add-dependency` skill has the steps.
- **Locked:** design system v1.0 and the signed-off prototypes. The admin UI matches its prototype; list any change real data forces in the checkpoint report. Token values, design-language rules and locked layouts change only with the owner's approval.
- **One place for everything:** every client and its prototype draw from one React Native library (`bun run one-place` checks it).
- **Internal and public docs are separate.** Internal docs (the roadmap, plans, ADRs, specs, brand, prototypes) stay in `docs/` and `design/` and are never published. Public guides live only in `apps/docs/content/`, served at `docs.highsea.tv`. Neither copies the other.
- **No network in tests,** and no secrets in fixtures. Never open, read or print `.env.local` or `~/.tauri`.
- **Unknowns:** use your judgement and list each call in the checkpoint report.
- **Copy** follows [docs/brand/brief.md § 6](docs/brand/brief.md#6-voice-and-tone): plain, calm, specific, no exclamation marks.
- **This file stays slim.** Progress, plans and history go in docs/status.md and the plans, never here.

## Commands

```sh
bun install
bun run lint            # Biome
bun run typecheck       # every workspace, plus scripts/
bun run test            # everything (Bun's runner, each file isolated; never a bare `bun test`)
bun run smoke           # the platform under Node, as production runs it
bun run one-place       # fails when a component, screen or value is defined in two places

bun run server          # the server in development, http://localhost:3000 (data in .dev/)
bun run web             # the client's Expo dev server, http://localhost:3200/, proxying to bun run server
bun run prototypes      # the prototypes, http://localhost:4500
bun run docs            # the guides (apps/docs), http://localhost:3100
bun run --cwd apps/desktop dev   # the desktop app; checks add --config '{"identifier":"tv.highsea.desktop.test"}'
bun run --cwd apps/client ios    # the client on the iPhone simulator (`tv` for the Apple TV)

bun run pin hono zod    # versions old enough to pin
bun run licenses        # the licence audit
bun run audit           # the dependency check (exceptions in scripts/audit-exceptions.json)
```

The server's development switches (`HIGHSEA_TMDB_REPLAY=1`, `HIGHSEA_TORRENT_OFFLINE=1`, `HIGHSEA_SUBTITLES_FAKE=1`, `HIGHSEA_LISTS_FAKE=1`, `HIGHSEA_PLAYBACK_TRY=1`, `HIGHSEA_HARDWARE_NONE=1`), the image, release and packaging commands are in [docs/architecture.md § Commands](docs/architecture.md#commands). The browser and simulator sweeps are in [scripts/sweeps/README.md](scripts/sweeps/README.md); the `checks` skill says which to run when.

## Skills

The repeated workflows are project skills in `.claude/skills/`: the gate loop (`/scope`, `/questions`, `/checkpoint-report`, and `/signoff`, owner-only, which commits and pushes), `/checks` (quick, scoped or full, under Node 26.11.1), `/guide`, `/adr`, `/add-dependency`, `/port-screen`, `/handoff` and `/avatars`. When a rule here changes, update the skill that repeats it.

## Where the code is

`apps/server` (the server: Hono's `/api` and Next for the admin), `apps/client` (the one client: phone, TV and web on Expo), `apps/desktop` (Tauri around the client), `apps/docs` (the public guides), `apps/packages` (the Synology package source), `packages/*` (the platform, the domains, `@highsea-tv/ui`, `@highsea-tv/admin`, the contract and SDK), `design/prototypes`, `templates/` (NAS and store listings), `scripts/`. [docs/architecture.md](docs/architecture.md) has each one and the conventions: packages export raw TypeScript; the admin reads and writes through the public API; routes live in `@highsea-tv/api-contract` (run `bun run openapi` in `apps/server` after changing it); database changes go through `bun run generate` in `packages/db`; jobs are safe to repeat; strings go in `@highsea-tv/i18n`.

## Things that are easy to trip on

- **Node 26.11.1** (`.nvmrc`) everywhere. A Mac's Homebrew `node` is another version: put `$HOME/.nvm/versions/node/v26.11.1/bin` first on the PATH. `better-sqlite3` is built for one Node, so reinstall after switching (`rm -rf node_modules && bun install`). Change `.nvmrc`, the Dockerfile's `FROM` lines and `engines` together.
- **`bun test` on its own** runs every file in one process, so a DOM test's `fetch` leaks into the server tests. Use `bun run test`.
- **Next's dev server** serves its dev scripts to `localhost` only: browse `localhost`, not `127.0.0.1`.
- **Hono** can't add routes after the app has handled a request: register test routes first.
- **Next.js:** a custom server can't use `output: 'standalone'`; set your own headers before calling Next's handler; hosts that draw the library build with `--webpack`.
- **ffmpeg** is needed by the subtitle sync and playback tests; without it they skip and say so.
- **Docker behind a TLS-inspecting proxy:** `docker build --secret id=ca,src=/path/ca.crt .`
- **Tailwind** is left only in the guides and the prototypes' own chrome; everything else draws with the library's React Native parts.
