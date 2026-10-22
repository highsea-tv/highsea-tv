# Phase 3, checkpoint 9: release and sign-off

- **Status:** Scoped on 2026-10-22, before building. The owner answered every question the same day ([The owner's answers](#the-owners-answers)), so the scope is approved.
- **Gate:** stop when each part is built ([question 1](#open-questions-for-the-owner) recommends 9a, 9b and 9c). Report what was built, the judgement calls, screenshots and the check results, then ask for review. Nothing is published at any gate unless the owner says so ([question 2](#open-questions-for-the-owner)). Checkpoint 9 ends with the **Phase 3 sign-off**. Phase 4 starts only after it.
- **Parent plan:** [phase-3-server.md](phase-3-server.md). Its standing rules, architecture and decisions all apply, in particular:
  - decision 1: every [M1] item stays in milestone 1;
  - decision 5: GitHub Pages for the catalog's channels and GHCR for the images, both on this repository, and nothing published until the owner says so. The owner changed where on 2026-10-22: the repository, its packages and its images move to the `highsea-tv` organisation ([The owner's changes](#the-owners-changes));
  - the exit criteria, which this checkpoint is the last chance to meet.

  This document settles what that plan's checkpoint 9 item, its exit criteria, "ADRs to write" item 8 and the roadmap leave open. It also gathers what earlier checkpoints deferred to this one.

## Read first

- **The parent plan:**
  - checkpoint 9's outline;
  - the [exit criteria](phase-3-server.md#exit-criteria), all nine;
  - Testing ("End to end", "CI").
- **The roadmap:**
  - [M1] Release engineering;
  - [M1] User-facing docs;
  - the Docker section;
  - Phase 3 build order step 12.
- **The deferrals this checkpoint inherits:**
  - checkpoint 6: the end-to-end run under Docker with Playwright, which so far runs in-process ([phase-3-checkpoint-6.md](phase-3-checkpoint-6.md) › Tests);
  - checkpoint 8: the catalog's `releases` entries for System › Updates (its answer 11, [ADR 0047](../adr/0047-operations.md) › Updates), and publishing release notes, catalog channels and images (its "Out of scope").
- **The ADRs:**
  - [ADR 0003](../adr/0003-server-runtime-custom-entry.md): the custom server, so no `output: 'standalone'`;
  - [ADR 0020](../adr/0020-discovery-port.md): UDP 7368 and mDNS, which need host networking;
  - [ADR 0034](../adr/0034-catalog-service-and-signing.md): channels, signing, the publish step that's switched off;
  - [ADR 0037](../adr/0037-the-torrent-engine-as-built.md): 6881;
  - [ADR 0041](../adr/0041-migration-importers.md): what the migration guide describes;
  - [ADR 0042](../adr/0042-vpn-connections.md): `NET_ADMIN`, `/dev/net/tun`, gluetun;
  - [ADR 0047](../adr/0047-operations.md): Updates, backups and the restore's exit code 75.
- **The repo's packaging today:**
  - `Dockerfile`, `docker/entrypoint.sh` and `docker/NOTICE`;
  - `compose.yaml`, `compose.gluetun.yaml` and `compose.connects.yaml`;
  - `.github/workflows/ci.yml` and `catalog.yml`;
  - `scripts/sweeps/`.

## Goal

Someone with a NAS and no knowledge of how highsea is built:
- finds an install guide for their box;
- pulls a signed, multi-arch image;
- starts it with a compose file or their NAS's own template;
- follows the setup wizard to a working dashboard.

When a new version comes out, System › Updates says so, with its notes, and the guide says how to pull it. Someone coming from Radarr and qBittorrent has a guide that takes them across. CI proves the whole path, from setup to a synced subtitle, against the container itself. The owner reviews every admin screen beside its prototype and signs off Phase 3.

## Out of scope

- **Clients, playback and transcoding:** Phase 4. `/stream` and `/ws` stay reserved.
- **Hardware acceleration and `/dev/dri` passthrough:** they come with transcoding.
- **A hosted docs site.** Docs stay in `docs/` ([question 8](#open-questions-for-the-owner)).
- **Self-updating containers** (Watchtower-style). Installing stays Docker's job (ADR 0047).
- **Publishing to app stores** (Unraid's Community Applications, the TrueNAS catalog). This is written and dry-run here, and submitted only on the owner's word ([question 2](#open-questions-for-the-owner), [question 7](#open-questions-for-the-owner)).
- **The follow-ups already scheduled after Phase 3:** dashboard customization and local AI research.

## Where things stand

A survey of the repository on 2026-10-22.

**Docker** (`Dockerfile`, `docker/`):

- **Already met.** Most of the roadmap's Docker list is in place since checkpoints 1 and 6b:
  - a multi-stage build on `node:24.21.0-bookworm-slim`, with Bun copied in to install;
  - ffmpeg, `unar`, tini, gosu, wireguard-tools, iproute2 and wireguard-go;
  - PUID and PGID through the entrypoint, which keeps `CAP_NET_ADMIN` via `setpriv` when the container has it;
  - `/config` and `/data` volumes;
  - ports 3000, 6881/tcp+udp and 7368/udp;
  - a `HEALTHCHECK` on `/api/health`;
  - build secrets for the OpenSubtitles.com key and the Trakt application.
- **Not yet met:**
  - **The image isn't slim.** The runtime stage copies the whole workspace (`COPY --from=build /app /app`): every package's sources and tests, the prototypes (24 MB in `design/`), test fixtures, and every dependency, dev ones included (`node_modules` is about 1 GB locally). The Dockerfile's own comment says "Checkpoint 9 slims it and builds it for amd64 and arm64."
  - **No OCI labels**, so a package pushed to GHCR wouldn't be linked to the repository or show its licence.
  - **amd64 only.** CI's `docker` job builds and boots one platform.
- **Compose files.** `compose.yaml` (host networking), `compose.gluetun.yaml` and `compose.connects.yaml` exist, but all three use `build: .` and `image: highsea:dev`, so they assume a checkout. None of them pulls a published image.

**CI** (`.github/workflows/`):

- **`ci.yml`:**
  - `check`: lint, typecheck, the tests with ffmpeg and `unar`, the Node smoke test, the licence audit and the admin's build;
  - `leak`: the VPN kill switch on the runner's kernel;
  - `docker`: an amd64 build that must boot healthy and answer `/` and `/api/health`.
- **`catalog.yml`:** validates, licence-checks, builds and signs both channels. Its `publish` job (GitHub Pages) is written and switched off (`if: false`).
- **Missing:**
  - no release workflow;
  - no image push;
  - no arm64 build;
  - no end-to-end run against the container;
  - nothing implements the exit criteria's "dependency check".

**Tests:**

- **100k scale:** four tests seed 100,000 movies.
  - `packages/db/test/library-scale.test.ts`: query plans on indexes, by `EXPLAIN QUERY PLAN`;
  - `packages/media/test/movies/scale.test.ts`: the library service, with a 60 ms budget a call;
  - `packages/subtitles/test/movies/scale.test.ts`: Wanted and stats;
  - `packages/runtime/test/collections-scale.test.ts`: smart collections, with 600 ms warm.

  Not covered at 100k:
  - the queue and history;
  - Wanted's missing and cutoff pages;
  - the calendar and its iCal feed;
  - curation's home resolution for many people;
  - the import lists' sync;
  - the backup of a large database.
- **End to end:**
  - `apps/server/test/sintel-e2e.test.ts` runs the roadmap's run in-process: add *Sintel*, grab it from the fake indexer through a loopback tracker, follow it over SSE, see the file land and the subtitle synced.
  - It doesn't go through the container, the browser, the setup wizard or a signed catalog.
  - The exit criteria's two extras aren't tested end to end: layouts and themes persisting across sessions, and a role-targeted announcement.
- **Sweeps:**
  - `scripts/sweeps/server.ts` covers every admin route the server has: 60-odd paths and their dialogs, in three themes, from 1440 to 390, at 200% text, with reduced motion and the keyboard.
  - It runs against `next dev`, not the production build.
  - Nothing compares a server page with its prototype; that has been the owner's eye at each gate.

**Release:**

- **Versions:** `apps/server` is `0.1.0` (the version the runtime reports and `/metrics` labels). The design-system packages say `1.0.0`, and the other packages have no version.
- **History:** no git tags, no `CHANGELOG.md`.
- **Release news:**
  - The catalog's `releaseSchema` (`packages/catalog/src/format.ts`) and its builder (`releasesOf`, which reads `catalog/indexers/releases.json`) are ready, but no `releases.json` exists.
  - The release key (`HIGHSEA_CATALOG_KEY`, `HIGHSEA_CATALOG_KEY_ID`) hasn't been created, so every channel is signed with the development key in `catalog/keys/`.

**User docs:**

- `docs/` holds the roadmap, plans, ADRs, product specs, brand and design language. No install, upgrade, migration or recommended-setup guide exists.
- `README.md`:
  - says Phase 3 is "under way" and that nothing is usable as a product yet;
  - lists a `cloud/` folder that doesn't exist;
  - has no install section.

**Other things found:**

- **Secrets in a public image.**
  - The release build bakes highsea's OpenSubtitles.com key and Trakt application into the image as files. Anyone who pulls a public image can read them.
  - That is how native and distributed apps work: OAuth's guidance says their secrets can't be kept confidential ([RFC 8252 § 8.5](https://www.rfc-editor.org/rfc/rfc8252#section-8.5)).
  - The owner should know before the first push ([question 9](#open-questions-for-the-owner)).
- **Node 24 entered maintenance on 2026-10-20.** Its end of life is 2028-04-30, and Node 26 becomes Active LTS on 2026-10-28 ([nodejs/Release](https://github.com/nodejs/Release)) ([question 10](#open-questions-for-the-owner)).
- **One leftover:** `LaterArea` in `apps/server/src/admin/settings.tsx`. Every settings area now has its own page except Subtitles, whose nav entry goes to `/subtitles`. So the catch-all `settings/[area]` page shows "later" only at `/settings/subtitles`, typed by hand. That path should redirect to `/subtitles`, and `LaterArea` and its strings can go.

## The size of this checkpoint, and its parts

[Question 1](#open-questions-for-the-owner) recommends three gated parts. The rest of this document marks each piece **(9a)**, **(9b)** or **(9c)**.

- **9a, packaging and CI:**
  - first, the move to the `highsea-tv` organisation and the `@highsea-tv/` package scope;
  - the slim image;
  - the image built for amd64 and arm64;
  - its labels and attestations;
  - the compose files on a published image name;
  - the end-to-end run in CI through the container;
  - the dependency check;
  - the missing 100k cases.
- **9b, releasing and docs:**
  - the version scheme and ADR 0050;
  - the changelog;
  - the release workflow, run dry;
  - `releases.json` and the release key's handling;
  - the NAS templates;
  - every user guide.
- **9c, the full review and sign-off:**
  - every admin screen beside its prototype;
  - the sweeps against the production image;
  - the list of what Phase 3 leaves behind;
  - the roadmap and READMEs;
  - the Phase 3 sign-off;
  - then, on the owner's word, the first publish.

## Progress

- **2026-10-22, 9a's first part, done:**
  - **The organisation.** The owner transferred the repository to `highsea-tv/highsea-tv`, and `origin` points there. The repository had no secrets to carry over.
  - **The package scope.** Every package and reference moved from `@highsea/` to `@highsea-tv/`: 711 files, plus `bun.lock` regenerated and 10 files reformatted by Biome. ADRs keep the old names, with a dated note in ADR 0036. Checks after the rename, under Node 24.21: lint and typecheck clean; tests 10,604 pass, 6 skip, 0 fail; smoke ok; licences ok; the server sweep and the prototype pages and D-pad sweeps clean. The keyboard sweep's first run reported a hidden focus stop on `/web/settings/devices` (1440) and `/web/settings/home` (390); a re-run was clean, so it's flaky, and 9c's full sweeps watch for it again.
  - **Trakt.** The owner registered highsea's application on Trakt's new portal as Production, with the redirect URI `https://api.highsea.tv/oauth/trakt`. Trakt issued a Client ID and no secret; the ID is in the owner's `.env.local`.
    - The client now signs in on `auth.trakt.tv`, sends the secret only when a build has one, and refreshes with the registered redirect.
    - The fake enforces all three, and a test covers an application with only a Client ID (ADR 0045's dated section).
    - Not yet confirmed against the real Trakt: connecting an account by hand with `bun run server` does that.
  - **Domains.** See the table below.
- **2026-10-22, the rest of 9a, built, and signed off by the owner the same day** (with the toast-label fix in ui-web):
  - **The slim image** (ADR 0003's 9a amendment). `scripts/image.ts production` installs the server's production dependencies into a clean folder and fails on any package nothing asks for, a workspace left without its install, or a `.env` file in the context. It then copies only what `node server.ts` loads. Packages built for musl are pruned, since Bun installs them beside the glibc ones (147 MB on arm64). Sizes: **amd64 1,907 MB, arm64 1,836 MB**, with 30 workspaces as source. CI's budget is 2,000 MB, about 5% above amd64.
  - **Labels and attestations.** The Dockerfile sets the OCI labels GitHub reads: source, description (under 512 characters) and licenses, plus title, documentation, vendor and version. CI adds revision and created. CI also exports each platform as an OCI layout with provenance (`mode=min`) and an SPDX SBOM, and `scripts/image.ts attestations` checks both and the labels. Nothing is pushed.
  - **Both platforms in CI on native runners:** `ubuntu-24.04` and `ubuntu-24.04-arm`, each with its own cache. Each must boot healthy, stay within the budget and pass the attestation check. Every action in `ci.yml`, `e2e.yml` and `catalog.yml` is pinned to a full commit SHA, with its version named in a comment.
  - **Compose:**
    - `compose.yaml` (host networking), `compose.bridge.yaml` (new), `compose.gluetun.yaml` and `compose.connects.yaml`, all on `ghcr.io/highsea-tv/highsea:latest`;
    - a checkout's build in `compose.dev.yaml`;
    - the NAS templates in `templates/` (Unraid's XML, and compose files for TrueNAS's "Install via YAML" and Synology's Container Manager), written in 9a with the compose files. Their guides stay in 9b.
  - **The end-to-end run through the container** (`scripts/e2e/run.ts`, `compose.e2e.yaml`, `.github/workflows/e2e.yml`). Playwright drives the production image through:
    - setup, with the fixtures' catalog and its test indexer ticked in one click;
    - adding Sintel from Discover and grabbing it from Interactive search;
    - Activity until seeding, the hardlinked file and History;
    - the `.en.srt` marked Synced;
    - a custom theme and a dashboard layout surviving sign-out and a second browser;
    - an announcement for Admins that an Admin sees and a User doesn't.

    The server is on an `internal` network, and the run checks it can't reach out. The fixtures service holds the fake indexer, the tracker and its seeder, the signed catalog, TMDB's recordings and the subtitle fakes. The image ships without fakes, so `HIGHSEA_FIXTURES_URL` sends the server's outside requests to the fixtures (ADR 0003's amendment). It passed against both images on 2026-10-22, amd64 under emulation and arm64 natively. Apart from waiting about 58 s for the catalog's first check after boot, the steps took 47 s on amd64 and 36 s on arm64.
  - **The dependency check.** `bun run audit` (`scripts/audit.ts`) runs `bun audit` on production dependencies and fails on high or critical advisories, with dated exceptions in `scripts/audit-exceptions.json`. It found three advisories in Next 16.3.8, excepted until 2026-10-28, when 16.4.1 is two weeks old.
  - **100k:** queue and history, Wanted's missing and cutoff lists, the calendar and its iCal feed, home for 50 people, a list sync against the full library, and a backup that's verified. Every case is inside its budget (the gate report has the numbers). Two queries that scanned now use indexes (migration 0013): the queue's partial index, and `movie_terms` on `lower(label)` for the home rows and curation.
  - **Found and fixed along the way:**
    - `.env*` files were missing from `.dockerignore`, so a local build's context could carry `.env.local` into the build cache. Nothing was pushed, and the local cache was cleared.
    - ui-web's `Toaster` gave Radix's provider the region's label, so every toast was announced as "Notifications ({hotkey}) …". The provider now has its own label, "Notification", and the region keeps the one with the hotkey.
- **Left open at 9a's sign-off:**
  - Next's three advisories: the exceptions run out on 2026-10-28, when 16.4.1 can be pinned;
  - the dashboard showing its default layout while the saved one loads (`dashboard.tsx`), in the locked admin;
  - home at about 515 ms a person at 100k, inside its budget, with caching the shared genre rows as an option;
  - the Unraid template's icon and template links, which work once the repository is public.
- **Next:** 9b, from [Release](#release-9b) on.

## highsea's domains

From the owner's decision of 2026-10-22. The owner owns `highsea.tv`. Its root is kept for a marketing page, and each subdomain is named for what it does, added only when it's needed:

| Address | What | When |
| --- | --- | --- |
| `highsea.tv` | The marketing page | Later; not part of milestone 1 |
| `docs.highsea.tv` | The public documentation site (`apps/docs`), on Vercel; `wiki.highsea.tv` redirects to it | 9b; deployed at the first publish |
| `catalog.highsea.tv` | The signed catalog's `stable` and `beta` channels, on GitHub Pages | 9b; deployed at the first publish |
| `api.highsea.tv` | Machine-facing services. Today it holds only Trakt's registered redirect, `https://api.highsea.tv/oauth/trakt`, which the device flow never visits. Later it holds the relay, push and the metadata proxy | Registered with Trakt on 2026-10-22; nothing is served yet |
| `app.highsea.tv` | Kept free for a hosted web client and accounts | Phase 4 |

## The organisation and the package scope (9a, first)

From [the owner's changes](#the-owners-changes) of 2026-10-22. Done first in 9a, so every later piece is built under the final names.

- **The repository moves to the `highsea-tv` organisation** by GitHub's transfer, which keeps issues, pull requests, stars and history, and redirects the old web and git addresses ([GitHub: transferring a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)).
  - The owner does the transfer: it needs admin rights on both accounts and is theirs to make.
  - After it, `origin` is set to `https://github.com/highsea-tv/highsea-tv.git`. The redirect keeps working, but GitHub's docs advise updating remotes.
  - Actions, environments and secrets travel with the repository. On 2026-10-22, after the transfer, the repository had none: all work so far has been local. The secrets are added in 9b, when the release workflow needs them: `HIGHSEA_OPENSUBTITLES_KEY` (in the owner's `.env.local` today), Trakt's client ID and secret once highsea's application is registered, and the release key in the `release` environment. Without `HIGHSEA_CATALOG_KEY`, builds sign with the development key, as they do locally.
- **Images:** `ghcr.io/highsea-tv/highsea` ([question 3](#open-questions-for-the-owner)). The organisation's package settings must allow public packages and let this repository's workflows write them ([GitHub: configuring a package's access control](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)).
- **The catalog's channels:** GitHub Pages on the organisation's repository, served on the custom domain `catalog.highsea.tv` ([GitHub: custom domains for Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)), at `https://catalog.highsea.tv/{stable,beta}/`. Because servers know the address and not the host, the channels can move hosts later without a release. The runtime gets this as its default channel address; today it has none and needs `HIGHSEA_CATALOG_URL`.
- **The package scope: `@highsea/` becomes `@highsea-tv/`** in all 33 workspace packages.
  - What changes: every `name`, dependency and import, `bun.lock`, tsconfig paths, Biome and script globs, the sweeps, CLAUDE.md, the README, and the docs.
  - The ADRs keep their text as written, with a dated note in ADR 0036, which set the subpath convention. They are a record of what was decided at the time.
  - Not changed: the email Content-IDs (`logo@highsea`), which are a domain-like suffix, not a package scope.
  - It's one mechanical commit with the full checks after it: lint, typecheck, tests, smoke and the sweeps.
  - The packages stay private. Publishing to npm (for example the SDK, for third-party apps) would need an `@highsea-tv` organisation on npm. That isn't part of milestone 1, so it waits for Phase 4.

## Docker (9a)

**The build**, from Docker's [multi-stage builds](https://docs.docker.com/build/building/multi-stage/):

1. **Dependencies:** `bun install --frozen-lockfile` for the whole workspace, still built against Node 24.21.0, so `better-sqlite3` matches the Node that runs it.
2. **Build:** `apps/server`'s Next build.
3. **Production dependencies:** a separate `bun install --production --filter @highsea/server…` into a clean folder. `--production` omits dev dependencies and `--filter` limits the install to some workspaces ([bun install](https://bun.com/docs/pm/cli/install)). Bun's docs don't say how the two combine, so the build confirms the result: it fails if a dev-only package is in the final tree.
4. **Runtime:** copies only what `node server.ts` loads:
   - the server's built `.next` and `server.ts`;
   - the workspace packages it imports, as source, since packages export raw TypeScript run with type stripping, without their `test/` folders;
   - the production `node_modules`;
   - `docker/`.

   `design/`, `docs/`, `scripts/`, storybook and the fixtures stay out. A check in CI lists the image's largest folders, and fails above a size budget set from the first slim build.

**Not root by default.**
- The entrypoint already runs the server as PUID:PGID, LinuxServer.io's convention ([Understanding PUID and PGID](https://docs.linuxserver.io/general/understanding-puid-and-pgid/)), and stays root only for PUID=0.
- It keeps `CAP_NET_ADMIN` only when the container was given it (ADR 0042).
- The guides say which setups need `cap_add: [NET_ADMIN]` and `/dev/net/tun`: highsea connects, or a gluetun sidecar on gluetun's side. Every other setup needs neither.

**tini stays the init.** It reaps zombies and forwards signals ([krallin/tini](https://github.com/krallin/tini)). This matters with ffmpeg, `unar` and `wg` running as child processes. The guides don't add `--init`, which would run a second init ([docker run --init](https://docs.docker.com/reference/cli/docker/container/run/#init)).

**The healthcheck stays on `/api/health`** ([HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck)). It already uses `--start-interval`.

A restore exits with code 75 so Docker restarts the container (ADR 0047). The compose files keep `restart: unless-stopped`, and the guides say why.

**arm64.**
- `better-sqlite3` is a native addon. Built under QEMU emulation, its compile is slow and the slowest part of the image.
- Docker documents running each platform on its own runner, with Linux Arm on `ubuntu-24.04-arm`, through its GitHub Builder reusable workflows ([Docker: multi-platform with GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/)). **Recommended:** follow that, since the repository is public.
- The arm64 image must boot healthy in CI on the arm runner, as amd64 does now.

## Images (9a)

- **Where:** GHCR under the `highsea-tv` organisation, linked to its repository (decision 5, as the owner changed it). The name is [question 3](#open-questions-for-the-owner).
- **Authentication:** `GITHUB_TOKEN`, which links the package to the workflow's repository. A new package is private until made public ([GitHub: the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)). Making it public is part of the first publish.
- **Labels:** the [OCI annotations](https://github.com/opencontainers/image-spec/blob/main/annotations.md) GitHub reads:
  - `org.opencontainers.image.source`;
  - `org.opencontainers.image.description` (up to 512 characters);
  - `org.opencontainers.image.licenses` (`AGPL-3.0-only`).

  Also `version`, `revision` and `created`, set by `docker/metadata-action` from the tag.
- **Attestations:** BuildKit adds minimal provenance attestations by default; SBOMs are opt-in ([Docker: build attestations](https://docs.docker.com/build/metadata/attestations/)). **Recommended:** keep the default provenance and opt in to the SBOM, which costs nothing at run time and helps NAS users check what they run.
- **Tags:** see [Release](#release-9b).
- **Before the owner's word:** CI builds both platforms on every change to `main` and pushes nothing. The release workflow has a dry-run mode that does everything except push ([question 2](#open-questions-for-the-owner)).

## Compose examples (9a)

Three files, each on the published image, each with the ports ADR 0020 and ADR 0037 list:

- **`compose.yaml`:** host networking, so LAN discovery (UDP 7368 and mDNS) works. This is the recommended setup on Linux.
- **`compose.bridge.yaml`** (new): published ports for Docker Desktop and NAS setups where host networking isn't available. It explains that only the broadcast half of discovery works this way.
- **`compose.gluetun.yaml`:** torrents behind gluetun.
- **`compose.connects.yaml`:** highsea's own WireGuard tunnel.

Each file keeps one `/data` root, so imports can hardlink, and says what to change. A checkout's development build moves to `compose.dev.yaml`, so the published files never say `build: .`.

## NAS templates (9b)

| NAS | The documented route | Recommended |
| --- | --- | --- |
| **Unraid** | A template XML (`<Container version="2">`) in a public repository listed with Community Applications, with a `ca_profile.xml`, validated and scanned at [ca.unraid.net/submit](https://ca.unraid.net/submit). The [template docs](https://ca.unraid.net/submit/help/repository-xml) list `Repository`, `Name`, `Overview`, `Network`, `WebUI`, `Category` and `TemplateURL`. Paths, ports and variables are in a generated field reference the page links to, not on the page itself. | `templates/unraid/highsea.xml` in this repository, plus a manual install path (copied into `templates-user/`) in the guide. Submitting to Community Applications is a publish ([question 7](#open-questions-for-the-owner)). |
| **TrueNAS** (24.10 and later, Docker-based apps) | Two routes. The official catalog takes apps by feature request, then a pull request to `truenas/apps` ([Contributing to Apps](https://apps.truenas.com/getting-started/contributing-to-apps)). "Install via YAML" opens a Docker Compose editor for a custom app ([TrueNAS 25.04: Install Custom App screens](https://www.truenas.com/docs/scale/25.04/scaleuireference/apps/installcustomappscreens/)). The 24.10 page is archived. | A compose file for "Install via YAML" in the TrueNAS guide. The catalog request waits until highsea has users who'd vote for it. |
| **Synology** (DSM 7.2 and later) | Container Manager's **Project** runs a Compose file from a folder on the NAS ([Synology: Container Manager](https://www.synology.com/en-us/dsm/feature/docker)). The Knowledge Center's Project article didn't render for this survey, so the guide's steps are confirmed against DSM itself at build and noted if they differ. | A compose file plus a guide with screenshots of the Project steps. Synology has no host networking in the Project UI, so the guide uses the bridge file and explains discovery. |

## Tests (9a)

**The end-to-end run in CI** is the exit criteria's run, done the way the parent plan says: Playwright against the container.

- **What it drives:** the production image, started by `compose.e2e.yaml` beside a fixtures service. The fixtures service is a small Bun program holding:
  - the fake indexer;
  - a loopback tracker with a seeding engine and the Sintel clip;
  - a locally signed catalog (the development key);
  - the subtitle fakes.

  The server runs with `HIGHSEA_TMDB_REPLAY=1`, `HIGHSEA_SUBTITLES_FAKE=1` and `HIGHSEA_CATALOG_URL` pointing at the fixtures. Nothing leaves the Docker network. These are the harnesses `scripts/sweeps/server.ts` and `sintel-e2e.test.ts` already use, moved behind a network port.
- **Through the browser, not just the API.** Playwright's library is already a dev dependency (`playwright-core`, used by the sweeps). The run goes through:
  1. the setup wizard;
  2. one-click adding the fake indexer from the catalog;
  3. adding and grabbing *Sintel (2010)*;
  4. watching progress on Activity;
  5. checking `/data/media/movies/Sintel (2010)/…` and History through `docker exec`;
  6. finding the `.en.srt` marked synced.

  Then the two extras:
  - a custom theme and a dashboard layout survive signing out and in, and another browser;
  - an announcement for Admins shows to an Admin and not to a User.
- **When it runs:** on `main` and on pull requests that touch the server, as the parent plan says. It runs on amd64 only; arm64 boots healthy and runs the smoke test.

**The dependency check** is the exit criteria's item 8. **Recommended:** `bun audit --prod --audit-level=high` in CI, which checks the lockfile against npm's advisory database and fails on high or critical advisories ([bun audit](https://bun.com/docs/pm/cli/audit)). An advisory that doesn't apply is ignored by its GHSA id with a reason, as licence exceptions are.

**100k:** the scale tests gain the cases listed under Where things stand:
- the queue and history pages;
- Wanted's two lists;
- the calendar's month and iCal feed;
- home resolution for 50 people;
- a list sync that matches against a full library;
- a backup of a 100k database, which must finish and verify.

Each gets an `EXPLAIN QUERY PLAN` check where it's a query, as the library's test does.

## Release (9b)

**Versions** follow [Semantic Versioning 2.0.0](https://semver.org/), as ADR 0047's comparison already does ([question 4](#open-questions-for-the-owner)):

- **One version for highsea:** `apps/server`'s `version`. That's what the runtime reports, the image is tagged with, and the changelog and the catalog's `releases` name.
- **Packages:** the workspace packages aren't released on their own, so they stay unversioned. The design system's `1.0.0` is the design system's version and is left alone.
- **Pre-releases:** a beta is a SemVer pre-release (`0.2.0-beta.1`), which sorts before `0.2.0` by § 11.

**Channels:**

| Channel | Who gets it | Image tags | Catalog |
| --- | --- | --- | --- |
| **Stable** | everyone by default | `0.1.0`, `0.1`, `latest` | `stable`, with every stable release |
| **Beta** | servers set to Beta in Settings › General | `0.2.0-beta.1`, `beta` (the newest release of either kind) | `beta`, which also lists stable releases (ADR 0047) |

No `edge` or nightly tag.

**The changelog:** `CHANGELOG.md` at the root in the [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format:
- an `Unreleased` section moved under a version and date at release;
- the groups Added, Changed, Deprecated, Removed, Fixed and Security;
- written for owners, not as a commit log;
- voice per the brand brief.

Conventional Commits aren't needed: the changelog is written, not generated, and the commit style stays the owner's.

**The release workflow**, `release.yml`, run by hand with a version and a dry-run switch:
1. checks that the version is newer than the last tag and that `CHANGELOG.md` has its section;
2. runs the full CI, the end-to-end run and the dependency check;
3. builds both platforms with labels, provenance and an SBOM;
4. writes the `releases.json` entry from the changelog section (its notes cut to the schema's 50 lines of 300 characters, with a link to the full section);
5. builds and signs the catalog with the release key;
6. if not a dry run, and only then:
   - tags `v0.1.0`;
   - pushes the images;
   - deploys the catalog's Pages channels;
   - creates the GitHub release with the changelog section.

The dry run uploads everything as workflow artifacts instead.

**The release key** ([question 5](#open-questions-for-the-owner)):
- The owner generates it offline. Its public half goes into `catalog/keys/` and the server's trusted keys, through ADR 0034's rotation path.
- The private half and its id go into the repository's `release` environment as `HIGHSEA_CATALOG_KEY` and `HIGHSEA_CATALOG_KEY_ID`. They're never in the repo or in a fixture.
- The environment requires the owner's approval, so no workflow signs without them.

**In-app notices:** already built (ADR 0047). This checkpoint adds `catalog/indexers/releases.json` and its first entry, and a test that a server on `0.1.0` sees `0.1.1` from a locally signed catalog and announces it once.

**ADR 0050, release and versioning:**
- the scheme;
- the channels and their mapping to tags and catalog channels;
- the changelog;
- the workflow;
- the key handling;
- what "publish" means under decision 5.

## Docs (9b)

**Where they live** (the owner's answer to [question 8](#open-questions-for-the-owner), 2026-10-22): a dedicated documentation site, `apps/docs`, a Next.js app in this monorepo, served at `docs.highsea.tv` and hosted on Vercel. The owner owns `highsea.tv`.

- **The framework:** a Next.js documentation framework on the App Router, with pages in MDX and static output, so Vercel serves files and nothing runs per request. The two established ones:
  - [Fumadocs](https://fumadocs.dev/docs): a headless core, a UI layer and an MDX content source, so highsea's tokens and `ui-web` can style it;
  - [Nextra 4](https://nextra.site/docs): App Router only, with its own docs theme and built-in search.

  **Recommended:** Fumadocs ([question 11](#open-questions-for-the-owner)). Its headless core lets the site wear design system v1.0 rather than a theme of its own. In 9b, its version is pinned (`bun run pin`) and its licence audited, as every dependency is.
- **The pages:** the guides below, written as MDX in `apps/docs/content/`. The README, the image's labels and the NAS templates link to `docs.highsea.tv`.
- **Internal and public docs are kept apart** (the owner, 2026-10-22):
  - **Internal docs** define how highsea is structured and built: the roadmap, plans, ADRs, product specs, the brand and design language, prototypes and explorations. They're written for whoever builds highsea. They live in `docs/` and `design/`, and are never hosted (the standing rule).
  - **Public docs** are guides and instructions for setting highsea up and using it: installing, upgrading, migrating, configuring and everyday use. They're written for owners and the people on their servers. They live only in `apps/docs/content/` and are served at `docs.highsea.tv`.
  - **Neither is copied into the other.** A public guide explains in its own words, for its own readers; it doesn't reproduce a spec, an ADR or an architecture diagram. Linking from a public guide to the source on GitHub is fine, for people who want to look further.
  - **A change goes where its reader is.** A change to how something works updates the internal docs. If it changes what an owner does, the public guide is updated too, in the same change.
- **Its design:** a new screen, so it's designed before it's built ([question 12](#open-questions-for-the-owner)). **Recommended:** the framework's docs layout with highsea's tokens, type and brand, shown as screenshots at 9b's gate for approval. This is lighter than a full prototype, because the layout is the framework's established one.
- **Publishing:** deploying to Vercel, and pointing `docs.highsea.tv` at it, is part of the first publish ([question 2](#open-questions-for-the-owner)). Until then the site builds in CI and runs locally (`bun run docs`), with no project on Vercel.
  - When the owner gives the word, the owner (or Claude, with the owner's go-ahead) creates the Vercel project under the owner's team, linked to the `highsea-tv` repository with `apps/docs` as the root directory ([Vercel: monorepos](https://vercel.com/docs/monorepos)), and adds the domain ([Vercel: domains](https://vercel.com/docs/domains)).
  - Preview deployments for pull requests are Vercel's default. Whether they stay on is [question 13](#open-questions-for-the-owner).

The guides are written for owners, not developers. They're written for owners, not developers: plain, calm and specific, as the brand brief says. Each one is checked by following it on a clean machine, or on the NAS at build where one is to hand.

- `install-docker.md`:
  - compose with host networking, the bridge variant, and the ports;
  - one `/data` root, and why hardlinks matter;
  - PUID and PGID;
  - the first visit and the setup wizard;
  - backups and where `/config` lives.
- `install-unraid.md`, `install-synology.md` and `install-truenas.md`: each NAS's route from the table above, with screenshots.
- `upgrade.md`:
  - pulling a new image, and what System › Updates shows;
  - the automatic backup before a migration;
  - going back with a backup (ADR 0047);
  - what changes between channels.
- `migrate-from-radarr-and-qbittorrent.md` (ADR 0041, Settings › Migration):
  - what comes across and what doesn't;
  - the versions needed (Radarr API v3; qBittorrent WebUI 4.5.0 or later);
  - running both side by side before switching;
  - path mapping for a shared `/data`.
- `recommended-setup.md`: in the spirit of TRaSH's guides.
  - the folder layout;
  - one quality profile per screen size from the presets;
  - VPN choices;
  - subtitles with their sync;
  - indexers from the catalog;
  - lists;
  - notifications;
  - backups;
  - remote access with built-in TLS or a proxy.

`README.md` gains an Install section that links them, and its status line and layout table are corrected.

## The full review against the prototypes (9c)

Exit criterion 6 asks for every admin screen to match its prototype, with real data. The sweeps have kept the accessibility half green at each checkpoint. The matching half has been checked one checkpoint's screens at a time. This checkpoint does it once, for all of them:

- **A capture script**, `scripts/sweeps/compare.ts`:
  - for each row of the matrix below, opens the prototype's state and the server's equivalent at 1440 and 390, in the default theme;
  - saves them side by side in a scratch folder, not the repo;
  - writes a checklist in the same order.
- **The owner's review.** The owner reviews the pairs. Every difference is either:
  - a change real data forced, already listed in a checkpoint report (linked);
  - a new finding, fixed in 9c or recorded as a known difference with the owner's agreement.
- **Sweeps against the production image.** The sweeps run against the production image, not `next dev`. The dev-only false alarm in the sweeps' README goes away, and this is what owners will run.

| Screen | Prototype | Server routes | Built in |
| --- | --- | --- | --- |
| A1 Shell | `admin/shell.tsx` | every page | 2 |
| A18 Login | `admin/login.tsx` | `/login`, `/invite/[token]`, `/reset/[token]`, `/link` | 2, 8b |
| A2 Setup | `admin/setup/` | `/setup` | 2 to 7 |
| A3 Dashboard | `admin/dashboard/` | `/` | 3, 8c |
| A4 Discover | `admin/discover/` | `/discover` | 4 |
| A5 Movies | `admin/movies/library.tsx` | `/movies` | 4, 8c, 8d |
| A6 Movie detail | `admin/movies/` | `/movies/[id]`, `/people/[id]`, `/collections/[id]` (TMDB's) | 4, 6, 7 |
| A7 Activity | `admin/activity/` | `/activity` | 6 |
| A8 Downloads | `admin/downloads/` | `/downloads` | 6 |
| A9 Indexers | `admin/indexers/` | `/indexers` | 5 |
| A10 Subtitles | `admin/subtitles/` | `/subtitles` | 7 |
| A11 Curation | `admin/curation/` | `/curation`, `/curation/featured`, their editors | 8c |
| A12 Appearance | `admin/settings/` | `/settings/appearance` | 3 |
| A13 Users and devices | `admin/settings/` | `/settings/users` | 2 |
| A14 Wanted and calendar | `admin/wanted/` | `/wanted`, `/wanted/cutoff`, `/wanted/calendar` | 8a |
| A15 Settings | `admin/settings/` | every `/settings/*` area and editor | 4 to 8c |
| A16 System | `admin/system/` | `/system/*` | 8a, 8b |
| A17 Manual import | `admin/activity/` | `/activity/import` | 6 |
| A19 Collections | `admin/collections/` | `/collections`, `/collections/[id]` | 8d |

## Wrap-up (9c)

- **The roadmap:** Phase 3 marked signed off with its date, as for Phases 1 and 2. Each [M1] item gets its "As built" line where it doesn't have one.
- **The READMEs:** the root README's status, install section and layout. `docs/adr/README.md`'s index gets 0049 and 0050.
- **The leftover `LaterArea`** and its strings go; `/settings/subtitles` redirects to `/subtitles`.
- **What Phase 3 leaves behind**, for the owner to confirm at sign-off. Each was decided at its checkpoint; this gathers them in one place:
  - **Phase 4, by design:**
    - clients, playback, transcoding, and "playable" meaning more than "has a file" (ADR 0048, 0049);
    - Continue watching filled from watch positions;
    - recommendations from watch history;
    - push to phones and TVs;
    - watched and last-played rules, and personal collections (8d);
    - curation's preview drawn by the real clients (ADR 0048).
  - **Later iterations the owner kept open:** checkpoint 7's sync list:
    - caching each file's speech;
    - listening to the dialogue channel;
    - cuts through silence;
    - short subtitles;
    - measuring more films;
    - the slow torrent loopback test.
  - **Not [M1], left for later at their checkpoints:**
    - per-torrent limits and a scheduled alternative speed (6);
    - presets and sound packs through the catalog (5);
    - removing a movie when it leaves a list (8a);
    - content rating limits per user (admin access);
    - Letterboxd and IMDb only through tools that publish the generic list format (8a);
    - caching the apps' collection list if it grows slow (8d).
  - **[Later] in the roadmap:** requests, Usenet, TV series and other media types, and a plugin system.
  - **Scheduled after Phase 3:** dashboard customization (prototype first), and the local AI research.
- **The sign-off:** recorded in the roadmap, the parent plan and CLAUDE.md. Then the first publish, if the owner says so.

## ADRs

- **0050, release and versioning** (9b): above.
- **Dated sections where things change:**
  - ADR 0003 for the slim runtime stage, if its notes on the build need it;
  - ADR 0034 for the release key and the publish step turned on.

## Risks

- **arm64 runners.** Docker's docs name `ubuntu-24.04-arm` for Linux Arm. If it isn't available to this repository when 9a runs, the fallback is QEMU, which is slower but documented on the same page.
- **`better-sqlite3` and Node's support.**
  - The addon is built for one Node ABI.
  - Node 24's maintenance phase still ships security fixes until 2028-04-30, so 24.21.0 will need bumping within 24, which means a rebuild ([question 10](#open-questions-for-the-owner)).
- **NAS UIs change.** Synology's and TrueNAS's screens move between releases. Each guide names the version it was written against.
- **The end-to-end run's time.** A container build plus a browser run can take a long time. The run uses the image CI has just built, from its cache, and stays on `main` and on server pull requests only.

## Open questions for the owner

1. **The parts.**
   - **Recommended:** three gated parts, each reviewed: 9a (packaging and CI), 9b (releasing and docs), 9c (the full review and sign-off).
   - Or: two (9a packaging, CI and release; 9b docs, review and sign-off).
   - Or: one gate at the end.
2. **Publishing** (decision 5).
   - **Recommended:** 9a and 9b build everything up to a dry run: images built and attested but not pushed, the catalog signed but not deployed, the release drafted but not tagged. After the Phase 3 sign-off, the owner says "publish" and the release workflow runs once for real:
     - GHCR images, made public;
     - the catalog's Pages channels;
     - the tag;
     - the GitHub release.
   - Or: publish a beta at 9a's gate, for testing on the owner's own NAS.
   - Or: build everything and publish nothing during Phase 3.
3. **The image's name.**
   - **Recommended:** `ghcr.io/highsea-tv/highsea`, under the owner's organisation (their change of 2026-10-22). It's short, it's what people type, and GHCR allows a package name other than the repository's, linked by `org.opencontainers.image.source`.
   - Or: `ghcr.io/highsea-tv/highsea-tv`, the repository's own name.
4. **The first version.**
   - **Recommended:** `0.1.0` (what `apps/server` already says), stable, at the Phase 3 sign-off. `1.0.0` waits until the clients and playback make highsea the whole product (Phase 4). Under SemVer § 4, 0.x may change anything; the changelog says so plainly.
   - Or: `1.0.0` at milestone 1.
   - Or: a `0.1.0-beta.1` first, then `0.1.0` after the owner has run it for a while.
5. **The release key.**
   - **Recommended:** the owner generates it offline. The private half goes only into the repository's `release` environment, which needs the owner's approval. The development key stays for local and CI builds.
   - Or: generated in a one-off workflow and stored straight into the environment, so no one ever sees it. This is harder to back up.
6. **The end-to-end run's depth.**
   - **Recommended:** Playwright through the admin, as the exit criteria say, including setup and both extras.
   - Or: the API level against the container, with the browser half left to the sweeps. This is faster, but it doesn't meet the criterion as written.
7. **NAS templates.**
   - **Recommended:**
     - the Unraid XML in the repo, submitted to Community Applications as part of the first publish;
     - TrueNAS and Synology as compose files with guides;
     - the TrueNAS catalog request once highsea has users to support it.
   - Or: all three as guides only, nothing submitted.
   - Or: also open the TrueNAS feature request now.
8. **Where the guides live.**
   - **The owner's answer (2026-10-22):** a dedicated documentation site, `apps/docs` in Next.js, at `docs.highsea.tv` (or `wiki.highsea.tv`), hosted on Vercel. See [Docs](#docs-9b).
   - The draft had recommended the repository's `docs/guides/`, to keep the rule against hosted pages. The owner chose a site; the rule now excepts it.
9. **highsea's own keys in a public image.**
   - **Recommended:** keep baking the OpenSubtitles.com key and the Trakt application into release images, as built. A distributed app's secret can't be kept confidential (RFC 8252 § 8.5), and both services issue them on that understanding. Before the first publish, check both services' terms for distribution, and keep a way to rotate each key per release.
   - Or: release images without them, with owners entering their own. This is a worse first run, and it changes 7a's and 8a's design.
10. **Node.**
    - **Recommended:** release Phase 3 on Node 24, which is supported until 2028-04-30, taking its point releases. Move to Node 26 at the start of Phase 4, after it has been LTS for a while. Either way `.nvmrc`, the Dockerfile and `engines` move together.
    - Or: move to Node 26 in 9a, once it's LTS on 2026-10-28.

11. **The documentation framework.**
    - **Recommended:** Fumadocs, for its headless core that takes highsea's design system.
    - Or: Nextra 4, which is quicker to stand up with its own theme, and harder to make look like highsea.
12. **The documentation site's design.**
    - **Recommended:** the framework's docs layout in highsea's tokens and brand, approved from screenshots at 9b's gate.
    - Or: a prototype in `design/prototypes` first, as for every other screen.
13. **The address and previews.**
    - **Recommended:** `docs.highsea.tv`, the name people expect for product documentation. `wiki.highsea.tv` can redirect to it. Vercel's preview deployments stay on, so each change to the guides can be read before it merges.
    - Or: `wiki.highsea.tv`.
    - Or: previews off, with production only.

## The owner's changes

On 2026-10-22, reviewing this scope, the owner made two changes:

1. **Publish under the `highsea-tv` organisation,** not the owner's personal account: the repository, its packages and its images. This amends decision 5's "on this repository" to the same repository, moved to the organisation. See [The organisation and the package scope](#the-organisation-and-the-package-scope-9a-first).
2. **Rename the workspace packages from `@highsea/` to `@highsea-tv/`.**

## The owner's answers

On 2026-10-22 the owner took every recommendation for questions 1 to 10 except question 8, together with the [two changes above](#the-owners-changes):

1. Three gated parts: 9a, 9b and 9c.
2. Dry runs throughout. One real publish after the Phase 3 sign-off, on the owner's word.
3. `ghcr.io/highsea-tv/highsea`.
4. `0.1.0` stable at the sign-off; `1.0.0` with the apps and playback.
5. The release key is generated offline by the owner and kept in an approval-gated `release` environment.
6. Playwright through the admin, including setup and both extras.
7. The Unraid XML submitted to Community Applications at the first publish. TrueNAS and Synology as compose files with guides.
8. **Changed by the owner:** a dedicated documentation site in Next.js at `docs.highsea.tv` or `wiki.highsea.tv`, on Vercel. The owner owns `highsea.tv`. See [Docs](#docs-9b). Questions 11 to 13 follow from it.
9. Keep highsea's OpenSubtitles.com and Trakt keys in release images. Check both services' terms before the first publish, and keep a way to rotate each key.
10. Release Phase 3 on Node 24; move to Node 26 at the start of Phase 4.
11. Fumadocs for the documentation site.
12. The framework's docs layout in highsea's tokens and brand, approved from screenshots at 9b's gate.
13. `docs.highsea.tv`, with `wiki.highsea.tv` redirecting to it; Vercel's preview deployments on.

The owner also set the line between internal and public docs: see [Docs](#docs-9b).
