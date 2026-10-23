# highsea.tv

**Your own streaming platform, fully yours.**

highsea.tv is a self-hosted, all-in-one media platform. One server replaces the usual stack of separate apps:

- automated acquisition (Radarr, Sonarr, Lidarr, Readarr);
- indexer management (Prowlarr);
- a built-in torrent client (qBittorrent);
- subtitles (Bazarr);
- requests (Overseerr);
- streaming (Plex, Jellyfin, Emby).

Dedicated clients for web, desktop, mobile and TV connect to your server at home or remotely.

> Status: **pre-alpha. The server's first milestone is done (signed off 2026-10-23), ahead of the first release, 0.1.0.** It finds, downloads and imports movies, with indexers, a built-in torrent client, subtitles that sync themselves, automation, notifications and an admin to run it all. Playback and the client apps come next, in Phase 4. See [docs/roadmap.md](docs/roadmap.md).

## Install

highsea runs as one Docker container, for amd64 and arm64, from `ghcr.io/highsea-tv/highsea`. The guides at [docs.highsea.tv](https://docs.highsea.tv/) take you from nothing to the setup screen:

- [Prerequisites](https://docs.highsea.tv/install/prerequisites/): what highsea needs, from the machine to its ports and accounts.
- [Install with Docker](https://docs.highsea.tv/install/docker/): Docker Compose on Linux, macOS or Windows. Start here.
- [Install on Unraid](https://docs.highsea.tv/install/unraid/), [on Synology](https://docs.highsea.tv/install/synology/) or [on TrueNAS](https://docs.highsea.tv/install/truenas/).

Once highsea is running:

- [Recommended setup](https://docs.highsea.tv/recommended-setup/);
- [Move from Radarr and qBittorrent](https://docs.highsea.tv/migrate-from-radarr-and-qbittorrent/);
- [Upgrade](https://docs.highsea.tv/upgrade/), and [CHANGELOG.md](CHANGELOG.md) for what each release changes;
- a guide for every page of the admin and every Settings area, from the [Introduction](https://docs.highsea.tv/).

The compose files are at the root (`compose.yaml`, and `compose.bridge.yaml` where host networking isn't available), and the NAS templates are in [`templates/`](templates/).

## Repository layout

| Path | What lives there |
| --- | --- |
| `apps/` | Applications: `server` (the self-hosted app), `docs` (the guides at docs.highsea.tv), `storybook`, and later `web`, `desktop`, `mobile`, `tv` |
| `packages/` | Modular packages: design system, contracts and SDK, server domain |
| `catalog/` | Signed catalogs (indexers, presets, themes, sounds), released independently of the apps |
| `design/` | Brand explorations, source assets, clickable prototypes |
| `docs/` | How highsea is planned and built: roadmap, ADRs, brand, design language, product specs. The guides for running it are in `apps/docs` |
| `templates/` | The NAS templates: Unraid's XML, and compose files for TrueNAS and Synology |
| `docker/`, `compose*.yaml` | The image's entrypoint and notices, and the compose files |
| `scripts/` | Checks, browser sweeps, the image's build steps, the end-to-end run and releases |

## Development

Requires Bun 1.4 or later, and Node 24.21.0, the version in `.nvmrc`.

```sh
bun install
bun run lint
bun run explorations   # serve the brand direction boards on http://localhost:4400
bun run storybook      # the design system's components
bun run prototypes     # the Phase 2 prototypes on http://localhost:4500
bun run server         # the server, in development, on http://localhost:3000
bun run docs           # the guides, on http://localhost:3100
bun run typecheck && bun run test
```

## License

[AGPL-3.0-only](LICENSE). Every source file carries an `SPDX-License-Identifier: AGPL-3.0-only` header.

### Third-party material

- **Sintel** (test fixture): a 52-second cut of the audio and English subtitles in [packages/subtitles/test/fixtures/sintel](packages/subtitles/test/fixtures/sintel/README.md). © copyright Blender Foundation | durian.blender.org, licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
