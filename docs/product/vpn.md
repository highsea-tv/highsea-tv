# VPN

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `design/prototypes/src/admin/settings/vpn.tsx` (`#/admin/settings/vpn`), approved by the owner on 2026-10-20 (answer V5): the build reference. The owner asked on 2026-10-20 for VPN connections to be a first-class feature, after Phase 2's sign-off, and answered its questions the same day ([checkpoint 6 › VPN questions](../plans/phase-3-checkpoint-6.md#vpn-questions)). In the prototype, **Reconnect** plays connecting, a PIA password or gluetun key of `wrong` plays a failure, **Prototype only · Drop the tunnel** plays the down state, and the empty server lacks NET_ADMIN.
- **Built:** checkpoint 6a, 2026-10-20: `/settings/vpn` in `apps/server` (`src/admin/vpn.tsx`) on `@highsea/vpn` ([ADR 0042](../adr/0042-vpn-connections.md)), with the VPN container and interface modes and their checks (answer V1). Checkpoint 6b, 2026-10-20: highsea connects, the providers in the signed catalog, port forwarding and indexers through the VPN ([ADR 0042 › Checkpoint 6b](../adr/0042-vpn-connections.md#checkpoint-6b-highsea-connects-2026-10-20)). What real data changed from the prototype is marked *As built*.
- **Roadmap:** the built-in torrent engine's bind interface and kill switch, VPN port forwarding ([M1] torrent production features), the VPN binding health check.
- **Plan:** [phase-3-checkpoint-6.md › VPN connections](../plans/phase-3-checkpoint-6.md#vpn-connections).

## Purpose

Torrents leave through the owner's VPN, highsea shows that they do, and nothing leaks when the tunnel drops. In an *arr stack, the VPN is the part people most often get wrong: a gluetun sidecar, `network_mode`, and a script that copies the forwarded port into qBittorrent. highsea turns it into a settings page: pick the provider, paste what it gives you, and watch each check pass.

## Ways to connect

| Mode | What highsea does | What's guaranteed | What it needs |
| --- | --- | --- | --- |
| **highsea connects** (recommended) | Brings up a WireGuard tunnel itself, from the owner's provider, and routes only torrent traffic through it | A packet from the tunnel's address goes through the tunnel or nowhere: the kernel's routing refuses any other path, and there's no route at all once the tunnel is down | Linux (the Docker image), and `cap_add: NET_ADMIN` on highsea's container |
| **A VPN container** | Shares a gluetun container's network, and reads gluetun's status, exit address and forwarded port | Everything highsea sends goes through the tunnel, because the container has no other route | A gluetun service in the compose file, with its control server's API key |
| **An interface on this machine** | Binds every torrent socket to a named interface's address (`wg0`, `tun0`) and stops when the interface goes | Only the binding. The operating system's routing still picks the path, and highsea says so | A tunnel the owner runs |
| **Off** | Torrents use the server's own connection | Nothing | — |

- **Only torrents use the tunnel** in highsea connects. The admin, TMDB, the catalog and updates stay on the normal network, so the admin stays reachable on the LAN. Indexer searches can go through the tunnel too (a switch, [question V6](../plans/phase-3-checkpoint-6.md#vpn-questions)).
- *As built in 6b:* highsea connects makes the interface `hswg0` with `ip` and `wg`, kernel WireGuard first and wireguard-go where the kernel has none, and routes the tunnel's address by a rule into its own table, which ends in `unreachable`. The binding is the tunnel's address. It carries **IPv4 only** for now. The failures real servers meet have their own lines, none of them in the prototype: "highsea connects runs on Linux, as highsea's Docker image does. Use a VPN container or an interface on this machine here.", "highsea couldn't create the WireGuard interface: the kernel has no WireGuard, and /dev/net/tun isn't there for wireguard-go. Add the /dev/net/tun device to highsea's service in your compose file, then restart.", "highsea couldn't find the ip and wg programs. They come with highsea's Docker image.", "highsea connects needs an IPv4 Address in the WireGuard configuration's [Interface] section.", "A [Peer] in that WireGuard configuration has no Endpoint, so highsea can't reach it.", "PIA has no WireGuard server in {region}. Pick another region." and "highsea couldn't set up the tunnel: {reason}". The repository's `compose.connects.yaml` is a worked example: `cap_add: [NET_ADMIN]`, its own network rather than the host's, and the ports published.
- *As built in 6a:* the container's binding is "any address" while gluetun reports the tunnel running and none otherwise; the interface's is its IPv4 address, read every 2 seconds, and none while it's gone. The engine waits, its torrents reading as queued, until the first checks are done and a binding arrives.
- **WireGuard** is the protocol highsea runs itself. Providers that only offer OpenVPN come through the VPN container ([question V3](../plans/phase-3-checkpoint-6.md#vpn-questions)).

## Providers

Each provider gets a guided form: where to find what highsea needs in the provider's account, only the fields that provider uses, and its port forwarding when it offers it. The facts for each provider live in the signed catalog, so a new provider or a changed sign-up page arrives without a server release.

| Provider | How highsea connects | Port forwarding |
| --- | --- | --- |
| **Proton VPN** | A WireGuard configuration from the Proton account (Downloads › WireGuard configuration), on a P2P server, with NAT-PMP turned on | NAT-PMP to the tunnel's gateway, renewed before each mapping expires ([Proton: manual port forwarding](https://protonvpn.com/support/port-forwarding-manual-setup)) |
| **Private Internet Access** | The PIA username and password, and a region. highsea gets a token and registers a WireGuard key through PIA's documented API ([pia-foss/manual-connections](https://github.com/pia-foss/manual-connections), MIT) | PIA's port forwarding API, from the same scripts |
| **AirVPN** | The values from AirVPN's Config Generator: private key, preshared key, addresses | A port reserved in the AirVPN client area, typed in ([gluetun wiki › AirVPN](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/airvpn.md)) |
| **Mullvad** | A WireGuard configuration from the Mullvad account | None. Mullvad removed port forwarding on 2023-07-01 ([Mullvad blog](https://mullvad.net/en/blog/removing-the-support-for-forwarded-ports)) |
| **IVPN, Windscribe, Surfshark** | A WireGuard configuration from the provider's account | *As built:* IVPN and Surfshark don't forward ports ([IVPN blog](https://www.ivpn.net/blog/gradual-removal-of-port-forwarding/), [Surfshark](https://surfshark.com/blog/vpn-port-forwarding)); Windscribe's port, from its port forwarding page, is typed in ([Windscribe](https://windscribe.com/knowledge-base/articles/do-you-support-port-forwarding)) |
| **Another WireGuard provider** | Paste or upload any WireGuard configuration file | A port typed in, if the provider gives one |
| **OpenVPN-only providers** | Through the VPN container mode, which covers gluetun's providers | gluetun's, read from its control server |

- *As built in 6b:* the entries are the catalog's `vpn-providers` kind (`catalog/vpn-providers/`, each with the sources it rests on in `SOURCES.md`), signed by `bun run catalog:build` and updated with the indexer catalog's channel and update setting. No logos ship: the select shows names only. PIA's regions come from PIA's live server list when it answers, and from the catalog entry's list when it doesn't. Saving PIA checks the username and password with PIA first, and refuses with "PIA didn't accept that username and password." under the password.

## Checks

highsea checks the connection when it connects, every 5 minutes, after a reconnect, and when the owner presses **Check now**. Each check is a row in the Status group with a pass, warning or fail mark and one line of copy.

| Check | Passing copy | Failing copy |
| --- | --- | --- |
| **Tunnel** | Connected to {provider} · Last handshake {n} seconds ago. | No handshake for 3 minutes · Reconnecting. Torrents are stopped until it's back. |
| **Exit address** | Torrents leave from {ip} ({country}), not from your own address. | The exit address is your own · Torrents are stopped. |
| **Names** | Tracker names are looked up through the tunnel. | Names are being looked up outside the tunnel · Torrents are stopped. |
| **Kill switch** | If the tunnel drops, torrents stop. Nothing can leave outside it. | The routing rule is missing · Torrents are stopped until highsea puts it back. |
| **Port forwarding** | Port {port} is forwarded · {n} peers have connected in. | {provider} doesn't forward ports · Downloads still work; fewer peers can reach you. |
| **IPv6** | IPv6 goes through the tunnel too. | The tunnel has no IPv6 address, so torrents use IPv4 only. |

- **The VPN container mode** reads the tunnel and the exit address from gluetun. In that mode highsea has no route to the server's own address, so the exit check shows the address and its country without the comparison.
- **The interface mode** can't promise the kill switch row. It says: "Bound to {interface}. Your system's routing decides the path; a VPN container or highsea connects guarantees it."
- *As built in 6a* (ADR 0042):
  - **Which failures stop torrents:** in these two modes only the tunnel going (gluetun not running, or the interface gone), which takes the binding away. The other checks only warn: the container has no other route, and in the interface mode every socket is already bound to the tunnel's address.
  - **Matching exit answers in the interface mode** are a warning, not a leak: "Both answers came from the same address · So highsea can't compare them. That's expected if your whole machine uses the VPN. Torrents still leave only through {interface}." In highsea connects (6b) a matching answer is a leak and stops torrents.
  - **The echo service** answering neither way is a warning too ("Couldn't check the exit address"), checked again in 5 minutes. Its address is a setting (`echoUrl`).
  - **The down rows** say what each mode can see: "gluetun reports the tunnel stopped · Reconnecting. Torrents are stopped until it's back.", "Couldn't reach gluetun at {url}", "{interface} has no address".
  - **Port forwarding:** the container mode reads gluetun's forwarded port when **Use the forwarded port** is on and shows it; in 6b the engine moves to that port. Without one, the row says "Torrents listen on port {port} · Forward it through your tunnel yourself, if your provider allows it."

- *As built in 6b,* highsea connects' checks (ADR 0042):
  - **Which failures stop torrents:** no handshake for 3 minutes, an exit that's your own, names looked up outside the tunnel, and a kill switch that can't be put back. Each takes the binding away. Port forwarding only warns.
  - **Tunnel:** the handshake is read every 5 seconds, so the row's seconds stay current. Not in the prototype: "Couldn't reach {provider} · Reconnecting. Torrents are stopped until it's back." when PIA's API doesn't answer while connecting.
  - **Exit:** not in the prototype, the provider's own check saying no is a leak too: "{provider} says {ip} isn't one of its addresses · Torrents are stopped." (Mullvad's check).
  - **Names:** a configuration without a `DNS` line fails: "Names are being looked up outside the tunnel · The WireGuard configuration has no DNS line, so torrents are stopped. Upload one that has it."
  - **Kill switch:** a missing rule or unreachable route is put back at once. The row fails only if that doesn't work.
  - **Port forwarding:** NAT-PMP (Proton), PIA's API, or the typed-in port, handed to the engine. Not in the prototype: "Asking {provider} for a forwarded port." while it asks; "{provider} didn't forward a port · Downloads still work; fewer peers can reach you. Trying again in a minute." when it fails, with the same warning in System; "No forwarded port set" when a typed-in provider has none.
  - **IPv6:** "IPv4 only · highsea connects carries IPv4 for now, so torrents use IPv4 only." Not in the prototype, which played an IPv6 pass.

## Layout

- **Where:** Settings › **VPN**, in the index's Downloads and alerts group, before Download client. The owner's alone, like the other network settings ([ADR 0032](../adr/0032-administrative-and-normal-access.md)). Download client's VPN group becomes one line, the status and **VPN settings**.
- **Status** (the first group): a shield and the state ("Connected through Proton VPN"), the checks as rows, **Check now** and **Reconnect**. Missing NET_ADMIN shows the compose lines to copy here.
- **Connection:** the mode, as four choices with one line each. Then:
  - **highsea connects:** the provider (a select with logos), its steps ("In your Proton account, open Downloads › WireGuard configuration, choose a P2P server, turn on NAT-PMP, then upload the file here."), and its fields: a configuration file (upload or paste), or a username, password and region for PIA. Saving connects, through the save bar every settings area uses; secrets come back only as set.
  - **A VPN container:** the control server's address (`http://127.0.0.1:8000` by default, because the containers share a network) and its API key. **Compose for your provider:** pick a provider and copy a gluetun service block, with highsea's `network_mode` line, ready for the compose file.
  - **An interface on this machine:** the interface, picked from the ones the server has.
- **Behaviour:** stop torrents when the VPN is down (always on in highsea connects, and said so), use the forwarded port, and send indexer searches through the VPN.
  - *As built:* "Stop torrents when the VPN is down" is on and can't be turned off in every mode, with each mode's reason ("Always on in a VPN container: it has no other route.", "Torrents stop the moment the interface or its address goes."). The indexers switch is saved in 6a and takes effect with 6b (answer V6). *As built in 6b:* with it on in highsea connects or the interface mode, indexer searches and `.torrent` downloads leave from the tunnel's address; in highsea connects they look names up through the tunnel's resolvers too. While the tunnel is down they fail with "Indexer searches go through the VPN, and it's down. They work again once it's back." rather than going out unprotected. In the container mode everything already goes through the tunnel.
- *As built, not in the prototype:* the interface select lists the server's interfaces besides loopback, with "This server has no network interfaces besides loopback." when there are none; the save's errors name their field ("Choose an interface.", "Enter a port from 1 to 65535.", "Enter the address of an IP echo service, starting with http:// or https://."); a WireGuard file's parser names what's wrong ("That WireGuard configuration has no [Peer] section."). The prototype's **Prototype only · Drop the tunnel** is gone.
- **Elsewhere:**
  - A8's VPN line names the provider and port ("Through Proton VPN · 185.159.157.4 (Netherlands) · Port 53186").
  - System's health checks cover the VPN being down, the exit address being your own, and port forwarding failing. *As built:* "The VPN is down. Torrents are stopped until it's back." (an error), "The VPN couldn't connect: {reason}", and for each failing check "VPN: {title}. Open Settings › VPN to see why.", with the source **VPN** ([system.md](system.md)).
  - Downloads with the VPN off shows "Torrents use your own connection. Anyone in the swarm can see your address." and **Set up a VPN**.

## States

- **Off:** the line above, with **Set up a VPN**.
- **Connecting:** "Connecting to {provider}…"
- **Connected:** the checks, all passing.
- **Down:** "{provider} is down · Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection." highsea reconnects on its own, waiting longer after each try, up to 5 minutes.
- **Can't connect:** the reason, specific to the provider and the step ("PIA didn't accept that username and password.", "That file isn't a WireGuard configuration: it has no [Interface] section.", "Couldn't reach the VPN container's control server at {url}.").
- **Missing capability:** "highsea needs the NET_ADMIN capability to run the tunnel. Add `cap_add: [NET_ADMIN]` to highsea's service in your compose file, then restart." with the lines to copy.

## Data

As built in 6a (`packages/api-contract/src/vpn.ts`):

| Call | Route | Access | What |
| --- | --- | --- | --- |
| `vpn.status()` | `GET /api/v1/vpn/status` | staff, so A8 can show it | `VpnStatus`: `mode`, `provider`, `state` (`off`, `connecting`, `connected`, `down`, `failed`), `message` when failed, `needsCapability`, `exitIp`, `country`, `forwardedPort`, `checks` (each `id`, `label`, `result` of `pass`, `warn`, `fail`, `info` or `pending`, `title`, `detail`) and `checkedAt`. Live over `vpn.updated` |
| `vpn.check()` | `POST /api/v1/vpn/check` | owner | Run the checks now |
| `vpn.reconnect()` | `POST /api/v1/vpn/reconnect` | owner | Restart the tunnel, or look at the interface again |
| `vpn.providers()` | `GET /api/v1/vpn/providers` | owner | The providers with their steps, how they connect (`config` or `account`) and port forwarding (`natpmp`, `pia`, `static`, `none`). Built into the server in 6a; since 6b they're read from the signed catalog's `vpn-providers` kind, with PIA's regions |
| `vpn.interfaces()` | `GET /api/v1/vpn/interfaces` | owner | The machine's interfaces, for the interface mode |
| `vpn.compose(input)` | `POST /api/v1/vpn/compose` | owner | The gluetun compose block for a provider, with highsea's `network_mode` line |
| `vpn.settings()`, `vpn.save(input)` | `GET\|PUT /api/v1/settings/vpn` | owner | `VpnSettings`; saving reconnects with them. Secrets (the WireGuard configuration, the PIA password, gluetun's API key) are write-only and stored encrypted, like the TMDB key: they come back as `configName`, `piaPasswordSet` and `containerKeySet`, and an empty value keeps what's stored |

- A8's VPN line reads `vpn.status()`; `TorrentLimits` carries no VPN fields.
- The repository's `compose.gluetun.yaml` is a worked example of the container mode.

## Decisions

- **highsea runs the tunnel itself** when it can, because that's the only mode where highsea both sets the VPN up and guarantees the kill switch. The container and interface modes stay for owners who already run one. (Answer V2.)
- **Only torrents go through the tunnel,** so the admin stays on the LAN and the library's metadata isn't slowed by it.
- **The kill switch can't be turned off** in highsea connects. A leak is the failure that matters most here (activity-downloads.md).
- **Provider facts are catalog data, mechanisms are code:** NAT-PMP, PIA's API and configuration files are written once, and each provider entry names which it uses.

- **Answered by the owner on 2026-10-20** ([checkpoint 6 › VPN questions](../plans/phase-3-checkpoint-6.md#vpn-questions)): 6a builds this area with the VPN container and interface modes, 6b adds highsea connects, the providers and port forwarding (V1); WireGuard only inside highsea (V3); the seven providers above plus any WireGuard configuration (V4); a prototype first (V5); indexers through the VPN is a switch, off by default (V6).

- **Built in 6a on 2026-10-20** with the VPN container and interface modes; the changes real data forced are marked *As built* above and listed in the checkpoint report.
- **Built in 6b on 2026-10-20:** highsea connects, the providers in the catalog, port forwarding and indexers through the VPN; its judgement calls are in [checkpoint 6 › Made while building 6b (highsea connects)](../plans/phase-3-checkpoint-6.md#made-while-building-6b-highsea-connects).

## Open questions

None. The owner approved the prototype on 2026-10-20 without changes.
