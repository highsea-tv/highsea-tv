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
