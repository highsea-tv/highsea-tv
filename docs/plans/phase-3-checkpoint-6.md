# Phase 3, checkpoint 6: downloading and importing

- **Status:** Scoped on 2026-10-20, before building. The owner answered the [open questions](#open-questions-for-the-owner) on 2026-10-20, taking every recommendation: the checkpoint is built in two gated halves, 6a and 6b. The same day the owner made VPN connections a first-class feature: its own settings to connect and check, with support for common providers ([VPN connections](#vpn-connections), spec [vpn.md](../product/vpn.md)). The owner answered its questions V1 to V6 the same day, again taking every recommendation. The owner approved the Settings › VPN prototype on 2026-10-20 (V5) and gave 6a the go-ahead the same day. **6a was built and signed off on 2026-10-20; 6b is in progress.**
- **Gate:** stop when each half is built (6a, then 6b). Report what was built, the judgement calls, the API added, screenshots and the check results, then ask for review. Checkpoint 7 (subtitles) starts only after sign-off.
- **Parent plan:** [phase-3-server.md](phase-3-server.md). Its standing rules, architecture and decisions all apply, including decision 1 (every [M1] item stays in milestone 1), decision 5 (nothing is published until the owner says so) and decision 6 (the admin is for the owner and admins only). This document settles what that plan's checkpoint 6 item and the specs leave open.

## Read first

- [activity-downloads.md](../product/activity-downloads.md): A7 Activity (queue, history, blocklist) and A8 Downloads, their states, copy and decisions.
- [manual-import.md](../product/manual-import.md): A17.
- [movies.md](../product/movies.md): A6's In the queue card, Files and History tabs, Grab and its toast.
- [settings.md](../product/settings.md): Media management (naming, importing) and Download client (VPN binding, connections).
- [vpn.md](../product/vpn.md): Settings › VPN, its modes, providers and checks (prototyped and approved on 2026-10-20).
- [dashboard.md](../product/dashboard.md) and [system.md](../product/system.md): the Network and Queue widgets, Storage, health checks and tasks.
- [indexers.md](../product/indexers.md): per-indexer seeding rules (checkpoint 5's answer 5).
- [ADR 0005](../adr/0005-in-process-torrent-engine.md) (the in-process engine), [ADR 0011](../adr/0011-no-compatibility-apis.md) (importers import, they emulate nothing), [ADR 0012](../adr/0012-unified-media-item-model.md) (items, versions and `media_files`), [ADR 0019](../adr/0019-database-driver-seam.md) (the engine re-verifies what a lost write forgot), [ADR 0022](../adr/0022-job-queue.md) (idempotent jobs), [ADR 0029](../adr/0029-external-services.md) (the fetch seam and recordings), [ADR 0036](../adr/0036-domain-packages-with-subpath-exports.md) (domain packages).
- The roadmap's [Built-in torrent engine](../roadmap.md) and movie pipeline, and its gap analysis rows for archive extraction, malicious releases, manual import, media management extras, torrent production features, per-tracker seeding rules, filesystem watching, storage realities and the migration importers.
- The prototype: `design/prototypes/src/admin/{activity,downloads}`, the In the queue card and Files and History tabs in `admin/movies/detail.tsx`, the Network and Queue widgets, and the mock server's `queue`, `history`, `blocklist`, `downloads`, `fs`, `manualImport` and `movies.grabRelease`, with its pipeline tick.

## Goal

The owner grabs a release from A6's Search tab, or a search finds one on its own, and highsea downloads it with its own torrent engine, follows it live in Activity and on the movie's page, and imports it when it's done: checked, probed, renamed and hardlinked into `/data/media/movies/Sintel (2010)/`, with the file on the movie's Files tab and the story on its History tab. It seeds to the indexer's rules, then lets go. A release that stalls or carries an executable is blocklisted and replaced. Torrents go through the owner's VPN, set up in Settings › VPN from their provider and checked by highsea, and stop rather than leak when the tunnel drops. A restart mid-download picks up where it left off without checking everything again. Files already on disk, an existing Radarr library and qBittorrent's torrents can come across.

## Out of scope

- **Subtitles** (checkpoint 7). An import ends by queueing a `subtitles.afterImport` job that does nothing yet, so checkpoint 7 only fills it in. The manual-import toast's "Subtitles are next." waits for it.
- **Automation:** RSS sync, missing and cutoff searches, upgrades on a schedule, import lists (checkpoint 8). Grab, Find another and the stall's re-search are built now; they're what checkpoint 8 schedules.
- **Notifications and media server refresh** after import (checkpoint 8).
- **Editing profiles and formats** (checkpoint 8). Importers map onto the seeded profiles.
- **Usenet and cross-seed:** [Later] in the roadmap.
- **Streaming.** The piece picker gets its sequential mode because ADR 0005 asks for it, but nothing plays yet.
- **A VPN container of our own,** or OpenVPN inside highsea ([question V3](#vpn-questions)). highsea runs WireGuard itself; the compose example's gluetun variant covers the rest.
- **highsea as a VPN gateway** for other containers or devices. Its tunnel carries its own torrents (and, if switched on, its indexer searches) only.

## The size of this checkpoint

Checkpoint 6 is the largest in the plan: a BitTorrent engine with production features, a download pipeline, an import pipeline, two importers, four admin screens and a settings area. [Question 1](#open-questions-for-the-owner) recommends building it in two gated halves, 6a and 6b, each reviewed on its own. The rest of this document marks each piece **(6a)** or **(6b)**; if the owner keeps one checkpoint, the marks only set the order of work.

- **6a, the path from grab to library:** first, the Settings › VPN prototype for the owner's approval (answer V5, approved on 2026-10-20); then the engine's core (TCP, trackers, DHT, PEX, magnets, fast resume, limits, queueing, seeding rules, the network binding and kill switch), the download pipeline with protection and stall handling, the import pipeline, manual import, A7, A8, A17, A6's live states, Settings › Media management and Download client, Settings › VPN with the VPN container and interface modes and their checks, and the Sintel end-to-end run.
- **6b, production features and migration:** uTP, IPv6 (peers, trackers and the DHT), protocol encryption, IP blocklists, UPnP and NAT-PMP, highsea connects (its own WireGuard tunnel) with the providers and their port forwarding, the watch folder, categories for manual torrents, archive extraction, filesystem watching, the existing-library import, and the Radarr and qBittorrent importers.
- **Carried from 6a into 6b** (listed in 6a’s report, signed off on 2026-10-20): the sheet’s **Import into the library** for a finished manual torrent (answer 7); a version select per row in A17 (answer 8); and Settings › VPN refusing to save highsea connects until it works, which 6b makes moot by building it.

## Packages

| Package | Holds | Depends on |
| --- | --- | --- |
| `torrent` | The engine behind `TorrentEngine` (ADR 0005): sessions, the state machine, the piece picker, choking, storage, verification in the worker pool, fast resume, limits and queueing, seeding rules, the network binding and kill switch, trackers, DHT, PEX, metadata exchange; later uTP, encryption, blocklists and port mapping | `core`, `db`, the BitTorrent primitives |
| `downloads` | The pipeline from a release to a finished download: grab, the queue, the monitor, stall detection, protection from malicious releases, Find another, the blocklist, the watch folder and manual torrents | `core`, `db`, `jobs`, `torrent`, `indexers`, `media/shared` |
| `media/shared` (grows) | What importing shares across media types: `media_files`, ffprobe through one child-process wrapper, the naming engine, transfers (hardlink, reflink, copy), archive extraction, sample detection, NFO and artwork writing, permissions, the recycle bin, history, the library scan and filesystem watching | `core`, `db`, `jobs`, `quality`, `parser` |
| `media/movies` (grows) | What's movie-only: matching a file to a movie and a version, the movie naming tokens, the movie NFO, the movie import decision, the existing-library import's folder matching | as now |
| `importers` | One-time migration, one subpath each (ADR 0036): `@highsea/importers/radarr`, `@highsea/importers/qbittorrent` | `core`, `media`, `downloads`, `torrent` |
| `vpn` | VPN connections: the modes, the WireGuard tunnel through `ip` and `wg`, its routing rules, the provider mechanisms (configuration files, PIA's API, NAT-PMP, typed-in ports), gluetun's control server, and the checks. It hands `torrent` a binding: an address, a DNS resolver and up or down | `core`, `db`, `catalog`, `schemas` |
| `schemas/vpn` (new subpath) | The catalog's VPN provider format (ADR 0036) | as now |

- **Why `torrent`, `downloads` and `vpn` are their own packages:** ADR 0036 keeps a kind "with heavy or unusual dependencies (native, network)" in its own package. The engine is the most network-heavy code in highsea, `downloads` joins it to the indexers, and `vpn` runs privileged commands and talks to providers.
- **Why importing lives in `media`:** the parent plan named a `library` package before ADR 0036 existed. Importing a file is the media library's job, and shows and music will import the same way, so the shared half goes in `media/shared` and the movie half in `media/movies`. This replaces the parent plan's `library` package (judgement call 1).

## The torrent engine

### The approach

ADR 0005 decided an in-process TypeScript engine: highsea's own session layer on mature JS primitives. Research for this checkpoint (2026-10-20) confirmed the primitives and found three places where they fall short of the [M1] list. [Question 2](#open-questions-for-the-owner) asks the owner to confirm the approach with those findings in view.

- **The primitives** are the WebTorrent project's modules, all MIT, pure JS, and maintained: `bittorrent-protocol` 5.0.9, `bittorrent-dht` 11.0.12, `bittorrent-tracker` 11.2.3, `ut_metadata` 5.0.1, `ut_pex` 5.0.2, `parse-torrent` 11.0.24, `magnet-uri` 7.0.10, `bencode` 4.0.1 (versions and dates from the npm registry, 2026-10-20; each released more than two weeks ago).
- **Not the `webtorrent` client itself.** It can't bind to a local address (its peer connections are a bare `net.connect`, its listener has no host), its uTP is IPv4-only through the unmaintained native `utp-native` (last released 2021), and it pulls in `node-datachannel`, a second native addon, for WebRTC peers highsea doesn't need. ADR 0005 already planned our own session layer; this confirms it.
- **The shortfalls,** each with its plan:
  1. **Binding to an interface.** Node can bind a socket to an address but not to a device: `SO_BINDTODEVICE` "is very unlikely to happen" ([nodejs/node#35769](https://github.com/nodejs/node/issues/35769), closed 2023-10-24). libtorrent's documentation warns that "binding an outgoing connection to a local IP does not necessarily make the connection via the associated NIC" ([libtorrent settings › outgoing_interfaces](https://www.libtorrent.org/reference-Settings.html#outgoing_interfaces)). See [The network binding](#the-network-binding-6a) and [VPN connections](#vpn-connections).
  2. **uTP** (BEP 29): no maintained pure-JS implementation exists. highsea writes its own on the engine's UDP socket, from [BEP 29](https://www.bittorrent.org/beps/bep_0029.html) and LEDBAT ([RFC 6817](https://www.rfc-editor.org/rfc/rfc6817)) (6b, [question 3](#open-questions-for-the-owner)).
  3. **The DHT over IPv6** (BEP 32): `bittorrent-dht` sits on `k-rpc-socket`, which opens `udp4` only. highsea runs a second DHT on IPv6 ([BEP 32](https://www.bittorrent.org/beps/bep_0032.html)) if `k-rpc` takes an injected socket, or carries a small patch otherwise (6b, judgement call 7).
- **A native backend stays possible** behind `TorrentEngine`, as ADR 0005's consequences say, if throughput or one of the above proves out of reach.

### What highsea writes (6a)

- **Sessions and the state machine:** checking, queued, downloading, stalled, paused, seeding, completed, error, as the prototype's `TorrentState`; `importing` and `import-blocked` belong to `downloads`, not the engine.
- **The piece picker:** rarest-first with random first pieces, endgame mode, per-file priorities (skip, normal, high), and the sequential mode ADR 0005 reserves for streaming.
- **Choking:** the reciprocal algorithm of [BEP 3](https://www.bittorrent.org/beps/bep_0003.html) as clients implement it: a rechoke every 10 seconds, an optimistic unchoke every 30, seed-mode unchoking by upload rate. The Fast extension ([BEP 6](https://www.bittorrent.org/beps/bep_0006.html)).
- **Storage:** one file storage that maps pieces to files, writes sparse files, honours skipped files (a skipped file's boundary pieces go in a `.parts` file, as qBittorrent does), and reports what each file has.
- **Verification** of each piece with SHA-1 in the worker pool (`packages/runtime/src/workers.ts`), so hashing never blocks the event loop (ADR 0003).
- **Fast resume:** each torrent's bitfield, its files' sizes and modification times, and its totals, written to the database every 30 seconds and on shutdown. On boot a torrent whose files match resumes without a recheck; one whose files changed is rechecked alone. A write lost to a crash costs at most 30 seconds of pieces, which the check finds again (ADR 0019).
- **Trackers:** HTTP and UDP ([BEP 15](https://www.bittorrent.org/beps/bep_0015.html)), multitracker tiers ([BEP 12](https://www.bittorrent.org/beps/bep_0012.html)), compact peers ([BEP 23](https://www.bittorrent.org/beps/bep_0023.html)), scrape, through `bittorrent-tracker`'s client. Each tracker's status and message for A8's Trackers tab.
- **Peers from everywhere else:** the DHT ([BEP 5](https://www.bittorrent.org/beps/bep_0005.html)), PEX ([BEP 11](https://www.bittorrent.org/beps/bep_0011.html)), magnets through metadata exchange ([BEP 9](https://www.bittorrent.org/beps/bep_0009.html)) over the extension protocol ([BEP 10](https://www.bittorrent.org/beps/bep_0010.html)). **Private torrents** ([BEP 27](https://www.bittorrent.org/beps/bep_0027.html)) use their trackers only: no DHT, no PEX.
- **Limits:** global download and upload rates (a token bucket shared by every peer), connections per torrent and overall, and how many download at once (3 by default, as the prototype). Per-torrent limits and alternative speeds wait ([question 6](#open-questions-for-the-owner)).
- **Seeding rules:** a ratio and a time, whichever comes first, from the release's indexer (checkpoint 5's answer 5), else the global default. Private trackers also get a **minimum seed time** below which a torrent is never removed, so a hit-and-run can't happen (the gap analysis's qbit_manage row).
- **Shutdown:** SIGTERM writes resume data for every torrent, sends `stopped` to trackers with a short deadline, and closes the sockets, before the jobs drain (parent plan, The server process).
- **The listening port:** 6881 TCP and UDP by default, as the roadmap, the Dockerfile and ADR 0020 say; the prototype's mock settings say 51413 and are corrected (judgement call 4). One port for TCP, the DHT and, later, uTP.

### The network binding (6a)

activity-downloads.md decided it: "When the tunnel drops, the engine stops rather than falling back." The engine's half of that is the binding; where the address comes from and what guarantees the path is [VPN connections](#vpn-connections).

- **Every socket is bound** to the address `vpn` hands the engine: the TCP listener's host, each outgoing peer connection's `localAddress` ([Node: socket.connect](https://nodejs.org/docs/latest-v24.x/api/net.html#socketconnectoptions-connectlistener)), the UDP socket's bind address ([Node: socket.bind](https://nodejs.org/api/dgram.html#socketbindoptions-callback)), and tracker requests through an agent with `localAddress` ([Node: http.request](https://nodejs.org/api/http.html#httprequesturl-options-callback)). Sockets are made in one place, `torrent`'s socket factory, so nothing can open one unbound; a test asserts it.
- **Tracker names** are looked up with the engine's own `dns.Resolver`, bound to the same address with `resolver.setLocalAddress()` and pointed at the tunnel's DNS servers ([Node: resolver.setLocalAddress](https://nodejs.org/docs/latest-v24.x/api/dns.html#resolversetlocaladdressipv4-ipv6)), so the system resolver never sees a torrent's tracker.
- **When `vpn` says the tunnel is down,** or a bind fails, every torrent's networking stops at once: no listener, no peers, no trackers, no DHT. The VPN line on A8 turns to its "down" copy and System raises a health warning. When the tunnel is back, the engine binds again and carries on. In the interface mode, `vpn` checks the interface's address with `os.networkInterfaces()` every 2 seconds ([Node: os.networkInterfaces](https://nodejs.org/docs/latest-v24.x/api/os.html#osnetworkinterfaces)).

### Production features (6b)

- **uTP** ([question 3](#open-questions-for-the-owner)): highsea's own BEP 29 implementation with LEDBAT congestion control, on the engine's UDP socket, over IPv4 and IPv6. TCP stays the fallback; a setting turns uTP off.
- **IPv6:** peers over TCP and uTP, IPv6 trackers ([BEP 7](https://www.bittorrent.org/beps/bep_0007.html)), PEX's IPv6 fields, and the IPv6 DHT (BEP 32). With a VPN binding, IPv6 is used only when the interface has an IPv6 address.
- **Protocol encryption** (settings.md: require, prefer, allow): Message Stream Encryption, as the community specification describes it (written up at [Vuze's wiki](https://wiki.vuze.com/w/Message_Stream_Encryption); no BEP covers it). WebTorrent never implemented it (its issue #69 is open), so highsea writes it: Diffie-Hellman with Node's `crypto.createDiffieHellman` and the specification's prime, then RC4. Whether Node 24's OpenSSL 3 still offers RC4 by default or only through the legacy provider is checked against Node's and OpenSSL's documentation at build; if it's legacy only, RC4 is written in TypeScript (it's 30 lines). **Prefer** by default ([question 4](#open-questions-for-the-owner)).
- **IP blocklists:** a list URL (or a file in `/config`) in the formats qBittorrent reads: PeerGuardian P2P text, eMule DAT and binary P2B (`filterparserthread.cpp` in qBittorrent, read for behaviour only; its code is GPL-2.0 and isn't copied). highsea writes the three small parsers into one sorted range set. Fetched daily through the fetch seam; a blocked peer is refused on connect and never announced to.
- **UPnP and NAT-PMP:** `@achingbrain/nat-port-mapper` 4.0.5 (Apache-2.0 OR MIT, 2025-10-14, maintained for libp2p) maps the port when the setting is on. Off whenever a VPN binding is set, because mapping a port on the home router does nothing for a tunnel.
- **Manual torrents and the watch folder** live in `downloads` (below).

## VPN connections

Added on 2026-10-20 at the owner's request: VPN connections are a first-class feature, with their own settings to connect and to check the connection, and support for common providers. The spec is [vpn.md](../product/vpn.md); the owner answered [questions V1 to V6](#vpn-questions) on 2026-10-20, taking every recommendation. Research was done the same day, from the sources cited here.

### What the research found

- **Binding alone can't prove the path.** Node can't bind a socket to a device ([nodejs/node#35769](https://github.com/nodejs/node/issues/35769)), and libtorrent warns that binding to a local address "does not necessarily make the connection via the associated NIC" ([libtorrent settings › outgoing_interfaces](https://www.libtorrent.org/reference-Settings.html#outgoing_interfaces)). The guarantee has to come from the operating system's routing.
- **WireGuard documents how to route by rule** ([WireGuard: Routing & network namespaces › Rule-based routing](https://www.wireguard.com/netns/#rule-based-routing)): a routing table that holds only the tunnel, and a rule that sends chosen packets to it. highsea uses the rule's source-address form, so only torrent traffic, which is bound to the tunnel's address, takes the tunnel. A packet from that address can leave through the tunnel or not at all: the table's last route is `unreachable`, so when the tunnel goes, the kernel refuses the send instead of falling back to the main table.
- **WireGuard is in the Linux kernel** from 5.6 ([WireGuard: Installation](https://www.wireguard.com/install/)). Where a NAS's older kernel lacks it, `wireguard-go` (MIT) runs the same protocol in userspace on `/dev/net/tun`. Debian carries it in main, in bookworm and its backports ([sources.debian.org › wireguard-go](https://sources.debian.org/src/wireguard-go/)), and gluetun falls back the same way.
- **gluetun** (MIT) is the established VPN container. It covers 24 providers by name, plus any custom WireGuard or OpenVPN configuration ([gluetun wiki › Providers](https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers)). It forwards ports natively for Private Internet Access, ProtonVPN, Perfect Privacy and PrivateVPN, and has a control server ([gluetun wiki › Control server](https://github.com/qdm12/gluetun-wiki/blob/main/setup/advanced/control-server.md)):
  - `GET /v1/vpn/status` and `PUT /v1/vpn/status` read the tunnel's state and restart it;
  - `GET /v1/publicip/ip` gives the exit address;
  - `GET /v1/portforward` gives the forwarded port.
  - Every route needs authentication, and an API key in the `X-API-Key` header is one of the documented methods.
- **Port forwarding varies by provider:**
  - **Proton VPN:** NAT-PMP requests to the tunnel's gateway, `10.2.0.1`. The guide maps for 60 seconds and renews every 45. It needs a P2P server and a configuration generated with NAT-PMP on ([Proton: manual port forwarding](https://protonvpn.com/support/port-forwarding-manual-setup)).
  - **PIA:** its own API, in its documented manual-connection scripts (MIT, [pia-foss/manual-connections](https://github.com/pia-foss/manual-connections)), which also register the WireGuard key.
  - **AirVPN:** a static port reserved in the client area ([gluetun wiki › AirVPN](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/airvpn.md)).
  - **Mullvad:** none. It removed port forwarding on 2023-07-01 ([Mullvad blog](https://mullvad.net/en/blog/removing-the-support-for-forwarded-ports)).

### The modes

Settings › VPN offers four, as vpn.md describes: **highsea connects**, **A VPN container**, **An interface on this machine** and **Off**. Whatever the mode, `vpn` hands the engine one binding (an address, a resolver, up or down), so the engine doesn't know which mode is in use.

#### highsea connects (6b)

- **WireGuard only** ([question V3](#vpn-questions)). The kernel's WireGuard through `ip link add … type wireguard`, else `wireguard-go`. The configuration is the format `wg(8)` and `wg-quick(8)` document ([wg-quick(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8)). highsea parses it itself and sets the interface with `wg set` and `ip`, not `wg-quick`, because `wg-quick` would route the whole container through the tunnel.
- **The routing:**
  - an interface of highsea's own (`hswg0`), holding the configuration's addresses;
  - its own routing table, with a default route through `hswg0` and an `unreachable` default after it;
  - a rule sending every packet from the tunnel's addresses to that table, for IPv4 and IPv6.
  - WireGuard's own encrypted packets leave from the container's normal address, so they're untouched.
  - The admin, TMDB, the catalog and updates stay on the main table, so the admin stays reachable on the LAN.
- **Commands:** `wg` and `ip`, from Debian's `wireguard-tools` and `iproute2`, run as separate programs with arguments, never through a shell. One wrapper in `vpn` builds their arguments from typed values, and a test checks that nothing from the owner's input reaches a command unvalidated.
- **Privilege:**
  - The container needs `cap_add: NET_ADMIN`, plus `/dev/net/tun` for the userspace fallback. The capability reaches only the container's own network namespace, not the host's ([Docker: runtime privilege and Linux capabilities](https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities)).
  - The entrypoint starts as root and drops to PUID with `gosu`. When the container has the capability, it drops with `setpriv` instead, keeping `CAP_NET_ADMIN` in the ambient set ([capabilities(7) › Ambient capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)), so `ip` and `wg` work for the PUID user and nothing else is kept.
  - Without the capability, the mode says what to add to the compose file. ADR 0042 records the trade: a flaw in highsea could change the container's own routing, never the host's.
- **Health:** `wg show hswg0 latest-handshakes`. WireGuard renews its keys about every 2 minutes ([WireGuard: Protocol & cryptography](https://www.wireguard.com/protocol/)), while packets flow, and highsea sets a 25-second persistent keepalive so they always do ([wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8)). A handshake older than 3 minutes counts as down. highsea then reconnects, waiting longer after each try, up to 5 minutes. The routing rule keeps the engine inside the whole time.
- **Shutdown and boot:** the interface and rule are removed on SIGTERM, and any left over are cleared on boot.

#### A VPN container (6a)

- highsea joins gluetun's network (`network_mode: "service:gluetun"`), so the container's only route out is the tunnel. This is the guarantee for owners who keep their VPN in gluetun.
- `vpn` reads gluetun's control server with the owner's API key, stored encrypted: the tunnel's state for the binding's up or down, the exit address for the checks, and (6b) the forwarded port. The engine listens on the forwarded port and announces again when it changes.
- **Compose for your provider** writes the gluetun service block from gluetun's documented variables (`VPN_SERVICE_PROVIDER`, `VPN_TYPE`, the WireGuard keys and addresses, `SERVER_COUNTRIES`, `VPN_PORT_FORWARDING`, `HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE` with an API key), beside highsea's `network_mode` line. highsea never gets the Docker socket.

#### An interface on this machine (6a)

- The binding above, to a named interface's address, watched every 2 seconds. It's honest about its limit: "Bound to wg0. Your system's routing decides the path; a VPN container or highsea connects guarantees it."

### Providers (6b)

- **A new catalog kind, `vpn-providers`,** in the format `@highsea/schemas/vpn` defines, signed and released through ADR 0034's pipeline beside the indexers. An entry holds:
  - the provider's name and logo;
  - how highsea connects (a configuration file, or a PIA account);
  - the steps and links for finding what highsea needs in the provider's account, and the fields to show;
  - the port forwarding mechanism (NAT-PMP, PIA, a typed-in port, or none);
  - the provider's own connection check, where it documents one.
- **Mechanisms are code, facts are data:** the configuration parser, PIA's API, NAT-PMP and typed-in ports are written once in `vpn`. A provider that uses one of them ships in the catalog without a server release.
- **At launch** ([question V4](#vpn-questions)):
  - Proton VPN, Private Internet Access, AirVPN and Mullvad, as researched above;
  - IVPN, Windscribe and Surfshark, each checked against its own documentation when its entry is written;
  - **Another WireGuard provider**, for any configuration file.
  - A provider without a documented WireGuard setup for manual use comes through the VPN container instead.
- **NAT-PMP** ([RFC 6886](https://www.rfc-editor.org/rfc/rfc6886)): `@achingbrain/nat-port-mapper` if it takes an explicit gateway and binds to the tunnel's address; otherwise highsea writes RFC 6886's two requests itself (judgement call 15). Mappings are renewed before they expire.
- **PIA:** a token from the username and password, the region list, then the key's registration and port forwarding, as the manual-connection scripts document. Their shapes are recorded by hand for the fake PIA server.

### The checks (6a, with 6b's additions)

- The rows in vpn.md › Checks: the tunnel, the exit address, names, the kill switch, port forwarding (6b) and IPv6. They run on connect, every 5 minutes, after a reconnect, and on **Check now**.
- **The exit address:**
  - Where the provider documents a check of its own, highsea uses it. Otherwise it asks an IP echo service twice through the fetch seam (ADR 0029): once bound to the tunnel, once unbound. The two answers must differ.
  - The service is chosen at build from documented services that need no key, and it's a setting (judgement call 16).
  - In the VPN container mode, highsea takes the exit address from gluetun and has no way to see the server's own address.
- **A failing check that means a leak stops torrents.** That's the exit address matching your own, or names looked up outside the tunnel. A failing check that doesn't, such as port forwarding, only warns.

### Indexers through the VPN (6b)

- A switch, off by default ([question V6](#vpn-questions)): indexer searches and `.torrent` downloads go through the tunnel too, using the indexers' fetch bound to the tunnel's address. Off by default because a private tracker's account is often tied to the owner's own address, and because a search through a down tunnel would fail.

## Downloads

### Grabbing (6a)

- **Grab** on A6's Search tab takes a release from checkpoint 5's `releases` cache by its guid, without searching again. **Grab anyway** grabs a release the decision engine rejected, and says so in the history.
- **The `.torrent` is fetched through the indexer's engine** (its login, cookies and rate limit) or the magnet is used as is. The release's indexer, guid, quality and the version it's for are recorded with the download.
- **Which version:** a grab names one of the movie's versions (ADR 0012). From the Search tab it's the version the tab is showing; from a search job it's the version that search was for. Checkpoint 5's `movies.search` job now grabs the best approved release instead of only logging (judgement call 8).
- **The indexer's grab count** (checkpoint 5's `grabs24h`, zero until now) counts each grab.
- **The toast:** "Grabbed · {release} is downloading. Follow it in Activity." (movies.md).
- **Download folders:** the setup's downloads folder, with a `movies` subfolder for library grabs. Manual torrents go to their category's folder.

### The queue and the monitor (6a)

- **States** as the prototype: Queued → Downloading → Importing → Seeding, with Stalled, Paused, Import blocked and Error, at most three downloading at once.
- **The monitor** follows the engine's events, not a poll. Progress, rates and ETA reach the admin through `queue.updated` and `torrents.updated` at most once a second per torrent (judgement call 5), plus the system `tick` the prototype uses for the Network widget's speeds.
- **Stalled:** no data and no seeds for 2 hours marks a download stalled ("No seeds for 2 hours. highsea will search for another release at 3 hours."); at 3 hours it's blocklisted and replaced, as activity-downloads.md says. A job, safe to repeat.
- **Find another** and **Replace** blocklist the release and grab the best remaining approved one in one step, from the cache or a new search.
- **Completed** downloads hand over to the import pipeline as a job, never in the engine's event handler (parent plan, Known pitfalls).
- **After seeding:** when the rules are met, the torrent is removed. Its data goes with it when the import hardlinked or copied the file; when the import **moved** the file (manual import's Move mode), the torrent is removed as soon as the import finishes.

### Protection from malicious releases (6a)

The gap analysis's Cleanuparr row, with Radarr's lists as the established practice:

- **Blocked extensions:** Radarr's executable list (`.bat .cmd .exe .sh`) and its "dangerous" list (`.arj .lnk .lzh .ps1 .scr .vbs .zipx`), the same in Radarr and Sonarr ([FileExtensions.cs](https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/FileExtensions.cs)).
- **Checked as early as possible:** from the `.torrent`'s file list before anything downloads, or from a magnet's metadata as soon as it arrives. A release with a blocked file is stopped, blocklisted and replaced automatically, before it costs any bandwidth, as Radarr's per-indexer "Fail Downloads" does. The state copy becomes "The release contains an executable file (Nosferatu.exe). It wasn't downloaded, and it has been blocklisted." (judgement call 9).
- **Checked again at import,** for anything that slipped through (a manual torrent marked for import): the spec's **Import without the blocked file** stays for that case.
- **Password-protected archives** are blocked at extraction (6b) with "The release is a password-protected archive." and replaced.
- **Samples** are skipped by runtime, not by name: under 600 seconds for a normal-length film, as Radarr's `DetectSample` does ([DetectSample.cs](https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/MovieImport/DetectSample.cs)). The threshold is injectable so tests use short clips.

### Manual torrents, categories and the watch folder

- **Add torrent** (6a) on A8: a magnet, a `.torrent` file or a URL, as activity-downloads.md specifies. Manual torrents aren't imported into the library (the spec's copy).
- **Import into the library** (6a) on a finished manual torrent opens A17 on its folder ([question 7](#open-questions-for-the-owner)).
- **Categories** (6b): `movies` is fixed for library grabs; the owner adds their own for manual torrents, each with a folder ([question 5](#open-questions-for-the-owner)).
- **The watch folder** (6b): a folder (off by default) where a dropped `.torrent` is added as a manual torrent in a chosen category, then renamed `.torrent.added`, as qBittorrent and Transmission do.

## Importing

### The import pipeline (6a)

A job per finished download, safe to repeat: each step checks whether it already happened.

1. **Find the files:** video files by extension; samples, `._` files and extras skipped with a reason (manual-import.md's "A sample (18 MB). Skipped.").
2. **Extract** archives first (6b, below).
3. **Probe** each candidate with ffprobe (`-show_format -show_streams -of json`, [ffprobe documentation](https://ffmpeg.org/ffprobe.html)) through one child-process wrapper with a timeout. HDR from `color_transfer` (`smpte2084`, `arib-std-b67`) and Dolby Vision from the stream's DOVI configuration record; HDR10+ needs the first frame's side data, read with `-show_frames -read_intervals "%+#1"` as Radarr does ([VideoFileInfoReader.cs](https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/MediaInfo/VideoFileInfoReader.cs)).
4. **Decide:** the quality from the release name (checkpoint 4's parser) and the probe's resolution; the profile's check that this is wanted (an upgrade, or a version's first file).
5. **Name** it from the naming templates (below).
6. **Transfer:** hardlink by default; if `link` fails with `EXDEV` (different filesystems, [link(2)](https://man7.org/linux/man-pages/man2/link.2.html)) or the filesystem refuses it (SMB and NFS), copy with `COPYFILE_FICLONE`, which makes a copy-on-write reflink where the filesystem has one and a plain copy where it doesn't ([Node: fs.copyFile](https://nodejs.org/docs/latest-v24.x/api/fs.html#fscopyfilesrc-dest-mode-callback)). The history says which happened ("Copied: the downloads folder is on another disk."), as the parent plan's pitfalls ask.
7. **Replace** an older file for the same version: to the recycle bin when one is set, else deleted.
8. **Record:** a `media_files` row with the probe's streams, the version's `fileId`, the movie's status (Available), a history entry, NFO and artwork if on, permissions if set.
9. **Announce:** `movies.updated`, `item.updated`, `history.updated`, `queue.updated`; queue `subtitles.afterImport` (empty until checkpoint 7).

Every path is normalized and checked to be under an allowed root (the root folders and the downloads folder) before anything is read or written (parent plan, Known pitfalls).

### Naming (6a)

- **Tokens** follow Radarr's, so a migrating owner's formats mean the same thing ([Radarr settings › Movie naming](https://wiki.servarr.com/radarr/settings#movie-naming-1)): `{Movie Title}`, `{Movie CleanTitle}`, `{Movie TitleThe}`, `{Movie OriginalTitle}`, `{Movie Collection}`, `{Release Year}`, `{ImdbId}`, `{TmdbId}`, `{Quality Full}`, `{Quality Title}`, `{MediaInfo VideoCodec}`, `{MediaInfo AudioCodec}`, `{MediaInfo AudioChannels}`, `{MediaInfo VideoDynamicRangeType}`, `{Release Group}`, `{Edition Tags}`, `{Custom Formats}`, and the conditional forms `{imdb-{ImdbId}}` and `{edition-{Edition Tags}}`.
- **Defaults:** folder `{Movie Title} ({Release Year})`, file `{Movie Title} ({Release Year}) {Quality Full}`, as the prototype's settings (and Radarr's). The movie's own folder (`media_items.path`) already uses the folder format from checkpoint 4.
- **Rename on by default,** unlike Radarr, because highsea owns the library from the first import and the prototype's settings default to it.
- **The live preview** in Settings ("Becomes Sintel (2010) Bluray-1080p.mkv") and A17's "becomes" column call the same function as the import.

### Archive extraction (6b)

- **`unar`** from Debian's main archive (LGPL-2.1; RAR including RAR5 and multi-volume sets, 7z and zip), run as a child process with a timeout, extracting into a folder beside the download. It's added to the Docker image.
- **Not unRAR or anything built from it:** its licence forbids using the source to recreate the RAR algorithm and Debian ships it in non-free ([Debian copyright](https://metadata.ftp-master.debian.org/changelogs/non-free/u/unrar-nonfree/unrar-nonfree_6.2.6-1+deb12u1_copyright)), so it can't sit in an AGPL work. That rules out `node-unrar-js` too, which also can't read multi-volume sets.
- **A password-protected archive** stops with `unar`'s error, is blocked and replaced.
- **The extracted copy** is removed after import; the archive stays to seed.

### NFO, artwork, permissions and the recycle bin (6a)

- **NFO** (off by default, as the prototype): Kodi's movie format, `<movie>` with `title`, `uniqueid` (TMDB and IMDb), `originaltitle`, `sorttitle`, `ratings`, `plot`, `runtime`, `genre`, `set`, `premiered`, `director`, `actor` and the probe's `fileinfo/streamdetails`, named `<file>.nfo` ([Kodi: NFO files/Movies](https://kodi.wiki/view/NFO_files/Movies)).
- **Artwork** with the NFO: `poster.jpg` and `fanart.jpg` in the movie's folder, from the image cache ([Kodi: Movie artwork](https://kodi.wiki/view/Movie_artwork)).
- **Permissions:** an optional chmod for new folders and files.
- **Recycle bin:** an optional folder replaced and deleted files go to, emptied after a number of days by a job.
- **Stop monitoring deleted files** (the prototype's setting): a movie whose file disappears from disk outside highsea becomes unmonitored.

### Manual import (6a)

- **A17** as the prototype: the folder browser opens on the downloads folder; each file shows its skip reason or its movie, quality, size and the name it becomes; **Hardlink** (default) or **Move**.
- **Several files for one movie** ([question 8](#open-questions-for-the-owner)): each goes to one of the movie's versions, chosen per row, defaulting to versions without a file.
- **The folder browser** (`fs.list`) lists only inside the data root (`HIGHSEA_DATA_DIR`), the same rule as setup's folders.

### Watching the filesystem and the library scan (6b)

- **The scan is the source of truth:** a job walks each root folder every 12 hours and after each import, finding files added, changed or removed outside highsea, as Jellyfin's library scan does (every 12 hours, [RefreshMediaLibraryTask.cs](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/ScheduledTasks/Tasks/RefreshMediaLibraryTask.cs)).
- **Watching only speeds it up:** `fs.watch` with `recursive` (on Linux since Node 19.1.0) where it works. Node's documentation calls it "unreliable, and in some cases impossible, on network file systems (NFS, SMB, etc)" ([Node: fs.watch caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html#caveats)), and inotify has a per-user watch limit ([inotify(7)](https://man7.org/linux/man-pages/man7/inotify.7.html)), so a failure to watch falls back to the scan with a health note, never an error. No dependency: chokidar 5 would add little over `fs.watch` here (judgement call 10).
- **A file that appears** in a movie's folder is probed and recorded; one that disappears clears the version's file, and with **Stop monitoring deleted files** on, unmonitors the movie.

### The existing-library import (6b)

For an owner whose movies are already on disk ([question 9](#open-questions-for-the-owner)):

- Point at a root folder; each subfolder's name is parsed (`Title (Year)`, with any `{tmdb-…}` or `{imdb-…}` id), matched on TMDB (the key is required, as for adding), and shown for confirmation with the file's probe.
- Confirmed movies are added with their files **in place**: no move, no rename unless the owner ticks **Rename to my format**.
- A job, so a library of thousands runs in the background with progress.

## The importers (6b)

One-time migration, as ADR 0011 says: they read another program's data and emulate nothing.

### Radarr

- **Through Radarr's API v3,** with its URL and API key (`X-Api-Key`, [Radarr API](https://radarr.video/docs/api/)): `movie`, `moviefile`, `qualityprofile`, `rootfolder`, `tag`, `config/naming`, `config/mediamanagement`, `blocklist/movie`, `history/movie`.
- **What comes across:** movies by TMDB id with monitored and minimum availability; their existing files, probed again by highsea rather than trusted; tags; the naming format; the blocklist; root folders when they're inside highsea's data root.
- **Quality profiles** map onto highsea's seeded ones, nearest first by cutoff, shown in a preview the owner can change before importing ([question 10](#open-questions-for-the-owner)). Custom profiles arrive with the editors in checkpoint 8.
- **What can't come across:** indexer and download-client credentials, because Radarr's API returns them as `********` ([SchemaBuilder.cs](https://github.com/Radarr/Radarr/blob/develop/src/Radarr.Http/ClientSchema/SchemaBuilder.cs)). The importer says so and links to A9.
- **Paths:** when Radarr ran in another container, a path mapping (Radarr's `/movies` is highsea's `/data/media/movies`).

### qBittorrent

- **Through its WebUI API v2** ([qBittorrent WebUI API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0))): log in, list torrents and categories, read each torrent's properties and files, and export its `.torrent` with `torrents/export`, added in qBittorrent **4.5.0** (API 2.8.18; [WebAPI changelog](https://github.com/qbittorrent/qBittorrent/blob/master/WebAPI_Changelog.md)). Older versions are refused with the version needed.
- **What comes across:** each torrent with its save path (through a path mapping), category, ratio and seed-time limits, and uploaded and downloaded totals; categories with their folders.
- **Fast-resume data isn't in the API** (it's in qBittorrent's `BT_backup` folder or `torrents.db`), so each imported torrent is checked once in the background, a few at a time, then seeds. Torrents that match a Radarr-imported movie are linked to it.
- **qBittorrent keeps running** until the owner stops it; the importer adds torrents paused and asks the owner to stop qBittorrent before resuming them, so two clients never write the same files.

## Data

From the parent plan's [first pass](phase-3-server.md#data), as migration 0006:

- `torrents`: id, info hash (v1), name, the metainfo (bencoded) or magnet, save path, category, state and its reason, whether it's private, added, completed, totals uploaded and downloaded, seeding rule, `manual`.
- `torrent_files`: per torrent, path, size, priority.
- `torrent_resume`: per torrent, the bitfield, the files' sizes and modification times, written every 30 seconds and on shutdown.
- `downloads`: the parent plan's `queue_items`, named for what they are: a grab of a release for a movie version, with the torrent, the indexer and guid, the quality, the state (`downloading`, `importing`, `import-blocked`, `completed`, `failed`) and its reason. A7's queue reads it joined to `torrents`.
- `media_files`: path, size, quality, the release group and scene name, the probe's streams as JSON, the version it belongs to, added.
- `history`: per item, the event type (the prototype's `grabbed`, `imported`, `import-failed`, `deleted`, `renamed`, `blocklisted`, plus `subtitle-*` for checkpoint 7), the release, quality, indexer, a message and data. Cursor-paged.
- `blocklist`: per item, the release title, indexer, info hash, reason, date. Search and grab skip what's on it.
- `indexers` gains `seed_ratio`, `seed_minutes` and `min_seed_minutes`.
- **Settings rows:** `mediaManagement` (naming and importing), `downloadClient` (port, encryption, UPnP, limits, downloading at once, uTP, blocklist URL, watch folder) and `vpn` (the mode, the provider and its fields, the interface, gluetun's address and API key, the behaviour switches). The VPN's secrets (private and preshared keys, the PIA password, gluetun's API key) are sealed like indexer secrets and the TMDB key. Setup's existing `media` row (the movies and downloads folders) is renamed `folders` in the migration, because settings.md's `settings.get('media')` means naming (judgement call 3).
- **Default folders** in code become setup.md's `/data/media/movies` and `/data/downloads` (the code says `/data/movies` today); the TRaSH Guides' layout puts both under one `/data` so hardlinks work ([TRaSH: Docker folder structure](https://trash-guides.info/File-and-Folder-Structure/How-to-set-up/Docker/)) (judgement call 2).
- **A test seeds 100k `history` rows** and checks the item and global history pages stay on an index, as checkpoint 4 did for the library.

## API

From the specs, with the changes real data forces:

| SDK | Route | Change from the spec |
| --- | --- | --- |
| `movies.grabRelease(id, guid, { versionId?, force? })` | `POST /api/v1/movies/{id}/releases/{guid}/grab` | Adds the version and `force` (Grab anyway) |
| `movies.files(id)` | `GET /api/v1/movies/{id}/files` | As specified |
| `movies.history(id, cursor?)` | `GET /api/v1/movies/{id}/history` | Cursor-paged |
| `queue.list()` | `GET /api/v1/queue` | As specified |
| `queue.pause / resume / forceImport / searchAlternative` | `POST /api/v1/queue/{id}/{action}` | As specified |
| `queue.remove(id, { deleteData, blocklist })` | `DELETE /api/v1/queue/{id}` | Adds `blocklist` |
| `history.list(cursor?)` / `history.clear()` | `GET` / `DELETE /api/v1/history` | Cursor-paged |
| `blocklist.list()` / `blocklist.remove(id)` | `GET /api/v1/blocklist`, `DELETE /api/v1/blocklist/{id}` | As specified |
| `downloads.list()` / `get(id)` | `GET /api/v1/torrents[/{id}]` | As specified; `get` carries files, trackers and the seeding rule |
| `downloads.add(input)` | `POST /api/v1/torrents` | A magnet or URL as JSON, a `.torrent` as multipart; the mock's `savePath` comes from the category |
| `downloads.delete(id, deleteData)` | `DELETE /api/v1/torrents/{id}` | As specified |
| `downloads.pause / resume / pauseAll / resumeAll` | `POST /api/v1/torrents[/{id}]/{action}` | As specified |
| `downloads.setFilePriority(id, path, priority)` | `PATCH /api/v1/torrents/{id}/files` | As specified |
| `downloads.limits()` / `setLimits()` | `GET` / `PATCH /api/v1/torrents/limits` | The VPN fields come from `vpn.status()` |
| `vpn.status()` | `GET /api/v1/vpn/status` | New: the mode, provider, state, exit address and country, forwarded port, the checks |
| `vpn.check()` / `vpn.reconnect()` | `POST /api/v1/vpn/check`, `POST /api/v1/vpn/reconnect` | New |
| `vpn.providers()` (6b) | `GET /api/v1/vpn/providers` | New: the catalog's providers, their steps and fields |
| `downloads.categories()` and `saveCategory`, `removeCategory` (6b) | `/api/v1/torrents/categories` | New, for question 5 |
| `fs.list(path)` | `GET /api/v1/fs?path=` | Inside the data root only |
| `manualImport.scan(path)` / `run(files, mode)` | `POST /api/v1/import/scan`, `POST /api/v1/import` | `run`'s files carry a `versionId` |
| `libraryImport.scan(root)` / `run(items)` (6b) | `POST /api/v1/import/library/scan`, `POST /api/v1/import/library` | New, for question 9 |
| `importers.radarr.preview(conn)` / `run(conn, mapping)` (6b) | `POST /api/v1/importers/radarr/preview`, `…/run` | New |
| `importers.qbittorrent.preview(conn)` / `run(conn, mapping)` (6b) | `POST /api/v1/importers/qbittorrent/preview`, `…/run` | New |
| `settings.get/save('mediaManagement' \| 'downloadClient' \| 'vpn')` | `GET` / `PUT /api/v1/settings/{section}` | The sections settings.md lists, named apart from setup's folders; `vpn` is new (vpn.md) |
| `system.speeds()` | `GET /api/v1/system/speeds` | As the prototype: the last 10 minutes of rates |

- **Access:** all `staff`, except Settings › Download client, Settings › VPN, `vpn.check`, `vpn.reconnect`, `vpn.providers` and the importers, which are `owner`: the VPN, port and encryption are network settings, which ADR 0032's answers keep owner-only, and an importer takes another program's credentials. `fs.list` is `staff` and never leaves the data root.
- **Events:** `queue.updated`, `torrents.updated`, `history.updated`, `vpn.updated`, plus `tick` for live rates. The plan said `queue.updated` and the specs `queue.changed`; every topic built so far ends in `.updated`, so it's `queue.updated` and the specs follow (judgement call 6).
- **Public info's `sources`** gains `downloads`, so the Network and Queue widgets come alive (dashboard.md).
- **The client API's `playable`** turns true for an item with a file (client-library.md); `ClientDetail`'s track lists come from the probe's streams.

## Admin

- **A7 Activity** (6a): Queue, History and Blocklist ported from the prototype, with the filter tabs and counts, the needs-attention rows and their fixes; **Manual import** opens A17.
- **A8 Downloads** (6a): the VPN line first, the state tabs, the torrent sheet's General, Files, Trackers and Seeding tabs (Seeding read-only, from the indexer, as decided), Add torrent, Limits, Pause all and Resume all. The category select arrives with 6b.
- **A17 Manual import** (6a): as the prototype.
- **A6** (6a): **Grab** and **Grab anyway** enabled; the **In the queue** card on Overview with live progress; the Files tab's cards with the probe's streams; the History tab; Search now's toast points at Activity again ("Follow it in Activity").
- **The shell** (6a): the sidebar's Activity count, the palette's download actions, import toasts.
- **The dashboard** (6a): Network (speeds and the 10-minute sparkline) and Queue come alive; Storage shows what files take.
- **Settings › Media management** (6a): the Naming group with the live preview and tokens, and the Importing group (hardlinks, NFO, stop monitoring deleted files, permissions, recycle bin), beside checkpoint 4's root folders.
- **Settings › Download client** (6a; replaces the "later" area): Connections (port, encryption, downloading at once, UPnP), and the VPN's status in one line with **VPN settings**; uTP, the blocklist and the watch folder join it in 6b.
- **Settings › VPN** (new layout, prototyped first and approved by the owner on 2026-10-20, [answer V5](#vpn-questions); `design/prototypes/src/admin/settings/vpn.tsx` is the build reference): Status, Connection and Behaviour, as vpn.md describes. 6a builds the area with the VPN container and interface modes and their checks; 6b adds highsea connects, the providers, port forwarding and the indexers switch.
- **A9's Edit dialog** (6a): the seeding rules (ratio, time, minimum seed time) join priority, as checkpoint 5's answer 5 said.
- **System** (6a): health checks for the VPN (down, the exit address your own, and in 6b port forwarding failing and the missing capability), disk space on each root and the downloads folder, folders that aren't writable, and imports falling back to copies; tasks for the stall check, the recycle bin, and (6b) the library scan and blocklist update.
- **Migration** (6b, [question 10](#open-questions-for-the-owner)): where the importers live.
- **Sweeps:** the server sweep boots with the fake indexer, a local tracker and a seeding engine, grabs Sintel, and visits A7's tabs mid-download and after, A8 with the sheet open, A17 on the downloads folder, A6's live card, Files and History, and both settings areas, in the usual three themes, overflow, 200% text, reduced motion and the keyboard walk.

## Test media and the swarm

- **The parent plan's test media** is "a short CC clip cut from *Sintel*, with its published subtitles; fetched by a script into a gitignored cache with a checksum". Research found download.blender.org behind a Cloudflare challenge that a script can't pass, and the clip isn't needed until checkpoint 7's sync test ([question 11](#open-questions-for-the-owner)).
- **For this checkpoint, the media is generated:** ffmpeg's `lavfi` sources (`testsrc2` for video, `sine` for audio, [ffmpeg devices › lavfi](https://ffmpeg.org/ffmpeg-devices.html#lavfi)) make short clips with no copyright at all, in test setup: SDR, PQ-tagged HDR, several audio languages, and a subtitle track. The E2E's "Sintel.2010.1080p.BluRay.x264" is a generated clip carrying that release name.
- **Archives for extraction tests** come from libarchive's own test suite (BSD-2-Clause), which holds RAR, RAR5 and multi-volume samples, so no one needs the proprietary RAR tool to make fixtures.
- **The swarm is local:** a `bittorrent-tracker` server on loopback (HTTP and UDP), a second highsea engine seeding the generated file, and a small DHT of local nodes. Nothing reaches the network.
- **CI** installs `ffmpeg` and `unar` from Ubuntu's archive, as the Docker image has them.
- **ADR 0040** records this, as the parent plan's ADR list asks (its item 7, test media).

## Tests

- **`torrent`:**
  - the parent plan's local-tracker test: engine A seeds, engine B downloads, hashes check, pause and resume, fast resume;
  - a corrupt piece is refetched from another peer; a peer that keeps sending bad pieces is banned;
  - magnets through metadata exchange; private torrents never touch the DHT or PEX;
  - choking and the picker against scripted peers; rate limits within 10% over a run;
  - **the kill switch:** with an injected interface list, every socket the factory makes is bound to the interface's address; removing the interface stops all networking within 2 seconds and opens nothing on any other address; bringing it back resumes;
  - the resolver: tracker names are looked up only through the bound resolver, never the system's;
  - (6b) uTP between two engines on loopback, including loss and reordering through a lossy test socket; IPv6 on `::1`; encryption required, preferred and allowed against each other; blocklist parsing in all three formats; port mapping against a fake gateway.
- **`vpn`:**
  - configuration files parsed as `wg(8)` documents them, and refused with the vpn.md copy when they're not;
  - the command wrapper's arguments for every operation, built from typed values, with hostile input refused before any command runs;
  - the checks' state machine with a fake clock: handshake age, reconnecting with longer waits, a leak stopping torrents and a warning not;
  - a fake gluetun control server (status, exit address, forwarded port, a wrong API key), written from its documentation;
  - (6b) a fake PIA API from the manual-connection scripts' shapes, a fake NAT-PMP gateway on loopback speaking RFC 6886, and the provider catalog's schema and seed;
  - **(6b) the leak test,** on Linux in CI: in a container with `NET_ADMIN`, a second network namespace plays the provider with its own WireGuard peer. highsea brings up `hswg0` and downloads from a peer reachable only through it. Then the tunnel is deleted, and a send from the tunnel's address must fail while a capture on the normal interface sees nothing from it. Nothing reaches the internet. It's skipped, and says so, on machines without the capability.
- **`downloads`:** grab from the cache by guid; the queue's limit of three; stall at 2 hours and replace at 3 with a fake clock; Find another; blocked extensions stopped before downloading; the seeding rules and the hit-and-run minimum; removal after seeding.
- **`media`:** the import pipeline end to end on generated clips; samples skipped; naming tokens against Radarr's documented examples; hardlink, then the copy fallback forced with a fake `EXDEV`; replacement and the recycle bin; NFO against Kodi's format; paths outside the allowed roots refused; (6b) extraction, multi-volume and password-protected; the scan finding added and removed files; the existing-library import.
- **`importers`** (6b): against a fake Radarr and a fake qBittorrent serving recordings written from their documented API shapes, as checkpoint 5's fake indexer is. No real instance's data or keys are recorded.
- **The resilience test** (parent plan): kill the server mid-download, boot it again, and the download resumes without a full recheck; a job interrupted mid-import runs again and finishes once.
- **The end-to-end run** (parent plan, exit criteria 2.3 to 2.5): add *Sintel (2010)*, grab it from the fake indexer, watch progress over SSE, and find the file at `/data/media/movies/Sintel (2010)/Sintel (2010) Bluray-1080p.mkv` with a history entry. In this checkpoint it runs in-process; under Docker with Playwright in checkpoint 9.
- **Integration:** each new route's happy path and access through the SDK; the guard table picks up the new routes.
- **Node smoke:** boots the engine under Node 24.21, binds its port, and shuts down writing resume data.

## ADRs

- **0037, the torrent engine as built:** the primitives used and why not the `webtorrent` client, the socket factory and the two-layer kill switch, fast resume, our own uTP and encryption, the IPv6 DHT. It amends ADR 0005, which stays the decision.
- **0038, downloads:** grab by guid, the queue's states, stall detection, protection before and after download, Find another, seeding rules and the hit-and-run minimum.
- **0039, importing:** the pipeline's steps and their idempotence, ffprobe as a child process, naming, hardlink, reflink and copy, extraction with `unar` and why not unRAR, the scan as the source of truth.
- **0040, test media:** generated clips, libarchive's archive fixtures, the local swarm; the Sintel clip's place in checkpoint 7.
- **0041, the migration importers:** API over database, what can't come across, path mappings, why qBittorrent's torrents are rechecked once.
- **0042, VPN connections:** the four modes and which one guarantees what; WireGuard's routing by source address; `NET_ADMIN` kept in the ambient set and what that exposes; `ip` and `wg` as separate programs; gluetun's control server; provider facts as catalog data; the checks, and which failures stop torrents.

## Docker and licences

- **The image gains `unar`** from Debian main, and for the VPN `wireguard-tools`, `iproute2` (both GPL-2.0, run as separate programs, so aggregation, as with ffmpeg) and `wireguard-go` (MIT), all from Debian main.
- **The entrypoint** keeps `CAP_NET_ADMIN` in the ambient set when it drops to PUID, if the container was given it (`setpriv` from util-linux, already in the base image).
- **ffmpeg** stays Debian's, run as a separate process. Debian builds it with `--enable-gpl`, so the binaries are GPL-2.0-or-later; a separate program run over arguments and pipes is aggregation, not a combined work ([GPL FAQ › Mere aggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)). The image's notice gains the source offer for the Debian packages it ships.
- **The compose example** gains two VPN variants: highsea connects (`cap_add: [NET_ADMIN]`, with `/dev/net/tun` commented for the userspace fallback) and gluetun (`network_mode: "service:gluetun"`, its control server's API key, the admin's port published on gluetun's service). The Dockerfile's `EXPOSE` keeps 6881 TCP and UDP.
- **New dependencies** are all MIT or Apache-2.0 and pass `bun run licenses`; each is pinned by `bun run pin`.

## Specs owed

Updated as part of the checkpoint, each change listed in the report:

- **vpn.md:** as built, the owner's answers to V1 to V6, and the layout once approved.
- **activity-downloads.md:** the answered open questions, the "wasn't downloaded" copy, the VPN line with the provider and port, `queue.updated`, the API table.
- **manual-import.md:** versions per row, the answered open question.
- **movies.md:** Grab and Grab anyway, the version, the live card, Files and History as built, the toast.
- **settings.md:** Media management's groups as built; Download client's groups, with uTP, the blocklist and the watch folder; the VPN area; the `mediaManagement`, `downloadClient` and `vpn` sections.
- **indexers.md:** the seeding rules in the Edit dialog.
- **dashboard.md** and **system.md:** the live widgets, the new health checks and tasks.
- **setup.md:** the folder defaults as built.
- **roadmap.md:** the engine's findings (no binding by device in Node, our own uTP and encryption), the importers' limits, `unar`, VPN connections.
- **The prototype's mock:** port 6881, `queue.updated`.

## Open questions for the owner

### VPN questions

Added on 2026-10-20 with [VPN connections](#vpn-connections). Each has a recommendation; the first option is it.

**Answered on 2026-10-20: the owner took the recommendation on all six.** In short:

- V1. 6a builds Settings › VPN with the VPN container and interface modes and their checks; 6b adds highsea connects, the providers, port forwarding and the indexers switch.
- V2. highsea runs the WireGuard tunnel itself, with `NET_ADMIN` and routing by source address.
- V3. WireGuard only inside highsea; OpenVPN-only providers come through the VPN container.
- V4. Proton VPN, Private Internet Access, AirVPN, Mullvad, IVPN, Windscribe and Surfshark, plus Another WireGuard provider, in the signed catalog.
- V5. Settings › VPN is prototyped in `design/prototypes` first, with the A8 line and the Download client line, and approved before 6a builds it.
- V6. Indexers through the VPN is a switch, off by default.

V1. **Which half builds what.**
   - **Recommended:** 6a builds Settings › VPN with the VPN container and interface modes and their checks, so the area isn't built twice. 6b adds highsea connects, the providers, port forwarding and the indexers switch, beside the other production features.
   - Or: all of it in 6a, which makes the largest half larger.
   - Or: a third half, 6c, for the VPN alone, after 6b.

V2. **highsea runs the tunnel itself.**
   - **Recommended:** yes, WireGuard inside highsea's container, with `NET_ADMIN` and routing by source address. It's the only mode where highsea both sets the VPN up and guarantees the kill switch, and the admin stays on the LAN. The VPN container and interface modes stay for owners who already run one.
   - Or: no. highsea never changes the network; Settings › VPN checks the connection and writes the gluetun compose block for the provider, and gluetun stays the guarantee.

V3. **OpenVPN.**
   - **Recommended:** WireGuard only inside highsea; OpenVPN-only providers come through the VPN container. Every provider researched offers WireGuard, and OpenVPN would add a second binary, `/dev/net/tun` always, and another set of failure modes.
   - Or: OpenVPN inside highsea too, with Debian's `openvpn`.

V4. **The providers at launch.**
   - **Recommended:** Proton VPN, Private Internet Access, AirVPN, Mullvad, IVPN, Windscribe and Surfshark, plus Another WireGuard provider, in the signed catalog so more can follow without a release.
   - Or: the four researched (Proton VPN, PIA, AirVPN, Mullvad) and Another WireGuard provider, the rest later.

V5. **The layout.** No prototype covers it, so any layout is new and needs the owner's approval.
   - **Recommended:** a prototype of Settings › VPN in `design/prototypes` first, approved before 6a builds it, with the A8 line and the Download client line beside it.
   - Or: approve vpn.md's draft layout now and build it straight from the spec, as questions 9 and 10 were.
   - Or: grow Download client's VPN group instead of a new area.

V6. **Indexers through the VPN.**
   - **Recommended:** a switch, off by default. A private tracker's account is often tied to the owner's own address, and a search shouldn't fail because the tunnel is down.
   - Or: on by default when a VPN is set.
   - Or: torrents only, no switch.

### Checkpoint questions

Each has a recommendation; the first option is it.

**Answered on 2026-10-20: the owner took the recommendation on all eleven.** In short:

1. Two gated halves, 6a (grab to library) and 6b (production features and migration), each reviewed on its own.
2. ADR 0005 stands: highsea's own TypeScript engine on the WebTorrent project's primitives, with the two-layer kill switch. The kill switch is now part of [VPN connections](#vpn-connections), added afterwards.
3. highsea writes its own uTP in 6b, TCP as the fallback.
4. Protocol encryption defaults to Prefer.
5. `movies` is a fixed category; the owner adds their own for manual torrents, each with a folder.
6. Global limits only; per-torrent limits and alternative speeds later.
7. A finished manual torrent offers Import into the library from the sheet's More menu, opening A17.
8. Manual import picks a version per row.
9. The existing-library import is a Library import mode of A17, opened from Media management's root folders. Approved as new layout.
10. The importers live in a Migration area in Settings' System group, owner only, linked from setup's welcome. Approved as new layout.
11. Generated clips for this checkpoint; the Sintel clip comes with checkpoint 7.

1. **One checkpoint or two.**
   - **Recommended:** two gated halves. **6a** is the path from grab to library (the engine's core with the kill switch, downloads, importing, manual import, A7, A8, A17, A6's live states, both settings areas, the Sintel run). **6b** is production features and migration (uTP, IPv6, encryption, blocklists, UPnP and NAT-PMP, VPN port forwarding, categories, the watch folder, extraction, filesystem watching, the existing-library import, the importers). Each stops for review. Nothing leaves milestone 1 (decision 1).
   - Or: one checkpoint, reviewed once at the end.
2. **The engine, with the research in view** (ADR 0005).
   - **Recommended:** keep ADR 0005: highsea's own session layer in TypeScript on the WebTorrent project's primitives, our own uTP and encryption, and the two-layer kill switch (every socket bound to the interface's address and stopped when it goes; a VPN container as the guarantee). One process, no native addon, and a native backend can still come later behind `TorrentEngine`.
   - Or: libtorrent (BSD) in a sidecar process. The most complete engine available, with binding by device name built in, but a native build per platform, a second process beside ADR 0003's one, and it reverses ADR 0005.
   - Or: rqbit (Apache-2.0, Rust) in a sidecar, behind its HTTP API. Lighter than libtorrent, but no documented NAT-PMP or seeding rules, and the same sidecar costs.
3. **uTP.**
   - **Recommended:** highsea writes its own (BEP 29 with LEDBAT) in 6b, on by default once the loopback tests pass, with TCP as the fallback.
   - Or: TCP only in milestone 1, uTP later. This moves an [M1] item, so it changes decision 1.
4. **Protocol encryption's default.**
   - **Recommended:** **Prefer** (encrypt when the peer can, plain otherwise), as qBittorrent and Transmission default to.
   - Or: **Require**, which some ISPs make useful but which shrinks the swarm.
5. **Categories** (activity-downloads.md's open question).
   - **Recommended:** `movies` fixed for library grabs (later `shows`, `music`), plus the owner's own categories for manual torrents, each with a folder.
   - Or: fixed per media type only, with manual torrents in one `manual` folder.
6. **Per-torrent limits and alternative speeds** (activity-downloads.md's open question).
   - **Recommended:** global limits only in milestone 1; per-torrent limits and a scheduled alternative speed later. They're not [M1] items, and the Limits dialog stays as the prototype has it.
   - Or: both now, which adds fields to the torrent sheet and the Limits dialog (locked layouts).
7. **A finished manual torrent's Import into the library** (activity-downloads.md's open question).
   - **Recommended:** yes, in the torrent sheet's More menu, opening A17 on its folder.
   - Or: no; manual torrents stay out of the library.
8. **Several files for one movie in manual import** (manual-import.md's open question).
   - **Recommended:** each row picks one of the movie's versions, defaulting to the versions without a file; two files for one version is refused with "Pick another version for one of these."
   - Or: ask in a dialog when it happens.
9. **Where the existing-library import lives.** No prototype screen covers it, so any place is new layout.
   - **Recommended:** a **Library import** mode of A17: the same table, with folders instead of files and the TMDB match as the movie column, opened from Settings › Media management's root folders ("Import what's already here").
   - Or: a step in setup, after the folders.
   - Or: a screen of its own under Activity.
10. **Where the importers live,** and how Radarr's profiles come across. No prototype screen covers it either.
    - **Recommended:** a **Migration** area in Settings' System group, owner only, with a card each for Radarr and qBittorrent: connect, preview what comes across (with the profile mapping, nearest first, editable), import. Setup's welcome gets one line linking to it ("Coming from Radarr or qBittorrent? You can bring your library across after setup.").
    - Or: a step in setup.
11. **The Sintel test clip** (parent plan, Tests).
    - **Recommended:** generated clips for this checkpoint; the Sintel clip and its subtitles come with checkpoint 7's sync test, committed under CC-BY 3.0 with its credit (a few seconds is small), since the download site can't be scripted. ADR 0040 records it.
    - Or: committed now, though nothing here needs real footage.

## Judgement calls

These are listed again in the checkpoint report:

1. Importing lives in `media/shared` and `media/movies`, replacing the parent plan's `library` package (ADR 0036).
2. Default folders follow setup.md (`/data/media/movies`, `/data/downloads`), not today's code.
3. Setup's `media` settings row becomes `folders`, so `mediaManagement` and `downloadClient` name settings.md's sections.
4. Port 6881, as the roadmap, Dockerfile and ADR 0020 say; the mock's 51413 is corrected.
5. Live progress is sent at most once a second per torrent.
6. `queue.updated`, not `queue.changed`, like every other topic.
7. The IPv6 DHT runs as a second DHT on an IPv6 socket, patching `k-rpc-socket` only if it can't take one.
8. Checkpoint 5's search job now grabs the best approved release.
9. Releases with blocked files are stopped before downloading, not after; the state's copy says "wasn't downloaded".
10. The library scan is the source of truth and `fs.watch` only speeds it up; no watcher dependency.
11. Rename is on by default, unlike Radarr's.
12. qBittorrent's torrents are rechecked once on import, because its API doesn't expose resume data.
13. Settings › Download client, Settings › VPN and the importers are owner-only; the rest is staff. `vpn.status()` is staff, because A8 shows it.
14. In highsea connects, only torrents use the tunnel; the admin, TMDB, the catalog and updates stay on the normal network.
15. NAT-PMP through `@achingbrain/nat-port-mapper` if it takes an explicit gateway and binds to the tunnel's address, else RFC 6886's two requests written in `vpn`.
16. The exit check's IP echo service is chosen at build from documented services that need no key, and is a setting.
17. The kill switch is always on in highsea connects; a failing check that means a leak stops torrents, and the others only warn.
18. highsea sets the tunnel up with `wg set` and `ip`, not `wg-quick`, which would route the whole container through it.

### Made while building 6a

19. A `.torrent` added from the browser is sent as base64 in the JSON body, so `POST /torrents` stays one JSON route like the rest of the API.
20. `vpn.providers` is built in 6a, ahead of highsea connects, because the VPN container mode's compose block uses it.
21. `GET /fs` lists the data root, the root folders and the downloads folder, not the data root alone, because a root folder can live outside it. A17 opens in the downloads folder and looks inside straight away.
22. A torrent resumed while the engine waits for the VPN's binding reads as queued, not stalled.
23. `ImportInput.force` is accepted and ignored in 6a: nothing a manual import refuses can be forced yet.
24. A download with no progress for the stall time counts from its last progress (`progressAt`), not from the grab.
25. Torrents added by hand take the category `manual`, which the import pipeline never touches.
26. The default seeding rule is ratio 2 or 7 days, whichever comes first; indexers and the Download client can change it.
27. Interface mode shows a standing warning that highsea can't guarantee the kill switch there (ADR 0042).
28. An empty `{Release Group}` token leaves nothing behind, separators included.
29. When two files would take the same name, the second gets ` - {label}`, the version's label.
30. The blocked extensions are Radarr’s executable and “dangerous” lists (`FileExtensions.cs`), not a setting: a download that carries one stops (call 9), and the queue offers to import it without that file.
31. HDR10+ isn’t told apart in 6a: it needs the first frame’s side data (`-show_frames`), which 6a doesn’t read, so a PQ file without mastering metadata reads as PQ.
32. The naming token `{Edition}` became `{Edition Tags}`, Radarr's name for it, so imported naming formats work.
33. History and blocklist rows carry the movie's title and year, so Activity reads without a lookup per row.
34. VPN failures appear in System's health list with the source "VPN".
35. Seeding times are entered in hours in the forms and stored in minutes.
36. Live rates on A8 and the Network widget come from `GET /system/speeds`, polled every 2 seconds while the page is open; progress itself arrives over `torrents.updated`.
37. `HIGHSEA_TORRENT_OFFLINE=1` starts the engine without sockets: grabs queue, nothing downloads. The server sweep uses it so no sweep touches the network.
38. The smoke test runs the engine under Node: it listens on a free port with no DHT, hash-checks a file in the worker pool and fast-resumes it on a second boot.

### Prototype changes that real data forced

- **A7 Activity:** actions use the queue row's id, not the torrent's; History pages with Show more; the "Subtitles are next" line is dropped until checkpoint 7; History's Clear button is left out (the route exists).
- **A8 Downloads:** no categories filter yet (6b); Add takes a file as well as a link; the link check is looser (a magnet or any `http(s)` address); the sheet adds a Swarm row and "Not contacted yet" for trackers, and shows the minimum seed time.
- **A6 Movie:** an In the queue card for each download, not one; History has Show more.
- **System:** no tabs and no Check now in 6a; VPN issues join the health list.
- **Network widget:** the caption names the VPN's state.
- **Settings › VPN:** highsea connects is shown but disabled until 6b; "Drop the tunnel" is removed, because neither 6a mode owns a tunnel; the mode radios keep the global focus outline (the prototype turned it off, and the sweep found it).
- **Settings › Download client:** a new Seeding group holds the default rule; speed limits stay on A8's Limits dialog.
- **Settings › Media management:** adds the colon replacement, the chmod switch and the recycle bin's days; the hardlink hint is shorter.
