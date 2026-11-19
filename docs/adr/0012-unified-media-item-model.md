# 0012. Unified media item model

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
The server manages acquisition and will later stream. Media types: movies, TV (+ anime), music, online video, books/audiobooks/podcasts.

## Decision
- A single `media_items` tree (`type`, `parent_id`) plus per-type extension tables (`movie_details`, `episode_details`, …).
- Downloads, history, files, images, subtitles, curation and watch state all reference `media_items`.
- `media_files` stores full ffprobe stream info, and an item can have **multiple versions** (e.g. 4K HDR + 1080p SDR), each with its own quality profile.

## Consequences
- New media types add extension tables and domain packages only.
- A streaming server browses one tree.

## 2026-11-18: shows, seasons and episodes join the tree (Phase 5's B, HT-67)

The tree takes its second kind, as planned. A show, its seasons and its episodes are `media_items` rows (`type` `show`, `season`, `episode`), linked by `parent_id`, with a `show_id` and their numbers on seasons and episodes for one indexed read of a show. Each is addressed by TMDB's own id for its kind, so the unique (`type`, `tmdb_id`) still holds. `show_details` is the shows' extension table (season folders, TheTVDB's and IMDb's ids). A file with several episodes is one `media_files` row, and each episode's version points at it. Rows that aren't titles (`parent_id` set) don't count where the library counts titles. [ADR 0064](0064-shows-on-the-server.md) has the decision.
