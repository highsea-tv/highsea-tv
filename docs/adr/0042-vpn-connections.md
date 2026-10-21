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
- highsea connects, the strongest mode on a plain Docker host, waits for 6b, with its leak test in CI.
- An echo service sees the exit address every 5 minutes; an owner who minds can point the setting at their own echoip.
