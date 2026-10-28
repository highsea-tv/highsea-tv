<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Changelog

What changes in each release of highsea, written for the people who run it. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning 2.0.0](https://semver.org/).

While highsea is at 0.x, any release may change how something works. When one does, its notes say what to do.

## [Unreleased]

## [0.2.0-beta.1] - 2026-10-28

### Added

- Watching in the browser: every server has a web app at `/web`, with Home, the library, collections, search, each film's page and settings, for the Owner, Admins and Users alike. Users who sign in are taken there, and **Watch on highsea** in the admin's sidebar opens it.
- A player in the web app: films play as they are where the browser can, and otherwise are repackaged or converted as they play. Audio, subtitles and the version can be changed while watching, subtitles can be moved earlier or later in 50 ms steps, and the position bar shows previews of the film.
- Picking up where you stopped: the place in each film is kept for each person, on every device, and a film counts as watched past 90%. Smart collections can use what each person has watched.
- Next up, near the end of a film in a collection, and picture in picture where the browser has it.
- Adding a root folder now scans it, and adds the films in it that highsea can match with confidence.

### Changed

- The image runs on Node 26 and Debian trixie, and the admin on Next.js 16.4.
- Long names, labels and numbers no longer spill out of their buttons, badges and panels in the admin on narrow screens.

## [0.1.0] - 2026-10-23

### Added

- The first release of highsea: one server for finding, downloading and organising films, with their subtitles, in place of Radarr, Prowlarr, qBittorrent and Bazarr.
- A setup wizard that takes a new server from its name and owner to folders, indexers, subtitles and remote access.
- People and access: an Owner, Admins and Users, invitations, two-step sign-in, passkeys, devices and API keys.
- Discover and Movies: search TMDB, add films with a quality profile, and browse the library with filters, sorting and the details of every file.
- Quality profiles with presets for each kind of screen, custom formats and size limits, and the reason for every release highsea takes or turns down.
- Indexers from a signed catalog, added in one click, with health checks, plus any Torznab feed, including Prowlarr's and Jackett's.
- A built-in torrent client: the queue, seeding rules, a blocklist, a watch folder, categories, and an IP blocklist.
- VPN support: highsea can connect through its own WireGuard tunnel on Linux, through a gluetun container, or through an interface you choose. Torrents stop if the tunnel drops.
- Importing: finished downloads are renamed into the library with hardlinks where they can be. Archives are unpacked, and an existing library can be brought in.
- Subtitles from OpenSubtitles.com, Subdl and SubSource, scored and kept per language profile, and synced to each film's speech.
- Wanted and the calendar: missing films and films below their profile's cutoff, searched on a schedule and from RSS, with an iCal feed.
- Import lists from TMDB, Trakt, StevenLu and MDBList, synced every six hours.
- Notifications to Discord, Slack, Telegram, ntfy, Gotify, Pushover, Matrix, email, webhooks, Apprise and the browser.
- Backups on a schedule and by hand, a restore that puts everything back, log files, crash reports, health checks, `/metrics`, and System › Updates.
- Curation: announcements for the people on your server, featured sections, and smart collections built from rules.
- Personal dashboards, themes, branding and sound packs.
- A one-time migration from Radarr and qBittorrent in Settings › Migration.
- Images for amd64 and arm64 at `ghcr.io/highsea-tv/highsea`, with compose files and templates for Unraid, TrueNAS and Synology.


[unreleased]: https://github.com/highsea-tv/highsea-tv/compare/v0.2.0-beta.1...HEAD
[0.2.0-beta.1]: https://github.com/highsea-tv/highsea-tv/compare/v0.1.0...v0.2.0-beta.1
[0.1.0]: https://github.com/highsea-tv/highsea-tv/releases/tag/v0.1.0
