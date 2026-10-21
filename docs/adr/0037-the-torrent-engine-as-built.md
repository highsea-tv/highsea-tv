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
- **6b:** uTP (BEP 29 with LEDBAT, RFC 6817), IPv6 peers and the IPv6 DHT (BEP 32), protocol encryption (Message Stream Encryption), IP blocklists, and UPnP and NAT-PMP. The settings for encryption and UPnP are stored now and take effect then. Encryption, blocklists and port mapping are built as the next section says.

## 6b: encryption, blocklists and port mapping (2026-10-20)
- **Protocol encryption** is Message Stream Encryption as the [Vuze wiki's specification](https://wiki.vuze.com/w/Message_Stream_Encryption) gives it, in `mse.ts`, below the wire and over any duplex, so it works the same over TCP and uTP:
  - Diffie-Hellman over the spec's 768-bit prime with generator 2, through Node's `crypto.createDiffieHellman` ([Node: crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatediffiehellmanprime-primeencoding-generator-generatorencoding)); the keys `HASH('keyA', S, SKEY)` and `HASH('keyB', S, SKEY)`; the torrent found from `HASH('req2', SKEY) xor HASH('req3', S)`; padding of at most 512 bytes skipped by synchronising on the hash or on the encrypted verification constant.
  - RC4, discarding its first 1024 bytes, is written in TypeScript (`rc4.ts`, checked against the published vectors). OpenSSL 3 moved RC4 to its legacy provider ([OpenSSL: OSSL_PROVIDER-legacy](https://docs.openssl.org/3.5/man7/OSSL_PROVIDER-legacy/)), which Node 24 loads only with `--openssl-legacy-provider` ([Node: CLI](https://nodejs.org/docs/latest-v24.x/api/cli.html#--openssl-legacy-provider)); highsea doesn't ask operators for that flag.
  - The policies, as qBittorrent names them: **Require** offers and accepts RC4 only and refuses a plaintext handshake; **Prefer** offers RC4 and plaintext, picks RC4, and retries a peer in plaintext if the encrypted handshake fails; **Allow** connects in plaintext first, retries encrypted, and answers an encrypted peer with plaintext after the handshake when it's offered.
  - `bittorrent-protocol` 5.0.9 has its own MSE (`peEnabled`); highsea doesn't use it, because its responder still accepts a plain handshake when set to RC4 only, and it hooks the wire's parser rather than wrapping the stream, which uTP needs.
  - Peers show `E` (RC4) or `e` (header obfuscation only, plaintext after it) in their flags.
- **IP blocklists** (`blocklist.ts`): PeerGuardian P2P text, eMule DAT and P2B versions 1 to 3, gzipped or not, read as qBittorrent's `filterparserthread.cpp` reads them (behaviour only, no code): DAT ranges with an access level above 127 are allowed, P2P descriptions may contain colons. IPv4 and IPv6 ranges go in one merged, sorted set searched by bisection; an IPv4-mapped IPv6 address is looked up as IPv4.
  - The setting `blocklistUrl` is an http(s) address or a file in the config folder. An address is fetched through the fetch seam by the daily job `downloads.ip-blocklist`, safe to repeat (ADR 0022); the last good copy is kept in `<config>/blocklist/`, so a restart blocks at once without the network. A list that fails to fetch or parse leaves the one in use, and System's health list says why.
  - The engine refuses a blocked address in the socket factory (outgoing), before the handshake (incoming), and never adds one as a candidate from trackers, the DHT or PEX.
- **Port mapping** (`portmap.ts`) maps the listening port, TCP and UDP, while UPnP is on and no VPN is set:
  - NAT-PMP first, written from [RFC 6886](https://www.rfc-editor.org/rfc/rfc6886): the external address (§3.2), mappings with the recommended lifetime of 7200 seconds (§3.3), renewed halfway, retries from 250 ms doubling (§3.1, capped at 4 tries), and deleted on shutdown with a lifetime of 0 (§3.4). It goes through the socket factory's UDP socket, to the default gateway read from `/proc/net/route` ([proc(5)](https://man7.org/linux/man-pages/man5/proc_net.5.html)); elsewhere, UPnP alone.
  - UPnP through `@achingbrain/nat-port-mapper` 4.0.5 (Apache-2.0 OR MIT): the first Internet Gateway Device found, both protocols, described as `highsea`, stopped on shutdown. The library's own NAT-PMP isn't used: it binds port 5350 and writes its lifetime in milliseconds into a field RFC 6886 gives in seconds (`dist/src/pmp/gateway.js`).
  - Never with a VPN: port mapping asks the local router to forward traffic around the tunnel, and the library's SSDP sockets don't go through the factory.

## Consequences
- A socket can't leave unbound: the factory is the only door, and a test asserts every socket it made carried the binding's address.
- Tracker names never reach the system's resolver, so a DNS query can't name a torrent outside the tunnel.
- The engine depends on no native addon; better-sqlite3 stays the only one (ADR 0019).
- Until 6b, peers were TCP over IPv4 and unencrypted. Since 6b, swarms that require encryption are reached, and the default, Prefer, encrypts whenever the other side can.
- Port mapping is the one networking that can leave without the factory (UPnP's SSDP), which is why it's off whenever a VPN is set.
- A native backend stays possible behind `TorrentEngine`, as ADR 0005's consequences say.

## 6b: uTP and IPv6 (2026-10-20)
- **One UDP socket per family, shared by uTP and the DHT**, on the listening port, as libtorrent does. Each datagram is routed by its first bytes, libtorrent's test (`session_impl.cpp` `on_udp_packet` and `utp_socket_manager.cpp` `incoming_packet`, RC_2_0):
  - a uTP packet is at least 20 bytes, with version 1 in the low nibble of byte 0 and a type from 0 to 4 in the high nibble ([BEP 29](https://www.bittorrent.org/beps/bep_0029.html));
  - a DHT message is a bencoded dictionary, from `d` to `e` ([BEP 5](https://www.bittorrent.org/beps/bep_0005.html)).
  `d` is 0x64, whose low nibble is 4, so the two never overlap (`udp.ts`).
- **uTP is highsea's own** (`utp.ts`): BEP 29's header, selective ACKs and connection ids, and each connection is a Duplex stream, so the peer wire runs over it as over TCP.
  - Where BEP 29 leaves a choice, it follows libtorrent (`utp_stream.cpp`) and libutp (`utp_internal.cpp`), the two implementations every client talks to:
    - an `ST_STATE` carries the next sequence number and doesn't use one up;
    - `ST_FIN` uses one up;
    - a packet for no known connection gets `ST_RESET`.
  - Congestion control is LEDBAT, with [RFC 6817 § 2.4.2](https://www.rfc-editor.org/rfc/rfc6817#section-2.4.2)'s constants: TARGET 100 ms, GAIN 1, BASE_HISTORY 10, CURRENT_FILTER 4, INIT_CWND and MIN_CWND 2, ALLOWED_INCREASE 1.
    - A loss halves the window at most once a window; a timeout drops it to one packet and doubles the timeout.
    - Timeouts follow [libtorrent's settings](https://www.libtorrent.org/reference-Settings.html): `utp_connect_timeout` 3000 ms, `utp_syn_resends` 2, `utp_min_timeout` 500 ms.
  - Packets carry at most 1200 bytes of UDP payload, the size QUIC chose to cross any path unfragmented, IPv6 and tunnels included ([RFC 9000 § 14](https://www.rfc-editor.org/rfc/rfc9000#section-14)). So there's no path MTU discovery.
- **TCP stays the fallback**, as in libtorrent's `torrent::connect_to_peer` (RC_2_0):
  - with `enable_outgoing_utp` on, a peer is tried over uTP first;
  - a uTP connect that fails clears the peer's `supports_utp`, and the next try is TCP, straight away;
  - with uTP off, incoming SYNs get `ST_RESET`, so the other side falls back too.
  - The `utp` setting (Settings › Download client, on by default, as in libtorrent and qBittorrent) applies to new connections at once.
- **uTP streams are tracked by the socket factory** (`adopt`, kind `utp`), so a rebind or a dropped binding closes them with their UDP socket, and the kill switch test sees them.
- **IPv6.** A binding has an IPv4 side and, when it can, an IPv6 one (`Binding.address6`):
  - a VPN binding uses IPv6 only when the tunnel has an IPv6 address (the interface mode passes it);
  - the "any" binding uses IPv6 when the host has a global unicast address: 2000::/3 ([RFC 4291 § 2.4](https://www.rfc-editor.org/rfc/rfc4291#section-2.4)), less Teredo's 2001::/32, which BEP 32 says to avoid.
  Each family gets its own TCP listener and UDP socket on the same port, IPv6 ones with `ipv6Only` ([Node: server.listen](https://nodejs.org/docs/latest-v24.x/api/net.html#serverlistenoptions-callback), [dgram.createSocket](https://nodejs.org/docs/latest-v24.x/api/dgram.html#dgramcreatesocketoptions-callback)), as libtorrent's default `listen_interfaces` does (`0.0.0.0:6881,[::]:6881`). A peer in a family the binding lacks is skipped, not tried.
- **Trackers over IPv6** follow [BEP 7](https://www.bittorrent.org/beps/bep_0007.html)'s current text:
  - announce once from each local family, from that family's address (an A record and an AAAA record);
  - never send `ipv4=` or `ipv6=`, which BEP 7 now discourages because they let anyone announce someone else's address;
  - read `peers6` over HTTP (18 bytes a peer), and 18-byte peers from a UDP tracker reached over IPv6 ([BEP 15](https://www.bittorrent.org/beps/bep_0015.html)).
  Addresses are written in canonical form (RFC 5952, through the WHATWG URL serializer), so a peer is one candidate however it was spelled.
- **PEX over IPv6** ([BEP 11](https://www.bittorrent.org/beps/bep_0011.html)): `ut_pex`'s `addPeer6` and `dropPeer6` fill `added6` and `dropped6`, and a peer connected over uTP carries flag 0x04.
- **The IPv6 DHT** is [BEP 32](https://www.bittorrent.org/beps/bep_0032.html)'s second, independent DHT, on the IPv6 UDP socket, with the IPv4 DHT's node id, as BEP 32 recommends.
  - k-rpc-socket takes an injected socket (`opts.socket`, 1.11.1), so nothing is patched.
  - k-rpc 5.1.0 and bittorrent-dht 11.0.12 only know IPv4's compact forms, so the IPv6 DHT's socket is an adapter (`dht.ts`):
    - each IPv6 address gets a stand-in from 240.0.0.0/4, which [RFC 1112 § 4](https://www.rfc-editor.org/rfc/rfc1112#section-4) reserves and nothing routes;
    - `nodes6` (38 bytes a node) and 18-byte `values` are translated to and from the libraries' forms;
    - stand-ins never reach the wire.
  - Its nodes are saved apart (`torrentDht6`). Its bootstrap adds `dht.libtorrent.org:25401`, libtorrent's default router, which has an IPv6 address.
- **The peer list's flags** add **P** for a peer over uTP, as qBittorrent shows it.
