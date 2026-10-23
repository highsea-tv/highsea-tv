# 0005. In-process TypeScript torrent engine

- **Status:** Accepted; amended 2026-10-20 (the engine as built; see ADR 0037)
- **Date:** 2026-10-16

## Context
highsea.tv replaces qBittorrent, so the torrent client must be built in. Options were an in-process TS engine or a bundled native sidecar (libtorrent).

## Decision
`@highsea/torrent` is our own session layer, built on mature JS primitives: `bittorrent-protocol`, `ut_metadata`, `ut_pex`, `bittorrent-dht`, `bittorrent-tracker`, `parse-torrent`, `magnet-uri`. We implement:
- the state machine;
- the piece picker: rarest-first, plus a sequential/priority mode for streaming;
- choking;
- storage with per-file priority;
- fast resume persisted in the DB;
- rate, queue and seed limits;
- per-tracker seeding rules;
- interface binding (VPN).

Everything sits behind a `TorrentEngine` interface.

## Consequences
- Truly one process. Piece hashing runs in a worker thread.
- If throughput becomes a bottleneck, a native backend can implement the same interface.
