# 0037. The torrent engine as built

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
ADR 0005 decided an in-process TypeScript engine: highsea's own session layer on mature JS primitives. Checkpoint 6 builds it ([phase-3-checkpoint-6.md › The torrent engine](../plans/phase-3-checkpoint-6.md#the-torrent-engine)). Research before the build found that the WebTorrent client can't bind its sockets to an address, that Node can bind to an address but not to a device ([nodejs/node#35769](https://github.com/nodejs/node/issues/35769)), and that no maintained pure-JS uTP exists. activity-downloads.md decided that when the tunnel drops, the engine stops rather than falling back. This ADR amends ADR 0005, which stays the decision.

## Decision
- **The primitives** are the WebTorrent project's modules, all MIT and pure JS:
  - `bittorrent-protocol` 5.0.9: the peer wire (BEP 3), the Fast extension (BEP 6) and the extension protocol (BEP 10);
  - `ut_metadata` 5.0.1: magnets through metadata exchange (BEP 9);
  - `ut_pex` 5.0.2: PEX (BEP 11);
  - `bittorrent-dht` 11.0.12: the DHT (BEP 5);
  - `magnet-uri` 7.0.10 and `bencode` 4.0.1.
  Not the `webtorrent` client: its peer connections are a bare `net.connect` and its listener has no host, so nothing could be bound. Its uTP is the native `utp-native`, last released in 2021, and it pulls in `node-datachannel` for WebRTC peers highsea doesn't need.
- **highsea writes the session layer** (`packages/torrent`):
  - the state machine: checking, queued, downloading, paused, seeding, completed and error. Stalled, importing and import-blocked belong to `downloads` (ADR 0038);
  - the piece picker: rarest first with random first pieces, endgame, per-file priorities (skip, normal, high), and the sequential mode ADR 0005 reserves for streaming;
  - choking: a rechoke every 10 seconds and an optimistic unchoke every 30, as clients have done since BEP 3;
  - storage that maps pieces to files, writes sparse files, and keeps a skipped file's boundary pieces in a `.parts` file, as qBittorrent does;
  - SHA-1 verification of each piece in the worker pool (ADR 0003), through `{ module: HASH_WORKER, fn: 'sha1' }`;
  - limits: global download and upload token buckets and how many torrents download at once (3 by default).
- **Trackers are highsea's own client** (HTTP per BEP 3 with compact peers per BEP 23 and IPv6 peers per BEP 7, UDP per BEP 15, tiers per BEP 12). `bittorrent-tracker`'s client opens unbound UDP sockets and resolves names with the system's resolver (`lib/client/udp-tracker.js` and `http-tracker.js` at 11.2.3). Announce answers carry the swarm's seeders and leechers, so no separate scrape is sent.
- **Private torrents** (BEP 27) use their trackers only: no DHT and no PEX.
- **The socket factory and the kill switch.** Every socket is made in one place, `sockets.ts`, and nothing else in the engine imports `net`, `dgram` or `dns`:
  - the TCP listener's host;
  - each outgoing peer connection's `localAddress` ([Node: socket.connect](https://nodejs.org/docs/latest-v24.x/api/net.html#socketconnectoptions-connectlistener));
  - the UDP socket's bind address;
  - tracker requests;
  - tracker names, through the engine's own `dns.Resolver` bound with `setLocalAddress` and pointed at the tunnel's DNS servers ([Node: resolver.setLocalAddress](https://nodejs.org/docs/latest-v24.x/api/dns.html#resolversetlocaladdressipv4-ipv6)).
  With no binding the factory refuses to make a socket, and `setBinding(null)` closes every one at once. The binding comes only from `vpn` (ADR 0042). The engine's half of the kill switch is the binding; what guarantees the path is the mode's.
- **No networking until a binding.** The engine starts offline. A torrent resumed while it's offline waits as queued, not paused.
- **Fast resume:** each torrent's bitfield, its files' sizes and modification times, and its totals are written to the database every 30 seconds and on shutdown. On boot a torrent whose files match resumes without a recheck; one whose files changed is rechecked alone. A write lost to a crash costs at most 30 seconds of pieces, which the check finds again (ADR 0019).
- **Vetting before a byte downloads:** the engine calls a `vet` function with a torrent's file list as soon as it has the metadata, and refuses the torrent with the reason it returns (ADR 0038).
- **Seeding rules** are the engine's: a ratio and a time, whichever comes first, and a minimum time below which a torrent is never stopped, for private trackers' hit-and-run rules. A met rule makes the torrent `completed`.
- **The listening port** is 6881 for TCP and the DHT, as the roadmap, the Dockerfile and ADR 0020 say. A new port is listened on at once.
- **6b:** uTP (BEP 29 with LEDBAT, RFC 6817), IPv6 peers and the IPv6 DHT (BEP 32), protocol encryption (Message Stream Encryption), IP blocklists, and UPnP and NAT-PMP. The settings for encryption and UPnP are stored now and take effect then.

## Consequences
- A socket can't leave unbound: the factory is the only door, and a test asserts every socket it made carried the binding's address.
- Tracker names never reach the system's resolver, so a DNS query can't name a torrent outside the tunnel.
- The engine depends on no native addon; better-sqlite3 stays the only one (ADR 0019).
- Until 6b, peers are TCP over IPv4 and unencrypted. Swarms that require encryption or uTP are out of reach until then.
- A native backend stays possible behind `TorrentEngine`, as ADR 0005's consequences say.
