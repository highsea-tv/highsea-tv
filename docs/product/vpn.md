# VPN

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `design/prototypes/src/admin/settings/vpn.tsx` (`#/admin/settings/vpn`), approved by the owner on 2026-10-20 (answer V5): the build reference. The owner asked on 2026-10-20 for VPN connections to be a first-class feature, after Phase 2's sign-off, and answered its questions the same day ([checkpoint 6 › VPN questions](../plans/phase-3-checkpoint-6.md#vpn-questions)). In the prototype, **Reconnect** plays connecting, a PIA password or gluetun key of `wrong` plays a failure, **Prototype only · Drop the tunnel** plays the down state, and the empty server lacks NET_ADMIN.
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
- **WireGuard** is the protocol highsea runs itself. Providers that only offer OpenVPN come through the VPN container ([question V3](../plans/phase-3-checkpoint-6.md#vpn-questions)).

## Providers

Each provider gets a guided form: where to find what highsea needs in the provider's account, only the fields that provider uses, and its port forwarding when it offers it. The facts for each provider live in the signed catalog, so a new provider or a changed sign-up page arrives without a server release.

| Provider | How highsea connects | Port forwarding |
| --- | --- | --- |
| **Proton VPN** | A WireGuard configuration from the Proton account (Downloads › WireGuard configuration), on a P2P server, with NAT-PMP turned on | NAT-PMP to the tunnel's gateway, renewed before each mapping expires ([Proton: manual port forwarding](https://protonvpn.com/support/port-forwarding-manual-setup)) |
| **Private Internet Access** | The PIA username and password, and a region. highsea gets a token and registers a WireGuard key through PIA's documented API ([pia-foss/manual-connections](https://github.com/pia-foss/manual-connections), MIT) | PIA's port forwarding API, from the same scripts |
| **AirVPN** | The values from AirVPN's Config Generator: private key, preshared key, addresses | A port reserved in the AirVPN client area, typed in ([gluetun wiki › AirVPN](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/airvpn.md)) |
| **Mullvad** | A WireGuard configuration from the Mullvad account | None. Mullvad removed port forwarding on 2023-07-01 ([Mullvad blog](https://mullvad.net/en/blog/removing-the-support-for-forwarded-ports)) |
| **IVPN, Windscribe, Surfshark** | A WireGuard configuration from the provider's account | Checked against each provider's documentation when its entry is written |
| **Another WireGuard provider** | Paste or upload any WireGuard configuration file | A port typed in, if the provider gives one |
| **OpenVPN-only providers** | Through the VPN container mode, which covers gluetun's providers | gluetun's, read from its control server |

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

## Layout

- **Where:** Settings › **VPN**, in the index's Downloads and alerts group, before Download client. The owner's alone, like the other network settings ([ADR 0032](../adr/0032-administrative-and-normal-access.md)). Download client's VPN group becomes one line, the status and **VPN settings**.
- **Status** (the first group): a shield and the state ("Connected through Proton VPN"), the checks as rows, **Check now** and **Reconnect**. Missing NET_ADMIN shows the compose lines to copy here.
- **Connection:** the mode, as four choices with one line each. Then:
  - **highsea connects:** the provider (a select with logos), its steps ("In your Proton account, open Downloads › WireGuard configuration, choose a P2P server, turn on NAT-PMP, then upload the file here."), and its fields: a configuration file (upload or paste), or a username, password and region for PIA. Saving connects, through the save bar every settings area uses; secrets come back only as set.
  - **A VPN container:** the control server's address (`http://127.0.0.1:8000` by default, because the containers share a network) and its API key. **Compose for your provider:** pick a provider and copy a gluetun service block, with highsea's `network_mode` line, ready for the compose file.
  - **An interface on this machine:** the interface, picked from the ones the server has.
- **Behaviour:** stop torrents when the VPN is down (always on in highsea connects, and said so), use the forwarded port, and send indexer searches through the VPN.
- **Elsewhere:**
  - A8's VPN line names the provider and port ("Through Proton VPN · 185.159.157.4 (Netherlands) · Port 53186").
  - System's health checks cover the VPN being down, the exit address being your own, and port forwarding failing.
  - Downloads with the VPN off shows "Torrents use your own connection. Anyone in the swarm can see your address." and **Set up a VPN**.

## States

- **Off:** the line above, with **Set up a VPN**.
- **Connecting:** "Connecting to {provider}…"
- **Connected:** the checks, all passing.
- **Down:** "{provider} is down · Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection." highsea reconnects on its own, waiting longer after each try, up to 5 minutes.
- **Can't connect:** the reason, specific to the provider and the step ("PIA didn't accept that username and password.", "That file isn't a WireGuard configuration: it has no [Interface] section.", "Couldn't reach the VPN container's control server at {url}.").
- **Missing capability:** "highsea needs the NET_ADMIN capability to run the tunnel. Add `cap_add: [NET_ADMIN]` to highsea's service in your compose file, then restart." with the lines to copy.

## Data

- `vpn.status()` → `GET /api/v1/vpn/status` (staff, so A8 can show it): the mode, provider, state, exit address and country, forwarded port, each check's result, and when it last ran. Live over `vpn.updated`.
- `settings.get('vpn')` / `settings.save('vpn', value)` → `GET|PUT /api/v1/settings/vpn` (owner). Secrets (private keys, the PIA password, gluetun's API key) are stored encrypted, like the TMDB key, and come back as set or not.
- `vpn.check()` → `POST /api/v1/vpn/check` and `vpn.reconnect()` → `POST /api/v1/vpn/reconnect` (owner).
- `vpn.providers()` → `GET /api/v1/vpn/providers` (owner): the catalog's providers, with their steps and fields.
- A8's `TorrentLimits` VPN fields (`vpnConnected`, `vpnInterface`, `vpnIp`) come from `vpn.status()`.

## Decisions

- **highsea runs the tunnel itself** when it can, because that's the only mode where highsea both sets the VPN up and guarantees the kill switch. The container and interface modes stay for owners who already run one. (Answer V2.)
- **Only torrents go through the tunnel,** so the admin stays on the LAN and the library's metadata isn't slowed by it.
- **The kill switch can't be turned off** in highsea connects. A leak is the failure that matters most here (activity-downloads.md).
- **Provider facts are catalog data, mechanisms are code:** NAT-PMP, PIA's API and configuration files are written once, and each provider entry names which it uses.

- **Answered by the owner on 2026-10-20** ([checkpoint 6 › VPN questions](../plans/phase-3-checkpoint-6.md#vpn-questions)): 6a builds this area with the VPN container and interface modes, 6b adds highsea connects, the providers and port forwarding (V1); WireGuard only inside highsea (V3); the seven providers above plus any WireGuard configuration (V4); a prototype first (V5); indexers through the VPN is a switch, off by default (V6).

## Open questions

None. The owner approved the prototype on 2026-10-20 without changes.
