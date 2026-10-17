# 0011. No compatibility APIs

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Emulating the Radarr/Sonarr, qBittorrent, Jellyfin or Subsonic APIs would let existing tools work with highsea. It would also tie our design to competitors' models and create a large maintenance burden.

## Decision
highsea.tv exposes **only its own API**. It replaces and competes with those apps rather than impersonating them.
- One-time **migration importers** (Radarr/Sonarr/Lidarr/Prowlarr/Bazarr, qBittorrent, Plex/Jellyfin/Emby) are in scope. They import data and do not emulate APIs.
- Ecosystem tools are rebuilt natively where valuable: cross-seed, IRC announce grabbing, seeding management, requests, stats, cleanup rules.

## Consequences
- The drop-in story depends on high-quality importers and feature parity.
