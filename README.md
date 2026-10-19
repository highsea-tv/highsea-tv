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

> Status: **pre-alpha. Phase 2 (design prototypes) is signed off; Phase 3 (the server) is next.** The design system is v1.0, and every admin and client flow is a clickable prototype; nothing here is usable as a product yet. See [docs/roadmap.md](docs/roadmap.md).

## Repository layout

| Path | What lives there |
| --- | --- |
| `apps/` | Applications: `server` (the self-hosted app), `storybook`, and later `web`, `desktop`, `mobile`, `tv` |
| `packages/` | Modular packages: design system, contracts and SDK, server domain |
| `catalog/` | Signed catalogs (indexers, presets, themes, sounds), released independently of the apps |
| `design/` | Brand explorations, source assets, clickable prototypes |
| `docs/` | All documentation: roadmap, ADRs, brand, design language, product specs |
| `cloud/` | Optional highsea cloud services (later) |

## Development

Requires Bun ≥ 1.4 and Node ≥ 24.

```sh
bun install
bun run lint
bun run explorations   # serve the brand direction boards on http://localhost:4400
bun run storybook      # the design system's components
bun run prototypes     # the Phase 2 prototypes on http://localhost:4500
bun run typecheck && bun test
```

## License

[AGPL-3.0-only](LICENSE). Every source file carries an `SPDX-License-Identifier: AGPL-3.0-only` header.
