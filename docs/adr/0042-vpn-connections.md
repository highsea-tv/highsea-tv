# 0042. VPN connections

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
The owner made VPN connections a first-class feature on 2026-10-20: Settings › VPN, providers and checks ([docs/product/vpn.md](../product/vpn.md), answers V1 to V6). activity-downloads.md decided that when the tunnel drops, torrents stop rather than falling back. Node can bind a socket to an address but not to a device ([nodejs/node#35769](https://github.com/nodejs/node/issues/35769)). libtorrent's documentation warns that binding to a local address "does not necessarily make the connection via the associated NIC" ([libtorrent settings › outgoing_interfaces](https://www.libtorrent.org/reference-Settings.html#outgoing_interfaces)). So the engine's binding (ADR 0037) is half of a kill switch, and the other half has to come from the network.

## Decision
- **One package, one output.** `@highsea/vpn` hands the engine one binding through `onBinding`: an address (or any) and DNS servers while torrents may leave, or null while they mustn't. Nothing else sets the engine's binding.
- **The four modes, and what each guarantees:**
  - **A VPN container (6a):** highsea shares gluetun's network namespace (`network_mode: "service:gluetun"`), whose only route out is the tunnel and whose firewall blocks everything else. The guarantee is gluetun's. highsea's binding is "any address" while gluetun's control server reports the tunnel running, and null otherwise.
  - **An interface on this machine (6a):** the binding is the interface's IPv4 address, read with `os.networkInterfaces()` every 2 seconds, and null when it's gone. The guarantee rests on the owner's routing: binding to the address sends traffic by the routes for that source address. The exit check warns when that doesn't hold, and the binding is dropped the moment the interface goes.
  - **highsea connects (6b):** highsea brings up its own WireGuard interface (`hswg0`) with `ip` and `wg` as separate programs, and routes by source address with a rule and its own table. It needs `NET_ADMIN`, which the entrypoint keeps in the ambient set when it drops to PUID (`setpriv`). That exposes the container's network configuration to highsea's process, and nothing beyond its namespace.
  - **Off:** the binding is any address, and A8's VPN line says torrents aren't protected.
- **gluetun's control server** ([gluetun wiki › control server](https://github.com/qdm12/gluetun-wiki/blob/main/setup/advanced/control-server.md)) is read with an API key in `X-API-Key`:
  - status from `GET` and `PUT /v1/vpn/status`;
  - the exit address from `/v1/publicip/ip`;
  - the forwarded port from `/v1/portforward`.
  A stopped tunnel is restarted with waits that grow to 5 minutes. Saving the container mode tries the address and key first and refuses with the field at fault.
- **The checks** run on connect, every 5 minutes, after a reconnect, and on Check now:
  - **the tunnel:** gluetun's status, or the interface's address;
  - **the exit:** the address an IP echo service sees, by default ifconfig.co, a setting, asked at most once per address every 5 minutes;
  - **names:** whether the resolvers are the tunnel's;
  - **the kill switch:** what stops torrents if the tunnel goes;
  - **port forwarding:** the forwarded port, and peers connecting in;
  - **IPv6:** whether the provider's tunnel carries it.
  The binding is handed over only once the first checks are done.
- **Which failures stop torrents:** in the container and interface modes, only the tunnel going (gluetun not running, or the interface gone), which nulls the binding. When the bound and unbound exit answers match in the interface mode, that's a **warning** ("Both answers came from the same address"): the binding stays and torrents keep running. The owner's own routing is the guarantee there, and a VPN that exits through the same address as the LAN (a router-level tunnel) gives the same answer for good reasons. In highsea connects (6b), a matching answer is a leak, and it stops torrents.
- **Providers** are data: id, name, how they connect, the steps to find what highsea needs, port forwarding (`natpmp`, `pia`, `static` or `none`) and IPv6. 6a keeps the approved list in code (`providers.ts`); 6b moves it into the catalog's `vpn-providers` kind, signed like indexer definitions (ADR 0034).
- **Secrets** (WireGuard private and preshared keys, the PIA password, gluetun's API key) are sealed at rest like indexer secrets. The API only says whether each is set.
- **Access:** the status is staff's, as Downloads shows it. The settings, the checks, reconnecting, the providers and the compose block are the owner's, with the other network settings (ADR 0032's answers).
- **Events:** `vpn.updated` whenever the state, the checks or the settings change.

## Consequences
- In the container mode, a dropped tunnel stops torrents twice over: gluetun's firewall, and highsea's null binding.
- In the interface mode, the guarantee is only as good as the machine's routing. Settings › VPN says so, and the exit check shows what the world sees.
- highsea connects, the strongest mode on a plain Docker host, came with 6b (below), with its leak test in CI.
- An echo service sees the exit address every 5 minutes; an owner who minds can point the setting at their own echoip.

## Checkpoint 6b: highsea connects (2026-10-20)

What 6b built on top of the decision above, and the documentation each part rests on.

- **The tunnel** (`packages/vpn/src/tunnel.ts`, `commands.ts`). highsea runs `ip` and `wg` as separate programs, never `wg-quick`, which would route the whole container through the tunnel ([wg-quick(8)](https://man7.org/linux/man-pages/man8/wg-quick.8.html) adds a default route; [wg(8)](https://man7.org/linux/man-pages/man8/wg.8.html) sets keys and peers only). For each family it carries:
  - `ip link add hswg0 type wireguard` ([WireGuard › Quick start](https://www.wireguard.com/quickstart/)). When the kernel answers "Unknown device type", highsea falls back to `wireguard-go hswg0`, the userspace implementation, which needs `/dev/net/tun` ([wireguard-go README](https://git.zx2c4.com/wireguard-go/about/)).
  - `wg set hswg0 private-key /dev/stdin peer … allowed-ips … endpoint … persistent-keepalive 25`. Keys go in on the command's standard input, never in its arguments, which any process can read in `/proc` ([wg(8)](https://man7.org/linux/man-pages/man8/wg.8.html) reads keys from a file, and `/dev/stdin` is one).
  - The interface's addresses, then the AllowedIPs routes in table 51821, an `unreachable default` with the highest metric in that table, and `ip rule add from <tunnel address> table 51821 priority 10821` ([ip-rule(8)](https://man7.org/linux/man-pages/man8/ip-rule.8.html), [ip-route(8) › unreachable](https://man7.org/linux/man-pages/man8/ip-route.8.html)).
  - WireGuard's own UDP leaves from the host's address, so it never matches the rule, and no fwmark is needed. A socket bound to the tunnel's address goes through the tunnel or gets `ENETUNREACH`. When the interface goes, the kernel removes its routes and only the unreachable one is left. This is the routing WireGuard's own page describes for policy routing ([WireGuard › Routing & Network Namespace Integration](https://www.wireguard.com/netns/)).
  - The engine's binding (ADR 0037) is the tunnel's address, so torrents use the rule. Nothing else binds to it: the admin, TMDB, the catalog and updates use the main table (decision 14).
  - **IPv4 only for now.** The rule and table are written per family, but 6b brings up IPv4 only, and the IPv6 row says "IPv4 only" (judgement call).
- **Commands refuse hostile input.** Each command is built from parsed values, never from text. Interface names, CIDRs, ports and keys are checked against their grammar before anything runs, and a refusal is a `CommandRefused`. The whole plan is built before the first command runs, so bad input runs nothing. `spawn` gets `shell: false` ([Node › child_process.spawn](https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processspawncommand-args-options)), and the real runner refuses anywhere but Linux. The in-memory runtime gets a runner that refuses everything, so tests and development never touch the host's network.
- **Capability.** `EPERM` or "Operation not permitted" means the capability is missing, and the status carries vpn.md's copy with the compose lines. The entrypoint keeps `CAP_NET_ADMIN` across the drop to PUID with `setpriv --inh-caps=+net_admin --ambient-caps=+net_admin`, which sets `PR_SET_KEEPCAPS` before it changes user ([setpriv(1)](https://man7.org/linux/man-pages/man1/setpriv.1.html); [capabilities(7) › Ambient capability set](https://man7.org/linux/man-pages/man7/capabilities.7.html)). It does that only when the bounding set holds the capability, and otherwise uses gosu as before. `compose.connects.yaml` is the worked example, with its own network rather than the host's, so `hswg0` and the rule stay inside the container's namespace.
- **The checks in highsea connects:**
  - **Tunnel:** `wg show hswg0 latest-handshakes`, every 5 seconds. WireGuard re-handshakes every 2 minutes while there's traffic, and keepalive keeps traffic flowing ([WireGuard protocol › Timers](https://www.wireguard.com/protocol/)), so no handshake for 3 minutes means down. It's torn down and reconnected with waits doubling from 5 seconds to 5 minutes.
  - **Exit:** an exit equal to the unbound answer is a leak. So is a "no" from a provider's own check (Mullvad's `mullvad_exit_ip`, [Mullvad › Connection check](https://mullvad.net/en/check)).
  - **Names:** a configuration with no `DNS` line has no tunnel resolver to use, so it's a leak.
  - **Kill switch:** the rule and the unreachable route are read back each round. If one is missing, it's put back at once; a leak only if that fails.
  - A leak sets the binding to null, which stops torrents. Port forwarding only warns.
- **Providers** are the catalog's `vpn-providers` kind, in the `@highsea/schemas/vpn` format: id, steps, `connect` (`config`, `pia`), port forwarding (`natpmp` with the gateway and lifetimes, `pia`, `static`, `none`), IPv6 and the sources each entry rests on. `bun run catalog:build` validates, bundles and signs them like indexer definitions (ADR 0034). The server reads them through `createVpnProviderCatalog`, with the indexer catalog's channel and update setting. The seed is trusted with the development key, because it ships inside the release; updates need a release key. The facts are data and the mechanisms are code. Each entry's sources are in `catalog/vpn-providers/SOURCES.md`:
  - **Proton VPN:** NAT-PMP to 10.2.0.1, mapping lifetime 60 s, renewed every 45 s ([Proton › Port forwarding, manual setup](https://protonvpn.com/support/port-forwarding-manual-setup); [Proton › WireGuard on Linux](https://protonvpn.com/support/wireguard-manual-linux)).
  - **Private Internet Access:** `generateToken`, the server list, `addKey` on port 1337, then `getSignature` and `bindPort` on 19999, re-bound every 15 minutes, all against PIA's CA by its common name ([pia-foss/manual-connections](https://github.com/pia-foss/manual-connections), MIT; the CA ships with its notice in `pia-ca.ts`). The port-forwarding calls go through the tunnel; `addKey` goes outside it, before the tunnel exists.
  - **AirVPN:** a port reserved in the client area, typed in ([AirVPN › Port forwarding](https://airvpn.org/faq/port_forwarding/); [gluetun wiki › AirVPN](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/airvpn.md)).
  - **Mullvad:** no port forwarding since 2023-07-01 ([Mullvad › Removing the support for forwarded ports](https://mullvad.net/en/blog/removing-the-support-for-forwarded-ports); [Mullvad › WireGuard on Linux](https://mullvad.net/en/help/easy-wireguard-mullvad-setup-linux)).
  - **IVPN:** a WireGuard configuration, and no port forwarding since its removal ([IVPN › Gradual removal of port forwarding](https://www.ivpn.net/blog/gradual-removal-of-port-forwarding/); [IVPN › WireGuard config files](https://www.ivpn.net/knowledgebase/general/do-you-offer-openvpn-wireguard-config-files/)).
  - **Windscribe:** a WireGuard configuration, with a port from its port forwarding typed in ([Windscribe › WireGuard configs](https://windscribe.com/knowledge-base/articles/where-do-i-access-my-wireguard-configs); [Windscribe › Port forwarding](https://windscribe.com/knowledge-base/articles/do-you-support-port-forwarding); [Windscribe › Ephemeral port forwarding](https://windscribe.com/knowledge-base/articles/what-is-ephemeral-port-forwarding)).
  - **Surfshark:** a WireGuard configuration, and no port forwarding ([Surfshark › Manual WireGuard setup](https://support.surfshark.com/hc/en-us/articles/19262406140306); [Surfshark › VPN port forwarding](https://surfshark.com/blog/vpn-port-forwarding)).
  - **Other:** any WireGuard configuration, with a port typed in.
- **NAT-PMP** follows [RFC 6886](https://www.rfc-editor.org/rfc/rfc6886):
  - the external address request (§ 3.2), then a mapping for UDP and one for TCP (§ 3.3), with internal port 1 and suggested port 0, as Proton's `natpmpc -a 1 0` does;
  - retransmits from 250 ms, doubling, nine tries (§ 3.1);
  - renewal before the lifetime runs out (§ 3.3);
  - the result codes' meanings (§ 3.5).
  It's written in `vpn` rather than taken from `@achingbrain/nat-port-mapper` (decision 15), because that library binds a wildcard socket on 5350 for announcements. highsea's socket binds to the tunnel's address, so a request can only go through the tunnel.
- **Port forwarding** hands the port to `engine.setPort` (ADR 0037), renews it before it lapses, and retries every minute after a failure, with a warning in System and the Port forwarding row. It never stops torrents.
- **Indexers through the VPN** (answer V6, off by default): with the switch on in highsea connects or the interface mode, indexer searches and `.torrent` downloads use a `fetch` bound to the tunnel's address. It's built on `node:http`/`node:https` with `localAddress` ([Node › http.request](https://nodejs.org/docs/latest-v24.x/api/http.html#httprequesturl-options-callback)). In highsea connects, names are looked up with a `dns.Resolver` bound to the same address and asking the tunnel's resolvers (the interface mode uses the system's) ([Node › resolver.setLocalAddress](https://nodejs.org/docs/latest-v24.x/api/dns.html#resolversetlocaladdressipv4-ipv6)). While the tunnel is down, a request fails with "Indexer searches go through the VPN, and it's down." rather than going out unprotected. In the container mode the whole process is already inside the tunnel.
- **The leak test** (`packages/vpn/test/leak.test.ts`) runs highsea's own tunnel code on a real kernel, against a WireGuard peer in a network namespace. It proves three things: a bound socket reaches the peer through the tunnel; it can't reach an address the main table can; and with the interface down nothing leaves from the tunnel's address. CI's `leak` job runs it under sudo; anywhere else it skips.

### Consequences of 6b

- highsea connects needs `cap_add: [NET_ADMIN]` and its own network namespace, so LAN discovery is limited to the UDP broadcast there (ADR 0020).
- The image carries wireguard-tools, iproute2 and wireguard-go from Debian, unmodified, with a source offer in `docker/NOTICE`.
- A provider changing its port forwarding, or a new one, is a catalog update. A new mechanism is a release.
