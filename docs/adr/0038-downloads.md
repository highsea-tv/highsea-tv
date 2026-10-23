# 0038. Downloads: grabbing, the queue, protection and seeding

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
A grab turns a release from checkpoint 5's search into a torrent for a movie's version, then into a file in the library ([phase-3-checkpoint-6.md › Downloads](../plans/phase-3-checkpoint-6.md#downloads)). Radarr and qBittorrent split this between two programs that poll each other; highsea owns both halves, so the queue can read the engine directly. Owners arrive with three fears from the *ARR suite: stalled downloads that sit forever, releases that carry malware, and hit-and-run strikes on private trackers.

## Decision
- **`@highsea/downloads`** sits between the engine (ADR 0037), the indexers (ADR 0035) and the import pipeline (ADR 0039). A `downloads` row is a grab of a release for a movie's version: the torrent, the indexer and guid, the quality, the state and its reason.
- **Grab by guid from the cache.** A grab takes a release from checkpoint 5's 30-minute results by its indexer and guid. It's never searched again, and a release that's gone is `not-found` with "Search again."
  - **The `.torrent`** is fetched through the indexer's rate limit and sign-in. A form login signs in again once on an auth failure.
  - **Redirects are followed by hand,** and a redirect to a `magnet:` is taken as the magnet, as Radarr's `TorrentClientBase.DownloadFromWebUrl` does.
  - **The bytes must be a bencoded dictionary** (BEP 3), at most 10 MiB, so a sign-in page fails at the grab: "The indexer sent a web page instead of the torrent. Check its sign-in."
  - **Refusals:** a release the decision engine rejected is refused unless the grab is forced (Grab anyway); so is one on the blocklist, or one already downloading.
- **The queue's states:**
  - `downloading`, `importing`, `import-blocked`, `completed` and `failed` are stored;
  - `stalled` is derived when reading, from `progressAt`, the last time data arrived. "No seeds for 2 hours" shows a reason, and the stall job replaces the release at 3 hours.
  - A boot restarts the stall clock, so downtime never counts as a stall.
- **Replacing a release** (the stall job, a refusal, and Activity's Find another or Replace):
  - blocklists the release, removes its torrent with its data, and marks the download failed;
  - grabs the best remaining approved release, from the cache and then a new search, skipping releases already tried and the blocklist;
  - with nothing left, writes `download-failed` to history: "No other approved release was found. highsea will try again on the next search."
- **Protection, before and after.**
  - **Before a byte downloads,** the engine's `vet` checks the file list as soon as the metadata arrives. An executable (`.exe`, `.bat`, `.cmd`, `.sh`), or a file of another dangerous kind (`DANGEROUS_EXTENSIONS` in `@highsea/media/shared`), refuses the torrent. The release is blocklisted and replaced: "The release contains an executable file (setup.exe). It wasn't downloaded, and it has been blocklisted."
  - **After it downloads,** the import pipeline checks again (ADR 0039).
  - Radarr's equivalent acts only at import, after the bytes are on disk (its "Executable files found" rejection). highsea refuses earlier because it owns the engine.
- **Automatic search grabs.** The `movies.search` job grabs the best approved release when the movie is monitored and has no file. `grabBest` skips a version that's already downloading, so a repeated job grabs nothing twice (ADR 0022).
- **Imports are jobs.** A finished torrent enqueues `downloads.import`, deduplicated on the download. A failure makes the download `import-blocked` with the pipeline's reason, and Force import runs it again with the checks relaxed.
- **Seeding rules** come from the release's indexer (checkpoint 5's answer 5), field by field, else from Settings › Download client. The default is a ratio of 2 or 7 days, whichever comes first, the spec's example. An indexer can set a minimum seeding time, below which a torrent is never stopped, so a hit-and-run can't happen on a private tracker.
- **Letting go:** once the rule is met, the torrent is removed with its data, but only if the import made its own copy (a hardlink or a copy). A move leaves nothing to seed, so the torrent goes at import.
- **Manual torrents** (Downloads › Add) go to the downloads folder's `manual` folder and aren't imported; categories and the watch folder are 6b.
- **Events:** `queue.updated` (ids are download ids), `torrents.updated` (torrent ids), and `history.updated` (history and the blocklist).

## Consequences
- A stalled or poisoned release recovers without the owner: within 3 hours a stall is replaced; a refused one is replaced at once.
- Malware named as an executable never reaches the disk. A file the extension list doesn't name still meets the import's checks.
- The queue and Downloads show the engine's live numbers, with no polling between two programs.
- The stall clock restarting at boot means a release that stalls across restarts takes longer to be replaced, by the downtime at most.
