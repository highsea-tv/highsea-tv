# 0020. LAN discovery on UDP 7368, plus mDNS

- **Status:** Accepted
- **Date:** 2026-10-19

## Context
Clients find servers on the local network ([connectivity.md](../product/connectivity.md)). The roadmap asks for a UDP broadcast responder plus mDNS (`_highsea._tcp`), and an ADR for the port. Jellyfin and Emby answer on 7359 (which IANA lists for another service) and Plex on 32410–32414.

## Decision
- The discovery responder listens on **UDP 7368**. The IANA registry lists 7366–7369 as unassigned (checked 2026-10-19). It's configurable with `HIGHSEA_DISCOVERY_PORT`.
- A client broadcasts `highsea:discover:1` to port 7368. A server answers to the sender with its public info as JSON: server id, name, version and addresses (the same as `GET /api/v1/system/info/public`).
- The server also advertises `_highsea._tcp` over mDNS (UDP 5353) with the HTTP port and the server id in the TXT record.
- In Docker, discovery needs host networking, or UDP 7368 published (and mDNS works only with host networking).

## Consequences
- The compose example and the install guides list UDP 7368 next to 3000 and 6881.
- Clients try mDNS first where the platform allows it, and fall back to the broadcast.

## 2026-10-28: publishing through the host's avahi (checkpoint 4.3c)

Checking TrueNAS SCALE 25.10.7 showed highsea's own responder (@homebridge/ciao) can't bind UDP 5353 there, even with host networking. TrueNAS's avahi-daemon is set to `disallow-other-stacks=yes`, which "if set to yes no other process is allowed to bind to UDP port 5353" ([avahi-daemon.conf(5)](https://manpages.debian.org/trixie/avahi-daemon/avahi-daemon.conf.5.en.html)). ciao logged its bind errors and highsea then claimed to be advertising. Unraid 7.3.4 and DSM 7 run avahi too, and their templates use a bridge, where mDNS never reached the network.

So highsea publishes through the host's avahi when it can (`chooseResponder` in `packages/network/src/mdns.ts`):

- **When the container has the host's system bus** (`/run/dbus/system_bus_socket`, the D-Bus specification's well-known system bus address with `/var/run` as `/run`), highsea runs [avahi-publish(1)](https://manpages.debian.org/trixie/avahi-utils/avahi-publish.1.en.html) from `avahi-utils`, now in the image (LGPL-2.1+, run as a separate program). It publishes `_highsea._tcp` with the same TXT record and stays running while the service is registered; stopping it withdraws the service. avahi answers for the host's own addresses, so it works from a bridge too, with the container's port (the templates publish it unchanged). One responder per host is what [RFC 6762 § 15](https://www.rfc-editor.org/rfc/rfc6762#section-15) recommends. Talking to avahi over D-Bus needs no extra rights: avahi's own bus policy (`avahi-dbus.conf`, as Unraid 7.3.4 ships it) says "Allow anyone to invoke methods on Avahi server, except SetHostName".
- **When the bus is there but avahi doesn't publish** (no avahi-daemon running, which avahi-publish reports as "Daemon not running", or no answer in 10 seconds), highsea logs that once at info and falls back to its own responder, as below.
- **Without the bus,** highsea tries a shared bind of UDP 5353 (`SO_REUSEADDR`, as ciao binds) first. If that works, ciao advertises as before. If not, highsea logs one plain warning that another mDNS service holds the port, and apps find it by the broadcast.

The TrueNAS, Unraid and Synology templates and `compose.yaml` mount `/run/dbus` read only (`/run/dbus:/run/dbus:ro`). On a host without D-Bus, Docker makes an empty folder and highsea answers itself. `compose.bridge.yaml` has the line commented out, since Docker Desktop has no host bus to give. Connecting to a socket on a read-only mount works, since a read-only mount stops writes to files, not connections. Home Assistant's container install mounts the same folder the same way for its Bluetooth integration ([Home Assistant, Linux installation](https://www.home-assistant.io/installation/linux#docker-compose)).

Checked on 2026-10-28 with the templates as they are. On TrueNAS 25.10.7 (host networking) and on Unraid 7.3.4 and DSM 7.4.1 on the DS1520+ (both bridged), highsea logged "advertising over mDNS" with `via: avahi`, and each host's `avahi-browse` resolved `_highsea._tcp` at its own name and port 3000, with the TXT record. From this Mac, `dns-sd -L` resolved the DS1520+'s record at `highseatv.local.:3000`. `avahi-publish` ran as highsea's user (568, 99 and 1026), and on the DS1520+ the record was withdrawn when the container stopped. One limit is left: on a bridge, avahi advertises the container's port, so an owner who publishes 3000 on another host port has a record with the wrong port. Apps then fall back to the broadcast or the address, as before.

## 2026-10-28: the address apps are told, and the router's forwarding (checkpoint 4.3c)

**The advertised address.** Discovery's answer and `GET /system/info/public` list `localAddresses`, the server's own interfaces. In a bridge network those are the container's addresses, which nothing on the home network can reach. Setup's Review now has an **Address on your network** line (install-simplicity B):

- **Detected:** `HIGHSEA_PUBLISHED_URL` first, as Jellyfin's `JELLYFIN_PublishedServerUrl` overrides the address it advertises ([Jellyfin: networking](https://jellyfin.org/docs/general/post-install/networking/)). Otherwise, the private IPv4 address the host has, when highsea can see the host's interfaces: outside a container, or inside one with host networking, which shows Docker's own `docker0`, `br-…` and `veth…` interfaces. In a bridge network it's left empty, and setup offers the address the browser used (`location.host`), which reached the server, so it's the best guess.
- **Kept:** in its own setting (`address`), as `host:port`. `HIGHSEA_PUBLISHED_URL`, or the setting as `http://host:port`, goes first in `localAddresses`, so apps try it before the interfaces.
- Settings › Network doesn't show it yet. The variable changes it after setup.

**The router's forwarding.** Remote access by a forwarded port (`remoteAccess: 'port-forward'` with highsea's own HTTPS) asks the router to forward the HTTPS port, once the owner has chosen it in setup or Settings › Network (install-simplicity's answer 10). It uses the torrent engine's mapper, NAT-PMP first ([RFC 6886](https://www.rfc-editor.org/rfc/rfc6886)) and then UPnP IGD, for TCP only through its new `protocols` option, and it's let go when the choice changes or the server stops. System › Health says whether the router forwarded the port, through which protocol, or that it didn't, with how to forward TCP to the server by hand. Both need host networking. In a bridge, the router sees the bridge's NAT, so a mapping there fails and Health says so.
