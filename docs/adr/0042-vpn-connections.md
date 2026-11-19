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

## 2026-11-07: highsea connects' compose lines from Settings, and the host-networking status (one-compose-file.md, part B)

highsea connects needs its container changed: `cap_add: [NET_ADMIN]`, and a network of its own rather than the host's (6b's consequences). Those lines were written three times: `compose.connects.yaml` (removed in part A), the guide's block and the admin's `CAPABILITY_LINES`, which added only the capability. Nothing said when highsea was on host networking, where the tunnel's interface and rule would land in the host's network.

- **One writer.** `composeFor({ mode: 'builtin' })` in `packages/vpn/src/compose.ts`, beside gluetun's block, writes the lines: the capability, the published ports in place of `network_mode: host` (held by a test to the Docker guide's macOS and Windows tab), and the TUN device as a comment, for kernels before 5.6. Settings › VPN shows them as **Compose for highsea connects**, with Copy, folded while the tunnel can run and open when it can't (the prototype the owner approved on 2026-11-07). The guide describes the screen rather than copying them.
- **What highsea knows.** `detectContainerNetwork` in `@highsea-tv/runtime` says `host`, `bridge` or outside a container (null). Inside a container (Docker's `/.dockerenv`, as hardware.ts reads it), host networking shows Docker's own host-side interfaces: `docker0`, a bridge device per user-defined network (named `br-` and its id) and the host ends of `veth` pairs ([Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/)). With host networking the container's network stack isn't isolated from the host ([Host network driver](https://docs.docker.com/engine/network/drivers/host/)); on a bridge it sees only `lo` and its own `eth0`. The names come from `os.networkInterfaces()` ([Node › os.networkInterfaces](https://nodejs.org/docs/latest-v24.x/api/os.html#osnetworkinterfaces)). Setup's address (ADR 0020's 4.3c section) already read the interfaces this way; both now ask the one helper. The runtime reads it once at boot, since the network changes only when the container is recreated.
- **highsea connects won't start on host networking.** Before any `ip` or `wg` command, it fails with vpn.md's copy ("On host networking, the tunnel's interface and routes would land in the host's network…"). The check comes before the capability, since the lines fix both and the network is what's unsafe. The other modes don't mind: an interface on the host usually needs host networking, and the container mode shares gluetun's.
- **`VpnStatus.hostNetwork` is required.** HT-9's prototype drafted it as optional until the server reported it. Every server knows its answer, so it's always there: false outside a container, where there's no compose file to change, and on a bridge. An optional field would let a client read a missing answer as "not on host networking".

Consequences: a host-networked container on a host where Docker makes no bridge of its own (`"bridge": "none"` in the daemon's settings, with no compose networks) reads as a bridge, and highsea connects tries the tunnel as before. Other runtimes, such as Podman, leave no `/.dockerenv`, so highsea reads them as outside a container.

## 2026-11-19: the built-in VPN ready on every install, and the default mode (HT-90)

The owner's NAS (DS1520+, DSM 7, Linux 4.4) couldn't start the built-in VPN: "RTNETLINK answers: Operation not permitted". The owner then decided (2026-11-19) that the built-in VPN is the default across the board.

- **Every install highsea writes has what the tunnel needs.** That means `cap_add: [NET_ADMIN]` and its own network:
  - Root `compose.yaml` and get.highsea.tv's installer: off host networking, onto published ports. ADR 0057 and 0020 have this date's sections on what that changes.
  - Synology package: the capability and the host's `/dev/net`.
  - TrueNAS app and its Custom Config: `NET_ADMIN` and `MKNOD`, the latter by TrueNAS's own capability list.
  - Umbrel and CasaOS: `cap_add`.
  - Unraid: `--cap-add=NET_ADMIN` in Extra Parameters.

  Docker's `cap_add` adds to the container's bounding set ([Runtime privilege and Linux capabilities](https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities)). An update fixes an existing package install: DSM's docker-project worker rewrites the compose file and recreates the container (`force_recreate`, Synology's DSM 7 Developer Guide › docker-project).
- **Non-root starts get the capability without root.** A container started as a user, as DSM's package user is, gets no ambient capabilities, so `ip` as that user has no CAP_NET_ADMIN even with `cap_add` ([capabilities(7)](https://man7.org/linux/man-pages/man7/capabilities.7.html), "Transformation of capabilities during execve()").
  - The image keeps a copy of setpriv (util-linux) with `cap_net_admin+p` set by libcap2-bin's `setcap`. The entrypoint execs node through it, raising the capability into the inheritable and ambient sets.
  - The root path does the same with `setpriv --reuid … --inh-caps=+net_admin --ambient-caps=+net_admin` ([setpriv(1)](https://man7.org/linux/man-pages/man1/setpriv.1.html)).
- **The TUN device.** A kernel without WireGuard (before 5.6) needs wireguard-go and `/dev/net/tun`.
  - The entrypoint, as root, makes the node (`c 10:200`) when it's missing; Docker's default device rules allow it.
  - The Synology package binds DSM's `/dev/net`, or an empty folder where DSM has none. `preinst` picks which, and each start switches to `/dev/net` once it appears.
  - DSM loads `tun.ko` only when asked, and a package can't load modules (no root). The copy names a boot-up task in DSM's Task Scheduler (`insmod /lib/modules/tun.ko`).
- **Failures read right.**
  - EPERM on `ip link add` means no capability. "Unknown device type" means the capability is there but the kernel has no WireGuard, and any wireguard-go failure after that, other than not installed or not Linux, means no device.
  - `HIGHSEA_INSTALL` (`synology`, `truenas`, `umbrel`, `casaos`, `unraid`), set by each store's template, is the smallest honest signal of who wrote the compose file. With it the copy says how that store fixes it, such as "Update highsea in Package Center". Without it, it gives the compose lines. `VpnStatus.install` carries it, and Settings › VPN hides the lines for a store install.
- **The default mode is `builtin`, unconnected until a provider is saved.** With no configuration, token or PIA password stored, the built-in VPN acts as Off:
  - torrents use the direct connection;
  - UPnP may map the port;
  - the status is `off` with no provider, shown as "Not connected yet".

  So an install that never chose a VPN keeps downloading after the update, rather than holding every torrent for a tunnel nobody set up (judgement call). No VPN's warning is unchanged.
- **Downloads held by the VPN say so.** While a mode with a VPN is set up and its tunnel isn't up, a downloading or queued torrent reads "Waiting for the VPN." in Downloads, the Queue widget and the film's page. The wait never counts toward the stall checks, and the torrent carries on when the tunnel's network event comes.

Consequences:

- The image carries libcap2-bin (BSD-3-Clause or GPL-2.0, in `docker/NOTICE`).
- A host-networked install from before keeps working. Settings › VPN gives it the lines when the built-in VPN is chosen.
- What was not proven in the repository is listed in HT-90's pull request: the capability and device on the DS1520+, and Test's four checks there.

## 2026-11-19: wireguard-go's own words, and a TUN device of the container's own (HT-98)

On 0.4.8 the DS1520+ got past the capability, then logged `start wireguard-go failed: ┌────…`, and Settings › VPN asked for DSM's Task Scheduler task, though DSM had loaded tun. Reproduced on Docker Desktop (Linux 6.x, Debian trixie's wireguard-go 0.0.20231211): a container run as uid 201309 with only NET_ADMIN, a root-owned 0600 `/dev/net/tun` mounted in, prints the same box and exits 1.

- **The error was the wrong stream.** From wireguard-go's `main.go` and `device/logger.go`: on Linux it prints a box to stderr on every start ("Running wireguard-go is not required because this kernel has first class support for WireGuard"), unless `WG_PROCESS_FOREGROUND=1`, which also keeps it in the foreground, so it can't be quieted for a daemon. Its logger writes to stdout, errors only by default. highsea read only stderr's first line. `run()` now reads wireguard-go's stdout and stderr, drops the box and the logger's prefix, and keeps the last three lines (`wireguardGoOutput`). The real error was `Failed to create TUN device: permission denied`.
- **Failures told apart by what wireguard-go says** (`wireguardGoFailure`, from its `tun/tun_linux.go`), and only on its "Failed to create TUN device" line:
  - "/dev/net/tun does not exist": no device node (`no-device`);
  - "no such device" (ENODEV, the misc driver for 10:200 isn't there): the host hasn't loaded tun (`no-module`), the only case that names DSM's Task Scheduler task;
  - "permission denied" (EACCES, the node's mode) or "operation not permitted" (EPERM, the device cgroup): `device-denied`;
  - anything else in wireguard-go's own words.
- **The cause: DSM's `/dev/net/tun` is root's, mode 0600,** and Container Manager runs the package's container as the package's user, so it can't be opened. The kernel's tuntap documentation: opening the node takes its file permission, and making a non-persistent interface takes CAP_NET_ADMIN; mode 0666 is safe, since CAP_NET_ADMIN is still needed ([tuntap](https://docs.kernel.org/networking/tuntap.html)).
- **The fix: the container makes its own node, as the package's user.**
  - The package's compose mounts a tmpfs at `/dev/net` (`/dev/net:dev,mode=1777`) instead of DSM's `/dev/net`, and allows `c 10:200 rwm` in the device cgroup ([compose's tmpfs](https://docs.docker.com/reference/compose-file/services/#tmpfs); [the device controller](https://docs.kernel.org/admin-guide/cgroup-v1/devices.html)). `dev` is needed: Docker mounts a tmpfs `nodev` by default (seen in `/proc/mounts`), and compose passes the option to the engine.
  - The image's capped setpriv (now `setpriv-caps`) holds `cap_net_admin,cap_mknod+p`. The entrypoint, as a non-root user with no `/dev/net/tun` and a writable `/dev/net`, raises CAP_MKNOD for one `mknod -m 0666 /dev/net/tun c 10 200` ([mknod(2)](https://man7.org/linux/man-pages/man2/mknod.2.html)). Node still gets only CAP_NET_ADMIN.
  - DSM's own node isn't touched, and the host's `/dev/net` is no longer mounted, so `preinst`'s `HIGHSEA_TUN`, the `no-tun` folder and `start-stop-status`'s switch are gone.
- **Why this is the narrowest:**
  - CAP_DAC_OVERRIDE, kept as NET_ADMIN is, would let node and everything it runs (ffmpeg and unar on downloaded files among them) pass every file permission in the container. Set on wireguard-go alone, it would keep it for the daemon's life.
  - CAP_MKNOD is used once, at start, for one node in a folder of the container's own. Node could raise it again through setpriv, but the device cgroup still decides what can be opened: Docker's defaults, 10:200 and the render nodes.
  - The package can't do it on the host. DSM 7 runs packages that Synology hasn't signed without root ("Synology has added a strict requirement on DSM 7.0 to prevent packages not signed by Synology from running with root privileges"; DSM 7 Developer Guide › Privilege: `run-as` `package`). A privilege `tool` with file capabilities needs a native binary, and the package is `noarch`.
  - So loading `tun.ko`, when DSM hasn't, stays the owner's one step: the Task Scheduler task, shown only for "no such device". Opening the device from a container may load the module on its own through the kernel's `char-major-10-200` alias, where DSM's modprobe knows it. Not shown here.
- **The other installs are unchanged.** They start as root: the entrypoint makes a 0666 node in the container's own `/dev` where there's none, and switches to PUID. `bun scripts/image.ts tun` runs the built image both ways (as the package does, and as root with PUID) and fails unless wireguard-go makes `hswg0`. CI runs it after the user check.
- **The kill switch is unchanged.** A tunnel that doesn't come up leaves the binding empty, and torrents wait.

